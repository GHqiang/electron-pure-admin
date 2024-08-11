import getSfcOfferPrice from "./sfcOffer";
import getUmeOfferPrice from "./umeOffer";
import { UME_LIST } from "@/common/constant";

// 生成获取报价价格实体类
const getOfferPriceFun = params => {
  if (UME_LIST.includes(params.appFlag)) {
    return new getUmeOfferPrice(params);
  } else {
    return new getSfcOfferPrice(params);
  }
};

export default getOfferPriceFun;
