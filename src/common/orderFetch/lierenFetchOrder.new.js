// 新架构的猎人订单获取（兼容原有接口）
// 此文件用于逐步迁移，保持原有导出接口不变

import LierenOrderFetcher from "../platform/fetchers/LierenOrderFetcher.js";

// 创建订单获取实例
const orderFetchQueue = new LierenOrderFetcher();

// 导出实例（保持原有导出方式）
export default orderFetchQueue;
