/**
 * 万达报价管理模块
 *
 * 职责：
 * - 继承 BaseOfferPrice，实现万达系列的报价逻辑
 * - 报价规则匹配、会员价获取、成本价计算
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
import { APP_API_OBJ } from "@/common/index.js";
import { NO_FEE_PLAT_LIST, ONE_STEP_PLAT_LIST } from "@/common/constant.js";
import { platTokens } from "@/store/platTokens";
import Logger from "@/common/logger.js";
import BaseOfferPrice from "@/common/core/BaseOfferPrice.js";
import WandaCardQuanManage from "./cardQuanManage.js";
import WandaCinemaManage from "./cinemaManage.js";
import WandaSeatManage from "./seatManage.js";
import {
  applyDynamicPricing,
  applyProfitAddition,
  applyNightMaxPrice,
  handleOverrunCheck,
  calcOfferCostProfitParts
} from "../common/offerHelper";
import { calculateMostSeatPrice } from "../common/seatPriceHelper";

const tokens = platTokens();

class WandaOfferPrice extends BaseOfferPrice {
  constructor({ appFlag, plat_name }) {
    super({ appFlag, plat_name });
    this.appApi = APP_API_OBJ[appFlag];
  }

  /**
   * 初始化依赖模块
   */
  initModules(order) {
    this.logger = new Logger({ logType: 1 });
    this.logger.init(order);
    this.cardQuanManage = new WandaCardQuanManage(order, this.logger);
    this.cinemaManage = new WandaCinemaManage(order, this.logger);
    this.seatManage = new WandaSeatManage(order, this.logger, false);
  }

  /**
   * 获取最终匹配的报价规则
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

      // 获取电影信息（用于格式过滤和后续规则匹配）
      const movieInfo = await this.cinemaManage.getMovieInfo(order);
      console.warn("获取到的电影信息", movieInfo);
      if (!movieInfo) {
        this.logger.infoSave(
          "报价规则匹配时获取当前场次电影信息失败，直接不报"
        );
        return null;
      }

      // 判断规则里是否有指定电影格式的（2D/3D）
      const filmTypeFlag = matchRuleList.some(
        item => !!item?.film_type?.length
      );
      if (filmTypeFlag && movieInfo.media != null) {
        // Wanda 的 media 可能是数字(1)或字符串("2D")，统一转字符串
        const filmType = String(movieInfo.media).toUpperCase();
        matchRuleList = matchRuleList.filter(item =>
          item.film_type?.length
            ? item.film_type.some(itemA => filmType.includes(itemA))
            : true
        );
        if (!matchRuleList?.length) {
          this.logger.errorSave("按电影格式筛选后，报价规则为空", {
            filmType,
            matchRuleList
          });
          return null;
        }
      }

      // 获取最低报价规则
      let endRule = await this.getMinAmountOfferRule(
        matchRuleList,
        order,
        movieInfo
      );
      console.warn("最终匹配到的报价规则", endRule);
      if (!endRule) return null;
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
   * 计算最终报价（对齐 SFC 管线：动态调价 → 利润加价 → 夜间顶价 → 超限检查 → 成本利润）
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
        groupList: [],
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
    if (profitDiff <= 0) {
      let str = `最终报价${adjustedPrice}低于真实成本${real_cost_price}`;
      this.logger.errorSave(str);
      return null;
    }

    // 最大卡券成本（基类 getEndOfferPrice 依赖它过滤券类型）
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
   * 重写基类的 getEndOfferPrice，对齐 SFC 返回结构
   * 确保始终包含 err_msg 和 err_info
   */
  async getEndOfferPrice({ order, offerList }) {
    try {
      const result = await super.getEndOfferPrice({ order, offerList });

      // 确保返回结构一致：成功时补充 err_msg/err_info
      if (result.endPrice) {
        const { err_msg = "", err_info = "" } =
          this.logger?.getLastErrMsgAndInfo() || {};
        return { ...result, err_msg, err_info };
      }
      return result;
    } catch (error) {
      this.logger?.errorSave("获取最终报价异常", error);
      return this.buildErrorResponse();
    }
  }

  /**
   * 获取最低报价规则（从匹配规则列表中选取最优）
   * @param {Array} ruleList - 规则列表
   * @param {Object} order - 订单信息
   * @param {Object} movieInfo - 电影信息（含 media/2D/3D 等）
   * @returns {Object|null} 最低报价规则
   */
  async getMinAmountOfferRule(ruleList, order, movieInfo) {
    try {
      // 1. 优先处理会员日报价规则
      const memberDayRules = ruleList.filter(
        item => item.memberDay && item.offerType === "3" && item.offerAmount
      );
      memberDayRules.sort((a, b) => a.offerAmount - b.offerAmount);
      if (memberDayRules.length) {
        this.logger.infoSave("命中会员日报价规则");
        return memberDayRules[0];
      }

      // 2. 处理普通报价规则
      const otherRules = ruleList.filter(
        item => !item.memberDay && item.offerType !== "3"
      );

      // 固定报价规则（offerType=1）
      let fixedRules = otherRules.filter(
        item => item.offerType === "1" && item.offerAmount
      );
      // 根据电影格式过滤固定报价规则
      if (movieInfo?.media != null && fixedRules.length) {
        const filmType = String(movieInfo.media).toUpperCase();
        if (filmType) {
          fixedRules = fixedRules.filter(item =>
            item.film_type?.length
              ? item.film_type.some(itemA => filmType.includes(itemA))
              : true
          );
          this.logger.infoSave("根据电影格式过滤后的固定报价规则列表", {
            fixedRules
          });
        }
      }

      // 3. 如果有固定报价规则，按金额排序取最低
      if (fixedRules.length) {
        fixedRules.sort((a, b) => a.offerAmount - b.offerAmount);
        return fixedRules[0];
      }

      // 会员价加价规则（offerType=2）
      const addAmountRules = otherRules.filter(
        item => item.offerType === "2" && item.addAmount
      );

      // 4. 会员价加价规则（offerType=2）需要比较会员价和固定价
      let mixFixedAmountRule = fixedRules.length ? fixedRules[0] : null;
      let minAddAmountRule = addAmountRules[0];
      // 如果addAmount设置比较特殊，优先取单一addAmount的规则
      if (
        addAmountRules.length > 1 &&
        addAmountRules.every(item => item?.addAmount?.split(";")?.length === 1)
      ) {
        minAddAmountRule = addAmountRules.sort(
          (a, b) => a.addAmount - b.addAmount
        )[0];
      }

      if (minAddAmountRule) {
        let addMountRule = minAddAmountRule.addAmount?.split(";");
        if (addMountRule.length === 1) {
          minAddAmountRule.realAddMount = addMountRule[0];
        } else if (addMountRule.length > 1) {
          minAddAmountRule.addMountRule = addMountRule.slice();
        }

        // 计算会员报价
        const memberPriceRes = await this.getMemberPrice({
          order,
          movieData: movieInfo,
          minAddAmountRule
        });
        if (memberPriceRes === -1 || memberPriceRes === -3) {
          this.logger.infoSave("获取会员价失败，返回固定报价规则");
          return mixFixedAmountRule;
        }
        if (!memberPriceRes) {
          this.logger.infoSave(
            "最小加价规则获取会员价失败，返回最小固定报价规则",
            { fixedOfferAmount: mixFixedAmountRule?.offerAmount }
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
            this.logger.warnSave("获取真实加价金额失败，返回最小固定报价规则", {
              real_member_price: memberPriceRes.real_member_price,
              addMountRule: minAddAmountRule.addMountRule
            });
            return mixFixedAmountRule;
          }
          minAddAmountRule.realAddMount = realAddMount;
        }
        // 最小折扣
        minAddAmountRule.member_discount = memberPriceRes.discount;
        // 会员成本价（真实会员价*折扣）
        minAddAmountRule.memberCostPrice = memberPriceRes.member_price;
        // 会员成本价取整
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
        this.logger.infoSave("最小加价规则不存在，返回最小固定报价规则", {
          fixedOfferAmount: mixFixedAmountRule?.offerAmount
        });
        return mixFixedAmountRule;
      }

      // 5. 比较会员价和固定价，取低价
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
   * 获取会员价（对齐 SFC 实现）
   */
  async getMemberPrice({ order, movieData, minAddAmountRule }) {
    try {
      console.log("准备获取万达会员价", order);
      const { ticket_num, app_name } = order;
      let movieInfo = movieData;

      if (!movieInfo) {
        movieInfo = await this.cinemaManage.getMovieInfo(order);
      }
      console.log("待报价订单当前场次电影相关信息", movieInfo);
      if (!movieInfo) {
        console.error("获取当前场次电影信息失败，不再进行报价");
        return -1;
      }

      let {
        member_price,
        nonmember_price,
        city_id,
        cinema_id,
        show_id,
        showtimeId
      } = movieInfo;
      console.log("showtimeId", showtimeId);

      // 1、获取座位价格（决定 basis price）
      if (showtimeId && this.seatManage) {
        const seatInfo = await this.seatManage.getSeatLayout({
          dId: showtimeId,
          json: true
        });
        if (!seatInfo) return -3;

        const areas = seatInfo.area || [];
        let bigPrice = 0;
        if (areas.length) {
          const areaList = areas
            .map(a => ({ price: a.areaPrice?.salesPrice || 0 }))
            .sort((a, b) => b.price - a.price);
          bigPrice = areaList[0]?.price || 0;

          if (minAddAmountRule?.memberPriceRule == "2") {
            bigPrice = this.getMostSeatPrice(seatInfo);
            this.logger.infoSave("报价规则从最多座位价格获取会员价", {
              mostSeatPrice: bigPrice
            });
          }
          this.logger.infoSave("取座位价格和会员价的最大值当会员价", {
            member_price,
            bigPrice
          });
          member_price = Math.max(member_price || 0, bigPrice);
        }
      }

      // 2、降级处理：无会员价时使用非会员价
      console.log("获取会员价", member_price);
      if (!member_price && nonmember_price) {
        this.logger.warnSave("获取会员价时由于会员价不存在拿非会员价当会员价", {
          nonmember_price
        });
        member_price = Number(nonmember_price);
      }
      if (!member_price) {
        this.logger.errorSave("获取会员价为0", {
          member_price,
          nonmember_price
        });
        return null;
      }

      // 3、查询卡折扣（对齐 SFC：svApi.queryCardList → 按手机号/出票量/影院过滤 → 取最低折扣）
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
          daily_usage:
            item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0,
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

        // 过滤指定影院可用的卡
        let cardList = cardListLimit.filter(item => {
          return !item.linkCinemaIds
            ? true
            : item.linkCinemaIds.split(",").some(itemA => itemA == cinema_id);
        });
        this.logger.infoSave("根据指定影院过滤后的卡列表", {
          cardList: cardList.map(item => item.card_num)
        });

        if (!cardList.length) {
          this.logger.errorSave("该影院没有可用会员卡", {
            ticket_num,
            cinema_id,
            cinema_name: order.cinema_name
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
        let real_member_price = Number(member_price);
        member_price = discount
          ? (Number(member_price) * 100 * discount) / 10000
          : Number(member_price);

        this.logger.infoSave("获取会员价相关信息返回", {
          real_member_price,
          discount,
          cost_member_price: Number(member_price.toFixed(2))
        });
        return {
          real_member_price,
          discount,
          member_price: Number(member_price.toFixed(2))
        };
      }
    } catch (error) {
      this.logger.errorSave("获取会员价异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  /**
   * 获取真实加价金额（处理 >=+2;<+1 这种多段加价）
   */
  getRealAddMount({ real_member_price, addMountRule }) {
    for (const rule of addMountRule) {
      const match = rule.match(/^([><=]+)\+(\d+)$/);
      if (match) {
        const op = match[1];
        const val = Number(match[2]);
        if (op === ">=" && real_member_price >= val) return val;
        if (op === ">" && real_member_price > val) return val;
        if (op === "<=" && real_member_price <= val) return val;
        if (op === "<" && real_member_price < val) return val;
        if (op === "=" && real_member_price === val) return val;
      }
    }
    return null;
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
// 测试报价实例的方法
window.wandaOfferObj = (plat_name, app_name) => {
  return new WandaOfferPrice({ appFlag: app_name, plat_name });
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
export default WandaOfferPrice;
