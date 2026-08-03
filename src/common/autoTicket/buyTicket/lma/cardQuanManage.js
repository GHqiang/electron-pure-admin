/**
 * LMA卡券管理模块
 *
 * 职责：
 * - 会员卡使用：获取卡列表、切换卡、检查余额和出票量限制
 * - 优惠券使用：获取券列表、过滤可用券、绑定券、更新券库存
 *
 * 所属流程：报价流程、出票流程
 *
 * 依赖模块：无（独立模块）
 *
 * @module lma/cardQuanManage
 */
import {
  formatErrInfo,
  getCurrentTime,
  formatTimeOfTime,
  getCurrentDay,
  isDateInCurrentMonth,
  couponInfoSpecial,
  getCinemaLoginInfoList,
  mockDelay
} from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import { GET_APP_INFO, NO_FEE_PLAT_LIST } from "@/common/constant";
import svApi from "@/api/sv-api";
import Logger from "@/common/logger";
import { platTokens } from "@/store/platTokens";
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";
import { batchUpdateQuanStockWithSync } from "@/common/autoTicket/commonQuanStock.js";
import { syncCardBalanceToSv } from "@/common/autoTicket/buyTicket/common/cardBalanceSync";

const tokens = platTokens();
const { getQuanValueListByQuanFlag } = usesMachineBaseFun();

