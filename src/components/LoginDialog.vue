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
          <el-cascader
            v-model="formData.app_name"
            :options="appCascaderOptions"
            :props="appCascaderProps"
            placeholder="请选择影线名称"
            clearable
            filterable
            style="width: 100%"
            @change="shadowLineChange"
          />
        </el-form-item>
        <el-form-item label="所属账号" prop="mobile">
          <el-input
            v-model="formData.mobile"
            placeholder="请输入手机号"
            clearable
          />
        </el-form-item>
        <el-form-item
          label="指定用户"
          prop="link_user_id"
          :required="FENGHUANG_LIST.includes(formData.app_name)"
        >
          <el-select
            v-model="formData.link_user_id"
            placeholder="指定用户"
            clearable
          >
            <el-option
              v-for="(item, inx) in userList"
              :key="inx"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Session ID / Token" prop="session_id">
          <template #default>
            <el-input
              v-model="formData.session_id"
              placeholder="请输入 Session ID（详见提示）"
              clearable
            />
            <div
              style="
                color: #909399;
                font-size: 12px;
                margin-top: 4px;
                line-height: 1.6;
              "
            >
              <template v-if="formData.app_name == 'wanda'">
                对应请求头 <b>X-RY-TOKEN</b>（万达 API 也称 <b>user-token</b>）
              </template>
              <template v-else-if="CHENXING_LIST.includes(formData.app_name)">
                对应请求参数 <b>k</b>（登录接口返回的 token 字段）
              </template>
              <template
                v-else-if="
                  [...H5_UME_LIST, ...FENGHUANG_LIST].includes(
                    formData.app_name
                  )
                "
              >
                对应 URL 参数 <b>sid</b>（登录接口返回的 sessionId）
              </template>
              <template v-else-if="formData.app_name == 'lma'">
                对应 Cookie 中的 <b>ig_session</b> 值（卢米埃请求头 lmatoken）
              </template>
              <template v-else>
                对应请求的 <b>session_id</b> 字段（SFC/UME/金逸 系列）
              </template>
            </div>
          </template>
        </el-form-item>
        <el-form-item
          v-if="
            CHENXING_LIST.includes(formData.app_name) &&
            GET_APP_INFO(formData.app_name).api_version == '3.0C'
          "
          label="tenantId"
          prop="tid"
        >
          <el-input
            v-model="formData.tid"
            placeholder="请输入 tenantId"
            clearable
          />
          <span style="color: #e6a23c; font-size: 12px">
            抓包找请求参数 <b>tenantId</b>（仅辰星 3.0C 需要，C 端不需要）
          </span>
        </el-form-item>
        <el-form-item
          v-if="[...H5_UME_LIST, ...FENGHUANG_LIST].includes(formData.app_name)"
          label="续期 Token"
          prop="tid"
        >
          <el-input
            v-model="formData.tid"
            placeholder="请输入续期 Token"
            clearable
          />
          <span style="color: #e6a23c; font-size: 12px">
            抓包找 <b>refreshToken</b> 字段，用于 sid 过期时自动续期
          </span>
        </el-form-item>
        <el-form-item
          v-if="formData.app_name == 'wanda'"
          label="X-RY-USER"
          prop="tid"
        >
          <el-input
            v-model="formData.tid"
            placeholder="请输入 X-RY-USER"
            clearable
          />
          <span style="color: #e6a23c; font-size: 12px">
            对应请求头 <b>X-RY-USER</b>（万达也称
            <b>user-identifier</b>，通常为一串大写字母）
          </span>
        </el-form-item>
        <el-form-item label="会员卡密码" prop="member_pwd">
          <el-input
            v-model="formData.member_pwd"
            placeholder="请输入会员卡支付密码"
            clearable
          />
        </el-form-item>
        <el-form-item label="是否小号" prop="is_xiaohao">
          <el-radio-group v-model="formData.is_xiaohao">
            <el-radio value="1" size="large">是</el-radio>
            <el-radio value="2" size="large">否</el-radio>
          </el-radio-group>
          <span style="color: red"
            >注意：小号仅用于帮助大号锁座（解决座位旁边、座位中间不允许为空问题），无法用小号出票</span
          >
        </el-form-item>
        <el-form-item label="是否优先" prop="first">
          <el-radio-group v-model="formData.first">
            <el-radio value="1" size="large">是</el-radio>
            <el-radio value="2" size="large">否</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="日出票券数" prop="daily_ticket_count">
          <el-input-number
            v-model="formData.daily_ticket_count"
            placeholder="请输入日出票券数"
            :min="0"
            :precision="0"
            controls-position="right"
            style="width: 100%"
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
import { ref, reactive, computed } from "vue";
import { ElLoading, ElMessage } from "element-plus";
import {
  GET_APP_LIST,
  GET_H5_UME_LIST,
  GET_FENGHUANG_LIST,
  GET_CHENXING_LIST,
  GET_APP_INFO,
  GET_APP_TYPE_LIST
} from "@/common/constant";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());
const H5_UME_LIST = computed(() => GET_H5_UME_LIST());
const FENGHUANG_LIST = computed(() => GET_FENGHUANG_LIST());
const CHENXING_LIST = computed(() => GET_CHENXING_LIST());

