// 队列工厂
// 根据平台名称创建报价队列，根据影院标识创建出票队列

import LierenOfferQueue from "../platform/queues/LierenOfferQueue.js";
import HahaOfferQueue from "../platform/queues/HahaOfferQueue.js";
import MangguoOfferQueue from "../platform/queues/MangguoOfferQueue.js";
import MayiOfferQueue from "../platform/queues/MayiOfferQueue.js";
import YangcongOfferQueue from "../platform/queues/YangcongOfferQueue.js";
import YinghuasuanOfferQueue from "../platform/queues/YinghuasuanOfferQueue.js";
import ShoutuOfferQueue from "../platform/queues/ShoutuOfferQueue.js";
import MahuaOfferQueue from "../platform/queues/MahuaOfferQueue.js";
import ShengOfferQueue from "../platform/queues/ShengOfferQueue.js";
import ShangzhanOfferQueue from "../platform/queues/ShangzhanOfferQueue.js";

// 获取订单队列
import lierenFetchOrder from "../orderFetch/lierenFetchOrder.js";
import shengFetchOrder from "../orderFetch/shengFetchOrder.js";
import mangguoFetchOrder from "../orderFetch/mangguoFetchOrder.js";
import mayiFetchOrder from "../orderFetch/mayiFetchOrder.js";
import yangcongFetchOrder from "../orderFetch/yangcongFetchOrder.js";
import yinghuasuanFetchOrder from "../orderFetch/yinghuasuanFetchOrder.js";
import shangzhanFetchOrder from "../orderFetch/shangzhanFetchOrder.js";
import hahaFetchOrder from "../orderFetch/hahaFetchOrder.js";
import shoutuFetchOrder from "../orderFetch/shoutuFetchOrder.js";
import mahuaFetchOrder from "../orderFetch/mahuaFetchOrder.js";

/**
 * 报价队列工厂
 */
class OfferQueueFactory {
  constructor() {
    // 报价队列实例缓存
    this.offerQueues = new Map();
    // 报价队列类映射
    this.offerQueueClasses = new Map();

    // 注册所有平台的报价队列类
    this.registerOfferQueue("lieren", LierenOfferQueue);
    this.registerOfferQueue("haha", HahaOfferQueue);
    this.registerOfferQueue("mangguo", MangguoOfferQueue);
    this.registerOfferQueue("mayi", MayiOfferQueue);
    this.registerOfferQueue("yangcong", YangcongOfferQueue);
    this.registerOfferQueue("yinghuasuan", YinghuasuanOfferQueue);
    this.registerOfferQueue("shoutu", ShoutuOfferQueue);
    this.registerOfferQueue("mahua", MahuaOfferQueue);
    this.registerOfferQueue("sheng", ShengOfferQueue);
    this.registerOfferQueue("shangzhan", ShangzhanOfferQueue);
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
   * @param {boolean} isTestOrder - 是否为测试订单模式
   * @returns {BaseOfferQueue} 报价队列实例
   */
  createOfferQueue(platName, isTestOrder = false) {
    // 如果指定了 isTestOrder，不使用缓存，直接创建新实例
    // 因为不同的 isTestOrder 值需要不同的实例
    if (isTestOrder) {
      const QueueClass = this.offerQueueClasses.get(platName);
      if (!QueueClass) {
        throw new Error(`不支持的平台报价队列: ${platName}`);
      }
      return new QueueClass(isTestOrder);
    }

    // 检查缓存（仅对非测试模式使用缓存）
    if (this.offerQueues.has(platName)) {
      return this.offerQueues.get(platName);
    }

    // 获取队列类
    const QueueClass = this.offerQueueClasses.get(platName);
    if (!QueueClass) {
      throw new Error(`不支持的平台报价队列: ${platName}`);
    }

    // 创建实例
    const queue = new QueueClass(isTestOrder);

    // 缓存实例（仅缓存非测试模式的实例）
    this.offerQueues.set(platName, queue);

    return queue;
  }

  /**
   * 获取报价队列（如果不存在则创建）
   * @param {string} platName - 平台名称
   * @param {boolean} isTestOrder - 是否为测试订单模式
   * @returns {BaseOfferQueue|null} 报价队列实例
   */
  getOfferQueue(platName, isTestOrder = false) {
    try {
      return this.createOfferQueue(platName, isTestOrder);
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
 * 获取订单队列工厂
 */
class FetchOrderQueueFactory {
  constructor() {
    // 获取订单队列实例缓存
    this.fetchOrderQueues = new Map();
    // 获取订单队列映射
    this.fetchOrderQueueMap = new Map();

    // 注册所有平台的获取订单队列
    this.registerFetchOrderQueue("lieren", lierenFetchOrder);
    this.registerFetchOrderQueue("sheng", shengFetchOrder);
    this.registerFetchOrderQueue("mangguo", mangguoFetchOrder);
    this.registerFetchOrderQueue("mayi", mayiFetchOrder);
    this.registerFetchOrderQueue("yangcong", yangcongFetchOrder);
    this.registerFetchOrderQueue("yinghuasuan", yinghuasuanFetchOrder);
    this.registerFetchOrderQueue("shangzhan", shangzhanFetchOrder);
    this.registerFetchOrderQueue("haha", hahaFetchOrder);
    this.registerFetchOrderQueue("shoutu", shoutuFetchOrder);
    this.registerFetchOrderQueue("mahua", mahuaFetchOrder);
  }

  /**
   * 注册获取订单队列
   * @param {string} platName - 平台名称
   * @param {Object} fetchOrderQueue - 获取订单队列实例
   */
  registerFetchOrderQueue(platName, fetchOrderQueue) {
    if (!fetchOrderQueue) {
      throw new Error(`获取订单队列不能为空: ${platName}`);
    }
    this.fetchOrderQueueMap.set(platName, fetchOrderQueue);
  }

  /**
   * 获取订单队列（如果不存在则从缓存获取）
   * @param {string} platName - 平台名称
   * @returns {Object|null} 获取订单队列实例
   */
  getFetchOrderQueue(platName) {
    try {
      // 检查缓存
      if (this.fetchOrderQueues.has(platName)) {
        return this.fetchOrderQueues.get(platName);
      }

      // 从映射中获取
      const queue = this.fetchOrderQueueMap.get(platName);
      if (!queue) {
        console.warn(`不支持的平台获取订单队列: ${platName}`);
        return null;
      }

      // 缓存实例
      this.fetchOrderQueues.set(platName, queue);

      return queue;
    } catch (error) {
      console.error(`获取订单队列失败: ${platName}`, error);
      return null;
    }
  }

  /**
   * 清除缓存
   * @param {string} [platName] - 平台名称，如果提供则只清除该平台，否则清除所有
   */
  clearFetchOrderQueueCache(platName = null) {
    if (platName) {
      this.fetchOrderQueues.delete(platName);
    } else {
      this.fetchOrderQueues.clear();
    }
  }
}

// 导出单例实例
const offerQueueFactory = new OfferQueueFactory();
const fetchOrderQueueFactory = new FetchOrderQueueFactory();

export { offerQueueFactory, fetchOrderQueueFactory };
export default {
  offerQueueFactory,
  fetchOrderQueueFactory
};
