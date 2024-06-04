import { defineStore } from "pinia";

export const platTokens = defineStore("platTokens", {
  state: () => ({
    lierenToken: "",
    // eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzb20uempscm1vdmllLmNuIiwiYXVkIjoic29tLnpqbHJtb3ZpZS5jbiIsImlhdCI6MTcxNTM0NDk2MywibmJmIjoxNzE1MzQ0OTYzLCJleHAiOjE3MTc3NjQxNjMsImRhdGEiOnsiaWQiOjcxNDYzMiwidXNlcm5hbWUiOjcxNDYzMiwic3RhdHVzIjoxLCJvcGVuaWQiOiJvUXpFZjQ3a1ZLQ3F6bzRPSXl1ZHBZVllwX2g0In19.mwidYdjsGHIEnDxWlihB2LVdCtt0o1v_rrdbvSbSe50
    selfToken: "" // 平台自身token
  }),
  actions: {
    // 设置猎人票务平台token
    setLierenPlatToken(data) {
      console.warn("设置猎人平台token", data);
      window.localStorage.setItem("lierenToken", data);
      this.lierenToken = data;
    },
    // 删除猎人票务平台token
    removeLierenPlatToken() {
      window.localStorage.removeItem("lierenToken");
      this.lierenToken = "";
    },
    // 设置自身平台token
    setSelfPlatToken(data) {
      console.warn("设置自身平台token", data);
      window.localStorage.setItem("selfToken", data);
      this.selfToken = data;
    },
    // 删除自身平台token
    removeSelfPlatToken() {
      window.localStorage.removeItem("selfToken");
      this.selfToken = "";
    }
  }
});
