import createSfcTicketQueue from "./sfcAutoTicket";
import createUmeTicketQueue from "./umeAutoTicket";
import { UME_LIST } from "@/common/constant";
// 生成出票队列实体类
const createTucketQueueFun = appFlag => {
  if (UME_LIST.includes(appFlag)) {
    return createUmeTicketQueue(appFlag);
  } else {
    return createSfcTicketQueue(appFlag);
  }
};

export default createTucketQueueFun;
