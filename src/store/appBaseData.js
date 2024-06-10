import { defineStore } from "pinia";

// 优先从本地缓存里面取
let appBaseData = window.localStorage.getItem("appBaseData");
if (appBaseData) {
  appBaseData = JSON.parse(appBaseData);
}
export const useAppBaseData = defineStore("appBaseData", {
  state: () => ({
    // eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzb20uempscm1vdmllLmNuIiwiYXVkIjoic29tLnpqbHJtb3ZpZS5jbiIsImlhdCI6MTcxNTM0NDk2MywibmJmIjoxNzE1MzQ0OTYzLCJleHAiOjE3MTc3NjQxNjMsImRhdGEiOnsiaWQiOjcxNDYzMiwidXNlcm5hbWUiOjcxNDYzMiwic3RhdHVzIjoxLCJvcGVuaWQiOiJvUXpFZjQ3a1ZLQ3F6bzRPSXl1ZHBZVllwX2g0In19.mwidYdjsGHIEnDxWlihB2LVdCtt0o1v_rrdbvSbSe50
    appBaseData: appBaseData || {
      sfc: null,
      // {
      //   cityList: null,
      //   allCinemaList: null,
      // },
      jiujin: null,
      jinji: null,
      laina: null,
      ningbo: null
    }
  }),
  getters: {
    sfcBaseData(state) {
      return state.appBaseData?.sfc;
    },
    jiujinBaseData(state) {
      return state.appBaseData?.jiujin;
    },
    jinjiBaseData(state) {
      return state.appBaseData?.jinji;
    },
    lainaBaseData(state) {
      return state.appBaseData?.laina;
    },
    ningboBaseData(state) {
      return state.appBaseData?.ningbo;
    }
  },
  actions: {
    // 设置sfc基础数据
    setSfcBaseData(baseData) {
      console.warn("设置sfc-基础数据", baseData);
      this.appBaseData.sfc = this.sfcBaseData
        ? { ...this.sfcBaseData, ...baseData }
        : baseData;
      window.localStorage.setItem(
        "appBaseData",
        JSON.stringify(this.appBaseData)
      );
    },
    setJiujinBaseData(baseData) {
      console.warn("设置华夏久金-基础数据", baseData);
      this.appBaseData.jiujin = this.jiujinBaseData
        ? { ...this.jiujinBaseData, ...baseData }
        : baseData;
      window.localStorage.setItem(
        "appBaseData",
        JSON.stringify(this.appBaseData)
      );
    },
    setJinjiBaseData(baseData) {
      console.warn("设置北京金鸡-基础数据", baseData);
      this.appBaseData.jinji = this.jinjiBaseData
        ? { ...this.jinjiBaseData, ...baseData }
        : baseData;
      window.localStorage.setItem(
        "appBaseData",
        JSON.stringify(this.appBaseData)
      );
    },
    setLainaBaseData(baseData) {
      console.warn("设置莱纳龙域基础数据", baseData);
      this.appBaseData.laina = this.lainaBaseData
        ? { ...this.lainaBaseData, ...baseData }
        : baseData;
      window.localStorage.setItem(
        "appBaseData",
        JSON.stringify(this.appBaseData)
      );
    },
    setNingboBaseData(baseData) {
      console.warn("设置宁波影都-基础数据", baseData);
      this.appBaseData.ningbo = this.ningboBaseData
        ? { ...this.ningboBaseData, ...baseData }
        : baseData;
      window.localStorage.setItem(
        "appBaseData",
        JSON.stringify(this.appBaseData)
      );
    }
  }
});
