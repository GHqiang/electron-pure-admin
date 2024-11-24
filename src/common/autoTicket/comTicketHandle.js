import createSfcTicketQueue from "./sfcAutoTicket";
import createUmeTicketQueue from "./umeAutoTicket";
import createLmaTicketQueue from "./lmaAutoTicket";
import { UME_LIST, H5_UME_LIST } from "@/common/constant";
// 生成出票队列实体类
const createTucketQueueFun = appFlag => {
  if (UME_LIST.includes(appFlag)) {
    return createUmeTicketQueue(appFlag);
  } else if (H5_UME_LIST.includes(appFlag)) {
    // return createLmaTicketQueue(appFlag);
  } else if (appFlag === "lma") {
    return createLmaTicketQueue(appFlag);
  } else {
    return createSfcTicketQueue(appFlag);
  }
};

export default createTucketQueueFun;
