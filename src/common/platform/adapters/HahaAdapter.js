// 哈哈平台适配器
// 实现哈哈平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import hahaApi from "@/api/haha-api.js";

/**
 * 哈哈平台适配器
 */
export default class HahaAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("haha", hahaApi, logger, isTestOrder);
  }

  /**
   * 获取待报价订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchOrderList(params = {}) {
    try {
      const res = await this.api.queryStayOfferList({
        limit: 200,
        ...params
      });
      return res?.data || [];
    } catch (error) {
      this.logger.errorSave("获取待报价订单列表异常", { error });
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

      // 检查测试订单标志
      if (this.isTestOrder) {
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
   * 获取待出票订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchTicketOrderList(params = {}) {
    try {
      const res = await this.api.stayTicketingList({
        pageNo: 1,
        pageSize: 10,
        total: 0,
        tab: 0,
        type: 1,
        mold: 1,
        ...params
      });
      return res?.data || [];
    } catch (error) {
      this.logger.errorSave("获取待出票订单列表异常", { error });
      return [];
    }
  }

  /**
   * 确认接单（哈哈平台需要确认接单）
   * @param {Object} order - 订单信息
   * @returns {Promise<Object>} 接单结果
   */
  async doConfirmOrder(order) {
    // 哈哈平台需要确认接单，但旧实现中没有相关逻辑
    // 如果需要实现，可以在这里添加
    return { msg: "确认接单功能待实现" };
  }
}
