import createSfcTicketQueue from "./sfcAutoTicket";
import createUmeTicketQueue from "./umeAutoTicket";
// 生成出票队列实体类
const createTucketQueueFun = appFlag => {
  if (appFlag !== "ume") {
    return createSfcTicketQueue(appFlag);
  } else {
    return createUmeTicketQueue(appFlag);
  }
};

export default createTucketQueueFun;
