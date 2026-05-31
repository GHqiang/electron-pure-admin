import BaseTicketQueue from "@/common/core/BaseTicketQueue.js";

/**
 * 获取出票队列单例注册表（挂载到 window 确保模块即使被重复加载也共享同一注册表）
 * @returns {Map<string, BaseTicketQueue>}
 */
const getRegistry = () => {
  if (!window.__ticketQueueRegistry) {
    window.__ticketQueueRegistry = new Map();
  }
  return window.__ticketQueueRegistry;
};

/**
 * 获取出票队列单例（不存在则创建并绑定唯一事件监听器）
 * @param {string} appFlag - 影院标识
 * @returns {BaseTicketQueue}
 */
const getTicketQueue = appFlag => {
  const registry = getRegistry();
  if (registry.has(appFlag)) {
    return registry.get(appFlag);
  }
  const queue = new BaseTicketQueue(appFlag);
  queue.attachListener();
  registry.set(appFlag, queue);
  return queue;
};

/**
 * 销毁出票队列单例并移除事件监听
 * @param {string} appFlag
 */
const destroyTicketQueue = appFlag => {
  const registry = getRegistry();
  const queue = registry.get(appFlag);
  if (queue) {
    queue.destroy();
    registry.delete(appFlag);
  }
};

/** @deprecated 请使用 getTicketQueue，保留别名以兼容旧引用 */
const createTicketQueueFun = getTicketQueue;

export { getTicketQueue, destroyTicketQueue };
export default createTicketQueueFun;
