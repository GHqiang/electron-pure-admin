// sfc报价逻辑
import {
  getCurrentFormattedDateTime,
  getCurrentDay,
  convertFullwidthToHalfwidth,
  offerRuleMatch,
  logUpload,
  formatErrInfo,
  getCinemaId,
  calcCount,
  roundToHalf,
  isDateInCurrentMonth
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import { APP_LIST } from "@/common/constant.js";
import lierenApi from "@/api/lieren-api";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

class getSfcOfferPrice {
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

  // 获取券类型信息
  async getQuanInfo(quan_value, app_name) {
    try {
      const res = await svApi.queryQuanTypeInfo({
        quan_value,
        app_name
      });
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取券类型信息返回",
        level: "info",
        info: {
          res
        }
      });
      return res.data.quanInfo || null;
    } catch (error) {
      console.error("获取券类型信息异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取券类型信息异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }

  // 获取最终报价信息（唯一暴漏给外包用的方法）
  async getEndOfferPrice({ order, offerList }) {
    const { conPrefix, plat_name, appFlag } = this;
    let endPrice, offerRule;
    let { supplier_max_price, rewards, order_number } = order || {};
    try {
      // 获取匹配到的最终报价规则
      offerRule = await this.getEndMatchOfferRule(order);
      if (!offerRule) {
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
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
          opera_time: getCurrentFormattedDateTime(),
          des: "从最终报价规则里获取报价价格失败",
          level: "error"
        });
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      // 成本价
      let cost_price;
      if (offerType === "1") {
        const quanInfo = await this.getQuanInfo(quanValue, appFlag);
        cost_price = quanInfo?.quan_cost;
      } else {
        cost_price = Number(memberCostPrice);
      }
      if (!cost_price) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
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
      console.warn(conPrefix + "最终报价返回", endPrice);
      if (!endPrice) {
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      // 最终报价
      offerRule.offer_end_amount = endPrice;
      let isAnomaly = window.localStorage.getItem("isAnomaly");
      if (isAnomaly === "1") {
        // sfc需要检查下系统是否异常（连续两个订单创建失败）
        let ticketList = await this.getTicketList();
        ticketList = ticketList?.filter(
          item => !NO_SFC_APP_LIST.includes(item.app_name)
        );
        let isAbnormal =
          ticketList?.length >= 2 ? checkConsecutiveErrors(ticketList) : false;
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
      return this.returnResultHandle({ endPrice, offerRule, order_number });
    } catch (error) {
      console.error("获取最终报价信息方法执行异常", error);
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
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
      if (!endRule) {
        console.error(conPrefix + "最终匹配到的报价规则不存在");
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "最终匹配到的报价规则不存在",
          level: "info"
        });
        return;
      }
      endRule = JSON.parse(JSON.stringify(endRule));
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
      if (mixAddAmountRule) {
        // 计算会员报价
        let memberPriceRes = await this.getMemberPrice(order);
        if (memberPriceRes === -1) {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "获取当前场次电影信息失败，直接不报",
            level: "info"
          });
          return;
        }
        if (!memberPriceRes) {
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
          opera_time: getCurrentFormattedDateTime(),
          des: "会员报价相关信息0",
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
          conPrefix + "最小加价规则不存在,返回最小固定报价规则",
          mixFixedAmountRule
        );
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
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
            fixedOfferAmount: mixFixedAmountRule.offerAmount
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
            fixedOfferAmount: mixFixedAmountRule.offerAmount
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
      // 规则报价
      let rule_price = price;
      // 省、蚂蚁最后报价要求整数
      if (["sheng", "mayi", "yangcong"].includes(plat_name)) {
        price = Math.round(price);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "调整最终报价为规则报价四舍五入取整",
          level: "info"
        });
      }
      // 最终报价高于平台限价，卡关闭超限报价直接不报
      if (price >= Number(supplier_max_price)) {
        let isOverrunOffer = window.localStorage.getItem("isOverrunOffer");
        if (isOverrunOffer !== "1" && offerType !== "1") {
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
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
          opera_time: getCurrentFormattedDateTime(),
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
      if (price <= real_cost_price) {
        let str = `最终报价${price}低于真实成本${real_cost_price}`;
        console.error(conPrefix + str);
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: str,
          level: "error"
        });
        return;
      }

      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "sfc计算报价相关信息",
        level: "info",
        info: {
          rule_price: "规则计算报价：" + rule_price,
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
      this.logList.push({
        opera_time: getCurrentFormattedDateTime(),
        des: "获取座位布局返回",
        level: "info",
        info: {
          res
        }
      });
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
      const { ticket_num, app_name } = order;
      // 获取当前场次电影信息
      let movieInfo = await this.getMovieInfo(order);
      console.log(conPrefix + "待报价订单当前场次电影相关信息", movieInfo);
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
          app_name
        });
        if (!seatInfo) return -3;
        let { promo_num, area_price, seat_data } = seatInfo;
        if (promo_num && promo_num < +ticket_num) {
          console.error(conPrefix + "促销票数低于订单票数");
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "促销票数低于订单票数",
            level: "error",
            info: {
              promo_num,
              ticket_num
            }
          });
          return;
        }
        if (area_price?.length) {
          // 座位分区从高到低排序
          let areaList = area_price.sort((a, b) => b.price - a.price);
          // 默认取最高价
          let bigPrice = areaList[0].price;
          // try {
          //   // 过滤出来未售座位然后计算分区剩余座位占比，0-未售
          //   let seatList = seat_data.filter(item => item[2] === "0");
          //   // 正常座位信息最后一位是座位分区id，相同点都是第9位是id
          //   areaList = areaList.map(item => {
          //     return {
          //       ...item,
          //       numRatio: Math.floor(
          //         (seatList.filter(
          //           itemA => itemA[itemA.length - 1] == item.area_id
          //         ).length *
          //           100) /
          //           seatList.length
          //       )
          //     };
          //   });
          //   this.logList.push({
          //     opera_time: getCurrentFormattedDateTime(),
          //     des: "座位分区剩余座位情况",
          //     level: "info",
          //     info: {
          //       areaList
          //     }
          //   });
          //   // 有的座位比较特殊，这样可解决排除特殊座位
          //   // 正常座位：第9位是座位id
          //   // ["8544", "1", "0", "10", "35", "8排1号", "", "1210", "1"]
          //   // 特殊座位：必须连着一起买，且最后一位不是id, 不过第9位和正常座位一样都是id
          //   // ['8557', '5', '0', '11', '13', '9排8号', 'seats_11_13', '465', '195', '', '8558']
          //   // ['8558', '5', '0', '11', '14', '9排7号', 'seats_11_13', '400', '195', '8557', '8559']
          //   // ['8559', '5', '0', '11', '15', '9排6号', 'seats_11_13', '335', '195', '8558', '']

          //   for (let index = 0; index < areaList.length; index++) {
          //     const item = areaList[index];
          //     if (item[0].numRatio == 0 && areaList[index + 1]?.price) {
          //       bigPrice = areaList[index + 1].price;
          //       break;
          //     }
          //   }
          //   // 默认取最高价格，最高座位占比不足百分之3时取次最高价格
          //   // if (areaList[0].numRatio <= 3 && areaList[1]?.price) {
          //   //   bigPrice = areaList[1].price;
          //   // }
          //   // if (areaList[1].numRatio <= 3 && areaList[2]?.price) {
          //   //   bigPrice = areaList[2].price;
          //   // }
          // } catch (error) {
          //   this.logList.push({
          //     opera_time: getCurrentFormattedDateTime(),
          //     des: "座位分区剩余座位占比计算失败",
          //     level: "info",
          //     info: {
          //       error
          //     }
          //   });
          // }
          console.error(
            conPrefix + "座位类型区分，取最高的价格座位会员价格",
            bigPrice
          );
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "取座位分区最高价和会员价的最大值当会员价",
            level: "info",
            info: {
              member_price,
              bigPrice
            }
          });
          member_price = Math.max(member_price, bigPrice);
        }
      }
      console.log(conPrefix + "获取会员价", member_price);
      if (member_price <= 0 && nonmember_price) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "获取会员价时由于会员价不存在拿非会员价当会员价",
          level: "warn",
          info: {
            nonmember_price: "非会员价：" + nonmember_price
          }
        });
        member_price = Number(nonmember_price);
      }
      if (member_price === 0) {
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "获取会员价为0",
          level: "error",
          info: {
            member_price,
            nonmember_price
          }
        });
        return;
      }
      if (member_price > 0) {
        const cardRes = await svApi.queryCardList({
          app_name: app_name,
          rule: tokens.userInfo.rule,
          status: "1"
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
          opera_time: getCurrentFormattedDateTime(),
          des: "获取该影院已维护会员卡列表返回",
          level: "info",
          info: {
            list
          }
        });
        // 根据当天及当月出票量限制进行过滤
        let cardListLimit = list.filter(item => {
          const { use_limit_day, use_limit_month, daily_usage, monthly_usage } =
            item;
          if (!use_limit_day && !use_limit_month) return true;
          return (
            (use_limit_day
              ? ticket_num <= use_limit_day - daily_usage
              : true) &&
            (use_limit_month
              ? ticket_num <= use_limit_month - monthly_usage
              : true)
          );
        });
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
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
            : item.linkCinemaIds.split(",").some(itemA => itemA == cinema_id);
        });
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "根据指定卡过滤后",
          level: "info",
          info: {
            cardList
          }
        });
        if (!cardList.length) {
          console.error(conPrefix + "影院单卡出票限制");
          this.logList.push({
            opera_time: getCurrentFormattedDateTime(),
            des: "影院单卡出票限制，无可用卡",
            level: "error",
            info: {
              ticket_num,
              cinema_id
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
          real_member_price,
          discount,
          member_price: Number(member_price.toFixed(2))
        };
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
    const { conPrefix, appFlag } = this;
    try {
      // 1、获取影院列表拿到影院id
      const {
        city_name,
        cinema_name,
        film_name,
        show_time,
        cinema_group,
        app_name
      } = item;
      const cityList = await this.getCityList();
      if (!cityList?.length) {
        return;
      }
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
      let cinemaIdRes = getCinemaId(
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
          des: "获取目标影院失败",
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
        city_id,
        cinema_id,
        cinema_group,
        cinema_name,
        city_name,
        app_name
      });
      if (!moviePlayInfo) return;
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
        if (appFlag === "hbchyxd") {
          ticketInfo.member_price = ticketInfo.normal_price;
        }
        this.logList.push({
          opera_time: getCurrentFormattedDateTime(),
          des: "获取电影放映信息从而获取会员价",
          level: "info",
          info: {
            ticketInfo
          }
        });
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
export default getSfcOfferPrice;
