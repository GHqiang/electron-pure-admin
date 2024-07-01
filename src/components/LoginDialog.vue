<!-- 卡新增编辑弹框 -->
<template>
  <div>
    <!-- 对话框 -->
    <el-dialog
      v-model="showSfcDialog"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :title="dialogTitle"
      width="50%"
      @close="resetForm(loginFormRef)"
    >
      <el-form
        ref="loginFormRef"
        :model="formData"
        :rules="rules"
        label-width="120px"
      >
        <el-form-item label="影线名称" prop="app_name">
          <el-select
            v-model="formData.app_name"
            placeholder="请选择影线名称"
            clearable
            @change="shadowLineChange"
          >
            <el-option
              v-for="(keyValue, keyName) in APP_LIST"
              :key="keyName"
              :label="keyValue"
              :value="keyName"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="所属账号" prop="mobile">
          <el-input
            v-model="formData.mobile"
            placeholder="请输入该卡绑定的手机号"
            clearable
          />
        </el-form-item>
        <el-form-item label="Session ID" prop="session_id">
          <el-input
            v-model="formData.session_id"
            placeholder="请输入Session ID"
            clearable
          />
        </el-form-item>
        <el-form-item label="会员卡密码" prop="member_pwd">
          <el-input
            v-model="formData.member_pwd"
            placeholder="请输入会员卡密码"
            clearable
          />
        </el-form-item>
        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="formData.remark"
            placeholder="请输入备注"
            clearable
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveCard">保存</el-button>
          <el-button @click="cancel(loginFormRef)">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from "vue";
import { ElLoading, ElMessage } from "element-plus";
import { APP_LIST } from "@/common/constant";
const loginFormRef = ref(null);
// 父传子props
defineProps({
  dialogTitle: String
});

//defineEmits接受一个数组，元素为自定义事件名
//返回一个触发器，用于触发事件，第一个参数是具体事件名，第二个是传递的值
// 子传父emit
let $emit = defineEmits([`submit`]);

// 是否显示对话框
const showSfcDialog = ref(false);

// 表单数据
let formData = reactive({
  id: "",
  app_name: "",
  session_id: "",
  member_pwd: "",
  mobile: "",
  remark: ""
});
const validatePhoneNumber = (rule, value, callback) => {
  if (!value) {
    return callback(new Error("请输入手机号"));
  }
  const reg = /^1[3-9]\d{9}$/;
  if (reg.test(value)) {
    callback();
  } else {
    callback(new Error("请输入有效的手机号"));
  }
};

const rules = {
  app_name: [
    { required: true, message: "影线名称不能为空", trigger: ["change", "blur"] }
  ],
  session_id: [
    { required: true, message: "Session ID不能为空", trigger: "blur" }
  ],
  member_pwd: [
    { required: true, message: "会员卡密码不能为空", trigger: "blur" }
  ],
  mobile: [
    {
      required: true,
      validator: validatePhoneNumber,
      trigger: ["change", "blur"]
    }
  ]
};

// 重置表单
const resetForm = el => {
  console.log("重置表单", el);
  if (el !== 1) {
    formData.id = "";
    formData.app_name = "";
  }
  formData.session_id = "";
  formData.member_pwd = "";
  formData.mobile = "";
  formData.remark = "";
};

// 影线改变
const shadowLineChange = async val => {
  // console.log("val", val);
  resetForm(1);
};
// 打开弹窗
const open = async loginInfo => {
  try {
    const loading = ElLoading.service({
      lock: true,
      text: "Loading",
      background: "rgba(0, 0, 0, 0.7)"
    });
    if (loginInfo) {
      let formInfo = JSON.parse(JSON.stringify(loginInfo));
      if (formInfo.id !== undefined) {
        formData.id = formInfo.id;
        formData.app_name = formInfo.app_name;
        formData.session_id = formInfo.session_id;
        formData.member_pwd = formInfo.member_pwd;
        formData.mobile = formInfo.mobile;
        formData.remark = formInfo.remark;
      } else {
        // 新增
        formData.app_name = formInfo.app_name;
      }
    }
    loading.close();
    showSfcDialog.value = true;
  } catch (error) {
    console.warn("打开会员卡弹框异常", error);
    loading.close();
    showSfcDialog.value = false;
  }
};

// 保存规则
const saveCard = async () => {
  loginFormRef.value.validate(async valid => {
    if (valid) {
      // 提交逻辑
      console.log("表单提交的数据:", formData);
      // ElMessage.success("必填数据校验成功！");
      $emit("submit", formData);
    } else {
      ElMessage.warning("表单校验失败");
      return false;
    }
  });
};

// 关闭
const closeTck = () => {
  console.log("关闭弹框");
  showSfcDialog.value = false;
  resetForm();
};
// 取消
const cancel = el => {
  console.log("取消", el);
  showSfcDialog.value = false;
  resetForm();
};

// 子暴露给父组件的值或方法$refs
defineExpose({
  open,
  closeTck
});
</script>
