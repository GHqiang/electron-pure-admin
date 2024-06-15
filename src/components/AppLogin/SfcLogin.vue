<template>
  <div class="login-sfc">
    <el-divider content-position="center"
      >{{ APP_LIST[appName] }}登录</el-divider
    >

    <el-form label-width="100px">
      <el-form-item label="手机号">
        <el-input
          v-model="phoneNumber"
          placeholder="请输入手机号"
          @input="validatePhoneNumber"
        ></el-input>
      </el-form-item>

      <el-form-item v-if="showCaptcha" label="图形验证码">
        <el-row>
          <el-col :span="16">
            <el-input
              v-model="captchaCode"
              placeholder="请输入图形验证码"
            ></el-input>
          </el-col>
          <el-col :span="7" :offset="1">
            <el-image
              :src="captchaUrl"
              fit="contain"
              @click="refreshCaptcha"
              v-if="captchaUrl"
              v-throttle
            />
            <el-button v-if="!captchaUrl" @click="getCaptcha" v-throttle
              >获取验证码</el-button
            >
          </el-col>
        </el-row>
      </el-form-item>

      <el-form-item v-if="showSmsCode" label="短信验证码">
        <el-input v-model="smsCode" placeholder="请输入短信验证码"></el-input>
      </el-form-item>

      <el-form-item>
        <el-button
          type="primary"
          @click="sendSmsCode"
          v-if="captchaCode && !sentSms"
          v-throttle
          >发送短信验证码</el-button
        >
        <el-button
          type="primary"
          @click="autoLogin"
          v-if="smsCode && sentSms"
          v-throttle
          >登录</el-button
        >
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { ref } from "vue";
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElButton,
  ElImage,
  ElRow,
  ElCol
} from "element-plus";
import { SFC_API_OBJ } from "@/common/index.js";
import { APP_LIST } from "@/common/constant";
let $emit = defineEmits([`loginSuccess`]);
// 父传子props
const props = defineProps({
  appName: String
});
const phoneNumber = ref(""); // 手机号
const captchaCode = ref(""); // 图形验证码
const smsCode = ref(""); // 短信验证码
const captchaUrl = ref(""); // 图形验证码url
const sentSms = ref(false); // 是否发送短信
const showCaptcha = ref(false); // 是否展示图形验证码
const showSmsCode = ref(false); // 是否展示短信验证码输入框

// 获取图形验证码
async function getCaptcha() {
  try {
    if (phoneNumber.value.length >= 11) {
      let params = {
        mobile: phoneNumber.value,
        graph_validate_code: ""
      };
      console.log("获取图形验证码参数", params, props.appName);
      const res = await SFC_API_OBJ[props.appName].getSmsCode(params);
      console.log("获取图形验证码返回", res);
      captchaUrl.value = res.codeurl;
      showCaptcha.value = true;
    }
  } catch (error) {
    console.warn("获取图形验证码异常", error);
  }
}

// 刷新图形验证码
function refreshCaptcha() {
  captchaUrl.value = "";
  sentSms.value = false;
  getCaptcha();
}

// 获取短信验证码
async function sendSmsCode() {
  try {
    if (captchaCode.value) {
      let params = {
        mobile: phoneNumber.value,
        graph_validate_code: captchaCode.value
      };
      console.log("获取短信验证码参数", params);
      const res = await SFC_API_OBJ[props.appName].getSmsCode(params);
      console.log("获取短信验证码返回", res);
      showSmsCode.value = true;
      sentSms.value = true;
    }
  } catch (error) {
    console.warn("获取短信验证码异常", error);
  }
}

// 登录
async function autoLogin() {
  try {
    if (smsCode.value && sentSms.value) {
      let params = {
        code: smsCode.value,
        from_scene: "",
        mobile: phoneNumber.value,
        qr_code: "",
        wx_code: "" // wx.login获取的临时登录凭证（每次都会变）app传空也能调用成功
      };
      console.log("验证短信并登录参数", params);
      const res = await SFC_API_OBJ[props.appName].verifyLogin(params);
      console.log("验证短信并登录返回", res);
      $emit("loginSuccess", res.data.user_data);
    }
  } catch (error) {
    console.warn("验证短信并登录异常", error);
  }
}

// 在手机号输入框输入内容时触发
function validatePhoneNumber() {
  if (phoneNumber.value.length >= 11) {
    showCaptcha.value = true;
  } else {
    showCaptcha.value = false;
    showSmsCode.value = false;
  }
}
</script>
<style scoped>
.login-sfc {
  width: 60%;
}
</style>
