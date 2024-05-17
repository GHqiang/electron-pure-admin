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
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import SfcLogin from "@/components/SfcLogin.vue";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
const { sfcToken } = storeToRefs(userInfoAndTokens);
const { setSfcUserInfo, removeSfcUserInfo } = userInfoAndTokens;

const sfcLoginActive = ref(false);

const sfcLoginSuccess = userInfo => {
  sfcLoginActive.value = false;
  setSfcUserInfo(userInfo);
};
</script>
