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
      @close="resetForm(cardFormRef)"
    >
      <el-form
        ref="cardFormRef"
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
        <el-form-item label="影院名称" prop="cinema_name">
          <el-input
            v-model="formData.cinema_name"
            placeholder="请输入影院名称"
            clearable
          />
        </el-form-item>
        <el-form-item label="指定影院">
          <el-select
            v-model="formData.linkCinemaIds"
            filterable
            multiple
            clearable
            placeholder="指定影院"
          >
            <el-option
              v-for="item in cinemaList"
              :key="item.id"
              :label="item.cinema_name"
              :value="item.cinema_id"
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
        <el-form-item label="卡 ID" prop="card_id">
          <el-input
            v-model="formData.card_id"
            placeholder="请输入卡ID"
            clearable
          />
        </el-form-item>
        <el-form-item label="卡 号" prop="card_num">
          <el-input
            v-model="formData.card_num"
            placeholder="请输入卡号"
            clearable
          />
        </el-form-item>
        <el-form-item label="卡 余额" prop="balance">
          <el-input
            v-model="formData.balance"
            placeholder="请输入卡余额"
            clearable
          />
        </el-form-item>
        <el-form-item label="卡 折扣" prop="card_discount">
          <el-input
            v-model="formData.card_discount"
            placeholder="请输入卡折扣（成本/卡金额）"
            clearable
          />
        </el-form-item>
        <el-form-item label="日出票限制" prop="use_limit_day">
          <el-input
            v-model="formData.use_limit_day"
            placeholder="请输入出票限制（当天）"
            clearable
          />
        </el-form-item>
        <el-form-item label="日出票量" prop="daily_usage">
          <el-input
            v-model="formData.daily_usage"
            placeholder="请输入日出票量（当天）"
            clearable
          />
          <span style="color: red"
            >提示：请不要轻易编辑，用于解决由于手动出票导致机器日出票量限制判断不准确的问题，该值可设置为日出票限制-日剩余可出票数</span
          >
        </el-form-item>
        <el-form-item label="月出票限制" prop="use_limit_month">
          <el-input
            v-model="formData.use_limit_month"
            placeholder="请输入出票限制（当月）"
            clearable
          />
        </el-form-item>
        <el-form-item label="月出票量" prop="monthly_usage">
          <el-input
            v-model="formData.monthly_usage"
            placeholder="请输入月出票量（当月）"
            clearable
          />
          <span style="color: red"
            >提示：请不要轻易编辑，用于解决由于手动出票导致机器月出票量限制判断不准确的问题，该值可设置为月出票限制-月剩余可出票数</span
          >
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="formData.status">
            <el-radio value="1" size="large">正常</el-radio>
            <el-radio value="2" size="large">无效</el-radio>
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
import { ref, reactive, computed } from "vue";
import { ElLoading, ElMessage } from "element-plus";
import { GET_APP_LIST, GET_APP_TYPE_LIST } from "@/common/constant";

const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());

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

// 影院基础方法
import useCinemaBaseFun from "@/mixins/useCinemaBaseFun";
const { getCityList, getAllCinemaList } = useCinemaBaseFun();

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
  cinema_name: "",
  linkCinemaIds: [],
  card_id: "",
  card_num: "",
  card_discount: "",
  balance: "",
  use_limit_day: "",
  daily_usage: "",
  use_limit_month: "",
  monthly_usage: "",
  mobile: "",
  status: "",
  remark: ""
});
// 影线影院列表
const cinemaList = ref([]);
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
  app_name: [{ required: true, message: "影线名称不能为空", trigger: "blur" }],
  cinema_name: [
    { required: true, message: "影院名称不能为空", trigger: "blur" }
  ],
  card_id: [{ required: true, message: "卡ID不能为空", trigger: "blur" }],
  card_num: [{ required: true, message: "卡号不能为空", trigger: "blur" }],
  card_discount: [
    { required: true, message: "卡折扣不能为空", trigger: "blur" }
  ],
  balance: [{ required: true, message: "卡余额不能为空", trigger: "blur" }],
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
  formData.cinema_name = "";
  formData.card_id = "";
  formData.card_num = "";
  formData.card_discount = "";
  formData.balance = "";
  formData.use_limit_day = "";
  formData.daily_usage = "";
  formData.use_limit_month = "";
  formData.monthly_usage = "";
  formData.mobile = "";
  formData.status = "1";
  formData.remark = "";
};

// 影线改变
const shadowLineChange = async app_name => {
  console.log("app_name", app_name);
  resetForm(1);
  const allCityList = await getCityList(app_name);
  const allCinemaList = await getAllCinemaList(app_name, allCityList);
  cinemaList.value = allCinemaList;
};
// 打开弹窗
const open = async cardInfo => {
  try {
    const loading = ElLoading.service({
      lock: true,
      text: "Loading",
      background: "rgba(0, 0, 0, 0.7)"
    });
    if (cardInfo) {
      let formInfo = JSON.parse(JSON.stringify(cardInfo));
      if (formInfo.id !== undefined) {
        formData.id = formInfo.id;
        formData.app_name = formInfo.app_name;
        formData.cinema_name = formInfo.cinema_name;
        formData.linkCinemaIds = formInfo.linkCinemaIds
          ? formInfo.linkCinemaIds.split(",")
          : [];
        formData.card_id = formInfo.card_id;
        formData.card_num = formInfo.card_num;
        formData.card_discount = formInfo.card_discount;
        formData.balance = formInfo.balance;
        formData.use_limit_day = formInfo.use_limit_day;
        formData.daily_usage = formInfo.daily_usage;
        formData.use_limit_month = formInfo.use_limit_month;
        formData.monthly_usage = formInfo.monthly_usage;
        formData.mobile = formInfo.mobile;
        formData.remark = formInfo.remark;
        formData.status = formInfo.status;
      } else {
        // 新增
        formData.app_name = formInfo.app_name;
      }

      const app_name = formData.app_name;
      const allCityList = await getCityList(app_name);
      const allCinemaList = await getAllCinemaList(app_name, allCityList);
      cinemaList.value = allCinemaList;
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
