import { defineStore } from "pinia";

let user = window.localStorage.getItem("userInfo");
if (user) {
  user = JSON.parse(user);
}
export const platTokens = defineStore("platTokens", {
  state: () => ({
    lierenToken: "",
    mangguoToken: "",
    mayiToken: "",
    yangcongToken: "",
    hahaToken: "",
    // eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzb20uempscm1vdmllLmNuIiwiYXVkIjoic29tLnpqbHJtb3ZpZS5jbiIsImlhdCI6MTcxNTM0NDk2MywibmJmIjoxNzE1MzQ0OTYzLCJleHAiOjE3MTc3NjQxNjMsImRhdGEiOnsiaWQiOjcxNDYzMiwidXNlcm5hbWUiOjcxNDYzMiwic3RhdHVzIjoxLCJvcGVuaWQiOiJvUXpFZjQ3a1ZLQ3F6bzRPSXl1ZHBZVllwX2g0In19.mwidYdjsGHIEnDxWlihB2LVdCtt0o1v_rrdbvSbSe50
    selfToken: "", // 平台自身token
    userInfo: user || {} // 用户信息
  }),
  getters: {
    // sfc上影token
    isAdmin(state) {
      return state.userInfo.name === "暖光";
    },
    loginMobile(state) {
      return state.userInfo.mobile;
    }
  },
  actions: {
    // 设置猎人票务平台token
    setLierenPlatToken(data) {
      console.warn("设置猎人平台token", data);
      window.localStorage.setItem("lierenToken", data);
      this.lierenToken = data;
    },
    // 设置芒果票务平台token
    setMangguoPlatToken(data) {
      console.warn("设置芒果平台token", data);
      window.localStorage.setItem("mangguoToken", data);
      this.mangguoToken = data;
    },
    // 设置蚂蚁票务平台token
    setMayiPlatToken(data) {
      console.warn("设置蚂蚁平台token", data);
      window.localStorage.setItem("mayiToken", data);
      this.mayiToken = data;
    },
    // 设置洋葱票务平台token
    setYangcongPlatToken(data) {
      console.warn("设置洋葱平台token", data);
      window.localStorage.setItem("yangcongToken", data);
      this.yangcongToken = data;
    },
    // 设置哈哈票务平台token
    setHahaPlatToken(data) {
      console.warn("设置哈哈平台token", data);
      window.localStorage.setItem("hahaToken", data);
      this.hahaToken = data;
    },
    // 设置自身平台token
    setSelfPlatToken(data) {
      console.warn("设置自身平台token", data);
      this.selfToken = data.token;
      this.userInfo = data.user;
      window.localStorage.setItem("selfToken", data.token);
      window.localStorage.setItem("userInfo", JSON.stringify(data.user));
    },
    // 删除自身平台token
    removeSelfPlatToken() {
      window.localStorage.removeItem("selfToken");
      this.selfToken = "";
    },
    setMemberPwd(data) {
      console.log("设置会员卡密码", data);
      this.userInfo.member_pwd = data;
    }
  }
});
