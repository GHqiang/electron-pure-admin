<!-- 影院新增编辑弹框 -->
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
        label-width="140px"
      >
        <el-form-item label="影线类型" prop="app_type_code">
          <el-select
            v-model="formData.app_type_code"
            placeholder="请选择影线类型"
            @change="appTypeChange"
          >
            <el-option
              v-for="(keyValue, keyName) in APP_TYPE_OBJ"
              :key="keyName"
              :label="keyValue"
              :value="keyName"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="影线标识" prop="app_name">
          <el-input
            v-model="formData.app_name"
            placeholder="请输入影线标识"
            clearable
          />
        </el-form-item>
        <el-form-item label="影线名称" prop="app_label">
          <el-input
            v-model="formData.app_label"
            placeholder="请输入影线名称"
            clearable
          />
        </el-form-item>
        <!-- <el-form-item label="影线标识集合" prop="flag_list">
          <el-input
            v-model="formData.flag_list"
            style="width: 500px"
            maxlength="255"
            show-word-limit
            :autosize="{ minRows: 2, maxRows: 5 }"
            type="textarea"
            placeholder="请输入影线标识集合，若有多个用;分隔"
          />
        </el-form-item> -->
        <!-- <el-form-item label="平台影线组别" prop="group_list">
          <el-input
            v-model="formData.group_list"
            style="width: 500px"
            maxlength="100"
            show-word-limit
            :autosize="{ minRows: 2, maxRows: 3 }"
            type="textarea"
            placeholder="请输入平台影线组别，若有多个用;分隔"
          />
        </el-form-item> -->
        <!-- <el-form-item label="影线包含城市" prop="city_list">
          <el-input
            v-model="formData.city_list"
            style="width: 500px"
            maxlength="100"
            show-word-limit
            :autosize="{ minRows: 2, maxRows: 3 }"
            type="textarea"
            placeholder="请输入影线包含城市，若有多个用;分隔"
          />
          <span style="color: red"
            >注意：没有平台影线组别的影院尽量都填写上，这样匹配影线标识更精准，一单写了就要求该影院所有城市都写上</span
          >
        </el-form-item>
        <el-form-item label="影线黑名单影院" prop="black_list">
          <el-input
            v-model="formData.black_list"
            style="width: 500px"
            maxlength="500"
            show-word-limit
            :autosize="{ minRows: 2, maxRows: 5 }"
            type="textarea"
            placeholder="请输入黑名单影院，若有多个用;分隔"
          />
        </el-form-item> -->
        <el-form-item
          v-if="formData.app_type_code === 'sfc_applet'"
          label="乐影影院groupID"
          prop="sfc_group_id"
        >
          <el-input
            v-model="formData.sfc_group_id"
            placeholder="请输入乐影影院groupID"
            clearable
          />
        </el-form-item>
        <el-form-item
          v-if="
            ['sfc_applet', 'chenxing_applet'].includes(formData.app_type_code)
          "
          label="影院openID"
          prop="sfc_open_id"
        >
          <el-input
            v-model="formData.sfc_open_id"
            placeholder="请输入影院openID"
            clearable
          />
        </el-form-item>
        <el-form-item
          v-if="formData.app_type_code === 'ume_h5'"
          label="凤凰云智影院id"
          prop="cinemaLinkId"
        >
          <el-input
            v-model="formData.cinemaLinkId"
            placeholder="请输入凤凰云智影院id"
            clearable
          />
        </el-form-item>
        <el-form-item
          v-if="formData.app_type_code === 'ume_h5'"
          label="凤凰云智影院标识"
          prop="channelCode"
        >
          <el-input
            v-model="formData.channelCode"
            placeholder="请输入凤凰云智影院标识"
            clearable
          />
        </el-form-item>
        <el-form-item
          v-if="formData.app_type_code === 'chenxing_applet'"
          label="辰星影院标识"
          prop="channelCode"
        >
          <el-input
            v-model="formData.channelCode"
            placeholder="请输入辰星影院标识"
            clearable
          />
        </el-form-item>
        <el-form-item
          v-if="formData.app_type_code === 'chenxing_applet'"
          label="辰星api版本"
          prop="api_version"
        >
          <el-input
            v-model="formData.api_version"
            placeholder="请输入辰星api版本"
            clearable
          />
          <span style="color: red"
            >注意：辰星C端影院输入大写C，3.0C端影院输入3.0C</span
          >
        </el-form-item>
        <el-form-item
          v-if="
            formData.app_type_code === 'chenxing_applet' &&
            formData.api_version === 'C'
          "
          label="辰星appId"
          prop="appId"
        >
          <el-input
            v-model="formData.appId"
            placeholder="请输入辰星影院appId"
            clearable
          />
          <span style="color: red">注意：仅辰星C端影院需要，3.0C端不需要</span>
        </el-form-item>
        <!-- <el-form-item label="影院code" prop="cinemaCode">
          <el-input
            v-model="formData.cinemaCode"
            placeholder="请输入影院code(选填)"
            clearable
          />
        </el-form-item> -->
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="formData.status">
            <el-radio value="1" size="large">正常</el-radio>
            <el-radio value="2" size="large">禁用</el-radio>
            <el-radio value="3" size="large">已删除</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="是否外部可用" prop="is_out_use">
          <el-radio-group v-model="formData.is_out_use">
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
import { APP_TYPE_OBJ } from "@/common/constant";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

