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
import { APP_API_OBJ } from "@/common/index.js";
import {
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST,
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
   * 重写基类的 getEndOfferPrice
   * 确保始终包含 err_msg 和 err_info
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Array} params.offerList - 报价列表（可选）
   * @returns {Promise<Object>} 报价结果 { err_msg, err_info, endPrice, offerRule }
   */
  async getEndOfferPrice({ order, offerList }) {
    try {
      // 调用基类方法
      const result = await super.getEndOfferPrice({ order, offerList });

      // 确保返回结构一致：成功时补充 err_msg/err_info
      if (result.endPrice) {
        const { err_msg = "", err_info = "" } =
          this.logger?.getLastErrMsgAndInfo() || {};
        return { ...result, err_msg, err_info };
      }

      // 错误情况：buildErrorResponse已包含err_msg和err_info
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

      // 固定报价规则（offerType=1）
      let fixedAmountRuleList = otherRuleList.filter(
        item => item.offerType === "1" && item.offerAmount
      );
      if (movieInfo?.media && fixedAmountRuleList.length) {
        let film_type = movieInfo.media?.toUpperCase();
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
      if (fixedAmountRuleList.length) {
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
            city_id: movieInfo.city_id,
            cinema_id: movieInfo.cinema_id
          },
          logger: this.logger
        });
        this.logger.infoSave("根据影院获取券类型列表返回", {
          quanTypeList: appQuanTypeList?.map(
            ({ quanStockListByPhone, ...item }) => item
          ),
          useMobileList
        });
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
        const memberPriceRes = await this.getMemberPrice({
          order,
          movieData: movieInfo,
          minAddAmountRule
        });
        if (memberPriceRes === -1 || memberPriceRes === -3) {
          console.error("获取电影放映信息或者座位信息失败直接返回null");
          return null;
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
            this.logger.warnSave("获取真实加价金额失败,返回最小固定报价规则", {
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
        this.logger.infoSave("最小加价规则不存在,返回最小固定报价规则", {
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
      const { ticket_num, app_name } = order;
      // 获取当前场次电影信息，防止接口重复掉
      let movieInfo = movieData;

      if (!movieInfo) {
        movieInfo = await this.cinemaManage.getMovieInfo(order);
      }
      console.log("待报价订单当前场次电影相关信息", movieInfo);
      if (!movieInfo) {
        console.error("获取当前场次电影信息失败", "不再进行报价");
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
