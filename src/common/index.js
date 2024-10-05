import lierenApi from "@/api/lieren-api";
import shengApi from "@/api/sheng-api";
import mangguoApi from "@/api/mangguo-api";
import mayiApi from "@/api/mayi-api";
import yangcongApi from "@/api/yangcong-api";
import hahaApi from "@/api/haha-api";
import yinghuasuanApi from "@/api/yinghuasuan-api";

import createSfcApi from "@/api/sfc-api";
import createUmeApi from "@/api/ume-api";
import createLmaApi from "@/api/lma-api";
import { APP_LIST, UME_LIST, APP_GROUP_OBJ } from "@/common/constant";

const SFC_API_OBJ = {};
const UME_API_OBJ = {};

let noSfcList = [...UME_LIST];
let sfcList = Object.keys(APP_LIST).filter(item => !noSfcList.includes(item));

sfcList.forEach(item => {
  SFC_API_OBJ[item] = createSfcApi({
    group: APP_GROUP_OBJ[item],
    app_name: item
  });
});

UME_LIST.forEach(item => {
  UME_API_OBJ[item] = createUmeApi({
    app_name: item
  });
});
const APP_API_OBJ = {
  ...SFC_API_OBJ,
  ...UME_API_OBJ,
  lma: createLmaApi({
    app_name: "lma"
  })
};

const PLAT_API_OBJ = {
  lieren: lierenApi,
  sheng: shengApi,
  mangguo: mangguoApi,
  mayi: mayiApi,
  yangcong: yangcongApi,
  haha: hahaApi,
  yinghuasuan: yinghuasuanApi
};
// console.log("SFC_API_OBJ"), SFC_API_OBJ;
export { APP_API_OBJ, PLAT_API_OBJ };
