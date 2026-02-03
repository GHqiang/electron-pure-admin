// 麻花平台适配器
// 实现麻花平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import mahuaApi from "@/api/mahua-api.js";
import { subDecimal, addDecimal } from "@/utils/utils.js";
import { NO_FEE_PLAT_LIST } from "@/common/constant.js";

/**
 * 麻花平台适配器
 */
export default class MahuaAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("mahua", mahuaApi, logger, isTestOrder);
  }

  /**
   * 获取待报价订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchOrderList(params = {}) {
    try {
      const res = await this.api.queryStayOfferList({
        pageNum: 1,
        pageLimit: 200,
        provName: "",
        cityName: "",
        cinemaName: "",
        movieName: "",
        acceptChangeSeat: "",
        ticketsNum: "",
        minPrice: "",
        maxPrice: "",
        cinemaClassify: [],
        cinemaClassifyOfficial: [],
        ...params
      });
      return res?.rtnData || [];
    } catch (error) {
      this.logger.errorSave("获取待报价订单列表异常", { error });
      return [];
    }
  }

  /**
   * 与旧版 useMahuaOffer.getProfit 一致：计算预计利润，用于 isDirectGetOrder
   */
  _getProfit(offerRule, order) {
    if (!offerRule || !order) return 0;
    const { cost_price, offer_end_amount } = offerRule;
    const { plat_name, rewards = 0, ticket_num } = order;
    let shouxufei = (offer_end_amount * 100) / 10000;
    if (NO_FEE_PLAT_LIST && NO_FEE_PLAT_LIST.includes(plat_name)) {
      shouxufei = 0;
    }
    const rewardPrice =
      rewards > 0 ? (offer_end_amount * 100 * rewards) / 10000 : 0;
    return (
      (subDecimal(
        addDecimal(offer_end_amount, rewardPrice),
        addDecimal(cost_price, shouxufei)
      ) *
        ticket_num)
    );
  }

  /**
   * 提交报价
   * 若 params 为 config 传入的 { order_id, price, offerRule, order }，则转换为接口所需 putOrderId、biddingPrice、isDirectGetOrder
   * @param {Object} params - 报价参数
   * @returns {Promise<Object>} 提交结果
   */
  async submitOffer(params) {
    try {
      let apiParams = params;
      if (
        params &&
        params.order_id != null &&
        params.offerRule != null &&
        params.order != null
      ) {
        apiParams = {
          putOrderId: params.order_id,
          biddingPrice: params.price,
          isDirectGetOrder: 0
        };
        const minGrabProfitValue =
          typeof window !== "undefined"
            ? window.localStorage?.getItem("minGrabProfit")
            : null;
        if (minGrabProfitValue) {
          const expectProfit = this._getProfit(params.offerRule, params.order);
          if (Number(expectProfit) >= Number(minGrabProfitValue)) {
            apiParams.isDirectGetOrder = 1;
          }
        }
      }
      this.logger.infoSave("提交报价参数", apiParams);

      // 检查测试订单标志
      if (this.isTestOrder) {
        this.logger.infoSave("测试单暂不进行报价", { params: apiParams });
        return { code: 1, msg: "测试单" };
      }

      const res = await this.api.submitOffer(apiParams);
      this.logger.infoSave("提交报价返回", res);
      return res;
    } catch (error) {
      this.logger.errorSave("提交报价异常", { error, params });
    }
  }

  /**
   * 获取待出票订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchTicketOrderList(params = {}) {
    try {
      const res = await this.api.stayTicketingList({
        pageNo: 1,
        pageSize: 10,
        tag: "0",
        nowId: "",
        getOrderId: "",
        movieName: "",
        cinemaName: "",
        ...params
      });
      return res?.rtnData || [];
    } catch (error) {
      this.logger.errorSave("获取待出票订单列表异常", { error });
      return [];
    }
  }

  /**
   * 确认接单（麻花平台需要确认接单）
   * @param {Object} _order - 订单信息
   * @returns {Promise<Object>} 接单结果
   */
  async doConfirmOrder(_order) {
    // 麻花平台需要确认接单，但旧实现中没有相关逻辑
    // 如果需要实现，可以在这里添加
    return { msg: "确认接单功能待实现" };
  }
}
