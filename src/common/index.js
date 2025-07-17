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
import createChenxingApi from "@/api/chenxing-api";
import createFenghuangApi from "@/api/fenghuang-api";
import {
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_SFC_APP_LIST,
  GET_CHENXING_LIST,
  GET_FENGHUANG_LIST,
  GE_APP_INFO
} from "@/common/constant";
import { getCinemaLoginInfoList } from "@/utils/utils";
const SFC_API_OBJ = {};
const UME_API_OBJ = {};
const H5_UME_API_OBJ = {};
const CHENXING_API_OBJ = {};
const FENGHUANG_API_OBJ = {};

GET_SFC_APP_LIST().forEach(item => {
  SFC_API_OBJ[item] = createSfcApi({
    group: GE_APP_INFO(item)?.sfc_group_id,
    app_name: item
  });
});
GET_CHENXING_LIST().forEach(item => {
  CHENXING_API_OBJ[item] = createChenxingApi({
    app_name: item
  });
});
GET_UME_LIST().forEach(item => {
  UME_API_OBJ[item] = createUmeApi({
    app_name: item
  });
});
GET_FENGHUANG_LIST().forEach(item => {
  FENGHUANG_API_OBJ[item] = createFenghuangApi({
    app_name: item
  });
  let loginInfoList = getCinemaLoginInfoList();
  let isLogin = loginInfoList.find(
    itemA => itemA.app_name === item && itemA.session_id
  );
  if (isLogin) {
    FENGHUANG_API_OBJ[item].getCinemaList();
  }
});
GET_H5_UME_LIST().forEach(item => {
  H5_UME_API_OBJ[item] = createH5UmeApi({
    app_name: item
  });
  let loginInfoList = getCinemaLoginInfoList();
  let isLogin = loginInfoList.find(
    itemA => itemA.app_name === item && itemA.session_id
  );
  const IS_DEV = process.env.NODE_ENV === "development";
  if (isLogin && !IS_DEV) {
    // 这里执行一下主要是为了解决上来就请求非getCinemaList接口会报错，这里调一下是为了补充令牌（cookie里的_m_h5_tk）
    H5_UME_API_OBJ[item].getCinemaList();
  }
});

const APP_API_OBJ = {
  ...SFC_API_OBJ,
  ...UME_API_OBJ,
  ...H5_UME_API_OBJ,
  ...CHENXING_API_OBJ,
  ...FENGHUANG_API_OBJ,
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
window.PLAT_API_OBJ = PLAT_API_OBJ;
// console.log("SFC_API_OBJ"), SFC_API_OBJ;
export { APP_API_OBJ, PLAT_API_OBJ };
