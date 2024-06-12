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

    <SfcLogin
      v-if="sfcLoginActive"
      :app-name="appName"
      @loginSuccess="sfcLoginSuccess"
    ></SfcLogin>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { storeToRefs } from "pinia";
import SfcLogin from "@/components/AppLogin/SfcLogin.vue";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
const {
  sfcToken,
  jiujinToken,
  jinjiToken,
  ningboToken,
  lainaToken,
  hemaToken
} = storeToRefs(userInfoAndTokens);

const { setSfcUserInfo, removeSfcUserInfo } = userInfoAndTokens;
import { APP_LIST } from "@/common/constant";

const appList = ref([
  { appName: "sfc", appToken: sfcToken.value },
  { appName: "jiujin", appToken: jiujinToken.value },
  { appName: "jinji", appToken: jinjiToken.value },
  { appName: "ningbo", appToken: ningboToken.value },
  { appName: "laina", appToken: lainaToken.value },
  { appName: "hema", appToken: hemaToken.value }
]);
console.log("appList", appList);
const appName = ref("sfc");
const sfcLoginActive = ref(false);

const appLogin = name => {
  appName.value = name;
  sfcLoginActive.value = true;
};

const sfcLoginSuccess = userInfo => {
  sfcLoginActive.value = false;
  let inx = appList.value.findIndex(item => item.appName === appName.value);
  if (inx) {
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
