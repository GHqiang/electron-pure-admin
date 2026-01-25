// QueueFactory 测试文件
// 测试队列工厂的功能

import { offerQueueFactory } from "../../factories/QueueFactory.js";
import LierenOfferQueue from "../../platform/queues/LierenOfferQueue.js";

describe("OfferQueueFactory", () => {
  beforeEach(() => {
    // 清除缓存
    offerQueueFactory.clearOfferQueueCache();
  });

  test("应该能够创建报价队列实例", () => {
    const queue = offerQueueFactory.createOfferQueue("lieren");

    expect(queue).toBeDefined();
    expect(queue instanceof LierenOfferQueue).toBe(true);
    expect(queue.platName).toBe("lieren");
  });

  test("应该缓存报价队列实例", () => {
    const queue1 = offerQueueFactory.createOfferQueue("lieren");
    const queue2 = offerQueueFactory.createOfferQueue("lieren");

    expect(queue1).toBe(queue2);
  });

  test("getOfferQueue方法应该返回队列实例", () => {
    const queue = offerQueueFactory.getOfferQueue("lieren");

    expect(queue).toBeDefined();
    expect(queue.platName).toBe("lieren");
  });

  test("getOfferQueue方法对于不支持的平台应该返回null", () => {
    const queue = offerQueueFactory.getOfferQueue("invalid_platform");

    expect(queue).toBeNull();
  });

  test("clearOfferQueueCache应该清除指定平台的缓存", () => {
    const queue1 = offerQueueFactory.createOfferQueue("lieren");
    offerQueueFactory.clearOfferQueueCache("lieren");
    const queue2 = offerQueueFactory.createOfferQueue("lieren");

    expect(queue1).not.toBe(queue2);
  });
});
