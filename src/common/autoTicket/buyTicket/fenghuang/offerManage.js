/**
 * 凤凰报价管理模块
 *
 * 职责：
 * - 继承 BaseOfferPrice 基类，实现凤凰系列报价逻辑
 * - 报价规则匹配、会员价获取、成本价计算、最终报价计算
 *
 * 所属流程：报价流程
 *
 * 依赖模块：
 * - BaseOfferPrice: 报价基类，提供模板方法
 * - CardQuanManage: 卡券管理模块
 * - CinemaManage: 影院管理模块
 * - SeatManage: 座位管理模块
 *
 * @module fenghuang/offerManage
 */
import {
  getCurrentDay,
  offerRuleMatch,
  calcCount,
  roundToHalf,
  formatErrInfo,
  isDateInCurrentMonth,
  getCinemaLoginInfoList,
  calculateMarkup
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import {
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST,
  ONE_STEP_PLAT_LIST
} from "@/common/constant.js";
import { platTokens } from "@/store/platTokens";
import Logger from "@/common/logger.js";
import BaseOfferPrice from "@/common/core/BaseOfferPrice.js";
import { filterFixedRulesByDailyTicketCount } from "../../commonQuanStock.js";
import CardQuanManage from "./cardQuanManage";
import CinemaManage from "./cinemaManage";
import SeatManage from "./seatManage";

const {
  userInfo: { rule, user_id }
} = platTokens();

/**
 * 凤凰报价管理类
 * 继承 BaseOfferPrice，实现凤凰系列报价逻辑
 */
class getFenghuangOfferPrice extends BaseOfferPrice {
  constructor({ appFlag, plat_name }) {
    super({ appFlag, plat_name });
  }

  /**
   * 初始化依赖模块
   * @param {Object} order - 订单信息对象
   */
  initModules(order) {
    this.logger = new Logger({ logType: 1 }); // 日志管理模块
    this.logger.init(order);
    this.cardQuanManage = new CardQuanManage(order, this.logger); // 卡券管理模块
    // 报价场景下，offerRule和currentParamsList可以为undefined
    this.cinemaManage = new CinemaManage(
      order,
      this.logger,
      undefined,
      undefined
    ); // 影院管理模块
    this.seatManage = new SeatManage(order, this.logger); // 座位管理模块
  }

  /**
   * 获取最终匹配的报价规则
   * @param {Object} order - 待报价订单信息
   * @returns {Promise<Object|null>} 匹配到的报价规则对象或null
   */
  async getEndMatchOfferRule(order) {
    try {
      // 1. 初始规则匹配
      const matchRuleListRes = offerRuleMatch(order);
      console.log("初始规则匹配", matchRuleListRes);
      if (!matchRuleListRes?.matchRuleList?.length) {
        this.handleRuleMatchError(matchRuleListRes, order);
        return null;
      }

      let matchRuleList = JSON.parse(
        JSON.stringify(matchRuleListRes?.matchRuleList || [])
      );

      // 2. 电影格式过滤
      const movieInfo = await this.getMovieInfo();
      if (!movieInfo) return null;
      console.log("movieInfo", movieInfo, matchRuleList);
      matchRuleList = this.filterByFilmType(
        matchRuleList,
        movieInfo.filmVersion
      );
      if (!matchRuleList.length) return this.handleEmptyRuleList("filmType");

      // 3. 获取最低报价规则
      const endRule = await this.getMinAmountOfferRule(
        matchRuleList,
        order,
        movieInfo
      );
      if (!endRule) return this.handleEmptyRuleList("finalRule");

      return JSON.parse(JSON.stringify(endRule));
    } catch (error) {
      this.logger.errorSave("获取最终匹配报价规则异常", error);
      return null;
    }
  }

  // 成本价逻辑沿用 BaseOfferPrice.getCostPrice 默认实现
  /**
   * 计算最终报价
   * @param {Object} params - 计算参数
   * @returns {Promise<number|null>} 最终报价金额，计算失败或利润不足返回 null
   */
  async calculateFinalPrice(params) {
    const {
      cost_price,
      supplier_max_price,
      price,
      rewards,
      offerType,
      offerList,
      offerRule
    } = params;

    try {
      // 1. 动态调价处理
      let adjustedPrice = this.applyDynamicPricing(price, offerList);

      // 2. 利润加价处理
      adjustedPrice = this.applyProfitAddition(adjustedPrice, offerType);

      // 3. 夜间顶价处理
      adjustedPrice = this.applyNightMaxPrice(
        adjustedPrice,
        supplier_max_price
      );

      // 4. 价格格式化处理
      adjustedPrice = this.formatFinalPrice(adjustedPrice, this.plat_name);

      // 5. 超限检查处理
      adjustedPrice = await this.handleOverrunCheck(
        adjustedPrice,
        supplier_max_price,
        offerType
      );
      if (!adjustedPrice) {
        return null;
      }

      // 6. 成本利润计算
      return this.calculateCostProfit({
        adjustedPrice,
        cost_price,
        rewards,
        supplier_max_price,
        offerRule
      });
    } catch (error) {
      this.logger.error("获取最终报价异常", { error });
      return null;
    }
  }

  /**
   * 获取会员价
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Object} params.movieData - 电影数据（可选）
   * @param {Object} params.minAddAmountRule - 最小加价规则（可选）
   * @returns {Promise<Object|null>} 会员价信息或null
   */
  async getMemberPrice({ order, movieData, minAddAmountRule }) {
    try {
      const movieInfo = movieData || (await this.getMovieInfo());
      if (!movieInfo) {
        this.logger.infoSave("获取电影信息失败");
        return -1;
      }

      let { cinemaLinkId, scheduleId, scheduleKey } = movieInfo;
      // 获取可用卡列表
      const cardList = await this.fetchAvailableCards(order, cinemaLinkId);
      this.logger.infoSave("获取到可用卡列表", { cardList });
      if (!cardList.length) return null;
      // this.logger.infoSave("从座位信息获取会员价");
      let useCardMobileList = cardList?.map(item => item.mobile) || [];
      // 获取该影院的可用手机号列表
      let useLoginList = getCinemaLoginInfoList().filter(
        item =>
          item.app_name === order.app_name &&
          item.session_id &&
          useCardMobileList.includes(item.mobile)
      );
      let fenghuangToken = useLoginList[0]?.session_id;
      // 从座位信息里获取优惠活动列表
      let seatParams = {
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        pageInit: false,
        fenghuangToken
      };
      const targetSeatRes = await this.seatManage.getSeatLayout(seatParams);
      let areaInfoList = targetSeatRes?.areaInfoList || [];
      let seatData = targetSeatRes?.seatData || [];
      this.logger.infoSave("获取到座位价格信息列表", {
        areaInfoList
      });
      let basePrice;
      if (areaInfoList.length) {
        // 取最高价
        let areaIdSortList = areaInfoList.sort(
          (a, b) => b.salePrice - a.salePrice
        );
        if (minAddAmountRule?.memberPriceRule == "2") {
          let seatList = seatData.filter(item => item.status === "N");
          areaInfoList = areaInfoList.map(item => {
            return {
              ...item,
              numRatio: Math.floor(
                (seatList.filter(itemA => itemA.areaId == item.areaId).length *
                  100) /
                  seatList.length
              )
            };
          });
          this.logger.infoSave("获取到座位分区余座占比", { areaInfoList });

          areaIdSortList = areaInfoList.sort((a, b) => b.numRatio - a.numRatio);
          this.logger.infoSave("按照座位占比从高到低获取座位", {
            areaIdSortList
          });
        } else {
          this.logger.infoSave("按照座位价格从高到低获取座位", {
            areaIdSortList
          });
        }
        // 获取票数对应座位来获取价格
        let seatTotalPrice = await this.getSeatPriceByTicket(
          order.ticket_num,
          areaIdSortList,
          seatData,
          movieInfo,
          fenghuangToken
        );
        if (!seatTotalPrice) return null;
        basePrice = (seatTotalPrice * 100) / order.ticket_num / 100;
        this.logger.infoSave("座位总价除以票数得到会员价", {
          basePrice,
          seatTotalPrice
        });
      }
      // 计算最优折扣
      return this.calculateBestDiscount(cardList, basePrice);
    } catch (error) {
      this.logger.errorSave("获取会员价异常", error);
      return null;
    }
  }

  /**
   * 按电影类型过滤规则
   * @private
   */
  filterByFilmType(rules, mediaType) {
    console.log("mediaType", mediaType, rules);
    const filmTypeFlag = rules.some(item => !!item.film_type?.length);
    if (!filmTypeFlag) return rules;

    const filmType = mediaType?.toUpperCase();
    return filmType
      ? rules.filter(item =>
          item.film_type?.length
            ? item.film_type.some(itemA => filmType.includes(itemA))
            : true
        )
      : rules;
  }

  /**
   * 处理规则匹配失败
   * @private
   */
  handleRuleMatchError(result, order) {
    this.logger.errorSave("报价规则匹配后规则为空", {
      error: result.error,
      order
    });
  }

  /**
   * 处理空规则列表情况
   * @private
   */
  handleEmptyRuleList(context, extraInfo = {}) {
    const errorMsgs = {
      filmType: "过滤电影格式后匹配报价规则为空",
      finalRule: "最终匹配到的报价规则为空"
    };

    this.logger.errorSave(errorMsgs[context] || "空规则列表", {
      ...extraInfo,
      context
    });
    return null;
  }

  /**
   * 应用动态调价
   * @private
   */
  applyDynamicPricing(basePrice, offerList) {
    const adjustPrice = window.localStorage.getItem("adjustPrice");
    if (!adjustPrice) return basePrice;
    return basePrice;
  }

  /**
   * 应用利润加价(节日)
   * @private
   */
  applyProfitAddition(price, offerType) {
    if (offerType !== "1" && !GROUP_LIST.includes(this.appFlag)) {
      let profitAddPrice = window.localStorage.getItem("profitAddPrice");
      profitAddPrice = profitAddPrice ? Number(profitAddPrice) : 0;
      this.logger.infoSave(`应用利润加价：${profitAddPrice}`);
      return price + profitAddPrice;
    }
    return price;
  }

  /**
   * 应用夜间顶价
   * @private
   */
  applyNightMaxPrice(price, supplier_max_price) {
    const isNightMaxPriceEnabled =
      localStorage.getItem("isOpenisNightMaxPrice") == 1;
    const currentHour = new Date().getHours();

    if (isNightMaxPriceEnabled && currentHour >= 1 && currentHour <= 6) {
      this.logger.infoSave("开启夜间顶价");
      return Number(supplier_max_price);
    }
    return price;
  }

  /**
   * 格式化最终价格
   * @private
   */
  formatFinalPrice(price, plat_name) {
    return price;
  }

  /**
   * 超限检查
   * @private
   */
  handleOverrunCheck(price, supplier_max_price, offerType) {
    if (price > Number(supplier_max_price)) {
      const isOverrunOfferEnabled =
        window.localStorage.getItem("isOverrunOffer") === "1";
      if (!isOverrunOfferEnabled) {
        this.logger.errorSave(
          `最终报价${price}超过平台限价${supplier_max_price}且超限报价关闭`
        );
        return;
      }

      // 调整价格至平台限价
      return this.adjustToMaxPrice(price, supplier_max_price);
    }
    return price;
  }

  /**
   * 调整至平台限价
   * @private
   */
  adjustToMaxPrice(price, supplier_max_price) {
    if (["mayi", "yangcong"].includes(this.plat_name)) {
      price = Math.floor(supplier_max_price);
    } else {
      price = roundToHalf(
        supplier_max_price,
        ONE_STEP_PLAT_LIST.includes(this.plat_name) ? 0.1 : 0.5,
        "down"
      );
    }
    this.logger.infoSave("调整最终报价为平台限价", { price });
    return price;
  }

  /**
   * 成本利润计算
   * @private
   */
  calculateCostProfit({
    adjustedPrice,
    cost_price,
    rewards,
    supplier_max_price,
    offerRule
  }) {
    // 手续费
    let shouxufei = (adjustedPrice * 100) / 10000;
    if (NO_FEE_PLAT_LIST.includes(this.plat_name)) {
      shouxufei = 0;
    }
    // 奖励费用
    const rewardPrice =
      rewards > 0 ? (adjustedPrice * 100 * rewards) / 10000 : 0;

    // 最大卡券成本（即成本必须低于它才有利润）
    let maxCostPrice =
      (adjustedPrice * 1000 + rewardPrice * 1000 - shouxufei * 1000) / 1000;
    offerRule.maxCostPrice = maxCostPrice;

    // 真实成本(卡券成本+手续费-奖励费用)
    const real_cost_price = (cost_price + shouxufei - rewardPrice).toFixed(2);
    // 预计利润（最终报价-真实成本）
    const expectProfit = (adjustedPrice - real_cost_price).toFixed(2);

    // 利润校验：使用放大 1000 倍后的整数差值，避免浮点精度问题
    const profitDiff =
      Math.round(Number(adjustedPrice || 0) * 1000) -
      Math.round(Number(real_cost_price || 0) * 1000);
    if (profitDiff <= 0 && !TEST_NEW_PLAT_LIST.includes(this.plat_name)) {
      this.logger.errorSave(
        `最终报价${adjustedPrice}低于真实成本${real_cost_price}`
      );
      return null;
    }

    // 记录详细计算信息
    this.recordCalculationDetails({
      adjustedPrice,
      cost_price,
      maxCostPrice: offerRule.maxCostPrice,
      rewards,
      shouxufei,
      rewardPrice,
      real_cost_price,
      expectProfit,
      supplier_max_price
    });

    return adjustedPrice;
  }

  /**
   * 记录计算详情
   * @private
   */
  recordCalculationDetails(details) {
    this.logger.infoSave("fenghuang计算报价相关信息", {
      rule_price: `规则计算报价：${details.adjustedPrice}`,
      cardQuanCost: `卡券成本：${details.cost_price}`,
      maxCostPrice: `最大卡券成本（低于该值才有利润）：${details.maxCostPrice}`,
      price: `最终报价：${details.adjustedPrice}`,
      shouxufei: `手续费（最终报价*1%）：${details.shouxufei}`,
      rewardPrice: `奖励金额（${details.rewards}%）：${details.rewardPrice}`,
      real_cost_price: `真实成本：${details.real_cost_price}`,
      expectProfit: `预计利润：${details.expectProfit}`
    });
  }

  /**
   * 根据票数获取座位价格
   * @private
   */
  async getSeatPriceByTicket(
    ticket_num,
    areaInfoList,
    seat_data,
    movieInfo,
    fenghuangToken
  ) {
    try {
      let seatInfo = [];
      const seatMap = new Map();
      seat_data.forEach(seat => {
        if (seat.status !== "N") return; // 只处理可用座位
        const areaId = seat.areaId;
        if (!seatMap.has(areaId)) {
          seatMap.set(areaId, []);
        }
        seatMap.get(areaId).push(seat);
      });
      for (let i = 0; i < areaInfoList.length; i++) {
        const area = areaInfoList[i];
        const areaSeatList = seatMap.get(area.areaId) || []; // 如果没有则为空数组
        for (let j = 0; j < areaSeatList.length; j++) {
          const item = areaSeatList[j];
          if (seatInfo.length >= ticket_num) {
            break;
          }
          seatInfo.push({
            areaId: item.areaId,
            seatCode: item.seatCode
          });
        }
        if (seatInfo.length >= ticket_num) {
          break;
        }
      }
      if (seatInfo.length != ticket_num) {
        this.logger.errorSave("获取座位价格前获取座位失败", {
          seatInfo,
          ticket_num,
          seat_data
        });
        return;
      }
      this.logger.infoSave("获取座位价格前获取座位完成:", { seatInfo });
      // 座位支付总价格
      let seatPayTotalPrice = await this.cardQuanManage.getSeatPrice({
        cinemaLinkId: movieInfo.cinemaLinkId,
        scheduleId: movieInfo.scheduleId,
        scheduleKey: movieInfo.scheduleKey,
        seats: JSON.stringify(seatInfo),
        fenghuangToken
      });
      seatPayTotalPrice = seatPayTotalPrice / 100;
      return seatPayTotalPrice;
    } catch (error) {
      this.logger.errorSave("获取座位价格异常", { error });
    }
  }

  /**
   * 获取最多座位价格
   * @private
   */
  getMostSeatPrice(seat_data, areaList) {
    try {
      // 过滤出来未售座位然后计算分区剩余座位占比，0-未售
      let seatList = seat_data.filter(item => item.status === "N");

      let areaRatioList = areaList.map(item => {
        return {
          ...item,
          numRatio: Math.floor(
            (seatList.filter(itemA => itemA.areaId == item.areaId).length *
              100) /
              seatList.length
          )
        };
      });
      areaRatioList.sort((a, b) => b.numRatio - a.numRatio);
      this.logger.infoSave("座位分区剩余座位占比情况", areaRatioList);
      let mostSeatPrice = areaRatioList[0]?.salePrice;
      return mostSeatPrice;
    } catch (error) {
      this.logger.infoSave(
        "座位分区剩余座位占比计算失败",
        formatErrInfo(error)
      );
    }
  }

  /**
   * 获取可用会员卡列表
   * @private
   */
  async fetchAvailableCards(order, cinemaLinkId) {
    const { ticket_num, app_name } = order;
    const useMobileList = getCinemaLoginInfoList()
      .filter(item => item.app_name === app_name && item.mobile)
      .map(item => item.mobile);

    const cardRes = await svApi.queryCardList({
      app_name,
      rule: rule,
      status: "1",
      isNeedTotalNum: 0,
      queryFields:
        "mobile,card_num,card_discount,linkCinemaIds,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
    });

    let list = cardRes.data.cardList || [];
    list = list.map(item => ({
      ...item,
      daily_usage:
        item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0,
      month_usage: !isDateInCurrentMonth(item.usage_date)
        ? 0
        : item.monthly_usage || 0
    }));
    this.logger.infoSave("获取该影院已维护会员卡列表返回", { list });
    return list
      .filter(item => useMobileList.includes(item.mobile))
      .filter(item => this.checkUsageLimit(item, ticket_num))
      .filter(item => this.checkCinemaLink(item, cinemaLinkId));
  }

  /**
   * 检查使用限制
   * @private
   */
  checkUsageLimit(item, ticketNum) {
    const { use_limit_day, use_limit_month, daily_usage, month_usage } = item;
    return (
      (!use_limit_day || ticketNum <= use_limit_day - daily_usage) &&
      (!use_limit_month || ticketNum <= use_limit_month - month_usage)
    );
  }

  /**
   * 检查影院关联
   * @private
   */
  checkCinemaLink(item, cinemaLinkId) {
    return (
      !item.linkCinemaIds ||
      item.linkCinemaIds.split(",").includes(cinemaLinkId)
    );
  }

  /**
   * 计算最优折扣
   * @private
   */
  calculateBestDiscount(cardList, basePrice) {
    cardList = cardList.map(item => ({
      ...item,
      card_discount: item.card_discount ? Number(item.card_discount) : 100
    }));

    cardList.sort((a, b) => a.card_discount - b.card_discount);

    const bestCard = cardList[0];
    const discount = bestCard?.card_discount;
    const member_price = (basePrice * 100 * discount) / 10000;

    return {
      real_member_price: basePrice,
      discount,
      member_price: Number(member_price.toFixed(2))
    };
  }

  /**
   * 获取最低报价规则（核心报价策略）
   * @param {Array} ruleList 报价规则列表
   * @param {Object} order 订单信息
   * @param {Object} movieInfo 电影信息
   * @returns {Promise<Object>} 最优报价规则
   */
  async getMinAmountOfferRule(ruleList, order, movieInfo) {
    console.log("获取最低报价规则，初始规则列表", ruleList);
    try {
      // 1. 优先处理会员日报价规则
      const memberDayRules = this.filterMemberDayRules(ruleList);
      if (memberDayRules.length) {
        this.logger.infoSave("命中会员日报价规则");
        return memberDayRules[0];
      }

      // 2. 处理普通报价规则
      const generalRules = this.filterGeneralRules(ruleList);
      const { fixedRules, addAmountRuleList } =
        this.splitRuleTypes(generalRules);

      // 3. 处理固定报价规则的券库存校验，再按日出票券数过滤
      const validFixedRules = await this.validateQuanStock({
        rules: fixedRules,
        order,
        movieInfo,
        ticketNum: order.ticket_num
      });

      // 4. 处理会员价加价规则
      let bestFixAddRule = null;
      if (addAmountRuleList.length) {
        let minAddAmountRule = addAmountRuleList[0];
        // 如果addAmount设置比较特殊，严谨来说只能有且仅有一条规则或者其规则再首位时才能生效；如：30;>=+2;<+1
        if (
          addAmountRuleList?.length > 1 &&
          addAmountRuleList.every(
            item => item?.addAmount?.split(";")?.length === 1
          )
        ) {
          minAddAmountRule = addAmountRuleList.sort(
            (itemA, itemB) => itemA.addAmount - itemB.addAmount
          )?.[0];
        }

        let addMountRule = minAddAmountRule.addAmount?.split(";");
        if (addMountRule.length === 1) {
          minAddAmountRule.realAddMount = addMountRule[0];
        } else if (addMountRule.length > 1) {
          minAddAmountRule.addMountRule = addMountRule.slice();
        }

        const memberPriceRes = await this.getMemberPrice({
          order,
          movieData: movieInfo,
          minAddAmountRule
        });
        if (memberPriceRes) {
          if (
            !minAddAmountRule.realAddMount &&
            minAddAmountRule.addMountRule?.length > 1
          ) {
            let realAddMount = this.getRealAddMount({
              real_member_price: memberPriceRes.real_member_price,
              addMountRule: minAddAmountRule.addMountRule
            });
            minAddAmountRule.realAddMount = realAddMount;
          }
          if (minAddAmountRule.realAddMount) {
            bestFixAddRule = this.processAddRule(
              minAddAmountRule,
              memberPriceRes
            );
          }
        }
      }

      // 5. 处理固定报价规则
      const bestFixedRule = validFixedRules?.[0];
      console.log(
        "bestFixedRule",
        bestFixedRule,
        "bestFixAddRule",
        bestFixAddRule
      );
      // 6. 对比会员价和固定价
      return this.comparePricingStrategies({
        bestFixAddRule,
        bestFixedRule
      });
    } catch (error) {
      this.logger.errorSave("获取最低报价规则异常", error);
      return null;
    }
  }

  // 获取真实加价金额逻辑沿用 BaseOfferPrice.getRealAddMount 默认实现

  /**
   * 过滤会员日报价规则
   * @private
   */
  filterMemberDayRules(rules) {
    return rules
      .filter(
        item => item.memberDay && item.offerType === "3" && item.offerAmount
      )
      .sort((a, b) => a.offerAmount - b.offerAmount);
  }

  /**
   * 过滤普通报价规则
   * @private
   */
  filterGeneralRules(rules) {
    return rules.filter(item => !item.memberDay && item.offerType !== "3");
  }

  /**
   * 拆分规则类型
   * @private
   */
  splitRuleTypes(rules) {
    return {
      fixedRules: rules
        .filter(item => item.offerType === "1" && item.offerAmount)
        .sort((a, b) => a.offerAmount - b.offerAmount),
      addAmountRuleList: rules
        .filter(item => item.offerType === "2" && item.addAmount)
        .sort((a, b) => a.addAmount - b.addAmount)
    };
  }

  /**
   * 校验券库存，再按日出票券数过滤
   * @private
   */
  async validateQuanStock({ rules, order, movieInfo, ticketNum }) {
    if (!rules.length) return [];

    const appQuanTypeList = await this.cardQuanManage.getQuanTypeListByApp();
    this.cardQuanManage.syncUpdateQuanStock({
      cinemaLinkId: movieInfo.cinemaLinkId,
      quanTypeList: appQuanTypeList
    });

    if (!appQuanTypeList?.length) return [];
    let validFixedRules = this.applyQuanStockFilter(
      rules,
      appQuanTypeList,
      ticketNum
    );
    if (validFixedRules.length) {
      const useMobileList = getCinemaLoginInfoList()
        .filter(
          item =>
            item.app_name === order.app_name && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      validFixedRules = await filterFixedRulesByDailyTicketCount({
        fixedAmountRuleList: validFixedRules,
        appQuanTypeList,
        useMobileList,
        order: { app_name: order.app_name, ticket_num: ticketNum },
        logger: this.logger
      });
    }
    return validFixedRules;
  }

  /**
   * 应用券库存过滤
   * @private
   */
  applyQuanStockFilter(rules, quanTypes, ticketNum) {
    return rules.filter(rule => {
      // 查找是否有目标券可以出的
      return quanTypes.some(
        q =>
          rule.quanValue?.split(",")?.includes(q.quan_value) &&
          q.quan_stock >= ticketNum
      );
    });
  }

  /**
   * 处理加价规则
   * @private
   */
  processAddRule(addRule, memberPriceRes) {
    const processedRule = { ...addRule };
    processedRule.real_member_price = memberPriceRes.real_member_price;
    processedRule.member_discount = memberPriceRes.discount;
    processedRule.memberCostPrice = memberPriceRes.member_price;
    processedRule.round_member_price = roundToHalf(
      processedRule.memberCostPrice,
      ONE_STEP_PLAT_LIST.includes(this.plat_name) ? 0.1 : 0.5
    );
    processedRule.memberOfferAmount =
      processedRule.round_member_price + Number(processedRule.realAddMount);

    this.recordMemberPriceDetails(processedRule);
    return processedRule;
  }

  /**
   * 记录会员价计算详情
   * @private
   */
  recordMemberPriceDetails(rule) {
    this.logger.infoSave("会员报价最终信息", {
      real_member_price: `真实会员价：${rule.real_member_price}`,
      member_discount: `会员最小折扣：${rule.member_discount}`,
      memberCostPrice: `会员成本价：${rule.memberCostPrice}`,
      addAmount: `加价金额：${rule.addAmount}`,
      round_member_price: `成本价向上取0.5整数倍:${rule.round_member_price}`,
      memberOfferAmount: `预计报价：${rule.memberOfferAmount}`
    });
  }

  /**
   * 对比定价策略
   * @private
   */
  comparePricingStrategies({ bestFixAddRule, bestFixedRule }) {
    if (!bestFixAddRule) return bestFixedRule;
    if (!bestFixedRule) return bestFixAddRule;

    if (bestFixAddRule.memberOfferAmount >= bestFixedRule.offerAmount) {
      this.logPriceComparison(bestFixAddRule, bestFixedRule, "固定");
      return bestFixedRule;
    } else {
      this.logPriceComparison(bestFixAddRule, bestFixedRule, "会员");
      return bestFixAddRule;
    }
  }

  /**
   * 记录价格对比日志
   * @private
   */
  logPriceComparison(addRule, fixedRule, selectedType) {
    this.logger.infoSave(`${selectedType}报价策略选择`, {
      memberOfferAmount: addRule.memberOfferAmount,
      fixedOfferAmount: fixedRule.offerAmount
    });
  }

  /**
   * 获取电影信息
   * @private
   */
  async getMovieInfo() {
    const buyTicketInfo = await this.cinemaManage.getBuyPrevCinemaInfo({
      flag: 1
    });
    const { targetShow, cinemaLinkId, filmId } = buyTicketInfo || {};
    return buyTicketInfo
      ? { ...(targetShow || {}), cinemaLinkId, filmId }
      : null;
  }
}

// 测试报价实例的方法
window.fenghuangOfferObj = (plat_name, app_name) => {
  return new getFenghuangOfferPrice({ appFlag: app_name, plat_name });
};
// 获取订单最终报价：
// window.fenghuangOfferObj("mayi", "cqhx").getEndOfferPrice({ order: orderJson, offerList: [] })
export default getFenghuangOfferPrice;
