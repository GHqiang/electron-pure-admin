// ume报价逻辑
import {
  getCurrentFormattedDateTime,
  getCurrentDay,
  convertFullwidthToHalfwidth,
  offerRuleMatch,
  cinemNameSpecial,
  logUpload,
  formatErrInfo
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import { APP_LIST } from "@/common/constant.js";
class getUmeOfferPrice {
  constructor({ appFlag, platName }) {
    console.log("APP_API_OBJ", APP_API_OBJ, appFlag, platName);
    this.appFlag = appFlag; // 影线标识
    this.platName = platName; // 平台标识
    this.conPrefix = APP_LIST[appFlag] + "自动报价——"; // 打印前缀
    this.appApi = APP_API_OBJ[appFlag];
    this.logList = []; // 操作运行日志
  }

  // 获取最终报价信息（唯一暴漏给外包用的方法）
  async getEndOfferPrice({ order, offerList }) {
    const { conPrefix, platName, appFlag } = this;
    try {
      let { id, supplier_max_price, rewards } = order || {};
      if (!id) {
        return {
          err_msg: "获取最终报价信息时订单id为空",
          err_info: ""
        };
      }
      // 获取匹配到的最终报价规则
      let offerRule = await this.getEndMatchOfferRule(order);
      if (!offerRule) {
        const errInfoObj = this.logList
          .filter(item => item.level === "error")
          .reverse()?.[0];
        logUpload(
          {
            plat_name: platName,
            app_name: appFlag,
            order_number: order.order_number,
            type: 1
          },
          this.logList.slice()
        );
        return {
          err_msg: errInfoObj?.des || "匹配报价规则失败",
          err_info: errInfoObj?.info
            ? formatErrInfo(errInfoObj?.info?.error)
            : ""
        };
      }
      const {
        offerAmount,
        memberOfferAmount,
        memberPrice,
        quanValue,
        offerType
      } = offerRule;
      let price = Number(offerAmount || memberOfferAmount);
      if (!price) {
        const errInfoObj = this.logList
          .filter(item => item.level === "error")
          .reverse()?.[0];
        return {
          offerRule,
          err_msg: errInfoObj?.des || "从匹配到的报价规则里获取报价价格失败",
          err_info: errInfoObj?.info
            ? formatErrInfo(errInfoObj?.info?.error)
            : ""
        };
      }
      // 成本价
      let cost_price =
        offerType === "1"
          ? quanValue == "40"
            ? 38.8
            : Number(quanValue)
          : Number(memberPrice);
      // 获取最终报价
      const endPrice = await this.getEndPrice({
        cost_price,
        supplier_max_price,
        price,
        rewards,
        offerList
      });
      console.warn(conPrefix + "最终报价返回", endPrice);
      if (!endPrice) {
        const errInfoObj = this.logList
          .filter(item => item.level === "error")
          .reverse()?.[0];
        return {
          offerRule,
          err_msg: errInfoObj?.des || "获取最终报价价格失败",
          err_info: errInfoObj?.info
            ? formatErrInfo(errInfoObj?.info?.error)
            : ""
        };
      }
      if (offerType === "1") {
        offerRule.offerAmount = endPrice;
      } else {
        offerRule.memberOfferAmount = endPrice;
      }
      logUpload(
        {
          plat_name: platName,
          app_name: appFlag,
          order_number: order.order_number,
          type: 1
        },
        this.logList
      );
      return { endPrice, offerRule };
    } catch (error) {
      console.error(conPrefix + "获取最终报价信息异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取最终报价信息异常",
        level: "error",
        info: {
          error
        }
      });
      logUpload(
        {
          plat_name: platName,
          app_name: appFlag,
          order_number: order.order_number,
          type: 1
        },
        this.logList
      );
      return {
        err_msg: "获取最终报价信息异常",
        err_info: error
      };
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
        let memberPrice = memberPriceRes.member_price;
        // 会员价*折扣价
        mixAddAmountRule.memberPrice = memberPrice;
        // 真实会员价
        mixAddAmountRule.real_member_price = memberPriceRes.real_member_price;
        // 会员最终报价
        memberPrice = Number(memberPrice) + Number(mixAddAmountRule.addAmount);
        mixAddAmountRule.memberOfferAmount = memberPrice;
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
      let { cost_price, supplier_max_price, price, rewards } = params || {};
      // console.log("获取最终报价相关字段", params);
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
        // 奖励单按真实成本（加手续费），非奖励单报最高限价
        price = rewards == 1 ? cost_price : supplier_max_price;
      }
      price = Math.round(price);
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
      let { cinemaCode, cinemaLinkId, scheduleId, scheduleKey } = data || {};
      let params = {
        cinemaCode,
        cinemaLinkId,
        scheduleId,
        scheduleKey,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001"
      };
      console.log(conPrefix + "获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      console.log(conPrefix + "获取座位布局返回", res);
      return res.data?.seatList || [];
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
      let { ticketMemberPrice, handlingMemberFee } = movieInfo;
      let member_price = Number(ticketMemberPrice) / 100;
      // let member_price = (Number(ticketMemberPrice) + Number(handlingMemberFee)) / 100;
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
          ? (Number(member_price) * discount) / 100
          : Number(member_price);
        return {
          real_member_price,
          member_price
        };
      } else {
        console.warn(conPrefix + "会员价未负，非会员价");
        // if (nonmember_price) {
        //   this.logList.push({
        //     opera_time: getCurrentFormattedDateTime(),
        //     des: "获取会员价时由于会员价不存在返回非会员价",
        //     level: "warn",
        //     info: {
        //       nonmember_price
        //     }
        //   });
        //   return {
        //     member_price: Number(nonmember_price),
        //     real_member_price: Number(nonmember_price)
        //   };
        // }
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
  async getMovieInfo(order) {
    const { conPrefix } = this;
    let { city_name, film_name, show_time, cinema_code, cinema_name } = order;
    try {
      // 1、获取城市影院列表
      let allCinemaList = await this.getCityCinemaList();
      let cinemaList =
        allCinemaList?.find(item => item.cityName.includes(city_name))
          ?.cinemaList || [];
      console.log(conPrefix + "获取城市影院列表返回", cinemaList);

      // 2、获取目标影院
      let targetCinema = cinemaList.find(item => {
        return (
          item.cinemaCode === cinema_code ||
          cinemNameSpecial(item.cinemaName) === cinemNameSpecial(cinema_name)
        );
      });
      if (!targetCinema) {
        console.error(conPrefix + "获取目标影院失败");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: conPrefix + "获取目标影院失败",
          level: "error",
          info: {
            cinemaList,
            cinema_code
          }
        });
        return;
      }
      // 3、获取影院放映信息用于拿会员价
      const { cinemaCode, cinemaLinkId } = targetCinema;
      const movie_data = await this.getMoviePlayInfo({
        cinemaCode,
        cinemaLinkId
      });
      // 4、获取目标影片信息
      let movieInfo = movie_data?.find(item => item.filmName === film_name);
      if (!movieInfo) {
        console.warn("获取目标影片信息失败", movie_data, film_name);
        movieInfo = movie_data.find(
          item =>
            convertFullwidthToHalfwidth(item.filmName) ===
            convertFullwidthToHalfwidth(film_name)
        );
        if (!movieInfo) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: `获取目标影片信息失败`,
            info: {
              movie_data,
              film_name
            }
          });
          return;
        }
      }
      console.log("movieInfo", movieInfo, film_name);
      // 5、获取目标影片的放映日期
      const { filmUniqueId } = movieInfo;
      const playDateList = await this.getMoviePlayDate({
        cinemaCode,
        cinemaLinkId,
        filmUniqueId
      });
      let start_day = show_time.split(" ")[0];
      let targetDate = playDateList?.find(item => item.showDate === start_day);
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
      // 获取某个放映日期的场次列表
      const showList = await this.getMoviePlayTime({
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        showDate: targetDate.showDate
      });
      let start_time = show_time.split(" ")[1].slice(0, 5);
      let targetShow = showList.find(
        item => item.showDateTime.split(" ")[1].slice(0, 5) === start_time
      );
      if (!targetShow) {
        console.error("匹配影片放映场次失败", showList, start_time);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "匹配影片放映场次失败",
          info: {
            showList,
            start_time
          }
        });
        return;
      }
      return targetShow;
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
      let { cinemaCode, cinemaLinkId } = data || {};
      let params = {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      };
      console.log(conPrefix + "获取影院放映列表参数", params);
      const res = await this.appApi.getMoviePlayInfo(params);
      console.log(conPrefix + "获取影院放映列表返回", res);
      // 只获取出售中的列表，即将上映暂不返回
      return (
        res.data?.find(item => item.showStatus === "SHOWING")?.fimlList || []
      );
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
      let { cinemaCode, cinemaLinkId, filmUniqueId } = data || {};
      let params = {
        cinemaCode: cinemaCode,
        filmUniqueId: filmUniqueId,
        keepLoading: true,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaLinkId: cinemaLinkId
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

  // 获取电影放映场次
  async getMoviePlayTime(data) {
    const { conPrefix } = this;
    try {
      let { cinemaCode, cinemaLinkId, filmUniqueId, showDate } = data || {};
      let params = {
        cinemaCode: cinemaCode,
        filmUniqueId: filmUniqueId,
        showDate: showDate,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaLinkId: cinemaLinkId
      };
      console.log(conPrefix + "获取电影放映场次参数", params);
      const res = await this.appApi.getMoviePlayTime(params);
      console.log(conPrefix + "获取电影放映场次返回", res);
      return res.data || [];
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

  // 获取城市影院列表
  async getCityCinemaList() {
    const { conPrefix } = this;
    try {
      let params = {
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode: "32012801",
        cinemaLinkId: "15946"
      };
      console.log(conPrefix + "获取城市影院列表参数", params);
      const res = await this.appApi.getCinemaList(params);
      console.log(conPrefix + "获取城市影院列表返回", res);
      let list = res.data || [];
      return list;
    } catch (error) {
      console.error(conPrefix + "获取城市影院列表异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取城市影院列表异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }
}

export default getUmeOfferPrice;
