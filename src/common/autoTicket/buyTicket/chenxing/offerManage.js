// sfc报价逻辑
import {
  getCurrentTime,
  formatTimeOfTime,
  getCurrentDay,
  convertFullwidthToHalfwidth,
  offerRuleMatch,
  logUpload,
  formatErrInfo,
  getTargetCinemaCommon,
  calcCount,
  roundToHalf,
  isDateInCurrentMonth,
  getCinemaLoginInfoList,
  findMostRepeatedChars
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import { GROUP_LIST, TEST_NEW_PLAT_LIST } from "@/common/constant.js";
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
class getChenxingOfferPrice {
  constructor({ appFlag, plat_name }) {
    // console.log("APP_API_OBJ", APP_API_OBJ, appFlag, plat_name);
    this.appFlag = appFlag; // 影线标识
    this.plat_name = plat_name; // 平台标识
    this.appApi = APP_API_OBJ[appFlag];
    this.logList = []; // 操作运行日志
  }

  // 获取最终报价信息（唯一暴漏给外包用的方法）
  async getEndOfferPrice({ order, offerList }) {
    this.logger = new Logger({ logType: 1 }); // 日志管理模块
    this.cardQuanManage = new CardQuanManage(order, this.logger); // 卡券管理模块
    this.cinemaManage = new CinemaManage(order, this.logger); // 影院管理模块

    const { plat_name, appFlag } = this;
    let endPrice, offerRule;
    let { supplier_max_price, rewards, order_number } = order || {};
    try {
      // 获取匹配到的最终报价规则
      offerRule = await this.getEndMatchOfferRule(order);
      if (!offerRule) {
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "最终匹配到的报价规则",
        level: "info",
        info: {
          offerRule
        }
      });
      const {
        offerAmount,
        memberOfferAmount,
        memberCostPrice = 0,
        quanValue,
        offerType
      } = offerRule;
      let price = Number(offerAmount || memberOfferAmount);
      if (!price) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "从最终报价规则里获取报价价格失败",
          level: "error"
        });
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      // 成本价
      let cost_price;
      if (offerType === "1") {
        const quanInfo = await this.cardQuanManage.getQuanInfo(
          quanValue,
          appFlag
        );
        cost_price = quanInfo?.quan_cost;
      } else {
        cost_price = Number(memberCostPrice);
      }
      if (!cost_price) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取出票成本价格失败",
          level: "error"
        });
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      offerRule.cost_price = cost_price; // 成本价
      // 获取最终报价
      endPrice = await this.getEndPrice({
        cost_price,
        supplier_max_price,
        price,
        rewards,
        offerType,
        offerList,
        plat_name
      });
      console.warn("最终报价返回", endPrice);
      if (!endPrice) {
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      // 最终报价
      offerRule.offer_end_amount = endPrice;
      return this.returnResultHandle({ endPrice, offerRule, order_number });
    } catch (error) {
      console.error("获取最终报价信息方法执行异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取最终报价信息方法执行异常",
        level: "error",
        info: {
          error
        }
      });
      return this.returnResultHandle({ endPrice, offerRule, order_number });
    }
  }

  // 返回获取最终报价结果
  returnResultHandle({ endPrice, offerRule, order_number }) {
    const { plat_name, appFlag } = this;
    let err_msg, err_info;
    try {
      const errInfoObj = this.logList
        .filter(item => item.level === "error")
        .reverse()?.[0];
      err_msg = errInfoObj?.des || "";
      err_info = formatErrInfo(errInfoObj?.info) || "";
    } catch (error) {
      err_msg = "返回报价处理结果异常";
      err_info = formatErrInfo(error) || "";
    } finally {
      logUpload(
        {
          plat_name,
          app_name: appFlag,
          order_number,
          type: 1
        },
        this.logList
      );
      return { err_msg, err_info, endPrice, offerRule };
    }
  }

  // 获取最终匹配到的报价规则
  async getEndMatchOfferRule(order) {
    try {
      const matchRuleListRes = offerRuleMatch(order);
      let matchRuleList = matchRuleListRes?.matchRuleList || [];
      if (!matchRuleList?.length) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "报价规则匹配后为空",
          level: "error",
          info: {
            error: matchRuleListRes?.error,
            order
          }
        });
        return;
      }
      matchRuleList = JSON.parse(JSON.stringify(matchRuleList));
      // 判断规则里是否有指定电影格式的（2D/3D）
      let filmTypeFlag = matchRuleList.find(
        item => item?.film_type?.length == 1
      );
      let filmType; // 电影放映信息
      // 获取电影放映信息以匹配电影格式
      const buyTicketInfo = await this.cinemaManage.getBuyPrevCinemaInfo(1);
      let movieInfo = buyTicketInfo?.targetShow;
      if (!movieInfo) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "报价规则匹配时获取当前场次电影信息失败，直接不报",
          level: "info"
        });
        return;
      }
      if (filmTypeFlag) {
        // 当前场次电影格式
        filmType = movieInfo.media;
        if (filmType) {
          filmType = filmType.toUpperCase();
          matchRuleList = matchRuleList.filter(
            item => item.film_type[0] === filmType
          );
        }
      }
      if (!matchRuleList?.length) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "过滤完电影格式后匹配报价规则为空",
          level: "error",
          info: {
            filmTypeFlag,
            filmType,
            movieInfo
          }
        });
        return;
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "报价规则匹配列表",
        level: "info",
        info: {
          matchRuleList
        }
      });
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
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "根据券库存过滤后固定报价规则为空",
            level: "error",
            info: {
              fixedAmountRuleList
            }
          });
        }
        console.error("最终匹配到的报价规则不存在");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "最终匹配到的报价规则不存在",
          level: "info"
        });
        return;
      }
      endRule = JSON.parse(JSON.stringify(endRule));
      return endRule;
    } catch (error) {
      console.error("获取最终匹配报价规则异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取最终匹配报价规则异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取报价最低的报价规则
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
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "命中会员日报价规则",
          level: "info"
        });
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
      const appQuanTypeList = await this.cardQuanManage.getQuanTypeListByApp();
      // 异步更新券库存
      this.cardQuanManage.syncUpdateQuanStock({
        cinemaCode: movieInfo.cinemaCode,
        cinemaId: movieInfo.cinemaId,
        quanTypeList: appQuanTypeList
      });
      if (fixedAmountRuleList.length) {
        // 校验其库存，进行过滤
        if (appQuanTypeList?.length) {
          fixedAmountRuleList = fixedAmountRuleList.filter(item => {
            let targetQuanInfo = appQuanTypeList.find(
              itemA => itemA.quan_value == item.quanValue
            );
            let quan_stock = targetQuanInfo?.quan_stock;
            return quan_stock
              ? quan_stock >= order.ticket_num
              : quan_stock == 0
                ? false
                : true;
          });
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "根据券库存过滤后的固定报价规则列表",
            level: "info",
            info: {
              fixedAmountRuleList
            }
          });
        } else {
          fixedAmountRuleList = [];
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "根据影院获取券类型列表为空，固定报价规则列表进行置空处理",
            level: "info",
            info: {
              appQuanTypeList
            }
          });
        }
      }
      let mixFixedAmountRule = fixedAmountRuleList.sort(
        (itemA, itemB) => itemA.offerAmount - itemB.offerAmount
      )?.[0];
      // 会员价加价报价规则
      let addAmountRuleList = otherRuleList.filter(
        item => item.offerType === "2" && item.addAmount
      );
      let mixAddAmountRule = addAmountRuleList.sort(
        (itemA, itemB) => itemA.addAmount - itemB.addAmount
      )?.[0];
      if (mixAddAmountRule) {
        // 计算会员报价
        let memberPriceRes = await this.getMemberPrice(order, movieInfo);
        if (memberPriceRes === -1) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取当前场次电影信息失败，直接不报",
            level: "info"
          });
          return;
        }
        if (!memberPriceRes) {
          console.warn(
            "最小加价规则获取会员价失败,返回最小固定报价规则",
            mixFixedAmountRule
          );
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "最小加价规则获取会员价失败,返回最小固定报价规则",
            level: "warn",
            info: {
              memberPriceRes,
              fixedOfferAmount: mixFixedAmountRule?.offerAmount
            }
          });
          return mixFixedAmountRule;
        }
        // 真实会员价
        mixAddAmountRule.real_member_price = memberPriceRes.real_member_price;
        // 最小折扣
        mixAddAmountRule.member_discount = memberPriceRes.discount;
        // 会员成本价(真实会员价*折扣价)
        mixAddAmountRule.memberCostPrice = memberPriceRes.member_price;
        // 会员成本价不为0.5的整数倍时进0.5
        mixAddAmountRule.round_member_price = roundToHalf(
          mixAddAmountRule.memberCostPrice
        );
        // 会员预计报价
        mixAddAmountRule.memberOfferAmount =
          mixAddAmountRule.round_member_price +
          Number(mixAddAmountRule.addAmount);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "会员报价最终信息",
          level: "info",
          info: {
            real_member_price:
              "真实会员价：" + mixAddAmountRule.real_member_price,
            member_discount: "会员最小折扣" + mixAddAmountRule.member_discount,
            memberCostPrice:
              "会员成本价（真实会员价*折扣）：" +
              mixAddAmountRule.memberCostPrice,
            addAmount: "最小加价金额：" + mixAddAmountRule.addAmount,
            round_member_price:
              "会员成本价按0.5向上取整数倍：" +
              mixAddAmountRule.round_member_price,
            memberOfferAmount:
              "会员预计报价：" + mixAddAmountRule.memberOfferAmount
          }
        });
      } else {
        console.warn(
          "最小加价规则不存在,返回最小固定报价规则",
          mixFixedAmountRule
        );
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "最小加价规则不存在,返回最小固定报价规则",
          level: "info",
          info: {
            fixedOfferAmount: mixFixedAmountRule?.offerAmount
          }
        });
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
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "会员报价高于固定报价，返回最小固定报价规则",
          level: "info",
          info: {
            memberOfferAmount: mixAddAmountRule.memberOfferAmount,
            fixedOfferAmount: mixFixedAmountRule.offerAmount
          }
        });
        return mixFixedAmountRule;
      } else {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "会员报价低于固定报价，返回最小加价报价规则",
          level: "info",
          info: {
            memberOfferAmount: mixAddAmountRule.memberOfferAmount,
            fixedOfferAmount: mixFixedAmountRule.offerAmount
          }
        });
        return mixAddAmountRule;
      }
    } catch (error) {
      console.error("获取最低报价规则异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取最低报价规则异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }
  // 获取最终报价
  async getEndPrice(params) {
    try {
      let {
        cost_price,
        supplier_max_price,
        price,
        rewards,
        offerType,
        offerList,
        plat_name
      } = params || {};
      // console.log("获取最终报价相关字段", params);
      // 远端报价记录
      let serOfferRecord, lierenOfferRecord, lierenMachineOfferList;
      let adjustPrice = window.localStorage.getItem("adjustPrice");
      if (adjustPrice) {
        adjustPrice = JSON.parse(adjustPrice);
        serOfferRecord = offerList;
        lierenOfferRecord = [];
        lierenMachineOfferList = lierenOfferRecord.filter(item =>
          serOfferRecord.find(itemA => itemA.order_number === item.order_number)
        );
      }
      if (adjustPrice && lierenMachineOfferList?.length) {
        console.warn(
          "自动调价生效，开始进行相关处理",
          adjustPrice,
          lierenMachineOfferList
        );
        let countRes = calcCount(lierenMachineOfferList);
        const { inCount, outCount, inPrice, outPrice } = adjustPrice;
        // console.log("inCount", inCount, outCount, inPrice, outPrice);
        let str;
        if (countRes.inCount && inPrice && countRes.inCount >= inCount) {
          price = price + Number(inPrice);
          str = `动态调价后的价格-${price}, 增加了-${inPrice}`;
          console.warn(str);
        } else if (
          countRes.outCount &&
          outPrice &&
          countRes.outCount >= outCount
        ) {
          price = price - Number(outCount);
          str = `动态调价后的价格-${price}, 降低了-${outPrice}`;
          console.warn(str);
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "动态调价生效:" + str,
          level: "info"
        });
      }
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
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "开启夜间顶价",
          level: "info"
        });
      }
      // 规则报价
      let rule_price = price;
      // 省、蚂蚁最后报价要求整数
      if (["sheng", "mayi", "yangcong"].includes(plat_name)) {
        price = Math.round(price);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "调整最终报价为规则报价四舍五入取整",
          level: "info"
        });
      }
      // 最终报价高于平台限价，卡关闭超限报价直接不报
      if (price >= Number(supplier_max_price)) {
        let isOverrunOffer = window.localStorage.getItem("isOverrunOffer");
        if (isOverrunOffer !== "1" && offerType !== "1") {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: `用卡报价时，最终报价${price}超过平台限价${supplier_max_price}，超限报价处于关闭状态不进行报价`,
            level: "error"
          });
          return;
        }
        // 券或者卡开了超限报价调整规则报价为平台限价
        if (["sheng", "mayi", "yangcong"].includes(plat_name)) {
          price = Math.floor(supplier_max_price);
        } else {
          // 向下取0.5的倍数
          price = roundToHalf(supplier_max_price, -1);
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "调整最终报价为平台限价四舍五入去整",
          level: "info"
        });
      }

      // 手续费
      const shouxufei = (price * 100) / 10000;

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
        console.error(str);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: str,
          level: "error"
        });
        return;
      }

      this.logList.push({
        opera_time: getCurrentTime(),
        des: "sfc计算报价相关信息",
        level: "info",
        info: {
          rule_price: "规则计算报价：" + rule_price,
          profitAddPrice: "单店加价金额：" + profitAddPrice,
          supplier_max_price: "平台最高限价：" + supplier_max_price,
          cardQuanCost: "卡券成本：" + cardQuanCost,
          price: "最终报价：" + price,
          shouxufei: "手续费（最终报价*1%）：" + shouxufei,
          cost_price: "出票成本（卡券成本+手续费）：" + cost_price,
          rewardPrice:
            `奖励金额(最终报价*奖励百分比-${rewards})：` + rewardPrice,
          real_cost_price: "真实成本（出票成本-奖励金额）：" + real_cost_price,
          expectProfit: "预计利润（最终报价-真实成本）：" + expectProfit
        }
      });
      return price;
    } catch (error) {
      console.error("获取最终报价异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取最终报价异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取会员价
  async getMemberPrice(order, movieData) {
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
        cinemaCode,
        cinemaId,
        filmId,
        featureAppNo,
        standardPrice: member_price, // 标准会员价
        servicePrice, // 服务费
        serviceAddFee // 服务附加费
      } = movieInfo;
      console.log("获取会员价", member_price);
      if (member_price === 0) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取会员价为0",
          level: "error",
          info: {
            member_price
          }
        });
        return;
      }
      if (member_price > 0) {
        const cardRes = await svApi.queryCardList({
          app_name: app_name,
          rule: rule,
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
        // console.log("list", list);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取该影院已维护会员卡列表返回",
          level: "info",
          info: {
            list
          }
        });
        let useMobileList = getCinemaLoginInfoList()
          .filter(
            item => item.app_name === app_name && item.mobile && item.session_id
          )
          .map(item => item.mobile);
        let cardListByMobile = list.filter(item =>
          useMobileList.includes(item.mobile)
        );
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "根据该用户关联手机号对卡列表进行过滤",
          level: "info",
          info: {
            useMobileList,
            cardListByMobile
          }
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
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "根据当天及当月出票量限制过滤后",
          level: "info",
          info: {
            cardListLimit
          }
        });
        // 过滤指定卡
        let cardList = cardListLimit.filter(item => {
          return !item.linkCinemaIds
            ? true
            : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaCode);
        });
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "根据指定卡过滤后",
          level: "info",
          info: {
            cardList
          }
        });
        if (!cardList.length) {
          console.error("影院单卡出票限制");
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "影院单卡出票限制，无可用卡",
            level: "error",
            info: {
              ticket_num,
              cinemaId,
              cinemaCode
            }
          });
          return;
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
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取会员价相关信息返回",
          level: "info",
          info: {
            real_member_price,
            discount,
            cost_member_price: Number(member_price.toFixed(2))
          }
        });
        return {
          real_member_price,
          discount,
          member_price: Number(member_price.toFixed(2))
        };
      }
    } catch (error) {
      console.error("获取会员价异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取会员价异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取电影信息
  async getMovieInfo(item) {
    const { appFlag } = this;
    try {
      // 1、获取影院列表拿到影院id
      const {
        city_name,
        cinema_name,
        cinema_code,
        film_name,
        hall_name,
        show_time,
        app_name
      } = item;
      // 1、获取城市影院列表
      let allCinemaList = await this.getCityCinemaList();
      if (!allCinemaList) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取城市影院列表失败",
          level: "error"
        });
        return;
      }
      let cinemaList =
        allCinemaList?.find(item => item.cityName.includes(city_name))
          ?.cinemaList || [];
      console.log("获取城市影院列表返回", cinemaList);

      // 2、获取目标影院
      let targetCinema = cinemaList.find(
        item => item.cinemaCode == cinema_code
      );
      console.log("cinemaCode匹配结果", targetCinema);
      let getCinemaParams = {
        app_name: appFlag,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      };
      if (!targetCinema) {
        targetCinema = getTargetCinemaCommon(getCinemaParams);
      }
      if (!targetCinema) {
        console.error("获取目标影院失败");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取目标影院失败",
          level: "error",
          info: {
            ...getCinemaParams,
            cinema_name
          }
        });
        return;
      }
      // 3、获取影院放映信息用于拿会员价
      const { cinemaCode, cinemaId } = targetCinema;
      if (!cinemaCode) {
        console.error("获取目标影院失败");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取目标影院失败",
          level: "error",
          info: {
            cinemaList,
            cinema_name,
            app_name,
            city_name
          }
        });
        return;
      }

      // 2、获取影院放映信息拿到会员价
      const moviePlayInfo = await this.getMoviePlayInfo({
        cinemaCode,
        cinemaId
      });
      if (!moviePlayInfo) return;
      // 3、匹配订单拿到会员价
      const { items: movie_data } = moviePlayInfo;
      let movieInfo = movie_data.find(
        item =>
          convertFullwidthToHalfwidth(item.filmName) ===
          convertFullwidthToHalfwidth(film_name)
      );
      console.log("movieInfo", movieInfo, film_name);
      if (!movieInfo) {
        let targetFilmList = movie_data.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.filmName,
            film_name
          );
          return {
            ...item,
            ...repeatedCharsResult
          };
        });
        targetFilmList = targetFilmList.sort(
          (a, b) => b.similarity - a.similarity
        );
        // 必须有4个重复字符才采用模糊匹配结果
        if (targetFilmList[0]?.totalRepeated >= 4) {
          movieInfo = targetFilmList[0];
        } else {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "获取目标影片信息失败",
            level: "error",
            info: {
              film_name,
              movie_data
            }
          });
          return;
        }
      }
      let { id: filmId } = movieInfo;
      // 获取某个放映日期的场次列表
      const showList = await this.getMoviePlayTime({
        cinemaCode,
        cinemaId,
        filmId,
        featureDate: show_time.split(" ")[0]
      });
      // 解决同一时间多场次问题
      let targetShowList = showList.filter(
        item => item.startTime === show_time
      );
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        targetShowList = targetShowList.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.screenName,
            hall_name
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
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "同一时间多场次",
          level: "info",
          info: {
            targetShowList
          }
        });
      }
      if (!targetShow) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "匹配影片放映场次失败",
          level: "error",
          info: {
            movieInfo,
            show_time
          }
        });
        return;
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映信息从而获取会员价",
        level: "info",
        info: {
          targetShow,
          cinemaCode,
          cinemaId
        }
      });
      return { ...targetShow, cinemaCode, cinemaId };
    } catch (error) {
      console.error("获取当前场次电影信息异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取当前场次电影信息异常",
        level: "error",
        info: {
          error: JSON.stringify(error)
        }
      });
    }
  }

  // 获取电影放映信息
  async getMoviePlayInfo(data) {
    try {
      let { cinemaCode, cinemaId } = data || {};
      let params = {
        cinemaCode,
        cinemaId,
        unifiedCode: cinemaCode,
        pageNo: 1,
        pageSize: 1000,
        platForm: 5
      };
      console.log("获取电影放映信息参数", params);
      let res = await this.appApi.getMoviePlayInfo(params);
      console.log("获取电影放映信息返回", res);
      return res.data;
    } catch (error) {
      console.error("获取电影放映信息异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映信息异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取电影放映场次
  async getMoviePlayTime(data) {
    let { cinemaCode, cinemaId, filmId, featureDate } = data || {};
    let params = {
      cinemaCode,
      cinemaId,
      filmId,
      featureDate,
      updateNode: "date"
    };
    try {
      console.log("获取电影放映场次参数", params);
      const res = await this.appApi.getMoviePlayTime(params);
      console.log("获取电影放映场次返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映场次返回",
        level: "info",
        info: {
          params,
          res
        }
      });
      return res.data?.planList || [];
    } catch (error) {
      console.error("获取电影放映信息异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映信息异常",
        level: "error",
        info: {
          error,
          params
        }
      });
    }
  }
  // 获取城市影院列表
  async getCityCinemaList() {
    try {
      let params = {};
      console.log("获取城市影院列表参数", params);
      const res = await this.appApi.getCinemaList(params);
      console.log("获取城市影院列表返回", res);
      let list = res.data || [];
      return list.map(item => ({
        ...item,
        cityName: item.cityInfoDTO?.cityName,
        cinemaList: item.cinemaResultDTOList.map(itemA => ({
          ...itemA,
          cinemaCode: itemA.cinemaCode
        }))
      }));
    } catch (error) {
      console.error("获取城市影院列表异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取城市影院列表异常",
        level: "error",
        info: {
          error
        }
      });
    }
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
