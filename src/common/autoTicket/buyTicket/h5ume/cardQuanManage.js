/**
 * H5UME卡券管理模块
 *
 * 职责：
 * - 会员卡使用：获取卡列表、检查余额和出票量限制
 * - 优惠券使用：获取券列表、过滤可用券、绑定券、更新券库存
 *
 * 所属流程：报价流程、出票流程
 *
 * 依赖模块：无（独立模块）
 *
 * @module h5ume/cardQuanManage
 */
import {
  formatErrInfo,
  getCurrentTime,
  formatTimeOfTime,
  getCurrentDay,
  isDateInCurrentMonth,
  getCinemaLoginInfoList,
  couponInfoSpecial,
  getOfferRuleById
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import { TEST_NEW_PLAT_LIST, NO_FEE_PLAT_LIST } from "@/common/constant";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";
import { platTokens } from "@/store/platTokens";
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";
import { mockDelay } from "@/utils/utils";
import { singleUpdateQuanStock } from "@/common/autoTicket/commonQuanStock.js";

const tokens = platTokens();
const { getQuanValueListByQuanFlag } = usesMachineBaseFun();

export default class H5UmeCardQuanManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
    this.curPhone = "";
  }

  /**
   * 获取券类型信息
   * @param {string} quan_value - 券类型值
   * @param {string} app_name - 影院标识
   * @returns {Promise<Object|null>} 券类型信息或null
   */
  async getQuanInfo(quan_value, app_name) {
    try {
      const res = await svApi.queryQuanTypeInfo({
        quan_value,
        app_name
      });
      this.logger.infoSave("获取券类型信息返回", { res });
      return res.data.quanInfo || null;
    } catch (error) {
      this.logger.errorSave("获取券类型信息异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 连续获取券
   * @param {Object} data - 参数对象
   * @param {string} data.session_id - 会话ID
   * @param {number} [data.pageNo=1] - 页码
   * @param {number} [data.pageSize=100] - 每页数量
   * @param {Array} [data.quanData=[]] - 已获取的券数据
   * @returns {Promise<Array>} 券列表
   */
  async continuousGetQuan(data) {
    let {
      session_id,
      pageNo = 1,
      pageSize = 100,
      quanData = [],
      currentMobile
    } = data;
    let params = {
      state: "USEFUL",
      pageNo,
      pageSize,
      umeToken: session_id
    };
    try {
      this.logger.infoSave(currentMobile + "连续获取券参数", params);
      const res = await this.appApi.getQuanList(params);
      let quanList = res.bizValue || [];

      this.logger.infoSave(currentMobile + "连续获取券返回", {
        quanList: quanList.map(item => ({
          name: item.name,
          couponCode: item.couponCode
        }))
      });

      quanData.push(...quanList);
      if (pageSize > quanList.length) {
        return quanData;
      } else {
        // 继续获取下一页
        return await this.continuousGetQuan({
          ...data,
          pageNo: pageNo + 1,
          quanData
        });
      }
    } catch (error) {
      this.logger.errorSave("连续获取券异常", { error });
      return [];
    }
  }

  /**
   * 查询最近用券记录
   * @param {Object} params - 参数对象
   * @param {string} params.quan_value - 券类型值
   * @param {string} params.app_name - 影院标识
   * @returns {Promise<Array>} 最近用券记录列表
   */
  async queryUsedQuanList({ quan_value, app_name }) {
    const params = {
      order_status: "1",
      quan_value,
      app_name,
      rule: tokens.userInfo?.rule,
      start_time: formatTimeOfTime(+new Date() - 3 * 24 * 60 * 60 * 1000),
      end_time: getCurrentTime()
    };
    try {
      const res = await svApi.queryUsedQuanList(params);
      const usedQuanList = res.data?.usedQuanList || [];
      this.logger.infoSave("获取最近用券记录入参及返回", {
        params,
        res
      });
      return usedQuanList;
    } catch (error) {
      this.logger.infoSave("获取最近用券记录异常", {
        params,
        error
      });
      return [];
    }
  }

  /**
   * 获取影院券类型列表
   * @param {Object} params - 参数对象
   * @param {string} params.appFlag - 影院标识
   * @param {string} params.mobile - 手机号
   * @returns {Promise<Array>} 券类型列表
   */
  async getQuanTypeListByApp({ appFlag: app_name, mobile }) {
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
      this.logger.infoSave("根据影院获取券类型列表", { quanTypeList });
      return quanTypeList;
    } catch (error) {
      this.logger.errorSave("根据影院获取券类型列表返回异常", { error });
      return [];
    }
  }

  /**
   * 获取排序手机号
   * @param {Array} targetQuanList - 目标券类型列表
   * @param {Array} quanValueList - 券类型值列表
   * @returns {Array} 排序后的手机号列表
   */
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
      return [];
    }
  }

  /**
   * 获取按券类型排序的手机号列表
   * @param {string} app_name - 影院标识
   * @param {string} quan_flag - 券标识
   * @param {string} quan_value - 券类型值，多个用逗号分隔
   * @param {number} ticket_num - 票数
   * @returns {Promise<Array>} 排序后的手机号列表
   */
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
        this.logger.infoSave("获取排序手机列表返回", { sortMobileList });
        return sortMobileList;
      }
    } catch (error) {
      this.logger.errorSave("根据影院获取券类型列表返回异常", {
        error
      });
      return [];
    }
  }

  /**
   * 获取影院指定会员卡
   * @param {string|number} cinemaLinkId - 影院链接ID
   * @param {number} ticket_num - 票数
   * @returns {Promise<Array>} 可用卡列表
   */
  async getUsableCardList(cinemaLinkId, ticket_num) {
    const { appFlag } = this;
    try {
      const res = await svApi.queryCardList({
        app_name: appFlag,
        rule: tokens.userInfo?.rule,
        status: "1",
        isNeedTotalNum: 0,
        queryFields:
          "card_num,card_id,balance,mobile,card_discount,linkCinemaIds,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
      });
      let list = res.data.cardList || [];

      list = list.map(item => ({
        ...item,
        // 使用日非当天的就是0
        daily_usage:
          item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0,
        // 使用日非当月的就是0
        month_usage: !isDateInCurrentMonth(item.usage_date)
          ? 0
          : item.monthly_usage || 0
      }));
      this.logger.infoSave("获取该影院已维护会员卡列表返回", { list });
      const useMobileList = getCinemaLoginInfoList(
        !this.order?.need_unsplit_login
      )
        .filter(
          item => item.app_name === appFlag && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      let cardListByMobile = list.filter(item =>
        useMobileList.includes(item.mobile)
      );
      this.logger.infoSave("根据该用户关联手机号对卡列表进行过滤", {
        useMobileList,
        cardListByMobile: cardListByMobile.map(item => item.card_num)
      });
      // 根据当天及当月出票量限制进行过滤
      let cardListLimit = cardListByMobile.filter(item => {
        const { use_limit_day, use_limit_month, daily_usage, month_usage } =
          item;
        if (!use_limit_day && !use_limit_month) return true;
        return (
          (use_limit_day ? ticket_num <= use_limit_day - daily_usage : true) &&
          (use_limit_month ? ticket_num <= use_limit_month - month_usage : true)
        );
      });
      this.logger.infoSave("根据当天及当月出票量限制过滤后", {
        cardListLimit: cardListLimit.map(item => item.card_num)
      });
      let useCanCardList = cardListLimit.filter(item => {
        return !item.linkCinemaIds
          ? true
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaLinkId);
      });
      // 设置指定影院的卡优先
      useCanCardList = useCanCardList.sort((a, b) => {
        if (a.linkCinemaIds && !b.linkCinemaIds) return -1;
        if (!a.linkCinemaIds && b.linkCinemaIds) return 1;
        return 0;
      });
      this.logger.infoSave("根据制定影院过滤后的卡列表", {
        useCanCardList: useCanCardList.map(item => item.card_num)
      });
      return useCanCardList;
    } catch (error) {
      this.logger.errorSave("获取会员卡维护列表异常", {
        error
      });
      return [];
    }
  }

  /**
   * 会员用卡处理
   * @param {Object} data - 参数对象
   * @param {Array} data.cardList - 卡列表
   * @param {number} data.member_price - 成本价
   * @param {number} data.member_total_price - 会员总价
   * @param {number} data.rewards - 奖励比例
   * @param {number} data.supplier_end_price - 中标价
   * @param {number} data.ticket_num - 票数
   * @param {string} data.plat_name - 平台名称
   * @returns {Promise<Object>} { card_id, cardNum, profit }
   */
  async useCardHandle(data) {
    const {
      cardList,
      member_price, // 成本价
      member_total_price,
      rewards,
      supplier_end_price,
      ticket_num,
      plat_name
    } = data;
    try {
      let cardData = cardList.filter(
        item => item.balance >= member_total_price
      );
      if (!cardData?.length) {
        this.logger.errorSave("会员卡余额不足", {
          cardList,
          member_total_price: member_total_price
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
      if (
        !this.isTestOrder &&
        profit < 0 &&
        !TEST_NEW_PLAT_LIST.includes(plat_name)
      ) {
        this.logger.errorSave("使用会员卡计算价格后最终利润为负", {
          profit
        });
        return {
          profit: 0,
          card_id: ""
        };
      }
      profit = Number(profit).toFixed(2);
      return {
        card_id: cardData?.[0]?.cardNumber,
        cardNum: cardData?.[0]?.cardNumber,
        profit // 利润
      };
    } catch (error) {
      this.logger.errorSave("会员用卡处理异常", { error });
      return {
        card_id: "",
        profit: 0 // 利润
      };
    }
  }

  /**
   * 使用优惠券或会员卡
   * @param {Object} params - 参数对象
   * @param {Array} params.cardList - 卡列表
   * @param {Array} params.quanList - 券列表
   * @param {number} params.supplier_end_price - 中标价
   * @param {number} params.ticket_num - 票数
   * @param {Object} params.offerRule - 报价规则
   * @param {number} params.total_price - 总价
   * @param {number} params.member_total_price - 会员总价
   * @param {number} params.rewards - 奖励比例
   * @param {string} params.appFlag - 影院标识
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.plat_name - 平台名称
   * @param {Function} params.getCurrentParams - 获取当前参数的函数
   * @param {number} params.currentParamsInx - 当前参数索引
   * @returns {Promise<Object>} { card_id, cardNum, useQuan, profit, quanStock }
   */
  async useQuanOrCard({
    cardList,
    quanList,
    supplier_end_price,
    ticket_num,
    offerRule,
    total_price,
    member_total_price, // 会员总价
    rewards,
    appFlag,
    cinemaLinkId,
    plat_name,
    getCurrentParams,
    currentParamsInx
  }) {
    try {
      const {
        offer_type,
        member_price, // 成本价
        offer_rule_id
      } = offerRule;
      let currentParams = getCurrentParams?.()?.list?.[currentParamsInx];
      const { mobile } = currentParams || {};
      let is_auto_use_quan = false; // 是否灵活用券
      let card_id = "";
      let useCardParms = {
        cardList,
        member_price, // 成本价
        member_total_price,
        rewards,
        supplier_end_price,
        ticket_num,
        plat_name
      };
      if (offer_type !== "1") {
        const ruleInfo = getOfferRuleById(offer_rule_id);
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
      if (offerRule.offer_type == "1" || is_auto_use_quan) {
        let quanValueList = offerRule.quan_value.split(",");
        this.logger.infoSave("使用优惠券出票", {
          quanValueList
        });
        // 读取券库存进行过滤重新设置quan_value为单个券类型
        if (quanValueList.length > 1) {
          const appQuanTypeList = await this.getQuanTypeListByApp({
            appFlag,
            mobile
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
          item => couponInfoSpecial(item.name) === couponInfoSpecial(quan_flag)
        );
        if (!targetQuanList?.length) {
          this.logger.infoSave("未找到券标识对应的券，准备从个人中心获取", {
            session_id: currentParams?.session_id,
            quan_flag,
            black_quans
          });
          const quanListByPerCenter = await this.continuousGetQuan({
            session_id: currentParams?.session_id
          });
          targetQuanList = quanListByPerCenter?.filter(
            item =>
              couponInfoSpecial(item.name) === couponInfoSpecial(quan_flag)
          );
          this.logger.infoSave("从个人中心获取到的目标券", {
            targetQuanList: JSON.parse(
              JSON.stringify(targetQuanList.slice(0, 8))
            )
          });
        }
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
          (a, b) => +new Date(a.expireTime) - new Date(b.expireTime)
        );
        // 更新券库存
        this.updateQuanStock({
          quan_stock: targetQuanList.length,
          quan_flag: offerRule.quan_flag,
          app_name: appFlag,
          phone: this.curPhone
        });
        if (targetQuanList.length < ticket_num) {
          this.logger.infoSave("目标券不足", {
            targetQuanList,
            ticket_num
          });
          this.logger.warn("优惠券不够用");
          if (is_auto_use_quan) {
            this.logger.infoSave("灵活用券时获取目标券不足,转用卡处理");
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return {
            profit: 0,
            card_id: ""
          };
        }

        let useQuan = targetQuanList.slice(0, ticket_num).map((item, index) => {
          return {
            couponType: item.couponType,
            concreteProductType: item.concreteProductType,
            couponCode: item.couponCode,
            discountAmount: item.discountValue
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
            (Number(supplier_end_price) * 100 * Number(ticket_num) * rewards) /
            10000;
          profit += rewardPrice;
        }
        if (
          !this.isTestOrder &&
          profit < 0 &&
          !TEST_NEW_PLAT_LIST.includes(plat_name)
        ) {
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
            card_id: ""
          };
        }
        if (quan_fee > 0) {
          let cardData = cardList.filter(
            item => item.balance >= quan_fee * 100 * ticket_num
          );
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
              card_id: "",
              profit: 0 // 利润
            };
          }
          // 取最大余额
          cardData = cardData.sort((a, b) => b.balance - a.balance);
          card_id = cardData?.[0]?.cardNumber;
        }
        if (is_auto_use_quan) {
          offerRule.offer_type = "1";
        }
        return {
          profit,
          card_id,
          useQuan,
          quanStock: targetQuanList.length
        };
      }
    } catch (error) {
      this.logger.errorSave("使用会员卡或优惠券报错", { error });
    }
  }

  /**
   * 更新券库存
   * @param {Object} params - 参数对象
   * @param {number} params.quan_stock - 券库存
   * @param {string} params.quan_flag - 券标识
   * @param {string} params.phone - 手机号
   * @param {string} params.app_name - 影院标识
   * @param {string} [params.quan_value] - 券类型值（可选）
   * @returns {Promise<void>}
   */
  async updateQuanStock(params) {
    const { quan_stock, quan_flag, phone, app_name, quan_value } = params;
    let targetQuanList = [];
    const quanTypeParams = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,quan_flag,app_name,quan_value,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(quanTypeParams);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      targetQuanList = quanTypeList.filter(item => item.quan_flag == quan_flag);
      this.logger.infoSave("更新券库存前获取同类目标券返回", {
        params,
        quanTypeParams,
        targetQuanList
      });
    } catch (error) {
      this.logger.errorSave("更新券库存前获取同类目标券异常", {
        params,
        error
      });
    }

    // 同类目标券更新处理
    targetQuanList.forEach(item => {
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
      // 单个更新
      singleUpdateQuanStock(updateParams);
    });
  }

  /**
   * 获取新券（绑定券）
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.quan_value - 券类型值
   * @param {string} params.quan_flag - 券标识
   * @param {string} [params.black_quans] - 黑名单券（可选）
   * @param {number} params.quanNum - 需要绑定的券数量
   * @param {string} params.session_id - 会话ID
   * @param {number} [params.asyncFlag] - 异步标识（可选）
   * @param {string} params.plat_name - 平台名称
   * @param {string} params.order_number - 订单号
   * @returns {Promise<Array>} 绑定券列表
   */
  async getNewQuan({
    cinemaLinkId,
    quan_value,
    quan_flag,
    black_quans,
    quanNum,
    session_id,
    asyncFlag,
    plat_name,
    order_number
  }) {
    const { appFlag } = this;
    let logger = this.logger;
    // 异步绑券
    if (asyncFlag === 1) {
      logger = new Logger({ logType: 3 });
      logger.init(this.order);
    }
    let targetLogger = asyncFlag === 1 ? logger : this.logger;
    let conPrev = asyncFlag === 1 ? "异步绑券_" : "";
    // 解决同名不同券类型无法从其他券类型绑券的问题
    const quanValueListStr = await getQuanValueListByQuanFlag({
      quan_flag,
      app_name: appFlag
    });
    if (quanValueListStr) {
      targetLogger.infoSave("根据券标识获取对应券类型列表返回", {
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
      targetLogger.infoSave(`${conPrev}从服务端获取券返回`, {
        quanRes,
        quanNum,
        quan_value,
        params
      });

      let quanList = quanRes.data?.quanList || [];
      if (!quanList?.length && asyncFlag != 1) {
        targetLogger.error(`数据库${quan_value}面额券不足`);
        return;
      }
      // quanList = quanList.map(item => item.coupon_num.trim());
      let bandQuanList = [];
      for (const quan of quanList) {
        targetLogger.info(`正在尝试绑定券 ${quan.coupon_num}...`);
        const couponNumRes = await this.bandQuan({
          cinemaLinkId,
          coupon_num: quan.coupon_num,
          session_id,
          appFlag
        });
        const coupon_num = couponNumRes?.coupon_num;
        targetLogger.infoSave(`${conPrev}绑定券返回`, couponNumRes);
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
      targetLogger.errorSave("从服务端获取券异常", {
        error,
        params
      });
    } finally {
      if (asyncFlag) {
        logger.logUpload();
      }
    }
  }

  /**
   * 绑定券
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.coupon_num - 券码
   * @param {string} params.session_id - 会话ID
   * @param {string} params.appFlag - 影院标识
   * @returns {Promise<Object>} { coupon_num, error? }
   */
  async bandQuan({ cinemaLinkId, coupon_num, session_id, appFlag }) {
    // 由于要用二线城市影院且40券通用，故写死
    let params = {
      couponCode: coupon_num,
      pinCode: "",
      cinemaLinkId,
      umeToken: session_id
    };
    try {
      await mockDelay(1);
      await this.appApi.bandQuan(params);
      return {
        coupon_num
      };
    } catch (error) {
      console.error("绑定新券异常", error);
      return {
        error,
        errMsg: "绑定新券异常:" + JSON.stringify(params)
      };
    }
  }

  /**
   * 设置是否为测试订单
   * @param {boolean} isTestOrder - 是否为测试订单
   */
  setIsTestOrder(isTestOrder) {
    this.isTestOrder = isTestOrder;
  }
}
