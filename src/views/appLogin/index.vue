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

    <el-button
      type="primary"
      v-if="!jinjiToken"
      @click="jinjiLoginActive = true"
      v-throttle
      >金鸡登录</el-button
    >
    <el-button type="primary" v-else @click="removeJinjiUserInfo()" v-throttle
      >金鸡退出</el-button
    >

    <el-button
      type="primary"
      v-if="!lainaToken"
      @click="lainaLoginActive = true"
      v-throttle
      >莱纳登录</el-button
    >
    <el-button type="primary" v-else @click="removeLainaUserInfo()" v-throttle
      >莱纳退出</el-button
    >

    <el-button
      type="primary"
      v-if="!ningboToken"
      @click="ningboLoginActive = true"
      v-throttle
      >宁波影都登录</el-button
    >
    <el-button type="primary" v-else @click="removeNingboUserInfo()" v-throttle
      >宁波影都退出</el-button
    >

    <SfcLogin v-if="sfcLoginActive" @loginSuccess="sfcLoginSuccess"></SfcLogin>

    <JiujinLogin
      v-if="jiujinLoginActive"
      @loginSuccess="jiujinLoginSuccess"
    ></JiujinLogin>

    <JinjiLogin
      v-if="jinjiLoginActive"
      @loginSuccess="jinjiLoginSuccess"
    ></JinjiLogin>

    <LainaLogin
      v-if="lainaLoginActive"
      @loginSuccess="lainaLoginSuccess"
    ></LainaLogin>

    <NingboLogin
      v-if="ningboLoginActive"
      @loginSuccess="ningboLoginSuccess"
    ></NingboLogin>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { storeToRefs } from "pinia";
import SfcLogin from "@/components/AppLogin/SfcLogin.vue";
import JiujinLogin from "@/components/AppLogin/JiujinLogin.vue";
import JinjiLogin from "@/components/AppLogin/JinjiLogin.vue";
import NingboLogin from "@/components/AppLogin/NingboLogin.vue";
import LainaLogin from "@/components/AppLogin/LainaLogin.vue";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
const { sfcToken, jiujinToken, jinjiToken, ningboToken, lainaToken } =
  storeToRefs(userInfoAndTokens);
const {
  setSfcUserInfo,
  removeSfcUserInfo,
  setJiujinUserInfo,
  removeJiujinUserInfo,
  setJinjiUserInfo,
  removeJinjiUserInfo,
  setNingboUserInfo,
  removeNingboUserInfo,
  setLainaUserInfo,
  removeLainaUserInfo
} = userInfoAndTokens;

const sfcLoginActive = ref(false);
const jiujinLoginActive = ref(false);
const jinjiLoginActive = ref(false);
const ningboLoginActive = ref(false);
const lainaLoginActive = ref(false);

const sfcLoginSuccess = userInfo => {
  sfcLoginActive.value = false;
  setSfcUserInfo(userInfo);
};

const jiujinLoginSuccess = userInfo => {
  jiujinLoginActive.value = false;
  setJiujinUserInfo(userInfo);
};

const jinjiLoginSuccess = userInfo => {
  jinjiLoginActive.value = false;
  setJinjiUserInfo(userInfo);
};

const ningboLoginSuccess = userInfo => {
  ningboLoginActive.value = false;
  setNingboUserInfo(userInfo);
};

const lainaLoginSuccess = userInfo => {
  lainaLoginActive.value = false;
  setLainaUserInfo(userInfo);
};
</script>
