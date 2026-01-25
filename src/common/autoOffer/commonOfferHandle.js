import getSfcOfferPrice from "./sfcOffer";
import getSfcOfferPriceNew from "../autoTicket/buyTicket/sfc/offerManage.js";
import getChenxingOfferPrice from "../autoTicket/buyTicket/chenxing/offerManage.js";
import getFenghuangOfferPrice from "../autoTicket/buyTicket/fenghuang/offerManage.js";
import getJinyiOfferPrice from "../autoTicket/buyTicket/jinyi/offerManage.js";
import getUmeOfferPrice from "./umeOffer";
import getUmeOfferPriceNew from "../autoTicket/buyTicket/ume/offerManage.js"; // UME新实现
import getH5UmeOfferPrice from "./h5umeOffer.js";
import getH5UmeOfferPriceNew from "../autoTicket/buyTicket/h5ume/offerManage.js"; // H5UME新实现
import getLmaOfferPrice from "./lmaOffer";
import getLmaOfferPriceNew from "../autoTicket/buyTicket/lma/offerManage.js"; // 新实现
import {
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_SFC_APP_LIST,
  GET_CHENXING_LIST,
  GET_FENGHUANG_LIST,
  GET_JINYI_LIST
} from "@/common/constant";

// 生成获取报价价格实体类
const getOfferPriceFun = params => {
  const { appFlag } = params;
  if (GET_UME_LIST().includes(appFlag)) {
    return new getUmeOfferPriceNew(params);
  } else if (GET_H5_UME_LIST().includes(appFlag)) {
    return new getH5UmeOfferPriceNew(params);
  } else if (appFlag == "lma") {
    return new getLmaOfferPriceNew(params);
  } else if (GET_SFC_APP_LIST().includes(appFlag)) {
    return new getSfcOfferPriceNew(params);
  } else if (GET_CHENXING_LIST().includes(appFlag)) {
    return new getChenxingOfferPrice(params);
  } else if (GET_FENGHUANG_LIST().includes(appFlag)) {
    return new getFenghuangOfferPrice(params);
  } else if (GET_JINYI_LIST().includes(appFlag)) {
    return new getJinyiOfferPrice(params);
  }
};

export default getOfferPriceFun;
