/**
 * UME报价管理模块
 *
 * 职责：
 * - 继承 BaseOfferPrice 基类，实现 UME 系列报价逻辑
 * - 报价规则匹配、会员价获取、成本价计算、最终报价计算
 *
 * 所属流程：报价流程
 *
 * 依赖模块：
 * - BaseOfferPrice: 报价基类，提供模板方法
 * - UmeCardQuanManage: 卡券管理模块
 * - UmeCinemaManage: 影院管理模块
 * - UmeSeatManage: 座位管理模块
 *
 * @module ume/offerManage
 */
import {
  offerRuleMatch,
  roundToHalf,
  formatErrInfo,
  getCinemaLoginInfoList,
  calcCount,
  getCurrentDay,
  isDateInCurrentMonth,
  calculateMarkup,
  getPreviousDay,
  findMostRepeatedChars,
  getMovieInfoFromFilmName
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import {
  GET_UME_LIST,
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST,
  ONE_STEP_PLAT_LIST
} from "@/common/constant.js";
import {
  applyDynamicPricing,
  applyProfitAddition,
  applyNightMaxPrice,
  handleOverrunCheck,
  calcOfferCostProfitParts
} from "../common/offerHelper";
import { platTokens } from "@/store/platTokens";
import {
  getQuanTypeListByApp,
  filterFixedRulesByDailyTicketCount
} from "../../commonQuanStock.js";
import Logger from "@/common/logger.js";
import BaseOfferPrice from "@/common/core/BaseOfferPrice.js";
import UmeCardQuanManage from "./cardQuanManage.js";
import UmeCinemaManage from "./cinemaManage.js";
import UmeSeatManage from "./seatManage.js";

const tokens = platTokens();

class getUmeOfferPrice extends BaseOfferPrice {
  constructor({ appFlag, plat_name }) {
    super({ appFlag, plat_name });
    this.appApi = APP_API_OBJ[appFlag];
  }

  /**
   * 初始化依赖模块
   * @param {Object} order - 订单信息对象
   * @param {string} order.plat_name - 平台名称
   * @param {string} order.app_name - 影院标识
   * @param {string} order.order_number - 订单号
   */
  initModules(order) {
    this.logger = new Logger({ logType: 1 }); // 日志管理模块
    this.logger.init(order);
    this.cardQuanManage = new UmeCardQuanManage(order, this.logger); // 卡券管理模块
    this.cinemaManage = new UmeCinemaManage(order, this.logger); // 影院管理模块
    this.seatManage = new UmeSeatManage(order, this.logger, false); // 座位管理模块
  }

  /**
   * 获取最终匹配的报价规则
   *
   * @param {Object} order - 待报价订单信息
   * @param {string} order.plat_name - 平台名称
   * @param {string} order.app_name - 影院标识
   * @param {string} order.city_name - 城市名称
   * @param {string} order.cinema_name - 影院名称
   * @param {string|number} order.cinema_code - 影院编码
   * @param {string} order.film_name - 电影名称
   * @param {string} order.hall_name - 影厅名称
   * @param {string} order.show_time - 放映时间，格式：YYYY-MM-DD HH:mm:ss
   * @param {number} order.ticket_num - 票数
   *
   * @returns {Promise<Object|null>} 匹配到的报价规则对象，匹配失败返回 null
   */
  async getEndMatchOfferRule(order) {
    try {
      const matchRuleListRes = offerRuleMatch(order, this.logger);
      let matchRuleList = matchRuleListRes?.matchRuleList || [];
      if (!matchRuleList?.length) {
        this.logger.infoSave("报价规则匹配后规则为空", {
          error: matchRuleListRes?.error,
          order
        });
        return null;
      }
      matchRuleList = JSON.parse(JSON.stringify(matchRuleList));

      // 判断规则里是否有指定电影格式的（2D/3D）
      let filmTypeFlag = matchRuleList.some(item => !!item?.film_type?.length);
      let movieInfo, filmType;

      // 获取电影放映信息以匹配电影格式
      movieInfo = await this.getMovieInfo(order);
      if (!movieInfo) {
        this.logger.infoSave(
          "报价规则匹配时获取当前场次电影信息失败，直接不报"
        );
        return null;
      }
      this.logger.infoSave("获取电影信息", { movieInfo });

      if (filmTypeFlag) {
        // 当前场次电影格式
        filmType = movieInfo.localFilmVersion;
        if (filmType) {
          filmType = filmType.toUpperCase();
          matchRuleList = matchRuleList.filter(item =>
            item.film_type?.length
              ? item.film_type.some(itemA => filmType.includes(itemA))
              : true
          );
        }
      }

      if (!matchRuleList?.length) {
        this.logger.errorSave("按电影格式存筛选后，报价规则为空", {
          filmType,
          matchRuleList
        });
        return null;
      }

      // 获取报价最低的报价规则
      let endRule = await this.getMinAmountOfferRule(
        matchRuleList,
        order,
        movieInfo
      );
      console.warn("最终匹配到的报价规则", endRule);
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
      endRule = JSON.parse(JSON.stringify(endRule));
      return endRule;
    } catch (error) {
      this.logger.errorSave("获取最终匹配报价规则异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  // 成本价逻辑沿用 BaseOfferPrice.getCostPrice 默认实现

  /**
   * 计算最终报价
   *
   * @param {Object} params - 计算参数
   * @param {number} params.cost_price - 成本价
   * @param {number} params.supplier_max_price - 平台最高限价
   * @param {number} params.price - 规则计算的基础报价
   * @param {number} params.rewards - 奖励百分比（0-100）
   * @param {string} params.offerType - 报价类型
   * @param {Array} [params.offerList] - 历史报价列表（用于动态调价）
   * @param {Object} params.offerRule - 报价规则对象（会被修改，添加 maxCostPrice 字段）
   *
   * @returns {Promise<number|null>} 最终报价金额，计算失败或利润不足返回 null
   */
  async calculateFinalPrice(params) {
    const {
      cost_price,
      supplier_max_price,
      rewards,
      offerType,
      offerList,
      offerRule
    } = params;

    try {
      // 1. 动态调价处理
      let adjustedPrice = applyDynamicPricing({
        basePrice: params.price,
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
      this.logger.errorSave("获取最终报价异常", {
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
      plat_name: this.plat_name,
      noFeePlatList: NO_FEE_PLAT_LIST
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

    this.logger.infoSave("ume计算报价相关信息", {
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
   * 获取报价最低的报价规则
   * @param {Array} ruleList - 规则列表
   * @param {Object} order - 订单信息
   * @param {Object} movieInfo - 电影信息
   * @returns {Promise<Object|null>} 最低报价规则或null
   */
  async getMinAmountOfferRule(ruleList, order, movieInfo) {
    try {
      // 1、有会员日报价规则命中优先使用会员日报价规则
      let onlyMemberDayRuleList = ruleList.filter(
        item => item.memberDay && item.offerType === "3" && item.offerAmount
      );
      // 报价从低到高排序
      onlyMemberDayRuleList.sort(
        (itemA, itemB) => itemA.offerAmount - itemB.offerAmount
      );
      console.log("命中会员日报价规则从小往大排序", onlyMemberDayRuleList);
      if (onlyMemberDayRuleList.length) {
        this.logger.infoSave("命中会员日报价规则");
        return onlyMemberDayRuleList[0];
      }

      // 2、比对那个报价更低，就用那个规则出
      let otherRuleList = ruleList.filter(
        item => !item.memberDay && item.offerType !== "3"
      );
      console.warn("排除会员日后的其它规则", otherRuleList);

      // 日常固定报价规则
      let fixedAmountRuleList = otherRuleList.filter(
        item => item.offerType === "1" && item.offerAmount
      );
      if (movieInfo?.localFilmVersion && fixedAmountRuleList.length) {
        let film_type = movieInfo.localFilmVersion?.toUpperCase();
        if (film_type) {
          fixedAmountRuleList = fixedAmountRuleList.filter(item =>
            item.film_type?.length
              ? item.film_type.some(itemA => film_type.includes(itemA))
              : true
          );
          this.logger.infoSave("根据电影格式过滤后的固定报价规则列表", {
            fixedAmountRuleList
          });
        }
      }
      const useMobileList = getCinemaLoginInfoList(!order?.need_unsplit_login)
        .filter(
          item =>
            item.app_name === order.app_name && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      const appQuanTypeList = await getQuanTypeListByApp({
        order,
        getQuanListByPhone: this.cardQuanManage.getQuanListByPhone.bind(
          this.cardQuanManage
        ),
        extraParams: {
          cinemaCode: movieInfo.cinemaCode,
          cinemaLinkId: movieInfo.cinemaLinkId
        },
        logger: this.logger
      });

      this.logger.infoSave("根据影院获取券类型列表返回", {
        quanTypeList: appQuanTypeList.map(
          ({ quanStockListByPhone, ...item }) => item
        ),
        useMobileList
      });
      if (fixedAmountRuleList.length) {
        // 校验其库存，进行过滤
        if (appQuanTypeList?.length) {
          fixedAmountRuleList = fixedAmountRuleList.filter(item => {
            // 查找是否有目标券可以出的
            return appQuanTypeList.some(
              itemA =>
                item.quanValue?.split(",")?.includes(itemA.quan_value) &&
                itemA?.quan_stock >= order.ticket_num
            );
          });
          this.logger.infoSave("根据券库存过滤后的固定报价规则列表", {
            fixedAmountRuleList
          });
          if (fixedAmountRuleList.length) {
            fixedAmountRuleList = await filterFixedRulesByDailyTicketCount({
              fixedAmountRuleList,
              appQuanTypeList,
              useMobileList,
              order,
              logger: this.logger
            });
          }
        } else {
          fixedAmountRuleList = [];
          this.logger.infoSave(
            "根据影院获取券类型列表为空，固定报价规则列表进行置空处理",
            {
              appQuanTypeList
            }
          );
        }
      }
      let mixFixedAmountRule = fixedAmountRuleList.sort(
        (itemA, itemB) => itemA.offerAmount - itemB.offerAmount
      )?.[0];

      // 会员价加价报价规则
      let addAmountRuleList = otherRuleList.filter(
        item => item.offerType === "2" && item.addAmount
      );
      let minAddAmountRule = addAmountRuleList?.[0];
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

      if (minAddAmountRule) {
        let addMountRule = minAddAmountRule.addAmount?.split(";");
        if (addMountRule.length === 1) {
          minAddAmountRule.realAddMount = addMountRule[0];
        } else if (addMountRule.length > 1) {
          minAddAmountRule.addMountRule = addMountRule.slice();
        }

        // 计算会员报价
        let memberPriceRes = await this.getMemberPrice({
          order,
          movieData: movieInfo,
          minAddAmountRule
        });
        if (memberPriceRes === -1) {
          this.logger.infoSave("获取当前场次电影信息失败，直接不报");
          return null;
        }

        if (!memberPriceRes) {
          console.warn(
            "最小加价规则获取会员价失败,返回最小固定报价规则",
            mixFixedAmountRule
          );
          this.logger.infoSave(
            "最小加价规则获取会员价失败,返回最小固定报价规则",
            {
              memberPriceRes,
              fixedOfferAmount: mixFixedAmountRule?.offerAmount
            }
          );
          return mixFixedAmountRule;
        }
        // 真实会员价
        minAddAmountRule.real_member_price = memberPriceRes.real_member_price;
        if (
          !minAddAmountRule.realAddMount &&
          minAddAmountRule.addMountRule?.length > 1
        ) {
          let realAddMount = this.getRealAddMount({
            real_member_price: memberPriceRes.real_member_price,
            addMountRule: minAddAmountRule.addMountRule
          });
          if (!realAddMount) {
            this.logger.infoSave("获取真实加价金额失败,返回最小固定报价规则", {
              real_member_price: memberPriceRes.real_member_price,
              addMountRule: minAddAmountRule.addMountRule
            });
            return mixFixedAmountRule;
          }
          minAddAmountRule.realAddMount = realAddMount;
        }

        // 最小折扣
        minAddAmountRule.member_discount = memberPriceRes.discount;
        // 会员成本价(真实会员价*折扣价)
        minAddAmountRule.memberCostPrice = memberPriceRes.member_price;
        // 会员成本价不为0.5的整数倍时进0.5
        minAddAmountRule.round_member_price = roundToHalf(
          minAddAmountRule.memberCostPrice,
          ONE_STEP_PLAT_LIST.includes(order.plat_name) ? 0.1 : 0.5
        );
        // 会员预计报价
        minAddAmountRule.memberOfferAmount =
          minAddAmountRule.round_member_price +
          Number(minAddAmountRule.realAddMount);
        this.logger.infoSave("会员报价最终信息", {
          real_member_price:
            "真实会员价：" + minAddAmountRule.real_member_price,
          member_discount: "会员最小折扣" + minAddAmountRule.member_discount,
          memberCostPrice:
            "会员成本价（真实会员价*折扣）：" +
            minAddAmountRule.memberCostPrice,
          addAmount: "最小加价金额：" + minAddAmountRule.realAddMount,
          round_member_price:
            "会员成本价按0.5向上取整数倍：" +
            minAddAmountRule.round_member_price,
          memberOfferAmount:
            "会员预计报价：" + minAddAmountRule.memberOfferAmount
        });
      } else {
        console.warn(
          "最小加价规则不存在,返回最小固定报价规则",
          mixFixedAmountRule
        );
        this.logger.infoSave("最小加价规则不存在,返回最小固定报价规则", {
          fixedOfferAmount: mixFixedAmountRule?.offerAmount
        });
        return mixFixedAmountRule;
      }
      if (!mixFixedAmountRule) {
        console.warn(
          "最小固定报价规则不存在，返回最小加价规则",
          minAddAmountRule
        );
        return minAddAmountRule;
      }
      if (
        minAddAmountRule.memberOfferAmount >=
        Number(mixFixedAmountRule.offerAmount)
      ) {
        this.logger.infoSave("会员报价高于固定报价，返回最小固定报价规则", {
          memberOfferAmount: minAddAmountRule.memberOfferAmount,
          fixedOfferAmount: mixFixedAmountRule.offerAmount
        });
        return mixFixedAmountRule;
      } else {
        this.logger.infoSave("会员报价低于固定报价，返回最小加价报价规则", {
          memberOfferAmount: minAddAmountRule.memberOfferAmount,
          fixedOfferAmount: mixFixedAmountRule.offerAmount
        });
        return minAddAmountRule;
      }
    } catch (error) {
      this.logger.errorSave("获取最低报价规则异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  // 获取真实加价金额逻辑沿用 BaseOfferPrice.getRealAddMount 默认实现

  /**
   * 获取会员价
   *
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {string} params.order.app_name - 影院标识
   * @param {number} params.order.ticket_num - 票数
   * @param {Object} [params.movieData] - 电影放映信息（可选，不传则内部获取）
   * @param {Object} params.minAddAmountRule - 加价规则
   *
   * @returns {Promise<Object|null|-1>} 会员价信息对象：
   *   - real_member_price: 真实会员价（未折扣）
   *   - member_price: 成本价（已折扣）
   *   - discount: 最小折扣
   *   获取电影信息失败返回 -1，其他失败返回 null
   */
  async getMemberPrice({ order, movieData, minAddAmountRule }) {
    const { appFlag } = this;
    try {
      console.log("准备获取会员价", order);
      const { ticket_num, app_name } = order;
      // 获取当前场次电影信息，防止接口重复掉
      let movieInfo = movieData;
      if (!movieData) {
        movieInfo = await this.getMovieInfo(order);
      }
      console.log("待报价订单当前场次电影相关信息", movieInfo);
      if (!movieInfo) {
        console.error("获取当前场次电影信息失败", "不再进行报价");
        return -1;
      }
      let {
        ticketMemberPrice,
        maxSeatPrice = 0,
        mostSeatPrice = 0,
        handlingFee,
        ticketMemberServiceFeeMin = 0,
        activityPrices = []
      } = movieInfo;
      this.logger.infoSave("获取会员价相关信息0", {
        ticketMemberPrice: "会员价：" + ticketMemberPrice,
        maxSeatPrice: "座位最高价：" + maxSeatPrice,
        handlingFee: "真实手续费：" + handlingFee,
        ticketMemberServiceFeeMin: "会员服务费：" + ticketMemberServiceFeeMin,
        activityPrices
      });
      let member_price = Math.max(ticketMemberPrice, maxSeatPrice) / 100;
      if (minAddAmountRule.memberPriceRule == "2") {
        member_price = Math.max(ticketMemberPrice, mostSeatPrice) / 100;
        this.logger.infoSave("报价规则从最多座位价格获取会员价", {
          ticketMemberPrice,
          mostSeatPrice
        });
      }
      if (member_price === 0) {
        // 会员价为0
        this.logger.errorSave("获取会员价为0", {
          ticketMemberPrice,
          maxSeatPrice
        });
        return null;
      }
      // 会员价等于真实会员价加手续费加会员服务费
      member_price =
        member_price +
        (Number(handlingFee) + Number(ticketMemberServiceFeeMin)) / 100;
      console.log("获取会员价", member_price);
      // 耀莱暂时不考虑
      if (
        appFlag !== "yaolai" &&
        activityPrices?.length &&
        GET_UME_LIST().includes(appFlag)
      ) {
        // [{
        //    "activityId": 23,
        //    "activityCode": "YPHD000000023",
        //    "filmActivityType": "10",
        //    "promotionMethod": "UNITY",
        //    "activityName": "【华中区】周一会员日",
        //    "amountOrSale": 610.00, // 优惠金额
        //    "partCardType": "CHOOSE"
        //  }]
        // 如果存在会员活动会员价先减1，不减amountOrSale是因为怕把价格压下去
        // member_price = member_price - 1;
      }
      if (member_price > 0) {
        const cardRes = await svApi.queryCardList({
          app_name: app_name,
          rule: tokens.userInfo.rule,
          status: "1",
          isNeedTotalNum: 0,
          queryFields:
            "mobile,card_num,card_discount,linkCinemaIds,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
        });
        let list = cardRes.data.cardList || [];
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
        const useMobileList = getCinemaLoginInfoList(!order?.need_unsplit_login)
          .filter(
            item => item.app_name === app_name && item.mobile && item.session_id
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
            (use_limit_day
              ? ticket_num <= use_limit_day - daily_usage
              : true) &&
            (use_limit_month
              ? ticket_num <= use_limit_month - month_usage
              : true)
          );
        });
        this.logger.infoSave("根据当天及当月出票量限制过滤后", {
          cardListLimit: cardListLimit.map(item => item.card_num)
        });
        // 过滤指定卡
        let cardList = cardListLimit.filter(item => {
          return !item.linkCinemaIds
            ? true
            : item.linkCinemaIds
                .split(",")
                .some(itemA => itemA == movieInfo.cinemaCode);
        });
        this.logger.infoSave("根据制定影院过滤后的卡列表", {
          cardList: cardList.map(item => item.card_num)
        });
        if (!cardList.length) {
          this.logger.errorSave("该影院没有可用会员卡", {
            ticket_num,
            cinemaCode: movieInfo.cinemaCode,
            cinema_name: order.cinema_name
          });
          return null;
        }
        cardList = cardList.map(item => ({
          ...item,
          card_discount: !item.card_discount ? 100 : Number(item.card_discount)
        }));
        // console.log("cardList", cardList);
        cardList.sort((a, b) => a.card_discount - b.card_discount);
        // 按最低折扣取值报价
        let discount = cardList[0]?.card_discount;
        let real_member_price = Number(member_price);
        member_price = discount
          ? (Number(member_price) * 100 * discount) / 10000
          : Number(member_price);
        this.logger.infoSave("获取会员价相关信息1", {
          real_member_price:
            "真实会员价（会员价+手续费+服务费）：" + real_member_price,
          discount: "最小折扣：" + discount,
          cost_member_price:
            "会员成本价（真实会员价*折扣）：" + Number(member_price.toFixed(2))
        });
        return {
          real_member_price,
          member_price: Number(member_price.toFixed(2)),
          discount
        };
      } else {
        console.warn("会员价未负，非会员价");
      }
    } catch (error) {
      this.logger.errorSave("获取会员价异常", { error: formatErrInfo(error) });
      return null;
    }
  }

  /**
   * 获取电影信息（报价时使用）
   * @param {Object} item - 订单信息
   * @returns {Promise<Object|null>} 电影信息（包含场次信息）或null
   */
  async getMovieInfo(item) {
    const { appFlag } = this;
    let {
      city_name,
      film_name,
      hall_name,
      show_time,
      cinema_code,
      cinema_name
    } = item;
    try {
      this.cinemaManage.cacheHit = 0;
      // ======== 第三方 ID 缓存复用（完整版）：命中则跳过城市影院列表 + 影片列表 + 影片名匹配 ========
      let cinemaCode, cinemaLinkId, filmUniqueId;
      let cacheHit = 0;
      const cachedIds = await this.cinemaManage.tryGetCachedThirdPartyIds();
      if (cachedIds?.cinemaCode && cachedIds?.cinemaLinkId && cachedIds?.filmUniqueId) {
        cinemaCode = cachedIds.cinemaCode;
        cinemaLinkId = cachedIds.cinemaLinkId;
        filmUniqueId = cachedIds.filmUniqueId;
        cacheHit = this.cinemaManage.cacheSource;
        this.logger.infoSave("命中第三方ID缓存，跳过城市影院列表+影片列表+影片名匹配", {
          cachedIds
        });
      } else {
        // 1、获取城市影院列表
        let cityCinemaListRes = await this.cinemaManage.getCityCinemaList();
        const cityCinemaList = cityCinemaListRes?.cityCinemaList || [];
        if (!cityCinemaList.length) {
          this.logger.errorSave("获取城市影院列表失败", {
            error: cityCinemaListRes?.error
          });
          return null;
        }
        let cinemaList =
          cityCinemaList?.map(item => item.cinemaList)?.flat() || [];
        console.log("获取全部影院列表返回", cinemaList);

        // 2、获取目标影院
        let targetCinema = cinemaList.find(
          item => cinema_code && item.cinemaCode === cinema_code
        );
        if (!targetCinema) {
          const { getTargetCinemaCommon } = await import("@/utils/utils");
          targetCinema = getTargetCinemaCommon({
            app_name: appFlag,
            plat_cinema_code: cinema_code,
            cinema_list: cinemaList
          });
        }
        if (!targetCinema) {
          this.logger.errorSave("获取目标影院失败", {
            cinemaList,
            cinema_code,
            cinema_name,
            app_name: appFlag,
            city_name
          });
          return null;
        }
        cinemaCode = targetCinema.cinemaCode;
        cinemaLinkId = targetCinema.cinemaLinkId;
      }
      // ======== 缓存未命中，走原逻辑结束 ========

      if (!cacheHit) {
        // 3、获取影院放映信息用于拿会员价
        const movieDataRes = await this.cinemaManage.getMoviePlayInfo({
          cinemaCode,
          cinemaLinkId
        });
        const movie_data = movieDataRes?.movieData || [];
        if (!movie_data?.length) {
          this.logger.errorSave("获取影院放映信息失败", {
            error: movieDataRes?.error
          });
          return null;
        }
        // 4、获取目标影片信息
        let movieInfo = getMovieInfoFromFilmName({
          filmName: film_name,
          movieData: movie_data?.map(item => ({
            ...item,
            filmName: item.filmName
          }))
        });
        if (!movieInfo) {
          this.logger.errorSave("获取目标影片信息失败", {
            film_name,
            movie_data
          });
          return null;
        }
        console.log("movieInfo", movieInfo, film_name);
        filmUniqueId = movieInfo.filmUniqueId;
      }
      // 5、获取目标影片的放映日期
      let start_day = show_time.split(" ")[0];
      // 获取某个放映日期的场次列表
      const showListRes = await this.cinemaManage.getMoviePlayTime({
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        showDate: start_day
      });
      const showList = showListRes?.moviePlayTime || [];
      // 解决同一时间多场次问题
      let targetShowList = showList?.filter(
        item => +new Date(item.showDateTime) == +new Date(show_time)
      );
      let targetShow = targetShowList?.[0];
      if (targetShowList?.length > 1) {
        targetShowList = targetShowList.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.hallName,
            hall_name,
            "hall_name"
          );
          return {
            ...item,
            ...repeatedCharsResult
          };
        });
        targetShowList = targetShowList.sort(
          (a, b) => b.similarity - a.similarity
        );
        targetShow = targetShowList[0];
        this.logger.infoSave("同一时间多场次0", { targetShowList });
      }
      if (!targetShow) {
        this.logger.infoSave("准备根据放映日期上一天来回去放映场次列表(次日)", {
          showListRes,
          show_time
        });
        const showListRes1 = await this.cinemaManage.getMoviePlayTime({
          cinemaCode,
          cinemaLinkId,
          filmUniqueId,
          showDate: getPreviousDay(start_day)
        });
        const showList1 = showListRes1?.moviePlayTime || [];
        // 解决同一时间多场次问题
        let targetShowList = showList1?.filter(
          item => +new Date(item.showDateTime) == +new Date(show_time)
        );
        targetShow = targetShowList?.[0];
        if (targetShowList?.length > 1) {
          targetShowList = targetShowList.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.hallName,
              hall_name,
              "hall_name"
            );
            return {
              ...item,
              ...repeatedCharsResult
            };
          });
          targetShowList = targetShowList.sort(
            (a, b) => b.similarity - a.similarity
          );
          targetShow = targetShowList[0];
          this.logger.infoSave("同一时间多场次1", {
            targetShowList
          });
        }
        if (!targetShow) {
          // 缓存命中跳过了 getMoviePlayInfo，场次匹配失败时回退：重查影片列表+影片名匹配获取新 filmUniqueId
          if (cacheHit) {
            this.logger.warnSave(
              "缓存命中但场次匹配失败，回退重查影片列表+影片名匹配",
              { cachedIds, film_name }
            );
            cacheHit = 0;
            const movieDataRes = await this.cinemaManage.getMoviePlayInfo({
              cinemaCode,
              cinemaLinkId
            });
            const movie_data = movieDataRes?.movieData || [];
            if (movie_data?.length) {
              const movieInfo = getMovieInfoFromFilmName({
                filmName: film_name,
                movieData: movie_data?.map(it => ({
                  ...it,
                  filmName: it.filmName
                }))
              });
              if (movieInfo) {
                filmUniqueId = movieInfo.filmUniqueId;
                // 用新 filmUniqueId 重新查场次
                const retryShowListRes = await this.cinemaManage.getMoviePlayTime({
                  cinemaCode,
                  cinemaLinkId,
                  filmUniqueId,
                  showDate: start_day
                });
                const retryShowList = retryShowListRes?.moviePlayTime || [];
                let retryTargetList = retryShowList?.filter(
                  it => +new Date(it.showDateTime) == +new Date(show_time)
                );
                targetShow = retryTargetList?.[0];
                if (retryTargetList?.length > 1) {
                  retryTargetList = retryTargetList.map(it => {
                    const r = findMostRepeatedChars(
                      it.hallName,
                      hall_name,
                      "hall_name"
                    );
                    return { ...it, ...r };
                  });
                  retryTargetList = retryTargetList.sort(
                    (a, b) => b.similarity - a.similarity
                  );
                  targetShow = retryTargetList[0];
                }
                if (!targetShow) {
                  // 次日重试
                  const retryShowListRes1 = await this.cinemaManage.getMoviePlayTime({
                    cinemaCode,
                    cinemaLinkId,
                    filmUniqueId,
                    showDate: getPreviousDay(start_day)
                  });
                  const retryShowList1 = retryShowListRes1?.moviePlayTime || [];
                  let retryTargetList1 = retryShowList1?.filter(
                    it => +new Date(it.showDateTime) == +new Date(show_time)
                  );
                  targetShow = retryTargetList1?.[0];
                  if (retryTargetList1?.length > 1) {
                    retryTargetList1 = retryTargetList1.map(it => {
                      const r = findMostRepeatedChars(
                        it.hallName,
                        hall_name,
                        "hall_name"
                      );
                      return { ...it, ...r };
                    });
                    retryTargetList1 = retryTargetList1.sort(
                      (a, b) => b.similarity - a.similarity
                    );
                    targetShow = retryTargetList1[0];
                  }
                }
              }
            }
          }
          if (!targetShow) {
            this.logger.errorSave("匹配影片放映场次失败", {
              showListRes1,
              show_time
            });
            return null;
          }
        }
      }
      this.logger.infoSave("获取电影放映信息从而获取会员价", {
        targetShow,
        cinemaCode,
        cinemaLinkId
      });
      const areaRes = await this.seatManage.getSeatLayout({
        cinemaCode,
        cinemaLinkId,
        scheduleId: targetShow?.scheduleId,
        scheduleKey: targetShow?.scheduleKey,
        session_id: "" // 报价时不需要session_id
      });
      let { seatList: seat_data, areaInfoList } = areaRes || {};
      this.logger.infoSave("获取座位布局相关信息", {
        areaInfoList: JSON.parse(JSON.stringify(areaInfoList))
      });
      let maxSeatPrice, mostSeatPrice;
      if (areaInfoList?.length) {
        // 座位分区从高到低排序
        let areaList = areaInfoList
          .map(item => {
            let priceInfo;
            if (item.areaMemberPrice?.length) {
              priceInfo = item.areaMemberPrice.sort(
                (a, b) => b.settlePrice - a.settlePrice
              )[0];
            } else {
              priceInfo = { settlePrice: item.areaSettlePrice || 0 };
            }
            return {
              ...item,
              ...priceInfo
            };
          })
          .sort(
            (a, b) =>
              b.settlePrice +
              Number(b.areaServiceFee) -
              a.settlePrice -
              a.areaServiceFee
          );
        // 复制座位分区最高价
        maxSeatPrice =
          areaList[0].settlePrice + Number(areaList[0].areaServiceFee);
        // 获取最多座位价格
        mostSeatPrice = this.getMostSeatPrice(seat_data, areaList);
      }
      const result = {
        ...targetShow,
        maxSeatPrice,
        mostSeatPrice,
        cinemaCode,
        cinemaLinkId,
        filmUniqueId
      };
      this.cinemaInfo = result; // 供 buildSuccessResponse 透传，写入 third_party_ids（跨订单复用）
      this.cinemaManage.cacheHit = cacheHit;
      return result;
    } catch (error) {
      this.logger.errorSave("获取当前场次电影信息异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取最多座位价格
   * @param {Array} seat_data - 座位数据
   * @param {Array} areaList - 分区列表
   * @returns {number} 最多座位的价格
   */
  getMostSeatPrice(seat_data, areaList) {
    try {
      // 参数校验
      if (!seat_data || !Array.isArray(seat_data)) {
        this.logger.infoSave("座位分区剩余座位占比计算失败：座位数据无效", {
          seat_data
        });
        return null;
      }
      if (!areaList || !Array.isArray(areaList) || !areaList.length) {
        this.logger.infoSave("座位分区剩余座位占比计算失败：分区列表无效", {
          areaList
        });
        return null;
      }

      // 过滤出来未售座位然后计算分区剩余座位占比，0-未售
      let seatList = seat_data.filter(item => item.status == 0);

      // 检查是否有未售座位
      if (!seatList.length) {
        this.logger.infoSave("座位分区剩余座位占比计算失败：无未售座位", {
          seat_data_length: seat_data.length
        });
        return null;
      }

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
      this.logger.infoSave("座位分区剩余座位占比情况", { areaRatioList });

      // 检查计算结果
      if (!areaRatioList.length || !areaRatioList[0]) {
        this.logger.infoSave("座位分区剩余座位占比计算失败：计算结果为空", {
          areaRatioList
        });
        return null;
      }

      let mostSeatPrice =
        areaRatioList[0].settlePrice + Number(areaRatioList[0].areaServiceFee);
      return mostSeatPrice;
    } catch (error) {
      this.logger.infoSave("座位分区剩余座位占比计算失败", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }
}

// 测试报价实例的方法
window.umeOfferObj = (plat_name, app_name) => {
  return new getUmeOfferPrice({ appFlag: app_name, plat_name });
};
// 获取订单最终报价：
// window.umeOfferObj("mayi", "hsmzyc").getEndOfferPrice({ order: orderJson, offerList: [] })
export default getUmeOfferPrice;
