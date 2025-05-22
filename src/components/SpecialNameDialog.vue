<!-- 特殊匹配规则弹框 -->
<template>
  <div>
    <!-- 对话框 -->
    <el-dialog
      v-model="showSfcDialog"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :title="dialogTitle"
      width="60%"
      @close="resetForm(ruleFormRef)"
    >
      <el-form
        ref="ruleFormRef"
        :model="formData"
        :rules="rules"
        label-width="160px"
      >
        <el-form-item label="影线名称" prop="app_name">
          <el-select
            v-model="formData.app_name"
            placeholder="请选择影线名称"
            filterable
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
        <el-form-item label="影院名称" prop="cinema_name">
          <el-select
            v-model="formData.cinema_name"
            filterable
            clearable
            placeholder="请选择影院"
            @change="cinemaChange"
          >
            <el-option
              v-for="item in cinemaList"
              :key="item.id"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="特殊匹配名称(**分割)" prop="special_name">
          <el-input
            v-model="formData.special_name"
            placeholder="请输入特殊匹配名称，多个之间用双星**分隔"
            clearable
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="formData.remark"
            placeholder="请输入备注"
            clearable
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="saveRule">保存</el-button>
          <el-button @click="cancel(ruleFormRef)">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup>
import { APP_API_OBJ } from "@/common/index.js";
import { ref, reactive, computed, toRaw } from "vue";
import { ElLoading, ElMessage } from "element-plus";
import {
  GET_APP_LIST,
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_CHENXING_LIST,
  GET_SFC_APP_LIST,
  GE_APP_INFO
} from "@/common/constant";
import { cinemNameSpecial, getCinemaLoginInfoList } from "@/utils/utils";
const APP_LIST = computed(() => GET_APP_LIST());
const UME_LIST = computed(() => GET_UME_LIST());
const H5_UME_LIST = computed(() => GET_H5_UME_LIST());
const CHENXING_LIST = computed(() => GET_CHENXING_LIST());
const SFC_LIST = computed(() => GET_SFC_APP_LIST());

