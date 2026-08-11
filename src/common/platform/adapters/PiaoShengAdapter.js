// 票圣平台适配器
// 实现票圣平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import piaoshengApi from "@/api/piaosheng-api.js";
import { subDecimal, addDecimal, mulDecimal } from "@/utils/utils.js";
import { getPlatFeeRate } from "../../autoTicket/buyTicket/common/offerHelper.js";

/**
 * 票圣平台适配器
 */
export default class PiaoShengAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("piaosheng", piaoshengApi, logger, isTestOrder);
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
        pageLimit: 300,
        ...params
      });
      return res?.rtnData || [];
    } catch (error) {
      this.logger.errorSave("获取待报价订单列表异常", { error });
      return [];
    }
  }

  // 接单详情
  async orderDetail(params) {
    try {
      const res = await this.api.queryOrderInfo(params);
      return res?.rtnData;
    } catch (error) {
      this.logger.errorSave("票圣获取接单详情异常", { error });
      return;
    }
  }

  /**
   * 与旧版 useMahuaOffer.getProfit 一致：计算预计利润，用于 isDirectGetOrder
   */
  _getProfit(offerRule, order) {
    if (!offerRule || !order) return 0;
    const { cost_price, offer_end_amount } = offerRule;
    const { rewards = 0, ticket_num } = order;
    // 手续费（统一走 getPlatFeeRate：免手续费名单 + 默认 1%，后续平台分档扩展只改一处）
    const feeRate = getPlatFeeRate(order);
    let shouxufei = mulDecimal(Number(offer_end_amount || 0), feeRate);
    const rewardPrice =
      rewards > 0 ? (offer_end_amount * 100 * rewards) / 10000 : 0;
    return (
      subDecimal(
        addDecimal(offer_end_amount, rewardPrice),
        addDecimal(cost_price, shouxufei)
      ) * ticket_num
    );
  }

  /**
   * 提交报价
   * 若 params 为 config 传入的 { order_id, price, offerRule, order }，则转换为接口所需 putOrderId、biddingPrice、isDirectGetOrder
   * @param {Object} params - 报价参数
   * @param {Object} [options] - 可选，{ logger?: Logger } 传入则使用调用方 logger
   * @returns {Promise<Object>} 提交结果
   */
  async submitOffer(params, options = {}) {
    const log = this._getLogger(options);
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
      log.infoSave("提交报价参数", apiParams);

      if (this.isTestOrder) {
        log.infoSave("测试单暂不进行报价", { params: apiParams });
        return { code: 1, msg: "测试单" };
      }

      const res = await this.api.submitOffer(apiParams);
      log.infoSave("提交报价返回", res);
      return res;
    } catch (error) {
      log.errorSave("提交报价异常", { error, params });
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
        ...params
      });
      return res?.rtnData || [];
    } catch (error) {
      this.logger.errorSave("获取待出票订单列表异常", { error });
      return [];
    }
  }

  /**
   * 确认接单（票圣平台需要确认接单）
   * @param {Object} _order - 订单信息
   * @returns {Promise<Object>} 接单结果
   */
  async doConfirmOrder(_order) {
    // 票圣平台需要确认接单，但旧实现中没有相关逻辑
    // 如果需要实现，可以在这里添加
    return { msg: "确认接单功能待实现" };
  }
}
