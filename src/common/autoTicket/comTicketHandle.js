import createSfcTicketQueue from "./sfcAutoTicket";
import createUmeTicketQueue from "./umeAutoTicket";
// 生成出票队列实体类
const createTucketQueueFun = appFlag => {
  if (["ume", "yaolai"].includes(appFlag)) {
    return createUmeTicketQueue(appFlag);
  } else {
    return createSfcTicketQueue(appFlag);
  }
};

export default createTucketQueueFun;
