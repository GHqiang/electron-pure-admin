<script setup>
import Motion from "./utils/motion";
import { useRouter } from "vue-router";
import { message } from "@/utils/message";
import { loginRules } from "./utils/rule";
import { useNav } from "@/layout/hooks/useNav";
import { useLayout } from "@/layout/hooks/useLayout";
import { useUserStoreHook } from "@/store/modules/user";
import { initRouter, getTopMenu } from "@/router/utils";
import { bg, avatar, illustration } from "./utils/static";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { ref, reactive, toRaw, onMounted, onBeforeUnmount } from "vue";
import { useDataThemeChange } from "@/layout/hooks/useDataThemeChange";

import dayIcon from "@/assets/svg/day.svg?component";
import darkIcon from "@/assets/svg/dark.svg?component";
import Lock from "@iconify-icons/ri/lock-fill";
import User from "@iconify-icons/ri/user-3-fill";

import { getCurrentTime } from "@/utils/utils";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const tokens = platTokens();

import { useDataTableStore } from "@/store/offerRule";
const rules = useDataTableStore();
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();

import { useCinemaCodeMatchList } from "@/store/specialNameRule";
const cinemaCodeMatchObj = useCinemaCodeMatchList();
import { useCinemaList } from "@/store/cinemaList.js";
const useCinemaListObj = useCinemaList();
defineOptions({
  name: "Login"
});
const router = useRouter();
const loading = ref(false);
const ruleFormRef = ref();

const { initStorage } = useLayout();
initStorage();

const { dataTheme, overallStyle, dataThemeChange } = useDataThemeChange();
dataThemeChange(overallStyle.value);
const { title } = useNav();

const ruleForm = reactive({
  username: "",
  password: ""
});

// 设置本地的影院信息列表
const setLocalCinemaList = async rule => {
  let params = {};
  if (rule != 2) {
    params.is_out_use = 1;
  }
  const res = await svApi.queryCinemaList(params);
  let cinemaList = res.data.cinemaList || [];
  // console.log("cinemaList", cinemaList);
  useCinemaListObj.setCinemaInfoList(cinemaList);
};

// 设置本地的影院映射列表
const setLocalCinemaCodeMatchList = async () => {
  try {
    const res = await svApi.queryCinemaMatchList({});
    let cinemaList = res.data.cinemaList || [];
    cinemaCodeMatchObj.setCinemaCodeMatchList(cinemaList);
  } catch (error) {
    console.warn("设置本地的影院映射列表异常", error);
  }
};
// 设置本地的规则列表
const setLocalRuleList = async rule => {
  try {
    const ruleRes = await svApi.queryRuleList({
      rule
    });
    // console.log("ruleRes", ruleRes);
    let ruleRecords = ruleRes.data.ruleList || [];
    ruleRecords = ruleRecords.filter(item => ["1", "3"].includes(item.status));
    ruleRecords.forEach(item => {
      item.includeCityNames = JSON.parse(item.includeCityNames);
      item.excludeCityNames = JSON.parse(item.excludeCityNames);
      item.includeCinemaNames = JSON.parse(item.includeCinemaNames);
      item.excludeCinemaNames = JSON.parse(item.excludeCinemaNames);
      item.includeHallNames = JSON.parse(item.includeHallNames);
      item.excludeHallNames = JSON.parse(item.excludeHallNames);
      item.includeFilmNames = JSON.parse(item.includeFilmNames);
      item.excludeFilmNames = JSON.parse(item.excludeFilmNames);
      item.platOfferList = JSON.parse(item.platOfferList || "[]");
      item.weekDay = JSON.parse(item.weekDay);
      item.film_type = item.film_type ? item.film_type?.split(",") : [];
    });
    rules.setRuleList(ruleRecords);
  } catch (error) {
    console.warn("进入报价队列页面时设置本地规则数据异常", error);
  }
};

