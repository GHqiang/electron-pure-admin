// ume报价逻辑
import {
  getCurrentTime,
  getCurrentDay,
  convertFullwidthToHalfwidth,
  offerRuleMatch,
  getTargetCinema,
  logUpload,
  formatErrInfo,
  roundToHalf,
  isDateInCurrentMonth,
  calculateMarkup,
  getCinemaLoginInfoList
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import { APP_LIST, UME_LIST, GROUP_LIST } from "@/common/constant.js";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

class getUmeOfferPrice {
  constructor({ appFlag, plat_name }) {
    // console.log("APP_API_OBJ", APP_API_OBJ, appFlag, plat_name);
    this.appFlag = appFlag; // 影线标识
    this.plat_name = plat_name; // 平台标识
    this.conPrefix = APP_LIST[appFlag] + "自动报价——"; // 打印前缀
    this.appApi = APP_API_OBJ[appFlag];
    this.logList = []; // 操作运行日志
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

  // 获取最终报价信息（唯一暴漏给外包用的方法）
  async getEndOfferPrice({ order, offerList }) {
    const { conPrefix, plat_name, appFlag } = this;
    let { supplier_max_price, rewards, order_number } = order || {};
    let endPrice, offerRule;
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
      let filmTypeFlag = matchRuleList.find(
        item => item?.film_type?.length == 1
      );
      let movieInfo, filmType; // 电影放映信息
      // 获取电影放映信息以匹配电影格式
      movieInfo = await this.getMovieInfo(order);
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
        filmType = movieInfo.localFilmVersion;
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
      console.warn(conPrefix + "最终匹配到的报价规则", endRule);
      if (!endRule) {
        // 日常固定报价规则
        let fixedAmountRuleList = matchRuleList.filter(
          item => item.offerType === "1" && item.offerAmount
        );
        if (fixedAmountRuleList.length && rule == 2) {
          this.logList.push({
            opera_time: getCurrentTime(),
            des: "根据券库存过滤后固定报价规则为空",
            level: "error",
            info: {
              fixedAmountRuleList
            }
          });
        }
        console.error(conPrefix + "最终匹配到的报价规则不存在");
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

  // 异步更新券库存
  async syncUpdateQuanStock({ order, cinemaCode, cinemaLinkId, quanTypeList }) {
    const { app_name, plat_name, order_number } = order;
    let logList = [];
    let targetLoginList = getCinemaLoginInfoList().filter(
      item => item.app_name === app_name && item.mobile && item.session_id
    );
    console.log("targetLoginList", targetLoginList);
    try {
      let needUpdateQuanTypeList = [];
      // 拿着处理过的最大券库存（几个号之间）+对应的更新时间去判断是否要更新
      let isNeedUpdate = quanTypeList.some(item => {
        if (item.quan_stock < 5) {
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
        }
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
            quanStockList: targetLoginList.map(itemA => ({
              phone: itemA.mobile,
              quan_stock: 0
            }))
          };
        });
        // 获取每个号的优惠券列表
        for (let i = 0; i < targetLoginList.length; i++) {
          const { session_id, mobile } = targetLoginList[i];
          const quanListAll = await this.getQuanListByPhone({
            session_id,
            cinemaCode,
            cinemaLinkId,
            logList
          });

          quanTypeListParams.forEach(item => {
            let targetQuanList = quanListAll.filter(
              itemA =>
                item.quan_flag === itemA.coupon_info &&
                !item.black_quans?.includes(itemA.coupon_num)
            );
            console.log(item.quan_flag, "targetQuanList", targetQuanList);
            let quanStock = targetQuanList.length;
            let quanStockList = item.quanStockList;
            console.log("quanStockList", quanStockList);
            let inx = quanStockList.findIndex(itemB => itemB.phone === mobile);
            if (inx != -1) {
              quanStockList[inx].quan_stock = quanStock;
            } else {
              quanStockList.push({
                phone: mobile,
                quan_stock: quanStock
              });
            }
          });
        }
        console.log("quanTypeListParams", quanTypeListParams);
        let updateTypeList = quanTypeListParams.map(item => ({
          id: item.id,
          quanStockList: item.quanStockList.map(itemA => ({
            ...itemA,
            update_time: getCurrentTime()
          })),
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
  async getQuanTypeListByApp({ order, cinemaCode, cinemaLinkId }) {
    const { app_name } = order;
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
        item.quan_stock = item.quan_stock || 0;
        if (item.quanStockList?.length) {
          // 最大数当做券库存
          let maxNum = 0;
          item.quanStockList.forEach(itemA => {
            if (+itemA.quan_stock > maxNum) {
              maxNum = +itemA.quan_stock;
            }
          });
          item.quan_stock = maxNum;
        }
      });
      console.log("quanTypeList", quanTypeList);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "根据影院获取券类型列表返回",
        level: "info",
        info: {
          quanTypeRes,
          quanTypeList,
          params
        }
      });
      // 异步更新券库存
      this.syncUpdateQuanStock({
        order,
        cinemaCode,
        cinemaLinkId,
        quanTypeList
      });
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

  // 连续获取券
  async continuousGetQuan(data) {
    let {
      cinemaCode,
      cinemaLinkId,
      session_id,
      page,
      quanData = [],
      logList
    } = data;
    let params = {
      params: {
        status: "UN_USED",
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaCode,
        cinemaLinkId
      },
      pageIndex: page,
      pageRows: 50, // 支持修改
      session_id
    };
    try {
      const res = await this.appApi.findCouponByMember(params);
      console.log("获取优惠券列表返回", res);
      let quanList = res.data || [];
      let total_page = res.pagesCount;
      if (page == 2) {
        logList.push({
          opera_time: getCurrentTime(),
          des: "获取券返回",
          level: "info",
          info: {
            quanList,
            params
          }
        });
      }
      quanData.push(...quanList);
      if (total_page > page) {
        // 如果总数量仍小于所需数量，则继续获取下一页
        return await this.continuousGetQuan({
          ...data,
          page: page + 1,
          quanData
        });
      }
      return quanData.map(item => ({
        coupon_info: item.couponName,
        coupon_num: item.couponCode
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
    }
  }

  // 获取优惠券列表
  async getQuanListByPhone({
    cinemaCode,
    cinemaLinkId,
    session_id,
    page = 1,
    logList
  }) {
    try {
      let params = {
        params: {
          status: "UN_USED",
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode,
          cinemaLinkId
        },
        pageIndex: page,
        pageRows: 50, // 支持修改
        session_id
      };
      logList.push({
        opera_time: getCurrentTime(),
        des: "获取优惠券列表参数",
        level: "info",
        info: {
          params
        }
      });
      console.log("获取优惠券列表参数", params);
      const res = await this.appApi.findCouponByMember(params);
      console.log("获取优惠券列表返回", res);
      let quanList = res.data || [];
      let total_page = res.pagesCount;
      logList.push({
        opera_time: getCurrentTime(),
        des: "获取优惠券列表返回",
        level: "info",
        info: {
          quanList,
          total_page
        }
      });
      let quanListAll = quanList.map(item => ({
        coupon_info: item.couponName,
        coupon_num: item.couponCode
      }));
      // 证明还有下一页
      if (total_page > page) {
        const quanData = await this.continuousGetQuan({
          cinemaCode,
          cinemaLinkId,
          session_id,
          page: 2,
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
        quanListAll.push(...(quanData || []));
      }
      console.log("quanListAll", quanListAll);

      return quanListAll;
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
      if (fixedAmountRuleList.length && rule == 2) {
        // 校验其库存，进行过滤
        const appQuanTypeList = await this.getQuanTypeListByApp({
          order,
          cinemaCode: movieInfo.cinemaCode,
          cinemaLinkId: movieInfo.cinemaLinkId
        });
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
      let mixAddAmountRule = addAmountRuleList?.[0];
      // 如果addAmount设置比较特殊，就直接取第一条规则报价,如：30;>=+2;<+1
      if (
        addAmountRuleList?.length > 1 &&
        addAmountRuleList[0].addAmount?.split(";")?.length === 1
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
        if (
          !mixAddAmountRule.realAddMount &&
          mixAddAmountRule.addMountRule?.length > 1
        ) {
          let realAddMount = this.getRealAddMount({
            real_member_price: memberPriceRes.real_member_price,
            addMountRule: mixAddAmountRule.addMountRule
          });
          if (!realAddMount) {
            this.logList.push({
              opera_time: getCurrentTime(),
              des: "获取真实加价金额失败,返回最小固定报价规则",
              level: "warn",
              info: {
                real_member_price: memberPriceRes.real_member_price,
                addMountRule: mixAddAmountRule.addMountRule
              }
            });
            return mixFixedAmountRule;
          }
          mixAddAmountRule.realAddMount = realAddMount;
        }

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
          Number(mixAddAmountRule.realAddMount);
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
            addAmount: "最小加价金额：" + mixAddAmountRule.realAddMount,
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
  // 获取真实加价金额
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
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取真实加价金额异常",
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
        plat_name
      } = params || {};
      // console.log("获取最终报价相关字段", params);
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
      if (price <= real_cost_price) {
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

  // 获取座位布局
  async getSeatLayout(data) {
    const { conPrefix } = this;
    try {
      let { cinemaCode, cinemaLinkId, scheduleId, scheduleKey } = data || {};
      let params = {
        params: {
          cinemaCode,
          cinemaLinkId,
          scheduleId,
          scheduleKey,
          channelCode: "QD0000001",
          sysSourceCode: "YZ001"
        }
      };
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
      return res.data;
    } catch (error) {
      console.error(conPrefix + "获取座位布局异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取座位布局异常",
        level: "error",
        info: {
          error
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
        ticketMemberPrice,
        maxSeatPrice = 0,
        handlingFee,
        ticketMemberServiceFeeMin = 0,
        activityPrices = []
      } = movieInfo;
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取会员价相关信息0",
        level: "info",
        info: {
          ticketMemberPrice: "会员价：" + ticketMemberPrice,
          maxSeatPrice: "座位最高价：" + maxSeatPrice,
          handlingFee: "真实手续费：" + handlingFee,
          ticketMemberServiceFeeMin: "会员服务费：" + ticketMemberServiceFeeMin,
          activityPrices
        }
      });
      let member_price = Math.max(ticketMemberPrice, maxSeatPrice) / 100;
      // 会员价为0
      if (member_price === 0) {
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取会员价为0",
          level: "error",
          info: {
            ticketMemberPrice,
            maxSeatPrice
          }
        });
        return;
      }
      // 会员价等于真实会员价加手续费加会员服务费
      member_price =
        member_price +
        (Number(handlingFee) + Number(ticketMemberServiceFeeMin)) / 100;
      console.log(conPrefix + "获取会员价", member_price);
      // 耀莱暂时不考虑
      if (
        appFlag !== "yaolai" &&
        activityPrices?.length &&
        UME_LIST.includes(appFlag)
      ) {
        // [{
        //    "activityId": 23,
        //    "activityCode": "YPHD000000023",
        //    "filmActivityType": "10",
        //    "promotionMethod": "UNITY",
        //    "activityName": "【华中区】周一会员日",
        //    "amountOrSale": 610.00, // 优惠金额
        //    "partCardType": "CHOOSE"
        //  }]
        // 如果存在会员活动会员价先减1，不减amountOrSale是因为怕把价格压下去
        // member_price = member_price - 1;
      }
      if (member_price > 0) {
        const cardRes = await svApi.queryCardList({
          app_name: app_name,
          rule: rule,
          status: "1",
          isNeedTotalNum: 0,
          queryFields:
            "card_num,card_discount,linkCinemaIds,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
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
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取该影院已维护会员卡列表返回",
          level: "info",
          info: {
            list
          }
        });
        // console.log("list", list);
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
            : item.linkCinemaIds
                .split(",")
                .some(itemA => itemA == movieInfo.cinemaCode);
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
              cinemaCode: movieInfo.cinemaCode
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
          des: "获取会员价相关信息1",
          level: "info",
          info: {
            real_member_price:
              "真实会员价（会员价+手续费+服务费）：" + real_member_price,
            discount: "最小折扣：" + discount,
            cost_member_price:
              "会员成本价（真实会员价*折扣）：" +
              Number(member_price.toFixed(2))
          }
        });
        return {
          real_member_price,
          member_price: Number(member_price.toFixed(2)),
          discount
        };
      } else {
        console.warn(conPrefix + "会员价未负，非会员价");
        // if (nonmember_price) {
        //   this.logList.push({
        //     opera_time: getCurrentTime(),
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
  async getMovieInfo(order) {
    const { conPrefix, appFlag } = this;
    let {
      city_name,
      film_name,
      hall_name,
      show_time,
      cinema_code,
      cinema_name
    } = order;
    try {
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
      console.log(conPrefix + "获取城市影院列表返回", cinemaList);

      // 2、获取目标影院
      let targetCinema = cinemaList.find(
        item => item.cinemaCode === cinema_code
      );
      if (!targetCinema) {
        targetCinema = getTargetCinema(cinema_name, cinemaList, appFlag);
      }
      if (!targetCinema) {
        console.error(conPrefix + "获取目标影院失败");
        this.logList.push({
          opera_time: getCurrentTime(),
          des: "获取目标影院失败",
          level: "error",
          info: {
            cinemaList,
            cinema_code,
            cinema_name,
            app_name: appFlag
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
      // 获取某个放映日期的场次列表
      const showList = await this.getMoviePlayTime({
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        showDate: targetDate.showDate
      });
      let start_time = show_time.split(" ")[1].slice(0, 5);
      // 解决同一时间多场次问题
      let targetShowList = showList.filter(
        item => item.showDateTime.split(" ")[1].slice(0, 5) === start_time
      );
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        let targetShowInfo = targetShowList.find(
          item => item.hallName === hall_name
        );
        targetShow = targetShowInfo ? targetShowInfo : targetShow;
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
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映信息从而获取会员价",
        level: "info",
        info: {
          targetShow,
          cinemaCode,
          cinemaLinkId
        }
      });
      const areaRes = await this.getSeatLayout({
        cinemaCode,
        cinemaLinkId,
        scheduleId: targetShow?.scheduleId,
        scheduleKey: targetShow?.scheduleKey
      });
      let { seatList: seat_data, areaInfoList } = areaRes || {};
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取座位布局相关信息",
        level: "info",
        info: {
          areaInfoList
        }
      });
      if (areaInfoList?.length) {
        // 座位分区从高到低排序
        let areaList = areaInfoList
          .map(item => {
            let priceInfo;
            if (item.areaMemberPrice?.length) {
              priceInfo = item.areaMemberPrice.sort(
                (a, b) => b.settlePrice - a.settlePrice
              )[0];
            } else {
              priceInfo = { settlePrice: item.areaSettlePrice || 0 };
            }
            return {
              ...item,
              ...priceInfo
            };
          })
          .sort((a, b) => b.settlePrice - a.settlePrice);
        // 默认取最高价
        let maxSeatPrice = areaList[0].settlePrice;
        // try {
        //   // 过滤出来未售座位然后计算分区剩余座位占比，0-未售
        //   let seatList = seat_data.filter(item => item.status === 0);

        //   areaList = areaList.map(item => {
        //     return {
        //       ...item,
        //       numRatio: Math.floor(
        //         (seatList.filter(itemA => itemA.areaId == item.areaId).length *
        //           100) /
        //           seatList.length
        //       )
        //     };
        //   });
        //   this.logList.push({
        //     opera_time: getCurrentTime(),
        //     des: "座位分区剩余座位情况",
        //     level: "info",
        //     info: {
        //       areaList
        //     }
        //   });
        //   // 默认取最高价格，最高座位占比不足百分之3时取次最高价格
        //   if (areaList[0].numRatio <= 3 && areaList[1]?.settlePrice) {
        //     maxSeatPrice = areaList[1].settlePrice;
        //   }
        //   if (areaList[1].numRatio <= 3 && areaList[2]?.settlePrice) {
        //     maxSeatPrice = areaList[2].settlePrice;
        //   }
        // } catch (error) {
        //   this.logList.push({
        //     opera_time: getCurrentTime(),
        //     des: "座位分区剩余座位占比计算失败",
        //     level: "info",
        //     info: {
        //       error
        //     }
        //   });
        // }
        return {
          ...targetShow,
          maxSeatPrice,
          cinemaCode,
          cinemaLinkId
        };
      }
      return targetShow;
    } catch (error) {
      console.error(conPrefix + "获取当前场次电影信息异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
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
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode,
          cinemaLinkId
        }
      };
      console.log(conPrefix + "获取影院放映列表参数", params);
      const res = await this.appApi.getMoviePlayInfo(params);
      console.log(conPrefix + "获取影院放映列表返回", res);
      // 只获取出售中的列表，即将上映暂不返回
      let fimlList =
        res.data?.find(item => item.showStatus === "SHOWING")?.fimlList || [];
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取影院放映列表返回",
        level: "info",
        info: {
          fimlList
        }
      });
      return fimlList;
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
    try {
      let { cinemaCode, cinemaLinkId, filmUniqueId } = data || {};
      let params = {
        params: {
          cinemaCode: cinemaCode,
          filmUniqueId: filmUniqueId,
          keepLoading: true,
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaLinkId: cinemaLinkId
        }
      };
      console.log(conPrefix + "获取电影放映日期参数", params);
      const res = await this.appApi.getMoviePlayDate(params);
      console.log(conPrefix + "获取电影放映日期返回", res);
      return res.data || [];
    } catch (error) {
      console.error(conPrefix + "获取电影放映日期异常", error);
      this.logList.push({
        opera_time: getCurrentTime(),
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
    let { cinemaCode, cinemaLinkId, filmUniqueId, showDate } = data || {};
    let params = {
      params: {
        cinemaCode: cinemaCode,
        filmUniqueId: filmUniqueId,
        showDate: showDate,
        channelCode: "QD0000001",
        sysSourceCode: "YZ001",
        cinemaLinkId: cinemaLinkId
      }
    };
    try {
      console.log(conPrefix + "获取电影放映场次参数", params);
      const res = await this.appApi.getMoviePlayTime(params);
      console.log(conPrefix + "获取电影放映场次返回", res);
      this.logList.push({
        opera_time: getCurrentTime(),
        des: "获取电影放映场次返回",
        level: "info",
        info: {
          params,
          res
        }
      });
      return res.data || [];
    } catch (error) {
      console.error(conPrefix + "获取电影放映信息异常", error);
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
    const { conPrefix } = this;
    try {
      let params = {
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode: "32012801",
          cinemaLinkId: "15946"
        }
      };
      console.log(conPrefix + "获取城市影院列表参数", params);
      const res = await this.appApi.getCinemaList(params);
      console.log(conPrefix + "获取城市影院列表返回", res);
      let list = res.data || [];
      return list;
    } catch (error) {
      console.error(conPrefix + "获取城市影院列表异常", error);
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
window.umeOfferObj = (plat_name, app_name) => {
  return new getUmeOfferPrice({ appFlag: app_name, plat_name });
};
// 测试方法
// window.umeOfferObj("mayi", "hsmzyc").getMemberPrice({
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
export default getUmeOfferPrice;
