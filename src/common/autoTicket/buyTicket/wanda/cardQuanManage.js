/**
 * 万达卡券管理模块
 *
 * 职责：
 * - 从 Wanda API 获取会员卡、优惠券、活动权益
 * - 根据报价规则选择最优卡/券组合
 * - 返回 merge_payment 所需的 requestInfo
 *
 * @module wanda/cardQuanManage
 */
import { formatErrInfo, getOfferRuleById, subDecimal } from "@/utils/utils";
import { APP_API_OBJ } from "@/common/index";
import {
  getQuanInfoCommon,
  getSortPhoneByQuanTypeListCommon,
  getUsableCardListCommon,
  updateQuanStockCommon
} from "../common/cardQuanHelper";

export default class WandaCardQuanManage {
  constructor(order, logger, orderManage = null) {
    this.order = order;
    this.appFlag = order.app_name;
    this.logger = logger;
    this.appApi = APP_API_OBJ[order.app_name];
    this.usableCardList = [];
    this.curPhone = "";
    this.orderManage = orderManage;
  }

  /**
   * 获取会员卡列表（Wanda card-api）
   */
  async getCardList(loginParams) {
    try {
      const session_id = loginParams?.session_id || "";
      const tid = loginParams?.tid || "";
      const res = await this.appApi.getCardList(
        { category: 1, json: true },
        { data: { wanda_token: session_id, wanda_identifier: tid } }
      );
      const items = res?.data?.res?.items || [];
      this.usableCardList = items.filter(
        item => item.available !== false && item.status === 8
      );
      return this.usableCardList;
    } catch (error) {
      this.logger.errorSave("获取万达会员卡列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 获取可用的会员卡列表（按余额排序）
   */
  getUsableCardList() {
    return this.usableCardList.sort(
      (a, b) => (b.balance || 0) - (a.balance || 0)
    );
  }

  /**
   * 获取优惠券列表（Wanda coupon-api）
   */
  async getQuanList(loginParams) {
    try {
      const session_id = loginParams?.session_id || "";
      const tid = loginParams?.tid || "";
      const res = await this.appApi.getCouponExpireAndEffective(
        { json: true, page: 1, pageSize: 50 },
        { data: { wanda_token: session_id, wanda_identifier: tid } }
      );
      return res?.data?.couponList || [];
    } catch (error) {
      this.logger.errorSave("获取万达优惠券列表异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 获取活动权益（Wanda activity-api）
   */
  async getActivityCoupon({ did, orderId, session_id }) {
    try {
      const res = await this.appApi.getActivityCoupon(
        { did, able: true, orderId },
        { data: { wanda_token: session_id } }
      );
      return res?.data?.res || [];
    } catch (error) {
      this.logger.errorSave("获取万达活动权益异常", {
        error: formatErrInfo(error)
      });
      return [];
    }
  }

  /**
   * 券成本查询（报价阶段用）
   */
  async getQuanInfo(quanValue, appFlag) {
    if (!quanValue) return { quan_cost: 0 };
    return getQuanInfoCommon({
      quan_value: quanValue,
      app_name: appFlag,
      logger: this.logger
    });
  }

  async getSortPhoneByQuanTypeList(appFlag, quan_flag, quan_value, ticket_num) {
    return getSortPhoneByQuanTypeListCommon({
      app_name: appFlag,
      quan_flag,
      quan_value,
      ticket_num
    });
  }

  async updateQuanStock(data) {
    return updateQuanStockCommon(data);
  }

  /**
   * 使用卡券（核心方法）
   * 从 Wanda API 拉取卡券 → 根据 offerRule 选最优 → 返回 merge_payment 的 requestInfo
   *
   * 返回: { card_id?, quan_code?, profit, priceInfo, requestInfo, useQuan? }
   */
  async useQuanOrCard(params) {
    const {
      seatTotalPrice,
      ticket_num,
      supplier_end_price,
      offerRule,
      rewards,
      curPhone,
      session_id,
      cinema_id,
      orderId
    } = params;

    try {
      this.logger.infoSave("万达 useQuanOrCard 入参", {
        offerRule,
        seatTotalPrice,
        ticket_num,
        curPhone
      });

      const offerType = offerRule?.offer_type;

      // ===== 券固定报价 (offerType="1") =====
      if (offerType === "1") {
        // 从 Wanda API 获取可用券列表
        const loginParams = { session_id };
        const [quanList, activityList] = await Promise.all([
          this.getQuanList(loginParams),
          this.getActivityCoupon({ did: orderId, orderId, session_id }).catch(
            () => []
          )
        ]);

        // 合并券+活动，筛选匹配 offerRule.quan_value 的
        const allCoupons = [
          ...quanList.map(q => ({
            ...q,
            source: "coupon",
            code: q.couponCode || q.code
          })),
          ...activityList.flatMap(a =>
            (a.groupItems || []).map(g => ({
              ...g,
              source: "activity",
              code: g.code
            }))
          )
        ];

        const matchedCoupons = allCoupons.filter(c =>
          offerRule.quan_value
            ?.split(",")
            .some(v => (c.code || "").includes(v) || (c.name || "").includes(v))
        );

        if (!matchedCoupons.length) {
          this.logger.errorSave("万达无匹配券", {
            quan_value: offerRule.quan_value
          });
          return null;
        }

        // 选最优券（价格最低 or 折扣最大）
        const bestCoupon = matchedCoupons.sort(
          (a, b) => (Number(a.price) || 0) - (Number(b.price) || 0)
        )[0];

        // 券成本从 svApi 查
        const quanCost = Number(
          (await this.getQuanInfo(offerRule.quan_value, this.appFlag))
            ?.quan_cost || 0
        );
        const profit = subDecimal(
          (Number(supplier_end_price) || 0) * ticket_num,
          quanCost * ticket_num
        );

        this.logger.infoSave("万达选券", { bestCoupon, quanCost, profit });

        if (profit <= 0) return null;

        return {
          quan_code: offerRule.quan_value,
          profit,
          priceInfo: {
            total_price: seatTotalPrice,
            price: seatTotalPrice / (ticket_num || 1)
          },
          requestInfo: {
            selectCoupon: { code: bestCoupon.code, type: bestCoupon.source }
          },
          useQuan: [{ code: bestCoupon.code }]
        };
      }

      // ===== 会员加价 (offerType="2") =====
      const loginParams = { session_id };
      const cards = await this.getCardList(loginParams);

      if (!cards?.length) {
        this.logger.errorSave("万达无可用储值卡");
        return null;
      }

      // 选最优卡（按余额 + 折扣综合评估）
      const bestCard =
        cards
          .filter(c => c.mobile === curPhone || !curPhone)
          .sort(
            (a, b) => (Number(a.discount) || 100) - (Number(b.discount) || 100)
          )[0] || cards[0];

      if (!bestCard) return null;

      const costPrice = offerRule.member_price;

      const finalProfit = subDecimal(
        Number(seatTotalPrice) || 0,
        costPrice * ticket_num
      );

      this.logger.infoSave("万达选卡", {
        bestCard,
        costPrice,
        finalProfit
      });

      if (finalProfit <= 0) return null;

      return {
        card_id: bestCard.cardNo || bestCard.card_id,
        cardNum: bestCard.cardNo,
        profit: finalProfit,
        priceInfo: {
          total_price: costPrice,
          price: costPrice / (ticket_num || 1),
          default_card: true
        },
        requestInfo: {
          selectCards: [{ cardNo: bestCard.cardNo, payAmount: costPrice }]
        }
      };
    } catch (error) {
      this.logger.errorSave("万达 useQuanOrCard 异常", {
        error: formatErrInfo(error)
      });
      return null;
    }
  }
}
