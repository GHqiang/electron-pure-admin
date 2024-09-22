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
      ume: null,
      wanmei: null,
      yinghuang: null,
      jqgw: null,
      hfhlxh: null,
      hsd: null,
      zyxmccone: null,
      bnxm: null,
      tpyyc: null,
      hzxhyd: null,
      ywycssd: null,
      xgjyycnjystjd: null,
      sjzhlh: null,
      zhuying: null,
      zheyingshidai: null,
      yaolai: null,
      renhengmeng: null,
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
      dsyc: null,
      cqhx: null,
      jqx: null,
      fszy: null,
      xywszy: null,
      jjzy: null,
      whyx: null,
      hzzy: null,
      shzy: null,
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
      hfzyzhd: null,
      wfzyyxhd: null,
      wfzygeshgcd: null,
      nchgtdd: null,
      hfbddd: null,
      hflkldd: null,
      ttylw: null,
      ytgjyc: null,
      dghs: null,
      tjlnx: null,
      bjlnx: null,
      cdlnx: null,
      jsdgm: null,
      jwzy: null,
      slsy: null,
      gbsy: null,
      jyhx: null,
      hkzy: null,
      hgwz: null,
      shjy: null,
      tjlq: null,
      shth: null,
      szyl: null,
      xyfsy: null,
      cszykd: null,
      cszyyzx: null,
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
