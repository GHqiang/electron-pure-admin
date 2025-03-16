<template>
  <div class="login-container">
    <el-button-group
      v-for="(item, inx) in appList"
      :key="item.appName"
      class="m-r-10 m-t-10"
    >
      <el-button
        v-if="!item.appToken"
        v-throttle
        type="primary"
        @click="appLogin(item.appName)"
        >{{ APP_LIST[item.appName] }}登录</el-button
      >
      <el-button
        v-else
        v-throttle
        type="primary"
        @click="removeSfcUserInfo(item.appName), (item.appToken = '')"
        >{{ APP_LIST[item.appName] }}退出</el-button
      >
    </el-button-group>

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
// 这种方式相当于解包，不再具有响应性
const { loginInfoList } = userInfoAndTokens;
// ✅ 这样写是响应式的
// 💡 当然你也可以直接使用 `userInfoAndTokens.loginInfoList`
// const loginInfoList = computed(() => userInfoAndTokens.loginInfoList)

const { setSfcUserInfo, removeSfcUserInfo } = userInfoAndTokens;
import { GET_APP_LIST } from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());
const childRef = ref(null);

const appList = ref([]);
Object.keys(APP_LIST.value).forEach(item => {
  let obj = loginInfoList.find(itemA => itemA.app_name === item);
  appList.value.push({
    appName: item,
    appToken: obj?.session_id || ""
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
