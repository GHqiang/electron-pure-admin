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
import { wandaAesDecrypt } from "@/utils/wandaAesDecrypt";
import { APP_API_OBJ } from "@/common/index";
import {
  GET_APP_INFO,
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST
} from "@/common/constant";

import svApi from "@/api/sv-api";
// 统一日志类
import Logger from "@/common/logger";
import {
  batchUpdateQuanStockWithSync,
  formatQuanTypeSummaryForLog
} from "@/common/autoTicket/commonQuanStock.js";
import { syncCardBalanceToSv } from "@/common/autoTicket/buyTicket/common/cardBalanceSync";

// 机器基础
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";
const { getQuanValueListByQuanFlag } = usesMachineBaseFun();

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
  }

  // 使用优惠券或会员卡(独立)
  async useQuanOrCard({
    buyTicketInfo,
    offerRule,
    seatPayTotalPrice, // 座位支付总价格
    rewards,
    currentPhone,
    session_id,
    usableCardList // 库里维护的可用会员卡列表
  }) {
    try {
      const { appFlag } = this;
      const { supplier_end_price, ticket_num, plat_name } = this.order;
      const { order_num, partition, show_id } = buyTicketInfo;
      const cardParams = {
        orderId: order_num,
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
      let quanList = await this.getPayQuanList({
        session_id,
        buyTicketInfo
      });
      console.warn("可用券列表返回", quanList);
      // 2、按报价规则用卡用券
      const { offer_type, member_price, offer_rule_id } = offerRule;
      let is_auto_use_quan = false; // 是否灵活用券
      let useCardParms = {
        cardList,
        seatPayTotalPrice, // 座位支付总价格
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
        quanList = await this.getPayQuanList({
          session_id,
          buyTicketInfo
        });
        this.logger.infoSave("可用优惠券列表", {
          quanData: quanList?.map(item => ({
            couponName: item.couponName,
            couponCode: item.couponCode,
            endDateTime: item.endDateTime
            // couponValue: item.couponValue
          }))
        });
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
        offerRule.quan_desc = quanInfo?.quan_desc;
        offerRule.quan_fee = quanInfo?.quan_fee;
        offerRule.is_store = quanInfo?.is_store;
        offerRule.black_quans = quanInfo?.black_quans;
        let {
          quan_value,
          quan_cost,
          quan_flag,
          quan_desc,
          quan_fee,
          black_quans
        } = offerRule;
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
          quan_desc: offerRule.quan_desc,
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
            couponCode: item.couponCode,
            couponName: item.couponName,
            price: item.price // 券面值（分），来自 ncoupons.api，用于 merge_payment discountPrice
          };
        });

        // 预选券：逐次累加券码调 selectcoupon（对齐 iOS APP：第1次传券1，第2次传券1,券2，逐次累加）
        // 最后一次调用返回完整 dtItemList（所有座位各自对应一张券）
        // partition 在 _selectCouponOnly 内自动转为 iOS 逗号格式
        let allotseatStr = "";
        const accumulatedCodes = [];
        for (const quan of useQuan) {
          accumulatedCodes.push(quan.couponCode);
          const codes = accumulatedCodes.join(",");
          const res = await this._selectCouponOnly({
            session_id,
            buyTicketInfo,
            couponCode: codes
          });
          if (!res) {
            this.logger.errorSave(
              `预选券失败，券码累加到 ${codes} 无 allotseat 返回`
            );
            if (is_auto_use_quan) {
              offerRule.quan_value = "";
              return await this.useCardHandle(useCardParms);
            }
            return { useQuan: [], profit: 0 };
          }
          allotseatStr = res; // 最后一次的结果是完整 allotseat
        }

        let dtItemListArr = [];
        let totalSalePrice = 0;
        try {
          const allotObj = JSON.parse(allotseatStr);
          dtItemListArr = allotObj.dtItemList || [];
          totalSalePrice = dtItemListArr.reduce(
            (sum, it) => sum + (it.salePrice || 0),
            0
          );
        } catch (e) {
          this.logger.errorSave("解析 allotseat JSON 失败", {
            error: e?.message
          });
        }

        if (!dtItemListArr.length) {
          this.logger.errorSave("预选券失败，合并后 dtItemList 为空");
          if (is_auto_use_quan) {
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return { useQuan: [], profit: 0 };
        }

        // 合并后的 allotseat JSON
        const mergedAllotseat = JSON.stringify({
          dtItemList: dtItemListArr,
          lItemList: [],
          yqkItemList: []
        });

        // 统一确认用券
        const confirmRes = await this._confirmCouponOnly({
          session_id,
          buyTicketInfo,
          allotseat: mergedAllotseat,
          orderId: order_num
        });

        // 确认失败直接返回，不走后续支付
        if (!confirmRes) {
          this.logger.errorSave("确认用券失败，券不可用");
          if (is_auto_use_quan) {
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return { useQuan: [], profit: 0 };
        }

        const maxDiscountFen = Math.round(seatPayTotalPrice * 100);
        let conponPrice = confirmRes.conponPrice;
        let rawPrice;
        if (conponPrice != null) {
          // conponPrice 为 0 表示确认用券后无需额外支付（券全额抵扣），使用订单总价
          rawPrice = conponPrice || maxDiscountFen;
        } else {
          rawPrice = totalSalePrice || useQuan[0]?.price || 0;
        }
        const finalPrice = Math.min(rawPrice, maxDiscountFen);

        this.logger.infoSave("预选券最终返回(合并)", {
          dtItemCount: dtItemListArr.length,
          totalSalePrice,
          conponPrice,
          finalPrice
        });

        // allotseat 和 price 写入每条 useQuan
        useQuan = useQuan.map(q => ({
          ...q,
          allotseat: mergedAllotseat,
          price: finalPrice
        }));
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
        let canUseCardList;
        let cardData = cardList.filter(
          item => item.cardAmount >= (quan_fee * 1000 * ticket_num) / 1000
        );
        // 取最大余额
        cardData = cardData.sort((a, b) => b.cardAmount - a.cardAmount);
        if (!cardData?.length && offerRule.quan_fee > 0) {
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
            profit: 0 // 利润
          };
        } else {
          canUseCardList = cardData;
        }
        if (is_auto_use_quan) {
          offerRule.offer_type = "1";
        }
        return {
          useQuan,
          quanStock: targetQuanList.length,
          profit,
          canUseCardList
        };
      }
    } catch (error) {
      this.logger.errorSave("使用会员卡或优惠券报错", formatErrInfo(error));
    }
  }

  // 获取会员卡列表(独立)
  async getCardList({ orderId, session_id }) {
    const params = {
      orderId,
      wanda_token: session_id
    };
    try {
      this.logger.infoSave("获取会员卡列表参数", params);
      const res = await this.appApi.getPayCardList(params);
      let cardList = res?.data?.items || [];
      cardList = cardList.filter(
        item => item.available !== false && item.status === 8
      );
      if (!cardList.length) {
        this.logger.errorSave("获取会员卡列表为空");
      }
      cardList = cardList.map(item => ({
        ...item,
        cardAmount: (item.balance || 0) / 100,
        cardNo: item.cardNo
      }));
      this.logger.infoSave("获取会员卡列表返回", {
        cardList: cardList.map(item => ({
          cardAmount: item.cardAmount,
          cardNo: item.cardNo,
          card_id: item.cardNo,
          channelFeeType: item.channelFeeType // 为1时需要渠道费
        }))
      });

      // 同步实时余额到 SV 数据库（非阻塞，失败不影响主流程）
      syncCardBalanceToSv({
        appFlag: this.appFlag,
        cardList,
        logger: this.logger,
        getCardNum: item => item.cardNo,
        getBalance: item => item.cardAmount,
        balanceDivisor: 1 // 万达余额以分为单位,上面已除过100
      }).catch(e => this.logger.warn?.("同步万达卡余额异常(不影响主流程)", e));

      return cardList;
    } catch (error) {
      this.logger.errorSave("获取会员卡列表异常", error);
      return [];
    }
  }

  // 获取优惠券列表(独立-已调)
  async getQuanList({ session_id }) {
    // 最多返回50个不支持分页
    const params = {
      expireStatus: "N",
      json: true,
      wanda_token: session_id
    };
    try {
      this.logger.infoSave("获取优惠券列表入参", params);
      const res = await this.appApi.getQuanList(params);
      this.logger.infoSave("获取优惠券列表返回", res);
      let quanList = res.data?.couponGroups || [];
      quanList = quanList
        .map(item => item.couponInfoList)
        .flat()
        .filter(item => item.giftStatus == 1);
      quanList = quanList.map(item => ({
        ...item,
        couponName: item.couponTypeName,
        couponCode: item.couponId,
        endDateTime: +new Date(item.endTime)
      }));
      if (!quanList?.length) {
        this.logger.infoSave("获取优惠券列表为空");
      }
      return quanList;
    } catch (error) {
      this.logger.infoSave("获取优惠券列表异常", formatErrInfo(error));
      return [];
    }
  }

  // 会员用卡处理(独立)
  async useCardHandle(data) {
    const {
      cardList,
      seatPayTotalPrice, // 座位支付总价格
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
      let payAmount = seatPayTotalPrice;
      // let cardData = cardList.filter(item => item.cardAmount >= payAmount);
      // 测试是不做余额限制判断
      let cardData = cardList;
      if (!cardList.length || !cardData?.length) {
        let maxCardAmount = cardList.sort(
          (a, b) => b.cardAmount - a.cardAmount
        )?.[0]?.cardAmount;
        this.logger.errorSave(str || "会员卡余额不足", {
          maxCardAmount,
          payAmount,
          seatPayTotalPrice, // 座位支付总价格
          ticket_num,
          cardList
        });
        return {
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
          profit: 0
        };
      }
      profit = Number(profit).toFixed(2);
      // 取最大余额
      cardData = cardData.sort((a, b) => b.cardAmount - a.cardAmount);
      return {
        canUseCardList: cardData,
        profit // 利润
      };
    } catch (error) {
      this.logger.errorSave("会员用卡处理异常", formatErrInfo(error));
      return {
        profit: 0 // 利润
      };
    }
  }
  // 获取券类型信息(公共)
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
  // 查询最近用券记录返回(公共)
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

  // 更新券库存(公共)
  async updateQuanStock(params) {
    const { quan_stock, quan_flag, quan_desc, phone, app_name, quan_value } =
      params;
    // 无可用登录账号时 phone 可能为空，空手机号写入库存会产生 phone:"" 脏数据，跳过
    if (!phone) {
      this.logger.infoSave("跳过空手机号券库存更新", {
        app_name,
        quan_flag,
        quan_value
      });
      return;
    }
    let targetQuanList = await this.getTargetQuanByApp(
      app_name,
      quan_flag,
      quan_desc
    );
    // 同类目标券批量更新处理：收集到 list 后一次性批量落库 + 统一规则同步
    const updateList = [];
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
        app_name,
        quanStockList: JSON.stringify(quanStockList),
        update_time: getCurrentTime(),
        quan_value: item.quan_value,
        logger: this.logger
      };
      // 增加最后使用时间更新（方便看是否压价）
      if (quan_value?.split(",")?.includes(item.quan_value)) {
        updateParams.end_use_time = getCurrentTime();
      }
      updateList.push(updateParams);
    });
    // 批量更新券库存 + 统一触发一次规则同步（保持出票后路径异步不阻塞）
    batchUpdateQuanStockWithSync({
      list: updateList,
      app_name,
      logger: this.logger
    });
  }

  // 获取同类目标券列表(公共)
  async getTargetQuanByApp(app_name, quan_flag, quan_desc) {
    const quanTypeParams = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,quan_flag,quan_desc,app_name,quan_value,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(quanTypeParams);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      let targetQuanList = quanTypeList.filter(
        item =>
          item.quan_flag == quan_flag &&
          (quan_desc ? item.quan_desc == quan_desc : true)
      );
      this.logger.infoSave("获取同类目标券返回", {
        targetQuanList
      });
      return targetQuanList;
    } catch (error) {
      this.logger.errorSave("获取同类目标券异常", formatErrInfo(error));
    }
  }

  // 获取新券(独立-已调)
  async getNewQuan({
    quan_value,
    quan_flag,
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
    // 解决同名不同券类型无法从其他券类型绑券的问题
    const quanValueListStr = await getQuanValueListByQuanFlag({
      quan_flag,
      app_name: appFlag
    });
    if (quanValueListStr) {
      logger.infoSave("根据券标识获取对应券类型列表返回", {
        quanValueListStr,
        quan_flag,
        quan_value
      });
      quan_value = quanValueListStr;
    }
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

  // 绑定券(独立-已调)
  async bandQuan(data, logger) {
    const { coupon_num, session_id } = data;
    let params = {
      voucher_number: coupon_num,
      is_scratch: false, // 是否需要密码
      scratch_number: "", // 无密码传 "", 刮开密码
      sale_subject: "Wanda", // 固定值
      wanda_token: session_id
    };
    try {
      await mockDelay(0.1);
      logger.infoSave("绑定券参数", params);
      const res = await this.appApi.bindQuan(params);
      logger.infoSave("绑定券返回", res);
      return { coupon_num };
    } catch (error) {
      logger.errorSave("绑定新券异常", formatErrInfo(error));
    }
  }

  // 获取影院券类型列表(公共)
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
        const quanStockListByPhone = item.quanStockList.filter(
          itemA => itemA.phone === mobile
        );
        item.quan_stock = item.quan_stock || 0;
        if (quanStockListByPhone?.length) {
          // 最大数当做券库存
          let maxNum = 0;
          quanStockListByPhone.forEach(itemA => {
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

  // 获取影院券类型列表(报价时通过库存判断是否报价使用)(公共)
  async getQuanTypeListByApp() {
    const { app_name } = this.order;
    const useMobileList = getCinemaLoginInfoList(
      !this.order?.need_unsplit_login
    )
      .filter(
        item => item.app_name === app_name && item.mobile && item.session_id
      )
      .map(item => item.mobile);
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields:
        "id,app_name,quan_value,quan_flag,quan_desc,black_quans,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      quanTypeList.forEach(item => {
        item.quanStockList = item.quanStockList
          ? JSON.parse(item.quanStockList)
          : [];
        // 只拿关联账号的券库存信息进行判断
        const quanStockListByPhone = item.quanStockList.filter(itemA =>
          useMobileList.includes(itemA.phone)
        );
        item.quan_stock = item.quan_stock || 0;
        if (quanStockListByPhone?.length) {
          // 最大数当做券库存
          let maxNum = 0;
          quanStockListByPhone.forEach(itemA => {
            if (+itemA.quan_stock > maxNum) {
              maxNum = +itemA.quan_stock;
            }
          });
          item.quan_stock = maxNum;
        }
        item.quanStockListByPhone = quanStockListByPhone.slice();
      });
      this.logger.info("quanTypeList", quanTypeList);
      this.logger.infoSave("根据影院获取券类型列表返回", {
        quanTypeList: quanTypeList.map(
          ({ quanStockListByPhone, ...item }) => item
        ),
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

  // 异步更新券库存-报价时(公共)
  async syncUpdateQuanStock({ quanTypeList }) {
    if (!quanTypeList?.length) return;
    const { app_name } = this.order;
    let logger = new Logger({
      logType: 1
    });
    logger.init(this.order);
    const targetLoginList = getCinemaLoginInfoList(
      !this.order?.need_unsplit_login
    ).filter(
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
      // isNeedUpdate = false;
      if (!isNeedUpdate) {
        logger.infoSave("不需要更新券库存");
      } else {
        // 只要有一个需要更新，就全部更新，因为会获取该号全部的券
        needUpdateQuanTypeList = quanTypeList;
        console.log("needUpdateQuanTypeList", needUpdateQuanTypeList);
        // logger.infoSave("需要更新的券类型列表", {
        //   quanTypeList,
        //   targetLoginList
        // });

        let quanTypeListParams = needUpdateQuanTypeList.map(item => {
          return {
            id: item.id,
            quan_flag: item.quan_flag,
            quan_value: item.quan_value,
            quan_desc: item.quan_desc,
            black_quans: item.black_quans,
            quanStockList: item.quanStockList
              // 剔除空手机号条目：随本次写回自动清理历史 phone:"" 脏数据
              .filter(itemA => itemA.phone)
              .map(itemA => ({
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
            logger
          });

          quanTypeListParams.forEach(item => {
            let targetQuanList = quanListAll.filter(
              itemA =>
                couponInfoSpecial(item.quan_flag) ===
                  couponInfoSpecial(itemA.couponName) &&
                !item.black_quans?.includes(itemA.couponCode)
            );
            // 打印该手机号该券类型匹配到的券数量与券号（一眼看清各号各券类型的库存来源）
            logger.infoSave(
              `${mobile}—${item.quan_flag}—${targetQuanList.length}`,
              {
                quan_value: item.quan_value,
                matchedQuanList: targetQuanList.map(q => ({
                  couponCode: q.couponCode,
                  endDateTime: q.endDateTime
                }))
              }
            );
            let quanStock = targetQuanList.length;
            let quanStockList = item.quanStockList;
            let inx = quanStockList.findIndex(itemB => itemB.phone === mobile);
            let endDateTime = targetQuanList.sort(
              (a, b) => new Date(a.endDateTime) - new Date(b.endDateTime)
            )?.[0]?.endDateTime;
            if (inx != -1) {
              quanStockList[inx].quan_stock = quanStock;
              quanStockList[inx].real_quan_stock = targetQuanList.length;
              quanStockList[inx].update_time = getCurrentTime();
              quanStockList[inx].endDateTime = endDateTime;
            } else {
              quanStockList.push({
                phone: mobile,
                quan_stock: quanStock,
                real_quan_stock: targetQuanList.length,
                update_time: getCurrentTime(),
                endDateTime
              });
            }
          });
        }
        // quanStockList 统一序列化为 JSON 字符串（后端直接落库 + 批量规则同步内部 parse）
        let updateTypeList = quanTypeListParams.map(item => ({
          id: item.id,
          quan_value: item.quan_value,
          quan_flag: item.quan_flag, // 仅日志展示用（落库时被 dbList 剥离）
          quanStockList: JSON.stringify(item.quanStockList),
          update_time: getCurrentTime()
        }));
        // 打印最终要更新的券类型汇总信息：每个券类型 → 最大库存 + 有货手机号（直观可读）
        logger.infoSave("最终要更新的券类型列表汇总", {
          updateTypeList: formatQuanTypeSummaryForLog(updateTypeList)
        });
        // 批量更新券库存 + 统一触发一次规则同步（替代循环内逐条 singleUpdateQuanStock）
        await batchUpdateQuanStockWithSync({
          list: updateTypeList,
          app_name,
          logger
        });
      }
    } catch (error) {
      logger.errorSave("异步更新券库存异常", { error });
    } finally {
      logger.logUpload();
    }
  }

  // 获取某个手机号的全部优惠券列表(独立-已调)
  async getQuanListByPhone({ session_id, logger }) {
    try {
      const quanData = await this.continuousGetQuan({
        session_id,
        logger
      });
      console.log("quanData", quanData);
      logger.infoSave("连续获取券返回", {
        quanData: quanData.map(item => ({
          couponName: item.couponName,
          couponCode: item.couponCode,
          endDateTime: item.endDateTime
          // couponValue: item.couponValue
        }))
      });
      return quanData || [];
    } catch (error) {
      logger.errorSave("获取优惠券列表异常", error);
    }
  }

  /**
   * 获取可支付券列表（ncoupons.api）
   * 返回: [{ couponCode, couponName, detailtype, endDateTime, able, ... }]
   */
  async getPayQuanList({ session_id, buyTicketInfo }) {
    const params = {
      did: buyTicketInfo.show_id,
      partition: buyTicketInfo.partition,
      cinemaId: buyTicketInfo.cinema_id,
      able: true,
      wanda_token: session_id
    };
    try {
      this.logger.infoSave("获取影票券列表入参", params);
      const res = await this.appApi.getTicketCouponList(params);

      let resData = res;
      if (res && typeof res.data === "string" && res.code === 0) {
        const d = wandaAesDecrypt(res.data);
        if (d) {
          try {
            resData = { ...res, data: JSON.parse(d) };
          } catch (e) {
            this.logger.errorSave("解密券列表JSON失败", { error: e?.message });
            return [];
          }
        }
      }

      const coupons = resData.data?.res?.coupons || [];
      const quanList = coupons
        .filter(c => c.able)
        .map(item => ({
          ...item,
          couponName: item.name,
          couponCode: item.code,
          endDateTime: +new Date(item.end || 0)
        }));

      this.logger.infoSave("影票券列表", {
        code: resData.code,
        bizCode: resData.data?.bizCode,
        count: quanList.length,
        first: quanList[0]
          ? {
              code: quanList[0].code,
              name: quanList[0].name,
              detailtype: quanList[0].detailtype,
              able: quanList[0].able
            }
          : null
      });

      if (!quanList.length) this.logger.infoSave("影票券列表为空");
      return quanList;
    } catch (error) {
      this.logger.infoSave("获取影票券列表异常", formatErrInfo(error));
      return [];
    }
  }

  // 将 partition 从竖线格式转为 iOS APP 的逗号格式
  // 输入: "32-52722107|32-22890058" → 输出: "32-52722107,22890058"（同 areaCode 只写一次）
  _formatPartitionForSelect(partition) {
    const seats = partition.split("|");
    if (seats.length <= 1) return partition;
    const firstArea = seats[0].split("-")[0];
    const seatIds = seats.map(s => {
      const parts = s.split("-");
      return parts.length > 1 ? parts.slice(1).join("-") : s;
    });
    return `${firstArea}-${seatIds.join(",")}`;
  }

  // 仅预选券（不确认）：调 selectcoupon.api 获取 allotseat
  // partition 自动转为 iOS APP 逗号格式，couponCode 可传多张（逗号拼接）
  async _selectCouponOnly({ session_id, buyTicketInfo, couponCode }) {
    const { show_id, partition } = buyTicketInfo;
    const seatPartition = this._formatPartitionForSelect(partition);
    const selectParams = {
      did: show_id,
      partition: seatPartition,
      coupons: couponCode,
      wanda_token: session_id
    };
    try {
      this.logger.infoSave("预选券入参", selectParams);
      const res = await this.appApi.selectCoupon(selectParams);

      let resData = res;
      if (res && typeof res.data === "string" && res.code === 0) {
        const d = wandaAesDecrypt(res.data);
        if (d) {
          try {
            resData = { ...res, data: JSON.parse(d) };
          } catch (e) {
            this.logger.errorSave("解密预选券JSON失败", {
              error: e?.message
            });
            return null;
          }
        }
      }

      const allotseat = resData.data?.res?.allotseat || "";
      if (!allotseat) {
        this.logger.errorSave("预选券返回 allotseat 为空");
        return null;
      }
      return allotseat;
    } catch (error) {
      this.logger.errorSave("预选券异常", formatErrInfo(error));
      return null;
    }
  }

  // 仅确认用券：调 conponuse.api 获取实际抵扣价
  // partition 也转为 iOS 逗号格式
  async _confirmCouponOnly({ session_id, buyTicketInfo, allotseat, orderId }) {
    const { show_id, partition } = buyTicketInfo;
    const seatPartition = this._formatPartitionForSelect(partition);
    const useParams = {
      did: show_id,
      partition: seatPartition,
      allotseat,
      orderId: String(orderId),
      wanda_token: session_id
    };
    try {
      this.logger.infoSave("确认用券入参", useParams);
      const useRes = await this.appApi.conponUse(useParams);

      let useData = useRes;
      if (useRes && typeof useRes.data === "string" && useRes.code === 0) {
        const ud = wandaAesDecrypt(useRes.data);
        if (ud) {
          try {
            useData = { ...useRes, data: JSON.parse(ud) };
          } catch (e) {
            this.logger.errorSave("解密确认用券JSON失败", {
              error: e?.message
            });
          }
        }
      }

      const able = useData.data?.res?.able;
      const price = useData.data?.res?.price;
      this.logger.infoSave("确认用券返回", {
        bizCode: useData.data?.bizCode,
        able,
        price,
        cards: useData.data?.res?.cards,
        channelPrice: useData.data?.res?.channelPrice
      });

      if (able && price !== undefined) {
        return { conponPrice: price };
      } else if (!able) {
        this.logger.errorSave("确认用券返回 able=false", {
          msg: useData.data?.res?.msg
        });
        return null;
      }
      return { conponPrice: price };
    } catch (e) {
      this.logger.errorSave("确认用券异常", { error: e?.message });
      return null;
    }
  }

  // 预选券：先调 selectcoupon.api 获取 allotseat，再调 conponuse.api 确认并获取实际抵扣价（对照小程序完整流程）
  async selectCoupon({ session_id, buyTicketInfo, couponCodes, orderId }) {
    const { show_id, partition } = buyTicketInfo;
    const selectParams = {
      did: show_id,
      partition,
      coupons: couponCodes.join(","),
      wanda_token: session_id
    };
    try {
      // Step 1: selectcoupon.api → 获取 allotseat
      this.logger.infoSave("预选券入参", selectParams);
      const res = await this.appApi.selectCoupon(selectParams);

      let resData = res;
      if (res && typeof res.data === "string" && res.code === 0) {
        const d = wandaAesDecrypt(res.data);
        if (d) {
          try {
            resData = { ...res, data: JSON.parse(d) };
          } catch (e) {
            this.logger.errorSave("解密预选券JSON失败", { error: e?.message });
            return null;
          }
        }
      }

      const allotseat = resData.data?.res?.allotseat || "";
      const coupons = resData.data?.res?.coupons || "";

      if (!allotseat) {
        this.logger.errorSave("预选券返回 allotseat 为空");
        return null;
      }

      // 从 allotseat JSON 中提取券面值（salePrice）作为 fallback
      let salePrice = 0;
      try {
        const allotObj = JSON.parse(allotseat);
        const dtItems = allotObj.dtItemList || [];
        salePrice = dtItems.reduce(
          (sum, item) => sum + (item.salePrice || 0),
          0
        );
      } catch (e) {
        this.logger.warn?.("解析 allotseat 提取 salePrice 失败", {
          error: e?.message
        });
      }

      // Step 2: conponuse.api → 确认用券，获取实际抵扣价 price（对照小程序 confirmCouponApi）
      let conponPrice = salePrice;
      if (orderId) {
        const useParams = {
          did: show_id,
          partition,
          allotseat,
          orderId: String(orderId),
          wanda_token: session_id
        };
        try {
          this.logger.infoSave("确认用券入参", useParams);
          const useRes = await this.appApi.conponUse(useParams);

          let useData = useRes;
          if (useRes && typeof useRes.data === "string" && useRes.code === 0) {
            const ud = wandaAesDecrypt(useRes.data);
            if (ud) {
              try {
                useData = { ...useRes, data: JSON.parse(ud) };
              } catch (e) {
                this.logger.errorSave("解密确认用券JSON失败", {
                  error: e?.message
                });
              }
            }
          }

          const able = useData.data?.res?.able;
          const price = useData.data?.res?.price; // 实际抵扣金额（分），对应小程序 endneedChannel=true 时的 discountPrice
          this.logger.infoSave("确认用券返回", {
            bizCode: useData.data?.bizCode,
            able,
            price,
            cards: useData.data?.res?.cards,
            channelPrice: useData.data?.res?.channelPrice
          });

          if (able && price !== undefined) {
            conponPrice = price;
          } else if (!able) {
            this.logger.errorSave("确认用券返回 able=false", {
              msg: useData.data?.res?.msg
            });
          }
        } catch (e) {
          this.logger.errorSave("确认用券异常，回退使用 salePrice", {
            error: e?.message
          });
        }
      } else {
        this.logger.warn?.(
          "未传 orderId，跳过 conponuse 确认，使用 salePrice 作为 discountPrice"
        );
      }

      this.logger.infoSave("预选券最终返回", {
        allotseat,
        coupons,
        salePrice,
        conponPrice
      });

      return { allotseat, coupons, salePrice, conponPrice };
    } catch (error) {
      this.logger.errorSave("预选券异常", formatErrInfo(error));
      return null;
    }
  }

  // 连续获取券(独立-已调)
  async continuousGetQuan(data) {
    let { session_id, quanData = [], logger } = data;
    let params = {
      session_id
    };
    try {
      let quanList = await this.getQuanList(params);
      quanData.push(...quanList);
      // 最多只返回50个展示，故不用连续获取了
      // if (quanList?.length == pageSize) {
      //   // 如果还有下一页，则继续获取下一页
      //   return await this.continuousGetQuan({
      //     ...data,
      //     pageNumber: pageNumber + 1,
      //     quanData
      //   });
      // }
      return quanData;
    } catch (error) {
      logger.errorSave("连续获取券异常", {
        error,
        params
      });
      return [];
    }
  }

  // 获取排序手机号(公共)
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

  // 获取影院券类型列表(公共)
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
      const useMobileList = getCinemaLoginInfoList(
        !this.order?.need_unsplit_login
      )
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

  /**
   * 获取活动权益数据（list.api），用于 merge_payment 的 requestInfo.activity(目前场景用不到)
   */
  async getActivityData({ session_id, buyTicketInfo }) {
    try {
      const params = {
        did: buyTicketInfo.show_id,
        partition: buyTicketInfo.partition,
        able: true,
        orderId: buyTicketInfo.order_num,
        wanda_token: session_id
      };
      this.logger.infoSave("获取活动权益数据入参", params);
      const res = await this.appApi.getActivityCoupon(params);
      let resData = res;
      if (res && typeof res.data === "string" && res.code === 0) {
        const d = this._decrypt(res.data);
        if (d) resData = { ...res, data: JSON.parse(d) };
      }
      const groups = resData.data?.res || [];
      this.logger.infoSave("获取活动权益数据返回", groups);
      const items = groups.flatMap(g => g.groupItems || []);
      this.activityData = items; // 存实例上，buyTicket 里取
      return items;
    } catch (e) {
      this.logger.infoSave("获取活动权益异常", formatErrInfo(e));
      return [];
    }
  }

  _decrypt(hex) {
    try {
      return wandaAesDecrypt(hex);
    } catch (e) {
      return null;
    }
  }
}
