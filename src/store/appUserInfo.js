import { defineStore } from "pinia";
import { APP_LIST } from "@/common/constant";
// 优先从本地缓存里面取
let allUserInfo = window.localStorage.getItem("allUserInfo");
if (allUserInfo) {
  allUserInfo = JSON.parse(allUserInfo);
}
export const appUserInfo = defineStore("appUserInfo", {
  state: () => ({
    // eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzb20uempscm1vdmllLmNuIiwiYXVkIjoic29tLnpqbHJtb3ZpZS5jbiIsImlhdCI6MTcxNTM0NDk2MywibmJmIjoxNzE1MzQ0OTYzLCJleHAiOjE3MTc3NjQxNjMsImRhdGEiOnsiaWQiOjcxNDYzMiwidXNlcm5hbWUiOjcxNDYzMiwic3RhdHVzIjoxLCJvcGVuaWQiOiJvUXpFZjQ3a1ZLQ3F6bzRPSXl1ZHBZVllwX2g0In19.mwidYdjsGHIEnDxWlihB2LVdCtt0o1v_rrdbvSbSe50
    allUserInfo: allUserInfo || {
      sfc: {
        card_count: "0",
        card_num: "0",
        have_new_coupon: "0",
        head_img: "",
        mobile: "13073795001",
        nickname: "13073795001",
        no_pay_order: "0",
        session_id: "6655c6d5bbc32f90bef1d9a9e3eb972d85bee9af93416",
        user_id: "581154",
        modified_birthday: "0",
        modified_info: "0",
        member_center_h5_url: "http://group.leying.com/point/member-center"
      },
      zhongying: null,
      xywdgmyc: null,
      lyzy: null,
      cswyh: null,
      bjdzlt: null,
      glyc: null,
      lma: null,
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
      qina: null
    },
    loginInfoList: []
  }),
  getters: {},
  actions: {
    // 设置sfc用户信息
    setLoginInfoList(list) {
      let userInfo = window.localStorage.getItem("userInfo");
      if (userInfo) {
        userInfo = JSON.parse(userInfo);
      }
      const { phone } = userInfo;
      const appNameList = ["sfc", "ningbo", "renhengmeng"];
      list = list.filter(item => {
        if (appNameList.includes(item.app_name)) {
          return item.mobile === phone;
        }
        // return item.app_name === "lma";
        return true;
      });
      console.warn(`设置影院登录信息`, list);
      this.loginInfoList = list;
      window.localStorage.setItem("loginInfoList", JSON.stringify(list));
    },
    // 设置sfc用户信息
    setSfcUserInfo({ appName, userInfo }) {
      console.warn(`设置${APP_LIST[appName]}-用户信息及token`, userInfo);
      this.allUserInfo[appName] = userInfo;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    },
    // 删除sfc用户信息
    removeSfcUserInfo(appName) {
      console.warn(`删除${APP_LIST[appName]}-用户信息及token`);
      this.allUserInfo[appName] = null;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    }
  }
});
