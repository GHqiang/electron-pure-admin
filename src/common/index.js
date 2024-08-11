import createSfcApi from "@/api/sfc-api";
import createUmeApi from "@/api/ume-api";
import { APP_LIST, UME_LIST, APP_GROUP_OBJ } from "@/common/constant";

const SFC_API_OBJ = {};
const UME_API_OBJ = {};

let noSfcList = [...UME_LIST];
let sfcList = Object.keys(APP_LIST).filter(item => !noSfcList.includes(item));

sfcList.forEach(item => {
  SFC_API_OBJ[item] = createSfcApi({
    group: APP_GROUP_OBJ[item],
    appName: item
  });
});

UME_LIST.forEach(item => {
  UME_API_OBJ[item] = createUmeApi({
    appName: item
  });
});
const APP_API_OBJ = {
  ...SFC_API_OBJ,
  ...UME_API_OBJ
};
// console.log("SFC_API_OBJ"), SFC_API_OBJ;
export { APP_API_OBJ };
