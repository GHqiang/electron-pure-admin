// lma报价逻辑
import {
  getCurrentFormattedDateTime,
  getCurrentDay,
  convertFullwidthToHalfwidth,
  offerRuleMatch,
  logUpload,
  formatErrInfo,
  getCinemaIdByLma,
  formatTimeStrByLma,
  calcCount
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import {
  APP_LIST,
  QUAN_TYPE_COST,
  TEST_NEW_PLAT_LIST
} from "@/common/constant.js";
import lierenApi from "@/api/lieren-api";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

class getLmaOfferPrice {
  constructor({ appFlag, plat_name }) {
    // console.log("APP_API_OBJ", APP_API_OBJ, appFlag, plat_name);
    this.appFlag = appFlag; // 影线标识
    this.plat_name = plat_name; // 平台标识
    this.conPrefix = APP_LIST[appFlag] + "自动报价——"; // 打印前缀
    this.appApi = APP_API_OBJ[appFlag];
    this.logList = []; // 操作运行日志
  }

  // 获取猎人已报价列表(仅动态调价功能使用，暂时不用)
  async getLierenOrderList() {
    try {
      let params = {
        page: 1,
        limit: 300,
        sort: "id",
        desc: "desc",
        type: "1"
      };
      const res = await lierenApi.stayTicketingList(params);
      return res?.data || [];
    } catch (error) {
      console.error("获取猎人已报价列表异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取猎人已报价列表异常",
        level: "error",
        info: {
          error
        }
      });
      return [];
    }
  }

  // 获取报价记录(仅测试用, 暂时不用)
  async getOfferList() {
    const { conPrefix } = this;
    try {
      const res = await svApi.queryOfferList({
        user_id: tokens.userInfo.user_id,
        // user_id: "9",
        plat_name: this.plat_name,
        start_time: getCurrentFormattedDateTime(
          +new Date() - 0.5 * 60 * 60 * 1000
        ),
        end_time: getCurrentFormattedDateTime()
      });
      return res.data.offerList || [];
    } catch (error) {
      console.error(conPrefix + "获取历史报价记录异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取历史报价记录异常",
        level: "error",
        info: {
          error
        }
      });
      return [];
    }
  }

  // 获取最终报价信息（唯一暴漏给外包用的方法）
  async getEndOfferPrice({ order, offerList }) {
    const { conPrefix, plat_name, appFlag } = this;
    let err_msg, err_info, endPrice, offerRule;
    let { supplier_max_price, rewards } = order || {};
    try {
      // 获取匹配到的最终报价规则
      offerRule = await this.getEndMatchOfferRule(order);
      if (offerRule) {
        const {
          offerAmount,
          memberOfferAmount,
          memberCostPrice = 0,
          quanValue,
          offerType
        } = offerRule;
        let price = Number(offerAmount || memberOfferAmount);
        if (price) {
          // 成本价
          let cost_price =
            offerType === "1"
              ? QUAN_TYPE_COST[quanValue]
              : Number(memberCostPrice);
          // 获取最终报价
          endPrice = await this.getEndPrice({
            cost_price,
            supplier_max_price,
            price,
            rewards,
            offerList,
            plat_name
          });
          console.warn(conPrefix + "最终报价返回", endPrice);
          if (endPrice) {
            if (offerType === "1") {
              offerRule.offerAmount = endPrice;
            } else {
              offerRule.memberOfferAmount = endPrice;
            }
            let isAnomaly = window.localStorage.getItem("isAnomaly");
            if (isAnomaly === "1" && appFlag === "sfc") {
              // sfc需要检查下系统是否异常（连续两个订单创建失败）
              let ticketList = await this.getTicketList();
              ticketList = ticketList?.filter(
                item => !NO_SFC_APP_LIST.includes(item.app_name)
              );
              let isAbnormal =
                ticketList?.length >= 2
                  ? checkConsecutiveErrors(ticketList)
                  : false;
              if (isAbnormal) {
                this.logList.push({
                  opera_time: getCurrentFormattedDateTime(),
                  des: "sfc疑似故障，暂不报价",
                  level: "error",
                  info: {
                    isAbnormal,
                    ticketList
                  }
                });
                endPrice = "";
              }
            }
          } else {
            err_msg = "获取最终报价价格失败";
          }
        } else {
          err_msg = "从最终报价规则里获取报价价格失败";
        }
      } else {
        err_msg = "获取最终报价规则失败";
      }
    } catch (error) {
      console.error(conPrefix + "获取最终报价信息方法执行异常", error);
      err_msg = "获取最终报价信息方法执行异常";
      err_info = formatErrInfo(error);
    } finally {
      const errInfoObj = this.logList
        .filter(item => item.level === "error")
        .reverse()?.[0];
      err_msg = errInfoObj?.des || err_msg || "";
      err_info = formatErrInfo(errInfoObj?.info) || err_info || "";
      logUpload(
        {
          plat_name: plat_name,
          app_name: appFlag,
          order_number: order.order_number,
          type: 1
        },
        this.logList
      );
      return { err_msg, err_info, endPrice, offerRule };
    }
  }

  // 获取最终匹配到的报价规则
  async getEndMatchOfferRule(order) {
    const { conPrefix } = this;
    try {
      const matchRuleListRes = offerRuleMatch(order);
      let matchRuleList = matchRuleListRes?.matchRuleList || [];
      if (!matchRuleList?.length) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
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
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "报价规则匹配列表",
        level: "info",
        info: {
          matchRuleList
        }
      });
      // 获取报价最低的报价规则
      let endRule = await this.getMinAmountOfferRule(matchRuleList, order);
      console.warn(conPrefix + "最终匹配到的报价规则", endRule);
      if ([0, -2, -3, -4].includes(endRule)) return;
      if (!endRule) {
        console.error(conPrefix + "最终匹配到的报价规则不存在");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "最终匹配到的报价规则不存在",
          level: "error"
        });
      }
      endRule = JSON.parse(JSON.stringify(endRule));
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "最终匹配到的报价规则",
        level: "info",
        info: {
          endRule
        }
      });
      return endRule;
    } catch (error) {
      console.error(conPrefix + "获取最终匹配报价规则异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取最终匹配报价规则异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取报价最低的报价规则
  async getMinAmountOfferRule(ruleList, order) {
    const { conPrefix } = this;
    try {
      // 1、有会员日报价规则命中优先使用会员日报价规则
      let onlyMemberDayRuleList = ruleList.filter(
        item => item.memberDay && item.offerType === "3" && item.offerAmount
      );
      // 报价从低到高排序
      onlyMemberDayRuleList.sort(
        (itemA, itemB) => itemA.offerAmount - itemB.offerAmount
      );
      console.log(
        conPrefix + "命中会员日报价规则从小往大排序",
        onlyMemberDayRuleList
      );
      if (onlyMemberDayRuleList.length) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "命中会员日报价规则",
          level: "info"
        });
        return onlyMemberDayRuleList[0];
      }
      // 2、比对那个报价更低，就用那个规则出
      let otherRuleList = ruleList.filter(
        item => !item.memberDay && item.offerType !== "3"
      );
      console.warn(conPrefix + "排除会员日后的其它规则", otherRuleList);
      // 日常固定报价规则
      let fixedAmountRuleList = otherRuleList.filter(
        item => item.offerType === "1" && item.offerAmount
      );
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
      // 预估利润单张
      let cardExpectProfit = 0,
        quanExpectProfit = 0;
      if (mixFixedAmountRule) {
        quanExpectProfit =
          mixFixedAmountRule.offerAmount -
          QUAN_TYPE_COST[mixFixedAmountRule.quanValue];
      }
      if (mixAddAmountRule) {
        // 计算会员报价
        let memberPriceRes = await this.getMemberPrice(order);
        // let errMsgStrObj = {
        //   -1: "获取当前场次电影信息失败,不再进行报价",
        //   "-2": "获取当前场次电影信息失败,促销票数低于订单票数，不再进行报价",
        //   "-3": "获取座位布局异常，不再进行报价",
        //   "-4": "影院单卡出票限制,不再进行报价"
        // };
        if (memberPriceRes && [-1].includes(memberPriceRes)) {
          // 返回特殊标识出去
          return memberPriceRes;
        }

        if (!memberPriceRes || [-2, -3, -4].includes(memberPriceRes)) {
          console.warn(
            conPrefix + "最小加价规则获取会员价失败,返回最小固定报价规则",
            mixFixedAmountRule
          );
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "最小加价规则获取会员价失败,返回最小固定报价规则",
            level: "warn",
            info: {
              memberPriceRes,
              fixedOfferAmount: mixFixedAmountRule?.offerAmount,
              quanExpectProfit
            }
          });
          return mixFixedAmountRule;
        }
        // 真实会员价
        mixAddAmountRule.real_member_price = memberPriceRes.real_member_price;
        // 会员成本价(会员价*折扣价)
        mixAddAmountRule.memberCostPrice = memberPriceRes.member_price;
        // 会员价*折扣价四舍五入
        mixAddAmountRule.memberRoundPrice = Math.round(
          memberPriceRes.member_price
        );
        // 会员最终报价
        mixAddAmountRule.memberOfferAmount =
          mixAddAmountRule.memberRoundPrice +
          Number(mixAddAmountRule.addAmount);
        cardExpectProfit =
          mixAddAmountRule.memberOfferAmount - mixAddAmountRule.memberCostPrice;
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "会员最终报价相关信息",
          level: "info",
          info: {
            real_member_price: mixAddAmountRule.real_member_price,
            memberCostPrice: mixAddAmountRule.memberCostPrice,
            memberRoundPrice: mixAddAmountRule.memberRoundPrice,
            addAmount: mixAddAmountRule.addAmount,
            memberOfferAmount: mixAddAmountRule.memberOfferAmount,
            cardExpectProfit
          }
        });
      } else {
        console.warn(
          conPrefix + "最小加价规则不存在,返回最小固定报价规则",
          mixFixedAmountRule
        );
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "最小加价规则不存在,返回最小固定报价规则",
          level: "info",
          info: {
            fixedOfferAmount: mixFixedAmountRule?.offerAmount,
            quanExpectProfit
          }
        });
        return mixFixedAmountRule;
      }
      if (!mixFixedAmountRule) {
        console.warn(
          conPrefix + "最小固定报价规则不存在，返回最小加价规则",
          mixAddAmountRule
        );
        return mixAddAmountRule;
      }
      if (
        mixAddAmountRule.memberOfferAmount >=
        Number(mixFixedAmountRule.offerAmount)
      ) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "会员报价高于固定报价，返回最小固定报价规则",
          level: "info",
          info: {
            memberOfferAmount: mixAddAmountRule.memberOfferAmount,
            fixedOfferAmount: mixFixedAmountRule.offerAmount,
            quanExpectProfit,
            cardExpectProfit
          }
        });
        return mixFixedAmountRule;
      } else {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "会员报价低于固定报价，返回最小加价报价规则",
          level: "info",
          info: {
            memberOfferAmount: mixAddAmountRule.memberOfferAmount,
            fixedOfferAmount: mixFixedAmountRule.offerAmount,
            quanExpectProfit,
            cardExpectProfit
          }
        });
        return mixAddAmountRule;
      }
    } catch (error) {
      console.error(conPrefix + "获取最低报价规则异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
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
    const { conPrefix } = this;
    try {
      let {
        cost_price,
        supplier_max_price,
        price,
        rewards,
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
        // 测试用下面的
        // serOfferRecord = await this.getOfferList();
        // 猎人报价记录
        // lierenOfferRecord = await this.getLierenOrderList();
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
          opera_time: getCurrentFormattedDateTime(),
          des: "动态调价生效:" + str,
          level: "info"
        });
      }
      // 手续费
      const shouxufei = (Number(price) * 100) / 10000;
      // 奖励费用
      let rewardPrice =
        rewards > 0 ? (Number(price) * 100 * rewards) / 10000 : 0;
      // 真实成本（加手续费）
      cost_price = cost_price + shouxufei;
      // 最终成本（减奖励费）
      const ensCostPrice = Number(cost_price - rewardPrice).toFixed();
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "sfc计算报价相关信息",
        level: "info",
        info: {
          rule_price: price,
          supplier_max_price,
          shouxufei,
          rewardPrice,
          ensCostPrice
        }
      });
      // 最终成本超过平台限价
      if (ensCostPrice >= Number(supplier_max_price)) {
        let str = `最终成本${ensCostPrice}超过平台限价${supplier_max_price}，不再进行报价`;
        console.error(conPrefix + str);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: str,
          level: "error"
        });
        return;
      }
      // 最终报价超过平台限价
      if (price > Number(supplier_max_price)) {
        let isOverrunOffer = window.localStorage.getItem("isOverrunOffer");
        if (isOverrunOffer !== "1") {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `最终报价${price}超过平台限价${supplier_max_price}，超限报价处于关闭状态，不再进行报价`,
            level: "error"
          });
          return;
        }
        // 奖励单按真实成本（加手续费），非奖励单报最高限价
        price = rewards > 0 ? cost_price : supplier_max_price;
        // 不重新赋值的话按平台规则会员价四舍五入后+固定加价
        price = Math.round(price);
      }
      if (price <= cost_price && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        let str = `最终报价${price}小于等于成本价${cost_price}，不再进行报价`;
        console.error(conPrefix + str);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: str,
          level: "error"
        });
        return;
      }
      if (price > Number(supplier_max_price)) {
        let str = `最终报价${price}超过平台限价${supplier_max_price}，不再进行报价`;
        console.error(conPrefix + str);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: str,
          level: "error"
        });
        return;
      }
      // 如果报最终报价不小于最高限价返回报价
      return price;
    } catch (error) {
      console.error("获取最终报价异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取最终报价异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取座位布局
  async getSeatLayout(data) {
    const { conPrefix } = this;
    let { cinema_id, show_id } = data || {};
    let params = {
      cinema_id,
      session_id: show_id
    };
    try {
      console.log(conPrefix + "获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      console.log(conPrefix + "获取座位布局返回", res);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取座位布局返回",
        level: "info",
        info: {
          res
        }
      });
      return res.data || {};
    } catch (error) {
      console.error(conPrefix + "获取座位布局异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取座位布局异常",
        level: "error",
        info: {
          error,
          params
        }
      });
    }
  }

  // 获取会员价
  async getMemberPrice(order) {
    const { conPrefix } = this;
    try {
      console.log(conPrefix + "准备获取会员价", order);
      const { ticket_num, app_name } = order;
      // 获取当前场次电影信息
      let movieInfo = await this.getMovieInfo(order);
      console.log(conPrefix + `待报价订单当前场次电影相关信息`, movieInfo);
      if (!movieInfo) {
        console.error(conPrefix + "获取当前场次电影信息失败", "不再进行报价");
        return -1;
      }
      let {
        member_price,
        price: nonmember_price,
        cinema_id,
        session_id: show_id
      } = movieInfo;
      member_price = member_price?.replace("￥", "");
      nonmember_price = nonmember_price?.replace("￥", "");
      if (show_id) {
        const seatInfo = await this.getSeatLayout({
          cinema_id,
          show_id
        });
        if (!seatInfo) return -3;
        const { promo_num, label_arr: area_price } = seatInfo;
        // if (promo_num && promo_num < ticket_num) {
        //   console.error(conPrefix + "促销票数低于订单票数，不再进行报价");
        //   this.logList.push({
        //     opera_time: getCurrentFormattedDateTime(),
        //     des: "促销票数低于订单票数，不再进行报价",
        //     level: "error",
        //     info: {
        //       promo_num,
        //       ticket_num
        //     }
        //   });
        //   return -2;
        // }
        if (area_price?.length > 1) {
          let bigPrice = area_price.sort((a, b) => b.price - a.price)[0].price;
          console.error(
            conPrefix + "座位类型区分，取最高的价格座位会员价格",
            bigPrice
          );
          return {
            member_price: Number(bigPrice),
            real_member_price: Number(bigPrice)
          };
        }
      }
      // 服务费已包含在会员价里面了
      console.log(conPrefix + "获取会员价", member_price);
      if (member_price > 0) {
        const cardRes = await svApi.queryCardList({
          app_name: app_name,
          rule: tokens.userInfo.rule
        });
        let list = cardRes.data.cardList || [];
        list = list.map(item => ({
          ...item,
          daily_usage:
            item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0
        }));
        // console.log("list", list);
        let cardList = list.filter(item =>
          !item.use_limit_day
            ? true
            : ticket_num <= item.use_limit_day - item.daily_usage
        );
        if (!cardList.length) {
          console.error(conPrefix + "影院单卡出票限制,不再进行报价");
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "影院单卡出票限制，不再进行报价",
            level: "error",
            info: {
              list,
              ticket_num
            }
          });
          return -4;
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
        if (real_member_price >= 30) {
          member_price = real_member_price - 5;
        }
        member_price = discount
          ? (Number(member_price) * 100 * discount) / 10000
          : Number(member_price);
        if (real_member_price >= 30) {
          // 减5券的成本1.5，不固定
          member_price = Number(member_price) + 1.5;
        }
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "获取会员价相关信息返回",
          level: "info",
          info: {
            real_member_price,
            discount,
            cost_member_price: Number(member_price.toFixed(2))
          }
        });
        return {
          real_member_price, // 真实会员价
          member_price: Number(member_price.toFixed(2)) // 成本价
        };
      } else {
        console.warn(conPrefix + "会员价未负，非会员价", nonmember_price);
        if (nonmember_price) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "获取会员价时由于会员价不存在返回非会员价",
            level: "warn",
            info: {
              nonmember_price
            }
          });
          return {
            member_price: Number(nonmember_price), // 成本价
            real_member_price: Number(nonmember_price) // 真实会员价
          };
        }
      }
    } catch (error) {
      console.error(conPrefix + "获取会员价异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
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
    const { conPrefix } = this;
    try {
      // 1、获取影院列表拿到影院id
      const { city_name, cinema_name, film_name, show_time, app_name } = item;
      const cityList = await this.getCityList();
      if (!cityList?.length) {
        return;
      }
      let city_id = cityList?.find(
        item => item.city_name.indexOf(city_name) !== -1
      )?.city_id;
      let res = await this.appApi.getCinemaList(city_id);
      console.log(conPrefix + "获取城市影院返回", res);
      let cinemaList = res.data?.list || [];
      let cinemaIdRes = getCinemaIdByLma(
        cinema_name,
        cinemaList,
        app_name,
        city_name
      );
      let cinema_id = cinemaIdRes?.cinema_id;
      if (!cinema_id) {
        console.error(conPrefix + "获取目标影院失败");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: conPrefix + "获取目标影院失败",
          level: "error",
          info: {
            error: cinemaIdRes?.error,
            cinema_name,
            cinemaList,
            app_name,
            city_name
          }
        });
        return;
      }

      // 2、获取影院放映信息拿到会员价
      const moviePlayInfo = await this.getMoviePlayInfo({
        cinema_id
      });
      if (!moviePlayInfo) return;
      // 3、匹配订单拿到会员价
      const { film } = moviePlayInfo;
      // 4、获取目标影片信息
      let movieInfo = film?.find(item => item.title === film_name);
      if (!movieInfo) {
        console.warn("获取目标影片信息失败", film, film_name);
        movieInfo = film.find(
          item =>
            convertFullwidthToHalfwidth(item.title) ===
            convertFullwidthToHalfwidth(film_name)
        );
        if (!movieInfo) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `获取目标影片信息失败`,
            info: {
              film,
              film_name
            }
          });
          return;
        }
      }
      console.log("movieInfo", movieInfo, film_name);
      // 5、获取目标影片的放映日期
      const { short_code } = movieInfo;
      const playDateList = await this.getMoviePlayDate({
        cinema_id,
        short_code
      });
      let start_day = show_time.split(" ")[0];
      let targetDate = playDateList?.find(
        item => formatTimeStrByLma(item.date) === start_day
      );
      if (!targetDate) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "匹配影片放映日期失败",
          info: {
            playDateList,
            start_day
          }
        });
        return;
      }
      let showList = targetDate?.session || [];
      let start_time = show_time.split(" ")[1].slice(0, 5);
      let targetShow = showList.find(item => item.start_time === start_time);
      if (!targetShow) {
        console.error("匹配影片放映场次失败", showList, start_time);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "匹配影片放映场次失败",
          level: "error",
          info: {
            showList,
            start_time
          }
        });
        return;
      }

      console.log("movieInfo", movieInfo, film_name);

      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取电影放映信息从而获取会员价",
        level: "info",
        info: {
          targetShow
        }
      });
      return { ...targetShow, city_id, cinema_id, short_code };
    } catch (error) {
      console.error(conPrefix + "获取当前场次电影信息异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取当前场次电影信息异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取电影放映信息
  async getMoviePlayInfo(data) {
    const { conPrefix } = this;
    try {
      let { cinema_id } = data || {};
      let params = {
        cinema_id: cinema_id
      };
      console.log(conPrefix + "获取电影放映信息参数", params);
      let res = await this.appApi.getMoviePlayInfo(params);
      console.log(conPrefix + "获取电影放映信息返回", res);
      return res.data;
    } catch (error) {
      console.error(conPrefix + "获取电影放映信息异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取电影放映信息异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取电影放映日期
  async getMoviePlayDate(data) {
    const { conPrefix } = this;
    try {
      let { cinema_id, short_code } = data || {};
      let params = {
        cinema_id,
        short_code
      };
      console.log(conPrefix + "获取电影放映日期参数", params);
      const res = await this.appApi.getMoviePlayDate(params);
      console.log(conPrefix + "获取电影放映日期返回", res);
      return res.data || [];
    } catch (error) {
      console.error(conPrefix + "获取电影放映日期异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取电影放映日期异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取城市列表
  async getCityList() {
    const { conPrefix } = this;
    try {
      let params = {};
      console.log(conPrefix + "获取城市列表参数", params);
      let res = await this.appApi.getCityList(params);
      console.log(conPrefix + "获取城市列表返回", res);
      return res.data.list || [];
    } catch (error) {
      console.error(conPrefix + "获取城市列表异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取城市列表异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取出票记录
  async getTicketList() {
    try {
      const ticketRes = await svApi.queryTicketList({
        user_id: tokens.userInfo?.user_id,
        page_num: 1,
        page_size: 50
      });
      return ticketRes.data.ticketList || [];
    } catch (error) {
      console.error("获取最新50条出票记录异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取最新50条出票记录异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }
}

// 判断sfc是否系统故障
const checkConsecutiveErrors = orders => {
  let consecutiveErrors = false;
  if (orders?.length) {
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
      nextOrder.err_msg.includes("计算订单价格异常") &&
      nextOrder.err_info &&
      JSON.parse(nextOrder.err_info)?.msg === "请求接口超时,请重试";

    if (currentMatches && nextMatches) {
      consecutiveErrors = true;
      break;
    }
  }

  return consecutiveErrors;
};
export default getLmaOfferPrice;
