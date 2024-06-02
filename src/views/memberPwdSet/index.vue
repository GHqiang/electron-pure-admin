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

<script lang="ts" setup>
import { reactive, ref } from "vue";
import type { FormInstance, FormRules } from "element-plus";

const ruleFormRef = ref<FormInstance>();
const pwd = ref<String>("");
const isActive = ref<Boolean>(false);

let memberPwd = localStorage.getItem("memberPwd");
if (memberPwd) {
  pwd.value = memberPwd;
}
const validatePass = (rule: any, value: any, callback: any) => {
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
const validatePass2 = (rule: any, value: any, callback: any) => {
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

const rules = reactive<FormRules<typeof ruleForm>>({
  pass: [{ validator: validatePass, trigger: "blur" }],
  checkPass: [{ validator: validatePass2, trigger: "blur" }]
});

const submitForm = (formEl: FormInstance | undefined) => {
  if (!formEl) return;
  formEl.validate(valid => {
    if (valid) {
      console.log("submit!");
      localStorage.setItem("memberPwd", ruleForm.pass);
      isActive.value = false;
      pwd.value = ruleForm.pass;
    } else {
      console.log("error submit!");
    }
  });
};

const resetForm = (formEl: FormInstance | undefined) => {
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
