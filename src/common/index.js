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
import createH5UmeApi from "@/api/h5ume-api";
import {
  APP_LIST,
  UME_LIST,
  H5_UME_LIST,
  APP_GROUP_OBJ
} from "@/common/constant";
import { getCinemaLoginInfoList } from "@/utils/utils";
const SFC_API_OBJ = {};
const UME_API_OBJ = {};
const H5_UME_API_OBJ = {};

let noSfcList = [...UME_LIST, "lma"];
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

H5_UME_LIST.forEach(item => {
  H5_UME_API_OBJ[item] = createH5UmeApi({
    app_name: item
  });
  let loginInfoList = getCinemaLoginInfoList();
  let isLogin = loginInfoList.find(
    itemA => itemA.app_name === item && itemA.session_id
  );
  if (isLogin) {
    // 这里执行一下主要是为了解决上来就请求非getCinemaList接口会报错，这里调一下是为了补充令牌（cookie里的_m_h5_tk）
    H5_UME_API_OBJ[item].getCinemaList();
  }
});

const APP_API_OBJ = {
  ...SFC_API_OBJ,
  ...UME_API_OBJ,
  ...H5_UME_API_OBJ,
  lma: createLmaApi({
    app_name: "lma"
  })
};
window.APP_API_OBJ = APP_API_OBJ;
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
