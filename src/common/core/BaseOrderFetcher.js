// 订单获取基类
// 提取所有平台订单获取的公共逻辑

import { mockDelay } from "@/utils/utils.js";
import Logger from "../logger.js";

/**
 * 订单获取基类
 * 所有平台订单获取都应继承此类
 */
export default class BaseOrderFetcher {
  /**
   * 构造函数
   * @param {Object} platformAdapter - 平台适配器实例
   * @param {string} platName - 平台名称
   * @param {boolean} isTestOrder - 是否为测试订单模式
   */
  constructor(platformAdapter, platName, isTestOrder = false) {
    this.platformAdapter = platformAdapter;
    this.platName = platName;
    this.isTestOrder = isTestOrder;
    this.isRunning = false;
    this.orderRecord = [];
    this.platOrderList = [];
    this.logger = new Logger({ logType: 2 });
  }

  /**
   * 启动队列
   */
  async start() {
    console.warn("启动订单自动获取队列");
    this.isRunning = true;
    this.orderRecord = [];
    this.platOrderList = [];

    while (this.isRunning) {
      await mockDelay(5);
      await this.fetchOrders();
    }
  }

  /**
   * 获取订单（子类实现）
   * @returns {Promise<void>}
   */
  async fetchOrders() {
    throw new Error(`平台 ${this.platName} 未实现 fetchOrders 方法`);
  }

  /**
   * 发送新订单消息
   * @param {Object} order - 订单信息
   */
  async sendNewOrderMsg(order) {
    try {
      // 动态生成事件名称
      const eventName = `newOrder_${order.appName}`;
      const newOrderEvent = new CustomEvent(eventName, {
        detail: order
      });

      // 测试模式下，不发送事件
      if (!this.isTestOrder) {
        window.dispatchEvent(newOrderEvent);
      }

      this.logger.infoSave("发送新订单消息", { order, eventName });
    } catch (error) {
      this.logger.errorSave("发送新订单消息异常", { error, order });
    }
  }

  /**
   * 过滤新订单
   * @param {Array} orderList - 订单列表
   * @returns {Array} 过滤后的新订单列表
   */
  filterNewOrders(orderList) {
    return orderList.filter(item => {
      return !this.orderRecord.some(
        itemA =>
          itemA.plat_name === item.plat_name &&
          itemA.order_number === item.order_number
      );
    });
  }

  /**
   * 记录订单
   * @param {Object} order - 订单信息
   */
  recordOrder(order) {
    this.orderRecord.push(order);

    // 限制记录数量，防止内存溢出
    if (this.orderRecord.length > 50) {
      this.orderRecord.shift();
    }
  }

  /**
   * 记录平台订单
   * @param {Array} orderList - 订单列表
   */
  recordPlatformOrders(orderList) {
    if (orderList.length) {
      this.platOrderList.push(...orderList);
      const length = this.platOrderList.length;

      if (length > 100) {
        this.platOrderList = this.platOrderList.slice(-100);
      }
    }
  }

  /**
   * 停止队列运行
   */
  stop() {
    this.isRunning = false;
    console.warn("主动停止订单自动获取队列");
  }

  /**
   * 获取待出票订单列表（子类实现）
   * @returns {Promise<Array>} 订单列表
   */
  async getStayTicketList() {
    throw new Error(`平台 ${this.platName} 未实现 getStayTicketList 方法`);
  }
}
