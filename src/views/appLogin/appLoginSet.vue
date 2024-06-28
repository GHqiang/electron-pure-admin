<template>
  <div class="login-container">
    <!-- 影院登录设置 -->
    <!-- 搞成一个列表，可自定义新增、编辑、删除 -->
    <!-- 一个影院可维护多个账号信息，出票时可以共用，这个失败就用另一个出 -->
    <MockSfcLogin
      v-if="sfcLoginActive"
      ref="childRef"
      :app-name="appName"
      @loginSuccess="sfcLoginSuccess"
    />
  </div>
</template>

<script setup>
import { ref } from "vue";
import MockSfcLogin from "@/components/AppLogin/MockSfcLogin.vue";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
const { allUserInfo } = userInfoAndTokens;

const { setSfcUserInfo, removeSfcUserInfo } = userInfoAndTokens;
import { APP_LIST } from "@/common/constant";
const childRef = ref(null);

const appList = ref([]);
Object.keys(APP_LIST).forEach(item => {
  appList.value.push({
    appName: item,
    appToken: allUserInfo[item]?.session_id || ""
  });
});

console.log("appList", appList);
const appName = ref("sfc");
const sfcLoginActive = ref(false);

const appLogin = name => {
  // 先清空一下数据
  if (childRef.value) {
    childRef.value.resetForm();
  }
  appName.value = name;
  sfcLoginActive.value = true;
};
const sfcLoginSuccess = userInfo => {
  sfcLoginActive.value = false;
  let inx = appList.value.findIndex(item => item.appName === appName.value);
  if (inx !== -1) {
    appList.value[inx].appToken = userInfo.session_id;
  }
  setSfcUserInfo({ appName: appName.value, userInfo });
};
</script>
<style scoped>
.m-r-10 {
  margin-right: 10px;
}
.m-t-10 {
  margin-top: 10px;
}
</style>
