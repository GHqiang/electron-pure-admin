<template>
  <div class="login-container">
    <el-button
      type="primary"
      v-if="!sfcToken"
      @click="sfcLoginActive = true"
      v-throttle
      >sfc登录</el-button
    >
    <el-button type="primary" v-else @click="removeSfcUserInfo()" v-throttle
      >sfc退出</el-button
    >
    <SfcLogin v-if="sfcLoginActive" @loginSuccess="sfcLoginSuccess"></SfcLogin>

    <el-button
      type="primary"
      v-if="!jiujinToken"
      @click="jiujinLoginActive = true"
      v-throttle
      >久金登录</el-button
    >
    <el-button type="primary" v-else @click="removeJiujinUserInfo()" v-throttle
      >久金退出</el-button
    >
    <JiujinLogin
      v-if="jiujinLoginActive"
      @loginSuccess="jiujinLoginSuccess"
    ></JiujinLogin>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import SfcLogin from "@/components/SfcLogin.vue";
import JiujinLogin from "@/components/AppLogin/JiujinLogin.vue";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
const { sfcToken, jiujinToken } = storeToRefs(userInfoAndTokens);
const {
  setSfcUserInfo,
  removeSfcUserInfo,
  setJiujinUserInfo,
  removeJiujinUserInfo
} = userInfoAndTokens;

const sfcLoginActive = ref(false);
const jiujinLoginActive = ref(false);

const sfcLoginSuccess = userInfo => {
  sfcLoginActive.value = false;
  setSfcUserInfo(userInfo);
};

const jiujinLoginSuccess = userInfo => {
  jiujinLoginActive.value = false;
  setJiujinUserInfo(userInfo);
};
</script>
