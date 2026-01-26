// ume报价逻辑
import {
  getCurrentTime,
  getCurrentDay,
  formatTimeOfDay,
  formatTimeOfTime,
  convertFullwidthToHalfwidth,
  offerRuleMatch,
  getTargetCinemaCommon,
  logUpload,
  formatErrInfo,
  roundToHalf,
  isDateInCurrentMonth,
  calculateMarkup,
  getCinemaLoginInfoList,
  findMostRepeatedChars,
  getMovieInfoFromFilmName,
  couponInfoSpecial,
  divDecimal
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import {
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST,
  ONE_STEP_PLAT_LIST
} from "@/common/constant.js";
import { getQuanTypeListByApp } from "./commonQuanStock.js";
import Logger from "@/common/logger.js";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

class getUmeOfferPrice {
  constructor({ appFlag, plat_name }) {
    this.appFlag = appFlag; // 影线标识
    this.plat_name = plat_name; // 平台标识
    this.appApi = APP_API_OBJ[appFlag];
    this.logger = new Logger({ logType: 1 }); // 初始化日志器
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
      console.error("获取券类型信息异常", error);
      this.logger.errorSave("获取券类型信息异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取最终报价信息（唯一暴漏给外包用的方法）
  async getEndOfferPrice({ order, offerList }) {
    const { plat_name, appFlag } = this;
    this.logger.init(order); // 初始化 logger
    let { supplier_max_price, rewards, order_number } = order || {};
    let endPrice, offerRule;
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
      // 最终报价
      offerRule.offer_end_amount = endPrice;
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
      this.logger.infoSave("开始获取电影放映信息");
      let movieInfo, filmType; // 电影放映信息
      movieInfo = await this.getMovieInfo(order, filmTypeFlag, matchRuleList);
      if (!movieInfo) {
        this.logger.infoSave(
          "报价规则匹配电影格式时获取当前场次电影信息失败，直接不报"
        );
        return;
      }
      if (movieInfo?.filmTypeCheckFail) {
        this.logger.errorSave("过滤完电影格式后匹配报价规则为空", {
          filmTypeFlag,
          filmType: movieInfo.filmType,
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
      console.error("获取最终匹配报价规则异常", error);
      this.logger.errorSave("获取最终匹配报价规则异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 连续获取券
  async continuousGetQuan(data) {
    let { session_id, pageNo = 1, pageSize = 50, quanData = [], logger } = data;
    let params = {
      state: "USEFUL",
      pageNo,
      pageSize, // 支持修改
      umeToken: session_id
    };
    try {
      const res = await this.appApi.getQuanList(params);
      console.log("获取优惠券列表返回", res);
      let quanList = res.bizValue || [];
      quanData.push(...quanList);
      // 如果返回和每页请求条数相等证明还有下一页
      if (pageSize == quanList.length) {
        // 如果总数量仍小于所需数量，则继续获取下一页
        return await this.continuousGetQuan({
          ...data,
          pageNo: pageNo + 1,
          quanData
        });
      }
      return quanData.map(item => ({
        coupon_info: item.name,
        coupon_num: item.couponCode,
        expireTime: item.expireTime // 1762963199000
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
  async getQuanListByPhone({ session_id, page = 1, logger }) {
    let params = {
      state: "USEFUL",
      pageNo: page,
      pageSize: 20, // 支持修改
      umeToken: session_id
    };
    try {
      const quanData = await this.continuousGetQuan({
        session_id,
        logger
      });
      console.log("quanData", quanData);
      logger.infoSave("连续获取券最终返回", { quanData });

      return quanData.map(item => ({
        ...item,
        endDateTime: item.expireTime // 1762963199000
      }));
    } catch (error) {
      logger.errorSave("获取优惠券列表异常", {
        params,
        error: formatErrInfo(error)
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
      let useMobileList = getCinemaLoginInfoList()
        .filter(
          item =>
            item.app_name === order.app_name && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      const appQuanTypeList = await getQuanTypeListByApp({
        order,
        getQuanListByPhone: this.getQuanListByPhone.bind(this),
        logger: this.logger
      });
      this.logger.infoSave("根据影院获取券类型列表返回", {
        quanTypeList: appQuanTypeList?.map(
          ({ quanStockListByPhone, ...item }) => item
        ),
        useMobileList
      });
      if (fixedAmountRuleList.length) {
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
            { appQuanTypeList }
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
      let mixAddAmountRule = addAmountRuleList?.[0];
      // 如果addAmount设置比较特殊，严谨来说只能有且仅有一条规则或者其规则再首位时才能生效；如：30;>=+2;<+1
      if (
        addAmountRuleList?.length > 1 &&
        addAmountRuleList.every(
          item => item?.addAmount?.split(";")?.length === 1
        )
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
          this.logger.infoSave("获取当前场次电影信息失败，直接不报");
          return;
        }

        if (!memberPriceRes) {
          console.warn(
            "最小加价规则获取会员价失败,返回最小固定报价规则",
            mixFixedAmountRule
          );
          this.logger.warnSave(
            "最小加价规则获取会员价失败,返回最小固定报价规则",
            {
              memberPriceRes,
              fixedOfferAmount: mixFixedAmountRule?.offerAmount
            }
          );
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
            this.logger.warnSave("获取真实加价金额失败,返回最小固定报价规则", {
              real_member_price: memberPriceRes.real_member_price,
              addMountRule: mixAddAmountRule.addMountRule
            });
            return mixFixedAmountRule;
          }
          mixAddAmountRule.realAddMount = realAddMount;
        }

        // 最小折扣
        mixAddAmountRule.member_discount = memberPriceRes.discount;
        // 会员成本价(真实会员价*折扣价)
        mixAddAmountRule.memberCostPrice = memberPriceRes.member_cost_price;
        // 会员成本价不为0.5的整数倍时进0.5
        mixAddAmountRule.round_member_price = roundToHalf(
          mixAddAmountRule.memberCostPrice,
          ONE_STEP_PLAT_LIST.includes(order.plat_name) ? 0.1 : 0.5
        );
        // 会员预计报价
        mixAddAmountRule.memberOfferAmount =
          mixAddAmountRule.round_member_price +
          Number(mixAddAmountRule.realAddMount);
        this.logger.infoSave("会员报价最终信息", {
          real_member_price:
            "真实会员总价：" + mixAddAmountRule.real_member_price,
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
        });
      } else {
        this.logger.infoSave("最小加价规则不存在,返回最小固定报价规则");
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
        this.logger.infoSave("会员报价高于固定报价，返回最小固定报价规则");
        return mixFixedAmountRule;
      } else {
        this.logger.infoSave("会员报价低于固定报价，返回最小加价报价规则", {
          memberOfferAmount: mixAddAmountRule.memberOfferAmount,
          fixedOfferAmount: mixFixedAmountRule.offerAmount
        });
        return mixAddAmountRule;
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
        plat_name,
        offerRule
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
        if (["mayi"].includes(plat_name)) {
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
      let shouxufei = (price * 100) / 10000;
      if (NO_FEE_PLAT_LIST.includes(plat_name)) {
        shouxufei = 0;
      }
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

      this.logger.infoSave("umeh5计算报价相关信息", {
        rule_price: "规则计算报价：" + rule_price,
        profitAddPrice: "单店加价金额：" + profitAddPrice,
        supplier_max_price: "平台最高限价：" + supplier_max_price,
        cardQuanCost: "卡券成本：" + cardQuanCost,
        maxCostPrice: "最大卡券成本（低于该值才有利润）：" + maxCostPrice,
        price: "最终报价：" + price,
        shouxufei: "手续费（最终报价*1%）：" + shouxufei,
        cost_price: "出票成本（卡券成本+手续费）：" + pay_cost_price,
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
  async getSeatLayout({ cinemaLinkId, hallId, scheduleId, scheduleKey }) {
    try {
      let params = {
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey,
        apiVersion: "1.0",
        empCode: "",
        leaseCode: ""
      };
      console.log("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      let sections = res.bizValue?.sections?.[0] || {};
      console.log("获取座位布局返回", res);
      return sections;
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取会员价
  async getMemberPrice(order, movieData) {
    const { appFlag } = this;
    try {
      console.log("准备获取会员价", order);
      const { ticket_num, app_name } = order;
      // 获取当前场次电影信息，防止接口重复掉
      let movieInfo = movieData;
      if (!movieData) {
        movieInfo = await this.getMovieInfo(order);
      }
      let cardList = this.cardList;
      console.log("待报价订单当前场次电影相关信息", movieInfo);
      if (!movieInfo) {
        console.error("获取当前场次电影信息失败", "不再进行报价");
        return -1;
      }
      let {
        displayPrice, // 展示价格(会员价)
        lowestPrice, // 最低价，
        standardPrice, // 标准价格
        originalStandardPrice, // 原始标准价
        maxSeatPrice = 0, // 最大座位分区价格
        privilegeTags = [] // 优惠信息
      } = movieInfo;
      this.logger.infoSave("获取会员价相关信息0", {
        displayPrice: "会员价：" + displayPrice,
        maxSeatPrice: "座位最高价：" + maxSeatPrice,
        privilegeTags
      });
      // maxSeatPrice: 最高座位价*座位数 || 优惠后真实支付总价
      let member_total_price =
        Math.max(displayPrice * ticket_num, maxSeatPrice) / 100;
      // 会员总价为0
      if (member_total_price === 0) {
        this.logger.errorSave("获取会员总价为0", {
          displayPrice,
          maxSeatPrice
        });
        return;
      }
      console.log("获取会员总价", member_total_price);
      if (member_total_price > 0) {
        if (!cardList.length) {
          console.error("影院单卡出票限制");
          this.logger.errorSave("影院单卡出票限制，无可用卡", {
            ticket_num,
            cinemaCode: movieInfo.cinemaCode
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
        let real_member_price = divDecimal(member_total_price, ticket_num);
        let member_cost_price = discount
          ? (Number(member_total_price) * 100 * discount) / 10000
          : Number(member_total_price);
        member_cost_price = Number((member_cost_price / ticket_num).toFixed(2));
        this.logger.infoSave("获取会员价相关信息1", {
          real_member_price:
            "真实会员价（会员价+手续费+服务费）：" + real_member_price,
          discount: "最小折扣：" + discount,
          cost_member_price:
            "会员成本价（真实会员总价/票数*折扣）：" + member_cost_price
        });
        return {
          real_member_price,
          member_cost_price,
          discount
        };
      } else {
        console.warn("会员价未负，非会员价");
      }
    } catch (error) {
      this.logger.errorSave("获取会员价异常", { error: formatErrInfo(error) });
    }
  }

  // 获取可用卡列表
  async getCanUseCardList({ app_name, ticket_num, cinemaLinkId }) {
    try {
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
      // console.log("list", list);
      // 根据当天及当月出票量限制进行过滤
      let cardListLimit = cardListByMobile.filter(item => {
        const { use_limit_day, use_limit_month, daily_usage, month_usage } =
          item;
        if (!use_limit_day && !use_limit_month) return true;
        return (
          (use_limit_day ? ticket_num <= use_limit_day - daily_usage : true) &&
          (use_limit_month ? ticket_num <= use_limit_month - month_usage : true)
        );
      });
      this.logger.infoSave("根据当天及当月出票量限制过滤后", {
        cardListLimit: cardListLimit.map(item => item.card_num)
      });
      // 过滤指定卡
      let cardList = cardListLimit.filter(item => {
        return !item.linkCinemaIds
          ? true
          : item.linkCinemaIds.split(",").some(itemA => itemA == cinemaLinkId);
      });
      this.logger.infoSave("根据制定影院过滤后的卡列表", {
        cardList: cardList.map(item => item.card_num)
      });
      return cardList;
    } catch (error) {
      this.logger.errorSave("获取可用卡列表异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取当前场次电影信息
  async getMovieInfo(order, filmTypeFlag, matchRuleList) {
    const { appFlag } = this;
    let {
      city_name,
      film_name,
      hall_name,
      show_time,
      cinema_code,
      cinema_name,
      ticket_num
    } = order;
    try {
      // 1、获取城市影院列表
      let allCinemaList = await this.getCityCinemaList();
      if (!allCinemaList) {
        this.logger.errorSave("获取城市影院列表失败");
        return;
      }
      this.logger.infoSave("获取城市影院列表成功");
      let cinemaList =
        allCinemaList?.map(item => item.cinemaList)?.flat() || [];
      console.log("获取全部影院列表返回", cinemaList);
      if (!cinemaList?.length) {
        this.logger.infoSave("获取全部影院列表失败", { allCinemaList });
        return;
      }
      // 2、获取目标影院
      let targetCinema = cinemaList.find(
        item => cinema_code && item.cinemaCode === cinema_code
      );
      if (!targetCinema) {
        targetCinema = getTargetCinemaCommon({
          app_name: appFlag,
          plat_cinema_code: cinema_code,
          cinema_list: cinemaList
        });
      }
      if (!targetCinema) {
        this.logger.errorSave("获取目标影院失败", {
          cinemaList,
          cinema_code,
          cinema_name,
          app_name: appFlag,
          city_name
        });
        return;
      }
      // 3、获取影院放映信息用于拿会员价
      const { cinemaLinkId } = targetCinema;
      const movie_data = await this.getMoviePlayInfo({
        cinemaLinkId
      });
      this.logger.infoSave("获取影院放映列表结束");
      // 4、获取目标影片信息
      let movieInfo = getMovieInfoFromFilmName({
        filmName: film_name,
        movieData: movie_data?.map(item => ({
          ...item,
          filmName: item.filmName
        }))
      });
      if (!movieInfo) {
        console.warn("获取目标影片信息失败", movie_data, film_name);
        this.logger.errorSave("获取目标影片信息失败", {
          film_name,
          movie_data: movie_data?.map(item => ({
            filmName: item.filmName,
            filmId: item.filmId,
            filmVersion: item.filmVersion // 2D、3D
          }))
        });
        return;
      }
      console.log("movieInfo", movieInfo, film_name);
      // 5、获取目标影片的放映日期
      const { filmId } = movieInfo;
      const playDateList = await this.getMoviePlayDate({
        cinemaLinkId,
        filmId
      });
      let targetShowInfo = playDateList?.find(item =>
        item.schedules?.some(
          itemA => +new Date(+itemA.showTime) === +new Date(show_time)
        )
      );
      this.logger.infoSave("获取影片场次列表结束");
      // 获取某个放映日期的场次列表
      const showList = targetShowInfo?.schedules || [];
      // 解决同一时间多场次问题
      let targetShowList = showList.filter(
        itemA => +new Date(+itemA.showTime) === +new Date(show_time)
      );
      let targetShow = targetShowList[0];
      if (targetShowList.length > 1) {
        targetShowList = targetShowList.map(item => {
          const repeatedCharsResult = findMostRepeatedChars(
            item.hallName,
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
        console.error("匹配影片放映场次失败", showList, show_time);
        this.logger.errorSave("匹配影片放映场次失败", {
          playDateList: playDateList?.map(item => ({
            schedules: item.schedules?.map(itemA => ({
              showTime: itemA.showTime,
              hallName: itemA.hallName
            }))
          })),
          show_time
        });
        return;
      }
      this.logger.infoSave("获取电影放映信息从而获取会员价", { targetShow });
      if (filmTypeFlag && targetShow.filmVersion) {
        // 校验电影格式，减少后续接口请求
        let filmType = targetShow.filmVersion.toUpperCase();
        if (
          !matchRuleList.some(item =>
            item.film_type?.some(itemA => filmType.includes(itemA))
          )
        ) {
          return {
            filmTypeCheckFail: true,
            filmType
          };
        }
      }
      const { hallId, scheduleId, scheduleKey } = targetShow;
      const areaRes = await this.getSeatLayout({
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey
      });
      let { seats: seatList, areaInfos: areaInfoList } = areaRes || {};
      if (!areaInfoList?.length || !seatList.length) {
        this.logger.errorSave("获取座位布局信息异常");
        return;
      }
      this.logger.infoSave("获取座位布局相关信息", { areaInfoList });
      // 座位分区从高到低排序
      let areaList = areaInfoList
        .map(item => {
          let settlePrice = item.areaPrice || 0 + (item.sareaServiceFee || 0);
          return {
            ...item,
            settlePrice
          };
        })
        .sort((a, b) => b.settlePrice - a.settlePrice);
      let maxSeatPrice,
        seatIds = [];
      for (let index = 0; index < areaList.length; index++) {
        const item = areaList[index];
        let curAreaId = item.areaId;
        // 判断当前座位id是否还有空余座位
        let targetSeatList = seatList.filter(
          itemA => itemA.areaId == curAreaId && itemA.status == "1"
        );
        if (targetSeatList.length) {
          maxSeatPrice ||= item.settlePrice;
          seatIds = [
            ...seatIds,
            ...targetSeatList.slice(0, ticket_num - seatIds.length)
          ];
        }
        if (seatIds.length == ticket_num) {
          break;
        }
      }
      this.logger.infoSave("获取座最贵座位id", {
        maxSeatPrice,
        seatIds: JSON.parse(JSON.stringify(seatIds))
      });
      const cardList = await this.getCanUseCardList({
        ticket_num,
        app_name: appFlag,
        cinemaLinkId
      });
      // 赋值到this上是为了其它地方好用
      this.cardList = cardList || [];
      seatIds = seatIds.map(item => item.seatId);
      // try {
      //   // 过滤出来未售座位然后计算分区剩余座位占比，1-未售
      //   let seatList = seat_data.filter(item => item.status === 1);

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
      // 从这里获取真实会员价
      const orderInfoRes = await this.getOptimalCardQuanCompose({
        cinemaLinkId,
        hallId,
        scheduleId,
        scheduleKey,
        seatIds: seatIds.join("|")
      });
      let activities = orderInfoRes?.privileges || [];
      console.warn("activities", activities);
      let member_discount_list = activities.filter(
        item => item.cardInfos?.length
      );
      // 从小到大排序
      member_discount_list = member_discount_list.sort(
        (a, b) => a.privilegeTotalPrice - b.privilegeTotalPrice
      );
      let member_total_price = member_discount_list[0]?.privilegeTotalPrice;
      if (maxSeatPrice) {
        maxSeatPrice = maxSeatPrice * ticket_num;
      }
      if (member_total_price) {
        maxSeatPrice = member_total_price;
        this.logger.infoSave("从优惠活动获取真实会员价", {
          member_total_price,
          member_discount_list
        });
      } else {
        console.warn("获取真实会员价异常");
        this.logger.infoSave("获取真实会员价不存在");
      }
      return {
        ...targetShow,
        cinemaLinkId,
        maxSeatPrice
      };
    } catch (error) {
      this.logger.errorSave("获取当前场次电影信息异常", {
        error: formatErrInfo(error)
      });
    }
  }
  // 获取用卡购票价格信息
  async getOptimalCardQuanCompose(data) {
    const { appFlag } = this;
    let { cinemaLinkId, hallId, scheduleId, scheduleKey, seatIds, session_id } =
      data;
    let targetLoginList = getCinemaLoginInfoList().filter(
      item =>
        item.app_name === appFlag &&
        item.mobile &&
        item.session_id &&
        item.member_pwd
    );
    if (!session_id) {
      session_id = targetLoginList[0].session_id;
    }
    let params = {
      empCode: "",
      leaseCode: "",
      cinemaLinkId,
      hallId,
      scheduleId,
      scheduleKey,
      seatIds,
      umeToken: session_id
    };
    try {
      console.log("获取用卡购票价格信息参数", params);
      const res = await this.appApi.getCardQuanList(params);
      console.log("获取用卡购票价格信息返回", res);
      let orderInfo = res.bizValue;
      this.logger.infoSave("报价前获取用卡购票价格信息返回", {
        privileges: orderInfo?.privileges,
        params
      });
      let activities = orderInfo?.privileges || [];
      // 系统可用卡列表
      let canUseCardNumList = this.cardList.map(item => item.card_num);
      let member_discount_list = activities.filter(
        item =>
          item.cardInfos?.length &&
          item.cardInfos.some(itemC =>
            canUseCardNumList?.includes(itemC.cardNumber)
          )
      );
      let inx = targetLoginList.findIndex(
        item => item.session_id == session_id
      );
      if (!member_discount_list.length && inx != targetLoginList.length - 1) {
        session_id = targetLoginList[inx + 1].session_id;
        this.logger.infoSave(
          "根据用卡购票价格信息获取真实会员价返回空，换号重新获取",
          { session_id }
        );
        return await this.getOptimalCardQuanCompose({
          ...data,
          session_id
        });
      }
      return orderInfo;
    } catch (error) {
      this.logger.errorSave("获取用卡购票价格信息返回异常", {
        error: formatErrInfo(error)
      });
    }
  }
  // 获取影院放映列表
  async getMoviePlayInfo({ cinemaLinkId }) {
    try {
      let params = {
        empCode: "",
        leaseCode: "",
        cinemaLinkId,
        posterSize: "SMALL"
      };
      console.log("获取影院放映列表参数", params);
      const res = await this.appApi.getMoviePlayInfo(params);
      let fimlList = res?.bizValue || [];
      // [

      //     {
      //         "actors": "宋佳,钟楚曦,章宇",
      //         "directors": "邵艺辉",
      //         "filmId": "001104702024",
      //         "filmName": "好东西",
      //         "filmVersion": "2D",
      //         "introduction": "爱逞强的单亲妈妈王铁梅（宋佳 饰）带小孩王茉莉（曾慕梅 饰）搬到新家，结识了所谓清醒恋爱脑的邻居小叶（钟楚曦 饰）。两位性格迥异的女性，一个坚强，一个柔软，一个擅长给人当妈，一个擅长随时撒谎。面对旧创伤和新挑战，她们彼此温暖互相慰藉。\r\n     而围绕王铁梅的两个男人，前夫（赵又廷 饰）不时“添乱”，女儿的鼓手老师（章宇 饰）似乎充满新的可能。作为已经觉醒的女人们和学习过性别议题的男人们，会遇到什么新问题？会如何看待自己和世界？",
      //         "poster": "https://gw.alicdn.com/bao/uploaded/i1/O1CN01c2Josl22fq5URZwAm_!!6000000007148-0-alipicbeacon.jpg_300x300.jpg",
      //         "privilegeTags": [
      //             {
      //                 "shortActivityTag": "惠"
      //             }
      //         ],
      //         "rating": "9.7",
      //         "showDate": "1732204800000",
      //         "showStatus": "SHOWING"
      //     },
      // ]
      console.log("获取影院放映列表返回", fimlList);
      // this.logList.push({
      //   opera_time: getCurrentTime(),
      //   des: "获取影院放映列表返回",
      //   level: "info",
      //   info: {
      //     fimlList
      //   }
      // });
      return fimlList;
    } catch (error) {
      this.logger.errorSave("获取影院放映列表异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取电影放映场次
  async getMoviePlayDate({ cinemaLinkId, filmId }) {
    try {
      let params = {
        empCode: "",
        leaseCode: "",
        cinemaLinkId
      };
      console.log("获取电影放映日期参数", params, filmId);
      const res = await this.appApi.getMoviePlayDate(params);
      console.log("获取电影放映日期返回", res);
      let films = res?.bizValue?.films || [];
      let filmDates = films.find(item => item.filmId === filmId)?.dates || [];
      console.log("filmDates", filmDates);
      if (!filmDates.length) {
        this.logger.infoSave("获取电影放映日期失败", {
          films: films?.map(item => ({
            filmId: item.filmId,
            datesLength: item.dates?.length
          }))
        });
      }
      return filmDates;
    } catch (error) {
      this.logger.errorSave("获取电影放映日期异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取城市影院列表
  async getCityCinemaList() {
    try {
      let params = {
        empCode: "",
        leaseCode: ""
      };
      console.log("获取城市影院列表参数", params);
      const res = await this.appApi.getCinemaList(params);
      console.log("获取城市影院列表返回", res);
      let list = res.bizValue?.cities || [];
      // 通过排查以往ume系列订单，发现cinemaCode和cinemaLinkId值并不一样，故此处先不赋同值
      list = list.map(item => ({
        cityName: item.cityName,
        cinemaList: item.cinemas.map(itemA => ({
          ...itemA,
          cinemaId: itemA.cinemaLinkId
        }))
      }));
      // this.logList.push({
      //   opera_time: getCurrentTime(),
      //   des: "获取城市影院列表返回",
      //   level: "info",
      //   info: {
      //     list
      //   }
      // });
      // [
      //     {
      //         "alphabet": "KUNMING",
      //         "cinemas": [
      //             {
      //                 "address": "盘龙区北京路延长线北辰财富中心E栋4楼",
      //                 "cinemaLinkId": "10106",
      //                 "cinemaName": "昆明北辰财富中心影院（昆明中永影视）"
      //             }
      //         ],
      //         "cityCode": "530100",
      //         "cityName": "昆明",
      //         "firstLetter": "K"
      //     }
      // ]
      return list;
    } catch (error) {
      this.logger.errorSave("获取城市影院列表异常", {
        error: formatErrInfo(error)
      });
    }
  }
}

// 测试报价实例的方法
window.h5UmeOfferObj = (plat_name, app_name) => {
  return new getUmeOfferPrice({ appFlag: app_name, plat_name });
};
// 测试方法
// window.h5UmeOfferObj("mayi", "hsmzyc").getMemberPrice({
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
