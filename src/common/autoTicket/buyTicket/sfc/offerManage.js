/**
 * SFC报价管理模块
 *
 * 职责：
 * - 继承 BaseOfferPrice 基类，实现 SFC 系列报价逻辑
 * - 报价规则匹配、会员价获取、成本价计算、最终报价计算
 *
 * 所属流程：报价流程
 *
 * 依赖模块：
 * - BaseOfferPrice: 报价基类，提供模板方法
 * - SfcCardQuanManage: 卡券管理模块
 * - SfcCinemaManage: 影院管理模块
 * - SfcSeatManage: 座位管理模块
 *
 * @module sfc/offerManage
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
  GET_SFC_APP_LIST,
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
import SfcCardQuanManage from "./cardQuanManage.js";
import SfcCinemaManage from "./cinemaManage.js";
import SfcSeatManage from "./seatManage.js";
import {
  applyDynamicPricing,
  applyProfitAddition,
  applyNightMaxPrice,
  handleOverrunCheck,
  calcOfferCostProfitParts
} from "../common/offerHelper";
import { calculateMostSeatPrice } from "../common/seatPriceHelper";

const tokens = platTokens();

/**
 * 判断SFC是否系统故障（连续两个订单创建失败）
 * @param {Array} orders - 订单列表
 * @returns {boolean} 是否系统故障
 */
function checkConsecutiveErrors(orders) {
  if (!orders?.length || orders.length < 2) {
    return false;
  }
  for (let i = 0; i < orders.length - 1; i++) {
    const currentOrder = orders[i];
    const nextOrder = orders[i + 1];

    // 判断当前订单是否满足条件
    const currentMatches =
      currentOrder.err_msg?.includes("计算订单价格异常") &&
      currentOrder.err_info &&
      JSON.parse(currentOrder.err_info)?.msg === "请求接口超时,请重试";

    // 判断下一个订单是否满足条件
    const nextMatches =
      nextOrder.err_msg?.includes("计算订单价格异常") &&
      nextOrder.err_info &&
      JSON.parse(nextOrder.err_info)?.msg === "请求接口超时,请重试";

    if (currentMatches && nextMatches) {
      return true;
    }
  }
  return false;
}

class getSfcOfferPrice extends BaseOfferPrice {
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
    this.cardQuanManage = new SfcCardQuanManage(order, this.logger); // 卡券管理模块
    this.cinemaManage = new SfcCinemaManage(order, this.logger); // 影院管理模块
    this.seatManage = new SfcSeatManage(order, this.logger, false); // 座位管理模块
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

      // 判断规则里是否有指定电影格式的（2D/3D）
      let filmTypeFlag = matchRuleList.some(item => !!item?.film_type?.length);
      let movieInfo, filmType;

      // 获取电影放映信息以匹配电影格式
      movieInfo = await this.cinemaManage.getMovieInfo(order);
      if (!movieInfo) {
        this.logger.infoSave(
          "报价规则匹配时获取当前场次电影信息失败，直接不报"
        );
        return null;
      }