// 影线二级级联配置（系列 -> 影线）
const appCascaderOptions = computed(() =>
  APP_TYPE_LIST.value.map((item, inx) => ({
    id: inx + 1,
    label: item.app_type_name,
    value: item.app_type_code,
    children: item.app_name_list.map((itemA, index) => ({
      id: index + 1 + (inx + 1) * 100,
      label: APP_LIST.value[itemA],
      value: itemA
    }))
  }))
);
const appCascaderProps = {
  value: "value",
  label: "label",
  children: "children",
  emitPath: false
};
// console.log("H5_UME_LIST", H5_UME_LIST);
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
  app_name: "",
  session_id: "",
  link_user_id: "",
  tid: "",
  member_pwd: "",
  mobile: "",
  remark: "",
  first: "2",
  is_xiaohao: "2",
  daily_ticket_count: null
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

const validateTidPass = (rule, value, callback) => {
  console.log("formData.app_name", formData.app_name);
  if (!formData.app_name) {
    callback();
  } else if (!formData.tid) {
    callback(new Error("不能为空"));
  } else {
    callback();
  }
};

const validateLinkUserId = (rule, value, callback) => {
  if (!FENGHUANG_LIST.value.includes(formData.app_name)) {
    callback();
  } else if (!formData.link_user_id) {
    callback(new Error("凤凰新系列指定用户不能为空"));
  } else {
    callback();
  }
};

const rules = {
  app_name: [
    { required: true, message: "影线名称不能为空", trigger: ["change", "blur"] }
  ],
  session_id: [
    { required: true, message: "Session ID不能为空", trigger: "blur" }
  ],
  tid: [
    {
      required: true,
      validator: validateTidPass,
      message: "不能为空",
      trigger: "blur"
    }
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
  ],
  link_user_id: [
    {
      validator: validateLinkUserId,
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
  formData.link_user_id = "";
  formData.tid = "";
  formData.member_pwd = "";
  formData.mobile = "";
  formData.remark = "";
  formData.first = "2";
  formData.is_xiaohao = "2";
  formData.daily_ticket_count = null;
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
        formData.link_user_id = formInfo.link_user_id;
        formData.tid = formInfo.tid;
        formData.member_pwd = formInfo.member_pwd;
        formData.mobile = formInfo.mobile;
        formData.remark = formInfo.remark;
        formData.first = formInfo.first;
        formData.is_xiaohao = formInfo.is_xiaohao == 1 ? "1" : "2";
        formData.daily_ticket_count = formInfo.daily_ticket_count ?? null;
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
