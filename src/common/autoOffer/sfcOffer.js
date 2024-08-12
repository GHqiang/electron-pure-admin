// sfc报价逻辑
import {
  getCurrentFormattedDateTime,
  getCurrentDay,
  convertFullwidthToHalfwidth,
  offerRuleMatch,
  logUpload,
  formatErrInfo,
  getCinemaId,
  calcCount
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import { APP_LIST } from "@/common/constant.js";
import lierenApi from "@/api/lieren-api";
class getSfcOfferPrice {
  constructor({ appFlag, platName }) {
    // console.log("APP_API_OBJ", APP_API_OBJ, appFlag, platName);
    this.appFlag = appFlag; // 影线标识
    this.platName = platName; // 平台标识
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
        plat_name: this.platName,
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
    const { conPrefix, platName, appFlag } = this;
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
              ? quanValue == "40"
                ? 38.8
                : Number(quanValue)
              : Number(memberCostPrice);
          // 获取最终报价
          endPrice = await this.getEndPrice({
            cost_price,
            supplier_max_price,
            price,
            rewards,
            offerList
          });
          console.warn(conPrefix + "最终报价返回", endPrice);
          if (endPrice) {
            if (offerType === "1") {
              offerRule.offerAmount = endPrice;
            } else {
              offerRule.memberOfferAmount = endPrice;
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
      err_info = formatErrInfo(errInfoObj?.info?.error) || err_info || "";
      logUpload(
        {
          plat_name: platName,
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
      const matchRuleList = offerRuleMatch(order);
      if (!matchRuleList?.length) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "报价规则匹配后为空",
          level: "error",
          info: {
            order
          }
        });
        return;
      }
      // 获取报价最低的报价规则
      const endRule = await this.getMinAmountOfferRule(matchRuleList, order);
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
      // 2、比对那个利润更高，就用那个规则出
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
      if (mixAddAmountRule) {
        // 计算会员报价
        let memberPriceRes = await this.getMemberPrice(order);
        // let errMsgStrObj = {
        //   -1: "获取当前场次电影信息失败,不再进行报价",
        //   "-2": "获取当前场次电影信息失败,促销票数低于订单票数，不再进行报价",
        //   "-3": "获取座位布局异常，不再进行报价",
        //   "-4": "影院单卡出票限制,不再进行报价"
        // };
        if (memberPriceRes && [(-1, -2, -3, -4)].includes(memberPriceRes)) {
          // 返回特殊标识出去
          return memberPriceRes;
        }

        if (!memberPriceRes) {
          console.warn(
            conPrefix + "最小加价规则获取会员价失败,返回最小固定报价规则",
            mixFixedAmountRule
          );
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "最小加价规则获取会员价失败,返回最小固定报价规则",
            level: "warn"
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
      } else {
        console.warn(
          conPrefix + "最小加价规则不存在,返回最小固定报价规则",
          mixFixedAmountRule
        );
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "最小加价规则不存在,返回最小固定报价规则",
          level: "info"
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
          level: "info"
        });
        return mixFixedAmountRule;
      } else {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "会员报价低于固定报价，返回最小加价报价规则",
          level: "info"
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
      let { cost_price, supplier_max_price, price, rewards, offerList } =
        params || {};
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
      let rewardPrice = rewards == 1 ? (Number(price) * 400) / 10000 : 0;
      // 真实成本（加手续费）
      cost_price = cost_price + shouxufei;
      // 最终成本（减奖励费）
      const ensCostPrice = Number(cost_price - rewardPrice).toFixed();
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
        price = rewards == 1 ? cost_price : supplier_max_price;
        // 不重新赋值的话按平台规则会员价四舍五入后+固定加价
        price = Math.round(price);
      }
      if (price <= cost_price) {
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
    try {
      let { city_id, cinema_id, show_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        show_id: show_id,
        width: "240"
      };
      console.log(conPrefix + "获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      console.log(conPrefix + "获取座位布局返回", res);
      return res.data?.play_data || {};
    } catch (error) {
      console.error(conPrefix + "获取座位布局异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取座位布局异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取会员价
  async getMemberPrice(order) {
    const { conPrefix } = this;
    try {
      console.log(conPrefix + "准备获取会员价", order);
      const { ticket_num, appName } = order;
      // 获取当前场次电影信息
      let movieInfo = await this.getMovieInfo(order);
      console.log(conPrefix + `待报价订单当前场次电影相关信息`, movieInfo);
      if (!movieInfo) {
        console.error(conPrefix + "获取当前场次电影信息失败", "不再进行报价");
        return -1;
      }
      let { member_price, nonmember_price, city_id, cinema_id, show_id } =
        movieInfo;
      if (show_id) {
        const seatInfo = await this.getSeatLayout({
          city_id,
          cinema_id,
          show_id,
          appName
        });
        if (!seatInfo) return -3;
        const { promo_num, area_price } = seatInfo;
        if (promo_num && promo_num < ticket_num) {
          console.error(conPrefix + "促销票数低于订单票数，不再进行报价");
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "促销票数低于订单票数，不再进行报价",
            level: "error",
            info: {
              promo_num,
              ticket_num
            }
          });
          return -2;
        }
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
      console.log(conPrefix + "获取会员价", member_price);
      if (member_price > 0) {
        const cardRes = await svApi.queryCardList({
          app_name: appName
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
        member_price = discount
          ? (Number(member_price) * 100 * discount) / 10000
          : Number(member_price);
        return {
          real_member_price,
          member_price
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
            member_price: Number(nonmember_price),
            real_member_price: Number(nonmember_price)
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
      const {
        city_name,
        cinema_name,
        film_name,
        show_time,
        cinema_group,
        appName
      } = item;
      const cityList = await this.getCityList();
      let city_id = cityList?.find(
        item => item.name.indexOf(city_name) !== -1
      )?.id;
      let params = {
        city_id: city_id
      };
      console.log(conPrefix + "获取城市影院参数", params);
      let res = await this.appApi.getCinemaList(params);
      console.log(conPrefix + "获取城市影院返回", res);
      let cinemaList = res.data?.cinema_data || [];
      let cinemaIdRes = getCinemaId(cinema_name, cinemaList, appName);
      let cinema_id = cinemaIdRes?.cinema_id;
      if (!cinema_id) {
        console.error(conPrefix + "获取目标影院失败");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: conPrefix + "获取目标影院失败",
          level: "error",
          info: {
            error: cinemaIdRes?.error
          }
        });
        return;
      }

      // 2、获取影院放映信息拿到会员价
      const moviePlayInfo = await this.getMoviePlayInfo({
        city_id,
        cinema_id,
        cinema_group,
        cinema_name,
        city_name,
        appName
      });
      // 3、匹配订单拿到会员价
      const { movie_data } = moviePlayInfo;
      let movieInfo = movie_data.find(
        item =>
          convertFullwidthToHalfwidth(item.movie_name) ===
          convertFullwidthToHalfwidth(film_name)
      );
      console.log("movieInfo", movieInfo, film_name);
      if (movieInfo) {
        let { shows } = movieInfo;
        let showDay = show_time.split(" ")[0];
        let showList = shows[showDay] || [];
        let showTime = show_time.split(" ")[1].slice(0, 5);
        let ticketInfo = showList.find(item => item.start_time === showTime);
        if (!ticketInfo) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "获取电影放映信息后匹配订单场次失败",
            level: "error",
            info: {
              movieInfo,
              show_time
            }
          });
          return;
        }
        return { ...ticketInfo, city_id, cinema_id };
      } else {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "获取电影放映信息后匹配订单影片名失败",
          level: "error",
          info: {
            movie_data,
            film_name
          }
        });
      }
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
      let { city_id, cinema_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        width: "500"
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
  // 获取城市列表
  async getCityList() {
    const { conPrefix } = this;
    try {
      let params = {};
      console.log(conPrefix + "获取城市列表参数", params);
      let res = await this.appApi.getCityList(params);
      console.log(conPrefix + "获取城市列表返回", res);
      return res.data.all_city || [];
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
}

export default getSfcOfferPrice;
