// 卡券使用模块（适配所有影院）
import {
  getCurrentTime,
  formatTimeOfTime,
  mockDelay, // 模拟延时
  formatErrInfo, // 格式化错误信息
  getOfferRuleById,
  couponInfoSpecial,
  getCinemaLoginInfoList
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import {
  GE_APP_INFO,
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST
} from "@/common/constant";

import svApi from "@/api/sv-api";
// 统一日志类
import Logger from "@/common/logger";

// 机器登录用户信息
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();
export default class CardQuanManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
    this.api_version = GE_APP_INFO(order.app_name)?.api_version;
  }

  // 使用优惠券或会员卡（核心方法）
  async useQuanOrCard({
    buyTicketInfo,
    offerRule,
    basePrice, // 会员价+服务费
    rewards,
    currentPhone,
    session_id,
    usableCardList // 库里维护的可用会员卡列表
  }) {
    try {
      const { appFlag } = this;
      const { supplier_end_price, ticket_num, plat_name } = this.order;
      const { cinemaCode, cinemaId } = buyTicketInfo;
      const cardParams = {
        cinemaCode,
        cinemaId,
        session_id
      };
      // 1、获取卡券列表
      let cardList = await this.getCardList(cardParams);
      if (usableCardList?.length) {
        cardList = cardList?.filter(item =>
          usableCardList.some(itemA => itemA.card_num === item.cardNo)
        );
        this.logger.infoSave("可用卡过滤后的会员卡列表", { cardList });
      }
      // 辰星3.0必须要有卡
      if (!cardList?.length && this.api_version == "3.0C") return {};
      let quanParams = {
        cinemaCode,
        cinemaId,
        session_id
      };
      if (this.api_version == "3.0C") {
        const defaultCardNo = cardList?.find(
          item => item.defaultCard == 1
        )?.cardNo;
        quanParams.defaultCardNo = defaultCardNo;
        quanParams.couponStatus = 1;
      } else if (this.api_version == "C") {
        quanParams.pageNo = 1;
        quanParams.pageSize = 100;
      }
      let quanList = await this.getQuanList(quanParams);
      // 2、按报价规则用卡用券
      const { offer_type, member_price, offer_rule_id } = offerRule;
      let is_auto_use_quan = false; // 是否灵活用券
      let useCardParms = {
        cardList,
        basePrice, // 会员价+服务费
        member_price, // 成本价
        rewards,
        supplier_end_price,
        ticket_num,
        plat_name
      };
      if (offer_type !== "1") {
        const ruleInfo = getOfferRuleById(offer_rule_id);
        this.logger.info("根据报价规则id获取报价规则明细", ruleInfo);
        if (ruleInfo) {
          const { autoUseQuanStatus, autoUseQuanPrice, auto_quan_value } =
            ruleInfo;
          if (
            autoUseQuanStatus === "1" &&
            supplier_end_price > autoUseQuanPrice &&
            auto_quan_value
          ) {
            is_auto_use_quan = true;
            offerRule.quan_value = auto_quan_value;
            this.logger.infoSave(
              "灵活用券条件生效，重置报价规则里的券类型为灵活用券类型",
              {
                autoUseQuanStatus,
                supplier_end_price,
                autoUseQuanPrice,
                auto_quan_value
              }
            );
          }
        }
        if (!is_auto_use_quan) {
          this.logger.info("使用会员卡出票");
          return await this.useCardHandle(useCardParms);
        }
      }
      if (offer_type == "1" || is_auto_use_quan) {
        let quanValueList = offerRule.quan_value.split(",");
        this.logger.infoSave("使用优惠券出票", { quanValueList });
        // 读取券库存进行过滤重新设置quan_value为单个券类型
        if (quanValueList.length > 1) {
          const appQuanTypeList = await this.getQuanTypeListByAppMobile({
            appFlag,
            mobile: currentPhone
          });
          if (appQuanTypeList?.length) {
            let canUseQuanTypeList = appQuanTypeList.filter(
              itemA =>
                quanValueList.includes(itemA.quan_value) &&
                itemA.quan_stock >= ticket_num
            );
            this.logger.infoSave("根据券类型和券库存进行筛选", {
              canUseQuanTypeList
            });
            if (canUseQuanTypeList.length) {
              offerRule.quan_value = canUseQuanTypeList[0].quan_value;
            }
          }

          if (offerRule.quan_value.split(",").length > 1) {
            offerRule.old_quan_value = offerRule.quan_value;
            offerRule.quan_value = offerRule.quan_value.split(",")[0];
            this.logger.infoSave("券类型容错处理：强制取第一个", {
              quan_value: offerRule.quan_value
            });
          }
        }
        const quanInfo = await this.getQuanInfo(offerRule.quan_value, appFlag);
        offerRule.quan_id = quanInfo?.id;
        offerRule.quan_cost = quanInfo?.quan_cost;
        offerRule.quan_flag = quanInfo?.quan_flag;
        offerRule.quan_fee = quanInfo?.quan_fee;
        offerRule.is_store = quanInfo?.is_store;
        offerRule.black_quans = quanInfo?.black_quans;
        let { quan_value, quan_cost, quan_flag, quan_fee, black_quans } =
          offerRule;
        // 根据券标识获取目标券
        let targetQuanList = quanList.filter(
          item =>
            couponInfoSpecial(item.couponName) === couponInfoSpecial(quan_flag)
        );
        // 增加已用完过滤，防止核销延迟导致用券失败
        const usedQuanList = await this.queryUsedQuanList({
          quan_value: offerRule.quan_value,
          app_name: appFlag
        });
        // 最近用券记录过滤
        if (usedQuanList?.length) {
          targetQuanList = targetQuanList.filter(
            item =>
              !usedQuanList.some(itemA =>
                itemA.quan_code?.includes(item.couponCode)
              )
          );
        }
        // 券黑名单过滤
        if (black_quans) {
          targetQuanList = targetQuanList.filter(
            item => !black_quans?.includes(item.couponCode)
          );
        }
        // 优先使用快过期的券
        targetQuanList = targetQuanList.sort(
          (a, b) => +new Date(a.endDateTime) - new Date(b.endDateTime)
        );
        // 更新券库存
        this.updateQuanStock({
          quan_stock: targetQuanList.length,
          quan_flag: offerRule.quan_flag,
          app_name: appFlag,
          phone: currentPhone
        });
        if (targetQuanList.length < ticket_num) {
          this.logger.warn("优惠券不够用");
          this.logger.error(`${quan_value} 面额券不足，不支持从服务端同步获取`);
          if (is_auto_use_quan) {
            this.logger.infoSave("灵活用券时获取目标券不足,转用卡处理");
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return {
            profit: 0,
            useQuans: []
          };
        }

        let useQuan = targetQuanList.slice(0, ticket_num).map(item => {
          return {
            couponType: item.ticketType,
            couponCode: item.couponCode,
            couponName: item.couponName
          };
        });
        // 手续费
        let shouxufei = (supplier_end_price * 100) / 10000;
        if (NO_FEE_PLAT_LIST.includes(plat_name)) {
          shouxufei = 0;
        }
        let profit = supplier_end_price - quan_cost - shouxufei;
        profit = Number(profit) * Number(ticket_num);
        if (rewards > 0) {
          // 特急奖励订单中标价格 * 张数 * 0.04;
          let rewardPrice =
            (Number(supplier_end_price) * Number(ticket_num) * 100 * rewards) /
            10000;
          profit += rewardPrice;
        }
        profit = Number(profit).toFixed(2);
        if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
          this.logger.error("最终利润为负，单个订单直接出票结束");
          this.logger.errorSave(
            `使用优惠券后最终利润为负${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
            {
              profit
            }
          );
          if (is_auto_use_quan) {
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return {
            profit: 0,
            useQuans: []
          };
        }
        let cardNum, card_id;
        if (quan_fee > 0) {
          let cardData = cardList.filter(
            item => item.cardAmount >= (quan_fee * 1000 * ticket_num) / 1000
          );
          // 取最大余额
          cardData = cardData.sort((a, b) => b.cardAmount - a.cardAmount);
          if (!cardData?.length) {
            this.logger.errorSave(
              `使用优惠券后发现没有可以支付券手续费的会员卡，${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
              {
                quan_fee,
                cardList
              }
            );
            if (is_auto_use_quan) {
              offerRule.quan_value = "";
              return await this.useCardHandle(useCardParms);
            }
            return {
              useQuan: [],
              card_id: "",
              profit: 0 // 利润
            };
          } else {
            cardNum = cardData?.[0]?.cardNo;
            card_id = cardData?.[0]?.cardNo;
          }
        }
        if (is_auto_use_quan) {
          offerRule.offer_type = "1";
        }
        return {
          useQuan,
          quanStock: targetQuanList.length,
          profit,
          cardNum,
          card_id
        };
      }
    } catch (error) {
      this.logger.errorSave("使用会员卡或优惠券报错", formatErrInfo(error));
    }
  }
  // 获取会员卡列表
  async getCardList(params) {
    try {
      this.logger.infoSave("获取会员卡列表参数", params);
      const res = await this.appApi.getCardList(params);
      this.logger.infoSave("获取会员卡列表返回", res);
      let cardList = res.data || [];
      if (this.api_version == "C") {
        cardList = res.data?.datalist || [];
      }
      if (!cardList.length) {
        this.logger.errorSave("获取会员卡列表为空");
      }
      cardList = cardList.map(item => ({
        ...item,
        cardAmount: item.amount
      }));
      return cardList;
    } catch (error) {
      this.logger.errorSave("获取会员卡列表异常", error);
      return [];
    }
  }

  // 获取优惠券列表
  async getQuanList(params) {
    try {
      const { api_version } = this;
      this.logger.infoSave("获取优惠券列表入参", params);
      const res = await this.appApi.getQuanList(params);
      this.logger.infoSave("获取优惠券列表返回", res);
      let quanList;
      if (api_version === "3.0C") {
        quanList = res.data || [];
        quanList = quanList.map(item => ({
          ...item,
          couponName: item.ticketName,
          couponCode: item.ticketNum,
          endDateTime: item.validEndDate
        }));
      } else if (api_version === "C") {
        quanList = res.data?.records || [];
        quanList = quanList.map(item => ({
          ...item,
          couponName: item.name,
          couponCode: item.code,
          endDateTime: item.endTime
        }));
        // const { number, size, totalPages, last } = res.data?.pageable;
      }
      if (!quanList?.length) {
        this.logger.infoSave("获取优惠券列表为空");
      }
      return quanList;
    } catch (error) {
      this.logger.infoSave("获取优惠券列表异常", formatErrInfo(error));
      return [];
    }
  }

  // 会员用卡处理
  async useCardHandle(data) {
    const {
      cardList,
      basePrice, // 会员价+服务费
      member_price, // 成本价
      rewards,
      supplier_end_price,
      ticket_num,
      plat_name
    } = data;
    this.logger.info("用卡处理参数", data);
    try {
      let str;
      if (!cardList.length) {
        str = "无可用会员卡（疑似出满）";
      }
      // 支付金额
      let payAmoungt = (basePrice * 1000 * ticket_num) / 1000;
      let cardData = cardList.filter(item => item.cardAmount >= payAmoungt);
      if (!cardList.length || !cardData?.length) {
        let maxCardAmount = cardList.sort(
          (a, b) => b.cardAmount - a.cardAmount
        )[0].cardAmount;
        this.logger.errorSave(str || "会员卡余额不足", {
          maxCardAmount,
          payAmoungt,
          basePrice,
          ticket_num,
          cardList
        });
        return {
          card_id: "",
          profit: 0 // 利润
        };
      }
      // 手续费
      let shouxufei = (supplier_end_price * 100) / 10000;
      if (NO_FEE_PLAT_LIST.includes(plat_name)) {
        shouxufei = 0;
      }
      // 中标价-会员成本价
      let profit = supplier_end_price - member_price - shouxufei;
      profit = Number(profit) * Number(ticket_num);
      if (rewards > 0) {
        // 特急奖励订单中标价格 * 张数 * 0.04;
        let rewardPrice =
          (Number(supplier_end_price) * 100 * Number(ticket_num) * rewards) /
          10000;
        profit += rewardPrice;
      }
      if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        this.logger.errorSave("使用会员卡计算价格后最终利润为负", { profit });
        return {
          profit: 0,
          card_id: ""
        };
      }
      profit = Number(profit).toFixed(2);
      // 取最大余额
      cardData = cardData.sort((a, b) => b.cardAmount - a.cardAmount);
      return {
        card_id: cardData?.[0]?.cardNo,
        cardNum: cardData?.[0]?.cardNo,
        profit // 利润
      };
    } catch (error) {
      this.logger.errorSave("会员用卡处理异常", formatErrInfo(error));
      return {
        card_id: "",
        profit: 0 // 利润
      };
    }
  }
  // 获取券类型信息
  async getQuanInfo(quan_value, app_name) {
    try {
      const res = await svApi.queryQuanTypeInfo({
        quan_value,
        app_name
      });
      this.logger.infoSave("获取券类型信息返回", res);
      return res.data.quanInfo || null;
    } catch (error) {
      console.error("获取券类型信息异常", error);
      this.logger.errorSave("获取券类型信息异常", formatErrInfo(error));
    }
  }
  // 查询最近用券记录返回
  async queryUsedQuanList({ quan_value, app_name }) {
    const params = {
      order_status: "1",
      quan_value,
      app_name,
      rule: rule,
      start_time: formatTimeOfTime(+new Date() - 3 * 24 * 60 * 60 * 1000),
      end_time: getCurrentTime()
    };
    try {
      this.logger.infoSave("获取最近用券记录入参", params);
      const res = await svApi.queryUsedQuanList(params);
      const usedQuanList = res.data?.usedQuanList || [];
      this.logger.infoSave("获取最近用券记录返回", res);
      return usedQuanList;
    } catch (error) {
      this.logger.infoSave("获取最近用券记录异常", formatErrInfo(error));
      return [];
    }
  }

  // 更新券库存
  async updateQuanStock(params) {
    const { quan_stock, quan_flag, phone, app_name, quan_value } = params;
    let targetQuanList = await this.getTargetQuanByApp(app_name, quan_flag);
    // 同类目标券更新处理
    targetQuanList?.forEach(item => {
      let quanStockList = item.quanStockList || [];
      if (quanStockList?.length) {
        quanStockList = JSON.parse(quanStockList);
        let inx = quanStockList.findIndex(itemA => itemA.phone === phone);
        if (inx != -1) {
          quanStockList[inx].quan_stock = quan_stock;
          quanStockList[inx].real_quan_stock = quan_stock;
          quanStockList[inx].update_time = getCurrentTime();
        } else {
          quanStockList.push({
            phone,
            quan_stock,
            real_quan_stock: quan_stock,
            update_time: getCurrentTime()
          });
        }
      } else {
        quanStockList = [
          {
            phone,
            quan_stock,
            real_quan_stock: quan_stock,
            update_time: getCurrentTime()
          }
        ];
      }
      let updateParams = {
        id: item.id,
        quanStockList: JSON.stringify(quanStockList),
        update_time: getCurrentTime()
      };
      // 增加最后使用时间更新（方便看是否压价）
      if (quan_value?.split(",")?.includes(item.quan_value)) {
        updateParams.end_use_time = getCurrentTime();
      }
      // 单个更新
      this.singleUpdateQuanStock(updateParams);
    });
  }

  // 获取同类目标券列表
  async getTargetQuanByApp(app_name, quan_flag) {
    const quanTypeParams = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,quan_flag,app_name,quan_value,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(quanTypeParams);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      let targetQuanList = quanTypeList.filter(
        item => item.quan_flag == quan_flag
      );
      this.logger.infoSave("获取同类目标券返回", {
        targetQuanList
      });
      return targetQuanList;
    } catch (error) {
      this.logger.errorSave("获取同类目标券异常", formatErrInfo(error));
    }
  }

  // 单个更新券库存
  async singleUpdateQuanStock(data) {
    let { logger, ...params } = data;
    if (!logger) {
      logger = this.logger;
    }
    try {
      logger.infoSave("单个更新券库存入参", params);
      const res = await svApi.updateQuanType(params);
      logger.infoSave("单个更新券库存返回", res);
    } catch (error) {
      logger.errorSave("单个更新券库存异常", formatErrInfo(error));
    }
  }

  // 获取新券(暂未联调)
  async getNewQuan({
    cinemaCode,
    cinemaId,
    quanValue: quan_value,
    black_quans,
    quanNum,
    session_id,
    asyncFlag
  }) {
    const { appFlag } = this;
    let logger = this.logger;
    // 异步绑券
    if (asyncFlag === 1) {
      logger = new Logger({ logType: 3 });
      logger.init(this.order);
    }
    let conPrev = asyncFlag === 1 ? "异步绑券_" : "";
    let params = {
      quan_value,
      app_name: appFlag,
      quan_status: "1",
      page_num: 1,
      page_size: quanNum
    };
    try {
      if (black_quans) {
        params.black_quans = black_quans;
      }
      let quanRes = await svApi.queryQuanList(params);
      logger.infoSave(`${conPrev}从服务端获取券返回`, {
        quanRes,
        quanNum,
        quan_value,
        params
      });

      let quanList = quanRes.data?.quanList || [];
      if (!quanList?.length && asyncFlag != 1) {
        logger.error(`数据库${quan_value}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        logger.info(`正在尝试绑定券 ${quan.coupon_num}...`);
        const couponNumRes = await this.bandQuan(
          {
            cinemaCode,
            cinemaId,
            coupon_num: quan.coupon_num,
            session_id,
            appFlag
          },
          logger
        );
        const coupon_num = couponNumRes?.coupon_num;
        logger.infoSave(`${conPrev}绑定券返回`, couponNumRes);
        if (coupon_num) {
          bandQuanList.push({ coupon_num });
        }
        svApi.addUseQuanRecord({
          coupon_num: quan.coupon_num,
          app_name: appFlag,
          quan_status: !coupon_num ? "3" : "2",
          use_time: getCurrentTime(),
          remark: !coupon_num ? "绑券异常" : ""
        });
      }
      return bandQuanList;
    } catch (error) {
      logger.errorSave("从服务端获取券异常", formatErrInfo(error));
    } finally {
      if (asyncFlag) {
        logger.logUpload();
      }
    }
  }

  // 绑定券
  async bandQuan(data, logger) {
    const { cinemaCode, cinemaId, coupon_num, session_id } = data;
    const { api_version } = this;
    let params = {
      cinemaCode,
      cinemaId,
      session_id
    };
    if (api_version == "C") {
      params.c = coupon_num;
    } else if (api_version == "3.0C") {
      // 参数待确定
      params.coupon_num = coupon_num;
    }
    try {
      await mockDelay(0.1);
      logger.infoSave("绑定券参数", params);
      const res = await this.appApi.bandQuan(params);
      logger.infoSave("绑定券返回", res);
      return { coupon_num };
    } catch (error) {
      logger.errorSave("绑定新券异常", formatErrInfo(error));
    }
  }

  // 获取影院券类型列表
  async getQuanTypeListByAppMobile({ appFlag: app_name, mobile }) {
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      quanTypeList.forEach(item => {
        item.quanStockList = item.quanStockList
          ? JSON.parse(item.quanStockList)
          : [];
        // 只拿关联账号的券库存信息进行判断
        item.quanStockListByPhone = item.quanStockList.filter(
          itemA => itemA.phone === mobile
        );
        item.quan_stock = item.quan_stock || 0;
        if (item.quanStockListByPhone?.length) {
          // 最大数当做券库存
          let maxNum = 0;
          item.quanStockListByPhone.forEach(itemA => {
            if (+itemA.quan_stock > maxNum) {
              maxNum = +itemA.quan_stock;
            }
          });
          item.quan_stock = maxNum;
        }
      });
      this.logger.infoSave("根据影院及手机号获取对应券类型列表返回", {
        quanTypeList
      });
      return quanTypeList;
    } catch (error) {
      this.logger.errorSave(
        "根据影院及手机号获取对应券类型列表返回异常",
        formatErrInfo(error)
      );
    }
  }

  // 获取影院券类型列表(报价时通过库存判断是否报价使用)
  async getQuanTypeListByApp() {
    const { app_name } = this.order;
    let useMobileList = getCinemaLoginInfoList()
      .filter(
        item => item.app_name === app_name && item.mobile && item.session_id
      )
      .map(item => item.mobile);
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      quanTypeList.forEach(item => {
        item.quanStockList = item.quanStockList
          ? JSON.parse(item.quanStockList)
          : [];
        // 只拿关联账号的券库存信息进行判断
        item.quanStockListByPhone = item.quanStockList.filter(itemA =>
          useMobileList.includes(itemA.phone)
        );
        item.quan_stock = item.quan_stock || 0;
        if (item.quanStockListByPhone?.length) {
          // 最大数当做券库存
          let maxNum = 0;
          item.quanStockListByPhone.forEach(itemA => {
            if (+itemA.quan_stock > maxNum) {
              maxNum = +itemA.quan_stock;
            }
          });
          item.quan_stock = maxNum;
        }
      });
      this.logger.info("quanTypeList", quanTypeList);
      this.logger.infoSave("根据影院获取券类型列表返回", {
        quanTypeRes,
        quanTypeList,
        params,
        useMobileList
      });
      return quanTypeList;
    } catch (error) {
      this.errorSave("根据影院获取券类型列表返回异常", {
        error,
        params
      });
    }
  }

  // 异步更新券库存-报价时
  async syncUpdateQuanStock({ cinemaCode, cinemaId, quanTypeList }) {
    if (!quanTypeList?.length) return;
    const { app_name } = this.order;
    let logger = new Logger({
      logType: 1
    });
    logger.init(this.order);
    let targetLoginList = getCinemaLoginInfoList().filter(
      item => item.app_name === app_name && item.mobile && item.session_id
    );
    console.log("targetLoginList", targetLoginList);
    try {
      let needUpdateQuanTypeList = [];
      // 拿着处理过的最大券库存（几个号之间）+对应的更新时间去判断是否要更新（只判断自己号上的）
      let isNeedUpdate = quanTypeList.some(item => {
        // if (item.quan_stock < 5) {
        let inx = item.quanStockListByPhone.findIndex(
          itemA => itemA.quan_stock === item.quan_stock
        );
        console.log("inx", inx);
        if (inx != -1) {
          let update_time = item.quanStockListByPhone[inx].update_time;
          console.log("update_time", update_time);

          return !update_time
            ? true
            : +new Date() - +new Date(update_time) > 1000 * 60 * 60; // 超过1小时未更新
        } else {
          return true;
        }
        // }
        return false;
      });
      if (!isNeedUpdate) {
        logger.infoSave("不需要更新券库存", { quanTypeList });
      } else {
        // 只要有一个需要更新，就全部更新，因为会获取该号全部的券
        needUpdateQuanTypeList = quanTypeList;
        console.log("needUpdateQuanTypeList", needUpdateQuanTypeList);
        logger.infoSave("需要更新的券类型列表", {
          quanTypeList,
          targetLoginList
        });

        let quanTypeListParams = needUpdateQuanTypeList.map(item => {
          return {
            id: item.id,
            quan_flag: item.quan_flag,
            black_quans: item.black_quans,
            quanStockList: item.quanStockList.map(itemA => ({
              phone: itemA.phone,
              quan_stock: itemA.quan_stock || 0,
              real_quan_stock: itemA.real_quan_stock || 0,
              update_time: itemA.update_time
            }))
          };
        });
        // 获取关联用户每个号的优惠券列表
        for (let i = 0; i < targetLoginList.length; i++) {
          const { session_id, mobile } = targetLoginList[i];
          const quanListAll = await this.getQuanListByPhone({
            session_id,
            cinemaCode,
            cinemaId,
            logger
          });

          quanTypeListParams.forEach(item => {
            let targetQuanList = quanListAll.filter(
              itemA =>
                couponInfoSpecial(item.quan_flag) ===
                  couponInfoSpecial(itemA.coupon_info) &&
                !item.black_quans?.includes(itemA.coupon_num)
            );
            console.log(item.quan_flag, "targetQuanList", targetQuanList);
            const { card_num } = targetQuanList?.[0] || {};
            let quanStock = targetQuanList.length;
            if (card_num) {
              const groupedCoupons = targetQuanList.reduce((groups, coupon) => {
                const key = coupon.card_num;
                if (!groups[key]) {
                  groups[key] = [];
                }
                groups[key].push(coupon);
                return groups;
              }, {});
              let groupList = Object.values(groupedCoupons);
              // 获取分组后最多出票量当做库存
              let maxLength = groupList[0]?.length || 0; // 初始化为数组的第一个元素
              for (let i = 1; i < groupList.length; i++) {
                if (groupList[i]?.length > maxLength) {
                  maxLength = groupList[i].length;
                }
              }
              quanStock = maxLength;
            }
            let quanStockList = item.quanStockList;
            console.log("quanStockList", quanStockList);
            let inx = quanStockList.findIndex(itemB => itemB.phone === mobile);
            if (inx != -1) {
              quanStockList[inx].quan_stock = quanStock;
              quanStockList[inx].real_quan_stock = targetQuanList.length;
              quanStockList[inx].update_time = getCurrentTime();
            } else {
              quanStockList.push({
                phone: mobile,
                quan_stock: quanStock,
                real_quan_stock: targetQuanList.length,
                update_time: getCurrentTime()
              });
            }
          });
        }
        console.log("quanTypeListParams", quanTypeListParams);
        let updateTypeList = quanTypeListParams.map(item => ({
          id: item.id,
          quanStockList: item.quanStockList,
          update_time: getCurrentTime()
        }));
        console.log("updateTypeList", updateTypeList);
        logger.infoSave("最终要更新的券类型列表", { updateTypeList });
        for (let index = 0; index < updateTypeList.length; index++) {
          const item = updateTypeList[index];
          // 单个更新
          await this.singleUpdateQuanStock({
            id: item.id,
            quanStockList: JSON.stringify(item.quanStockList),
            update_time: item.update_time,
            logger
          });
        }
      }
    } catch (error) {
      logger.errorSave("异步更新券库存异常", error);
    } finally {
      logger.logUpload();
    }
  }

  // 获取某个手机号的全部优惠券列表
  async getQuanListByPhone({ cinemaCode, cinemaId, session_id, logger }) {
    try {
      const quanData = await this.continuousGetQuan({
        cinemaCode,
        cinemaId,
        session_id,
        logger
      });
      console.log("quanData", quanData);
      logger.infoSave("连续获取券返回", { quanData });
      return quanData || [];
    } catch (error) {
      logger.errorSave("获取优惠券列表异常", error);
    }
  }

  // 连续获取券
  async continuousGetQuan(data) {
    let {
      cinemaCode,
      cinemaId,
      session_id,
      page = 1,
      quanData = [],
      logger
    } = data;
    let params = {
      cinemaCode,
      cinemaId,
      session_id
    };
    const { api_version } = this;
    if (api_version == "3.0C") {
      // const defaultCardNo = cardList?.find(
      //   item => item.defaultCard == 1
      // )?.cardNo;
      // quanParams.defaultCardNo = defaultCardNo;
      quanParams.couponStatus = 1;
    } else if (api_version == "C") {
      quanParams.pageNo = page;
      quanParams.pageSize = 100; // 支持多传
    }
    try {
      const res = await this.appApi.getQuanList(params);
      logger.infoSave("获取券返回", { quanList, params });
      let quanList, total_page;
      if (api_version === "3.0C") {
        quanList = res.data || [];
        quanList = quanList.map(item => ({
          ...item,
          couponName: item.ticketName,
          couponCode: item.ticketNum,
          endDateTime: item.validEndDate
        }));
        total_page = 1; // 没有分页所以设置为1不在往下查询
      } else if (api_version === "C") {
        quanList = res.data?.records || [];
        quanList = quanList.map(item => ({
          ...item,
          couponName: item.name,
          couponCode: item.code,
          endDateTime: item.endTime
        }));
        const { number, size, totalPages = 1, last } = res.data?.pageable || {};
        total_page = totalPages;
      }
      quanData.push(...quanList);
      if (total_page > page) {
        // 如果总数量仍小于所需数量，则继续获取下一页
        return await this.continuousGetQuan({
          ...data,
          page: page + 1,
          quanData
        });
      }
      return quanData;
    } catch (error) {
      logger.errorSave("连续获取券异常", {
        error,
        params
      });
    }
  }

  // 获取排序手机号
  getSortedPhones(targetQuanList, quanValueList) {
    try {
      // 1. 按quanValue顺序排序arr
      const sortedByQuanValue = [...targetQuanList].sort((a, b) => {
        return (
          quanValueList.indexOf(a.quan_value) -
          quanValueList.indexOf(b.quan_value)
        );
      });
      // 2. 在每个分组内按库存降序排序
      const fullySorted = sortedByQuanValue.map(item => ({
        ...item,
        quanStockList: [...item.quanStockList].sort(
          (a, b) => b.quan_stock - a.quan_stock
        )
      }));
      // 3. 提取排序后的手机号
      const phoneSet = new Set();
      const uniqueSortedPhones = [];
      fullySorted.forEach(item => {
        item.quanStockList.forEach(stock => {
          if (!phoneSet.has(stock.phone)) {
            phoneSet.add(stock.phone);
            uniqueSortedPhones.push(stock.phone);
          }
        });
      });
      return uniqueSortedPhones;
    } catch (error) {
      this.logger.infoSave("获取按照券库存及顺序排序手机号异常", {
        error,
        targetQuanList,
        quanValueList
      });
    }
  }
  // 获取影院券类型列表
  async getSortPhoneByQuanTypeList(
    app_name,
    quan_flag,
    quan_value,
    ticket_num
  ) {
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      let quanValueList = quan_value?.split(",");
      let targetQuanList = quanTypeList.filter(item =>
        quanValueList.includes(item.quan_value)
      );
      let useMobileList = getCinemaLoginInfoList()
        .filter(
          item => item.app_name === app_name && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      console.log("useMobileList", useMobileList);
      this.logger.infoSave("获取影院目标券信息返回", {
        targetQuanList: JSON.parse(JSON.stringify(targetQuanList)),
        quan_flag,
        quan_value,
        useMobileList
      });
      targetQuanList.forEach(item => {
        let quanStockList = item?.quanStockList;
        if (quanStockList) {
          quanStockList = JSON.parse(quanStockList);
          quanStockList = quanStockList.map(itemA => ({
            ...itemA,
            quan_stock: itemA.quan_stock || 0
          }));
          quanStockList = quanStockList.filter(
            itemA =>
              useMobileList.includes(itemA.phone) &&
              itemA.quan_stock >= ticket_num
          );
          item.quanStockList = quanStockList;
        }
      });
      // 再根据券库存做下过滤
      targetQuanList = targetQuanList.filter(
        item => !!item.quanStockList.length
      );
      let sortMobileList = this.getSortedPhones(targetQuanList, quanValueList);
      if (sortMobileList) {
        console.log("sortMobileList", sortMobileList);
        this.logger.infoSave("获取排序手机列表返回", {
          sortMobileList
        });
        return sortMobileList;
      }
    } catch (error) {
      this.logger.errorSave("根据券库存获取排序手机列表异常", {
        error
      });
    }
  }
}
