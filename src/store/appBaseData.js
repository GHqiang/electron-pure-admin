import { defineStore } from "pinia";

// 优先从本地缓存里面取
// let appBaseData = window.localStorage.getItem("appBaseData");
// if (appBaseData) {
//   appBaseData = JSON.parse(appBaseData);
// }
export const useAppBaseData = defineStore("appBaseData", {
  state: () => ({
    // eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzb20uempscm1vdmllLmNuIiwiYXVkIjoic29tLnpqbHJtb3ZpZS5jbiIsImlhdCI6MTcxNTM0NDk2MywibmJmIjoxNzE1MzQ0OTYzLCJleHAiOjE3MTc3NjQxNjMsImRhdGEiOnsiaWQiOjcxNDYzMiwidXNlcm5hbWUiOjcxNDYzMiwic3RhdHVzIjoxLCJvcGVuaWQiOiJvUXpFZjQ3a1ZLQ3F6bzRPSXl1ZHBZVllwX2g0In19.mwidYdjsGHIEnDxWlihB2LVdCtt0o1v_rrdbvSbSe50
    appBaseData: {
      sfc: null,
      // {
      //   cityList: null,
      //   allCinemaList: null,
      // },
      jiujin: null,
      jinji: null,
      laina: null,
      ningbo: null,
      hema: null,
      hongshi: null,
      limeihua: null,
      hengye: null,
      minzu: null,
      yinxingws: null,
      yinxingnc: null,
      yinxingxy: null,
      liangchen: null,
      suzhou: null,
      quanmei: null,
      yongheng: null,
      nanguojgh: null,
      baoneng: null,
      hefeidianying: null,
      chaohuzhongying: null,
      hfzybdd: null,
      hfzywpcd: null,
      hfzyzdgcd: null,
      hfzydxjd: null,
      qina: null
    }
  }),
  getters: {},
  actions: {
    // 设置sfc基础数据
    setSfcBaseData(baseData, appName) {
      console.warn(`设置${appName}-基础数据`, baseData, appName);
      const tempData = this.appBaseData[appName];
      this.appBaseData[appName] = tempData
        ? { ...tempData, ...baseData }
        : baseData;
      window.localStorage.setItem(
        "appBaseData",
        JSON.stringify(this.appBaseData)
      );
    }
  }
});
