// sfc报价逻辑
import {
  getCurrentDay,
  offerRuleMatch,
  calcCount,
  roundToHalf,
  formatErrInfo,
  isDateInCurrentMonth,
  getCinemaLoginInfoList
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import {
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  GE_APP_INFO
} from "@/common/constant.js";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

// 卡券管理类
import CardQuanManage from "./cardQuanManage";
// 统一日志类
import Logger from "@/common/logger";
// 影院管理类
import CinemaManage from "./cinemaManage";
// 座位管理类
import SeatManage from "./seatManage";

// 是否是测试订单
let isTestOrder = false;
class getChenxingOfferPrice {
  constructor({ appFlag, plat_name }) {
    this.appFlag = appFlag; // 影线标识
    this.plat_name = plat_name; // 平台标识
    this.api_version = GE_APP_INFO(appFlag)?.api_version;
  }
  // 初始化依赖模块
  initModules(order) {
    this.logger = new Logger({ logType: 1 }); // 日志管理模块
    this.logger.init(order);
    this.cardQuanManage = new CardQuanManage(order, this.logger); // 卡券管理模块
    this.cinemaManage = new CinemaManage(order, this.logger); // 影院管理模块
    this.seatManage = new SeatManage(order, this.logger); // 座位管理模块
  }

  // 获取最终报价信息（唯一暴漏给外包用的方法）
  async getEndOfferPrice({ order, offerList }) {
    try {
      // 1. 初始化模块
      this.initModules(order);

      // 2. 获取最终匹配的报价规则
      let offerRule = await this.getEndMatchOfferRule(order);
      if (!offerRule) return this.buildErrorResponse();
      this.logger.infoSave("最终匹配到的报价规则", offerRule);
      // 3. 获取成本价
      const cost_price = await this.getCostPrice(offerRule);
      if (!cost_price) return this.buildErrorResponse(offerRule);
      offerRule.cost_price = cost_price; // 成本价

      // 4. 计算最终报价
      const endPrice = await this.calculateFinalPrice({
        cost_price,
        supplier_max_price: order.supplier_max_price,
        price: this.getOfferBasePrice(offerRule),
        rewards: order.rewards,
        offerType: offerRule.offerType,
        offerList,
        offerRule
      });

      if (!endPrice) return this.buildErrorResponse(offerRule);

      // 5. 组装返回结果
      offerRule.offer_end_amount = endPrice;
      this.logger.infoSave(`最终报价金额：${endPrice}`);
      // 增加一个quanValue的过滤，依据最大券成本过滤
      if (
        offerRule.offerType === "1" &&
        offerRule?.maxCostPrice &&
        this.quanInfoList?.length > 1
      ) {
        offerRule.quanValue = offerRule.quanValue
          .split(",")
          .filter(item => {
            let targetQuanCost = this.quanInfoList.find(
              quanInfo => quanInfo.quan_value === item
            )?.quan_cost;
            return targetQuanCost < offerRule?.maxCostPrice;
          })
          .join();
      }
      return this.buildSuccessResponse(endPrice, offerRule, order.order_number);
    } catch (error) {
      this.logger.errorSave("获取最终报价信息方法执行异常", error);
      return this.buildErrorResponse();
    }
  }

  // 获取基础报价金额
  getOfferBasePrice(offerRule) {
    return Number(offerRule.offerAmount || offerRule.memberOfferAmount);
  }

  // 构建错误响应
  buildErrorResponse(offerRule) {
    const { err_msg, err_info } = this.logger.getLastErrMsgAndInfo();
    this.logger.logUpload();
    return { err_msg, err_info, endPrice: null, offerRule };
  }

  // 构建成功响应
  buildSuccessResponse(endPrice, offerRule, orderNumber) {
    this.logger.logUpload();
    return {
      endPrice,
      offerRule,
      order_number: orderNumber
    };
  }

  // 获取最终匹配的报价规则
  async getEndMatchOfferRule(order) {
    try {
      // 1. 初始规则匹配
      const matchRuleListRes = offerRuleMatch(order);
      if (!matchRuleListRes.matchRuleList?.length && !isTestOrder) {
        this.handleRuleMatchError(matchRuleListRes, order);
        return null;
      }

      let matchRuleList = JSON.parse(
        JSON.stringify(matchRuleListRes?.matchRuleList || [])
      );

      // 2. 电影格式过滤
      const movieInfo = await this.getMovieInfo();
      if (!movieInfo) return null;
      if (isTestOrder) {
        // 测试订单获取会员价
        const memberPriceRes = await this.getMemberPrice({
          order,
          movieData: movieInfo
        });
        console.log("测试订单获取会员价", memberPriceRes, movieInfo);
      }

      matchRuleList = this.filterByFilmType(matchRuleList, movieInfo.media);
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
  filterByFilmType(rules, mediaType) {
    const filmTypeFlag = rules.find(item => item.film_type?.length === 1);
    if (!filmTypeFlag) return rules;

    const filmType = mediaType?.toUpperCase();
    return filmType
      ? rules.filter(item => item.film_type[0] === filmType)
      : rules;
  }

  // 处理规则匹配失败
  handleRuleMatchError(result, order) {
    this.logger.errorSave("报价规则匹配后为空", {
      error: result.error,
      order
    });
  }

  // 处理空规则列表情况
  handleEmptyRuleList(context, extraInfo = {}) {
    const errorMsgs = {
      filmType: "过滤电影格式后匹配报价规则为空",
      finalRule: "最终匹配到的报价规则不存在"
    };

    this.logger.errorSave(errorMsgs[context] || "空规则列表", {
      ...extraInfo,
      context
    });
    return null;
  }

  // 获取成本价
  async getCostPrice(offerRule) {
    const { offerType, quanValue, memberCostPrice } = offerRule;

    if (offerType === "1") {
      this.quanInfoList = [];
      const quanInfo = await this.cardQuanManage.getQuanInfo(
        quanValue,
        this.appFlag
      );
      // 只用多种券类型才会返回数组
      // 这里取一个最小成本价去计算判断能否报价
      if (Array.isArray(quanInfo)) {
        this.quanInfoList = quanInfo;
        const quan_cost = Math.min(...quanInfo.map(item => +item.quan_cost));
        return quan_cost;
      }
      return quanInfo?.quan_cost;
    } else {
      return Number(memberCostPrice);
    }
  }

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
      const isCheckOverrun = await this.handleOverrunCheck(
        adjustedPrice,
        supplier_max_price,
        offerType
      );
      if (isCheckOverrun) {
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
    if (["mayi", "yangcong"].includes(plat_name)) {
      return Math.round(price); // 四舍五入取整
    }
    return price;
  }

  // 超限检查
  async handleOverrunCheck(price, supplier_max_price, offerType) {
    if (price >= Number(supplier_max_price)) {
      const isOverrunOfferEnabled =
        window.localStorage.getItem("isOverrunOffer") === "1";
      // 仅针对用会员卡报价
      if (!isOverrunOfferEnabled && offerType !== "1") {
        this.logger.errorSave(
          `最终报价${price}超过平台限价${supplier_max_price}且超限报价关闭`
        );
        return true;
      }

      // 调整价格至平台限价
      this.adjustToMaxPrice(price, supplier_max_price);
    }
    return false;
  }

  // 调整至平台限价
  adjustToMaxPrice(price, supplier_max_price) {
    if (["mayi", "yangcong"].includes(this.plat_name)) {
      price = Math.floor(supplier_max_price);
    } else {
      price = roundToHalf(supplier_max_price, -1);
    }
    this.logger.infoSave("调整最终报价为平台限价");
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
    if (["shoutu", "mahua"].includes(this.plat_name)) {
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

      let {
        standardPrice: basePrice,
        cinemaCode,
        cinemaId,
        filmId
      } = movieInfo;
      if (basePrice === 0) {
        this.logger.errorSave("获取会员价为0");
        return;
      }
      // 获取可用卡列表
      const cardList = await this.fetchAvailableCards(order, cinemaCode);
      this.logger.infoSave("获取到可用卡列表", { cardList });
      if (!cardList.length && !isTestOrder) return null;

      // 从座位信息里获取优惠活动列表
      let seatParams = {
        cinemaCode,
        cinemaId,
        filmId
      };
      const { api_version } = this;
      if (api_version == "3.0C") {
        seatParams.featureAppNo = movieInfo.featureAppNo;
      } else {
        seatParams.sessionId = movieInfo.sessionId;
      }
      let serviceAddFee;
      const targetSeatRes = await this.seatManage.getSeatLayout(seatParams);
      if (api_version == "3.0C") {
        let discountList = targetSeatRes?.discountList || [];
        let cinemaPlanDto = targetSeatRes.cinemaPlanDto || {};
        serviceAddFee = cinemaPlanDto?.serviceAddFee;
        this.logger.infoSave("获取到可用优惠列表", {
          discountList,
          cinemaPlanDto
        });
        if (discountList.length) {
          // 取最低价
          basePrice = discountList
            .map(item => item.price - item.cinemaPayAmount)
            .sort((a, b) => a - b)?.[0];
          this.logger.infoSave("从优惠活动里取最低价", { basePrice });
        } else {
          basePrice = cinemaPlanDto?.standardPrice;
        }
      } else {
        let areaInfoList = targetSeatRes?.areaInfoList || [];
        this.logger.infoSave("获取到座位价格信息列表", { areaInfoList });
        if (areaInfoList.length) {
          // 取最高价
          basePrice = areaInfoList
            .map(item => item.areaPrice)
            .sort((a, b) => b - a)?.[0];
          if (minAddAmountRule.memberPriceRule == "2") {
            basePrice = this.getMostSeatPrice(
              targetSeatRes.seatData,
              areaInfoList
            );
            this.logger.infoSave("取最多座位价格", { basePrice });
          } else {
            this.logger.infoSave("取最高座位价格", { basePrice });
          }
        }
      }
      this.logger.infoSave("会员服务费", { serviceAddFee });
      if (serviceAddFee) {
        basePrice = +basePrice + Number(serviceAddFee);
        this.logger.infoSave("最低价格+会员服务费", { basePrice });
      }
      // 计算最优折扣
      return this.calculateBestDiscount(cardList, basePrice);
    } catch (error) {
      this.logger.errorSave("获取会员价异常", error);
      return null;
    }
  }

  // 获取最多座位价格
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
      let mostSeatPrice = areaRatioList[0]?.areaPrice;
      return mostSeatPrice;
      // // 默认取最高价格，最高座位占比不足百分之3时取次最高价格
      // if (areaList[0].numRatio <= 3 && areaList[1]?.settlePrice) {
      //   maxSeatPrice = areaList[1].settlePrice;
      // }
      // if (areaList[1].numRatio <= 3 && areaList[2]?.settlePrice) {
      //   maxSeatPrice = areaList[2].settlePrice;
      // }
    } catch (error) {
      this.logger.infoSave(
        "座位分区剩余座位占比计算失败",
        formatErrInfo(error)
      );
    }
  }
  // 获取可用会员卡列表
  async fetchAvailableCards(order, cinemaCode) {
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
      .filter(item => this.checkCinemaLink(item, cinemaCode));
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
  checkCinemaLink(item, cinemaCode) {
    return (
      !item.linkCinemaIds || item.linkCinemaIds.split(",").includes(cinemaCode)
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
    const discount = bestCard.card_discount;
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
      const { fixedRules, addRules } = this.splitRuleTypes(generalRules);

      // 3. 处理固定报价规则的券库存校验
      const validFixedRules = await this.validateQuanStock({
        rules: fixedRules,
        movieInfo,
        ticketNum: order.ticket_num
      });

      // 4. 处理会员价加价规则
      let bestFixAddRule = null;
      if (addRules.length) {
        let minAddAmountRule = addRules[0];
        const memberPriceRes = await this.getMemberPrice({
          order,
          movieData: movieInfo,
          minAddAmountRule
        });
        if (memberPriceRes) {
          bestFixAddRule = this.processAddRule(
            minAddAmountRule,
            memberPriceRes
          );
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
      addRules: rules
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
      cinemaCode: movieInfo.cinemaCode,
      cinemaId: movieInfo.cinemaId,
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
      processedRule.memberCostPrice
    );
    processedRule.memberOfferAmount =
      processedRule.round_member_price + Number(processedRule.addAmount);

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
  // 获取电影信息
  async getMovieInfo() {
    const buyTicketInfo = await this.cinemaManage.getBuyPrevCinemaInfo({
      flag: 1
    });
    const { targetShow, cinemaCode, cinemaId, filmId } = buyTicketInfo || {};
    return buyTicketInfo
      ? { ...(targetShow || {}), cinemaCode, cinemaId, filmId }
      : null;
  }
}

// 测试报价实例的方法
window.chenxingOfferObj = (plat_name, app_name) => {
  return new getChenxingOfferPrice({ appFlag: app_name, plat_name });
};
// 测试方法
// window.chenxingOfferObj("mayi", "hsmzyc").getMemberPrice({
//   plat_name: "mayi",
//   id: "12412221440316515",
//   tpp_price: 42,
//   supplier_max_price: 39,
//   city_name: "南京",
//   cinema_addr: "雨花台区软件大道109号雨花客厅E-PARK北区3层",
//   ticket_num: 2,
//   cinema_name: "AMG海上明珠影城（南京雨花客厅IMAX店）",
//   hall_name: "1号儿童主题厅",
//   film_name: "“骗骗”喜欢你",
//   film_img:
//     "https://gw.alicdn.com/tfscom/i4/O1CN01e8PcvF1NESAgdEsnM_!!6000000001538-0-alipicbeacon.jpg_120x120.jpg",
//   show_time: "2024-12-22 16:30:00",
//   rewards: 0,
//   is_urgent: false,
//   cinema_group: "AMG海上明珠",
//   cinema_code: 45702,
//   order_number: "12412221440316515",
//   offer_end_time: 1734849690000,
//   app_name: "hsmzyc"
// });
export default getChenxingOfferPrice;
