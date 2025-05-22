<!-- 影院新增编辑弹框 -->
<template>
  <div>
    <!-- 对话框 -->
    <el-dialog
      v-model="showSfcDialog"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      title="编辑影院映射信息"
      width="50%"
      @close="resetForm(loginFormRef)"
    >
      <el-form
        ref="loginFormRef"
        :model="formData"
        :rules="rules"
        label-width="140px"
      >
        <el-form-item label="影线所属类型" prop="app_type_name">
          <el-input
            v-model="formData.app_type_name"
            disabled
            placeholder="请输入影线所属类型"
            clearable
          />
        </el-form-item>
        <el-form-item label="影线名称" prop="app_label">
          <el-input
            v-model="formData.app_label"
            disabled
            placeholder="请输入影线名称"
            clearable
          />
        </el-form-item>
        <el-form-item label="影院名称" prop="app_cinema_name">
          <el-input
            v-model="formData.app_cinema_name"
            disabled
            placeholder="请输入影院名称"
            clearable
          />
        </el-form-item>
        <el-form-item label="影院唯一标识" prop="app_cinema_code">
          <el-input
            v-model="formData.app_cinema_code"
            disabled
            placeholder="请输入影院唯一标识"
            clearable
          />
        </el-form-item>
        <el-form-item label="平台影院编码" prop="plat_cinema_code">
          <el-input
            v-model="formData.plat_cinema_code"
            placeholder="请输入平台影院编码"
            clearable
          />
        </el-form-item>
        <!-- <el-form-item label="状态" prop="status">
          <el-radio-group v-model="formData.status">
            <el-radio value="1" size="large">正常</el-radio>
            <el-radio value="2" size="large">禁用</el-radio>
            <el-radio value="3" size="large">已删除</el-radio>
          </el-radio-group>
        </el-form-item> -->
        <el-form-item>
          <el-button type="primary" @click="saveCinema">保存</el-button>
          <el-button @click="cancel(loginFormRef)">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from "vue";
import { ElLoading, ElMessage } from "element-plus";

const loginFormRef = ref(null);

//defineEmits接受一个数组，元素为自定义事件名
//返回一个触发器，用于触发事件，第一个参数是具体事件名，第二个是传递的值
// 子传父emit
let $emit = defineEmits([`submit`]);

// 是否显示对话框
const showSfcDialog = ref(false);

// 表单数据
let formData = reactive({
  id: "",
  app_type_name: "",
  app_label: "",
  app_cinema_name: "",
  app_cinema_code: "",
  plat_cinema_code: ""
});

const rules = {
  plat_cinema_code: [
    { required: true, message: "平台影院编码不能为空", trigger: "blur" }
  ]
};

// 重置表单
const resetForm = el => {
  console.log("重置表单", el);
};

// 打开弹窗
const open = async cinemaInfo => {
  try {
    const loading = ElLoading.service({
      lock: true,
      text: "Loading",
      background: "rgba(0, 0, 0, 0.7)"
    });
    console.log("cinemaInfo", cinemaInfo);
    if (cinemaInfo) {
      let formInfo = JSON.parse(JSON.stringify(cinemaInfo));
      if (formInfo.id !== undefined) {
        formData.id = formInfo.id;
        formData.app_type_name = formInfo.app_type_name;
        formData.app_label = formInfo.app_label;
        formData.app_cinema_name = formInfo.app_cinema_name;
        formData.app_cinema_code = formInfo.app_cinema_code;
        formData.plat_cinema_code = formInfo.plat_cinema_code;
      }
    }
    loading.close();
    showSfcDialog.value = true;
  } catch (error) {
    console.warn("打开影院映射信息维护弹框异常", error);
    loading.close();
    showSfcDialog.value = false;
  }
};

// 保存规则
const saveCinema = async () => {
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
