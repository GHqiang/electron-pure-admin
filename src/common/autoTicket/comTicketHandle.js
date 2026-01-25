// import createSfcTicketQueue from "./sfcAutoTicket";
// import createUmeTicketQueue from "./umeAutoTicket";
// import createH5UmeTicketQueue from "./h5umeAutoTicket";
// import createLmaTicketQueue from "./lmaAutoTicket";
import createCommonTicketQueue from "./commonAutoTicket";
import BaseTicketQueue from "@/common/core/BaseTicketQueue.js";
import {
  GET_CHENXING_LIST,
  GET_FENGHUANG_LIST,
  GET_JINYI_LIST
} from "@/common/constant";
// 生成出票队列实体类
const createTucketQueueFun = appFlag => {
  // 先检查辰星、凤凰新、金逸，确保它们使用旧的 createCommonTicketQueue 实现
  if (
    GET_CHENXING_LIST().includes(appFlag) ||
    GET_FENGHUANG_LIST().includes(appFlag) ||
    GET_JINYI_LIST().includes(appFlag)
  ) {
    return createCommonTicketQueue(appFlag);
  } else {
    // 模块化重构后的平台使用 BaseTicketQueue（它会通过 StrategyFactory 创建正确的出票实例）
    return new BaseTicketQueue(appFlag);
  }
};

export default createTucketQueueFun;
