import getSfcOfferPrice from "./sfcOffer";
import getUmeOfferPrice from "./umeOffer";
import getH5UmeOfferPrice from "./h5umeOffer.js";
import getLmaOfferPrice from "./lmaOffer";
import {
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_SFC_APP_LIST
} from "@/common/constant";

// 生成获取报价价格实体类
const getOfferPriceFun = params => {
  const { appFlag } = params;
  if (GET_UME_LIST().includes(appFlag)) {
    return new getUmeOfferPrice(params);
  } else if (GET_H5_UME_LIST().includes(appFlag)) {
    return new getH5UmeOfferPrice(params);
  } else if (appFlag == "lma") {
    return new getLmaOfferPrice(params);
  } else if (GET_SFC_APP_LIST().includes(appFlag)) {
    return new getSfcOfferPrice(params);
  }
};

export default getOfferPriceFun;
