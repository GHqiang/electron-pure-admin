import { defineStore } from "pinia";
import { APP_TYPE_OBJ } from "@/common/constant";
export const useCinemaList = defineStore("cinemaDataTable", {
  state: () => {
    return {
      allAppList: []
    };
  },
  actions: {
    // 设置规则列表
    setCinemaInfoList(list) {
      console.warn(`设置影院列表信息`, list);
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
    getAppTypeList: state => {
      return Object.keys(APP_TYPE_OBJ).map(item => ({
        app_type_code: item,
        app_type_name: APP_TYPE_OBJ[item],
        app_name_list: state.allAppList.filter(
          item => item.app_type_code === item
        )
      }));
    },
    getAppList: state => {
      return state.allAppList.map(item => ({
        [item.app_name]: item.app_label
      }));
    }
  }
});