const ruleFormRef = ref(null);
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
  app_name: "", // 影线名称
  cinema_name: "", // 影院名称
  cinema_id: "", // 影院id
  city_name: "", // 影院所属城市
  special_name: "", // 特殊匹配
  remark: "" // 备注
});
let cinemaList = ref([]); // 影院列表
let cityCinemaList = []; // 城市影院列表
const rules = {
  app_name: [{ required: true, message: "影线名称不能为空", trigger: "blur" }],
  cinema_name: [
    { required: true, message: "影院名称不能为空", trigger: "blur" }
  ],
  special_name: [
    { required: true, message: "特殊匹配名称不能为空", trigger: "blur" }
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
  formData.cinema_id = "";
  formData.city_name = "";
  formData.special_name = "";
  formData.remark = "";
};

// 影线改变
const shadowLineChange = async val => {
  console.log("影线改变val", val);
  resetForm(1);
  const cityList = await getCityList(val);
  const allCinemaList = await getAllCinemaList(cityList, val);
  console.log("allCinemaList", allCinemaList);
};

// 影院改变
const cinemaChange = async val => {
  let targetCinema = cinemaList.value.find(item => item.name == val);
  formData.cinema_id = targetCinema?.id;
  formData.city_name = targetCinema?.city_name;
  console.log("影院改变val", val, formData.cinema_id, formData.city_name);
  // formData.special_name = "";
  // formData.remark = "";
};
// 打开弹窗
const open = async ruleInfo => {
  const loading = ElLoading.service({
    lock: true,
    text: "Loading",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    if (ruleInfo) {
      let formInfo = JSON.parse(JSON.stringify(ruleInfo));
      if (formInfo.id !== undefined) {
        formData.id = formInfo.id;
        formData.app_name = formInfo.app_name;
        formData.cinema_name = formInfo.cinema_name;
        formData.cinema_id = formInfo.cinema_id;
        formData.city_name = formInfo.city_name;
        formData.special_name = formInfo.special_name;
        formData.remark = formInfo.remark;
      } else {
        // 新增
        formData.app_name = formInfo.app_name;
      }
      const cityList = await getCityList(formData.app_name);
      const allCinemaList = await getAllCinemaList(cityList, formData.app_name);
      console.log("allCinemaList", allCinemaList, formData.cinema_name);
      if (!formData.cinema_id) {
        formData.cinema_id = allCinemaList.find(
          item =>
            item.name == formData.cinema_name ||
            cinemNameSpecial(item.name) ==
              cinemNameSpecial(formData.cinema_name)
        )?.id;
      }
      if (!formData.city_name) {
        formData.city_name = allCinemaList.find(
          item =>
            item.name == formData.cinema_name ||
            cinemNameSpecial(item.name) ==
              cinemNameSpecial(formData.cinema_name)
        )?.city_name;
        console.log("formData.city_name", formData.city_name);
      }
    }
    loading.close();
    showSfcDialog.value = true;
  } catch (error) {
    console.warn("打开规则弹框异常", error);
    loading.close();
    showSfcDialog.value = false;
  }
};
// 获取全部影院列表（测试方法）
const getCinemaAllList = async () => {
  try {
    let appList = [];
    let appAllList = Object.keys(APP_LIST.value);
    console.log("appAllList", appAllList);
    let loginInfoList = getCinemaLoginInfoList();
    appAllList.forEach(item => {
      let obj = loginInfoList.find(
        itemA => itemA.app_name === item && itemA.session_id
      );
      if (!obj) {
        appList.push(item);
      }
    });
    let noLogingAppList = appAllList.filter(
      item => !loginInfoList.find(itemA => itemA.app_name == item)
    );
    console.warn(
      `该影院未登录`,
      noLogingAppList.map(item => ({ ["" + item]: APP_LIST.value[item] }))
    );
    appList = appList.slice();
    console.log("appList", appList);
    let allCinemaList = [],
      noCinemaList = [];
    for (const appName of appList) {
      const cityList = await getCityList(appName);
      let list = await getAllCinemaList(cityList, appName);
      list = list
        .map(item => {
          const appInfo = GE_APP_INFO(appName);
          if (!appInfo) {
            console.warn(`${appName} 该影院已废弃`);
          }
          return {
            ...item,
            app_label: appInfo?.app_label,
            app_name: appInfo?.app_name,
            app_type_code: appInfo?.app_type_code,
            app_type_name: appInfo?.app_type_name
          };
        })
        .filter(item => item.app_label);
      allCinemaList.push(...list);
      if (!list.length) {
        noCinemaList.push({
          app_name: appName,
          app_label: APP_LIST.value[appName]
        });
      }
    }

    allCinemaList = allCinemaList.map(item => {
      let app_cinema_code = item.id;
      let isH5_UME = H5_UME_LIST.value.includes(item.app_name);
      let isLMA = item.app_name === "lma";
      let isSFC = SFC_LIST.value.includes(item.app_name);
      // 以下三种没有cinema_code，用city_id+id组合当唯一标识
      if (isH5_UME || isLMA || isSFC) {
        app_cinema_code = item.city_id + "_" + item.id;
      }
      return {
        app_type_code: item.app_type_code,
        app_type_name: item.app_type_name,
        app_name: item.app_name,
        app_label: item.app_label,
        app_cinema_code,
        app_cinema_name: item.name
      };
    });
    console.log("allCinemaList", allCinemaList);
    console.log(
      "allCinemaList-app-count",
      [...new Set(allCinemaList.map(item => item.app_name))].length
    );
    console.log("noCinemaList", noCinemaList);

    return allCinemaList;
  } catch (err) {
    console.warn("获取全部影院列表异常", err);
    return [];
  }
};
window.getCinemaAllList = getCinemaAllList;
// 保存规则
const saveRule = async () => {
  ruleFormRef.value.validate(async valid => {
    if (valid) {
      // 提交逻辑
      console.log("表单提交的数据:", formData);
      ElMessage.success("必填数据校验成功！");
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

// 获取城市列表
const getCityList = async app_name => {
  try {
    let params = {};
    let list = [];
    console.log("获取城市列表参数", params, app_name);
    if (UME_LIST.value.includes(app_name)) {
      let params = {
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode: "32012801",
          cinemaLinkId: "15946"
        }
      };
      const res = await APP_API_OBJ[app_name].getCinemaList(params);
      cityCinemaList = res.data || [];
      list = cityCinemaList.map(item => ({
        name: item.cityName,
        id: item.cityCode
      }));
    } else if (H5_UME_LIST.value.includes(app_name)) {
      let params = {
        empCode: "",
        leaseCode: ""
      };
      const res = await APP_API_OBJ[app_name].getCinemaList(params);
      console.log("res", res);
      cityCinemaList = res.bizValue?.cities || [];
      list = cityCinemaList.map(item => ({
        name: item.cityName,
        id: item.cityCode
      }));
      console.log("list", list);
    } else if (CHENXING_LIST.value.includes(app_name)) {
      let params = {};
      const res = await APP_API_OBJ[app_name].getCinemaList(params);
      console.log("res", res);
      cityCinemaList = res.data || [];
      list = cityCinemaList.map(item => ({
        name: item.cityInfoDTO.cityName,
        id: item.cityInfoDTO.cityCode
      }));
      console.log("list", list);
    } else if (app_name === "lma") {
      const res = await APP_API_OBJ[app_name].getCityList();
      list = res.data.list || [];
      list = list.map(item => ({
        name: item.city_name,
        id: item.city_id
      }));
    } else {
      const res = await APP_API_OBJ[app_name].getCityList(params);
      list = res?.data?.all_city || [];
    }
    console.log("获取城市列表返回", toRaw(list));
    return list;
  } catch (error) {
    console.warn("获取城市列表异常", error);
    return [];
  }
};

// 根据城市获取影院列表
const getCinemaListByCityId = async (city_id, app_name) => {
  try {
    let params = {
      city_id: city_id
    };
    console.log("根据城市获取影院列表参数", params);
    let cinemaList = [];
    if (UME_LIST.value.includes(app_name)) {
      cinemaList =
        cityCinemaList.find(item => item.cityCode === city_id)?.cinemaList ||
        [];
      cinemaList = cinemaList.map(item => ({
        ...item,
        id: item.cinemaCode,
        name: item.cinemaName,
        city_name: item.cityName
      }));
    } else if (H5_UME_LIST.value.includes(app_name)) {
      cinemaList =
        cityCinemaList.find(item => item.cityCode === city_id)?.cinemas || [];
      cinemaList = cinemaList.map(item => ({
        ...item,
        id: item.cinemaLinkId,
        name: item.cinemaName,
        city_name: item.cityName
      }));
    } else if (CHENXING_LIST.value.includes(app_name)) {
      cinemaList =
        cityCinemaList.find(item => item.cityInfoDTO.cityCode === city_id)
          ?.cinemaResultDTOList || [];
      cinemaList = cinemaList.map(item => ({
        ...item,
        id: item.cinemaCode,
        name: item.cinemaName
      }));
    } else if (app_name === "lma") {
      const res = await APP_API_OBJ[app_name].getCinemaList(city_id);
      cinemaList = res.data.list || [];
      cinemaList = cinemaList.map(item => ({
        ...item,
        id: item.cinema_id,
        name: item.cinema_name,
        city_name: item.city_name
      }));
    } else {
      // sfc
      const res = await APP_API_OBJ[app_name].getCinemaList(params);
      console.log("根据城市获取影院列表返回", res);
      cinemaList = res.data?.cinema_data || [];
    }
    return cinemaList;
  } catch (error) {
    console.warn("根据城市获取影院列表异常", error);
  }
};

// 获取全部影院列表
const getAllCinemaList = async (cityList, app_name) => {
  try {
    let allCinemaList = [];
    for (let index = 0; index < cityList.length; index++) {
      const item = cityList[index];
      let list = await getCinemaListByCityId(item.id, app_name);
      list = list.map(itemA => {
        return {
          ...itemA,
          city_name: item.name,
          city_id: item.id
        };
      });
      if (list.length > 0) {
        allCinemaList = allCinemaList.concat(list);
      }
    }
    if (!allCinemaList.length) {
      console.warn(`${app_name} 获取影院列表为空`);
    }
    console.log("allCinemaList" + "——" + app_name, allCinemaList);
    cinemaList.value = allCinemaList;
    return allCinemaList;
  } catch (error) {
    console.warn("获取全部影院列表异常", error);
  }
};

// 子暴露给父组件的值或方法$refs
defineExpose({
  open,
  closeTck
});
</script>
