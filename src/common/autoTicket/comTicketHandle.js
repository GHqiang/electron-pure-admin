import createSfcTicketQueue from "./sfcAutoTicket";
import createUmeTicketQueue from "./umeAutoTicket";
import createH5UmeTicketQueue from "./h5umeAutoTicket";
import createLmaTicketQueue from "./lmaAutoTicket";
import {
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_SFC_APP_LIST
} from "@/common/constant";
// 生成出票队列实体类
const createTucketQueueFun = appFlag => {
  if (GET_UME_LIST().includes(appFlag)) {
    return createUmeTicketQueue(appFlag);
  } else if (GET_H5_UME_LIST().includes(appFlag)) {
    return createH5UmeTicketQueue(appFlag);
  } else if (appFlag === "lma") {
    return createLmaTicketQueue(appFlag);
  } else if (GET_SFC_APP_LIST().includes(appFlag)) {
    return createSfcTicketQueue(appFlag);
  }
};

export default createTucketQueueFun;