      if (filmTypeFlag) {
        // 当前场次电影格式
        filmType = movieInfo.media;
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

    this.logger.infoSave("sfc计算报价相关信息", {
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
   * 重写基类的getEndOfferPrice方法，添加SFC特殊逻辑（系统异常检查）
   * 并确保返回结构与原始sfcOffer一致（始终包含err_msg和err_info）
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {Array} params.offerList - 报价列表（可选）
   * @returns {Promise<Object>} 报价结果 { err_msg, err_info, endPrice, offerRule }
   */
  async getEndOfferPrice({ order, offerList }) {
    try {
      // 调用基类方法
      const result = await super.getEndOfferPrice({ order, offerList });

      // SFC特殊逻辑：检查系统是否异常（连续两个订单创建失败）
      if (result.endPrice) {
        let isAnomaly = window.localStorage.getItem("isAnomaly");
        if (isAnomaly === "1") {
          let ticketList = await this.getTicketList();
          ticketList = ticketList?.filter(item =>
            GET_SFC_APP_LIST().includes(item.app_name)
          );
          let isAbnormal =
            ticketList?.length >= 2
              ? checkConsecutiveErrors(ticketList)
              : false;
          if (isAbnormal) {
            this.logger.errorSave("sfc疑似故障，暂不报价", {
              isAbnormal,
              ticketList
            });
            return this.buildErrorResponse(result.offerRule);
          }
        }
      }

      // 确保返回结构与原始sfcOffer一致：始终包含err_msg和err_info
      // BaseOfferPrice.buildSuccessResponse返回 { endPrice, offerRule, order_number }
      // 需要补充 err_msg 和 err_info（成功时为空字符串）
      if (result.endPrice) {
        const { err_msg = "", err_info = "" } =
          this.logger?.getLastErrMsgAndInfo() || {};
        return {
          ...result,
          err_msg,
          err_info
        };
      }

      // 错误情况：buildErrorResponse已包含err_msg和err_info
      return result;
    } catch (error) {
      this.logger?.errorSave("获取最终报价信息方法执行异常", error);
      return this.buildErrorResponse();
    }
  }

  /**
   * 获取出票记录
   * @returns {Promise<Array>} 出票记录列表
   */
  async getTicketList() {
    try {
      const ticketRes = await svApi.queryTicketList({
        user_id: tokens.userInfo.user_id,
        page_num: 1,
        page_size: 30,
        isNeedTotalNum: 0,
        queryFields: "app_name,err_msg,err_info"
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      this.logger.errorSave("获取最新50条出票记录异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
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
        let memberPriceRes = await this.getMemberPrice({
          order,
          movieData: movieInfo,
          minAddAmountRule
        });
        if (memberPriceRes === -1 || memberPriceRes === -3) {
          return null;
        }
        if (!memberPriceRes) {
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
      if (!movieData) {
        movieInfo = await this.cinemaManage.getMovieInfo(order);
      }
      console.log("待报价订单当前场次电影相关信息", movieInfo);
      if (!movieInfo) {
        console.error("获取当前场次电影信息失败", "不再进行报价");
        return -1;
      }
      let { member_price, nonmember_price, city_id, cinema_id, show_id } =
        movieInfo;
      if (show_id) {
        const seatInfo = await this.seatManage.getSeatLayout({
          city_id,
          cinema_id,
          show_id,
          session_id: "" // 报价时不需要session_id
        });
        if (!seatInfo || seatInfo.error) return -3;
        let { promo_num, area_price, seatData } = seatInfo;
        this.logger.infoSave("获取座位布局相关信息", {
          area_price,
          promo_num
        });
        if (promo_num && promo_num < +ticket_num) {
          this.logger.errorSave("促销票数低于订单票数", {
            promo_num,
            ticket_num
          });
          return null;
        }
        let bigPrice, maxSeatPrice, mostSeatPrice;
        if (area_price?.length) {
          // 座位分区从高到低排序
          let areaList = area_price.sort((a, b) => b.price - a.price);
          // 默认取最高价
          maxSeatPrice = areaList[0].price;
          bigPrice = maxSeatPrice;
          // 获取最多座位价格
          mostSeatPrice = this.getMostSeatPrice(seatData, areaList);
          if (minAddAmountRule?.memberPriceRule == "2") {
            bigPrice = mostSeatPrice;
            this.logger.infoSave("报价规则从最多座位价格获取会员价", {
              mostSeatPrice
            });
          }
          this.logger.infoSave("取座位价格和会员价的最大值当会员价", {
            member_price,
            bigPrice
          });
          member_price = Math.max(member_price, bigPrice);
        }
      }
      console.log("获取会员价", member_price);
      if (member_price <= 0 && nonmember_price) {
        this.logger.warnSave("获取会员价时由于会员价不存在拿非会员价当会员价", {
          nonmember_price: "非会员价：" + nonmember_price
        });
        member_price = Number(nonmember_price);
      }
      if (member_price === 0) {
        this.logger.errorSave("获取会员价为0", {
          member_price,
          nonmember_price
        });
        return null;
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
            : item.linkCinemaIds.split(",").some(itemA => itemA == cinema_id);
        });
        this.logger.infoSave("根据制定影院过滤后的卡列表", {
          des: "根据制定影院过滤后的卡列表",
          level: "info",
          info: {
            cardList: cardList.map(item => item.card_num)
          }
        });
        if (!cardList.length) {
          this.logger.errorSave("影院单卡出票限制，无可用卡", {
            ticket_num,
            cinema_id
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
      this.logger.errorSave("获取会员价异常", { error: formatErrInfo(error) });
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
    return calculateMostSeatPrice({
      seatList: seat_data,
      areaList,
      extractors: {
        // SFC：数组结构 seat = [seat_id, x, status, ?, ?, area_id...]
        isSeatAvailable: seat => seat?.[2] == 0,
        getSeatAreaId: seat => seat?.[seat.length - 1],
        getAreaId: area => area?.area_id,
        getAreaPrice: area => area?.settlePrice
      },
      logger: this.logger
    });
  }
}

// 测试报价实例的方法
window.sfcOfferObj = (plat_name, app_name) => {
  return new getSfcOfferPrice({ appFlag: app_name, plat_name });
};
// 获取订单最终报价：
// window.sfcOfferObj("mayi", "hbchyxd").getEndOfferPrice({ order: orderJson, offerList: [] })
export default getSfcOfferPrice;
