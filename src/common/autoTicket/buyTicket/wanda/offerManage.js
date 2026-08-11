/**
 * 万达报价管理模块
 *
 * 职责：
 * - 继承 BaseOfferPrice 基类，实现 万达系列报价逻辑
 * - 报价规则匹配、会员价获取、成本价计算、最终报价计算
 *
 * 所属流程：报价流程
 *
 * 依赖模块：
 * - BaseOfferPrice: 报价基类，提供模板方法
 * - WandaCardQuanManage: 卡券管理模块
 * - WandaCinemaManage: 影院管理模块
 * - WandaSeatManage: 座位管理模块
 *
 * @module wanda/offerManage
 */
import {
  offerRuleMatch,
  roundToHalf,
  formatErrInfo,
  getCinemaLoginInfoList,
  getCurrentDay,
  isDateInCurrentMonth
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import {
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  ONE_STEP_PLAT_LIST
} from "@/common/constant.js";
import { platTokens } from "@/store/platTokens";
import {
  getQuanTypeListByApp,
  filterFixedRulesByDailyTicketCount
} from "../../commonQuanStock.js";
import Logger from "@/common/logger.js";
import BaseOfferPrice from "@/common/core/BaseOfferPrice.js";
import WandaCardQuanManage from "./cardQuanManage.js";
import WandaCinemaManage from "./cinemaManage.js";
import WandaSeatManage from "./seatManage.js";
import { dictTable } from "@/store/dictTable";
import {
  applyDynamicPricing,
  applyProfitAddition,
  applyNightMaxPrice,
  handleOverrunCheck,
  calcOfferCostProfitParts
} from "../common/offerHelper";
import { calculateMostSeatPrice } from "../common/seatPriceHelper";

const tokens = platTokens();
const dictStore = dictTable();

class WandaOfferPrice extends BaseOfferPrice {
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
    this.cardQuanManage = new WandaCardQuanManage(order, this.logger);
    this.cinemaManage = new WandaCinemaManage(order, this.logger);
    this.seatManage = new WandaSeatManage(order, this.logger, false);
  }

  /**
   * 获取最终匹配的报价规则
   * @param {Object} order - 待报价订单信息
   * @returns {Promise<Object|null>} 匹配到的报价规则对象或null
   */
  async getEndMatchOfferRule(order) {
    try {
      // 1. 初始规则匹配
      const matchRuleListRes = offerRuleMatch(order, this.logger);
      let matchRuleList = matchRuleListRes?.matchRuleList || [];
      // 测试订单且没有匹配规则时，使用测试规则
      if (this.isTestOrder && !matchRuleList?.length) {
        matchRuleList = [
          {
            id: 1759,
            ruleName: "万达测试",
            orderForm: "mayi",
            app_type: "wanda_applet",
            shadowLineName: "wanda",
            includeCityNames: ["南京"],
            excludeCityNames: [],
            includeCinemaNames: ["南京万达影城江宁太阳城店"],
            includeCinemaCodes: "282_497",
            excludeCinemaNames: [],
            excludeCinemaCodes: "",
            includeHallNames: [],
            excludeHallNames: [],
            includeFilmNames: [],
            excludeFilmNames: [],
            timeLimit: null,
            quanValue: "",
            offerType: "2",
            weekDay: [],
            seatNum: "",
            memberDay: "",
            status: "2",
            update_time: "2026-06-06 10:32:44",
            user_id: "1",
            user_name: "张三",
            platOfferList: [{ platName: "mayi", value: "99", isSyncPlat: "" }],
            rule: 2,
            autoUseQuanStatus: "2",
            autoUseQuanPrice: "",
            auto_quan_value: "",
            remark: "",
            film_type: "",
            memberPriceRule: "",
            allow_offer_time: "",
            last_used_time: "",
            is_sync_plat: 2,
            addAmount: "1"
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
      this.logger.infoSave("获取电影信息", { movieInfo });
      if (!movieInfo) {
        return null;
      }

      // 2.1 电影特殊标签黑名单过滤（字典 wandaMovieBlacklistLabels 配置，多个值用英文逗号分隔）
      // 命中黑名单的场次（如"海报收藏家"等特殊活动标签）不进行报价
      const blacklistLabels =
        dictStore.dictInfo.wandaMovieBlacklistLabels
          ?.split(",")
          .map(s => s.trim())
          .filter(Boolean) || [];
      if (
        blacklistLabels.length &&
        movieInfo.showTypeLabelName &&
        blacklistLabels.includes(movieInfo.showTypeLabelName)
      ) {
        this.logger.errorSave("电影命中万达黑名单标签，不报价", {
          showTypeLabelName: movieInfo.showTypeLabelName,
          blacklistLabels
        });
        return null;
      }

      matchRuleList = this.filterByFilmType(matchRuleList, movieInfo.media);
      if (!matchRuleList.length) {
        this.logger.errorSave("按电影格式存筛选后，报价规则为空", {
          filmType: movieInfo.media,
          matchRuleList
        });
        return;
      }

      // 3. 获取最低报价规则
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
          this.logger.warnSave("最终匹配到的报价规则为空");
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
      let adjustedPrice = applyDynamicPricing({
        basePrice: price,
        offerList,
        logger: this.logger
      });

      // 2. 利润加价处理
      adjustedPrice = applyProfitAddition({
        price: adjustedPrice,
        offerType,
        appFlag: this.appFlag,
        groupList: GROUP_LIST,
        logger: this.logger
      });

      // 3. 夜间顶价处理
      adjustedPrice = applyNightMaxPrice({
        price: adjustedPrice,
        supplier_max_price,
        logger: this.logger
      });

      // 4. 超限检查处理
      adjustedPrice = await handleOverrunCheck({
        price: adjustedPrice,
        supplier_max_price,
        plat_name: this.plat_name,
        logger: this.logger
      });
      if (!adjustedPrice) {
        return null;
      }

      // 5. 成本利润计算
      return this.calculateCostProfit({
        adjustedPrice,
        cost_price,
        rewards,
        supplier_max_price,
        offerRule
      });
    } catch (error) {
      this.logger.errorSave("计算最终报价异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 成本利润计算
   * @param {Object} params - 计算参数
   * @returns {number|null} 最终报价或null（利润不足）
   */
  calculateCostProfit({
    adjustedPrice,
    cost_price,
    rewards,
    supplier_max_price,
    offerRule
  }) {
    const parts = calcOfferCostProfitParts({
      adjustedPrice,
      cost_price,
      rewards,
      order: this.order
    });
    const {
      shouxufei,
      rewardPrice,
      pay_cost_price,
      real_cost_price,
      expectProfit,
      maxCostPrice
    } = parts;

    // 使用放大 1000 倍后的整数差值做利润校验，避免浮点精度问题
    const profitDiff =
      Math.round(Number(adjustedPrice || 0) * 1000) -
      Math.round(Number(real_cost_price || 0) * 1000);
    if (profitDiff <= 0 && !TEST_NEW_PLAT_LIST.includes(this.plat_name)) {
      let str = `最终报价${adjustedPrice}低于真实成本${real_cost_price}`;
      this.logger.errorSave(str);
      return null;
    }

    // 最大卡券成本（即成本必须低于它才有利润）
    offerRule.maxCostPrice = maxCostPrice;

    this.logger.infoSave("万达计算报价相关信息", {
      rule_price: "规则计算报价：" + adjustedPrice,
      profitAddPrice:
        "单店加价金额：" + (adjustedPrice - this.getOfferBasePrice(offerRule)),
      supplier_max_price: "平台最高限价：" + supplier_max_price,
      cardQuanCost: "卡券成本：" + cost_price,
      maxCostPrice: "最大卡券成本（低于该值才有利润）：" + maxCostPrice,
      price: "最终报价：" + adjustedPrice,
      shouxufei: "手续费（最终报价*1%）：" + shouxufei,
      cost_price: "出票成本（卡券成本+手续费）：" + pay_cost_price,
      rewardPrice: `奖励金额(最终报价*奖励百分比-${rewards})：` + rewardPrice,
      real_cost_price: "真实成本（出票成本-奖励金额）：" + real_cost_price,
      expectProfit: "预计利润（最终报价-真实成本）：" + expectProfit
    });

    return adjustedPrice;
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
      let { fixedRules, addAmountRuleList } = this.splitRuleTypes(generalRules);
      if (movieInfo?.media && fixedRules.length) {
        let film_type = movieInfo.media?.toUpperCase();
        if (film_type) {
          fixedRules = fixedRules.filter(item =>
            item.film_type?.length
              ? item.film_type.some(itemA => film_type.includes(itemA))
              : true
          );
          this.logger.infoSave("根据电影格式过滤后的固定报价规则列表", {
            fixedRules
          });
        }
      }
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
      quanTypeList: appQuanTypeList
    });

    if (!appQuanTypeList?.length) return [];
    let validFixedRules = this.applyQuanStockFilter(
      rules,
      appQuanTypeList,
      ticketNum
    );
    if (validFixedRules.length) {
      const useMobileList = getCinemaLoginInfoList(!order?.need_unsplit_login)
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
    const { targetShow, ...otherParams } = buyTicketInfo || {};
    return buyTicketInfo ? { ...(targetShow || {}), ...otherParams } : null;
  }

  /**
   * 获取会员价
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Object} params.movieData - 电影数据（可选）
   * @param {Object} params.minAddAmountRule - 加价规则
   * @returns {Promise<Object|null|number>} 会员价信息或null或错误码
   */
  async getMemberPrice({ order, movieData, minAddAmountRule }) {
    try {
      console.log("准备获取会员价", order);
      // 1、获取电影信息
      const movieInfo = movieData || (await this.getMovieInfo());
      if (!movieInfo) {
        this.logger.infoSave("获取电影信息失败");
        return -1;
      }
      let { member_price, city_id, cinema_id, show_id, showtimeId } = movieInfo;
      const { ticket_num, app_name } = order;

      // 2、获取可用卡列表
      const cardList = await this.cinemaManage.getUsableCardList(
        cinema_id,
        ticket_num
      );
      this.logger.infoSave("获取到可用卡列表", { cardList });
      if (!cardList.length) return null;

      console.log("showtimeId", showtimeId);

      // 3、获取座位价格（决定 basis price）
      if (showtimeId && this.seatManage) {
        const seatInfo = await this.seatManage.getSeatLayout({
          dId: showtimeId,
          json: true
        });
        if (!seatInfo) return -3;
        console.warn("获取座位布局返回", seatInfo);
        const areaInfoList = seatInfo.areaInfoList || [];
        let basePrice = member_price || 0;
        if (areaInfoList.length) {
          const areaList = areaInfoList
            .map(a => ({ price: a?.salesPrice || 0 }))
            .sort((a, b) => b.price - a.price);
          basePrice = areaList[0]?.price || 0;

          if (minAddAmountRule?.memberPriceRule == "2") {
            basePrice = this.getMostSeatPrice(seatInfo);
            this.logger.infoSave("最多座位价格当做会员价", {
              mostSeatPrice: basePrice
            });
          }
          this.logger.infoSave("取最贵座位价格和会员价的最大值当会员价", {
            member_price,
            basePrice
          });
          basePrice = Math.max(member_price || 0, basePrice);
        }
        if (!areaInfoList?.length || !seatInfo?.seatData?.length) {
          this.logger.errorSave("获取座位布局异常，先不报价");
          return;
        }
        basePrice = basePrice / 100;
        // 计算最优折扣
        return this.calculateBestDiscount(cardList, basePrice);
      } else {
        this.logger.errorSave("未获取到最贵座位价格");
      }
    } catch (error) {
      this.logger.errorSave("获取会员价异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
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
   * 获取最多有效座位的价格
   */
  getMostSeatPrice(seatData) {
    const areas = seatData.area || [];
    if (!areas.length) return 0;
    // 统计每个区域座位数，返回座位最多的区域价格
    let maxCount = 0;
    let mostPrice = 0;
    for (const area of areas) {
      const count = area.seat?.filter(item => item.status == 1)?.length || 0;
      const price = area.areaPrice?.salesPrice || 0;
      if (count > maxCount) {
        maxCount = count;
        mostPrice = price;
      }
    }
    return mostPrice;
  }
}

export default WandaOfferPrice;

// 测试报价实例的方法
window.wandaOfferObj = (plat_name, app_name) => {
  return new WandaOfferPrice({
    appFlag: app_name,
    plat_name,
    isTestOrder: true
  });
};

const orderJson = {
  plat_name: "mayi",
  id: "12606061019105298",
  tpp_price: 59.9,
  supplier_max_price: 55,
  city_name: "南京",
  cinema_addr: "海淀区复兴路69号万达广场5层",
  ticket_num: 1,
  cinema_name: "万达影城(江宁太阳城CINITY店)",
  hall_name: "口味王-1号激光厅",
  film_name: "火遮眼",
  film_img:
    "https://gw.alicdn.com/tfscom/i4/O1CN016LYLnt1YDVEiSlL9b_!!6000000003025-0-alipicbeacon.jpg_400x400",
  show_time: "2026-06-11 18:30",
  rewards: 0,
  is_urgent: "",
  cinema_group: "万达",
  cinema_code: "32019011",
  order_number: "12606061019105298",
  offer_end_time: 1786155852000,
  app_name: "wanda",
  appName: "wanda",
  app_type_code: "wanda_applet"
};
// 获取订单最终报价：
// window.wandaOfferObj("mayi", "wanda").getEndOfferPrice({ order: orderJson, offerList: [] })
