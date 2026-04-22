// 猎人平台适配器
// 实现猎人平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import lierenApi from "@/api/lieren-api.js";

/**
 * 猎人平台适配器
 */
export default class LierenAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("lieren", lierenApi, logger, isTestOrder);
  }

  /**
   * 获取待报价订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchOrderList(params = {}) {
    try {
      const res = await this.api.queryStayOfferList(params);
      return res?.data || [];
    } catch (error) {
      this.logger.errorSave("获取待报价订单列表异常", { error });
      return [];
    }
  }

  /**
   * 获取待出票订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchTicketOrderList(params = {}) {
    try {
      const res = await this.api.stayTicketingList(params);
      return res?.data || [];
    } catch (error) {
      this.logger.errorSave("获取待出票订单列表异常", { error });
      return [];
    }
  }

  /**
   * 提交报价
   * @param {Object} params - 报价参数
   * @returns {Promise<Object>} 提交结果
   */
  async submitOffer(params, options = {}) {
    const log = this._getLogger(options);
    try {
      log.infoSave("提交报价参数", params);

      if (this.isTestOrder) {
        log.infoSave("测试单暂不进行报价", { params });
        return { code: 1, msg: "测试单" };
      }

      const res = await this.api.submitOffer(params);
      log.infoSave("提交报价返回", res);
      return res;
    } catch (error) {
      log.errorSave("提交报价异常", { error, params });
    }
  }

  /**
   * 确认接单
   * @param {Object} params - 确认接单参数 { order_number: order_number }
   * @returns {Promise<Object>} 确认结果
   */
  async confirmOrder(params, options = {}) {
    const log = this._getLogger(options);
    try {
      log.infoSave("确认接单参数", params);

      if (this.isTestOrder) {
        log.infoSave("测试单暂不进行确认接单", { params });
        return { code: 1, msg: "测试单暂不进行确认接单" };
      }

      const res = await this.api.confirmOrder(params);
      log.infoSave("确认接单返回", res);
      return res;
    } catch (error) {
      log.errorSave("确认接单异常", { error, params });
    }
  }
}
