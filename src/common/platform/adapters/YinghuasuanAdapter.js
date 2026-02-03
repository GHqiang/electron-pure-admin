// 影划算平台适配器
// 实现影划算平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import yinghuasuanApi from "@/api/yinghuasuan-api.js";

/**
 * 影划算平台适配器
 */
export default class YinghuasuanAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("yinghuasuan", yinghuasuanApi, logger, isTestOrder);
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
   * 获取待确认订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchStayConfirmList(params = {}) {
    try {
      const res = await this.api.queryStayConfirmList(params);
      const list = res?.data || [];
      // type:订单类型，invitation表示竞价成功的订单。intention表示意向订单，属于各种承包获得的订单
      return list.filter(item => item.type === "invitation");
    } catch (error) {
      this.logger.errorSave("获取待确认订单列表异常", { error });
      return [];
    }
  }

  /**
   * 确认接单
   * @param {Object} params - 确认接单参数 { type: "invitation", in_id: xxx }
   * @returns {Promise<Object>} 确认结果
   */
  async confirmOrder(params) {
    try {
      const res = await this.api.confirmOrder({
        type: "invitation",
        in_id: params.in_id
      });
      return res;
    } catch (error) {
      this.logger.errorSave("确认接单异常", { error, params });
      return { error };
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
    }
  }
}
