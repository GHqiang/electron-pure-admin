/**
 * LMA报价管理模块
 *
 * 职责：
 * - 继承 BaseOfferPrice 基类，实现 LMA 系列报价逻辑
 * - 报价规则匹配、会员价获取、成本价计算、最终报价计算
 *
 * 所属流程：报价流程
 *
 * 依赖模块：
 * - BaseOfferPrice: 报价基类，提供模板方法
 * - LmaCardQuanManage: 卡券管理模块
 * - LmaCinemaManage: 影院管理模块
 * - LmaSeatManage: 座位管理模块
 *
 * @module lma/offerManage
 */
import {
  offerRuleMatch,
  roundToHalf,
  formatErrInfo,
  getCinemaLoginInfoList,
  calcCount,
  getCurrentDay,
  isDateInCurrentMonth,
  calculateMarkup
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import {
  TEST_NEW_PLAT_LIST,
  NO_FEE_PLAT_LIST,
  ONE_STEP_PLAT_LIST
} from "@/common/constant.js";
import { platTokens } from "@/store/platTokens";
import {
  getQuanTypeListByApp,
  filterFixedRulesByDailyTicketCount
} from "../../commonQuanStock.js";
import Logger from "@/common/logger.js";
import BaseOfferPrice from "@/common/core/BaseOfferPrice.js";
import LmaCardQuanManage from "./cardQuanManage.js";
import LmaCinemaManage from "./cinemaManage.js";
import LmaSeatManage from "./seatManage.js";

const tokens = platTokens();

class getLmaOfferPrice extends BaseOfferPrice {
  constructor({ appFlag, plat_name }) {
    super({ appFlag, plat_name });
    this.appApi = APP_API_OBJ[appFlag];
  }

  /**
   * 初始化依赖模块
   * @param {Object} order - 订单信息对象
   * @param {string} order.plat_name - 平台名称
   * @param {string} order.app_name - 影院标识
   * @param {string} order.order_number - 订单号
   */
  initModules(order) {
    this.logger = new Logger({ logType: 1 }); // 日志管理模块
    this.logger.init(order);
    this.cardQuanManage = new LmaCardQuanManage(order, this.logger); // 卡券管理模块
    this.cinemaManage = new LmaCinemaManage(order, this.logger); // 影院管理模块
    this.seatManage = new LmaSeatManage(order, this.logger, false); // 座位管理模块
  }

  /**
   * 获取最终匹配的报价规则
   *
   * @param {Object} order - 待报价订单信息
   * @param {string} order.plat_name - 平台名称
   * @param {string} order.app_name - 影院标识
   * @param {string} order.city_name - 城市名称
   * @param {string} order.cinema_name - 影院名称
   * @param {string|number} order.cinema_code - 影院编码
   * @param {string} order.film_name - 电影名称
   * @param {string} order.hall_name - 影厅名称
   * @param {string} order.show_time - 放映时间，格式：YYYY-MM-DD HH:mm:ss
   * @param {number} order.ticket_num - 票数
   *
   * @returns {Promise<Object|null>} 匹配到的报价规则对象，包含以下字段：
   *   - offerType: 报价类型，"1"=固定报价，"2"=会员价加价，"3"=会员日
   *   - offerAmount: 固定报价金额（offerType="1"时）
   *   - addAmount: 加价金额（offerType="2"时）
   *   - quanValue: 券类型值，多个用逗号分隔（offerType="1"时）
   *   - memberCostPrice: 会员成本价（offerType="2"时）
   *   - memberOfferAmount: 会员预计报价（offerType="2"时）
   *   - real_member_price: 真实会员价（offerType="2"时）
   *   - member_discount: 会员折扣（offerType="2"时）
   *   匹配失败返回 null
   */
  async getEndMatchOfferRule(order) {
    try {
      const matchRuleListRes = offerRuleMatch(order, this.logger);
      let matchRuleList = matchRuleListRes?.matchRuleList || [];
      if (!matchRuleList?.length) {
        this.logger.errorSave("报价规则匹配后规则为空", {
          error: matchRuleListRes?.error,
          order
        });
        return null;
      }
      matchRuleList = JSON.parse(JSON.stringify(matchRuleList));

      // 判断规则里是否有指定电影格式的（2D/3D）
      let filmTypeFlag = matchRuleList.some(item => !!item?.film_type?.length);

      // 获取电影放映信息以匹配电影格式
      let movieInfo = await this.cinemaManage.getMovieInfo(order);
      if (!movieInfo) {
        this.logger.infoSave(
          "报价规则匹配电影格式时获取当前场次电影信息失败，直接不报"
        );
        return null;
      }

      // 校验电影格式，减少后续接口请求
      let filmType = movieInfo.language_type?.split("/")?.[0].toUpperCase();
      if (
        filmTypeFlag &&
        !matchRuleList.some(item =>
          item.film_type?.length
            ? item.film_type.some(itemA => filmType.includes(itemA))
            : true
        )
      ) {
        this.logger.errorSave("过滤完电影格式后匹配报价规则为空", {
          filmTypeFlag,
          filmType,
          movieInfo,
          matchRuleList
        });
        return null;
      }

      this.logger.infoSave("报价规则匹配列表", { matchRuleList });

      // 获取报价最低的报价规则
      let endRule = await this.getMinAmountOfferRule(
        matchRuleList,
        order,
        movieInfo
      );
      console.warn("最终匹配到的报价规则", endRule);
      if (!endRule) {
        this.logger.errorSave("最终匹配到的报价规则为空");
        return null;
      }
      endRule = JSON.parse(JSON.stringify(endRule));
      return endRule;
    } catch (error) {
      this.logger.errorSave("获取最终匹配报价规则异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }
  // 成本价逻辑沿用 BaseOfferPrice.getCostPrice 默认实现

  /**
   * 计算最终报价
   *
   * @param {Object} params - 计算参数
   * @param {number} params.cost_price - 成本价
   * @param {number} params.supplier_max_price - 平台最高限价
   * @param {number} params.price - 规则计算的基础报价
   * @param {number} params.rewards - 奖励百分比（0-100）
   * @param {string} params.offerType - 报价类型
   * @param {Array} [params.offerList] - 历史报价列表（用于动态调价）
   * @param {Object} params.offerRule - 报价规则对象（会被修改，添加 maxCostPrice 字段）
   *
   * @returns {Promise<number|null>} 最终报价金额，计算失败或利润不足返回 null
   */
  async calculateFinalPrice(params) {
    const {
      cost_price,
      supplier_max_price,
      price,
      rewards,
      offerType,
      offerList,
      offerRule
    } = params;

    try {
      // 1. 动态调价处理
      let adjustedPrice = this.applyDynamicPricing(price, offerList);

      // 2. 利润加价处理
      adjustedPrice = this.applyProfitAddition(adjustedPrice, offerType);

      // 3. 夜间顶价处理
      adjustedPrice = this.applyNightMaxPrice(
        adjustedPrice,
        supplier_max_price
      );

      // 4. 价格格式化处理
      adjustedPrice = this.formatFinalPrice(adjustedPrice);

      // 5. 超限检查处理
      adjustedPrice = await this.handleOverrunCheck(
        adjustedPrice,
        supplier_max_price
      );
      if (!adjustedPrice) {
        return null;
      }

      // 6. 成本利润计算
      return this.calculateCostProfit({
        adjustedPrice,
        cost_price,
        rewards,
        supplier_max_price,
        offerRule
      });
    } catch (error) {
      this.logger.errorSave("获取最终报价异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }

  // 应用动态调价
  applyDynamicPricing(basePrice, offerList) {
    const adjustPrice = window.localStorage.getItem("adjustPrice");
    if (!adjustPrice) return basePrice;

    try {
      const adjustConfig = JSON.parse(adjustPrice);
      const lierenMachineOfferList = offerList || [];
      const countRes = calcCount(lierenMachineOfferList);
      const { inCount, outCount, inPrice, outPrice } = adjustConfig;

      if (countRes.inCount && inPrice && countRes.inCount >= inCount) {
        const newPrice = basePrice + Number(inPrice);
        this.logger.infoSave(`动态调价后的价格-${newPrice}, 增加了-${inPrice}`);
        return newPrice;
      } else if (
        countRes.outCount &&
        outPrice &&
        countRes.outCount >= outCount
      ) {
        const newPrice = basePrice - Number(outPrice);
        this.logger.infoSave(
          `动态调价后的价格-${newPrice}, 降低了-${outPrice}`
        );
        return newPrice;
      }
    } catch (error) {
      this.logger.errorSave("动态调价处理异常", error);
    }
    return basePrice;
  }

  // 应用利润加价(节日)
  applyProfitAddition(price, offerType) {
    // LMA系列不使用利润加价（根据原代码逻辑）
    return price;
  }

  // 应用夜间顶价
  applyNightMaxPrice(price, supplier_max_price) {
    const isNightMaxPriceEnabled =
      localStorage.getItem("isOpenisNightMaxPrice") == 1;
    const currentHour = new Date().getHours();

    if (isNightMaxPriceEnabled && currentHour >= 1 && currentHour <= 6) {
      this.logger.infoSave("开启夜间顶价");
      return Number(supplier_max_price);
    }
    return price;
  }

  // 格式化最终价格
  formatFinalPrice(price) {
    return price;
  }

  // 超限检查
  handleOverrunCheck(price, supplier_max_price) {
    if (price > Number(supplier_max_price)) {
      const isOverrunOfferEnabled =
        window.localStorage.getItem("isOverrunOffer") === "1";
      if (!isOverrunOfferEnabled) {
        this.logger.errorSave(
          `最终报价${price}超过平台限价${supplier_max_price}，超限报价处于关闭状态不进行报价`
        );
        return null;
      }

      // 调整价格至平台限价
      return this.adjustToMaxPrice(price, supplier_max_price);
    }
    return price;
  }

  // 调整至平台限价
  adjustToMaxPrice(price, supplier_max_price) {
    if (["mayi", "yangcong"].includes(this.plat_name)) {
      price = Math.floor(supplier_max_price);
    } else {
      price = roundToHalf(
        supplier_max_price,
        ONE_STEP_PLAT_LIST.includes(this.plat_name) ? 0.1 : 0.5,
        "down"
      );
    }
    this.logger.infoSave("调整最终报价为平台限价四舍五入去整");
    return price;
  }

  // 成本利润计算
  calculateCostProfit({
    adjustedPrice,
    cost_price,
    rewards,
    supplier_max_price,
    offerRule
  }) {
    // 手续费
    let shouxufei = (adjustedPrice * 100) / 10000;
    if (NO_FEE_PLAT_LIST.includes(this.plat_name)) {
      shouxufei = 0;
    }

    // 奖励费用
    const rewardPrice =
      rewards > 0 ? (adjustedPrice * 100 * rewards) / 10000 : 0;

    // 出票成本（加手续费）
    let pay_cost_price = cost_price + shouxufei;

    // 最大卡券成本（即成本必须低于它才有利润）
    let maxCostPrice =
      (adjustedPrice * 1000 + rewardPrice * 1000 - shouxufei * 1000) / 1000;
    offerRule.maxCostPrice = maxCostPrice;

    // 真实成本(卡券成本+手续费-奖励费用)
    const real_cost_price = (pay_cost_price - rewardPrice).toFixed(2);

    // 预计利润（最终报价-真实成本）
    const expectProfit = (adjustedPrice - real_cost_price).toFixed(2);

    // 利润校验：使用放大 1000 倍后的整数差值，避免浮点精度问题
    const profitDiff =
      Math.round(Number(adjustedPrice || 0) * 1000) -
      Math.round(Number(real_cost_price || 0) * 1000);
    if (profitDiff <= 0 && !TEST_NEW_PLAT_LIST.includes(this.plat_name)) {
      this.logger.errorSave(
        `最终报价${adjustedPrice}低于真实成本${real_cost_price}`
      );
      return null;
    }

    // 记录详细计算信息（LMA 不使用利润加价，单店加价金额恒为 0）
    this.logger.infoSave("lma计算报价相关信息", {
      rule_price: `规则计算报价：${adjustedPrice}`,
      profitAddPrice: "单店加价金额：0",
      supplier_max_price: `平台最高限价：${supplier_max_price}`,
      cardQuanCost: `卡券成本：${cost_price}`,
      maxCostPrice: `最大卡券成本（低于该值才有利润）：${maxCostPrice}`,
      price: `最终报价：${adjustedPrice}`,
      shouxufei: `手续费（最终报价*1%）：${shouxufei}`,
      cost_price: `出票成本（卡券成本+手续费）：${pay_cost_price}`,
      rewardPrice: `奖励金额(最终报价*奖励百分比-${rewards})：${rewardPrice}`,
      real_cost_price: `真实成本（出票成本-奖励金额）：${real_cost_price}`,
      expectProfit: `预计利润（最终报价-真实成本）：${expectProfit}`
    });

    return adjustedPrice;
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
        // 校验其库存，进行过滤
        let useMobileList = getCinemaLoginInfoList()
          .filter(
            item =>
              item.app_name === order.app_name && item.mobile && item.session_id
          )
          .map(item => item.mobile);
        const appQuanTypeList = await getQuanTypeListByApp({
          order,
          getQuanListByPhone: this.cardQuanManage.getQuanListByPhone.bind(
            this.cardQuanManage
          ),
          logger: this.logger
        });
        this.logger.infoSave("根据影院获取券类型列表返回", {
          quanTypeList: appQuanTypeList?.map(
            ({ quanStockListByPhone, ...item }) => item
          ),
          useMobileList
        });
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
          movieData: movieInfo
        });
        if (memberPriceRes === -1) {
          this.logger.infoSave("获取当前场次电影信息失败，直接不报");
          return null;
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
      return null;
    }
  }

  // 获取真实加价金额逻辑沿用 BaseOfferPrice.getRealAddMount 默认实现

  /**
   * 获取会员价（LMA特殊逻辑：real_member_price >= 33 时使用-5元券）
   *
   * @param {Object} params - 参数对象
   * @param {Object} params.order - 订单信息
   * @param {string} params.order.app_name - 影院标识
   * @param {number} params.order.ticket_num - 票数
   * @param {Object} [params.movieData] - 电影放映信息（可选，不传则内部获取）
   * @param {string} params.movieData.member_price - 会员价（带￥符号）
   * @param {string} params.movieData.price - 非会员价（带￥符号）
   * @param {string|number} params.movieData.cinema_id - 影院ID
   * @param {string|number} params.movieData.session_id - 场次ID
   *
   * @returns {Promise<Object|null|-1>} 会员价信息对象：
   *   - real_member_price: 真实会员价（未折扣）
   *   - member_price: 成本价（已折扣，已考虑-5元券）
   *   - discount: 最小折扣
   *   获取电影信息失败返回 -1，其他失败返回 null
   */
  async getMemberPrice({ order, movieData }) {
    try {
      console.log("准备获取会员价", order, movieData);
      const { ticket_num, app_name } = order;

      // 获取当前场次电影信息，防止接口重复掉
      let movieInfo = movieData;
      if (!movieData) {
        movieInfo = await this.cinemaManage.getMovieInfo(order);
      }
      console.log("待报价订单当前场次电影相关信息", movieInfo);
      if (!movieInfo) {
        console.error("获取当前场次电影信息失败", "不再进行报价");
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
        // 报价时获取座位布局不需要token，但seatManage的方法需要，传空字符串
        const seatInfo = await this.seatManage.getSeatLayout({
          cinema_id,
          show_id,
          lmaToken: ""
        });
        if (!seatInfo || seatInfo.error || !seatInfo.label_arr) return null;
        // seatManage返回的格式是 { seatData, label_arr, short_code }
        const { label_arr: area_price } = seatInfo;
        this.logger.infoSave("获取座位布局相关信息", {
          area_price
        });
        if (area_price?.length) {
          let bigPrice = area_price.sort((a, b) => b.price - a.price)[0].price;
          this.logger.warnSave("取座位分区最高价和会员价的最大值当会员价", {
            member_price,
            bigPrice
          });
          member_price = Math.max(member_price, bigPrice);
        }
      }

      // 服务费已包含在会员价里面了
      console.log("获取会员价", member_price);
      if (member_price <= 0 && nonmember_price) {
        this.logger.warnSave("获取会员价时由于会员价不存在拿非会员价当会员价", {
          nonmember_price
        });
        member_price = Number(nonmember_price);
      }

      // 会员价为0
      if (member_price === 0) {
        this.logger.errorSave("获取会员价为0", {
          member_price,
          nonmember_price
        });
        return null;
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
          cardList: cardList.map(item => item.card_num)
        });

        if (!cardList.length) {
          this.logger.errorSave("影院单卡出票限制，无可用卡", {
            ticket_num,
            cinema_id
          });
          return null;
        }

        cardList = cardList.map(item => ({
          ...item,
          card_discount: !item.card_discount ? 100 : Number(item.card_discount)
        }));
        cardList.sort((a, b) => a.card_discount - b.card_discount);

        // 按最低折扣取值报价
        let discount = cardList[0]?.card_discount;
        let real_member_price = Number(member_price);

        // LMA特殊逻辑：real_member_price >= 33 时使用-5元券
        let lmaIsUseQuanValue = window.localStorage.getItem("lmaIsUseQuan");
        let lmaIsUseQuan = lmaIsUseQuanValue == 1 && real_member_price >= 33;
        if (lmaIsUseQuan) {
          member_price = real_member_price - 5;
        }

        member_price = discount
          ? (Number(member_price) * 100 * discount) / 10000
          : Number(member_price);

        if (lmaIsUseQuan) {
          const quanInfo = await this.cardQuanManage.getQuanInfo(
            "lma-5",
            this.appFlag
          );
          let quan_cost = quanInfo?.quan_cost || 1;
          // 减5券的成本1，不固定
          member_price = Number(member_price) + quan_cost;
        }

        this.logger.infoSave("获取会员价相关信息", {
          real_member_price: "真实会员价：" + real_member_price,
          discount: "最小折扣：" + discount,
          cost_member_price:
            `会员成本价：${lmaIsUseQuan ? "(真实会员价-5）* 折扣 + 1" : "真实会员价*折扣"} :` +
            Number(member_price.toFixed(2))
        });

        return {
          real_member_price, // 真实会员价
          member_price: Number(member_price.toFixed(2)), // 成本价
          discount
        };
      }
    } catch (error) {
      this.logger.errorSave("获取会员价异常", { error: formatErrInfo(error) });
      return null;
    }
  }
}

// 测试报价实例的方法
window.lmaOfferObj = (plat_name, app_name) => {
  return new getLmaOfferPrice({ appFlag: app_name, plat_name });
};
// 获取订单最终报价：
// window.lmaOfferObj("mayi", "lma").getEndOfferPrice({order: orderJson})
export default getLmaOfferPrice;
