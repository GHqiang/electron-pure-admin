// 兼容层 - 保持原有接口，逐步迁移到新架构
// 此文件用于向后兼容，确保现有代码可以正常工作

import { offerQueueFactory } from "../../factories/QueueFactory.js";
import LierenOrderFetcher from "../fetchers/LierenOrderFetcher.js";

// 兼容原有的报价队列导出
// 保持原有的 useLierenOffer.js 接口
let lierenOfferQueue = null;
let lierenOrderFetcher = null;

/**
 * 获取猎人报价队列（兼容接口）
 * @returns {BaseOfferQueue} 报价队列实例
 */
export function getLierenOfferQueue() {
  if (!lierenOfferQueue) {
    lierenOfferQueue = offerQueueFactory.getOfferQueue("lieren");
  }
  return lierenOfferQueue;
}

/**
 * 获取猎人订单获取队列（兼容接口）
 * @returns {BaseOrderFetcher} 订单获取实例
 */
export function getLierenOrderFetcher() {
  if (!lierenOrderFetcher) {
    lierenOrderFetcher = new LierenOrderFetcher();
  }
  return lierenOrderFetcher;
}

// 导出兼容的默认实例（保持原有导出方式）
const lierenOfferQueueInstance = getLierenOfferQueue();
const lierenOrderFetcherInstance = getLierenOrderFetcher();

export default {
  lierenOfferQueue: lierenOfferQueueInstance,
  lierenOrderFetcher: lierenOrderFetcherInstance
};
