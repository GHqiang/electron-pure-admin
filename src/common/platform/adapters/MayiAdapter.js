// 蚂蚁平台适配器
// 实现蚂蚁平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import mayiApi from "@/api/mayi-api.js";

/**
 * 蚂蚁平台适配器
 */
export default class MayiAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("mayi", mayiApi, logger, isTestOrder);
  }

  /**
   * 获取待报价订单列表
   * 兼容接口返回 res.data / res.records / res 为数组的情况
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchOrderList(params = {}) {
    try {
      const res = await this.api.queryStayOfferList(params);
      const list = res?.data ?? res?.records ?? (Array.isArray(res) ? res : []);
      if (!list?.length) {
        this.logger.infoSave("蚂蚁获取待报价订单列表为空", {
          hasRes: !!res,
          keys: res && typeof res === "object" ? Object.keys(res) : []
        });
      }
      return list;
    } catch (error) {
      this.logger.errorSave("获取待报价订单列表异常", {
        error,
        tip: "请检查队列管理页是否已设置蚂蚁的「平台Token」「平台子Token」「平台userUUID」并保存后重新一键启动"
      });
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
}
