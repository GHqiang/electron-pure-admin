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
      sfc: null
    }
  }),
  getters: {
    sfcUserMobile(state) {
      return state.allUserInfo?.sfc?.mobile || "";
    },
    // sfc上影token
    sfcToken(state) {
      return state.allUserInfo?.sfc?.session_id || "";
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
    }
  }
});