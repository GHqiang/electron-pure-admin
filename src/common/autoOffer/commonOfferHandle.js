import getSfcOfferPrice from "./sfcOffer";
import getUmeOfferPrice from "./umeOffer";
// 生成获取报价价格实体类
const getOfferPriceFun = params => {
  if (params.appFlag !== "ume") {
    return new getSfcOfferPrice(params);
  } else {
    return new getUmeOfferPrice(params);
  }
};

export default getOfferPriceFun;