export default class LmaCardQuanManage {
  constructor(order, logger) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
  }

  /**
   * 使用会员卡（LMA特殊逻辑：分离的useCardHandle）
   *
   * @param {Object} params - 参数对象
   * @param {string|number} params.city_id - 城市ID
   * @param {string|number} params.cinema_id - 影院ID
   * @param {number} params.ticket_num - 票数
   * @param {number} params.supplier_end_price - 中标价
   * @param {Object} params.offerRule - 报价规则
   * @param {string|number} params.offerRule.real_member_price - 真实会员价
   * @param {number} params.offerRule.quan_fee - 券手续费（offer_type="1"时）
   * @param {string} params.offerRule.offer_type - 报价类型
   * @param {Array} params.currentParamsList - 当前登录参数列表
   * @param {number} params.currentParamsInx - 当前登录参数索引
   *
   * @returns {Promise<Object>} 用卡结果：
   *   - card_id: 使用的卡号，失败返回空字符串
   *   - card_balance: 卡余额
   */
  async useCardHandle({
    city_id,
    cinema_id,
    ticket_num,
    supplier_end_price,
    offerRule,
    currentParamsList,
    currentParamsInx
  }) {
    const { appFlag } = this;
    try {
      const { real_member_price, quan_fee, offer_type } = offerRule;
      let currentParams = currentParamsList[currentParamsInx];
      const { lmaToken } = currentParams;
      console.log("使用会员卡出票");
      console.log("报价记录里的会员价", real_member_price);
      if (!real_member_price && offer_type != "1") {
        this.logger.errorSave("使用优惠券或者会员卡前获取会员价异常");
        return {
          card_id: ""
        };
      }

      // 1、获取会员卡列表
      const cardListRes = await this.getCardList({
        lmaToken,
        appFlag
      });
      let cardList = cardListRes?.cardList || [];
      if (!cardList?.length) {
        this.logger.errorSave("获取会员卡列表异常", cardListRes);
        return {
          card_id: ""
        };
      }
      let activeCard = cardList[0]; //第一个为活跃卡

      // 获取影院维护的可用卡列表
      const usableCardList = await this.getUsableCardList(
        cinema_id,
        ticket_num
      );
      if (usableCardList?.length) {
        cardList = cardList.filter(item =>
          usableCardList.some(itemA => itemA.card_num === item.card_number)
        );
      } else {
        this.logger.errorSave("可用卡过滤后无可用卡");
        return {
          card_id: ""
        };
      }

      // 判断活跃卡出票量是否达标
      if (
        !cardList.find(item => item.card_number === activeCard?.card_number)
      ) {
        this.logger.infoSave("当前活跃卡出票量已达标", { activeCard });
        activeCard = null;
      }

      // 非活跃卡列表
      let otherCardList = cardList.filter(
        item => item.card_number !== activeCard?.card_number
      );

      // 2、使用会员卡
      let member_total_price = (real_member_price * 100 * ticket_num) / 100;
      if (quan_fee && offerRule.offer_type === "1") {
        member_total_price = (quan_fee || 0) * ticket_num;
      }

      const { card_id, card_balance } = await this.useCard({
        member_total_price,
        activeCard,
        otherCardList,
        supplier_end_price,
        ticket_num,
        lmaToken
      });

      return {
        card_id,
        card_balance
      };
    } catch (error) {
      this.logger.errorSave("用卡处理异常", { error: formatErrInfo(error) });
      return {
        card_id: ""
      };
    }
  }

  // 使用会员卡
  async useCard({
    member_total_price,
    activeCard,
    otherCardList,
    supplier_end_price,
    ticket_num,
    lmaToken
  }) {
    const { appFlag } = this;
    try {
      if (activeCard) {
        if (activeCard.money_str < Number(member_total_price)) {
          this.logger.infoSave("当前活跃卡余额不足,准备换卡", {
            activeCard,
            otherCardList,
            member_total_price
          });
        } else {
          this.logger.infoSave("当前活跃卡余额足够", activeCard);
          return {
            card_id: activeCard.card_number,
            card_balance: activeCard.money_str
          };
        }
      }

      let card_id, card_balance;
      // 开始尝试使用卡并获取成功使用的卡的结果
      for (const card of otherCardList) {
        this.logger.infoSave(`正在尝试使用卡 ${card.card_number}`);
        const changeCardRes = await this.changeCardHandle({
          card_number: card.card_number,
          lmaToken,
          appFlag
        });
        if (changeCardRes?.error) {
          this.logger.errorSave("尝试换卡时异常", {
            error: changeCardRes?.error
          });
          continue;
        }
        const { money_str } = changeCardRes?.data || {};
        if (money_str < Number(member_total_price)) {
          let str = "换卡后卡余额不足,准备继续换卡";
          this.logger.infoSave(str, { changeCardRes });
          continue;
        } else {
          this.logger.infoSave("换卡成功", {
            card_number: card.card_number,
            money_str
          });
          card_id = card.card_number;
          card_balance = money_str;
          console.log("卡使用成功，返回结果并停止尝试。");
          break;
        }
      }

      if (!card_id) {
        this.logger.errorSave("所有会员卡尝试均失败");
        return {
          card_id: ""
        };
      }

      return {
        card_id,
        card_balance
      };
    } catch (error) {
      this.logger.errorSave("使用会员卡异常", { error });
      return {
        card_id: ""
      };
    }
  }

  // 切换卡
  async changeCardHandle({ card_number, lmaToken, appFlag }) {
    try {
      let params = {
        card_number,
        lmaToken
      };
      this.logger.infoSave("切换卡参数", params);
      const res = await this.appApi.changeCard(params);
      this.logger.infoSave("切换卡返回", res);
      return res;
    } catch (error) {
      this.logger.errorSave("切换卡异常", { error });
      return {
        error
      };
    }
  }

  // 获取会员卡列表
  async getCardList({ lmaToken, appFlag }) {
    try {
      let params = {
        lmaToken
      };
      this.logger.infoSave("获取会员卡列表参数", params);
      const res = await this.appApi.getCardList(params);
      this.logger.infoSave("获取会员卡列表返回", res);
      // 注意：LMA API 返回的字段名为 sleep（休眠/非活跃卡列表），这是 API 的原始字段名
      let cardList = res.data?.sleep || [];
      // 头部插入，第一个为活跃卡
      cardList.unshift({
        card_number: res.data?.card_number,
        gold: res.data?.gold,
        money_str: res.data?.money_str
      });

      // 同步实时余额到 SV 数据库（非阻塞，失败不影响主流程）
      // LMA money_str 格式如 "￥123.45"，需提取数字
      syncCardBalanceToSv({
        appFlag: this.appFlag,
        cardList,
        logger: this.logger,
        getCardNum: item => item.card_number,
        getBalance: item => {
          if (!item.money_str) return null;
          const num = parseFloat(item.money_str.replace(/[^\d.]/g, ""));
          return isNaN(num) ? null : num;
        },
        balanceDivisor: 1
      }).catch(e => this.logger.warn?.("同步LMA卡余额异常(不影响主流程)", e));

      return {
        cardList,
        cardRes: res.data,
        params
      };
    } catch (error) {
      this.logger.errorSave("获取会员卡列表异常", { error });
      return {
        error
      };
    }
  }

  // 获取影院指定会员卡
  async getUsableCardList(cinema_id, ticket_num) {
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
        daily_usage:
          item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0,
        month_usage: !isDateInCurrentMonth(item.usage_date)
          ? 0
          : item.monthly_usage || 0
      }));
      this.logger.infoSave("获取会员卡维护列表返回", { list });

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
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinema_id);
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
      this.logger.errorSave("获取会员卡维护列表异常", { error });
      return [];
    }
  }

  /**
   * 使用优惠券（LMA特殊逻辑：分离的useQuanHandle）
   *
   * @param {Object} params - 参数对象
   * @param {string|number} params.city_id - 城市ID
   * @param {string|number} params.cinema_id - 影院ID
   * @param {number} params.ticket_num - 票数
   * @param {Object} params.offerRule - 报价规则
   * @param {string|number} params.show_id - 场次ID
   * @param {Array} params.seat_arr - 座位数组
   * @param {number} params.supplier_end_price - 中标价
   * @param {number} params.rewards - 奖励百分比
   * @param {string} params.plat_name - 平台名称
   * @param {string} params.order_number - 订单号
   * @param {Array} params.currentParamsList - 当前登录参数列表
   * @param {number} params.currentParamsInx - 当前登录参数索引
   *
   * @returns {Promise<Object>} 用券结果：
   *   - quan_code: 券码JSON字符串，失败返回空字符串或包含error字段
   *   - quanStock: 券库存数
   *   - error: 错误信息（失败时）
   */
  async useQuanHandle({
    city_id,
    cinema_id,
    ticket_num,
    offerRule,
    show_id,
    seat_arr,
    supplier_end_price,
    rewards,
    plat_name,
    order_number,
    currentParamsList,
    currentParamsInx
  }) {
    const { appFlag } = this;
    try {
      let { offer_type, quan_value, real_member_price } = offerRule;
      let currentParams = currentParamsList[currentParamsInx];
      const { lmaToken, mobile } = currentParams;

      // 拿订单号去匹配报价记录
      if (offer_type !== "1") {
        let lmaIsUseQuanValue = window.localStorage.getItem("lmaIsUseQuan");
        let lmaIsUseQuan = lmaIsUseQuanValue == 1 && real_member_price >= 33;
        if (!lmaIsUseQuan) return {};
        // 只判断价格是否大于33，如果大于就用券
        quan_value = "lma-5";
      }

      let quanValueList = offerRule.quan_value.split(",");
      this.logger.infoSave("使用优惠券出票", { quanValueList });

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
      const { quan_cost, quan_flag, quan_fee, is_store, black_quans } =
        quanInfo || {};
      offerRule.quan_cost = quan_cost;
      offerRule.quan_flag = quan_flag;
      offerRule.quan_fee = quan_fee;
      offerRule.is_store = is_store;
      offerRule.black_quans = black_quans;

      // 查询最近用券记录
      const usedQuanList = await this.queryUsedQuanList({
        app_name: appFlag
      });
      this.logger.infoSave("查询最近用券记录返回", { usedQuanList });

      // 连续获取目标券
      const quanListRes = await this.continuousGetQuanForUse({
        lmaToken,
        appFlag,
        quan_flag,
        black_quans,
        usedQuanList
      });
      this.logger.infoSave("连续获取优惠券列表返回", quanListRes);
      let quanList = quanListRes?.quanList || [];
      let quanStock = quanList?.length || 0; // 券库存数

      if (quanListRes?.error) {
        this.logger.errorSave("获取优惠券列表异常", {
          error: quanListRes?.error
        });
        return { error: "获取优惠券列表异常" };
      }

      // 优先使用快过期的券
      let targetQuanList =
        quanList
          .sort((a, b) => +new Date(a.endDateTime) - new Date(b.endDateTime))
          .map(item => ({ code: item.code })) || [];

      let isGetNewQuan = false;
      if (is_store == "1") {
        if (targetQuanList.length < ticket_num) {
          let diffNum = Number(ticket_num) - targetQuanList.length;
          isGetNewQuan = true;
          this.logger.infoSave("用券前个人中心目标券不够，从服务端获取");
          let newQuanList = await this.getNewQuan({
            quan_value: offerRule.quan_value,
            quan_flag,
            lmaToken,
            black_quans,
            diffNum,
            quanNum: diffNum + 5
          });
          // 多查询几张绑定防止有绑券异常导致出票失败情况
          if (newQuanList?.length) {
            // 转换为相同格式
            newQuanList = newQuanList.map(item => ({
              code: item.coupon_num
            }));
            targetQuanList = [
              ...targetQuanList,
              ...newQuanList.slice(0, diffNum)
            ];
            quanStock = targetQuanList.length;
            this.logger.infoSave("从服务端获取券绑定完成", {
              newQuanList,
              targetQuanList,
              ticket_num
            });
          }
        }
      }
      // 更新本地已绑定的券库存
      // 参考其他系列（chenxing/jinyi 等）：无论是否入库券，获取到目标券后都更新库存
      // 非入库券（is_store != "1"）在目标券不足时也需要把库存更新为实际获取到的数量（含 0）
      this.updateQuanStock({
        quan_stock: quanStock, // 直接传过去券库存
        quan_value: offerRule.quan_value,
        quan_flag: offerRule.quan_flag,
        app_name: appFlag,
        phone: currentParams.mobile
      });

      if (targetQuanList?.length < ticket_num) {
        let quanDiffMsg = isGetNewQuan
          ? "目标券从数据库获取后仍不足"
          : "目标券不足";
        this.logger.errorSave(quanDiffMsg, { targetQuanList });
        return { error: quanDiffMsg };
      }

      if (targetQuanList?.length - ticket_num < 10 && is_store == "1") {
        this.logger.infoSave("本次出票后券小于10，开始异步绑定券");
        this.getNewQuan({
          quan_value: offerRule.quan_value,
          quan_flag,
          ticket_num,
          lmaToken,
          black_quans,
          quanNum: 10 - (targetQuanList.length - Number(ticket_num)),
          asyncFlag: 1,
          plat_name,
          order_number
        });
      }

      targetQuanList = targetQuanList.slice(0, ticket_num);
      return {
        quan_code: targetQuanList?.length ? JSON.stringify(targetQuanList) : "",
        quanStock
      };
    } catch (error) {
      this.logger.errorSave("使用优惠券或者会员卡异常", { error });
      return {
        error: formatErrInfo(error)
      };
    }
  }

  // 连续获取目标券（用于出票）
  async continuousGetQuanForUse(data) {
    let {
      page = 1,
      lmaToken,
      appFlag,
      quan_flag,
      black_quans,
      usedQuanList,
      quanData = []
    } = data;
    const params = {
      type: 1,
      page, // 固定1页10条
      lmaToken
    };
    try {
      const res = await this.appApi.getQuanList(params);
      let quanList = res.data || [];
      let targetQuanList = quanList.filter(
        item =>
          couponInfoSpecial(item.voucher_name) ===
            couponInfoSpecial(quan_flag) &&
          !black_quans?.includes(item.code) &&
          !usedQuanList.some(itemA => itemA.quan_code?.includes(item.code))
      );
      quanData.push(...targetQuanList);
      // 1页10条
      if (quanList.length == 10) {
        // 如果总数量仍小于所需数量，则继续获取下一页
        return await this.continuousGetQuanForUse({
          ...data,
          page: page + 1,
          quanData
        });
      }
      // 先控制只返回目标券数量
      return {
        quanList: quanData.map(item => ({
          code: item.code,
          endDateTime: item.expire_time?.split(" ")?.[1] // "有效期至 2026-01-22"
        }))
      };
    } catch (error) {
      this.logger.errorSave("连续获取目标券异常", { error });
      return { error };
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
      this.logger.errorSave("获取券类型信息异常", { error });
      return null;
    }
  }

  // 获取影院券类型列表
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

  // 查询最近用券记录返回
  async queryUsedQuanList({ app_name }) {
    const params = {
      order_status: "1",
      app_name,
      rule: tokens.userInfo.rule,
      start_time: formatTimeOfTime(+new Date() - 3 * 24 * 60 * 60 * 1000),
      end_time: getCurrentTime()
    };
    try {
      const res = await svApi.queryUsedQuanList(params);
      let usedQuanList = res.data?.usedQuanList || [];
      // 过滤出来确定用券的，因为卡也用券
      usedQuanList = usedQuanList.filter(item => item.quan_code);
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

  // 连续获取券
  async continuousGetQuan(data) {
    let { session_id, page = 1, quanData = [] } = data;
    let params = {
      type: 1,
      page, // 固定1页10条
      lmaToken: session_id
    };
    try {
      const res = await this.appApi.getQuanList(params);
      console.log("获取优惠券列表返回", res);
      let quanList = res.data || [];
      quanData.push(...quanList);
      if (quanList.length == 10) {
        // 继续获取下一页
        return await this.continuousGetQuan({
          ...data,
          page: page + 1,
          quanData
        });
      }
      return quanData.map(item => ({
        coupon_info: item.voucher_name,
        coupon_num: item.code,
        expire_time: item.expire_time // "有效期至 2026-01-22"
      }));
    } catch (error) {
      console.warn("连续获取券失败", error);
      this.logger.errorSave("连续获取券异常", { error, params });
      return [];
    }
  }

  /**
   * 获取优惠券列表（LMA特殊：连续获取）
   *
   * @param {Object} params - 参数对象
   * @param {string} params.session_id - 登录session_id（lmaToken）
   * @param {Object} [params.logger] - 日志实例（可选）
   *
   * @returns {Promise<Array>} 优惠券列表，每个元素包含：
   *   - coupon_info: 券名称
   *   - coupon_num: 券码
   *   - expire_time: 有效期
   *   - endDateTime: 到期日期时间
   */
  async getQuanListByPhone({ session_id, logger }) {
    try {
      const quanData = await this.continuousGetQuan({
        session_id,
        logger: logger || this.logger
      });
      console.log("quanData", quanData);
      return quanData.map(item => ({
        ...item,
        endDateTime: item.expire_time?.split(" ")?.[1] // "有效期至 2026-01-22"
      }));
    } catch (error) {
      (logger || this.logger).errorSave("获取优惠券列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  // 更新券库存
  async updateQuanStock(params) {
    const { quan_stock, quan_flag, phone, app_name, quan_value, isPay } =
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

  // 获取新券
  async getNewQuan({
    quan_value,
    quan_flag,
    ticket_num,
    quanNum, // 同步绑券diffNum+5或者是异步绑券券数
    diffNum = 0, // 距离出票差的券数
    lmaToken,
    asyncFlag,
    black_quans,
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
        diffNum,
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
          coupon_num: quan.coupon_num,
          lmaToken
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
        // 绑券数量达标跳出循环
        if (diffNum && bandQuanList.length >= diffNum) {
          break;
        }
      }
      return bandQuanList;
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

  // 绑定券
  async bandQuan({ coupon_num, lmaToken }) {
    // 由于要用二线城市影院且40券通用，故写死
    let params = {
      lmaToken,
      code: coupon_num,
      channel_type: "2"
    };
    try {
      await mockDelay(1);
      const res = await this.appApi.bandQuan(params);
      // console.log("res", res);
      // {
      //   "data":{
      //     "status": "0",
      //     "color":"6",
      //     "voucher_name":"5元影慕满减券",
      //     "code":"9999980193913910",
      //     "code_title": "NO. 9999 980l 9391 3910",
      //     "expire time": "有效期至 2024-10-31",
      //   },
      //   "status": true,
      //   "code":"0"
      //   "alert":{},
      //   "msg":"添加成功!",
      //   "time":"2024-10-24 19:04:44"
      // }
      if (res.data?.code && res.msg?.includes("添加成功")) {
        return {
          coupon_num
        };
      } else {
        console.error("绑定新券异常", res);
        return {
          errMsg: "绑定新券异常:" + JSON.stringify(res)
        };
      }
    } catch (error) {
      console.error("绑定新券异常", error);
      return {
        error,
        errMsg: "绑定新券异常:" + JSON.stringify(params)
      };
    }
  }
  // 更新月使用量限制
  async updateMonthlyLimit(order, card_id) {
    try {
      const { app_name, plat_name, order_number, ticket_num } = order;
      const res = await svApi.queryCardList({
        app_name: app_name,
        rule: tokens.userInfo.rule,
        status: "1",
        isNeedTotalNum: 0,
        queryFields:
          "card_num,card_id,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
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
      const teagerCard = list.find(item => item.card_id === card_id);
      if (teagerCard) {
        this.logger.infoSave("超出时更新卡使用量目标卡信息", teagerCard);
        const min_usage = (teagerCard.use_limit_month || 20) - ticket_num;
        const max_num = Math.max(min_usage, teagerCard.month_usage || 0);
        let add_count = max_num - (teagerCard.month_usage || 0) + 1;
        this.logger.infoSave("超出时更新卡使用量", { add_count });
        if (add_count > 0) {
          await this.updateCardDayUse({
            app_name,
            card_id,
            plat_name,
            order_number,
            add_count: ticket_num,
            month_usage_update: (teagerCard.month_usage || 0) + add_count // 月量更新值
          });
        }
      } else {
        this.logger.infoSave("超出更新卡使用量时未查到目标卡", { card_id });
      }
    } catch (error) {
      this.logger.errorSave("超出更新卡使用量异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 更新卡日使用量
  async updateCardDayUse({
    app_name,
    card_id,
    plat_name,
    order_number,
    add_count,
    month_usage_update
  }) {
    let logger = new Logger({ logType: 3 });
    try {
      const res = await svApi.updateDayUsage({
        app_name: app_name,
        card_id: card_id,
        add_count,
        plat_name,
        month_usage_update
      });
      logger.infoSave("订单用卡购买后更新当天使用量成功", {
        app_name,
        card_id,
        res
      });
    } catch (error) {
      logger.errorSave("订单用卡购买后更新当天使用量失败", {
        app_name,
        card_id,
        error
      });
    }
    logger.init({
      plat_name,
      app_name,
      order_number
    });
    // 上送更新卡当天使用量日志
    logger.logUpload();
  }
}
