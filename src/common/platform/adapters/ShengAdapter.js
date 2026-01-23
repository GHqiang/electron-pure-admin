// 省APP平台适配器
// 实现省APP平台特定的API调用和参数转换逻辑

import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import shengApi from "@/api/sheng-api.js";
// 平台toke列表
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();

/**
 * 省APP平台适配器
 */
export default class ShengAdapter extends BasePlatformAdapter {
  /**
   * 构造函数
   * @param {Logger} logger - 日志实例
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(logger, isTestOrder = false) {
    super("sheng", shengApi, logger, isTestOrder);
  }

  /**
   * 获取待报价订单列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Array>} 订单列表
   */
  async fetchOrderList(params = {}) {
    try {
      const res = await this.api.queryStayOfferList({
        supplierCode: tokens.shengToken,
        status: "0", // 0待报价订单，1已报价订单
        page: 1, // 1页20条
        ...params
      });
      return res?.data?.rows || [];
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
      const params1 = {
        page: 1,
        status: "2", // 2表示未接单的订单
        supplierCode: tokens.shengToken,
        ...params
      };
      const params2 = {
        page: 1,
        status: "5", // 5表示已接单的订单
        supplierCode: tokens.shengToken,
        ...params
      };

      const [res1, res2] = await Promise.allSettled([
        this.api.stayTicketingList(params1),
        this.api.stayTicketingList(params2)
      ]);

      const list1 = res1.status === "fulfilled" ? res1.value?.data?.rows || [] : [];
      const list2 = res2.status === "fulfilled" ? res2.value?.data?.rows || [] : [];

      // 合并两个列表并去重
      const combinedList = [...list1, ...list2];
      const list = combinedList.filter((item, index, self) => {
        return index === self.findIndex(t => t.code === item.code);
      });

      return list;
    } catch (error) {
      this.logger.errorSave("获取待出票订单列表异常", { error });
      return [];
    }
  }

  /**
   * 确认接单（省APP平台需要确认接单）
   * @param {Object} _order - 订单信息
   * @returns {Promise<Object>} 接单结果
   */
  async doConfirmOrder(_order) {
    // 省APP平台需要确认接单，但旧实现中没有相关逻辑
    // 如果需要实现，可以在这里添加
    return { msg: "确认接单功能待实现" };
  }
}
