import createApi from "@/api/sfc-api";
import umeApi from "@/api/ume-api";
import { APP_LIST, APP_GROUP_OBJ } from "@/common/constant";
const SFC_API_OBJ = {};
let keyList = Object.keys(APP_LIST);
keyList.forEach(item => {
  SFC_API_OBJ[item] = createApi({
    group: APP_GROUP_OBJ[item],
    appName: item
  });
});
const APP_API_OBJ = {
  ...SFC_API_OBJ,
  ume: umeApi
};
// console.log("SFC_API_OBJ"), SFC_API_OBJ;
export { APP_API_OBJ };
