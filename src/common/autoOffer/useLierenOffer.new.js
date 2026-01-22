// 新架构的猎人报价队列（兼容原有接口）
// 此文件用于逐步迁移，保持原有导出接口不变

import LierenOfferQueue from "../platform/queues/LierenOfferQueue.js";

// 创建队列实例
const offerQueue = new LierenOfferQueue();

// 导出队列实例（保持原有导出方式）
export default offerQueue;
