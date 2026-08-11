/**
 * SFC卡券管理模块
 *
 * 职责：
 * - 会员卡使用：获取卡列表、切换卡、检查余额和出票量限制
 * - 优惠券使用：获取券列表、过滤可用券、绑定券、更新券库存
 *
 * 所属流程：报价流程、出票流程
 *
 * 依赖模块：无（独立模块）
 *
 * @module sfc/cardQuanManage
 */
import {
  formatErrInfo,
  getCurrentTime,
  couponInfoSpecial,
  mockDelay,
  getOfferRuleById,
  mulDecimal // 高精度乘法(避免手续费精度丢失)
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import {
  sfcV3AppList,
  TEST_NEW_PLAT_LIST
} from "@/common/constant";
import { getPlatFeeRate } from "../common/offerHelper";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";
import { platTokens } from "@/store/platTokens";
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";
import { syncCardBalanceToSv } from "@/common/autoTicket/buyTicket/common/cardBalanceSync";
import { batchUpdateQuanStockWithSync } from "@/common/autoTicket/commonQuanStock.js";
import {
  getQuanInfoCommon,
  getUsableCardListCommon,
  getQuanTypeListByAppCommon,
  getSortPhoneByQuanTypeListCommon
} from "../common/cardQuanHelper";

const tokens = platTokens();
const { getQuanValueListByQuanFlag } = usesMachineBaseFun();

export default class SfcCardQuanManage {
  constructor(order, logger, orderManage = null) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
    this.isV3App = sfcV3AppList.includes(this.appFlag);
    this.usableCardList = [];
    this.curPhone = "";
    this.orderManage = orderManage;
  }

  /**
   * 获取券类型信息
   * @param {string} quan_value - 券类型值
   * @param {string} app_name - 影院标识
   * @returns {Promise<Object|Array|null>} 券类型信息或null
   */
  async getQuanInfo(quan_value, app_name) {
    return getQuanInfoCommon({ quan_value, app_name, logger: this.logger });
  }

  /**
   * 连续获取券
   * @param {Object} data - 参数对象
   * @param {string|number} data.city_id - 城市ID
   * @param {string|number} data.cinema_id - 影院ID
   * @param {string} data.session_id - 会话ID
   * @param {number} [data.page=1] - 页码
   * @param {Array} [data.quanData=[]] - 已获取的券数据
   * @param {Logger} data.logger - 日志实例
   * @returns {Promise<Array>} 券列表
   */
  async continuousGetQuan(data) {
    let {
      city_id,
      cinema_id,
      session_id,
      appFlag,
      quan_value,
      quan_flag,
      black_quans,
      ticket_num,
      targetNum,
      page = 1,
      quanData = [],
      logger
    } = data;
    const params = {
      city_id,
      cinema_id,
      session_id,
      page,
      status: 4
    };
    try {
      const res = await this.appApi.getQuanList(params);
      let quanList = res.data?.unused?.lists || [];
      let total_page = res.data?.unused?.total_page || 0;
      let targetQuanList = [];
      if (quan_value && quan_flag) {
        // 如果指定了券类型，则进行过滤
        targetQuanList = quanList.filter(
          item =>
            couponInfoSpecial(item.coupon_info) ===
              couponInfoSpecial(quan_flag) &&
            !black_quans?.includes(item.coupon_num)
        );
      } else {
        // 如果没有指定券类型（报价时获取所有券），则不过滤，直接使用所有券
        targetQuanList = quanList.filter(
          item => !black_quans?.includes(item.coupon_num)
        );
      }
      quanData.push(...targetQuanList);
      // 如果 targetNum 是 Infinity 或未指定，则只判断页数；否则判断页数和数量
      const shouldContinue =
        total_page > page &&
        (targetNum === undefined || targetNum === Infinity
          ? true
          : quanData.length < targetNum);
      if (shouldContinue) {
        let currentQuanNum = quanData?.length;
        logger?.infoSave("目标券列表数量不够，递归连续获取目标券", {
          ticket_num,
          targetNum,
          currentQuanNum
        });
        return await this.continuousGetQuan({
          ...data,
          page: page + 1,
          quanData
        });
      }
      // 如果 targetNum 是 Infinity 或未指定，返回所有券；否则限制数量
      const resultList =
        targetNum === undefined || targetNum === Infinity
          ? quanData
          : quanData?.slice(0, targetNum);
      return {
        list: resultList || []
      };
    } catch (error) {
      logger?.errorSave("连续获取目标券异常", { error });
      return { list: [] };
    }
  }

  /**
   * 获取优惠券列表
   * @param {Object} params - 参数对象
   * @param {string|number} params.city_id - 城市ID
   * @param {string|number} params.cinema_id - 影院ID
   * @param {string} params.session_id - 会话ID
   * @param {Logger} params.logger - 日志实例
   * @returns {Promise<Array>} 优惠券列表
   */
  async getQuanListByPhone({ city_id, cinema_id, session_id, logger }) {
    try {
      // 报价时获取所有券，不限制数量（类似原始 sfcOffer.js 的逻辑）
      const quanDataRes = await this.continuousGetQuan({
        city_id,
        cinema_id,
        session_id,
        appFlag: this.appFlag,
        targetNum: Infinity, // 不限制数量，获取所有券
        logger,
        quan_value: null, // 不进行券类型过滤，获取所有券
        quan_flag: null
      });
      const quanData = quanDataRes?.list || [];
      console.log("quanData", quanData);
      return quanData.map(item => ({
        ...item,
        endDateTime: item.validate_date_end // '2026.06.30'
      }));
    } catch (error) {
      logger?.errorSave("获取优惠券列表异常", { error: formatErrInfo(error) });
      return [];
    }
  }

  /**
   * 获取影院指定会员卡（出票用）
   * @param {string} cinema_id - 影院ID
   * @param {number} ticket_num - 票数
   * @returns {Promise<Array>} 可用卡列表
   */
  async getUsableCardList(cinema_id, ticket_num) {
    return getUsableCardListCommon({
      appFlag: this.appFlag,
      cinema_id,
      ticket_num,
      logger: this.logger
    });
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
    // quan_flag 在“按券类型排序手机号”这条路径上不参与排序规则，这里保留参数仅为兼容签名
    void quan_flag;
    return getSortPhoneByQuanTypeListCommon({
      app_name,
      quan_value,
      ticket_num,
      logger: this.logger
    });
  }

  /**
   * 使用卡或券（出票用）
   * @param {Object} params - 参数
   * @returns {Promise<Object>} { card_id, cardNum, quan_code, coupon_id, member_coupon_id, quanType, profit, priceInfo }
   */
  async useQuanOrCard(params) {
    const { appFlag, isV3App } = this;
    const {
      offerRule,
      currentParamsList,
      currentParamsInx,
      order,
      logger,
      curPhone,
      usableCardList
    } = params || {};
    // 记录当前出票手机号：异步绑券（getNewQuan asyncFlag=1）内更新库存时依赖此值，
    // 修复前 this.curPhone 从未赋值（恒为 ""），导致绑券后的库存修正被跳过
    this.curPhone = curPhone;
    let {
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      ticket_num,
      supplier_end_price,
      rewards,
      plat_name,
      order_number
    } = params;
    try {
      const { offer_type, member_price, real_member_price, offer_rule_id } =
        offerRule;
      const session_id = (currentParamsList || [])[currentParamsInx || 0]
        ?.session_id;
      const mobile = (currentParamsList || [])[currentParamsInx || 0]?.mobile;
      const useCardParams = {
        ...params,
        session_id,
        member_price,
        real_member_price,
        mobile
      };
      let is_auto_use_quan = false;
      let quanStock;
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
            logger?.infoSave(
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
          logger?.info("使用会员卡出票");
          if (!real_member_price) {
            logger?.errorSave("使用会员卡前从该订单报价记录里获取会员价异常");
            return { card_id: "", profit: 0 };
          }
          return await this.useCardHandle(useCardParams);
        }
      }

      if (offerRule.offer_type === "1" || is_auto_use_quan) {
        let quanValueList = offerRule.quan_value.split(",");
        logger?.infoSave("使用优惠券出票", { quanValueList });
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
            logger?.infoSave("根据券类型和券库存进行筛选", {
              canUseQuanTypeList
            });
            if (canUseQuanTypeList.length) {
              offerRule.quan_value = canUseQuanTypeList[0].quan_value;
            }
          }
          if (offerRule.quan_value.split(",").length > 1) {
            offerRule.old_quan_value = offerRule.quan_value;
            offerRule.quan_value = offerRule.quan_value.split(",")[0];
            logger?.infoSave("券类型容错处理：强制取第一个", {
              quan_value: offerRule.quan_value
            });
          }
        }
        const quanInfo = await this.getQuanInfo(offerRule.quan_value, appFlag);
        if (quanInfo) {
          offerRule.quan_id = quanInfo.id;
          offerRule.quan_cost = quanInfo.quan_cost;
          offerRule.quan_flag = quanInfo.quan_flag;
          offerRule.quan_fee = quanInfo.quan_fee;
          offerRule.is_store = quanInfo.is_store;
          offerRule.black_quans = quanInfo.black_quans;
          offerRule.quanStockList = quanInfo.quanStockList;
        }
        let {
          quan_value,
          quan_cost,
          quan_flag,
          quan_fee,
          is_store,
          black_quans
        } = offerRule;
        const quanRes = await this._getQuanListForPay({
          city_id,
          cinema_id,
          session_id,
          quan_value,
          quan_flag,
          black_quans,
          ticket_num,
          logger
        });
        let quanList = quanRes?.quanList || [];
        let quanType = quanRes?.quanType;
        quanStock = quanList.length || 0;
        if (!quanList?.length) {
          logger?.errorSave("个人中心获取目标券列表返回为空");
        }
        logger?.infoSave("获取优惠券列表返回", {
          quanList: quanList?.map(item => ({
            card_num: item.card_num || undefined,
            coupon_num: item.coupon_num,
            coupon_name: item.coupon_name,
            coupon_info: item.coupon_info,
            validate_date_end: item.validate_date_end
          }))
        });
        if (is_store == "1") {
          if (quanList?.length < ticket_num) {
            logger?.infoSave("用券前个人中心目标券不够，从服务端获取");
            let diffNum = Number(ticket_num) - quanList.length;
            const newQuanRes = await this.getNewQuan({
              city_id,
              cinema_id,
              quan_value: offerRule.quan_value,
              quan_flag: offerRule.quan_flag,
              session_id,
              black_quans,
              diffNum,
              quanNum: diffNum + 10,
              ticket_num
            });
            const newQuanList = newQuanRes?.bandQuanList || [];
            quanList = [...quanList, ...newQuanList];
            quanStock = quanList.length;
            logger?.infoSave("从服务端获取券绑定完成", {
              newQuanList,
              quanStock,
              ticket_num
            });
          } else {
            let quanStockList = offerRule.quanStockList
              ? JSON.parse(offerRule.quanStockList)
              : [];
            let targetInfo = quanStockList.find(
              itemA => itemA.phone === curPhone
            );
            quanStock = targetInfo?.quan_stock || quanStock;
          }
        }
        // 更新券库存
        // 参考其他系列（chenxing/jinyi/lma 等）：无论是否入库券，获取到目标券后都更新库存
        // 非入库券目标券不足时也要更新，否则出票失败走 return {} 后出票后更新不触发，库存仍为旧值
        this.updateQuanStock({
          quan_stock: quanStock,
          quan_value: offerRule.quan_value,
          quan_flag: offerRule.quan_flag,
          app_name: appFlag,
          phone: curPhone
        });
        if (quanList?.length < ticket_num) {
          logger?.errorSave(
            `目标券${is_store == "1" ? "从服务端获取后" : ""}数量不足`
          );
          if (is_auto_use_quan) {
            logger?.infoSave("灵活用券时获取目标券不足,转用卡处理");
            offerRule.quan_value = "";
            return await this.useCardHandle(useCardParams);
          }
          return {};
        }
        const { coupon_type, card_num } = quanList?.[0] || {};
        if (coupon_type) {
          quanType = card_num ? "online_member_quan" : "online_quan";
        } else {
          quanType = card_num ? "offline_member_quan" : "offline_quan";
        }
        let card_id, quan_code, coupon_id, member_coupon_id;
        if (quanType === "online_quan" || quan_fee > 0) {
          const cardList = await this.getCardList({
            city_id,
            cinema_id,
            session_id
          });
          if (cardList?.length) {
            let cardData = cardList.filter(
              item => item.balance * 100 >= quan_fee * 100 * ticket_num
            );
            if (!cardData?.length) {
              logger?.errorSave(
                `使用优惠券前发现没有可以支付券手续费的会员卡，${is_auto_use_quan ? ",灵活用券转用卡处理" : ""}`,
                { quan_fee, ticket_num, cardList }
              );
              if (is_auto_use_quan) {
                offerRule.quan_value = "";
                return await this.useCardHandle(useCardParams);
              }
              return { card_id: "", profit: 0 };
            }
            let cards = cardList.sort((a, b) => b.balance - a.balance);
            card_id = !isV3App ? cards[0]?.id : cards[0]?.member_id;
          }
        }
        const { useQuans, profit } = await this.useQuan({
          city_id,
          cinema_id,
          show_id,
          seat_ids,
          ticket_num,
          supplier_end_price,
          quanList,
          quan_value,
          quan_flag,
          rewards,
          session_id,
          black_quans,
          plat_name,
          order_number,
          quan_cost,
          quanStock,
          is_store
        });
        if (!useQuans.length && is_auto_use_quan) {
          logger?.infoSave("灵活用券使用目标券后为空,转用卡处理");
          offerRule.quan_value = "";
          return await this.useCardHandle(useCardParams);
        }
        if (quanType === "offline_quan") {
          quan_code = useQuans.map(item => item.coupon_num).join();
        } else if (["online_quan", "online_member_quan"].includes(quanType)) {
          coupon_id = useQuans.map(item => item.id).join();
        } else if (quanType === "offline_member_quan") {
          member_coupon_id = useQuans.map(item => item.id).join();
        }
        if (is_auto_use_quan) {
          offerRule.offer_type = "1";
        }
        return {
          quan_code,
          card_id,
          coupon_id,
          member_coupon_id,
          quanType,
          profit,
          quanStock
        };
      }
    } catch (error) {
      logger?.errorSave("使用优惠券或者会员卡异常", { error });
      return { card_id: "", quan_code: "", profit: 0 };
    }
  }

  async getQuanTypeListByApp({ appFlag: app_name, mobile }) {
    return getQuanTypeListByAppCommon({
      app_name,
      mobile,
      logger: this.logger
    });
  }

  async _getQuanListForPay({
    city_id,
    cinema_id,
    session_id,
    quan_value,
    quan_flag,
    black_quans,
    ticket_num,
    logger
  }) {
    try {
      const targetNum = (ticket_num || 0) + 10;
      let targetQuanList = [];
      const params = { city_id, cinema_id, session_id, page: 1, status: 4 };
      logger?.infoSave("获取优惠券列表参数", { params });
      const res = await this.appApi.getQuanList(params);
      const all = res?.data?.unused?.lists || [];
      const total = res?.data?.unused?.total_page || 0;
      logger?.infoSave("获取优惠券列表返回", {
        quanList: all?.map(item => ({
          card_num: item.card_num || undefined,
          coupon_num: item.coupon_num,
          coupon_name: item.coupon_name,
          coupon_info: item.coupon_info,
          validate_date_end: item.validate_date_end
        }))
      });
      if (quan_value && quan_flag) {
        targetQuanList = all.filter(
          i =>
            couponInfoSpecial(i.coupon_info) === couponInfoSpecial(quan_flag) &&
            !(black_quans || []).includes(i.coupon_num)
        );
      }
      if (total > 1 && targetQuanList.length < targetNum) {
        let currentQuanNum = targetQuanList?.length;
        logger?.infoSave("目标券列表数量不够，开始连续获取目标券", {
          ticket_num,
          targetNum,
          currentQuanNum
        });
        const quanDataRes = await this.continuousGetQuan({
          city_id,
          cinema_id,
          session_id,
          appFlag: this.appFlag,
          quan_value,
          quan_flag,
          black_quans,
          ticket_num,
          targetNum: targetNum - targetQuanList.length,
          page: 2,
          quanData: [],
          logger
        });
        let list = quanDataRes?.list || [];
        targetQuanList.push(...list);
      }
      const { coupon_type, card_num } = targetQuanList?.[0] || {};
      let quanType;
      if (coupon_type) {
        quanType = card_num ? "online_member_quan" : "online_quan";
      } else {
        quanType = card_num ? "offline_member_quan" : "offline_quan";
      }
      if (["offline_member_quan", "online_member_quan"].includes(quanType)) {
        const groupedCoupons = targetQuanList.reduce((groups, coupon) => {
          const key = coupon.card_num;
          if (!groups[key]) groups[key] = [];
          groups[key].push(coupon);
          return groups;
        }, {});
        let groupList = Object.values(groupedCoupons);
        let targetQuanGroup = groupList.find(item => item.length >= ticket_num);
        logger?.infoSave("会员赠券按照card_num分组", {
          groupedCoupons,
          targetQuanGroup
        });
        targetQuanList = targetQuanGroup?.slice(0, ticket_num) || [];
        if (!targetQuanList?.length) {
          logger?.infoSave("会员赠券数量不够出票");
        }
      }
      return { quanList: targetQuanList, quanType };
    } catch (e) {
      logger?.errorSave("_getQuanListForPay异常", { error: formatErrInfo(e) });
      return { quanList: [], quanType: "offline_quan" };
    }
  }

  async getCardList({ city_id, cinema_id, session_id }) {
    try {
      let api = this.appApi.getCardList;
      if (
        this.isV3App &&
        typeof this.appApi.getCardAndQuanList === "function"
      ) {
        api = this.appApi.getCardAndQuanList;
      }
      const res = await api?.({ city_id, cinema_id, session_id });
      let list = res?.data?.card_data || [];
      if (this.isV3App && res?.data?.member_info) list = [res.data.member_info];

      // 同步实时余额到 SV 数据库（非阻塞，失败不影响主流程）
      syncCardBalanceToSv({
        appFlag: this.appFlag,
        cardList: list,
        logger: this.logger,
        getCardNum: item => (this.isV3App ? item.member_id : item.card_num),
        getBalance: item => item.balance,
        balanceDivisor: 1
      }).catch(e => this.logger.warn?.("同步SFC卡余额异常(不影响主流程)", e));

      if (!this.isV3App && (this.usableCardList || []).length) {
        list = list.filter(i =>
          (this.usableCardList || []).some(c => c.card_num === i.card_num)
        );
      }
      return list;
    } catch (e) {
      this.logger.errorSave("getCardList异常", { error: formatErrInfo(e) });
      return [];
    }
  }

  async useCardHandle(data) {
    const {
      city_id,
      cinema_id,
      session_id,
      supplier_end_price,
      ticket_num,
      show_id,
      seat_ids,
      member_price,
      real_member_price,
      rewards,
      mobile,
      plat_name
    } = data || {};
    try {
      const cardList = await this.getCardList({
        city_id,
        cinema_id,
        session_id
      });
      if (!cardList?.length) {
        this.logger.errorSave("获取会员卡列表为空");
        return { card_id: "", profit: 0, priceInfo: null };
      }
      const member_total_price = (real_member_price || 0) * (ticket_num || 0);
      const { card_id, cardNum, profit, priceInfo } =
        (await this.useCard?.({
          member_total_price,
          cardList,
          supplier_end_price,
          ticket_num,
          city_id,
          cinema_id,
          show_id,
          seat_ids,
          member_price,
          real_member_price,
          rewards,
          session_id,
          mobile,
          plat_name
        })) || {};
      return {
        card_id: card_id || "",
        cardNum,
        profit: profit || 0,
        priceInfo,
        cardList
      };
    } catch (e) {
      this.logger.errorSave("useCardHandle异常", { error: formatErrInfo(e) });
      return { card_id: "", profit: 0, priceInfo: null, cardList: [] };
    }
  }

  async useCard(params) {
    const {
      member_total_price,
      cardList,
      supplier_end_price,
      ticket_num,
      city_id,
      cinema_id,
      show_id,
      seat_ids,
      member_price,
      real_member_price,
      rewards,
      session_id,
      mobile,
      plat_name
    } = params || {};
    const list = (cardList || []).filter(
      i => (i.balance || 0) >= (member_total_price || 0)
    );
    if (!list.length) {
      this.logger.errorSave("会员卡余额不足", {
        member_total_price,
        real_member_price,
        ticket_num
      });
      return { card_id: "", profit: 0 };
    }
    const sorted = list.slice().sort((a, b) => {
      // if (a.default_card === "1" && b.default_card !== "1") return -1;
      // if (a.default_card !== "1" && b.default_card === "1") return 1;
      return (b.balance || 0) - (a.balance || 0);
    });
    let card_id = "";
    let cardNum = "";
    let priceInfo = null;
    if (!this.isV3App) {
      for (let i = 0; i < sorted.length; i++) {
        const card = sorted[i];
        const priceRes = this.orderManage
          ? await this.orderManage.priceCalculation({
              city_id,
              cinema_id,
              show_id,
              seat_ids,
              card_id: card.id,
              session_id,
              is_first: i == 0 ? "1" : "0",
              appFlag: this.appFlag
            })
          : null;
        const price = priceRes?.defaultCardPrice || priceRes?.price;
        if (
          price &&
          Number(price?.total_price || 0) * 1000 <=
            (real_member_price || 0) * 1000 * ticket_num
        ) {
          card_id = card.id;
          cardNum = card.card_num;
          priceInfo = price;
          break;
        }
      }
      if (!priceInfo) return { card_id: "", profit: 0 };
    } else {
      card_id = sorted[0]?.member_id;
      cardNum = sorted[0]?.member_id;
    }
    // 手续费（统一走 getPlatFeeRate，支持守兔按 needInvoice 分档）
    const feeRate = getPlatFeeRate(this.order);
    let shouxufei = mulDecimal(Number(supplier_end_price || 0), feeRate);
    let profit = (supplier_end_price || 0) - (member_price || 0) - shouxufei;
    profit = Number(profit) * (ticket_num || 0);
    if (rewards > 0) {
      const rewardPrice =
        (Number(supplier_end_price || 0) *
          100 *
          Number(ticket_num || 0) *
          rewards) /
        10000;
      profit += rewardPrice;
    }
    profit = Number(profit).toFixed(2);
    if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
      this.logger.errorSave("使用会员卡计算价格后最终利润为负", {
        profit
      });
      return { card_id: "", profit: 0 };
    }
    return { card_id, cardNum, profit, priceInfo, cardList };
  }

  /**
   * 获取新券并绑定（出票用）
   * @param {Object} params - 参数对象
   * @returns {Promise<Object>} { bandQuanList, newQuanNums }
   */
  async getNewQuan({
    quan_value,
    quan_flag,
    quanNum,
    diffNum = 0,
    city_id,
    cinema_id,
    session_id,
    black_quans,
    asyncFlag,
    plat_name,
    order_number,
    quanStock,
    ticket_num
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
    let quanValueListStr = await getQuanValueListByQuanFlag({
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
      if (black_quans) params.black_quans = black_quans;
      let quanRes = await svApi.queryQuanList(params);
      targetLogger.infoSave(`${conPrev}从服务端获取券返回`, {
        quanRes,
        quanNum,
        quan_value,
        params
      });
      let quanList = quanRes?.data?.quanList || [];
      if (asyncFlag != 1 && (!quanList?.length || quanList?.length < diffNum)) {
        targetLogger.error(`数据库${quan_value}面额券不足`);
        return;
      }
      let bandQuanList = [];
      for (const quan of quanList) {
        targetLogger.info(`正在尝试绑定券 ${quan.coupon_num}...`);
        const couponNumRes = await this.bandQuan({
          city_id,
          cinema_id,
          session_id,
          coupon_num: quan.coupon_num,
          quan_value,
          appFlag
        });
        const coupon_num = couponNumRes?.coupon_num;
        targetLogger.infoSave(`${conPrev}绑定券返回`, couponNumRes);
        if (couponNumRes?.errMsg) {
          targetLogger.errorSave(`${conPrev}绑定券异常`, couponNumRes);
        }
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
        if (diffNum && bandQuanList.length >= diffNum) break;
      }
      if (asyncFlag === 1 && ticket_num) {
        this.updateQuanStock({
          quan_stock: quanStock - ticket_num + bandQuanList.length,
          quan_value,
          quan_flag,
          app_name: appFlag,
          phone: this.curPhone
        });
      }
      return { bandQuanList, newQuanNums: quanList.length };
    } catch (error) {
      targetLogger.errorSave(`${conPrev}获取新券异常`, {
        error,
        quanNum,
        quan_value,
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
   * @returns {Promise<Object>} { coupon_num } 或 { errMsg }
   */
  async bandQuan({
    city_id,
    cinema_id,
    session_id,
    coupon_num,
    quan_value,
    appFlag
  }) {
    let params = {
      city_id,
      cinema_id,
      session_id,
      coupon_code: coupon_num,
      from_goods: "2"
    };
    try {
      await mockDelay(1);
      const res = await this.appApi.bandQuan(params);
      if (res.data?.success === "1") {
        return { coupon_num, params };
      } else {
        console.error("绑定新券异常", res);
        return { errMsg: "绑定新券异常:" + JSON.stringify(res), params };
      }
    } catch (error) {
      console.error("绑定新券异常", error);
      return { error, errMsg: "绑定新券异常:" + JSON.stringify(params) };
    }
  }

  /**
   * 使用优惠券
   * @param {Object} params - 参数对象
   * @returns {Promise<Object>} { useQuans, profit }
   */
  async useQuan({
    city_id,
    cinema_id,
    ticket_num,
    supplier_end_price,
    quanList,
    quan_value,
    quan_flag,
    rewards,
    session_id,
    black_quans,
    plat_name,
    order_number,
    quan_cost,
    quanStock,
    is_store
  }) {
    try {
      let targetQuanList = quanList || [];
      if (targetQuanList?.length - ticket_num < 10 && is_store == "1") {
        this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
        this.getNewQuan({
          city_id,
          cinema_id,
          quan_value,
          quan_flag,
          session_id,
          black_quans,
          quanNum: 10 - (targetQuanList.length - Number(ticket_num)),
          asyncFlag: 1,
          asyncBandQuanList: [],
          plat_name,
          order_number,
          quanStock,
          ticket_num
        });
      }
      let useQuans = targetQuanList.filter((item, index) => index < ticket_num);
      let profit = 0;
      // 手续费（统一走 getPlatFeeRate，支持守兔按 needInvoice 分档）
      const feeRate = getPlatFeeRate(this.order);
      let shouxufei = mulDecimal(Number(supplier_end_price || 0), feeRate);
      profit = Number(supplier_end_price) - quan_cost - shouxufei;
      profit = profit * (useQuans.length || 0);
      if (rewards > 0) {
        let rewardPrice =
          (Number(supplier_end_price) * 100 * Number(ticket_num) * rewards) /
          10000;
        profit += rewardPrice;
      }
      if (profit < 0 && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        this.logger.errorSave("使用优惠券计算价格后最终利润为负");
        return { profit: 0, useQuans: [] };
      }
      profit = profit.toFixed(2);
      return { profit, useQuans };
    } catch (error) {
      this.logger.errorSave("使用优惠券异常", { error });
      return { profit: 0, useQuans: [] };
    }
  }

  /**
   * 更新券库存（出票用）
   * 与其他系列（chenxing/jinyi/wanda 等）保持一致：
   * - 入参 quan_stock 为直接写入的新库存值
   * - phone 不存在时新增记录
   * - 收集 updateList 后批量落库 + 统一触发一次猎人规则同步（singleUpdateQuanStock 已废弃删除，改用批量版）
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
    let targetQuanList = await this.getTargetQuanByApp(app_name, quan_flag);
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
}
