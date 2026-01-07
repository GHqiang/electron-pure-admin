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
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  couponInfoSpecial,
  isNextDay,
  getPreviousDay,
  calculateMarkup
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import {
  GET_APP_LIST,
  GET_SFC_APP_LIST,
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  ONE_STEP_PLAT_LIST
} from "@/common/constant.js";
import lierenApi from "@/api/lieren-api";
import { platTokens } from "@/store/platTokens";
import { getQuanTypeListByApp } from "./commonQuanStock.js";
import Logger from "@/common/logger.js";
const {
  userInfo: { rule, user_id }
} = platTokens();

class getSfcOfferPrice {
  constructor({ appFlag, plat_name }) {
    // console.log("APP_API_OBJ", APP_API_OBJ, appFlag, plat_name);
    this.appFlag = appFlag; // 影线标识
    this.plat_name = plat_name; // 平台标识
    this.appApi = APP_API_OBJ[appFlag];
    this.logger = new Logger({ logType: 1 }); // 初始化日志器
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
      this.logger.errorSave("获取猎人已报价列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  // 获取报价记录(仅测试用, 暂时不用)
  async getOfferList() {
    try {
      const res = await svApi.queryOfferList({
        user_id: user_id,
        // user_id: "9",
        plat_name: this.plat_name,
        start_time: formatTimeOfTime(+new Date() - 0.5 * 60 * 60 * 1000),
        end_time: getCurrentTime()
      });
      return res.data.offerList || [];
    } catch (error) {
      this.logger.errorSave("获取历史报价记录异常", {
        error: formatErrInfo(error)
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
      this.logger.infoSave("获取券类型信息返回", { res });
      return res.data.quanInfo || null;
    } catch (error) {
      this.logger.errorSave("获取券类型信息异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取最终报价信息（唯一暴漏给外包用的方法）
  async getEndOfferPrice({ order, offerList }) {
    const { plat_name, appFlag } = this;
    this.logger.init(order); // 初始化 logger
    let endPrice, offerRule;
    let { supplier_max_price, rewards, order_number } = order || {};
    try {
      // 获取匹配到的最终报价规则
      offerRule = await this.getEndMatchOfferRule(order);
      if (!offerRule) {
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      this.logger.infoSave("最终匹配到的报价规则", { offerRule });
      const {
        offerAmount,
        memberOfferAmount,
        memberCostPrice = 0,
        quanValue,
        offerType
      } = offerRule;
      let price = Number(offerAmount || memberOfferAmount);
      if (!price) {
        this.logger.errorSave("从最终报价规则里获取报价价格失败");
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      // 成本价
      let cost_price, quanInfoList;
      if (offerType === "1") {
        const quanInfo = await this.getQuanInfo(quanValue, appFlag);
        cost_price = quanInfo?.quan_cost;
        // 只用多种券类型才会返回数组
        // 这里取一个最小成本价去计算判断能否报价
        if (Array.isArray(quanInfo)) {
          quanInfoList = quanInfo;
          cost_price = Math.min(...quanInfoList.map(item => +item.quan_cost));
        }
      } else {
        cost_price = Number(memberCostPrice);
      }
      if (!cost_price) {
        this.logger.errorSave("获取出票成本价格失败");
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
        plat_name,
        offerRule
      });
      console.warn("最终报价返回", endPrice);
      if (!endPrice) {
        return this.returnResultHandle({ endPrice, offerRule, order_number });
      }
      // 增加一个quanValue的过滤，依据最大券成本过滤
      if (
        offerType === "1" &&
        offerRule?.maxCostPrice &&
        quanInfoList?.length > 1
      ) {
        offerRule.quanValue = offerRule.quanValue
          .split(",")
          .filter(item => {
            let targetQuanCost = quanInfoList.find(
              quanInfo => quanInfo.quan_value === item
            )?.quan_cost;
            return targetQuanCost < offerRule?.maxCostPrice;
          })
          .join();
      }
      // 最终报价
      offerRule.offer_end_amount = endPrice;
      let isAnomaly = window.localStorage.getItem("isAnomaly");
      if (isAnomaly === "1") {
        // sfc需要检查下系统是否异常（连续两个订单创建失败）
        let ticketList = await this.getTicketList();
        ticketList = ticketList?.filter(item =>
          GET_SFC_APP_LIST().includes(item.app_name)
        );
        let isAbnormal =
          ticketList?.length >= 2 ? checkConsecutiveErrors(ticketList) : false;
        if (isAbnormal) {
          this.logger.errorSave("sfc疑似故障，暂不报价", {
            isAbnormal,
            ticketList
          });
          endPrice = "";
        }
      }
      return this.returnResultHandle({ endPrice, offerRule, order_number });
    } catch (error) {
      this.logger.errorSave("获取最终报价信息方法执行异常", {
        error: formatErrInfo(error)
      });
      return this.returnResultHandle({ endPrice, offerRule, order_number });
    } finally {
      this.logger.logUpload();
    }
  }

  // 返回获取最终报价结果
  returnResultHandle({ endPrice, offerRule, order_number }) {
    let err_msg, err_info;
    try {
      const { err_msg: lastErrMsg, err_info: lastErrInfo } =
        this.logger.getLastErrMsgAndInfo();
      err_msg = lastErrMsg || "";
      err_info = lastErrInfo || "";
    } catch (error) {
      err_msg = "返回报价处理结果异常";
      err_info = formatErrInfo(error) || "";
    }
    return { err_msg, err_info, endPrice, offerRule };
  }

  // 获取最终匹配到的报价规则
  async getEndMatchOfferRule(order) {
    try {
      const matchRuleListRes = offerRuleMatch(order);
      let matchRuleList = matchRuleListRes?.matchRuleList || [];
      if (!matchRuleList?.length) {
        this.logger.errorSave("报价规则匹配后规则为空", {
          error: matchRuleListRes?.error,
          order
        });
        return;
      }
      matchRuleList = JSON.parse(JSON.stringify(matchRuleList));
      // 判断规则里是否有指定电影格式的（2D/3D）
      let filmTypeFlag = matchRuleList.some(item => !!item?.film_type?.length);
      let movieInfo, filmType; // 电影放映信息
      // 获取电影放映信息以匹配电影格式
      movieInfo = await this.getMovieInfo(order);
      if (!movieInfo) {
        this.logger.infoSave(
          "报价规则匹配时获取当前场次电影信息失败，直接不报"
        );
        return;
      }
      if (filmTypeFlag) {
        // 当前场次电影格式
        filmType = movieInfo.media;
        if (filmType) {
          filmType = filmType.toUpperCase();
          matchRuleList = matchRuleList.filter(item =>
            item.film_type?.some(itemA => filmType.includes(itemA))
          );
        }
      }
      if (!matchRuleList?.length) {
        this.logger.errorSave("过滤完电影格式后匹配报价规则为空", {
          filmTypeFlag,
          filmType,
          movieInfo,
          matchRuleList
        });
        return;
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
          this.logger.errorSave("根据券库存过滤后固定报价规则为空", {
            fixedAmountRuleList
          });
        } else {
          this.logger.errorSave("最终匹配到的报价规则为空");
        }
        return;
      }
      endRule = JSON.parse(JSON.stringify(endRule));
      return endRule;
    } catch (error) {
      this.logger.errorSave("获取最终匹配报价规则异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 连续获取券
  async continuousGetQuan(data) {
    let {
      city_id,
      cinema_id,
      session_id,
      page = 1,
      quanData = [],
      logger
    } = data;
    const params = {
      city_id,
      cinema_id,
      session_id,
      page,
      status: 4
    };
    try {
      const res = await this.appApi.getQuanList(params);
      let quanList = res.data?.unused?.lists || [];
      let total_page = res.data?.unused?.total_page || [];
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
        coupon_info: item.coupon_info,
        coupon_num: item.coupon_num,
        card_num: item.card_num,
        validate_date_end: item.validate_date_end // '2026.06.30'
      }));
    } catch (error) {
      logger.errorSave("连续获取券异常", {
        error: formatErrInfo(error),
        params
      });
      return [];
    }
  }

  // 获取优惠券列表
  async getQuanListByPhone({ city_id, cinema_id, session_id, logger }) {
    try {
      const quanData = await this.continuousGetQuan({
        city_id,
        cinema_id,
        session_id,
        logger
      });
      console.log("quanData", quanData);
      logger.infoSave("连续获取券最终返回", { quanData });
      return quanData.map(item => ({
        ...item,
        endDateTime: item.validate_date_end // '2026.06.30'
      }));
    } catch (error) {
      logger.errorSave("获取优惠券列表异常", { error: formatErrInfo(error) });
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
      if (fixedAmountRuleList.length) {
        let useMobileList = getCinemaLoginInfoList()
          .filter(
            item =>
              item.app_name === order.app_name && item.mobile && item.session_id
          )
          .map(item => item.mobile);
        const appQuanTypeList = await getQuanTypeListByApp({
          order,
          getQuanListByPhone: this.getQuanListByPhone.bind(this),
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
          return;
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
      this.logger.errorSave("获取真实加价金额异常", {
        error: formatErrInfo(error)
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
        plat_name,
        offerRule
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
        this.logger.infoSave("动态调价生效:" + str);
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
        this.logger.infoSave("开启夜间顶价");
      }
      // 规则报价
      let rule_price = price;
      // 最终报价高于平台限价，关闭超限报价直接不报
      if (price > Number(supplier_max_price)) {
        let isOverrunOffer = window.localStorage.getItem("isOverrunOffer");
        if (isOverrunOffer !== "1") {
          this.logger.errorSave(
            `最终报价${price}超过平台限价${supplier_max_price}，超限报价处于关闭状态不进行报价`
          );
          return;
        }
        // 券或者卡开了超限报价调整规则报价为平台限价
        if (["mayi", "yangcong"].includes(plat_name)) {
          price = Math.floor(supplier_max_price);
        } else {
          // 向下取0.5的倍数
          price = roundToHalf(
            supplier_max_price,
            ONE_STEP_PLAT_LIST.includes(plat_name) ? 0.1 : 0.5,
            "down"
          );
        }
        this.logger.infoSave("调整最终报价为平台限价四舍五入去整");
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
        this.logger.errorSave(str);
        return;
      }

      // 最大卡券成本（即成本必须低于它才有利润）
      let maxCostPrice =
        (price * 1000 + rewardPrice * 1000 - shouxufei * 1000) / 1000;
      offerRule.maxCostPrice = maxCostPrice;

      this.logger.infoSave("sfc计算报价相关信息", {
        rule_price: "规则计算报价：" + rule_price,
        profitAddPrice: "单店加价金额：" + profitAddPrice,
        supplier_max_price: "平台最高限价：" + supplier_max_price,
        cardQuanCost: "卡券成本：" + cardQuanCost,
        maxCostPrice: "最大卡券成本（低于该值才有利润）：" + maxCostPrice,
        price: "最终报价：" + price,
        shouxufei: "手续费（最终报价*1%）：" + shouxufei,
        cost_price: "出票成本（卡券成本+手续费）：" + cost_price,
        rewardPrice: `奖励金额(最终报价*奖励百分比-${rewards})：` + rewardPrice,
        real_cost_price: "真实成本（出票成本-奖励金额）：" + real_cost_price,
        expectProfit: "预计利润（最终报价-真实成本）：" + expectProfit
      });
      return price;
    } catch (error) {
      this.logger.errorSave("获取最终报价异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取座位布局
  async getSeatLayout(data) {
    try {
      let { city_id, cinema_id, show_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        show_id: show_id,
        width: "240"
      };
      console.log("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      console.log("获取座位布局返回", res);
      return res.data?.play_data || {};
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", {
        error: formatErrInfo(error),
        params
      });
    }
  }

  // 获取会员价
  async getMemberPrice({ order, movieData, minAddAmountRule }) {
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
        this.logger.infoSave("获取座位布局相关信息", {
          area_price,
          promo_num
        });
        if (promo_num && promo_num < +ticket_num) {
          this.logger.errorSave("促销票数低于订单票数", {
            promo_num,
            ticket_num
          });
          return;
        }
        let bigPrice, maxSeatPrice, mostSeatPrice;
        if (area_price?.length) {
          // 座位分区从高到低排序
          let areaList = area_price.sort((a, b) => b.price - a.price);
          // 默认取最高价
          maxSeatPrice = areaList[0].price;
          bigPrice = maxSeatPrice;
          // 获取最多座位价格
          mostSeatPrice = this.getMostSeatPrice(seat_data, areaList);
          if (minAddAmountRule.memberPriceRule == "2") {
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
        this.logger.infoSave("获取该影院已维护会员卡列表返回", { list });
        let useMobileList = getCinemaLoginInfoList()
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
    }
  }

  // 获取最多座位价格
  getMostSeatPrice(seat_data, areaList) {
    try {
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
      //     opera_time: getCurrentTime(),
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
      //     opera_time: getCurrentTime(),
      //     des: "座位分区剩余座位占比计算失败",
      //     level: "info",
      //     info: {
      //       error
      //     }
      //   });
      // }
      // 过滤出来未售座位然后计算分区剩余座位占比，0-未售
      let seatList = seat_data.filter(item => item[2] == 0);

      let areaRatioList = areaList.map(item => {
        return {
          ...item,
          numRatio: Math.floor(
            (seatList.filter(itemA => itemA[itemA.length - 1] == item.area_id)
              .length *
              100) /
              seatList.length
          )
        };
      });
      areaRatioList.sort((a, b) => b.numRatio - a.numRatio);
      this.logger.infoSave("座位分区剩余座位占比情况", { areaRatioList });
      let mostSeatPrice = areaRatioList[0]?.settlePrice;
      return mostSeatPrice;
      // // 默认取最高价格，最高座位占比不足百分之3时取次最高价格
      // if (areaList[0].numRatio <= 3 && areaList[1]?.settlePrice) {
      //   maxSeatPrice = areaList[1].settlePrice;
      // }
      // if (areaList[1].numRatio <= 3 && areaList[2]?.settlePrice) {
      //   maxSeatPrice = areaList[2].settlePrice;
      // }
    } catch (error) {
      this.logger.infoSave("座位分区剩余座位占比计算失败", {
        error: formatErrInfo(error)
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
      console.log("获取城市影院参数", params);
      let res = await this.appApi.getCinemaList(params);
      console.log("获取城市影院返回", res);
      let cinemaList = res.data?.cinema_data || [];
      cinemaList = cinemaList.map(itemA => ({
        ...itemA,
        cinemaId: itemA.id
      }));
      let cinemaIdRes = getTargetCinemaCommon({
        app_name: appFlag,
        plat_cinema_code: cinema_code,
        cinema_list: cinemaList
      });
      let cinema_id = cinemaIdRes?.id;
      if (!cinema_id) {
        this.logger.errorSave("获取目标影院失败", {
          error: cinemaIdRes?.error,
          cinemaList,
          cinema_name,
          app_name,
          city_name
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
      let movieInfo = getMovieInfoFromFilmName({
        filmName: film_name,
        movieData: movie_data?.map(item => ({
          ...item,
          filmName: item.movie_name
        }))
      });
      if (!movieInfo) {
        this.logger.errorSave("获取目标影片信息失败", {
          film_name,
          movie_data: movie_data.map(item => ({
            movie_name: item.movie_name
          }))
        });
        return;
      }
      let { shows } = movieInfo;
      let showDay = show_time.split(" ")[0];
      let showTime = show_time.split(" ")[1].slice(0, 5);
      // 是否是次日，如果是，showDay需要向前进一
      if (isNextDay(showDay, showTime, "sfc")) {
        showDay = getPreviousDay(showDay);
      }
      let showList = shows[showDay] || [];

      // 解决同一时间多场次问题
      let targetShowList = showList.filter(
        item => item.start_time === showTime
      );
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        targetShowList = targetShowList.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.hall_name,
            hall_name,
            "hall_name"
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
        this.logger.infoSave("同一时间多场次", { targetShowList });
      }
      if (!targetShow) {
        this.logger.errorSave("匹配影片放映场次失败", {
          movieInfo,
          show_time
        });
        return;
      }
      if (appFlag === "hbchyxd") {
        targetShow.member_price = targetShow.normal_price;
      }
      this.logger.infoSave("获取电影放映信息从而获取会员价", {
        targetShow,
        city_id,
        cinema_id
      });
      return { ...targetShow, city_id, cinema_id };
    } catch (error) {
      this.logger.errorSave("获取当前场次电影信息异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取电影放映信息
  async getMoviePlayInfo(data) {
    try {
      let { city_id, cinema_id } = data || {};
      let params = {
        city_id: city_id,
        cinema_id: cinema_id,
        width: "500"
      };
      console.log("获取电影放映信息参数", params);
      let res = await this.appApi.getMoviePlayInfo(params);
      console.log("获取电影放映信息返回", res);
      return res.data;
    } catch (error) {
      this.logger.errorSave("获取电影放映信息异常", {
        error: formatErrInfo(error)
      });
    }
  }
  // 获取城市列表
  async getCityList() {
    try {
      let params = {};
      console.log("获取城市列表参数", params);
      let res = await this.appApi.getCityList(params);
      console.log("获取城市列表返回", res);
      return res.data.all_city || [];
    } catch (error) {
      this.logger.errorSave("获取城市列表异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取出票记录
  async getTicketList() {
    try {
      const ticketRes = await svApi.queryTicketList({
        user_id: user_id,
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

// 测试报价实例的方法
window.sfcOfferObj = (plat_name, app_name) => {
  return new getSfcOfferPrice({ appFlag: app_name, plat_name });
};
// 测试方法
// window.sfcOfferObj("mayi", "hsmzyc").getMemberPrice({
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
export default getSfcOfferPrice;
