import getSfcOfferPrice from "./sfcOffer";
import getUmeOfferPrice from "./umeOffer";
// 生成获取报价价格实体类
const getOfferPriceFun = params => {
  if (["ume", "yaolai"].includes(params.appFlag)) {
    return new getUmeOfferPrice(params);
  } else {
    return new getSfcOfferPrice(params);
  }
};

export default getOfferPriceFun;
