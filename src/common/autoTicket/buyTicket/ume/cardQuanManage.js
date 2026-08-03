/**
 * UME卡券管理模块
 *
 * 职责：
 * - 会员卡使用：获取卡列表、检查余额和出票量限制
 * - 优惠券使用：获取券列表、过滤可用券、绑定券、更新券库存
 *
 * 所属流程：报价流程、出票流程
 *
 * 依赖模块：无（独立模块）
 *
 * @module ume/cardQuanManage
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
import { batchUpdateQuanStockWithSync } from "@/common/autoTicket/commonQuanStock.js";

const tokens = platTokens();
const { getQuanValueListByQuanFlag } = usesMachineBaseFun();

export default class UmeCardQuanManage {
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
   * @param {string|number} data.cinemaCode - 影院编码
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string} data.session_id - 会话ID
   * @param {number} [data.page=1] - 页码
   * @param {Array} [data.quanData=[]] - 已获取的券数据
   * @param {Logger} data.logger - 日志实例
   * @returns {Promise<Array>} 券列表
   */
  async continuousGetQuan(data) {
    let {
      cinemaCode,
      cinemaLinkId,
      session_id,
      page = 1,
      quanData = [],
      logger
    } = data;
    let params = {
      params: {
        status: "UN_USED",
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      },
      pageIndex: page,
      pageRows: 50, // 支持修改
      session_id
    };
    try {
      const res = await this.appApi.findCouponByMember(params);
      console.log("获取优惠券列表返回", res);
      let quanList = res.data || [];
      let total_page = res.pagesCount;
      quanData.push(...quanList);
      if (total_page > page) {
        // 如果总数量仍小于所需数量，则继续获取下一页
        return await this.continuousGetQuan({
          ...data,
          page: page + 1,
          quanData
        });
      }
      return quanData.map(item => ({
        coupon_info: item.couponName,
        coupon_num: item.couponCode,
        endDateTime: item.endDateTime // "2025-10-02 23:59:59"
      }));
    } catch (error) {
      logger.errorSave("连续获取券失败", {
        error: formatErrInfo(error),
        params
      });
      return [];
    }
  }

  /**
   * 获取优惠券列表（报价时使用）
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaCode - 影院编码
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.session_id - 会话ID
   * @param {Logger} params.logger - 日志实例
   * @returns {Promise<Array>} 优惠券列表
   */
  async getQuanListByPhone({ cinemaCode, cinemaLinkId, session_id, logger }) {
    try {
      const quanData = await this.continuousGetQuan({
        cinemaCode,
        cinemaLinkId,
        session_id,
        logger
      });
      console.log("quanData", quanData);
      return quanData.map(item => ({
        ...item,
        endDateTime: item.endDateTime // "2025-10-02 23:59:59"
      }));
    } catch (error) {
      logger.errorSave("获取优惠券列表异常", {
        error: formatErrInfo(error)
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
      this.logger.infoSave("根据影院获取券类型列表返回", { quanTypeList });
      return quanTypeList;
    } catch (error) {
      this.logger.errorSave("根据影院获取券类型列表返回异常", { error });
      return [];
    }
  }

  /**
   * 查询最近用券记录返回
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
      rule: tokens.userInfo.rule,
      start_time: formatTimeOfTime(+new Date() - 3 * 24 * 60 * 60 * 1000),
      end_time: getCurrentTime()
    };
    try {
      const res = await svApi.queryUsedQuanList(params);
      const usedQuanList = res.data?.usedQuanList || [];
      this.logger.infoSave("获取最近用券记录入参及返回", { params, res });
      return usedQuanList;
    } catch (error) {
      this.logger.errorSave("获取最近用券记录失败", { params, error });
      return [];
    }
  }

  /**
   * 获取影院指定会员卡（出票用）
   * @param {string|number} cinemaCode - 影院编码
   * @param {number} ticket_num - 票数
   * @returns {Promise<Array>} 可用卡列表
   */
  async getUsableCardList(cinemaCode, ticket_num) {
    const { appFlag } = this;
    try {
      const res = await svApi.queryCardList({
        app_name: appFlag,
        rule: tokens.userInfo.rule,
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
      this.logger.infoSave("获取该影院已维护会员卡列表返回", {
        list
      });
      const useMobileList = getCinemaLoginInfoList(!this.order?.need_unsplit_login)
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
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaCode);
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
   * 获取排序手机号
   * @param {Array} targetQuanList - 目标券列表
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
   * 按券类型排序手机号（出票用）
   * @param {string} app_name - 影院标识
   * @param {string} quan_flag - 券标识
   * @param {string} quan_value - 券类型值
   * @param {number} ticket_num - 票数
   * @returns {Promise<Array<string>>} 排序后的手机号列表
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
      const useMobileList = getCinemaLoginInfoList(!this.order?.need_unsplit_login)
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
        this.logger.infoSave("获取排序手机列表返回", {
          sortMobileList
        });
        return sortMobileList;
      }
    } catch (error) {
      this.logger.error("根据影院获取券类型列表返回异常", error);
      return [];
    }
  }

  /**
   * 使用优惠券或会员卡（出票用）
   * @param {Object} params - 参数对象
   * @param {Array} params.cardList - 会员卡列表
   * @param {Array} params.quanList - 优惠券列表
   * @param {number} params.supplier_end_price - 中标价
   * @param {number} params.ticket_num - 票数
   * @param {Object} params.offerRule - 报价规则
   * @param {number} params.handlingFee - 手续费
   * @param {number} params.rewards - 奖励百分比
   * @param {string} params.appFlag - 影院标识
   * @param {string} params.plat_name - 平台名称
   * @param {Array} params.currentParamsList - 当前登录参数列表
   * @param {number} params.currentParamsInx - 当前登录参数索引
   * @param {string} params.curPhone - 当前手机号
   * @returns {Promise<Object>} { card_id, cardNum, useQuan, profit, quanStock }
   */
  async useQuanOrCard({
    cardList,
    quanList,
    supplier_end_price,
    ticket_num,
    offerRule,
    handlingFee,
    rewards,
    appFlag,
    plat_name,
    currentParamsList,
    currentParamsInx,
    curPhone
  }) {
    try {
      const {
        offer_type,
        member_price, // 成本价
        offer_rule_id
      } = offerRule;
      let currentParams = currentParamsList[currentParamsInx];
      const { mobile } = currentParams;
      let is_auto_use_quan = false; // 是否灵活用券
      let useCardParms = {
        cardList,
        member_price, // 成本价
        handlingFee,
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
            this.logger.infoSave("跟据券类型和券库存进行筛选", {
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
        // 特殊处理此种券在个人中心和出票时名称不一致，出票时特殊处理下
        if (quan_value == "yaolaiguowaiquanxin") {
          quan_flag = "观影兑换券";
        }
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
          phone: curPhone
        });
        if (targetQuanList.length < ticket_num) {
          this.logger.warn("优惠券不够用");
          if (is_auto_use_quan) {
            this.logger.infoSave("灵活用券时获取目标券不足,转用卡处理");
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParms);
          }
          return {
            profit: 0,
            useQuan: []
          };
        }

        let useQuan = targetQuanList.slice(0, ticket_num).map((item, index) => {
          let seatCode = Object.keys(item.discountAmountMap);
          let discountAmount = 0;
          if (seatCode) {
            discountAmount = item.discountAmountMap?.[seatCode[index]];
            if (
              discountAmount &&
              Object.prototype.toString.call(discountAmount) ===
                "[object Object]" &&
              discountAmount[1]
            ) {
              discountAmount = discountAmount[1];
            }
          }
          return {
            couponInstanceId: item.couponInstanceId,
            couponType: item.templateType,
            // 以下两个值一样
            seatCode: seatCode[index],
            salesKeySku: seatCode[index],
            couponCode: item.couponCode,
            couponName: item.couponName,
            templateCode: item.templateCode,
            discountAmount
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
            useQuan: []
          };
        }
        if (quan_fee > 0) {
          let cardData = cardList.filter(
            item => item.cardAmount >= quan_fee * 100 * ticket_num
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
              useQuan: [],
              card_id: "",
              profit: 0 // 利润
            };
          }
        }
        if (is_auto_use_quan) {
          offerRule.offer_type = "1";
        }
        return {
          useQuan,
          quanStock: targetQuanList.length,
          profit
        };
      }
    } catch (error) {
      this.logger.errorSave("使用会员卡或优惠券报错", {
        error
      });
      return {};
    }
  }

  /**
   * 会员用卡处理
   * @param {Object} data - 参数对象
   * @param {Array} data.cardList - 会员卡列表
   * @param {number} data.member_price - 成本价
   * @param {number} data.handlingFee - 手续费
   * @param {number} data.rewards - 奖励百分比
   * @param {number} data.supplier_end_price - 中标价
   * @param {number} data.ticket_num - 票数
   * @param {string} data.plat_name - 平台名称
   * @returns {Promise<Object>} { card_id, cardNum, profit }
   */
  async useCardHandle(data) {
    const {
      cardList,
      member_price, // 成本价
      handlingFee,
      rewards,
      supplier_end_price,
      ticket_num,
      plat_name
    } = data;
    try {
      let str;
      if (!cardList.length) {
        str = "无可用会员卡（疑似出满）";
      }
      let cardData = cardList.filter(
        item =>
          item.cardAmount >= item.resultAmount + (handlingFee || 0) * ticket_num
        // 需大于实际价格+手续费*ticket
      );
      if (!cardList.length || !cardData?.length) {
        this.logger.errorSave(str || "会员卡余额不足", {
          cardList,
          handlingFee
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
        this.logger.errorSave("使用会员卡计算价格后最终利润为负", {
          profit
        });
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
      this.logger.errorSave("会员用卡处理异常", { error });
      return {
        card_id: "",
        profit: 0 // 利润
      };
    }
  }

  /**
   * 获取新券（异步绑券）
   * @param {Object} params - 参数对象
   * @param {string|number} params.cinemaCode - 影院编码
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.quan_value - 券类型值
   * @param {string} params.quan_flag - 券标识
   * @param {string} params.black_quans - 券黑名单
   * @param {number} params.quanNum - 券数量
   * @param {string} params.session_id - 会话ID
   * @param {number} [params.asyncFlag] - 异步标识：1=异步，0=同步
   * @param {string} params.plat_name - 平台名称
   * @param {string} params.order_number - 订单号
   * @returns {Promise<Array>} 绑定的券列表
   */
  async getNewQuan({
    cinemaCode,
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
          cinemaCode,
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
      targetLogger.errorSave("获取新券异常", {
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
   * @param {string|number} params.cinemaCode - 影院编码
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @param {string} params.coupon_num - 券码
   * @param {string} params.session_id - 会话ID
   * @param {string} params.appFlag - 影院标识
   * @returns {Promise<Object>} { coupon_num } 或 { error, errMsg }
   */
  async bandQuan({
    cinemaCode,
    cinemaLinkId,
    coupon_num,
    session_id,
    appFlag
  }) {
    // 由于要用二线城市影院且40券通用，故写死
    let params = {
      params: {
        couponCode: coupon_num,
        cinemaCode,
        cinemaLinkId,
        sysSourceCode: "YZ001",
        channelCode: "QD0000001"
      },
      session_id
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
    // 无可用登录账号时 phone 可能为空，空手机号写入库存会产生 phone:"" 脏数据，跳过
    if (!phone) {
      this.logger.infoSave("跳过空手机号券库存更新", {
        app_name,
        quan_flag,
        quan_value
      });
      return;
    }
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
        quanTypeParams,
        error
      });
    }

    // 同类目标券批量更新处理：收集到 list 后一次性批量落库 + 统一规则同步
    const updateList = [];
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
            quan_stock: quan_stock,
            real_quan_stock: quan_stock,
            update_time: getCurrentTime()
          });
        }
      } else {
        quanStockList = [
          {
            phone,
            quan_stock: quan_stock,
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
}
