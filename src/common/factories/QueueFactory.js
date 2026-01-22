// 队列工厂
// 根据平台名称创建报价队列，根据影院标识创建出票队列

import LierenOfferQueue from "../platform/queues/LierenOfferQueue.js";
import {
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_SFC_APP_LIST
} from "../constant.js";
import createSfcTicketQueue from "../autoTicket/sfcAutoTicket.js";
import createUmeTicketQueue from "../autoTicket/umeAutoTicket.js";
import createCommonTicketQueue from "../autoTicket/commonAutoTicket.js";
import createH5UmeTicketQueue from "../autoTicket/h5umeAutoTicket.js";
import createLmaTicketQueue from "../autoTicket/lmaAutoTicket.js";

/**
 * 报价队列工厂
 */
class OfferQueueFactory {
  constructor() {
    // 报价队列实例缓存
    this.offerQueues = new Map();
    // 报价队列类映射
    this.offerQueueClasses = new Map();

    // 注册已知的报价队列类
    this.registerOfferQueue("lieren", LierenOfferQueue);

    // 其他平台报价队列将在后续阶段注册
    // this.registerOfferQueue("haha", HahaOfferQueue);
    // this.registerOfferQueue("mangguo", MangguoOfferQueue);
    // ...
  }

  /**
   * 注册报价队列类
   * @param {string} platName - 平台名称
   * @param {Class} QueueClass - 报价队列类
   */
  registerOfferQueue(platName, QueueClass) {
    if (!QueueClass) {
      throw new Error(`报价队列类不能为空: ${platName}`);
    }
    this.offerQueueClasses.set(platName, QueueClass);
  }

  /**
   * 创建报价队列
   * @param {string} platName - 平台名称
   * @returns {BaseOfferQueue} 报价队列实例
   */
  createOfferQueue(platName) {
    // 检查缓存
    if (this.offerQueues.has(platName)) {
      return this.offerQueues.get(platName);
    }

    // 获取队列类
    const QueueClass = this.offerQueueClasses.get(platName);
    if (!QueueClass) {
      throw new Error(`不支持的平台报价队列: ${platName}`);
    }

    // 创建实例
    const queue = new QueueClass();

    // 缓存实例
    this.offerQueues.set(platName, queue);

    return queue;
  }

  /**
   * 获取报价队列（如果不存在则创建）
   * @param {string} platName - 平台名称
   * @returns {BaseOfferQueue|null} 报价队列实例
   */
  getOfferQueue(platName) {
    try {
      return this.createOfferQueue(platName);
    } catch (error) {
      console.error(`获取报价队列失败: ${platName}`, error);
      return null;
    }
  }

  /**
   * 清除缓存
   * @param {string} [platName] - 平台名称，如果提供则只清除该平台，否则清除所有
   */
  clearOfferQueueCache(platName = null) {
    if (platName) {
      this.offerQueues.delete(platName);
    } else {
      this.offerQueues.clear();
    }
  }
}

/**
 * 出票队列工厂
 */
class TicketQueueFactory {
  /**
   * 创建出票队列
   * @param {string} appFlag - 影院标识
   * @returns {BaseTicketQueue} 出票队列实例
   */
  createTicketQueue(appFlag) {
    // 根据影院类型创建不同的出票队列
    if (GET_UME_LIST().includes(appFlag)) {
      return createUmeTicketQueue(appFlag);
    } else if (GET_H5_UME_LIST().includes(appFlag)) {
      return createH5UmeTicketQueue(appFlag);
    } else if (appFlag === "lma") {
      return createLmaTicketQueue(appFlag);
    } else if (GET_SFC_APP_LIST().includes(appFlag)) {
      return createSfcTicketQueue(appFlag);
    } else {
      // 统一公共订单执行队列
      return createCommonTicketQueue(appFlag);
    }
  }
}

// 导出单例实例
const offerQueueFactory = new OfferQueueFactory();
const ticketQueueFactory = new TicketQueueFactory();

export { offerQueueFactory, ticketQueueFactory };
export default {
  offerQueueFactory,
  ticketQueueFactory
};
