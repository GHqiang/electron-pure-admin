import { defineStore } from "pinia";
import { APP_TYPE_OBJ } from "@/common/constant";
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
let allCinemaList = window.localStorage.getItem("allCinemaList");
if (allCinemaList) {
  allCinemaList = JSON.parse(allCinemaList);
}
export const useCinemaList = defineStore("cinemaDataTable", {
  state: () => {
    return {
      allAppList: allCinemaList || []
    };
  },
  actions: {
    // 设置规则列表
    setCinemaInfoList(list) {
      console.warn(`设置影院列表信息`, list);
      this.allAppList = list;
      window.localStorage.setItem("allCinemaList", JSON.stringify(list));
    }
  },
  getters: {
    getUmeList: state => {
      return state.allAppList
        .filter(item => item.app_type_code === "ume_applet")
        .map(item => item.app_name);
    },
    getH5UmeList: state => {
      return state.allAppList
        .filter(item => item.app_type_code === "ume_h5")
        .map(item => item.app_name);
    },
    getSfcList: state => {
      return state.allAppList
        .filter(item => item.app_type_code === "sfc_applet")
        .map(item => item.app_name);
    },
    getLmaList: state => {
      return state.allAppList
        .filter(item => item.app_type_code === "lma_applet")
        .map(item => item.app_name);
    },
    getAppTypeList: state => {
      return Object.keys(APP_TYPE_OBJ).map(item => ({
        app_type_code: item,
        app_type_name: APP_TYPE_OBJ[item],
        app_name_list: state.allAppList
          .filter(itemA => itemA.app_type_code === item)
          .map(itemA => itemA.app_name)
      }));
    },
    getAppList: state => {
      let appList = {};
      state.allAppList.forEach(item => {
        appList[item.app_name] = item.app_label;
      });
      return appList;
    },
    // 获取可用app列表
    getUsableAppList: state => {
      let appList = {};
      state.allAppList.forEach(item => {
        // 只有内容角色才允许设置状态，且状态只对内部角色生效
        if (tokens?.userInfo?.rule == 2) {
          if (item.status == 1) {
            appList[item.app_name] = item.app_label;
          }
        } else {
          appList[item.app_name] = item.app_label;
        }
      });
      return appList;
    },
    // 获取所有影院信息
    getAllAppList: state =>
      state.allAppList.filter(item =>
        tokens?.userInfo?.rule == 2 ? item.status == 1 : true
      )
  }
});
