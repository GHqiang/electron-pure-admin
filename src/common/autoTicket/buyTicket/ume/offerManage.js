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
import { platTokens } from "@/store/platTokens";
import { getQuanTypeListByApp } from "../../../autoOffer/commonQuanStock.js";
import getUmeOfferPriceOld from "../../../autoOffer/umeOffer.js";
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
   * @returns {Promise<Object|null|string>} 匹配到的报价规则对象，或 "wanxiangh5"（特殊处理），匹配失败返回 null
   */
  async getEndMatchOfferRule(order) {
    try {
      const matchRuleListRes = offerRuleMatch(order);
      let matchRuleList = matchRuleListRes?.matchRuleList || [];
      if (!matchRuleList?.length) {
        this.logger.errorSave("报价规则匹配后规则为空", {
          error: matchRuleListRes?.error,
          order
        });
        return null;
      }
      matchRuleList = JSON.parse(JSON.stringify(matchRuleList));

      // 判断是否有 wanxiangh5 特殊处理
      let fixedAmountRuleList = matchRuleList.filter(
        item =>
          item.offerType === "1" &&
          item.offerAmount &&
          item.shadowLineName === "wanxiangh5"
      );
      if (fixedAmountRuleList.length) {
        return "wanxiangh5";
      }

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

      if (filmTypeFlag) {
        // 当前场次电影格式
        filmType = movieInfo.localFilmVersion;
        if (filmType) {
          filmType = filmType.toUpperCase();
          matchRuleList = matchRuleList.filter(item =>
            item.film_type?.some(itemA => filmType.includes(itemA))
          );
        }
      }

      if (!matchRuleList?.length) {
        this.logger.errorSave("过滤完电影格式后匹配报价规则为空", {
          filmTypeFlag,
          filmType,
          movieInfo,
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
          this.logger.errorSave("根据券库存过滤后固定报价规则为空", {
            fixedAmountRuleList
          });
        } else {
          this.logger.errorSave("最终匹配到的报价规则为空");
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

  /**
   * 重写基类的getEndOfferPrice方法，添加UME特殊逻辑（wanxiangh5处理）
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Array} params.offerList - 报价列表（可选）
   * @returns {Promise<Object>} 报价结果 { err_msg, err_info, endPrice, offerRule } 或 { app_name, ...result }
   */
  async getEndOfferPrice({ order, offerList }) {
    try {
      // 初始化模块
      this.initModules(order);

      // 获取最终匹配的报价规则
      let offerRule = await this.getEndMatchOfferRule(order);
      if (!offerRule) {
        return this.buildErrorResponse();
      } else if (offerRule == "wanxiangh5") {
        // UME特殊逻辑：wanxiangh5 特殊处理
        let offerExample = new getUmeOfferPriceOld({
          appFlag: "wanxiangh5",
          plat_name: this.plat_name
        });
        const result = await offerExample.getEndOfferPrice({
          order: { ...order, app_name: "wanxiangh5" },
          offerList
        });
        return { ...result, app_name: "wanxiangh5" };
      }

      this.logger.infoSave("最终匹配到的报价规则", { offerRule });

      const {
        offerAmount,
        memberOfferAmount,
        memberCostPrice = 0,
        quanValue,
        offerType
      } = offerRule;
      let price = Number(offerAmount || memberOfferAmount);
      if (!price) {
        this.logger.errorSave("从最终报价规则里获取报价价格失败");
        return this.buildErrorResponse({ endPrice: null, offerRule });
      }

      // 成本价
      let cost_price, quanInfoList;
      if (offerType === "1") {
        const quanInfo = await this.cardQuanManage.getQuanInfo(
          quanValue,
          this.appFlag
        );
        cost_price = quanInfo?.quan_cost;
        // 只用多种券类型才会返回数组
        // 这里取一个最小成本价去计算判断能否报价
        if (Array.isArray(quanInfo)) {
          quanInfoList = quanInfo;
          cost_price = Math.min(...quanInfoList.map(item => +item.quan_cost));
        }
      } else {
        cost_price = Number(memberCostPrice);
      }
      if (!cost_price) {
        this.logger.errorSave("获取出票成本价格失败");
        return this.buildErrorResponse({ endPrice: null, offerRule });
      }
      offerRule.cost_price = cost_price; // 成本价

      // 获取最终报价
      const endPrice = await this.calculateFinalPrice({
        cost_price,
        supplier_max_price: order.supplier_max_price,
        price,
        rewards: order.rewards,
        offerType,
        offerList,
        plat_name: this.plat_name,
        offerRule
      });
      console.warn("最终报价返回", endPrice);
      console.warn(
        "this.logger.logList",
        JSON.parse(JSON.stringify(this.logger.logList))
      );
      if (!endPrice) {
        return this.buildErrorResponse({ endPrice: null, offerRule });
      }

      // 最终报价
      offerRule.offer_end_amount = endPrice;

      // 增加一个quanValue的过滤，依据最大券成本过滤
      if (
        offerType === "1" &&
        offerRule?.maxCostPrice &&
        quanInfoList?.length > 1
      ) {
        offerRule.quanValue = offerRule.quanValue
          .split(",")
          .filter(item => {
            let targetQuanCost = quanInfoList.find(
              quanInfo => quanInfo.quan_value === item
            )?.quan_cost;
            return targetQuanCost < offerRule?.maxCostPrice;
          })
          .join();
      }

      return this.buildSuccessResponse(endPrice, offerRule, order.order_number);
    } catch (error) {
      this.logger?.errorSave("获取最终报价信息方法执行异常", {
        error: formatErrInfo(error)
      });
      return this.buildErrorResponse();
    }
  }

  /**
   * 获取成本价
   *
   * @param {Object} offerRule - 报价规则对象
   * @param {string} offerRule.offerType - 报价类型，"1"=固定报价（券），"2"=会员价加价
   * @param {string} [offerRule.quanValue] - 券类型值（offerType="1"时必填）
   * @param {number} [offerRule.memberCostPrice] - 会员成本价（offerType="2"时必填）
   *
   * @returns {Promise<number|null>} 成本价，获取失败返回 null
   */
  async getCostPrice(offerRule) {
    // 兼容 camelCase 和 snake_case 两种字段名格式
    const offerType = offerRule.offerType || offerRule.offer_type;
    const quanValue = offerRule.quanValue || offerRule.quan_value;
    const memberCostPrice =
      offerRule.memberCostPrice || offerRule.member_cost_price;

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
   * @param {string} params.plat_name - 平台名称
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
      plat_name,
      offerRule
    } = params;
    let price = params.price;

    try {
      // 1. 利润加价处理
      let profitAddPrice = 0;
      if (offerType !== "1" && !GROUP_LIST.includes(this.appFlag)) {
        profitAddPrice = window.localStorage.getItem("profitAddPrice");
        profitAddPrice = profitAddPrice ? Number(profitAddPrice) : 0;
        price = price + profitAddPrice;
      }

      // 2. 夜间顶价处理
      let isOpenisNightMaxPrice =
        localStorage.getItem("isOpenisNightMaxPrice") == 1;
      let currentHour = new Date().getHours();
      if (isOpenisNightMaxPrice && currentHour >= 1 && currentHour <= 6) {
        price = Number(supplier_max_price);
        this.logger.infoSave("开启夜间顶价");
      }

      // 规则报价
      let rule_price = price;

      // 3. 超限检查处理
      if (price > Number(supplier_max_price)) {
        let isOverrunOffer = window.localStorage.getItem("isOverrunOffer");
        if (isOverrunOffer !== "1") {
          this.logger.errorSave(
            `最终报价${price}超过平台限价${supplier_max_price}，超限报价处于关闭状态不进行报价`
          );
          return null;
        }
        // 券或者卡开了超限报价调整规则报价为平台限价
        if (["mayi", "yangcong"].includes(plat_name)) {
          price = Math.floor(supplier_max_price);
        } else {
          // 向下取0.5的倍数
          price = roundToHalf(
            supplier_max_price,
            ONE_STEP_PLAT_LIST.includes(plat_name) ? 0.1 : 0.5,
            "down"
          );
        }
        this.logger.infoSave("调整最终报价为平台限价四舍五入去整");
      }

      // 4. 成本利润计算
      return this.calculateCostProfit({
        adjustedPrice: price,
        cost_price,
        rewards,
        supplier_max_price,
        offerRule,
        rule_price,
        profitAddPrice
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
    offerRule,
    rule_price,
    profitAddPrice
  }) {
    // 手续费
    let shouxufei = (adjustedPrice * 100) / 10000;
    if (NO_FEE_PLAT_LIST.includes(this.plat_name)) {
      shouxufei = 0;
    }
    // 奖励费用
    const rewardPrice =
      rewards > 0 ? (adjustedPrice * 100 * rewards) / 10000 : 0;
    // 卡券成本
    let cardQuanCost = cost_price;
    // 出票成本（加手续费）
    let pay_cost_price = cost_price + shouxufei;
    // 真实成本（减奖励费）
    const real_cost_price = (pay_cost_price - rewardPrice).toFixed(2);
    // 预计利润（最终报价-真实成本）
    let expectProfit = (adjustedPrice - real_cost_price).toFixed(2);
    if (
      adjustedPrice <= real_cost_price &&
      !TEST_NEW_PLAT_LIST.includes(this.plat_name)
    ) {
      let str = `最终报价${adjustedPrice}低于真实成本${real_cost_price}`;
      this.logger.errorSave(str);
      return null;
    }

    // 最大卡券成本（即成本必须低于它才有利润）
    let maxCostPrice =
      (adjustedPrice * 1000 + rewardPrice * 1000 - shouxufei * 1000) / 1000;
    offerRule.maxCostPrice = maxCostPrice;

    this.logger.infoSave("ume计算报价相关信息", {
      rule_price: "规则计算报价：" + rule_price,
      profitAddPrice: "单店加价金额：" + profitAddPrice,
      supplier_max_price: "平台最高限价：" + supplier_max_price,
      cardQuanCost: "卡券成本：" + cardQuanCost,
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
      let useMobileList = getCinemaLoginInfoList()
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

  /**
   * 获取真实加价金额
   * @param {Object} params - 参数对象
   * @param {number} params.real_member_price - 真实会员价
   * @param {Array} params.addMountRule - 加价规则数组
   * @returns {number|null} 真实加价金额
   */
  getRealAddMount({ real_member_price, addMountRule }) {
    try {
      let comparePrice = addMountRule[0];
      let realAddMount = calculateMarkup(
        comparePrice,
        real_member_price,
        addMountRule.slice(1)
      );
      console.log("realAddMount", realAddMount);
      return realAddMount;
    } catch (error) {
      this.logger.errorSave("获取真实加价金额异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

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
        let useMobileList = getCinemaLoginInfoList()
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
          this.logger.errorSave("影院单卡出票限制，无可用卡", {
            ticket_num,
            cinemaCode: movieInfo.cinemaCode
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
      // 3、获取影院放映信息用于拿会员价
      const { cinemaCode, cinemaLinkId } = targetCinema;
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
      // 5、获取目标影片的放映日期
      const { filmUniqueId } = movieInfo;
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
          this.logger.errorSave("匹配影片放映场次失败", {
            showListRes1,
            show_time
          });
          return null;
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
      return {
        ...targetShow,
        maxSeatPrice,
        mostSeatPrice,
        cinemaCode,
        cinemaLinkId
      };
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

      // 验证字段类型
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
      if (!offerRule || offerRule === "wanxiangh5") {
        if (offerRule === "wanxiangh5") {
          result.errMsg = "匹配到wanxiangh5特殊处理，需使用wanxiangh5报价逻辑";
        } else {
          result.errMsg = "报价规则匹配失败，无法匹配到可用规则";
        }
        result.steps.offerRuleMatch = false;
        return result;
      }
      result.steps.offerRuleMatch = true;
      result.offerRule = offerRule;

      // 4. 验证电影信息获取
      const movieInfo = await this.getMovieInfo(orderJson);
      if (!movieInfo) {
        result.errMsg = "获取电影放映信息失败";
        result.steps.movieInfo = false;
        return result;
      }
      result.steps.movieInfo = true;
      result.movieInfo = movieInfo;

      // 5. 验证会员价获取（如果是会员价加价规则）
      if (offerRule.offerType === "2" || offerRule.offer_type === "2") {
        const memberPriceRes = await this.getMemberPrice({
          order: orderJson,
          movieData: movieInfo,
          minAddAmountRule: offerRule
        });
        if (memberPriceRes === -1 || !memberPriceRes) {
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

// 测试报价实例的方法
window.umeOfferObj = (plat_name, app_name) => {
  return new getUmeOfferPrice({ appFlag: app_name, plat_name });
};
// 订单报价管理校验：
// window.umeOfferObj("mayi", "hsmzyc").validateOfferOrder(orderJson)
// 获取订单最终报价：
// window.umeOfferObj("mayi", "hsmzyc").getEndOfferPrice({ order: orderJson, offerList: [] })
export default getUmeOfferPrice;
