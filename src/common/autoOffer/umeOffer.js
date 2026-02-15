// ume报价逻辑
import {
  getCurrentDay,
  offerRuleMatch,
  getTargetCinemaCommon,
  formatErrInfo,
  roundToHalf,
  isDateInCurrentMonth,
  calculateMarkup,
  getCinemaLoginInfoList,
  getPreviousDay,
  findMostRepeatedChars,
  getMovieInfoFromFilmName
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import {
  GET_UME_LIST,
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST,
  ONE_STEP_PLAT_LIST
} from "@/common/constant.js";
// 获取最终报价信息实体类
import getOfferPriceFun from "./commonOfferHandle.js";
import {
  getQuanTypeListByApp,
  filterFixedRulesByDailyTicketCount
} from "./commonQuanStock.js";
import Logger from "@/common/logger.js";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

class getUmeOfferPrice {
  constructor({ appFlag, plat_name }) {
    // console.log("APP_API_OBJ", APP_API_OBJ, appFlag, plat_name);
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
      } else if (offerRule == "wanxiangh5") {
        let offerExample = getOfferPriceFun({
          appFlag: "wanxiangh5",
          plat_name
        });
        const result = await offerExample.getEndOfferPrice({
          order: { ...order, app_name: "wanxiangh5" },
          offerList
        });
        return { ...result, app_name: "wanxiangh5" };
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
      console.log("开始上传日志");
      this.logger.logUpload();
    }
  }

  // 返回获取最终报价结果
  returnResultHandle({ endPrice, offerRule, order_number }) {
    const { plat_name, appFlag } = this;
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
      let fixedAmountRuleList = matchRuleList.filter(
        item =>
          item.offerType === "1" &&
          item.offerAmount &&
          item.shadowLineName === "wanxiangh5"
      );
      if (fixedAmountRuleList.length) {
        return "wanxiangh5";
      }
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
        filmType = movieInfo.localFilmVersion;
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
      cinemaCode,
      cinemaLinkId,
      session_id,
      page = 1,
      quanData = [],
      logger
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
        coupon_num: item.couponCode,
        endDateTime: item.endDateTime // "2025-10-02 23:59:59"
      }));
    } catch (error) {
      logger.errorSave("连续获取券失败", {
        error: formatErrInfo(error),
        params
      });
      return [];
    }
  }

  // 获取优惠券列表
  async getQuanListByPhone({ cinemaCode, cinemaLinkId, session_id, logger }) {
    try {
      const quanData = await this.continuousGetQuan({
        cinemaCode,
        cinemaLinkId,
        session_id,
        logger
      });
      console.log("quanData", quanData);
      logger.infoSave("连续获取券最终返回", {
        quanData
      });
      return quanData.map(item => ({
        ...item,
        endDateTime: item.endDateTime // "2025-10-02 23:59:59"
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
          cinemaCode: movieInfo.cinemaCode,
          cinemaLinkId: movieInfo.cinemaLinkId
        },
        logger: this.logger
      });

      this.logger.infoSave("根据影院获取券类型列表返回", {
        quanTypeList: appQuanTypeList.map(
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
        if (memberPriceRes === -1) {
          this.logger.infoSave("获取当前场次电影信息失败，直接不报");
          return;
        }

        if (!memberPriceRes) {
          console.warn(
            "最小加价规则获取会员价失败,返回最小固定报价规则",
            mixFixedAmountRule
          );
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
            this.logger.infoSave("获取真实加价金额失败,返回最小固定报价规则", {
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
        console.warn(
          "最小加价规则不存在,返回最小固定报价规则",
          mixFixedAmountRule
        );
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

      this.logger.infoSave("ume计算报价相关信息", {
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
  async getSeatLayout(data) {
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
      console.log("获取座位布局参数", params);
      const res = await this.appApi.getMoviePlaySeat(params);
      console.log("获取座位布局返回", res);
      return res.data;
    } catch (error) {
      this.logger.errorSave("获取座位布局异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取会员价
  async getMemberPrice({ order, movieData, minAddAmountRule }) {
    const { appFlag } = this;
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
        ticketMemberPrice,
        maxSeatPrice = 0,
        mostSeatPrice = 0,
        handlingFee,
        ticketMemberServiceFeeMin = 0,
        activityPrices = []
      } = movieInfo;
      this.logger.infoSave("获取会员价相关信息0", {
        ticketMemberPrice: "会员价：" + ticketMemberPrice,
        maxSeatPrice: "座位最高价：" + maxSeatPrice,
        handlingFee: "真实手续费：" + handlingFee,
        ticketMemberServiceFeeMin: "会员服务费：" + ticketMemberServiceFeeMin,
        activityPrices
      });
      let member_price = Math.max(ticketMemberPrice, maxSeatPrice) / 100;
      if (minAddAmountRule.memberPriceRule == "2") {
        member_price = Math.max(ticketMemberPrice, mostSeatPrice) / 100;
        this.logger.infoSave("报价规则从最多座位价格获取会员价", {
          ticketMemberPrice,
          mostSeatPrice
        });
      }
      if (member_price === 0) {
        // 会员价为0
        this.logger.errorSave("获取会员价为0", {
          ticketMemberPrice,
          maxSeatPrice
        });
        return;
      }
      // 会员价等于真实会员价加手续费加会员服务费
      member_price =
        member_price +
        (Number(handlingFee) + Number(ticketMemberServiceFeeMin)) / 100;
      console.log("获取会员价", member_price);
      // 耀莱暂时不考虑
      if (
        appFlag !== "yaolai" &&
        activityPrices?.length &&
        GET_UME_LIST().includes(appFlag)
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
            : item.linkCinemaIds
                .split(",")
                .some(itemA => itemA == movieInfo.cinemaCode);
        });
        this.logger.infoSave("根据制定影院过滤后的卡列表", {
          cardList: cardList.map(item => item.card_num)
        });
        if (!cardList.length) {
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
        let real_member_price = Number(member_price);
        member_price = discount
          ? (Number(member_price) * 100 * discount) / 10000
          : Number(member_price);
        this.logger.infoSave("获取会员价相关信息1", {
          real_member_price:
            "真实会员价（会员价+手续费+服务费）：" + real_member_price,
          discount: "最小折扣：" + discount,
          cost_member_price:
            "会员成本价（真实会员价*折扣）：" + Number(member_price.toFixed(2))
        });
        return {
          real_member_price,
          member_price: Number(member_price.toFixed(2)),
          discount
        };
      } else {
        console.warn("会员价未负，非会员价");
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
      this.logger.errorSave("获取会员价异常", { error: formatErrInfo(error) });
    }
  }

  // 获取电影信息
  async getMovieInfo(order) {
    const { appFlag } = this;
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
        this.logger.errorSave("获取城市影院列表失败");
        return;
      }
      let cinemaList =
        allCinemaList?.map(item => item.cinemaList)?.flat() || [];
      console.log("获取全部影院列表返回", cinemaList);

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
      const { cinemaCode, cinemaLinkId } = targetCinema;
      const movie_data = await this.getMoviePlayInfo({
        cinemaCode,
        cinemaLinkId
      });
      // 4、获取目标影片信息
      let movieInfo = getMovieInfoFromFilmName({
        filmName: film_name,
        movieData: movie_data?.map(item => ({
          ...item,
          filmName: item.filmName
        }))
      });
      if (!movieInfo) {
        this.logger.errorSave("获取目标影片信息失败", {
          film_name,
          movie_data
        });
        return;
      }
      console.log("movieInfo", movieInfo, film_name);
      // 5、获取目标影片的放映日期
      const { filmUniqueId } = movieInfo;
      let start_day = show_time.split(" ")[0];
      // 获取某个放映日期的场次列表
      const showList = await this.getMoviePlayTime({
        cinemaCode,
        cinemaLinkId,
        filmUniqueId,
        showDate: start_day
      });
      // if (!showList) {
      //   console.warn("获取某个放映日期的场次列表失败");
      //   return;
      // }
      // 解决同一时间多场次问题
      let targetShowList = showList?.filter(
        item => +new Date(item.showDateTime) == +new Date(show_time)
      );
      let targetShow = targetShowList?.[0];
      if (targetShowList?.length > 1) {
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
        this.logger.infoSave("同一时间多场次0", { targetShowList });
      }
      if (!targetShow) {
        this.logger.infoSave("准备根据放映日期上一天来回去放映场次列表(次日)", {
          showList,
          show_time
        });
        const showList1 = await this.getMoviePlayTime({
          cinemaCode,
          cinemaLinkId,
          filmUniqueId,
          showDate: getPreviousDay(start_day)
        });
        // 解决同一时间多场次问题
        let targetShowList = showList1?.filter(
          item => +new Date(item.showDateTime) == +new Date(show_time)
        );
        targetShow = targetShowList?.[0];
        if (targetShowList?.length > 1) {
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
          this.logger.infoSave("同一时间多场次1", {
            targetShowList
          });
        }
        if (!targetShow) {
          this.logger.errorSave("匹配影片放映场次失败", {
            showList1,
            show_time
          });
          return;
        }
      }
      this.logger.infoSave("获取电影放映信息从而获取会员价", {
        targetShow,
        cinemaCode,
        cinemaLinkId
      });
      const areaRes = await this.getSeatLayout({
        cinemaCode,
        cinemaLinkId,
        scheduleId: targetShow?.scheduleId,
        scheduleKey: targetShow?.scheduleKey
      });
      let { seatList: seat_data, areaInfoList } = areaRes || {};
      this.logger.infoSave("获取座位布局相关信息", {
        areaInfoList: JSON.parse(JSON.stringify(areaInfoList))
      });
      let maxSeatPrice, mostSeatPrice;
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
          .sort(
            (a, b) =>
              b.settlePrice +
              Number(b.areaServiceFee) -
              a.settlePrice -
              a.areaServiceFee
          );
        // 复制座位分区最高价
        maxSeatPrice =
          areaList[0].settlePrice + Number(areaList[0].areaServiceFee);
        // 获取最多座位价格
        mostSeatPrice = this.getMostSeatPrice(seat_data, areaList);
      }
      return {
        ...targetShow,
        maxSeatPrice,
        mostSeatPrice,
        cinemaCode,
        cinemaLinkId
      };
    } catch (error) {
      this.logger.errorSave("获取当前场次电影信息异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取最多座位价格
  getMostSeatPrice(seat_data, areaList) {
    try {
      // 过滤出来未售座位然后计算分区剩余座位占比，0-未售
      let seatList = seat_data.filter(item => item.status == 0);

      let areaRatioList = areaList.map(item => {
        return {
          ...item,
          numRatio: Math.floor(
            (seatList.filter(itemA => itemA.areaId == item.areaId).length *
              100) /
              seatList.length
          )
        };
      });
      areaRatioList.sort((a, b) => b.numRatio - a.numRatio);
      this.logger.infoSave("座位分区剩余座位占比情况", { areaRatioList });
      let mostSeatPrice =
        areaRatioList[0].settlePrice + Number(areaRatioList[0].areaServiceFee);
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

  // 获取电影放映信息
  async getMoviePlayInfo(data) {
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
      console.log("获取影院放映列表参数", params);
      const res = await this.appApi.getMoviePlayInfo(params);
      console.log("获取影院放映列表返回", res);
      let fimlList =
        res.data
          ?.map(item => item.fimlList)
          .flat()
          .filter(item =>
            ["SHOWING", "SOON_SHOW_TICKET"].includes(item.showStatus)
          ) || [];
      // this.logList.push({
      //   opera_time: getCurrentTime(),
      //   des: "获取影院放映列表返回",
      //   level: "info",
      //   info: {
      //     fimlList
      //   }
      // });
      return fimlList.map(item => ({
        ...item,
        stillList: null,
        introduction: null,
        poster: null
      }));
    } catch (error) {
      this.logger.errorSave("获取电影放映信息异常", {
        error: formatErrInfo(error)
      });
    }
  }
  // 获取电影放映日期
  async getMoviePlayDate(data) {
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
      console.log("获取电影放映日期参数", params);
      const res = await this.appApi.getMoviePlayDate(params);
      console.log("获取电影放映日期返回", res);
      return res.data || [];
    } catch (error) {
      this.logger.errorSave("获取电影放映日期异常", {
        error: formatErrInfo(error)
      });
    }
  }

  // 获取电影放映场次
  async getMoviePlayTime(data) {
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
      console.log("获取电影放映场次参数", params);
      const res = await this.appApi.getMoviePlayTime(params);
      console.log("获取电影放映场次返回", res);
      // this.logList.push({
      //   opera_time: getCurrentTime(),
      //   des: "获取电影放映场次返回",
      //   level: "info",
      //   info: {
      //     params,
      //     res
      //   }
      // });
      return res.data || [];
    } catch (error) {
      this.logger.errorSave("获取电影放映信息异常", {
        error: formatErrInfo(error)
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
      console.log("获取城市影院列表参数", params);
      const res = await this.appApi.getCinemaList(params);
      console.log("获取城市影院列表返回", res);
      let list = res.data || [];
      list = list.map(item => ({
        ...item,
        cinemaCode: item.cinemaCode
      }));
      return list;
    } catch (error) {
      this.logger.errorSave("获取城市影院列表异常", {
        error: formatErrInfo(error)
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
//   order: {
//     plat_name: "mayi",
//     id: "12412221440316515",
//     tpp_price: 42,
//     supplier_max_price: 39,
//     city_name: "南京",
//     cinema_addr: "雨花台区软件大道109号雨花客厅E-PARK北区3层",
//     ticket_num: 2,
//     cinema_name: "AMG海上明珠影城（南京雨花客厅IMAX店）",
//     hall_name: "1号儿童主题厅",
//     film_name: "“骗骗”喜欢你",
//     film_img:
//       "https://gw.alicdn.com/tfscom/i4/O1CN01e8PcvF1NESAgdEsnM_!!6000000001538-0-alipicbeacon.jpg_120x120.jpg",
//     show_time: "2024-12-22 16:30:00",
//     rewards: 0,
//     is_urgent: false,
//     cinema_group: "AMG海上明珠",
//     cinema_code: 45702,
//     order_number: "12412221440316515",
//     offer_end_time: 1734849690000,
//     app_name: "hsmzyc"
//   }
// });
export default getUmeOfferPrice;