const loginFormRef = ref(null);
// 父传子props
defineProps({
  dialogTitle: String,
  userList: Array
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
  app_type_code: "",
  app_type_name: "",
  app_name: "",
  app_label: "",
  sfc_group_id: "",
  sfc_open_id: "",
  cinemaLinkId: "",
  channelCode: "",
  appId: "",
  api_version: "",
  status: "1",
  is_out_use: "1",
  remark: ""
  // group_list: "",
  // flag_list: "",
  // black_list: "",
  // city_list: ""
});

const rules = {
  app_type_code: [
    { required: true, message: "影线类型不能为空", trigger: ["change", "blur"] }
  ],
  app_name: [
    { required: true, message: "影线标识不能为空", trigger: ["change", "blur"] }
  ],
  app_label: [
    { required: true, message: "影线名称不能为空", trigger: ["change", "blur"] }
  ],
  sfc_group_id: [
    { required: true, message: "乐影影院groupID不能为空", trigger: "blur" }
  ],
  sfc_open_id: [
    { required: true, message: "乐影影院openID不能为空", trigger: "blur" }
  ],
  cinemaLinkId: [
    { required: true, message: "凤凰云智影院id不能为空", trigger: "blur" }
  ],
  channelCode: [
    { required: true, message: "凤凰云智影院标识不能为空", trigger: "blur" }
  ],
  api_version: [
    { required: true, message: "辰星系列api版本不能为空", trigger: "blur" }
  ],
  appId: [
    { required: true, message: "辰星C端系列影院appId不能为空", trigger: "blur" }
  ]
};

// 重置表单
const resetForm = el => {
  console.log("重置表单", el);
  formData.id = "";
  formData.app_type_code = "";
  formData.app_type_name = "";
  formData.app_name = "";
  formData.app_label = "";
  formData.status = "1";
  formData.is_out_use = "1";
  formData.sfc_group_id = "";
  formData.sfc_open_id = "";
  formData.cinemaLinkId = "";
  formData.channelCode = "";
  formData.appId = "";
  formData.api_version = "";
  formData.remark = "";
  // formData.group_list = "";
  // formData.flag_list = "";
  // formData.black_list = "";
  // formData.city_list = "";
};

// 影线类型改变
const appTypeChange = val => {
  if (val) {
    formData.app_type_name = APP_TYPE_OBJ[val];
  }
  formData.sfc_group_id = "";
  formData.sfc_open_id = "";
  formData.cinemaLinkId = "";
  formData.channelCode = "";
  formData.appId = "";
  formData.api_version = "";
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
        formData.app_type_code = formInfo.app_type_code;
        formData.app_type_name = formInfo.app_type_name;
        formData.app_name = formInfo.app_name;
        formData.app_label = formInfo.app_label;

        formData.sfc_group_id = formInfo.sfc_group_id;
        formData.sfc_open_id = formInfo.sfc_open_id;
        formData.cinemaLinkId = formInfo.cinemaLinkId;
        formData.channelCode = formInfo.channelCode;
        formData.appId = formInfo.appId;
        formData.api_version = formInfo.api_version;
        formData.status = formInfo.status || "1";
        formData.is_out_use = formInfo.is_out_use || "1";
        formData.remark = formInfo.remark;
        // formData.group_list = formInfo.group_list;
        // formData.flag_list = formInfo.flag_list;
        // formData.black_list = formInfo.black_list;
        // formData.city_list = formInfo.city_list;
      } else {
        // 新增
        formData.app_type_code = formInfo.app_type_code;
        formData.app_type_name = APP_TYPE_OBJ[formInfo.app_type_code];
      }
    }
    loading.close();
    showSfcDialog.value = true;
  } catch (error) {
    console.warn("打开影院弹框异常", error);
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
