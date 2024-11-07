<!-- 券类型新增编辑弹框 -->
<template>
  <div>
    <!-- 对话框 -->
    <el-dialog
      v-model="showSfcDialog"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :title="dialogTitle"
      width="50%"
      @close="resetForm(cardFormRef)"
    >
      <el-form
        ref="cardFormRef"
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
        <el-form-item label="券名称" prop="quan_name">
          <el-input
            v-model="formData.quan_name"
            placeholder="请输入券名称"
            clearable
          />
        </el-form-item>
        <el-form-item label="券类型" prop="quan_value">
          <el-input
            v-model="formData.quan_value"
            placeholder="请输入券类型"
            clearable
          />
        </el-form-item>
        <el-form-item label="券成本" prop="quan_cost">
          <el-input
            v-model="formData.quan_cost"
            placeholder="请输入券成本"
            clearable
          />
        </el-form-item>
        <el-form-item label="券标识" prop="quan_flag">
          <el-input
            v-model="formData.quan_flag"
            placeholder="请输入券标识"
            clearable
          />
        </el-form-item>
        <el-form-item label="是否入库" prop="is_store">
          <el-radio-group v-model="formData.is_store">
            <el-radio value="1" size="large">是</el-radio>
            <el-radio value="2" size="large">否</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="是否外部可用" prop="is_outuse">
          <el-radio-group v-model="formData.is_outuse">
            <el-radio value="1" size="large">是</el-radio>
            <el-radio value="2" size="large">否</el-radio>
          </el-radio-group>
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
          <el-button @click="cancel(cardFormRef)">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from "vue";
import { ElLoading, ElMessage } from "element-plus";
import { APP_LIST } from "@/common/constant";
const cardFormRef = ref(null);
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
  quan_name: "",
  quan_value: "",
  quan_cost: "",
  quan_flag: "",
  is_store: "2",
  is_outuse: "2",
  remark: ""
});

const rules = {
  app_name: [{ required: true, message: "影线名称不能为空", trigger: "blur" }],
  quan_name: [{ required: true, message: "券名称不能为空", trigger: "blur" }],
  quan_value: [{ required: true, message: "券类型不能为空", trigger: "blur" }],
  quan_cost: [{ required: true, message: "券成本不能为空", trigger: "blur" }],
  quan_flag: [{ required: true, message: "券标识不能为空", trigger: "blur" }]
};

// 重置表单
const resetForm = el => {
  console.log("重置表单", el);
  if (el !== 1) {
    formData.id = "";
    formData.app_name = "";
  }
  formData.quan_name = "";
  formData.quan_value = "";
  formData.quan_cost = "";
  formData.quan_flag = "";
  formData.is_store = "2";
  formData.is_outuse = "2";
  formData.remark = "";
};

// 影线改变
const shadowLineChange = async val => {
  console.log("val", val);
  resetForm(1);
};
// 打开弹窗
const open = async quanInfo => {
  try {
    const loading = ElLoading.service({
      lock: true,
      text: "Loading",
      background: "rgba(0, 0, 0, 0.7)"
    });
    if (quanInfo) {
      let formInfo = JSON.parse(JSON.stringify(quanInfo));
      if (formInfo.id !== undefined) {
        formData.id = formInfo.id;
        formData.app_name = formInfo.app_name;
        formData.quan_name = formInfo.quan_name;
        formData.quan_value = formInfo.quan_value;
        formData.quan_cost = formInfo.quan_cost;
        formData.quan_flag = formInfo.quan_flag;
        formData.remark = formInfo.remark;
        formData.is_store = formInfo.is_store;
        formData.is_outuse = formInfo.is_outuse;
      } else {
        // 新增
        formData.app_name = formInfo.app_name;
      }
    }
    loading.close();
    showSfcDialog.value = true;
  } catch (error) {
    console.warn("打开券类型弹框异常", error);
    loading.close();
    showSfcDialog.value = false;
  }
};

// 保存规则
const saveCard = async () => {
  cardFormRef.value.validate(async valid => {
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
