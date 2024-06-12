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
      jiujin: null,
      jinji: null,
      laina: null,
      ningbo: null,
      hema: null
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
    // 华夏久金token
    jiujinToken(state) {
      return state.allUserInfo?.jiujin?.session_id || "";
    },
    jiujinUserMobile(state) {
      return state.allUserInfo?.jiujin?.mobile || "";
    },
    // 莱纳龙域token
    lainaToken(state) {
      return state.allUserInfo?.laina?.session_id || "";
    },
    lainaUserMobile(state) {
      return state.allUserInfo?.laina?.mobile || "";
    },
    // 北京金鸡token
    jinjiToken(state) {
      return state.allUserInfo?.jinji?.session_id || "";
    },
    jinjiUserMobile(state) {
      return state.allUserInfo?.jinji?.mobile || "";
    },
    // 宁波影都token
    ningboToken(state) {
      return state.allUserInfo?.ningbo?.session_id || "";
    },
    ningboUserMobile(state) {
      return state.allUserInfo?.ningbo?.mobile || "";
    },
    // 河马国际token
    hemaToken(state) {
      return state.allUserInfo?.hema?.session_id || "";
    },
    hemaUserMobile(state) {
      return state.allUserInfo?.hema?.mobile || "";
    },
    lmaToken(state) {
      return state.allUserInfo?.lumiai?.session_id || "";
    }
  },
  actions: {
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
