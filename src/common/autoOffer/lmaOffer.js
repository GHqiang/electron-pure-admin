// lma报价逻辑
import {
  getCurrentTime,
  formatTimeOfTime,
  getCurrentDay,
  convertFullwidthToHalfwidth,
  offerRuleMatch,
  logUpload,
  formatErrInfo,
  getTargetCinemaCommon,
  formatTimeStrByLma,
  getCinemaLoginInfoList,
  calcCount,
  roundToHalf,
  isDateInCurrentMonth,
  findMostRepeatedChars,
  couponInfoSpecial
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import {
  GET_APP_LIST,
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST
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
    this.conPrefix = GET_APP_LIST()[appFlag] + "自动报价——"; // 打印前缀
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
        opera_time: getCurrentTime(),
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
        start_time: formatTimeOfTime(+new Date() - 0.5 * 60 * 60 * 1000),
        end_time: getCurrentTime()
      });
      return res.data.offerList || [];
    } catch (error) {
      console.error(conPrefix + "获取历史报价记录异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
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
        const quanInfo = await this.getQuanInfo(quanValue, appFlag);
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
      console.warn(conPrefix + "最终报价返回", endPrice);
      if (endPrice) {
        // 最终报价
        offerRule.offer_end_amount = endPrice;
      }
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
    const { conPrefix } = this;
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
      let filmTypeFlag = matchRuleList.some(item => !!item?.film_type?.length);
      // 获取电影放映信息以匹配电影格式
      let movieInfo = await this.getMovieInfo(order);
      if (!movieInfo) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "报价规则匹配电影格式时获取当前场次电影信息失败，直接不报",
          level: "info"
        });
        return;
      }
      // 校验电影格式，减少后续接口请求
      let filmType = movieInfo.language_type?.split("/")?.[0].toUpperCase();
      if (
        filmTypeFlag &&
        !matchRuleList.some(item => item.film_type?.includes(filmType))
      ) {
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
      console.warn(conPrefix + "最终匹配到的报价规则", endRule);
      if (!endRule) {
        // 日常固定报价规则
        // let fixedAmountRuleList = matchRuleList.filter(
        //   item => item.offerType === "1" && item.offerAmount
        // );
        // if (fixedAmountRuleList.length) {
        //   this.logList.push({
        //     opera_time: getCurrentTime(),
        //     des: "根据券库存过滤后固定报价规则为空",
        //     level: "error",
        //     info: {
        //       fixedAmountRuleList
        //     }
        //   });
        // }
        console.error(conPrefix + "最终匹配到的报价规则不存在");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "最终匹配到的报价规则不存在",
          level: "error"
        });
        return;
      }
      endRule = JSON.parse(JSON.stringify(endRule));
      return endRule;
    } catch (error) {
      console.error(conPrefix + "获取最终匹配报价规则异常", error);
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

  // 单个更新券库存
  async singleUpdateQuanStock(obj) {
    const { logList, ...params } = obj;
    try {
      const res = await svApi.updateQuanType(params);
      console.log("单个更新券库存返回", res);
      logList.push({
        opera_time: getCurrentTime(),
        des: "单个更新券库存返回",
        level: "info",
        info: {
          res,
          params
        }
      });
    } catch (error) {
      console.log("单个更新券库存异常", error);
      logList.push({
        opera_time: getCurrentTime(),
        des: "单个更新券库存异常",
        level: "error",
        info: {
          error,
          params
        }
      });
    }
  }

  // 连续获取券
  async continuousGetQuan(data) {
    let { session_id, page = 1, quanData = [], logList } = data;
    let params = {
      type: 1,
      page, // 固定1页10条
      lmaToken: session_id
    };
    try {
      const res = await this.appApi.getQuanList(params);
      console.log("获取优惠券列表返回", res);
      let quanList = res.data || [];
      quanData.push(...quanList);
      if (quanList.length == 10) {
        // 继续获取下一页;
        return await this.continuousGetQuan({
          ...data,
          page: page + 1,
          quanData
        });
      }
      return quanData.map(item => ({
        coupon_info: item.voucher_name,
        coupon_num: item.code,
        expire_time: item.expire_time // "有效期至 2026-01-22"
      }));
    } catch (error) {
      console.warn("连续获取券失败", error);
      logList.push({
        opera_time: getCurrentTime(),
        des: "连续获取券异常",
        level: "error",
        info: {
          error,
          params
        }
      });
      return [];
    }
  }

  // 获取优惠券列表
  async getQuanListByPhone({ session_id, logList }) {
    try {
      const quanData = await this.continuousGetQuan({
        session_id,
        logList
      });
      console.log("quanData", quanData);
      logList.push({
        opera_time: getCurrentTime(),
        des: "连续获取券最终返回",
        level: "info",
        info: {
          quanData
        }
      });
      return quanData.map(item => ({
        ...item,
        endDateTime: item.expire_time?.split(" ")?.[1] // "有效期至 2026-01-22"
      }));
    } catch (error) {
      console.error("获取优惠券列表异常", error);
      logList.push({
        opera_time: getCurrentTime(),
        des: "获取优惠券列表异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }
  // 异步更新券库存
  async syncUpdateQuanStock({ order, quanTypeList }) {
    const { app_name, plat_name, order_number } = order;
    let logList = [];
    let targetLoginList = getCinemaLoginInfoList().filter(
      item => item.app_name === app_name && item.mobile && item.session_id
    );
    console.log("targetLoginList", targetLoginList);
    try {
      let needUpdateQuanTypeList = [];
      // 拿着处理过的最大券库存（几个号之间）+对应的更新时间去判断是否要更新（只判断自己号上的）
      let isNeedUpdate = quanTypeList.some(item => {
        // if (item.quan_stock < 5) {
        let inx = item.quanStockList.findIndex(
          itemA => itemA.quan_stock === item.quan_stock
        );
        console.log("inx", inx);
        if (inx != -1) {
          let update_time = item.quanStockList[inx].update_time;
          console.log("update_time", update_time);

          return !update_time
            ? true
            : +new Date() - +new Date(update_time) > 1000 * 60 * 60; // 超过1小时未更新
        } else {
          return true;
        }
        // }
        return false;
      });
      if (!isNeedUpdate) {
        console.warn("不满足更新条件");
        logList.push({
          opera_time: getCurrentTime(),
          des: "不满足更新条件",
          level: "info",
          info: {
            quanTypeList
          }
        });
      } else {
        // 只要有一个需要更新，就全部更新，因为会获取该号全部的券
        needUpdateQuanTypeList = quanTypeList;
        console.log("needUpdateQuanTypeList", needUpdateQuanTypeList);
        logList.push({
          opera_time: getCurrentTime(),
          des: "需要更新的券类型列表",
          level: "info",
          info: {
            quanTypeList,
            targetLoginList
          }
        });

        let quanTypeListParams = needUpdateQuanTypeList.map(item => {
          return {
            id: item.id,
            quan_flag: item.quan_flag,
            black_quans: item.black_quans,
            quanStockList: item.quanStockList.map(itemA => ({
              phone: itemA.phone,
              quan_stock: itemA.quan_stock || 0,
              real_quan_stock: itemA.real_quan_stock || 0,
              update_time: itemA.update_time
            }))
          };
        });
        // 获取关联用户每个号的优惠券列表
        for (let i = 0; i < targetLoginList.length; i++) {
          const { session_id, mobile } = targetLoginList[i];
          const quanListAll = await this.getQuanListByPhone({
            session_id,
            logList
          });

          quanTypeListParams.forEach(item => {
            let targetQuanList = quanListAll.filter(
              itemA =>
                couponInfoSpecial(item.quan_flag) ===
                  couponInfoSpecial(itemA.coupon_info) &&
                !item.black_quans?.includes(itemA.coupon_num)
            );
            console.log(item.quan_flag, "targetQuanList", targetQuanList);
            let quanStock = targetQuanList.length;
            let quanStockList = item.quanStockList;
            console.log("quanStockList", quanStockList);
            let inx = quanStockList.findIndex(itemB => itemB.phone === mobile);
            let endDateTime = targetQuanList.sort(
              (a, b) => new Date(b.endDateTime) - new Date(a.endDateTime)
            )?.[0]?.endDateTime;
            if (inx != -1) {
              quanStockList[inx].quan_stock = quanStock;
              quanStockList[inx].real_quan_stock = targetQuanList.length;
              quanStockList[inx].update_time = getCurrentTime();
              quanStockList[inx].endDateTime = endDateTime;
            } else {
              quanStockList.push({
                phone: mobile,
                quan_stock: quanStock,
                real_quan_stock: targetQuanList.length,
                update_time: getCurrentTime(),
                endDateTime
              });
            }
          });
        }
        console.log("quanTypeListParams", quanTypeListParams);
        let updateTypeList = quanTypeListParams.map(item => ({
          id: item.id,
          quanStockList: item.quanStockList,
          update_time: getCurrentTime()
        }));
        console.log("updateTypeList", updateTypeList);
        logList.push({
          opera_time: getCurrentTime(),
          des: "最终要更新的券类型列表",
          level: "info",
          info: {
            updateTypeList
          }
        });
        for (let index = 0; index < updateTypeList.length; index++) {
          const item = updateTypeList[index];
          // 单个更新
          await this.singleUpdateQuanStock({
            id: item.id,
            quanStockList: JSON.stringify(item.quanStockList),
            update_time: item.update_time,
            logList
          });
        }
      }
    } catch (error) {
      console.error("异步更新券库存异常", error);
      logList.push({
        opera_time: getCurrentTime(),
        des: "异步更新券库存返回异常",
        level: "error",
        info: {
          error
        }
      });
    } finally {
      logUpload(
        {
          plat_name,
          app_name,
          order_number,
          type: 1
        },
        logList
      );
    }
  }
  // 获取影院券类型列表
  async getQuanTypeListByApp({ order }) {
    const { app_name } = order;
    let useMobileList = getCinemaLoginInfoList()
      .filter(
        item => item.app_name === app_name && item.mobile && item.session_id
      )
      .map(item => item.mobile);
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
    };
    try {
      let quanTypeRes = await svApi.queryQuanTypeList(params);
      let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
      quanTypeList.forEach(item => {
        item.quanStockList = item.quanStockList
          ? JSON.parse(item.quanStockList)
          : [];
        // 只拿关联账号的券库存信息进行判断
        const quanStockListByPhone = item.quanStockList.filter(itemA =>
          useMobileList.includes(itemA.phone)
        );
        item.quan_stock = item.quan_stock || 0;
        if (quanStockListByPhone?.length) {
          // 最大数当做券库存
          let maxNum = 0;
          quanStockListByPhone.forEach(itemA => {
            if (+itemA.quan_stock > maxNum) {
              maxNum = +itemA.quan_stock;
            }
          });
          item.quan_stock = maxNum;
        }
        item.quanStockList = quanStockListByPhone.slice();
      });
      console.log("quanTypeList", quanTypeList);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "根据影院获取券类型列表返回",
        level: "info",
        info: {
          quanTypeRes,
          quanTypeList,
          params,
          useMobileList
        }
      });
      // 异步更新券库存
      this.syncUpdateQuanStock({ order, quanTypeList });
      return quanTypeList;
    } catch (error) {
      console.error("根据影院获取券类型列表返回异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "根据影院获取券类型列表返回异常",
        level: "error",
        info: {
          error,
          params
        }
      });
    }
  }

  // 获取报价最低的报价规则
  async getMinAmountOfferRule(ruleList, order, movieInfo) {
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
      console.warn(conPrefix + "排除会员日后的其它规则", otherRuleList);
      // 日常固定报价规则
      let fixedAmountRuleList = otherRuleList.filter(
        item => item.offerType === "1" && item.offerAmount
      );
      if (fixedAmountRuleList.length) {
        // 校验其库存，进行过滤
        const appQuanTypeList = await this.getQuanTypeListByApp({ order });
        if (appQuanTypeList?.length) {
          fixedAmountRuleList = fixedAmountRuleList.filter(item => {
            // 查找是否有目标券可以出的
            return appQuanTypeList.some(
              itemA =>
                item.quanValue?.split(",")?.includes(itemA.quan_value) &&
                itemA?.quan_stock > order.ticket_num
            );
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
            conPrefix + "最小加价规则获取会员价失败,返回最小固定报价规则",
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
          conPrefix + "最小加价规则不存在,返回最小固定报价规则",
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
      console.error(conPrefix + "获取最低报价规则异常", error);
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

  // 获取券类型信息
  async getQuanInfo(quan_value, app_name) {
    try {
      const res = await svApi.queryQuanTypeInfo({
        quan_value,
        app_name
      });
      this.logList.push({
        opera_time: getCurrentTime(),
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
        opera_time: getCurrentTime(),
        des: "获取券类型信息异常",
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
          opera_time: getCurrentTime(),
          des: "动态调价生效:" + str,
          level: "info"
        });
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
      let rule_price = +price;
      // 省、蚂蚁最后报价要求整数
      if (["mayi", "yangcong"].includes(plat_name)) {
        price = Math.round(price);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "调整最终报价为规则报价四舍五入取整",
          level: "info"
        });
      }
      // 最终报价高于平台限价，卡关闭超限报价直接不报
      if (price > Number(supplier_max_price)) {
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
        if (["mayi", "yangcong"].includes(plat_name)) {
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
      let shouxufei = (price * 100) / 10000;
      if (NO_FEE_PLAT_LIST.includes(plat_name)) {
        shouxufei = 0;
      }

      // 奖励费用
      const rewardPrice = rewards > 0 ? (price * 100 * rewards) / 10000 : 0;
      // 卡券成本
      let cardQuanCost = +cost_price;
      // 出票成本（加手续费）
      let pay_cost_price = cardQuanCost + shouxufei;
      // 真实成本（减奖励费）
      const real_cost_price = (pay_cost_price - rewardPrice).toFixed(2);
      // 预计利润（最终报价-真实成本）
      let expectProfit = (price - real_cost_price).toFixed(2);
      if (price <= real_cost_price && !TEST_NEW_PLAT_LIST.includes(plat_name)) {
        let str = `最终报价${price}低于真实成本${real_cost_price}`;
        console.error(conPrefix + str);
        this.logList.push({
          opera_time: getCurrentTime(),
          des: str,
          level: "error"
        });
        return;
      }
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "lma计算报价相关信息",
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
        opera_time: getCurrentTime(),
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
      // this.logList.push({
      //   opera_time: getCurrentTime(),
      //   des: "获取座位布局返回",
      //   level: "info",
      //   info: {
      //     res
      //   }
      // });
      if (res.code !== "0") {
        return;
      }
      return res.data || {};
    } catch (error) {
      console.error(conPrefix + "获取座位布局异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
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
  async getMemberPrice(order, movieData) {
    const { conPrefix, appFlag } = this;
    try {
      console.log(conPrefix + "准备获取会员价", order);
      const { ticket_num, app_name } = order;
      // 获取当前场次电影信息，防止接口重复掉
      let movieInfo = movieData;
      if (!movieData) {
        movieInfo = await this.getMovieInfo(order);
      }
      console.log(conPrefix + "待报价订单当前场次电影相关信息", movieInfo);
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
        if (!seatInfo) return;
        const { promo_num, label_arr: area_price } = seatInfo;
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取座位布局相关信息",
          level: "info",
          info: {
            area_price,
            promo_num
          }
        });
        if (area_price?.length) {
          let bigPrice = area_price.sort((a, b) => b.price - a.price)[0].price;
          console.error(
            conPrefix + "座位类型区分，取最高的价格座位会员价格",
            bigPrice
          );
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "取座位分区最高价和会员价的最大值当会员价",
            level: "warn",
            info: {
              member_price,
              bigPrice
            }
          });
          member_price = Math.max(member_price, bigPrice);
        }
      }
      // 服务费已包含在会员价里面了
      console.log(conPrefix + "获取会员价", member_price);
      if (member_price <= 0 && nonmember_price) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取会员价时由于会员价不存在拿非会员价当会员价",
          level: "warn",
          info: {
            nonmember_price
          }
        });
        member_price = Number(nonmember_price);
      }
      // 会员价为0
      if (member_price === 0) {
        this.logList.push({
          opera_time: getCurrentTime(),
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
            : item.linkCinemaIds.split(",").some(itemA => itemA == cinema_id);
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
          console.error(conPrefix + "影院单卡出票限制");
          this.logList.push({
            opera_time: getCurrentTime(),
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
        let lmaIsUseQuanValue = window.localStorage.getItem("lmaIsUseQuan");
        let lmaIsUseQuan = lmaIsUseQuanValue == 1 && real_member_price >= 33;
        if (lmaIsUseQuan) {
          member_price = real_member_price - 5;
        }
        member_price = discount
          ? (Number(member_price) * 100 * discount) / 10000
          : Number(member_price);
        if (lmaIsUseQuan) {
          const quanInfo = await this.getQuanInfo("lma-5", appFlag);
          let quan_cost = quanInfo?.quan_cost || 1;
          // 减5券的成本1，不固定
          member_price = Number(member_price) + quan_cost;
        }
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取会员价相关信息",
          level: "info",
          info: {
            real_member_price: "真实会员价：" + real_member_price,
            discount: "最小折扣：" + discount,
            cost_member_price:
              `会员成本价：${lmaIsUseQuan ? "(真实会员价-5）* 折扣 + 1" : "真实会员价*折扣"} :` +
              Number(member_price.toFixed(2))
          }
        });
        return {
          real_member_price, // 真实会员价
          member_price: Number(member_price.toFixed(2)), // 成本价
          discount
        };
      }
    } catch (error) {
      console.error(conPrefix + "获取会员价异常", error);
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
    const { conPrefix } = this;
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
      let res = await this.appApi.getCinemaList();
      console.log(conPrefix + "获取全部影院返回", res);
      let cinemaList = res.data?.list || [];
      cinemaList = cinemaList.map(itemA => ({
        ...itemA,
        cinemaId: itemA.cinema_id
      }));
      let cinemaIdRes = getTargetCinemaCommon({
        app_name: app_name,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
      let cinema_id = cinemaIdRes?.cinema_id;
      if (!cinema_id) {
        console.error(conPrefix + "获取目标影院失败");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取目标影院失败",
          level: "error",
          info: {
            error: cinemaIdRes?.error,
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
          let targetFilmList = film.map(item => {
            const repeatedCharsResult = findMostRepeatedChars(
              item.title,
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
                film
              }
            });
            return;
          }
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
          opera_time: getCurrentTime(),
          des: "匹配影片放映日期失败",
          level: "error",
          info: {
            playDateList,
            start_day
          }
        });
        return;
      }
      let showList = targetDate?.session || [];
      let start_time = show_time.split(" ")[1].slice(0, 5);
      // 解决同一时间多场次问题
      let targetShowList = showList.filter(
        item => item.start_time === start_time
      );
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        targetShowList = targetShowList.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.screen_name,
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
        console.error("匹配影片放映场次失败", showList, start_time);
        this.logList.push({
          opera_time: getCurrentTime(),
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
        opera_time: getCurrentTime(),
        des: "获取电影放映信息从而获取会员价",
        level: "info",
        info: {
          targetShow
        }
      });
      return { ...targetShow, cinema_id, short_code };
    } catch (error) {
      console.error(conPrefix + "获取当前场次电影信息异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取当前场次电影信息异常",
        level: "error",
        info: {
          error: formatErrInfo(error)
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
        opera_time: getCurrentTime(),
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
    let { cinema_id, short_code } = data || {};
    let params = {
      cinema_id,
      short_code
    };
    try {
      console.log(conPrefix + "获取电影放映日期参数", params);
      const res = await this.appApi.getMoviePlayDate(params);
      console.log(conPrefix + "获取电影放映日期返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映日期返回",
        level: "info",
        info: {
          params,
          res
        }
      });
      return res.data || [];
    } catch (error) {
      console.error(conPrefix + "获取电影放映日期异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映日期异常",
        level: "error",
        info: {
          error,
          params
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
        opera_time: getCurrentTime(),
        des: "获取最新50条出票记录异常",
        level: "error",
        info: {
          error
        }
      });
    }
  }
}

// 测试报价实例的方法
window.lmaOfferObj = (plat_name, app_name) => {
  return new getLmaOfferPrice({ appFlag: app_name, plat_name });
};
// 测试方法
// window.lmaOfferObj("mayi", "hsmzyc").getMemberPrice({
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
export default getLmaOfferPrice;
