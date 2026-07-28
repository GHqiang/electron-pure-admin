<!-- 字典新增/编辑弹框 -->
<template>
  <el-dialog
    v-model="showDialog"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :title="dialogTitle"
    width="60%"
    @close="resetForm(dictFormRef)"
  >
    <el-form
      ref="dictFormRef"
      :model="formData"
      :rules="rules"
      label-width="120px"
    >
      <el-form-item label="字典类型" prop="dict_type">
        <el-input
          v-model="formData.dict_type"
          placeholder="如：offerHandleTimeout"
          :disabled="isEdit"
          clearable
        />
      </el-form-item>
      <el-form-item label="字典标签" prop="dict_label">
        <el-input
          v-model="formData.dict_label"
          placeholder="显示文本"
          clearable
        />
      </el-form-item>
      <el-form-item label="字典值" prop="dict_value">
        <el-input
          v-model="formData.dict_value"
          type="textarea"
          :rows="3"
          placeholder="可为数字/JSON/逗号分隔列表"
        />
      </el-form-item>
      <el-form-item label="描述" prop="dict_desc">
        <el-input
          v-model="formData.dict_desc"
          type="textarea"
          :rows="2"
          placeholder="选填"
        />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-switch
          v-model="formData.status"
          :active-value="1"
          :inactive-value="0"
          active-text="启用"
          inactive-text="停用"
        />
      </el-form-item>
      <!-- is_readonly 不在表单展示，由 DB 表直接控制 -->
      <el-form-item label="指定角色" prop="rule">
        <el-select
          v-model="formData.rule"
          clearable
          placeholder="留空=全角色可用"
          style="width: 100%"
        >
          <!-- 仅可选内部角色2和外部角色3，不含管理员1 -->
          <el-option :value="2" label="2-内部用户" />
          <el-option :value="3" label="3-外部用户" />
        </el-select>
      </el-form-item>
      <el-form-item label="指定用户" prop="user_id">
        <el-select
          v-model="formData.user_id"
          clearable
          filterable
          placeholder="留空=全用户可用"
          style="width: 100%"
        >
          <el-option
            v-for="item in userList"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
        确定
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, onBeforeMount } from "vue";
import { ElMessage } from "element-plus";
import svApi from "@/api/sv-api";

const $emit = defineEmits(["submit"]);

const showDialog = ref(false);
const dialogTitle = ref("新增字典");
const isEdit = ref(false);
const submitLoading = ref(false);
const dictFormRef = ref(null);

// 用户列表（供 user_id 下拉选择）
const userList = ref([]);

const defaultForm = () => ({
  id: undefined,
  dict_type: "",
  dict_label: "",
  dict_value: "",
  dict_desc: "",
  status: 1,
  rule: null,
  user_id: ""
});

const formData = reactive(defaultForm());

const rules = {
  dict_type: [
    { required: true, message: "请输入字典类型", trigger: "blur" },
    { max: 50, message: "长度不能超过50", trigger: "blur" }
  ],
  dict_label: [
    { required: true, message: "请输入字典标签", trigger: "blur" },
    { max: 200, message: "长度不能超过200", trigger: "blur" }
  ],
  dict_value: [
    { required: true, message: "请输入字典值", trigger: "blur" },
    { max: 200, message: "长度不能超过200", trigger: "blur" }
  ],
  dict_desc: [{ max: 500, message: "长度不能超过500", trigger: "blur" }]
};

// 加载用户列表（参照 todayStatistics/index.vue）
onBeforeMount(async () => {
  try {
    const res = await svApi.getUserList();
    userList.value = res.data.userList || [];
  } catch (error) {
    console.warn("加载用户列表失败", error);
  }
});

// 打开弹框：传 row 为编辑，不传为新增
const open = (row = null) => {
  Object.assign(formData, defaultForm());
  if (row && row.id !== undefined) {
    isEdit.value = true;
    dialogTitle.value = "编辑字典";
    formData.id = row.id;
    formData.dict_type = row.dict_type;
    formData.dict_label = row.dict_label;
    formData.dict_value = row.dict_value;
    formData.dict_desc = row.dict_desc ?? "";
    formData.status = row.status;
    formData.rule = row.rule ?? null;
    formData.user_id = row.user_id ?? "";
  } else {
    isEdit.value = false;
    dialogTitle.value = "新增字典";
  }
  showDialog.value = true;
};

const close = () => {
  showDialog.value = false;
  submitLoading.value = false;
  resetForm(dictFormRef.value);
};

const resetForm = formRef => {
  if (formRef) {
    formRef.resetFields();
  }
  Object.assign(formData, defaultForm());
  isEdit.value = false;
};

const handleCancel = () => {
  showDialog.value = false;
  resetForm(dictFormRef.value);
};

const handleSubmit = () => {
  if (submitLoading.value) return;
  dictFormRef.value.validate(async valid => {
    if (!valid) {
      ElMessage.warning("表单校验失败");
      return false;
    }
    submitLoading.value = true;
    // 父组件负责调用 API 与关闭弹框
    $emit("submit", { isEdit: isEdit.value, formData: { ...formData } });
  });
};

defineExpose({ open, close });
</script>

<style scoped>
.tip-text {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}
</style>
