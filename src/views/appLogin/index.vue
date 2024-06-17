<template>
  <div class="login-container">
    <el-button-group
      v-for="(item, inx) in appList"
      :key="item.appName"
      class="m-r-10"
    >
      <el-button
        type="primary"
        v-if="!item.appToken"
        @click="appLogin(item.appName)"
        v-throttle
        >{{ APP_LIST[item.appName] }}登录</el-button
      >
      <el-button
        type="primary"
        v-else
        @click="removeSfcUserInfo(item.appName), (item.appToken = '')"
        v-throttle
        >{{ APP_LIST[item.appName] }}退出</el-button
      >
    </el-button-group>

    <MockSfcLogin
      ref="childRef"
      v-if="sfcLoginActive"
      :app-name="appName"
      @loginSuccess="sfcLoginSuccess"
    ></MockSfcLogin>
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
</style>