// 设置本地的登录信息列表
const setLocalLoginList = async rule => {
  const loginRes = await svApi.queryLoginList({ rule });
  // console.log("loginRes", loginRes);
  let loginRecords = loginRes.data.loginList || [];
  loginRecords = loginRecords.map(item => ({
    app_name: item.app_name,
    mobile: item.mobile,
    session_id: item.session_id,
    tid: item.tid,
    member_pwd: item.member_pwd,
    first: item.first,
    is_xiaohao: item.is_xiaohao,
    link_user_id: item.link_user_id
  }));
  userInfoAndTokens.setLoginInfoList(
    loginRecords.filter(item => item.is_xiaohao != 1)
  );
  userInfoAndTokens.setAllLoginInfoList(loginRecords);
};
const onLogin = async formEl => {
  if (!formEl) return;
  await formEl.validate(async (valid, fields) => {
    if (valid) {
      try {
        loading.value = true;
        const res = await useUserStoreHook().loginByUsername({
          username: ruleForm.username,
          password: "admin123"
        });
        if (res.success) {
          const loginRes = await svApi.login({
            name: ruleForm.username,
            pwd: ruleForm.password
          });
          console.log("loginRes", loginRes);
          tokens.setSelfPlatToken(loginRes.data);
          await svApi.updateUser({
            login_time: getCurrentTime()
          });
          let rule = loginRes.data?.user.rule;
          await setLocalCinemaList(rule);
          await setLocalCinemaCodeMatchList();
          await setLocalLoginList(rule);
          await setLocalRuleList(rule);
          // 获取后端路由
          await initRouter(rule);
          let getTopMenuPath = getTopMenu(true).path;
          console.log("getTopMenuPath", getTopMenuPath);
          router.push(getTopMenuPath).then(() => {
            message("登录成功", { type: "success" });
          });
        } else {
          message("登录失败", { type: "error" });
        }
        loading.value = false;
      } catch (error) {
        useUserStoreHook().logOut();
        loading.value = false;
      }
    }
  });
};

/** 使用公共函数，避免`removeEventListener`失效 */
function onkeypress({ code }) {
  if (code === "Enter") {
    onLogin(ruleFormRef.value);
  }
}

onMounted(() => {
  window.document.addEventListener("keypress", onkeypress);
});

onBeforeUnmount(() => {
  window.document.removeEventListener("keypress", onkeypress);
});
</script>

<template>
  <div class="select-none">
    <img :src="bg" class="wave" />
    <div class="flex-c absolute right-5 top-3">
      <!-- 主题 -->
      <el-switch
        v-model="dataTheme"
        inline-prompt
        :active-icon="dayIcon"
        :inactive-icon="darkIcon"
        @change="dataThemeChange"
      />
    </div>
    <div class="login-container">
      <div class="img">
        <component :is="toRaw(illustration)" />
      </div>
      <div class="login-box">
        <div class="login-form">
          <avatar class="avatar" />
          <Motion>
            <h2 class="outline-none">{{ title }}</h2>
          </Motion>

          <el-form
            ref="ruleFormRef"
            :model="ruleForm"
            :rules="loginRules"
            size="large"
          >
            <Motion :delay="100">
              <el-form-item
                :rules="[
                  {
                    required: true,
                    message: '请输入账号',
                    trigger: 'blur'
                  }
                ]"
                prop="username"
              >
                <el-input
                  v-model="ruleForm.username"
                  clearable
                  placeholder="账号"
                  :prefix-icon="useRenderIcon(User)"
                />
              </el-form-item>
            </Motion>

            <Motion :delay="150">
              <el-form-item prop="password">
                <el-input
                  v-model="ruleForm.password"
                  clearable
                  show-password
                  placeholder="密码"
                  :prefix-icon="useRenderIcon(Lock)"
                />
              </el-form-item>
            </Motion>

            <Motion :delay="250">
              <el-button
                class="w-full mt-4"
                size="default"
                type="primary"
                :loading="loading"
                @click="onLogin(ruleFormRef)"
              >
                登录
              </el-button>
            </Motion>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url("@/style/login.css");
</style>

<style lang="scss" scoped>
:deep(.el-input-group__append, .el-input-group__prepend) {
  padding: 0;
}
</style>
