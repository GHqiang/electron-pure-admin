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
    shengToken: "",
    yinghuasuanToken: "",
    // eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzb20uempscm1vdmllLmNuIiwiYXVkIjoic29tLnpqbHJtb3ZpZS5jbiIsImlhdCI6MTcxNTM0NDk2MywibmJmIjoxNzE1MzQ0OTYzLCJleHAiOjE3MTc3NjQxNjMsImRhdGEiOnsiaWQiOjcxNDYzMiwidXNlcm5hbWUiOjcxNDYzMiwic3RhdHVzIjoxLCJvcGVuaWQiOiJvUXpFZjQ3a1ZLQ3F6bzRPSXl1ZHBZVllwX2g0In19.mwidYdjsGHIEnDxWlihB2LVdCtt0o1v_rrdbvSbSe50
    selfToken: "", // 平台自身token
    userInfo:
      user ||
      {
        // rule: "1", 1-管理员 2-内部用户 3-外部用户
        // "user_id":1,
        // "name":"张三",
        // "phone":"15237761435",
        // "member_pwd":"123123"
      } // 用户信息
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
    // 设置省平台token
    setShengPlatToken(data) {
      console.warn("设置省平台token", data);
      window.localStorage.setItem("shengToken", data);
      this.shengToken = data;
    },
    // 设置影划算平台token
    setYinghuasuanPlatToken(data) {
      console.warn("设置影划算平台token", data);
      window.localStorage.setItem("yinghuasuanToken", data);
      this.yinghuasuanToken = data;
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
