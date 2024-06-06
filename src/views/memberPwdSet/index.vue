<template>
  <div style="width: 60%; padding: 20px">
    <div>
      <p v-if="!pwd" style="margin-bottom: 15px">
        你还未设置过会员卡密码，请先设置密码
      </p>
      <p v-else style="margin-bottom: 15px">你已设置过会员卡密码：{{ pwd }}</p>

      <el-button type="primary" v-if="!pwd && !isActive" @click="setPwd()">
        设置密码
      </el-button>
      <el-button type="primary" v-if="pwd && !isActive" @click="updatePwd()">
        修改密码
      </el-button>
    </div>
    <el-form
      v-if="isActive"
      ref="ruleFormRef"
      style="max-width: 600px"
      :model="ruleForm"
      status-icon
      :rules="rules"
      label-width="auto"
      class="demo-ruleForm"
    >
      <el-form-item label="输入密码" prop="pass">
        <el-input v-model="ruleForm.pass" type="password" autocomplete="off" />
      </el-form-item>
      <el-form-item label="确认密码" prop="checkPass">
        <el-input
          v-model="ruleForm.checkPass"
          type="password"
          autocomplete="off"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="submitForm(ruleFormRef)">
          保存
        </el-button>
        <el-button @click="resetForm(ruleFormRef)">重置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { reactive, ref } from "vue";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

const ruleFormRef = ref();
const pwd = ref("");
const isActive = ref(false);

let member_pwd = tokens.userInfo.member_pwd;
if (member_pwd) {
  pwd.value = member_pwd;
}
const validatePass = (rule, value, callback) => {
  if (value === "") {
    callback(new Error("Please input the password"));
  } else {
    if (ruleForm.checkPass !== "") {
      if (!ruleFormRef.value) return;
      ruleFormRef.value.validateField("checkPass");
    }
    callback();
  }
};
const validatePass2 = (rule, value, callback) => {
  if (value === "") {
    callback(new Error("Please input the password again"));
  } else if (value !== ruleForm.pass) {
    callback(new Error("Two inputs don't match!"));
  } else {
    callback();
  }
};

const ruleForm = reactive({
  pass: "",
  checkPass: ""
});

const rules = reactive({
  pass: [{ validator: validatePass, trigger: "blur" }],
  checkPass: [{ validator: validatePass2, trigger: "blur" }]
});

const submitForm = formEl => {
  if (!formEl) return;
  formEl.validate(async valid => {
    if (valid) {
      console.log("submit!");
      await svApi.setMemBerPwd({
        user_id: tokens.userInfo.user_id,
        member_pwd: ruleForm.pass
      });
      isActive.value = false;
      pwd.value = ruleForm.pass;
      tokens.setMemberPwd(ruleForm.pass);
    } else {
      console.log("error submit!");
    }
  });
};

const resetForm = formEl => {
  if (!formEl) return;
  formEl.resetFields();
};

const setPwd = () => {
  resetForm(ruleFormRef.value);
  isActive.value = true;
};

const updatePwd = () => {
  resetForm(ruleFormRef.value);
  isActive.value = true;
};
</script>
