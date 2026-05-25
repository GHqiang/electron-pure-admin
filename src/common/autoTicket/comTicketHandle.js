import BaseTicketQueue from "@/common/core/BaseTicketQueue.js";

/** @type {Map<string, BaseTicketQueue>} 出票队列单例注册表 */
const ticketQueueRegistry = new Map();

/**
 * 获取出票队列单例（不存在则创建并绑定唯一事件监听器）
 * @param {string} appFlag - 影院标识
 * @returns {BaseTicketQueue}
 */
const getTicketQueue = appFlag => {
  if (ticketQueueRegistry.has(appFlag)) {
    return ticketQueueRegistry.get(appFlag);
  }
  const queue = new BaseTicketQueue(appFlag);
  queue.attachListener();
  ticketQueueRegistry.set(appFlag, queue);
  return queue;
};

/**
 * 销毁出票队列单例并移除事件监听
 * @param {string} appFlag
 */
const destroyTicketQueue = appFlag => {
  const queue = ticketQueueRegistry.get(appFlag);
  if (queue) {
    queue.destroy();
    ticketQueueRegistry.delete(appFlag);
  }
};

/** @deprecated 请使用 getTicketQueue，保留别名以兼容旧引用 */
const createTicketQueueFun = getTicketQueue;

export { getTicketQueue, destroyTicketQueue };
export default createTicketQueueFun;
