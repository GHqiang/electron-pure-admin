import { defineStore } from "pinia";

// 优先从本地缓存里面取
let allUserInfo = window.localStorage.getItem("allUserInfo");
if (allUserInfo) {
  allUserInfo = JSON.parse(allUserInfo);
}
export const appUserInfo = defineStore("appUserInfo", {
  state: () => ({
    // eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzb20uempscm1vdmllLmNuIiwiYXVkIjoic29tLnpqbHJtb3ZpZS5jbiIsImlhdCI6MTcxNTM0NDk2MywibmJmIjoxNzE1MzQ0OTYzLCJleHAiOjE3MTc3NjQxNjMsImRhdGEiOnsiaWQiOjcxNDYzMiwidXNlcm5hbWUiOjcxNDYzMiwic3RhdHVzIjoxLCJvcGVuaWQiOiJvUXpFZjQ3a1ZLQ3F6bzRPSXl1ZHBZVllwX2g0In19.mwidYdjsGHIEnDxWlihB2LVdCtt0o1v_rrdbvSbSe50
    allUserInfo: allUserInfo || {
      sfc: null,
      jiujin: null,
      jinji: null,
      laina: null
    }
  }),
  getters: {
    // sfc上影token
    sfcToken(state) {
      return state.allUserInfo?.sfc?.session_id || "";
    },
    sfcUserMobile(state) {
      return state.allUserInfo?.sfc?.mobile || "";
    },
    // 久金token
    jiujinToken(state) {
      return state.allUserInfo?.jiujin?.session_id || "";
    },
    jiujinUserMobile(state) {
      return state.allUserInfo?.jiujin?.mobile || "";
    },
    // 莱纳token
    lainaToken(state) {
      return state.allUserInfo?.laina?.session_id || "";
    },
    lainaUserMobile(state) {
      return state.allUserInfo?.laina?.mobile || "";
    },
    // 金鸡token
    jinjiToken(state) {
      return state.allUserInfo?.jinji?.session_id || "";
    },
    jinjiUserMobile(state) {
      return state.allUserInfo?.jinji?.mobile || "";
    },
    lmaToken(state) {
      return state.allUserInfo?.lumiai?.session_id || "";
    }
  },
  actions: {
    // 设置sfc用户信息
    setSfcUserInfo(userInfo) {
      console.warn("设置sfc-用户信息及token", userInfo);
      this.allUserInfo.sfc = userInfo;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    },
    // 删除sfc用户信息
    removeSfcUserInfo() {
      console.warn("删除sfc-用户信息及token");
      this.allUserInfo.sfc = null;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    },
    // 设置久金用户信息
    setJiujinUserInfo(userInfo) {
      console.warn("设置久金-用户信息及token", userInfo);
      this.allUserInfo.jiujin = userInfo;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    },
    // 删除久金用户信息
    removeJiujinUserInfo() {
      console.warn("删除久金-用户信息及token");
      this.allUserInfo.jiujin = null;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    },
    // 设置金鸡用户信息
    setJinjiUserInfo(userInfo) {
      console.warn("设置金鸡-用户信息及token", userInfo);
      this.allUserInfo.jinji = userInfo;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    },
    // 删除金鸡用户信息
    removeJinjiUserInfo() {
      console.warn("删除金鸡-用户信息及token");
      this.allUserInfo.jinji = null;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    },
    // 设置莱纳用户信息
    setLainaUserInfo(userInfo) {
      console.warn("设置莱纳-用户信息及token", userInfo);
      this.allUserInfo.laina = userInfo;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    },
    // 删除莱纳用户信息
    removeLainaUserInfo() {
      console.warn("删除莱纳-用户信息及token");
      this.allUserInfo.laina = null;
      window.localStorage.setItem(
        "allUserInfo",
        JSON.stringify(this.allUserInfo)
      );
    }
  }
});
