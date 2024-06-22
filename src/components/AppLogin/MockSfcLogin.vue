<template>
  <div class="login-sfc">
    <el-divider content-position="center"
      >{{ APP_LIST[appName] }}登录</el-divider
    >
    <!-- 表单 -->
    <el-form ref="formRef" :model="formData" :rules="rules" label-width="120px">
      <!-- 手机号输入框 -->
      <el-form-item label="手机号" prop="phoneNumber">
        <el-input
          v-model.number="formData.phoneNumber"
          placeholder="请输入该影院的手机号"
        ></el-input>
      </el-form-item>

      <!-- Session 输入框 -->
      <el-form-item label="Session ID" prop="sessionId">
        <el-input
          v-model="formData.sessionId"
          placeholder="请输入该影院的Session ID"
        ></el-input>
      </el-form-item>

      <el-form-item label="会员卡密码" prop="memberPwd">
        <el-input
          v-model="formData.memberPwd"
          placeholder="请输入该影院的会员卡密码"
        ></el-input>
      </el-form-item>

      <!-- 提交按钮 -->
      <el-form-item>
        <el-button type="primary" @click="submitForm">提交</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { reactive, ref, defineExpose, watch } from "vue";
import { ElMessage } from "element-plus";
import { APP_LIST } from "@/common/constant";
let $emit = defineEmits([`loginSuccess`]);
// 父传子props
const props = defineProps({
  appName: String
});
// 监听变化
watch(
  () => props.appName,
  (newVal, oldVal) => {
    console.log(`appName 的值从 '${oldVal}' 变为 '${newVal}'`);
    // resetForm()
  }
);

const formRef = ref(null);
const formData = reactive({
  phoneNumber: "",
  sessionId: "",
  memberPwd: ""
});

const rules = {
  phoneNumber: [
    { required: true, message: "手机号不能为空", trigger: "blur" },
    {
      pattern: /^1[3-9]\d{9}$/,
      message: "请输入正确的手机号格式",
      trigger: "blur"
    }
  ],
  sessionId: [
    { required: true, message: "Session ID不能为空", trigger: "blur" }
    // 如果Session ID有特定格式要求，可以在这里添加pattern验证
  ],
  memberPwd: [
    { required: true, message: "会员卡密码不能为空", trigger: "blur" }
    // 如果Session ID有特定格式要求，可以在这里添加pattern验证
  ]
};

const submitForm = () => {
  formRef.value.validate(async valid => {
    if (valid) {
      // 提交逻辑
      console.log("表单提交的数据:", formData);
      ElMessage.success("提交成功！");
      $emit("loginSuccess", {
        mobile: formData.phoneNumber,
        session_id: formData.sessionId,
        member_pwd: formData.memberPwd
      });
    } else {
      ElMessage.warn("表单校验失败");
      return false;
    }
  });
};

const resetForm = () => {
  formRef.value.resetFields();
};
// 使用defineExpose暴露方法
defineExpose({
  resetForm
});
</script>
<style scoped>
.login-sfc {
  width: 60%;
}
</style>
