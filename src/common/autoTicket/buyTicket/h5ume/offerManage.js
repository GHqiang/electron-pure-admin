/**
 * H5UME报价管理模块
 *
 * 职责：
 * - 继承 BaseOfferPrice 基类，实现 H5UME 系列报价逻辑
 * - 报价规则匹配、会员价获取、成本价计算、最终报价计算
 *
 * 所属流程：报价流程
 *
 * 依赖模块：
 * - BaseOfferPrice: 报价基类，提供模板方法
 * - H5UmeCardQuanManage: 卡券管理模块
 * - H5UmeCinemaManage: 影院管理模块
 * - H5UmeSeatManage: 座位管理模块
 *
 * @module h5ume/offerManage
 */
import {
  offerRuleMatch,
  roundToHalf,
  formatErrInfo,
  getCinemaLoginInfoList,
  calculateMarkup,
  getTargetCinemaCommon,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  divDecimal,
  getCurrentDay,
  isDateInCurrentMonth
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import {
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST,
  ONE_STEP_PLAT_LIST
} from "@/common/constant.js";
import { getQuanTypeListByApp } from "../../../autoOffer/commonQuanStock.js";
import Logger from "@/common/logger.js";
import { platTokens } from "@/store/platTokens";
import BaseOfferPrice from "@/common/core/BaseOfferPrice.js";
import H5UmeCardQuanManage from "./cardQuanManage.js";
import H5UmeCinemaManage from "./cinemaManage.js";
import H5UmeSeatManage from "./seatManage.js";

const tokens = platTokens();

class getH5UmeOfferPrice extends BaseOfferPrice {
  constructor({ appFlag, plat_name }) {
    super({ appFlag, plat_name });
    this.appApi = APP_API_OBJ[appFlag];
    this.quanInfoList = null; // 用于存储券信息列表
  }

  /**
   * 初始化依赖模块
   * @param {Object} order - 订单信息对象
   */
  initModules(order) {
    this.logger = new Logger({ logType: 1 }); // 日志管理模块
    this.logger.init(order);
    this.cardQuanManage = new H5UmeCardQuanManage(order, this.logger); // 卡券管理模块
    this.cinemaManage = new H5UmeCinemaManage(order, this.logger); // 影院管理模块
    this.seatManage = new H5UmeSeatManage(order, this.logger, false); // 座位管理模块
  }

  /**
   * 获取最终匹配的报价规则
   * @param {Object} order - 待报价订单信息
   * @returns {Promise<Object|null>} 匹配到的报价规则对象或null
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
      // 判断规则里是否有指定电影格式的（2D/3D）
      let filmTypeFlag = matchRuleList.some(item => !!item?.film_type?.length);
      this.logger.infoSave("开始获取电影放映信息");
      let movieInfo; // 电影放映信息
      movieInfo = await this.getMovieInfo(order, filmTypeFlag, matchRuleList);
      if (!movieInfo) {
        this.logger.infoSave(
          "报价规则匹配电影格式时获取当前场次电影信息失败，直接不报"
        );
        return null;
      }
      if (movieInfo?.filmTypeCheckFail) {
        this.logger.errorSave("过滤完电影格式后匹配报价规则为空", {
          filmTypeFlag,
          filmType: movieInfo.filmType,
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
      console.error("获取最终匹配报价规则异常", error);
      this.logger.errorSave("获取最终匹配报价规则异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取成本价
   * @param {Object} offerRule - 报价规则
   * @returns {Promise<number|null>} 成本价或null
   */
  async getCostPrice(offerRule) {
    try {
      const { offerType, quanValue, memberCostPrice = 0 } = offerRule;
      let cost_price;
      if (offerType === "1") {
        const quanInfo = await this.cardQuanManage.getQuanInfo(
          quanValue,
          this.appFlag
        );
        cost_price = quanInfo?.quan_cost;
        // 只用多种券类型才会返回数组
        // 这里取一个最小成本价去计算判断能否报价
        if (Array.isArray(quanInfo)) {
          this.quanInfoList = quanInfo;
          cost_price = Math.min(
            ...this.quanInfoList.map(item => +item.quan_cost)
          );
        }
      } else {
        cost_price = Number(memberCostPrice);
      }
      if (!cost_price) {
        this.logger.errorSave("获取出票成本价格失败");
        return null;
      }
      return cost_price;
    } catch (error) {
      this.logger.errorSave("获取成本价异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取会员价
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Object} [params.movieData] - 电影数据（可选）
   * @returns {Promise<Object|null>} 会员价信息或null
   */
  async getMemberPrice({ order, movieData }) {
    const { appFlag } = this;
    try {
      console.log("准备获取会员价", order);
      const { ticket_num } = order;
      // 获取当前场次电影信息，防止接口重复掉
      let movieInfo = movieData;
      if (!movieData) {
        movieInfo = await this.getMovieInfo(order);
      }
      let cardList = this.cardList;
      console.log("待报价订单当前场次电影相关信息", movieInfo);
      if (!movieInfo) {
        console.error("获取当前场次电影信息失败", "不再进行报价");
        return -1;
      }
      let {
        displayPrice, // 展示价格(会员价)
        lowestPrice, // 最低价
        standardPrice, // 标准价格
        originalStandardPrice, // 原始标准价
        maxSeatPrice = 0, // 最大座位分区价格
        privilegeTags = [] // 优惠信息
      } = movieInfo;
      this.logger.infoSave("获取会员价相关信息0", {
        displayPrice: "会员价：" + displayPrice,
        maxSeatPrice: "座位最高价：" + maxSeatPrice,
        privilegeTags
      });
      // maxSeatPrice: 最高座位价*座位数 || 优惠后真实支付总价
      let member_total_price =
        Math.max(displayPrice * ticket_num, maxSeatPrice) / 100;
      // 会员总价为0
      if (member_total_price === 0) {
        this.logger.errorSave("获取会员总价为0", {
          displayPrice,
          maxSeatPrice
        });
        return null;
      }
      console.log("获取会员总价", member_total_price);
      if (member_total_price > 0) {
        if (!cardList.length) {
          console.error("影院单卡出票限制");
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
        cardList.sort((a, b) => a.card_discount - b.card_discount);
        // 按最低折扣取值报价
        let discount = cardList[0]?.card_discount;
        let real_member_price = divDecimal(member_total_price, ticket_num);
        let member_cost_price = discount
          ? (Number(member_total_price) * 100 * discount) / 10000
          : Number(member_total_price);
        member_cost_price = Number((member_cost_price / ticket_num).toFixed(2));
        this.logger.infoSave("获取会员价相关信息1", {
          real_member_price:
            "真实会员价（会员价+手续费+服务费）：" + real_member_price,
          discount: "最小折扣：" + discount,
          cost_member_price:
            "会员成本价（真实会员总价/票数*折扣）：" + member_cost_price
        });
        return {
          real_member_price,
          member_cost_price,
          discount
        };
      } else {
        console.warn("会员价未负，非会员价");
        return null;
      }
    } catch (error) {
      this.logger.errorSave("获取会员价异常", { error: formatErrInfo(error) });
      return null;
    }
  }

  /**
   * 计算最终报价
   * @param {Object} params - 参数对象
   * @param {number} params.cost_price - 成本价
   * @param {number} params.supplier_max_price - 平台最高限价
   * @param {number} params.price - 基础报价
   * @param {number} params.rewards - 奖励比例
   * @param {string} params.offerType - 报价类型
   * @param {Array} [params.offerList] - 报价列表（可选）
   * @param {Object} params.offerRule - 报价规则
   * @returns {Promise<number|null>} 最终报价或null
   */
  async calculateFinalPrice(params) {
    try {
      let {
        cost_price,
        supplier_max_price,
        price,
        rewards,
        offerType,
        plat_name,
        offerRule
      } = params || {};
      let profitAddPrice = 0;
      if (offerType !== "1" && !GROUP_LIST.includes(this.appFlag)) {
        profitAddPrice = window.localStorage.getItem("profitAddPrice");
        profitAddPrice = profitAddPrice ? Number(profitAddPrice) : 0;
        price = price + profitAddPrice;
      }
      let isOpenisNightMaxPrice =
        localStorage.getItem("isOpenisNightMaxPrice") == 1;
      let currentHour = new Date().getHours();
      if (isOpenisNightMaxPrice && currentHour >= 1 && currentHour <= 6) {
        price = Number(supplier_max_price);
        this.logger.infoSave("开启夜间顶价");
      }
      // 规则报价
      let rule_price = price;
      // 最终报价高于平台限价，关闭超限报价直接不报
      if (price > Number(supplier_max_price)) {
        let isOverrunOffer = window.localStorage.getItem("isOverrunOffer");
        if (isOverrunOffer !== "1") {
          this.logger.errorSave(
            `最终报价${price}超过平台限价${supplier_max_price}，超限报价处于关闭状态不进行报价`
          );
          return null;
        }
        // 券或者卡开了超限报价调整规则报价为平台限价
        if (["mayi"].includes(plat_name)) {
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

      // 手续费
      let shouxufei = (price * 100) / 10000;
      if (NO_FEE_PLAT_LIST.includes(plat_name)) {
        shouxufei = 0;
      }
      // 奖励费用
      const rewardPrice = rewards > 0 ? (price * 100 * rewards) / 10000 : 0;
      // 卡券成本
      let cardQuanCost = cost_price;
      // 出票成本（加手续费）
      let pay_cost_price = cost_price + shouxufei;
      // 真实成本（减奖励费）
      const real_cost_price = (pay_cost_price - rewardPrice).toFixed(2);
      // 预计利润（最终报价-真实成本）
      let expectProfit = (price - real_cost_price).toFixed(2);
      if (price <= real_cost_price && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        let str = `最终报价${price}低于真实成本${real_cost_price}`;
        this.logger.errorSave(str);
        return null;
      }

      // 最大卡券成本（即成本必须低于它才有利润）
      let maxCostPrice =
        (price * 1000 + rewardPrice * 1000 - shouxufei * 1000) / 1000;
      offerRule.maxCostPrice = maxCostPrice;

      this.logger.infoSave("umeh5计算报价相关信息", {
        rule_price: "规则计算报价：" + rule_price,
        profitAddPrice: "单店加价金额：" + profitAddPrice,
        supplier_max_price: "平台最高限价：" + supplier_max_price,
        cardQuanCost: "卡券成本：" + cardQuanCost,
        maxCostPrice: "最大卡券成本（低于该值才有利润）：" + maxCostPrice,
        price: "最终报价：" + price,
        shouxufei: "手续费（最终报价*1%）：" + shouxufei,
        cost_price: "出票成本（卡券成本+手续费）：" + cost_price,
        rewardPrice: `奖励金额(最终报价*奖励百分比-${rewards})：` + rewardPrice,
        real_cost_price: "真实成本（出票成本-奖励金额）：" + real_cost_price,
        expectProfit: "预计利润（最终报价-真实成本）：" + expectProfit
      });
      return price;
    } catch (error) {
      this.logger.errorSave("获取最终报价异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取报价最低的报价规则
   * @param {Array} ruleList - 报价规则列表
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
        getQuanListByPhone: this.getQuanListByPhone.bind(this),
        logger: this.logger
      });
      this.logger.infoSave("根据影院获取券类型列表返回", {
        quanTypeList: appQuanTypeList?.map(
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
            { appQuanTypeList }
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
      let mixAddAmountRule = addAmountRuleList?.[0];
      // 如果addAmount设置比较特殊，严谨来说只能有且仅有一条规则或者其规则再首位时才能生效；如：30;>=+2;<+1
      if (
        addAmountRuleList?.length > 1 &&
        addAmountRuleList.every(
          item => item?.addAmount?.split(";")?.length === 1
        )
      ) {
        mixAddAmountRule = addAmountRuleList.sort(
          (itemA, itemB) => itemA.addAmount - itemB.addAmount
        )?.[0];
      }

      if (mixAddAmountRule) {
        let addMountRule = mixAddAmountRule.addAmount?.split(";");
        if (addMountRule.length === 1) {
          mixAddAmountRule.realAddMount = addMountRule[0];
        } else if (addMountRule.length > 1) {
          mixAddAmountRule.addMountRule = addMountRule.slice();
        }

        // 计算会员报价
        let memberPriceRes = await this.getMemberPrice({
          order,
          movieData: movieInfo
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
          this.logger.warnSave(
            "最小加价规则获取会员价失败,返回最小固定报价规则",
            {
              memberPriceRes,
              fixedOfferAmount: mixFixedAmountRule?.offerAmount
            }
          );
          return mixFixedAmountRule;
        }
        // 真实会员价
        mixAddAmountRule.real_member_price = memberPriceRes.real_member_price;
        if (
          !mixAddAmountRule.realAddMount &&
          mixAddAmountRule.addMountRule?.length > 1
        ) {
          let realAddMount = this.getRealAddMount({
            real_member_price: memberPriceRes.real_member_price,
            addMountRule: mixAddAmountRule.addMountRule
          });
          if (!realAddMount) {
            this.logger.warnSave("获取真实加价金额失败,返回最小固定报价规则", {
              real_member_price: memberPriceRes.real_member_price,
              addMountRule: mixAddAmountRule.addMountRule
            });
            return mixFixedAmountRule;
          }
          mixAddAmountRule.realAddMount = realAddMount;
        }

        // 最小折扣
        mixAddAmountRule.member_discount = memberPriceRes.discount;
        // 会员成本价(真实会员价*折扣价)
        mixAddAmountRule.memberCostPrice = memberPriceRes.member_cost_price;
        // 会员成本价不为0.5的整数倍时进0.5
        mixAddAmountRule.round_member_price = roundToHalf(
          mixAddAmountRule.memberCostPrice,
          ONE_STEP_PLAT_LIST.includes(order.plat_name) ? 0.1 : 0.5
        );
        // 会员预计报价
        mixAddAmountRule.memberOfferAmount =
          mixAddAmountRule.round_member_price +
          Number(mixAddAmountRule.realAddMount);
        this.logger.infoSave("会员报价最终信息", {
          real_member_price:
            "真实会员总价：" + mixAddAmountRule.real_member_price,
          member_discount: "会员最小折扣" + mixAddAmountRule.member_discount,
          memberCostPrice:
            "会员成本价（真实会员价*折扣）：" +
            mixAddAmountRule.memberCostPrice,
          addAmount: "最小加价金额：" + mixAddAmountRule.realAddMount,
          round_member_price:
            "会员成本价按0.5向上取整数倍：" +
            mixAddAmountRule.round_member_price,
          memberOfferAmount:
            "会员预计报价：" + mixAddAmountRule.memberOfferAmount
        });
      } else {
        this.logger.infoSave("最小加价规则不存在,返回最小固定报价规则");
        return mixFixedAmountRule;
      }
      if (!mixFixedAmountRule) {
        console.warn(
          "最小固定报价规则不存在，返回最小加价规则",
          mixAddAmountRule
        );
        return mixAddAmountRule;
      }
      if (
        mixAddAmountRule.memberOfferAmount >=
        Number(mixFixedAmountRule.offerAmount)
      ) {
        this.logger.infoSave("会员报价高于固定报价，返回最小固定报价规则");
        return mixFixedAmountRule;
      } else {
        this.logger.infoSave("会员报价低于固定报价，返回最小加价报价规则", {
          memberOfferAmount: mixAddAmountRule.memberOfferAmount,
          fixedOfferAmount: mixFixedAmountRule.offerAmount
        });
        return mixAddAmountRule;
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
   * @returns {number} 真实加价金额
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
   * 获取优惠券列表（报价时使用）
   * @param {Object} params - 参数对象
   * @param {string} params.session_id - 会话ID
   * @param {number} [params.page=1] - 页码
   * @param {Logger} params.logger - 日志实例
   * @returns {Promise<Array>} 优惠券列表
   */
  async getQuanListByPhone({ session_id, page = 1, logger }) {
    let params = {
      state: "USEFUL",
      pageNo: page,
      pageSize: 20,
      umeToken: session_id
    };
    try {
      const quanData = await this.cardQuanManage.continuousGetQuan({
        session_id,
        logger
      });
      console.log("quanData", quanData);
      logger.infoSave("连续获取券最终返回", { quanData });

      return quanData.map(item => ({
        ...item,
        endDateTime: item.expireTime
      }));
    } catch (error) {
      logger.errorSave("获取优惠券列表异常", {
        params,
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 获取当前场次电影信息
   * @param {Object} order - 订单信息
   * @param {boolean} filmTypeFlag - 是否需要校验电影格式
   * @param {Array} matchRuleList - 匹配的报价规则列表
   * @returns {Promise<Object|null>} 电影信息或null
   */
  async getMovieInfo(order, filmTypeFlag, matchRuleList) {
    const { appFlag } = this;
    let {
      city_name,
      film_name,
      hall_name,
      show_time,
      cinema_code,
      cinema_name,
      ticket_num
    } = order;
    try {
      // 1、获取城市影院列表
      let allCinemaList = await this.cinemaManage.getCityCinemaList();
      if (!allCinemaList?.length) {
        this.logger.errorSave("获取城市影院列表失败", {
          error: "getCityCinemaList 返回 null 或 undefined"
        });
        return null;
      }
      this.logger.infoSave("获取城市影院列表成功");
      let cinemaList =
        allCinemaList?.map(item => item.cinemaList)?.flat() || [];
      console.log("获取全部影院列表返回", cinemaList);
      if (!cinemaList?.length) {
        this.logger.infoSave("获取全部影院列表失败", { allCinemaList });
        return null;
      }
      // 2、获取目标影院
      let targetCinema = cinemaList.find(
        item => cinema_code && item.cinemaCode === cinema_code
      );
      if (!targetCinema) {
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
      const { cinemaLinkId } = targetCinema;
      const movie_data = await this.cinemaManage.getMoviePlayInfo({
        cinemaLinkId
      });
      this.logger.infoSave("获取影院放映列表结束");
      // 4、获取目标影片信息
      let movieInfoFromFilm = getMovieInfoFromFilmName({
        filmName: film_name,
        movieData: movie_data?.map(item => ({
          ...item,
          filmName: item.filmName
        }))
      });
      if (!movieInfoFromFilm) {
        console.warn("获取目标影片信息失败", movie_data, film_name);
        this.logger.errorSave("获取目标影片信息失败", {
          film_name,
          movie_data: movie_data?.map(item => ({
            filmName: item.filmName,
            filmId: item.filmId,
            filmVersion: item.filmVersion
          }))
        });
        return null;
      }
      console.log("movieInfo", movieInfoFromFilm, film_name);
      // 5、获取目标影片的放映日期
      const { filmId } = movieInfoFromFilm;
      const playDateList = await this.cinemaManage.getMoviePlayDate({
        cinemaLinkId,
        filmId
      });
      let targetShowInfo = playDateList?.find(item =>
        item.schedules?.some(
          itemA => +new Date(+itemA.showTime) === +new Date(show_time)
        )
      );
      this.logger.infoSave("获取影片场次列表结束");
      // 获取某个放映日期的场次列表
      const showList = targetShowInfo?.schedules || [];
      // 解决同一时间多场次问题
      let targetShowList = showList.filter(
        itemA => +new Date(+itemA.showTime) === +new Date(show_time)
      );
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
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
        this.logger.infoSave("同一时间多场次", { targetShowList });
      }
      if (!targetShow) {
        console.error("匹配影片放映场次失败", showList, show_time);
        this.logger.errorSave("匹配影片放映场次失败", {
          playDateList: playDateList?.map(item => ({
            schedules: item.schedules?.map(itemA => ({
              showTime: itemA.showTime,
              hallName: itemA.hallName
            }))
          })),
          show_time
        });
        return null;
      }
      this.logger.infoSave("获取电影放映信息从而获取会员价", { targetShow });
      if (filmTypeFlag && targetShow.filmVersion) {
        // 校验电影格式，减少后续接口请求
        let filmType = targetShow.filmVersion.toUpperCase();
        if (
          !matchRuleList.some(item =>
            item.film_type?.some(itemA => filmType.includes(itemA))
          )
        ) {
          return {
            filmTypeCheckFail: true,
            filmType
          };
        }
      }
      const { hallId, scheduleId, scheduleKey } = targetShow;
      const areaRes = await this.seatManage.getSeatLayout({
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey
      });
      let { seats: seatList, areaInfos: areaInfoList } = areaRes || {};
      if (!areaInfoList?.length || !seatList.length) {
        this.logger.errorSave("获取座位布局信息异常");
        return null;
      }
      this.logger.infoSave("获取座位布局相关信息", { areaInfoList });
      // 座位分区从高到低排序
      let areaList = areaInfoList
        .map(item => {
          let settlePrice = item.areaPrice || 0 + (item.sareaServiceFee || 0);
          return {
            ...item,
            settlePrice
          };
        })
        .sort((a, b) => b.settlePrice - a.settlePrice);
      let maxSeatPrice,
        seatIds = [];
      for (let index = 0; index < areaList.length; index++) {
        const item = areaList[index];
        let curAreaId = item.areaId;
        // 判断当前座位id是否还有空余座位
        let targetSeatList = seatList.filter(
          itemA => itemA.areaId == curAreaId && itemA.status == "1"
        );
        if (targetSeatList.length) {
          maxSeatPrice ||= item.settlePrice;
          seatIds = [
            ...seatIds,
            ...targetSeatList.slice(0, ticket_num - seatIds.length)
          ];
        }
        if (seatIds.length == ticket_num) {
          break;
        }
      }
      this.logger.infoSave("获取座最贵座位id", {
        maxSeatPrice,
        seatIds: JSON.parse(JSON.stringify(seatIds))
      });
      const cardList = await this.getCanUseCardList({
        ticket_num,
        app_name: appFlag,
        cinemaLinkId
      });
      // 赋值到this上是为了其它地方好用
      this.cardList = cardList || [];
      seatIds = seatIds.map(item => item.seatId);
      // 从这里获取真实会员价
      const orderInfoRes = await this.getOptimalCardQuanCompose({
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey,
        seatIds: seatIds.join("|")
      });
      let activities = orderInfoRes?.privileges || [];
      console.warn("activities", activities);
      let member_discount_list = activities.filter(
        item => item.cardInfos?.length
      );
      // 从小到大排序
      member_discount_list = member_discount_list.sort(
        (a, b) => a.privilegeTotalPrice - b.privilegeTotalPrice
      );
      let member_total_price = member_discount_list[0]?.privilegeTotalPrice;
      if (maxSeatPrice) {
        maxSeatPrice = maxSeatPrice * ticket_num;
      }
      if (member_total_price) {
        maxSeatPrice = member_total_price;
        this.logger.infoSave("从优惠活动获取真实会员价", {
          member_total_price,
          member_discount_list
        });
      } else {
        console.warn("获取真实会员价异常");
        this.logger.infoSave("获取真实会员价不存在");
      }
      // 优先使用 getMovieInfoFromFilmName 返回的 displayPrice，如果不存在则使用 maxSeatPrice 计算
      // maxSeatPrice 此时是总价（单位：分），需要除以 ticket_num 得到单张票价格（单位：分）
      let displayPrice = movieInfoFromFilm?.displayPrice;
      if (!displayPrice && maxSeatPrice) {
        displayPrice = maxSeatPrice / ticket_num; // maxSeatPrice 是总价（分），除以票数得到单张票价格（分）
      }
      return {
        ...targetShow,
        cinemaLinkId,
        maxSeatPrice,
        displayPrice
      };
    } catch (error) {
      this.logger.errorSave("获取当前场次电影信息异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取用卡购票价格信息
   * @param {Object} data - 参数对象
   * @param {string|number} data.cinemaLinkId - 影院链接ID
   * @param {string|number} data.hallId - 影厅ID
   * @param {string|number} data.scheduleId - 场次ID
   * @param {string} data.scheduleKey - 场次Key
   * @param {string} data.seatIds - 座位ID，格式：用|分隔
   * @param {string} [data.session_id] - 会话ID（可选）
   * @returns {Promise<Object>} 订单信息
   */
  async getOptimalCardQuanCompose(data) {
    const { appFlag } = this;
    let { cinemaLinkId, hallId, scheduleId, scheduleKey, seatIds, session_id } =
      data;
    let targetLoginList = getCinemaLoginInfoList().filter(
      item =>
        item.app_name === appFlag &&
        item.mobile &&
        item.session_id &&
        item.member_pwd
    );
    if (!session_id) {
      session_id = targetLoginList[0].session_id;
    }
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      hallId,
      scheduleId,
      scheduleKey,
      seatIds,
      umeToken: session_id
    };
    try {
      console.log("获取用卡购票价格信息参数", params);
      const res = await this.appApi.getCardQuanList(params);
      console.log("获取用卡购票价格信息返回", res);
      let orderInfo = res.bizValue;
      this.logger.infoSave("报价前获取用卡购票价格信息返回", {
        privileges: orderInfo?.privileges,
        params
      });
      let activities = orderInfo?.privileges || [];
      // 系统可用卡列表
      let canUseCardNumList = this.cardList.map(item => item.card_num);
      let member_discount_list = activities.filter(
        item =>
          item.cardInfos?.length &&
          item.cardInfos.some(itemC =>
            canUseCardNumList?.includes(itemC.cardNumber)
          )
      );
      let inx = targetLoginList.findIndex(
        item => item.session_id == session_id
      );
      if (!member_discount_list.length && inx != targetLoginList.length - 1) {
        session_id = targetLoginList[inx + 1].session_id;
        this.logger.infoSave(
          "根据用卡购票价格信息获取真实会员价返回空，换号重新获取",
          { session_id }
        );
        return await this.getOptimalCardQuanCompose({
          ...data,
          session_id
        });
      }
      return orderInfo;
    } catch (error) {
      this.logger.errorSave("获取用卡购票价格信息返回异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取可用卡列表
   * @param {Object} params - 参数对象
   * @param {string} params.app_name - 影院标识
   * @param {number} params.ticket_num - 票数
   * @param {string|number} params.cinemaLinkId - 影院链接ID
   * @returns {Promise<Array>} 可用卡列表
   */
  async getCanUseCardList({ app_name, ticket_num, cinemaLinkId }) {
    try {
      const cardRes = await svApi.queryCardList({
        app_name: app_name,
        rule: tokens.userInfo?.rule,
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
          (use_limit_day ? ticket_num <= use_limit_day - daily_usage : true) &&
          (use_limit_month ? ticket_num <= use_limit_month - month_usage : true)
        );
      });
      this.logger.infoSave("根据当天及当月出票量限制过滤后", {
        cardListLimit: cardListLimit.map(item => item.card_num)
      });
      // 过滤指定卡
      let cardList = cardListLimit.filter(item => {
        return !item.linkCinemaIds
          ? true
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaLinkId);
      });
      this.logger.infoSave("根据制定影院过滤后的卡列表", {
        cardList: cardList.map(item => item.card_num)
      });
      return cardList;
    } catch (error) {
      this.logger.errorSave("获取可用卡列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 验证订单报价（不实际报价，仅校验）
   * @param {Object} orderJson - 订单信息
   * @returns {Promise<Object>} 验证结果
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
      if (!offerRule) {
        result.errMsg = "报价规则匹配失败，无法匹配到可用规则";
        result.steps.offerRuleMatch = false;
        return result;
      }
      result.steps.offerRuleMatch = true;
      result.offerRule = offerRule;

      // 4. 验证电影信息获取
      // 判断规则里是否有指定电影格式的（2D/3D）
      let matchRuleList = [offerRule]; // 使用匹配到的规则作为参考
      let filmTypeFlag = matchRuleList.some(item => !!item?.film_type?.length);
      const movieInfo = await this.getMovieInfo(
        orderJson,
        filmTypeFlag,
        matchRuleList
      );
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
          movieData: movieInfo
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
window.h5UmeOfferObj = (plat_name, app_name) => {
  return new getH5UmeOfferPrice({ appFlag: app_name, plat_name });
};
// 订单报价管理校验：
// window.h5UmeOfferObj("mayi", "hsmzyc").validateOfferOrder(orderJson)
// 获取订单最终报价：
// window.h5UmeOfferObj("mayi", "hsmzyc").getEndOfferPrice({ order: orderJson, offerList: [] })
export default getH5UmeOfferPrice;
