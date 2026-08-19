/**
 * 金逸报价管理模块
 *
 * 职责：
 * - 继承 BaseOfferPrice 基类，实现金逸系列报价逻辑
 * - 报价规则匹配、会员价获取、成本价计算、最终报价计算
 *
 * 所属流程：报价流程
 *
 * 依赖模块：
 * - BaseOfferPrice: 报价基类，提供模板方法
 * - CardQuanManage: 卡券管理模块
 * - CinemaManage: 影院管理模块
 * - SeatManage: 座位管理模块
 *
 * @module jinyi/offerManage
 */
import {
  getCurrentDay,
  offerRuleMatch,
  calcCount,
  roundToHalf,
  formatErrInfo,
  isDateInCurrentMonth,
  getCinemaLoginInfoList,
  calculateMarkup
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import {
  GROUP_LIST,
  TEST_NEW_PLAT_LIST,
  ONE_STEP_PLAT_LIST
} from "@/common/constant.js";
import { getPlatFeeRate } from "../common/offerHelper";
import { mulDecimal } from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
import Logger from "@/common/logger.js";
import BaseOfferPrice from "@/common/core/BaseOfferPrice.js";
import { filterFixedRulesByDailyTicketCount } from "../../commonQuanStock.js";
import CardQuanManage from "./cardQuanManage";
import CinemaManage from "./cinemaManage";
import SeatManage from "./seatManage";
import OrderManage from "./orderManage";
const {
  userInfo: { rule, user_id }
} = platTokens();

/** 锁座取会员价时，最贵座位候选上限 */
const MAX_SEAT_CANDIDATE_COUNT = 10;
/** 默认区 area_no，该区座位在其它区重复展示，不宜用于报价锁座 */
const DEFAULT_AREA_NO = 1;

/**
 * 金逸报价管理类
 * 继承 BaseOfferPrice，实现金逸系列报价逻辑
 */
class getJinyiOfferPrice extends BaseOfferPrice {
  constructor({ appFlag, plat_name, isTestOrder }) {
    super({ appFlag, plat_name });
    this.isTestOrder = isTestOrder;
  }

  /**
   * 初始化依赖模块
   * @param {Object} order - 订单信息对象
   */
  initModules(order) {
    this.logger = new Logger({ logType: 1 }); // 日志管理模块
    this.logger.init(order);
    this.cardQuanManage = new CardQuanManage(order, this.logger); // 卡券管理模块
    // 报价场景下，offerRule和currentParamsList可以为undefined
    this.cinemaManage = new CinemaManage(
      order,
      this.logger,
      undefined,
      undefined
    ); // 影院管理模块
    this.seatManage = new SeatManage(order, this.logger); // 座位管理模块
    this.orderManage = new OrderManage(order, this.logger); // 订单管理模块
  }

  // 获取最终匹配的报价规则
  async getEndMatchOfferRule(order) {
    try {
      // 1. 初始规则匹配
      const matchRuleListRes = offerRuleMatch(order, this.logger);
      console.log("初始规则匹配", matchRuleListRes);
      let matchRuleList = matchRuleListRes?.matchRuleList || [];
      // V3 L0：一句话计算路径（过滤/会员价/策略过程收集，最终由基类追加报价段后入库）
      const calcSteps = [`初始匹配命中${matchRuleList?.length || 0}条`];
      if (this.isTestOrder && !matchRuleList?.length) {
        matchRuleList = [
          {
            id: 1671,
            ruleName: "南京测试",
            orderForm: "lieren",
            app_type: "jinyi_applet",
            shadowLineName: "jinyiguangmei",
            includeCityNames: ["无锡"],
            excludeCityNames: [],
            includeCinemaNames: ["金逸影城（光美荟聚IMAX激光店）"],
            includeCinemaCodes: "52_400351",
            excludeCinemaNames: [],
            excludeCinemaCodes: "",
            includeHallNames: [],
            excludeHallNames: [],
            includeFilmNames: ["飞驰人生3"],
            excludeFilmNames: [],
            timeLimit: null,
            quanValue: "",
            offerType: "2",
            weekDay: [],
            seatNum: "",
            memberDay: "",
            status: "1",
            update_time: "2026-03-14 10:26:28",
            user_id: "1",
            user_name: "张三",
            platOfferList: [
              {
                platName: "lieren",
                value: "60"
              }
            ],
            addAmount: "60",
            rule: 2,
            autoUseQuanStatus: "2",
            autoUseQuanPrice: "",
            auto_quan_value: "",
            remark: "测试",
            film_type: [],
            memberPriceRule: "",
            allow_offer_time: "",
            last_used_time: "",
            quanValueList: []
          }
        ];
      }
      if (!matchRuleList?.length) {
        this.logger.infoSave("报价规则匹配后规则为空", {
          error: matchRuleListRes?.error,
          order
        });
        return null;
      }
      matchRuleList = JSON.parse(JSON.stringify(matchRuleList));

      // 2. 电影格式过滤
      const movieInfo = await this.getMovieInfo();
      this.logger.infoSave("获取电影信息", { movieInfo });
      if (!movieInfo) return null;

      matchRuleList = this.filterByFilmType(matchRuleList, movieInfo.show_type);
      calcSteps.push(`电影格式过滤剩${matchRuleList.length}条`);
      if (!matchRuleList.length) {
        this.logger.errorSave("按电影格式存筛选后，报价规则为空", {
          filmType: movieInfo.show_type,
          matchRuleList
        });
        return;
      }

      // 3. 获取最低报价规则
      const endRule = await this.getMinAmountOfferRule(
        matchRuleList,
        order,
        movieInfo,
        calcSteps
      );
      if (!endRule) {
        // 日常固定报价规则
        let fixedAmountRuleList = matchRuleList.filter(
          item => item.offerType === "1" && item.offerAmount
        );
        if (fixedAmountRuleList.length) {
          this.logger.errorSave("按券库存筛选后，报价规则为空", {
            fixedAmountRuleList
          });
        } else {
          this.logger.warnSave("最终匹配到的报价规则为空");
        }
        return null;
      }

      const endRuleCopy = JSON.parse(JSON.stringify(endRule));
      // V3 L0：挂一句话计算路径与命中规则名（BaseOfferQueue 收口入库）
      endRuleCopy.calc_path = calcSteps.join("→");
      endRuleCopy.hit_rule_name = endRule.ruleName || "";
      return endRuleCopy;
    } catch (error) {
      this.logger.errorSave("获取最终匹配报价规则异常", error);
      return null;
    }
  }

  // 按电影类型过滤规则
  filterByFilmType(rules, mediaType) {
    console.log("mediaType", mediaType, rules);
    const filmTypeFlag = rules.some(item => !!item.film_type?.length);
    if (!filmTypeFlag) return rules;

    const filmType = mediaType?.toUpperCase();
    return filmType
      ? rules.filter(item =>
          item.film_type?.length
            ? item.film_type.some(itemA => filmType.includes(itemA))
            : true
        )
      : rules;
  }

  // 成本价逻辑沿用 BaseOfferPrice.getCostPrice 默认实现

  // 计算最终报价
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
      adjustedPrice = this.formatFinalPrice(adjustedPrice, this.plat_name);

      // 5. 超限检查处理
      adjustedPrice = await this.handleOverrunCheck(
        adjustedPrice,
        supplier_max_price,
        offerType
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
      this.logger.error("获取最终报价异常", { error });
      return null;
    }
  }

  // 应用动态调价
  applyDynamicPricing(basePrice, offerList) {
    const adjustPrice = window.localStorage.getItem("adjustPrice");
    if (!adjustPrice) return basePrice;

    // try {
    //   const adjustConfig = JSON.parse(adjustPrice);
    //   const countRes = calcCount(adjustConfig.lierenMachineOfferList || []);

    //   if (countRes.inCount >= adjustConfig.inCount) {
    //     return basePrice + Number(adjustConfig.inPrice);
    //   } else if (countRes.outCount >= adjustConfig.outCount) {
    //     return basePrice - Number(adjustConfig.outPrice);
    //   }
    // } catch (error) {
    //   this.logger.error("动态调价处理异常", error);
    // }
    return basePrice;
  }

  // 应用利润加价(节日)
  applyProfitAddition(price, offerType) {
    if (offerType !== "1" && !GROUP_LIST.includes(this.appFlag)) {
      let profitAddPrice = window.localStorage.getItem("profitAddPrice");
      profitAddPrice = profitAddPrice ? Number(profitAddPrice) : 0;
      this.logger.infoSave(`应用利润加价：${profitAddPrice}`);
      return price + profitAddPrice;
    }
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
  formatFinalPrice(price, plat_name) {
    return price;
  }

  // 超限检查
  handleOverrunCheck(price, supplier_max_price, offerType) {
    if (price > Number(supplier_max_price)) {
      const isOverrunOfferEnabled =
        window.localStorage.getItem("isOverrunOffer") === "1";
      if (!isOverrunOfferEnabled) {
        this.logger.errorSave(
          `最终报价${price}超过平台限价${supplier_max_price}且超限报价关闭`
        );
        return;
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
    this.logger.infoSave("调整最终报价为平台限价", { price });
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
    // 手续费（统一走 getPlatFeeRate，支持守兔按 needInvoice 分档）
    const feeRate = getPlatFeeRate(this.order);
    let shouxufei = mulDecimal(Number(adjustedPrice || 0), feeRate);
    // 奖励费用
    const rewardPrice =
      rewards > 0 ? (adjustedPrice * 100 * rewards) / 10000 : 0;

    // 最大卡券成本（即成本必须低于它才有利润）
    let maxCostPrice =
      (adjustedPrice * 1000 + rewardPrice * 1000 - shouxufei * 1000) / 1000;
    offerRule.maxCostPrice = maxCostPrice;

    // 真实成本(卡券成本+手续费-奖励费用)
    const real_cost_price = (cost_price + shouxufei - rewardPrice).toFixed(2);
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

    // 记录详细计算信息
    this.recordCalculationDetails({
      adjustedPrice,
      cost_price,
      maxCostPrice: offerRule.maxCostPrice,
      rewards,
      feeRate,
      shouxufei,
      rewardPrice,
      real_cost_price,
      expectProfit,
      supplier_max_price
    });

    return adjustedPrice;
  }

  // 记录计算详情
  recordCalculationDetails(details) {
    this.logger.infoSave("jinyi计算报价相关信息", {
      rule_price: `规则计算报价：${details.adjustedPrice}`,
      cardQuanCost: `卡券成本：${details.cost_price}`,
      maxCostPrice: `最大卡券成本（低于该值才有利润）：${details.maxCostPrice}`,
      price: `最终报价：${details.adjustedPrice}`,
      shouxufei: `手续费（最终报价*${Math.round(details.feeRate * 100)}%）：${details.shouxufei}`,
      rewardPrice: `奖励金额（${details.rewards}%）：${details.rewardPrice}`,
      real_cost_price: `真实成本：${details.real_cost_price}`,
      expectProfit: `预计利润：${details.expectProfit}`
    });
  }

  // 获取会员价
  async getMemberPrice({ order, movieData, minAddAmountRule }) {
    try {
      const movieInfo = movieData || (await this.getMovieInfo());
      if (!movieInfo) {
        this.logger.infoSave("获取电影信息失败");
        return -1;
      }

      let { cinema_id, schedule_id, hall_id } = movieInfo;
      // 获取可用卡列表
      const cardList = await this.cinemaManage.getUsableCardList(
        cinema_id,
        order.ticket_num
      );
      this.logger.infoSave("获取到可用卡列表", { cardList });
      if (!cardList.length) return null;
      // this.logger.infoSave("从座位信息获取会员价");
      let useCardMobileList = cardList?.map(item => item.mobile) || [];
      // 获取该影院的可用手机号列表
      const useLoginList = getCinemaLoginInfoList(
        !order?.need_unsplit_login
      ).filter(
        item =>
          item.app_name === order.app_name &&
          item.session_id &&
          useCardMobileList.includes(item.mobile)
      );
      let session_id = useLoginList[0]?.session_id;
      // 从座位信息里获取优惠活动列表
      let seatParams = {
        cinema_id,
        schedule_id,
        hall_id,
        session_id
      };
      const targetSeatRes = await this.seatManage.getSeatLayout(seatParams);
      if (!targetSeatRes?.areaInfoList?.length) {
        this.logger.errorSave("获取座位布局或分区价格为空", {
          hasSeatData: !!targetSeatRes?.seatData?.length
        });
        return null;
      }
      let areaInfoList = targetSeatRes.areaInfoList;
      this.logger.infoSave("获取到座位价格信息列表", {
        areaInfoList
      });
      const max_price = await this.getMaxPriceBySeatInfo({
        areaInfoList,
        order,
        movieInfo,
        cardList,
        session_id
      });
      console.warn("最贵座位max_price", max_price);
      let basePrice;
      if (max_price) {
        basePrice = max_price;
        this.logger.infoSave("最高座位价格当做会员价", {
          basePrice
        });
      } else {
        this.logger.errorSave("未获取到最贵座位价格");
        return;
      }
      // 计算最优折扣
      return this.calculateBestDiscount(cardList, basePrice);
    } catch (error) {
      this.logger.errorSave("获取会员价异常", error);
      return null;
    }
  }

  isSeatAvailable(seat) {
    const status = seat?.status;
    return status == 0 || status === "0";
  }

  isDefaultOfferArea(area) {
    return area?.area_no == DEFAULT_AREA_NO || area?.area_name === "默认区";
  }

  isCoupleArea(areaInfo) {
    return !!areaInfo?.area_name?.includes("情侣");
  }

  normalizeAreaInfoList(areaInfoList) {
    if (!areaInfoList) return [];
    if (Array.isArray(areaInfoList)) return areaInfoList;
    if (typeof areaInfoList === "object") return Object.values(areaInfoList);
    return [];
  }

  getAreaSeatRows(seats) {
    if (!seats || Array.isArray(seats)) return [];
    if (typeof seats !== "object") return [];
    return Object.values(seats).filter(row => Array.isArray(row?.detail));
  }

  isValidSeatForLabel(seat) {
    return (
      seat &&
      seat.row != null &&
      seat.col != null &&
      seat.seat_no != null &&
      this.isSeatAvailable(seat)
    );
  }

  // 获取所有可用相邻情侣座
  getAllCoupleSeats(areaInfo) {
    try {
      const rows = this.getAreaSeatRows(areaInfo?.seats);
      const candidates = [];

      for (const row of rows) {
        const details = row.detail || [];
        const colMap = {};
        details.forEach(seat => {
          colMap[parseInt(seat.col, 10)] = seat;
        });

        const cols = Object.keys(colMap)
          .map(Number)
          .filter(col => !Number.isNaN(col))
          .sort((a, b) => a - b);

        for (let i = 0; i < cols.length; i++) {
          const leftCol = cols[i];
          if (leftCol % 2 === 1) {
            const rightCol = leftCol + 1;
            const leftSeat = colMap[leftCol];
            const rightSeat = colMap[rightCol];
            if (
              this.isValidSeatForLabel(leftSeat) &&
              this.isValidSeatForLabel(rightSeat)
            ) {
              candidates.push([leftSeat, rightSeat]);
            }
          }
        }
      }

      return candidates;
    } catch (error) {
      this.logger.errorSave("获取相邻情侣座异常", error);
      return [];
    }
  }

  formatSeatLabel(area_no, seat) {
    return `${area_no}:${seat.row}:${seat.col}:${seat.seat_no}`;
  }

  areaHasAvailableSeats(areaInfo) {
    if (this.isCoupleArea(areaInfo)) {
      return this.getAllCoupleSeats(areaInfo).length > 0;
    }
    return this.getAreaSeatRows(areaInfo.seats).some(row =>
      row.detail.some(seat => this.isValidSeatForLabel(seat))
    );
  }

  // 从指定分区收集所有可用座位候选（用于锁座失败时换座重试）
  collectSeatsFromArea(areaInfo) {
    const { area_no, seats } = areaInfo;
    if (!area_no || !seats) return [];

    if (!this.isCoupleArea(areaInfo)) {
      const seatlableListArr = [];
      this.getAreaSeatRows(seats).forEach(row => {
        row.detail.forEach(seat => {
          if (this.isValidSeatForLabel(seat)) {
            seatlableListArr.push([this.formatSeatLabel(area_no, seat)]);
          }
        });
      });
      return seatlableListArr;
    }

    return this.getAllCoupleSeats(areaInfo).map(couple =>
      couple.map(seat => this.formatSeatLabel(area_no, seat))
    );
  }

  // 获取最贵座位候选列表（按分区价格从高到低，锁座失败时依次尝试）
  getMaxPriceSeatCandidates(areaInfoList) {
    try {
      const normalized = this.normalizeAreaInfoList(areaInfoList);
      if (!normalized.length) {
        this.logger.errorSave("座位分区列表为空", { areaInfoList });
        return [];
      }

      const sortedAreas = normalized
        .filter(
          item =>
            !this.isDefaultOfferArea(item) &&
            this.getAreaSeatRows(item.seats).length
        )
        .sort((a, b) => Number(b.area_price) - Number(a.area_price));

      if (!sortedAreas.length) {
        this.logger.errorSave("无有效报价座位分区（已排除默认区）", {
          areaCount: normalized.length
        });
        return [];
      }

      const allCandidates = [];
      for (const areaInfo of sortedAreas) {
        if (!this.areaHasAvailableSeats(areaInfo)) continue;

        const areaCandidates = this.collectSeatsFromArea(areaInfo);
        if (!areaCandidates.length) {
          this.logger.infoSave("分区标记有座但未收集到候选座", {
            area_no: areaInfo.area_no,
            area_name: areaInfo.area_name,
            isCouple: this.isCoupleArea(areaInfo)
          });
          continue;
        }

        this.logger.infoSave("收集到分区候选座", {
          area_no: areaInfo.area_no,
          area_name: areaInfo.area_name,
          area_price: areaInfo.area_price,
          count: areaCandidates.length
        });
        allCandidates.push(...areaCandidates);
      }

      const candidates = allCandidates.slice(0, MAX_SEAT_CANDIDATE_COUNT);
      if (!candidates.length) {
        this.logger.errorSave("未收集到任何候选座", {
          areaCount: normalized.length,
          validAreaCount: sortedAreas.length
        });
      } else {
        this.logger.infoSave("最贵座位候选列表", {
          count: candidates.length,
          totalAvailable: allCandidates.length,
          maxPriceSeat: candidates
        });
      }
      return candidates;
    } catch (error) {
      this.logger.errorSave("获取最贵座位异常", error);
      return [];
    }
  }
  // 报价锁座：非最后候选座失败换座；最后候选座允许重试；失败换座不弹全局错误提示
  async lockSeatForOfferPrice(lockSeatParams, isLastCandidate) {
    const offerLockParams = {
      ...lockSeatParams,
      skipRetry: !isLastCandidate,
      silentError: true
    };
    let lockRes = await this.seatManage.lockseatByApp(offerLockParams);
    if (!lockRes?.data?.order_id && isLastCandidate) {
      this.logger.infoSave("最后一个候选座未返回order_id，触发锁座重试");
      lockRes = await this.seatManage.lockseatByApp({
        ...offerLockParams,
        skipRetry: false
      });
    }
    return lockRes;
  }

  // 获取最贵座位价格
  async getMaxPriceBySeatInfo({
    areaInfoList,
    order,
    movieInfo,
    cardList,
    session_id
  }) {
    try {
      const seatCandidates = this.getMaxPriceSeatCandidates(areaInfoList);
      console.warn("最贵座位候选", seatCandidates);
      if (!seatCandidates.length) {
        this.logger.errorSave("未获取到最贵座位候选");
        return;
      }

      const candidateCount = seatCandidates.length;
      for (let i = 0; i < candidateCount; i++) {
        const seatlableList = seatCandidates[i];
        const isLastCandidate = i === candidateCount - 1;
        try {
          const lockSeatParams = {
            cinema_id: movieInfo.cinema_id,
            schedule_id: movieInfo.schedule_id,
            hall_id: movieInfo.hall_id,
            seatCodes: seatlableList,
            plat_name: order.plat_name,
            order_number: order.order_number,
            session_id
          };
          this.logger.infoSave(`尝试锁座第${i + 1}/${candidateCount}个座位`, {
            seatlableList,
            isLastCandidate
          });
          const lockRes = await this.lockSeatForOfferPrice(
            lockSeatParams,
            isLastCandidate
          );
          console.warn("锁座结果lockRes", lockRes);
          let lockOrderId = lockRes?.data?.order_id;
          if (!lockOrderId) {
            const failMsg = isLastCandidate
              ? `第${i + 1}个座位（最后候选）锁座失败`
              : `第${i + 1}个座位锁座失败，尝试下一个候选座`;
            this.logger.infoSave(failMsg, { lockRes, seatlableList });
            continue;
          }
          // session_id对应的手机号
          const targetMobile = getCinemaLoginInfoList(
            !order?.need_unsplit_login
          )?.find(
            item =>
              item.app_name === order.app_name && item.session_id === session_id
          )?.mobile;
          // 手机号对应下的余额最多的卡
          const card_id = cardList.filter(
            item => item.mobile === targetMobile
          )?.[0]?.card_id;
          const calcParams = {
            cinema_id: movieInfo.cinema_id,
            card_id,
            lockOrderId,
            session_id
          };
          this.logger.infoSave("获取锁座价格明细参数", calcParams);
          const calcRes = await this.orderManage.priceCalculation(calcParams);
          let paymentAmount = calcRes?.data?.ticket_total_price;
          let ticket_num = calcRes?.data?.ticket_num;
          if (paymentAmount && ticket_num) {
            return paymentAmount / ticket_num;
          }
        } catch (error) {
          const errMsg = isLastCandidate
            ? `第${i + 1}个座位（最后候选）锁座异常`
            : `第${i + 1}个座位锁座异常，尝试下一个候选座`;
          this.logger.infoSave(errMsg, {
            error: formatErrInfo(error),
            seatlableList
          });
        }
      }
      this.logger.errorSave("所有最贵座位候选锁座均失败");
    } catch (error) {
      console.error("获取最贵座位价格异常", error);
    }
  }
  // 计算最优折扣
  calculateBestDiscount(cardList, basePrice) {
    cardList = cardList.map(item => ({
      ...item,
      card_discount: item.card_discount ? Number(item.card_discount) : 100
    }));

    cardList.sort((a, b) => a.card_discount - b.card_discount);

    const bestCard = cardList[0];
    const discount = bestCard?.card_discount || 100;
    const member_price = (basePrice * 100 * discount) / 10000;

    return {
      real_member_price: basePrice,
      discount,
      member_price: Number(member_price.toFixed(2))
    };
  }
  /**
   * 获取最低报价规则（核心报价策略）
   * @param {Array} ruleList 报价规则列表
   * @param {Object} order 订单信息
   * @param {Object} movieInfo 电影信息
   * @returns {Object} 最优报价规则
   */
  async getMinAmountOfferRule(ruleList, order, movieInfo, calcSteps = []) {
    try {
      console.warn("获取最低报价规则", { ruleList, order, movieInfo });
      // 1. 优先处理会员日报价规则
      const memberDayRules = this.filterMemberDayRules(ruleList);
      if (memberDayRules.length) {
        this.logger.infoSave("命中会员日报价规则");
        calcSteps.push(`会员日规则命中(${memberDayRules[0].offerAmount}元)`);
        return memberDayRules[0];
      }

      // 2. 处理普通报价规则
      const generalRules = this.filterGeneralRules(ruleList);
      let { fixedRules, addAmountRuleList } = this.splitRuleTypes(generalRules);
      if (movieInfo?.show_type && fixedRules.length) {
        let film_type = movieInfo.show_type?.toUpperCase();
        if (film_type) {
          fixedRules = fixedRules.filter(item =>
            item.film_type?.length
              ? item.film_type.some(itemA => film_type.includes(itemA))
              : true
          );
          this.logger.infoSave("根据电影格式过滤后的固定报价规则列表", {
            fixedRules
          });
        }
      }
      // 3. 处理固定报价规则的券库存校验
      const validFixedRules = await this.validateQuanStock({
        rules: fixedRules,
        order,
        movieInfo,
        ticketNum: order.ticket_num
      });
      calcSteps.push(`券库存过滤剩${validFixedRules.length}条`);

      // 4. 处理会员价加价规则
      let bestFixAddRule = null;
      if (addAmountRuleList.length) {
        let minAddAmountRule = addAmountRuleList[0];
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

        let addMountRule = minAddAmountRule.addAmount?.split(";");
        if (addMountRule.length === 1) {
          minAddAmountRule.realAddMount = addMountRule[0];
        } else if (addMountRule.length > 1) {
          minAddAmountRule.addMountRule = addMountRule.slice();
        }

        const memberPriceRes = await this.getMemberPrice({
          order,
          movieData: movieInfo,
          minAddAmountRule
        });
        if (memberPriceRes) {
          if (
            !minAddAmountRule.realAddMount &&
            minAddAmountRule.addMountRule?.length > 1
          ) {
            let realAddMount = this.getRealAddMount({
              real_member_price: memberPriceRes.real_member_price,
              addMountRule: minAddAmountRule.addMountRule
            });
            minAddAmountRule.realAddMount = realAddMount;
          }
          if (minAddAmountRule.realAddMount) {
            bestFixAddRule = this.processAddRule(
              minAddAmountRule,
              memberPriceRes
            );
            calcSteps.push(
              `会员价加价命中(${bestFixAddRule.memberOfferAmount}元)`
            );
          }
        }
      }

      // 5. 处理固定报价规则
      const bestFixedRule = validFixedRules?.[0];
      console.log(
        "bestFixedRule",
        bestFixedRule,
        "bestFixAddRule",
        bestFixAddRule
      );
      // V3 L0：定价策略段（chenxing 模式：仅固定/仅会员/对比取低）
      if (bestFixAddRule && bestFixedRule) {
        calcSteps.push(
          `固定价${bestFixedRule.offerAmount} vs 会员价${bestFixAddRule.memberOfferAmount}，取${
            bestFixAddRule.memberOfferAmount >= bestFixedRule.offerAmount
              ? "固定"
              : "会员"
          }`
        );
      } else if (bestFixAddRule) {
        calcSteps.push(`仅会员价${bestFixAddRule.memberOfferAmount}`);
      } else if (bestFixedRule) {
        calcSteps.push(`仅固定价${bestFixedRule?.offerAmount}`);
      }
      // 6. 对比会员价和固定价
      return this.comparePricingStrategies({
        bestFixAddRule,
        bestFixedRule
      });
    } catch (error) {
      this.logger.errorSave("获取最低报价规则异常", error);
      return null;
    }
  }

  // 获取真实加价金额逻辑沿用 BaseOfferPrice.getRealAddMount 默认实现

  /**
   * 过滤会员日报价规则
   */
  filterMemberDayRules(rules) {
    return rules
      .filter(
        item => item.memberDay && item.offerType === "3" && item.offerAmount
      )
      .sort((a, b) => a.offerAmount - b.offerAmount);
  }

  /**
   * 过滤普通报价规则
   */
  filterGeneralRules(rules) {
    return rules.filter(item => !item.memberDay && item.offerType !== "3");
  }

  /**
   * 拆分规则类型
   */
  splitRuleTypes(rules) {
    return {
      fixedRules: rules
        .filter(item => item.offerType === "1" && item.offerAmount)
        .sort((a, b) => a.offerAmount - b.offerAmount),
      addAmountRuleList: rules
        .filter(item => item.offerType === "2" && item.addAmount)
        .sort((a, b) => a.addAmount - b.addAmount)
    };
  }

  /**
   * 校验券库存，再按日出票券数过滤
   */
  async validateQuanStock({ rules, order, movieInfo, ticketNum }) {
    if (!rules.length) return [];

    const appQuanTypeList = await this.cardQuanManage.getQuanTypeListByApp();
    this.cardQuanManage.syncUpdateQuanStock({
      cinema_id: movieInfo.cinema_id,
      quanTypeList: appQuanTypeList
    });

    if (!appQuanTypeList?.length) return [];
    let validFixedRules = this.applyQuanStockFilter(
      rules,
      appQuanTypeList,
      ticketNum
    );
    if (validFixedRules.length) {
      const useMobileList = getCinemaLoginInfoList(!order?.need_unsplit_login)
        .filter(
          item =>
            item.app_name === order.app_name && item.mobile && item.session_id
        )
        .map(item => item.mobile);
      validFixedRules = await filterFixedRulesByDailyTicketCount({
        fixedAmountRuleList: validFixedRules,
        appQuanTypeList,
        useMobileList,
        order: { app_name: order.app_name, ticket_num: ticketNum },
        logger: this.logger
      });
    }
    return validFixedRules;
  }

  /**
   * 应用券库存过滤
   */
  applyQuanStockFilter(rules, quanTypes, ticketNum) {
    return rules.filter(rule => {
      // 查找是否有目标券可以出的
      return quanTypes.some(
        q =>
          rule.quanValue?.split(",")?.includes(q.quan_value) &&
          q.quan_stock >= ticketNum
      );
    });
  }

  /**
   * 处理加价规则
   */
  processAddRule(addRule, memberPriceRes) {
    const processedRule = { ...addRule };
    processedRule.real_member_price = memberPriceRes.real_member_price;
    processedRule.member_discount = memberPriceRes.discount;
    processedRule.memberCostPrice = memberPriceRes.member_price;
    processedRule.round_member_price = roundToHalf(
      processedRule.memberCostPrice,
      ONE_STEP_PLAT_LIST.includes(this.plat_name) ? 0.1 : 0.5
    );
    processedRule.memberOfferAmount =
      processedRule.round_member_price + Number(processedRule.realAddMount);

    this.recordMemberPriceDetails(processedRule);
    return processedRule;
  }

  /**
   * 记录会员价计算详情
   */
  recordMemberPriceDetails(rule) {
    this.logger.infoSave("会员报价最终信息", {
      real_member_price: `真实会员价：${rule.real_member_price}`,
      member_discount: `会员最小折扣：${rule.member_discount}`,
      memberCostPrice: `会员成本价：${rule.memberCostPrice}`,
      addAmount: `加价金额：${rule.addAmount}`,
      round_member_price: `成本价向上取0.5整数倍:${rule.round_member_price}`,
      memberOfferAmount: `预计报价：${rule.memberOfferAmount}`
    });
  }

  /**
   * 对比定价策略
   */
  comparePricingStrategies({ bestFixAddRule, bestFixedRule }) {
    if (!bestFixAddRule) return bestFixedRule;
    if (!bestFixedRule) return bestFixAddRule;

    if (bestFixAddRule.memberOfferAmount >= bestFixedRule.offerAmount) {
      this.logPriceComparison(bestFixAddRule, bestFixedRule, "固定");
      return bestFixedRule;
    } else {
      this.logPriceComparison(bestFixAddRule, bestFixedRule, "会员");
      return bestFixAddRule;
    }
  }

  /**
   * 记录价格对比日志
   */
  logPriceComparison(addRule, fixedRule, selectedType) {
    this.logger.infoSave(`${selectedType}报价策略选择`, {
      memberOfferAmount: addRule.memberOfferAmount,
      fixedOfferAmount: fixedRule.offerAmount
    });
  }

  /**
   * 获取电影信息
   */
  async getMovieInfo() {
    const buyTicketInfo = await this.cinemaManage.getBuyPrevCinemaInfo({
      flag: 1
    });
    const { targetShow, cinema_id, film_id } = buyTicketInfo || {};
    return buyTicketInfo ? { ...(targetShow || {}), cinema_id, film_id } : null;
  }
}

export default getJinyiOfferPrice;

// 测试报价实例的方法
window.jinyiOfferObj = (plat_name, app_name) => {
  return new getJinyiOfferPrice({
    appFlag: app_name,
    plat_name,
    isTestOrder: true
  });
};

const testOrder = {
  plat_name: "lieren",
  id: "12412221440316515",
  tpp_price: 42,
  supplier_max_price: 39,
  city_name: "无锡",
  cinema_addr: "雨花台区软件大道109号雨花客厅E-PARK北区3层",
  ticket_num: 1,
  cinema_name: "金逸影城（光美荟聚IMAX激光店）",
  hall_name: "7号激光厅",
  film_name: "消失的人",
  show_time: "2026-05-24 10:50:00",
  rewards: 0,
  is_urgent: false,
  cinema_group: "",
  cinema_code: "32035211",
  order_number: "12412221440316515",
  offer_end_time: 1778931000000,
  app_name: "jinyiguangmei"
};

// 获取订单最终报价：
// window.jinyiOfferObj("lieren", "jinyiguangmei").getEndOfferPrice({ order: orderJson, offerList: [] })
