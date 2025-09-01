import { defineStore } from "pinia";
import { APP_TYPE_OBJ, IN_RULE_LIST } from "@/common/constant";
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();
let allCinemaList = window.localStorage.getItem("allCinemaList");
if (allCinemaList) {
  allCinemaList = JSON.parse(allCinemaList);
}
export const useCinemaList = defineStore("cinemaDataTable", {
  state: () => {
    return {
      // canAppList: allCinemaList || []
      canAppList: [], // 可用影院列表
      allAppList: [] // 全部影院列表
    };
  },
  actions: {
    // 设置规则列表
    setCinemaInfoList(list) {
      let cinemaList = list.filter(item =>
        IN_RULE_LIST.includes(tokens?.userInfo?.rule)
          ? item.status == 1
          : item.status != "3"
      );
      console.warn(`设置影院列表信息`, cinemaList);
      this.canAppList = cinemaList;
      this.allAppList = list;
      // window.localStorage.setItem("allCinemaList", JSON.stringify(list));
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
    getChenxingList: state => {
      return state.allAppList
        .filter(item => item.app_type_code === "chenxing_applet")
        .map(item => item.app_name);
    },
    getFenghuangList: state => {
      return state.allAppList
        .filter(item => item.app_type_code === "fenghuang_applet")
        .map(item => item.app_name);
    },
    // 获取可用影线及影院列表
    getCanAppTypeList: state => {
      return Object.keys(APP_TYPE_OBJ).map(item => ({
        app_type_code: item,
        app_type_name: APP_TYPE_OBJ[item],
        app_name_list: state.canAppList
          .filter(itemA => itemA.app_type_code === item)
          .map(itemA => itemA.app_name)
      }));
    },
    // 获取全部影线及影院列表
    getAllAppTypeList: state => {
      return Object.keys(APP_TYPE_OBJ).map(item => ({
        app_type_code: item,
        app_type_name: APP_TYPE_OBJ[item],
        app_name_list: state.allAppList
          .filter(itemA => itemA.app_type_code === item)
          .map(itemA => itemA.app_name)
      }));
    },
    // 获取可用影院对象
    getUsableAppList: state => {
      let appList = {};
      state.canAppList.forEach(item => {
        appList[item.app_name] = item.app_label;
      });
      return appList;
    },
    // 获取全部影院对象
    getAllAppList: state => {
      let appList = {};
      state.allAppList.forEach(item => {
        appList[item.app_name] = item.app_label;
      });
      return appList;
    }
  }
});
