/**
 * 金逸报价管理模块
 *
 * 职责：
 * - 继承 BaseOfferPrice 基类，实现金逸系列报价逻辑
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
 * @module jinyi/offerManage
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
import CardQuanManage from "./cardQuanManage";
import CinemaManage from "./cinemaManage";
import SeatManage from "./seatManage";

const {
  userInfo: { rule, user_id }
} = platTokens();

/**
 * 金逸报价管理类
 * 继承 BaseOfferPrice，实现金逸系列报价逻辑
 */
class getJinyiOfferPrice extends BaseOfferPrice {
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

  // 获取最终匹配的报价规则
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

      matchRuleList = this.filterByFilmType(matchRuleList, movieInfo.show_type);
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

  // 按电影类型过滤规则
  filterByFilmType(rules, show_type) {
    const filmTypeFlag = rules.some(item => !!item.film_type?.length);
    if (!filmTypeFlag) return rules;

    const filmType = show_type?.toUpperCase();
    return filmType
      ? rules.filter(item =>
          item.film_type?.some(itemA => filmType.includes(itemA))
        )
      : rules;
  }

  // 处理规则匹配失败
  handleRuleMatchError(result, order) {
    this.logger.errorSave("报价规则匹配后规则为空", {
      error: result.error,
      order
    });
  }

  // 处理空规则列表情况
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

  // 成本价逻辑沿用 BaseOfferPrice.getCostPrice 默认实现

  // 计算最终报价
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

  // 应用动态调价
  applyDynamicPricing(basePrice, offerList) {
    const adjustPrice = window.localStorage.getItem("adjustPrice");
    if (!adjustPrice) return basePrice;

    // try {
    //   const adjustConfig = JSON.parse(adjustPrice);
    //   const countRes = calcCount(adjustConfig.lierenMachineOfferList || []);

    //   if (countRes.inCount >= adjustConfig.inCount) {
    //     return basePrice + Number(adjustConfig.inPrice);
    //   } else if (countRes.outCount >= adjustConfig.outCount) {
    //     return basePrice - Number(adjustConfig.outPrice);
    //   }
    // } catch (error) {
    //   this.logger.error("动态调价处理异常", error);
    // }
    return basePrice;
  }

  // 应用利润加价(节日)
  applyProfitAddition(price, offerType) {
    if (offerType !== "1" && !GROUP_LIST.includes(this.appFlag)) {
      let profitAddPrice = window.localStorage.getItem("profitAddPrice");
      profitAddPrice = profitAddPrice ? Number(profitAddPrice) : 0;
      this.logger.infoSave(`应用利润加价：${profitAddPrice}`);
      return price + profitAddPrice;
    }
    return price;
  }

  // 应用夜间顶价
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

  // 格式化最终价格
  formatFinalPrice(price, plat_name) {
    return price;
  }

  // 超限检查
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

  // 调整至平台限价
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

  // 成本利润计算
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

