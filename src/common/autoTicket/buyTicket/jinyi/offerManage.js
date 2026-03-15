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
import { filterFixedRulesByDailyTicketCount } from "../../commonQuanStock.js";
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
  constructor({ appFlag, plat_name, isTestOrder }) {
    super({ appFlag, plat_name });
    this.isTestOrder = isTestOrder;
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
      const matchRuleListRes = offerRuleMatch(order, this.logger);
      console.log("初始规则匹配", matchRuleListRes);
      let matchRuleList = matchRuleListRes?.matchRuleList || [];
      if (this.isTestOrder && !matchRuleList?.length) {
        matchRuleList = [
          {
            id: 1671,
            ruleName: "南京测试",
            orderForm: "lieren",
            app_type: "jinyi_applet",
            shadowLineName: "guangmeiwenhua",
            includeCityNames: ["南京"],
            excludeCityNames: [],
            includeCinemaNames: ["金逸影城（光美江宁弘阳IMAX店）"],
            includeCinemaCodes: "55_400352",
            excludeCinemaNames: [],
            excludeCinemaCodes: "",
            includeHallNames: [],
            excludeHallNames: [],
            includeFilmNames: ["飞驰人生3"],
            excludeFilmNames: [],
            timeLimit: null,
            quanValue: "",
            offerType: "2",
            weekDay: [],
            seatNum: "",
            memberDay: "",
            status: "1",
            update_time: "2026-03-14 10:26:28",
            user_id: "1",
            user_name: "张三",
            platOfferList: [
              {
                platName: "lieren",
                value: "60"
              }
            ],
            addAmount: "60",
            rule: 2,
            autoUseQuanStatus: "2",
            autoUseQuanPrice: "",
            auto_quan_value: "",
            remark: "测试",
            film_type: [],
            memberPriceRule: "",
            allow_offer_time: "",
            last_used_time: "",
            quanValueList: []
          }
        ];
      }
      if (!matchRuleList?.length) {
        this.logger.infoSave("报价规则匹配后规则为空", {
          error: matchRuleListRes?.error,
          order
        });
        return null;
      }
      matchRuleList = JSON.parse(JSON.stringify(matchRuleList));

      // 2. 电影格式过滤
      const movieInfo = await this.getMovieInfo();
      if (!movieInfo) return null;

      matchRuleList = this.filterByFilmType(matchRuleList, movieInfo.show_type);
      if (!matchRuleList.length) {
        this.logger.errorSave("按电影格式存筛选后，报价规则为空", {
          filmType: movieInfo.show_type,
          matchRuleList
        });
        return;
      }

      // 3. 获取最低报价规则
      const endRule = await this.getMinAmountOfferRule(
        matchRuleList,
        order,
        movieInfo
      );
      if (!endRule) {
        // 日常固定报价规则
        let fixedAmountRuleList = matchRuleList.filter(
          item => item.offerType === "1" && item.offerAmount
        );
        if (fixedAmountRuleList.length) {
          this.logger.errorSave("按券库存筛选后，报价规则为空", {
            fixedAmountRuleList
          });
        } else {
          this.logger.errorSave("最终匹配到的报价规则为空");
        }
        return null;
      }

      return JSON.parse(JSON.stringify(endRule));
    } catch (error) {
      this.logger.errorSave("获取最终匹配报价规则异常", error);
      return null;
    }
  }

  // 按电影类型过滤规则
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

  // 记录计算详情
  recordCalculationDetails(details) {
    this.logger.infoSave("jinyi计算报价相关信息", {
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
      console.warn("获取最低报价规则", { ruleList, order, movieInfo });
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
   * 校验券库存，再按日出票券数过滤
   */
  async validateQuanStock({ rules, order, movieInfo, ticketNum }) {
    if (!rules.length) return [];

    const appQuanTypeList = await this.cardQuanManage.getQuanTypeListByApp();
    this.cardQuanManage.syncUpdateQuanStock({
      cinema_id: movieInfo.cinema_id,
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
}

export default getJinyiOfferPrice;

// 测试报价实例的方法
window.jinyiOfferObj = (plat_name, app_name) => {
  return new getJinyiOfferPrice({
    appFlag: app_name,
    plat_name,
    isTestOrder: true
  });
};

const testOrder = {
  plat_name: "mayi",
  id: "12412221440316515",
  tpp_price: 42,
  supplier_max_price: 39,
  city_name: "南京",
  cinema_addr: "雨花台区软件大道109号雨花客厅E-PARK北区3层",
  ticket_num: 1,
  cinema_name: "金逸影城(光美江宁弘阳IMAX店)",
  hall_name: "7号MX4D激光厅(儿童需购票)",
  film_name: "飞驰人生3",
  show_time: "2026-03-17 21:10:00",
  rewards: 0,
  is_urgent: false,
  cinema_group: "",
  cinema_code: "32016011",
  order_number: "12412221440316515",
  offer_end_time: 1773569265000,
  app_name: "guangmeiwenhua"
};

// 获取订单最终报价：
// window.jinyiOfferObj("mayi", "guangmeiwenhua").getEndOfferPrice({ order: orderJson, offerList: [] })
