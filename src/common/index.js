import createApi from "@/api/sfc-api";

import { APP_LIST, APP_GROUP_OBJ } from "@/common/constant";
const SFC_API_OBJ = {};
Object.keys(APP_LIST).forEach(item => {
  SFC_API_OBJ[item] = createApi({
    group: APP_GROUP_OBJ[item],
    appName: item
  });
});
// console.log("SFC_API_OBJ"), SFC_API_OBJ;
export { SFC_API_OBJ };
