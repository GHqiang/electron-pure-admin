// 猎人平台适配器
// 实现猎人平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import lierenApi from "@/api/lieren-api.js";
import Logger from "../../logger.js";

// 标记测试订单状态（用于测试模式）
let isTestOrder = false;

/**
 * 猎人平台适配器
 */
export default class LierenAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   */
  constructor(logger) {
    super("lieren", lierenApi, logger);
    this.isTestOrder = false;
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
  async submitOffer(params) {
    try {
      this.logger.infoSave("提交报价参数", params);

      // 检查全局测试订单标志
      if (isTestOrder || this.isTestOrder) {
        this.logger.infoSave("测试单暂不进行报价", { params });
        return { code: 1, msg: "测试单" };
      }

      const res = await this.api.submitOffer(params);
      this.logger.infoSave("提交报价返回", res);
      return res;
    } catch (error) {
      this.logger.errorSave("提交报价异常", { error, params });
      throw error;
    }
  }

  /**
   * 确认接单（猎人平台无需确认接单）
   * @param {Object} order - 订单信息
   * @returns {Promise<Object>} 接单结果
   */
  async doConfirmOrder(order) {
    // 猎人平台无需确认接单
    return { msg: "无需确认接单" };
  }
}