    // 利润校验
    if (
      adjustedPrice <= real_cost_price &&
      !TEST_NEW_PLAT_LIST.includes(this.plat_name)
    ) {
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

  // 记录计算详情
  recordCalculationDetails(details) {
    this.logger.infoSave("chenxing计算报价相关信息", {
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

  // 获取会员价
  async getMemberPrice({ order, movieData, minAddAmountRule }) {
    try {
      const movieInfo = movieData || (await this.getMovieInfo());
      if (!movieInfo) {
        this.logger.infoSave("获取电影信息失败");
        return -1;
      }

      let { cinema_id, schedule_id, hall_id } = movieInfo;
      // 获取可用卡列表
      const cardList = await this.fetchAvailableCards(order, cinema_id);
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
      let session_id = useLoginList[0]?.session_id;
      // 从座位信息里获取优惠活动列表
      let seatParams = {
        cinema_id,
        schedule_id,
        hall_id,
        session_id
      };
      const targetSeatRes = await this.seatManage.getSeatLayout(seatParams);
      let areaInfoList = targetSeatRes?.areaInfoList || [];
      this.logger.infoSave("获取到座位价格信息列表", {
        areaInfoList
      });
      let basePrice;
      if (areaInfoList.length) {
        // 取最高价
        let areaIdSortList = areaInfoList.sort(
          (a, b) => b.area_price - a.area_price
        );
        this.logger.infoSave("按照座位价格从高到低获取座位", {
          areaIdSortList
        });
        basePrice = areaIdSortList[0].area_price;
        this.logger.infoSave("最高座位价格当做会员价", {
          basePrice
        });
      }
      // 计算最优折扣
      return this.calculateBestDiscount(cardList, basePrice);
    } catch (error) {
      this.logger.errorSave("获取会员价异常", error);
      return null;
    }
  }

  // 获取可用会员卡列表
  async fetchAvailableCards(order, cinema_id) {
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
      .filter(item => this.checkCinemaLink(item, cinema_id));
  }

  /**
   * 检查使用限制
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
   */
  checkCinemaLink(item, cinema_id) {
    return (
      !item.linkCinemaIds || item.linkCinemaIds.split(",").includes(cinema_id)
    );
  }

  // 计算最优折扣
  calculateBestDiscount(cardList, basePrice) {
    cardList = cardList.map(item => ({
      ...item,
      card_discount: item.card_discount ? Number(item.card_discount) : 100
    }));

    cardList.sort((a, b) => a.card_discount - b.card_discount);

    const bestCard = cardList[0];
    const discount = bestCard?.card_discount || 100;
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
   * @returns {Object} 最优报价规则
   */
  async getMinAmountOfferRule(ruleList, order, movieInfo) {
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

      // 3. 处理固定报价规则的券库存校验
      const validFixedRules = await this.validateQuanStock({
        rules: fixedRules,
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
   */
  filterGeneralRules(rules) {
    return rules.filter(item => !item.memberDay && item.offerType !== "3");
  }

  /**
   * 拆分规则类型
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
   * 校验券库存
   */
  async validateQuanStock({ rules, movieInfo, ticketNum }) {
    if (!rules.length) return [];

    const appQuanTypeList = await this.cardQuanManage.getQuanTypeListByApp();
    this.cardQuanManage.syncUpdateQuanStock({
      cinema_id: movieInfo.cinema_id,
      quanTypeList: appQuanTypeList
    });

    return appQuanTypeList?.length
      ? this.applyQuanStockFilter(rules, appQuanTypeList, ticketNum)
      : [];
  }

  /**
   * 应用券库存过滤
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
   */
  logPriceComparison(addRule, fixedRule, selectedType) {
    this.logger.infoSave(`${selectedType}报价策略选择`, {
      memberOfferAmount: addRule.memberOfferAmount,
      fixedOfferAmount: fixedRule.offerAmount
    });
  }

  /**
   * 获取电影信息
   */
  async getMovieInfo() {
    const buyTicketInfo = await this.cinemaManage.getBuyPrevCinemaInfo({
      flag: 1
    });
    const { targetShow, cinema_id, film_id } = buyTicketInfo || {};
    return buyTicketInfo ? { ...(targetShow || {}), cinema_id, film_id } : null;
  }

  /**
   * 验证待报价订单JSON
   *
   * 用于验证待报价订单的格式和核心方法的可执行性，不实际进行报价
   *
   * @param {Object} orderJson - 待报价订单JSON
   * @param {string} orderJson.plat_name - 平台名称（必填）
   * @param {string} orderJson.app_name - 影院标识（必填）
   * @param {string} [orderJson.order_number] - 订单号（可选）
   * @param {string} orderJson.city_name - 城市名称（必填）
   * @param {string} orderJson.cinema_name - 影院名称（必填）
   * @param {string|number} orderJson.cinema_code - 影院编码（必填）
   * @param {string} orderJson.film_name - 电影名称（必填）
   * @param {string} orderJson.hall_name - 影厅名称（必填）
   * @param {string} orderJson.show_time - 放映时间，格式：YYYY-MM-DD HH:mm:ss（必填）
   * @param {number} orderJson.ticket_num - 票数（必填）
   * @param {number} orderJson.supplier_max_price - 平台最高限价（必填）
   * @param {number} [orderJson.rewards] - 奖励百分比，默认0（可选）
   *
   * @returns {Promise<Object>} 验证结果：
   *   - valid: boolean，是否通过验证
   *   - errMsg: string，错误信息（验证失败时）
   *   - steps: Object，验证步骤结果（可选）
   *     - orderFormat: boolean，订单格式验证
   *     - offerRuleMatch: boolean，报价规则匹配
   *     - movieInfo: boolean，电影信息获取
   *     - memberPrice: boolean，会员价获取（如果适用）
   *   - offerRule: Object，匹配到的报价规则（如果匹配成功）
   *   - movieInfo: Object，电影信息（如果获取成功）
   *   - costPrice: number，成本价（如果获取成功）
   */
  async validateOfferOrder(orderJson) {
    const result = {
      valid: false,
      errMsg: "",
      steps: {}
    };

    try {
      // 1. 验证订单格式
      const requiredFields = [
        "plat_name",
        "app_name",
        "city_name",
        "cinema_name",
        "cinema_code",
        "film_name",
        "hall_name",
        "show_time",
        "ticket_num",
        "supplier_max_price"
      ];
      const missingFields = requiredFields.filter(field => !orderJson[field]);
      if (missingFields.length > 0) {
        result.errMsg = `缺少必填字段：${missingFields.join(", ")}`;
        return result;
      }

      if (
        typeof orderJson.ticket_num !== "number" ||
        orderJson.ticket_num <= 0
      ) {
        result.errMsg = "ticket_num 必须是大于0的数字";
        return result;
      }
      if (
        typeof orderJson.supplier_max_price !== "number" ||
        orderJson.supplier_max_price <= 0
      ) {
        result.errMsg = "supplier_max_price 必须是大于0的数字";
        return result;
      }

      result.steps.orderFormat = true;

      // 2. 初始化模块
      this.initModules(orderJson);

      // 3. 验证报价规则匹配
      const offerRule = await this.getEndMatchOfferRule(orderJson);
      if (!offerRule) {
        result.errMsg = "报价规则匹配失败，无法匹配到可用规则";
        result.steps.offerRuleMatch = false;
        return result;
      }
      result.steps.offerRuleMatch = true;
      result.offerRule = offerRule;

      // 4. 验证电影信息获取
      const movieInfo = await this.getMovieInfo();
      if (!movieInfo) {
        result.errMsg = "获取电影放映信息失败";
        result.steps.movieInfo = false;
        return result;
      }
      result.steps.movieInfo = true;
      result.movieInfo = movieInfo;

      // 5. 验证会员价获取（如果是会员价加价规则）
      const offerType = offerRule.offerType || offerRule.offer_type;
      if (offerType === "2") {
        const memberPriceRes = await this.getMemberPrice({
          order: orderJson,
          movieData: movieInfo,
          minAddAmountRule: offerRule
        });
        if (memberPriceRes === -1 || memberPriceRes == null) {
          result.errMsg = "获取会员价失败";
          result.steps.memberPrice = false;
          return result;
        }
        result.steps.memberPrice = true;
        result.memberPriceRes = memberPriceRes;
      }

      // 6. 验证成本价获取
      const costPrice = await this.getCostPrice(offerRule);
      if (!costPrice) {
        result.errMsg = "获取成本价失败";
        return result;
      }
      result.costPrice = costPrice;

      result.valid = true;
      return result;
    } catch (error) {
      result.errMsg = `验证过程异常：${formatErrInfo(error)}`;
      return result;
    } finally {
      console.log("验证结果：", result);
    }
  }
}

export default getJinyiOfferPrice;

// 测试报价实例的方法
window.jinyiOfferObj = (plat_name, app_name) => {
  return new getJinyiOfferPrice({ appFlag: app_name, plat_name });
};

// {
//   plat_name: "mayi",
//   id: "12412221440316515",
//   tpp_price: 42,
//   supplier_max_price: 39,
//   city_name: "重庆",
//   cinema_addr: "雨花台区软件大道109号雨花客厅E-PARK北区3层",
//   ticket_num: 1,
//   cinema_name: "金逸影城(光美美一城店)",
//   hall_name: "1号激光厅",
//   film_name: "阿凡达3",
//   film_img:
//     "https://gw.alicdn.com/tfscom/i4/O1CN01e8PcvF1NESAgdEsnM_!!6000000001538-0-alipicbeacon.jpg_120x120.jpg",
//   show_time: "2025-12-30 19:00:00",
//   rewards: 0,
//   is_urgent: false,
//   cinema_group: "",
//   cinema_code: "35061501",
//   order_number: "12412221440316515",
//   offer_end_time: 1734849690000,
//   app_name: "guangmeiwenhua"
// }
// 订单报价管理校验：
// window.jinyiOfferObj("mayi", "guangmeiwenhua").validateOfferOrder(orderJson)
// 获取订单最终报价：
// window.jinyiOfferObj("mayi", "guangmeiwenhua").getEndOfferPrice({ order: orderJson, offerList: [] })
