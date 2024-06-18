<!-- 报价规则弹框 -->
<template>
  <div>
    <!-- 对话框 -->
    <el-dialog
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :title="dialogTitle"
      v-model="showSfcDialog"
      width="50%"
      @close="resetForm(ruleFormRef)"
    >
      <el-form :model="formData" ref="ruleFormRef" label-width="120px">
        <el-form-item label="订单来源">
          <el-select
            v-model="formData.orderForm"
            placeholder="订单来源"
            clearable
          >
            <el-option
              v-for="(keyValue, keyName) in orderFormObj"
              :key="keyName"
              :label="keyValue"
              :value="keyName"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="影线名称">
          <el-select
            v-model="formData.shadowLineName"
            placeholder="请选择影线名称"
            clearable
            @change="shadowLineChange"
          >
            <el-option
              v-for="(keyValue, keyName) in shadowLineObj"
              :key="keyName"
              :label="keyValue"
              :value="keyName"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="规则名称">
          <el-input v-model="formData.ruleName" clearable />
        </el-form-item>
        <!-- // 报价规则：一线普通厅41、二线37、特殊厅会员卡 会员价加2，（特殊厅需要先查会员价） -->
        <el-form-item label="包含城市">
          <el-select
            v-model="formData.includeCityNames"
            :disabled="
              !!(formData.excludeCityNames && formData.excludeCityNames.length)
            "
            @change="includeCityChange"
            filterable
            multiple
            clearable
            placeholder="包含城市"
          >
            <el-option
              v-for="item in cityList"
              :key="item.id"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="排除城市">
          <el-select
            v-model="formData.excludeCityNames"
            :disabled="
              !!(formData.includeCityNames && formData.includeCityNames.length)
            "
            filterable
            multiple
            @change="excludeCityChange"
            clearable
            placeholder="排除城市"
          >
            <el-option
              v-for="item in excludeCityList"
              :key="item.id"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="包含影院">
          <el-select
            v-model="formData.includeCinemaNames"
            :disabled="
              !!(
                formData.excludeCinemaNames &&
                formData.excludeCinemaNames.length
              )
            "
            filterable
            multiple
            clearable
            placeholder="包含影院"
          >
            <el-option
              v-for="item in cinemaListFilter"
              :key="item.id"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="排除影院">
          <el-select
            v-model="formData.excludeCinemaNames"
            :disabled="
              !!(
                formData.includeCinemaNames &&
                formData.includeCinemaNames.length
              )
            "
            filterable
            multiple
            clearable
            placeholder="排除影院"
          >
            <el-option
              v-for="item in cinemaListFilter"
              :key="item.id"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="包含影厅">
          <el-select
            v-model="formData.includeHallNames"
            :disabled="
              !!(formData.excludeHallNames && formData.excludeHallNames.length)
            "
            allow-create
            default-first-option
            :reserve-keyword="false"
            filterable
            multiple
            clearable
            placeholder="包含影厅"
          >
            <el-option
              v-for="item in hallList"
              :key="item.id"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
          <span style="color: red"
            >可自定义影厅名称，输入所需名称并点击选择</span
          >
        </el-form-item>
        <el-form-item label="排除影厅">
          <el-select
            v-model="formData.excludeHallNames"
            :disabled="
              !!(formData.includeHallNames && formData.includeHallNames.length)
            "
            allow-create
            default-first-option
            :reserve-keyword="false"
            filterable
            multiple
            clearable
            placeholder="排除影厅"
          >
            <el-option
              v-for="item in hallList"
              :key="item.id"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
          <span style="color: red"
            >可自定义影厅名称，输入所需名称并点击选择</span
          >
        </el-form-item>
        <el-form-item label="包含影片">
          <el-select
            v-model="formData.includeFilmNames"
            :disabled="
              !!(formData.excludeFilmNames && formData.excludeFilmNames.length)
            "
            allow-create
            default-first-option
            :reserve-keyword="false"
            filterable
            multiple
            clearable
            placeholder="包含影片"
          >
            <el-option
              v-for="item in filmList"
              :key="item.id"
              :label="item.movie_name"
              :value="item.movie_name"
            />
          </el-select>
          <span style="color: red"
            >可自定义影片名称，输入所需名称并点击选择</span
          >
        </el-form-item>
        <el-form-item label="排除影片">
          <el-select
            v-model="formData.excludeFilmNames"
            :disabled="
              !!(formData.includeFilmNames && formData.includeFilmNames.length)
            "
            allow-create
            default-first-option
            :reserve-keyword="true"
            filterable
            multiple
            clearable
            placeholder="排除影片"
          >
            <el-option
              v-for="item in filmList"
              :key="item.id"
              :label="item.movie_name"
              :value="item.movie_name"
            />
          </el-select>
          <span style="color: red"
            >可自定义影片名称，输入所需名称并点击选择</span
          >
        </el-form-item>
        <el-form-item label="报价类型">
          <el-radio-group
            v-model="formData.offerType"
            @change="offerTypeChange"
          >
            <el-radio value="1" size="large">日常固定价</el-radio>
            <el-radio value="2" size="large">会员价加价</el-radio>
            <el-radio value="3" size="large">会员日价格</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="会员日" v-if="formData.offerType === '3'">
          <el-select
            v-model="formData.memberDay"
            placeholder="请选择会员日"
            clearable
          >
            <el-option
              v-for="(item, index) in 31"
              :key="index"
              :label="item + '号'"
              :value="String(item)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="报价金额" v-if="formData.offerType !== '2'">
          <el-input
            v-model="formData.offerAmount"
            placeholder="报价金额"
            clearable
          />
        </el-form-item>
        <el-form-item label="用券面额" v-if="formData.offerType === '1'">
          <el-select
            v-model="formData.quanValue"
            placeholder="用券面额"
            clearable
          >
            <el-option label="40" value="40" />
            <el-option label="35" value="35" />
            <el-option label="30" value="30" />
          </el-select>
        </el-form-item>
        <el-form-item label="加价金额" v-if="formData.offerType === '2'">
          <el-input
            v-model="formData.addAmount"
            placeholder="加价金额"
            clearable
          />
        </el-form-item>
        <el-form-item label="星期几" v-if="formData.offerType !== '3'">
          <el-select
            v-model="formData.weekDay"
            placeholder="星期几"
            multiple
            clearable
          >
            <el-option label="星期一" value="星期一" />
            <el-option label="星期二" value="星期二" />
            <el-option label="星期三" value="星期三" />
            <el-option label="星期四" value="星期四" />
            <el-option label="星期五" value="星期五" />
            <el-option label="星期六" value="星期六" />
            <el-option label="星期日" value="星期日" />
          </el-select>
        </el-form-item>
        <el-form-item label="座位数">
          <el-select v-model="formData.seatNum" placeholder="座位数" clearable>
            <el-option
              v-for="(item, index) in 10"
              :key="index"
              :label="item"
              :value="String(item)"
            />
          </el-select>
          <span style="color: red">提示：控制座位数大于X，不进行报价</span>
        </el-form-item>
        <el-form-item label="开场时间限制">
          <el-input
            v-model="formData.timeLimit"
            placeholder="开场时间限制"
            clearable
          >
            <template #append> 单位：小时 </template>
          </el-input>
          <span style="color: red"
            >提示：控制距离开场时间小于X小时，不进行报价</span
          >
        </el-form-item>
        <el-form-item label="开始放映时间">
          <el-time-select
            v-model="formData.ruleStartTime"
            :max-time="formData.ruleEndTime"
            placeholder="开始放映时间"
            start="06:30"
            step="00:15"
            end="23:30"
            clearable
          />
        </el-form-item>
        <el-form-item label="结束放映时间">
          <el-time-select
            v-model="formData.ruleEndTime"
            :min-time="formData.ruleStartTime"
            placeholder="结束放映时间"
            start="06:30"
            step="00:15"
            end="23:30"
            clearable
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="formData.status">
            <el-radio value="1" size="large">正常</el-radio>
            <el-radio value="2" size="large">禁用</el-radio>
          </el-radio-group>
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
import { SFC_API_OBJ } from "@/common/index.js";

import { ref, reactive, computed, toRaw } from "vue";
import { ElLoading } from "element-plus";
import { ORDER_FORM, APP_LIST } from "@/common/constant";
import { useAppBaseData } from "@/store/appBaseData";
const appBaseDataInfo = useAppBaseData();
const { appBaseData, setSfcBaseData } = appBaseDataInfo;
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

// 订单来源
const orderFormObj = ref(ORDER_FORM);
const shadowLineObj = APP_LIST;
// 表单数据
let formData = reactive({
  id: "",
  ruleName: "", // 规则名称
  orderForm: "lieren", // 订单来源
  shadowLineName: "sfc", // 影线名称
  includeCityNames: [], // 包含城市
  excludeCityNames: [], // 排除城市
  includeCinemaNames: [], // 包含影院
  excludeCinemaNames: [], // 排除影院
  includeHallNames: [], // 包含影厅
  excludeHallNames: [], // 排除影厅
  includeFilmNames: [], // 包含影片
  excludeFilmNames: [], // 排除影片
  timeLimit: "", // 开场时间限制
  offerAmount: "", // 报价金额
  quanValue: "", // 用券面额
  ruleStartTime: "", // 规则启用时间
  ruleEndTime: "", // 规则结束时间
  offerType: "1", // 报价类型, 1-固定价 2-会员价加价 3-会员日报价
  addAmount: "2", // 加价金额
  weekDay: [], // 启用星期
  seatNum: "", // 座位数
  memberDay: "", // 会员日
  status: "1" // 状态
});

let cityList = ref([]); // 城市列表
let cinemaList = ref([]); // 影院列表
let hallList = ref([]); // 影厅列表
let filmList = ref([]); // 影片列表

// 排除城市列表
const excludeCityList = computed(() => {
  if (!formData.includeCityNames.length) {
    return cityList.value;
  }
  return cityList.value.filter(
    item => !formData.includeCityNames.includes(item.name)
  );
});

// 包含/排除影院列表
const cinemaListFilter = computed(() => {
  if (formData.includeCityNames.length) {
    return cinemaList.value.filter(item =>
      formData.includeCityNames.includes(item.city_name)
    );
  } else if (formData.excludeCityNames.length) {
    return cinemaList.value.filter(
      item => !formData.excludeCityNames.includes(item.city_name)
    );
  } else {
    return cinemaList.value;
  }
});

// 重置表单
const resetForm = el => {
  console.log("重置表单", el);
  if (el !== 1) {
    formData.id = ""; // 规则id
    formData.ruleName = ""; // 规则名称
    formData.orderForm = ""; // 订单来源
    formData.shadowLineName = ""; // 影线
  }
  formData.includeCityNames = []; // 包含城市
  formData.excludeCityNames = []; // 排除城市
  formData.includeCinemaNames = []; // 包含影院
  formData.excludeCinemaNames = []; // 排除影院
  formData.includeHallNames = []; // 包含影厅
  formData.excludeHallNames = []; // 排除影厅
  formData.includeFilmNames = []; // 包含影片
  formData.excludeFilmNames = []; // 排除影片
  formData.timeLimit = ""; // 开场时间限制
  formData.offerAmount = ""; // 报价金额
  formData.quanValue = ""; // 用券面额
  formData.ruleStartTime = ""; // 规则启用时间
  formData.ruleEndTime = ""; // 规则结束时间
  formData.offerType = "1"; // 报价类型, 1-固定价 2-会员价加价 3-会员日报价
  formData.addAmount = "2"; // 加价金额
  formData.weekDay = []; // 启用星期
  formData.seatNum = ""; // 座位数
  formData.memberDay = ""; // 会员日
  formData.status = "1"; // 状态
};

// 影线改变
const shadowLineChange = async val => {
  console.log("val", val);
  resetForm(1);
  const cityList = await getCityList();
  const allCinemaList = await getAllCinemaList(cityList);
  await getFilmList(cityList[0].id, allCinemaList[0].id);
};
// 打开弹窗
const open = async ruleInfo => {
  try {
    const loading = ElLoading.service({
      lock: true,
      text: "Loading",
      background: "rgba(0, 0, 0, 0.7)"
    });
    if (ruleInfo) {
      let formInfo = JSON.parse(JSON.stringify(ruleInfo));
      if (formInfo.id !== undefined) {
        formData.id = formInfo.id;
        formData.ruleName = formInfo.ruleName;
        formData.orderForm = formInfo.orderForm;
        formData.shadowLineName = formInfo.shadowLineName;
        formData.ruleStartTime = formInfo.ruleStartTime;
        formData.ruleEndTime = formInfo.ruleEndTime;
        formData.timeLimit = formInfo.timeLimit;
        formData.offerAmount = formInfo.offerAmount;
        formData.quanValue = formInfo.quanValue;
        formData.weekDay = formInfo.weekDay; // 启用星期
        formData.seatNum = formInfo.seatNum; // 座位数
        formData.memberDay = formInfo.memberDay; // 会员日
        formData.status = formInfo.status;
        formData.offerType = formInfo.offerType;
        formData.addAmount = formInfo.addAmount;
        formData.includeCityNames = formInfo.includeCityNames;
        formData.excludeCityNames = formInfo.excludeCityNames;
        formData.includeCinemaNames = formInfo.includeCinemaNames;
        formData.excludeCinemaNames = formInfo.excludeCinemaNames;
        formData.includeHallNames = formInfo.includeHallNames;
        formData.excludeHallNames = formInfo.excludeHallNames;
        formData.includeFilmNames = formInfo.includeFilmNames;
        formData.excludeFilmNames = formInfo.excludeFilmNames;
      } else {
        // 新增
        formData.shadowLineName = formInfo.shadowLineName;
      }
      const cityList = await getCityList();
      const allCinemaList = await getAllCinemaList(cityList);
      await getFilmList(cityList[0].id, allCinemaList[0].id);
    }
    loading.close();
    showSfcDialog.value = true;
  } catch (error) {
    console.warn("打开规则弹框异常", error);
    loading.close();
    showSfcDialog.value = false;
  }
};

// 报价类型改变
const offerTypeChange = val => {
  console.log("val", val);
  if (val === "1") {
    // 日常固定价
    formData.addAmount = "";
    formData.memberDay = "";
  } else if (val === "2") {
    // 会员价加价
    formData.memberDay = "";
    formData.offerAmount = "";
    formData.quanValue = "";
  } else if (val === "3") {
    // 会员日固定价
    formData.addAmount = "";
  }
};
// 保存规则
const saveRule = async () => {
  $emit("submit", formData);
  showSfcDialog.value = false;
  resetForm();
};

// 取消
const cancel = el => {
  console.log("取消", el);
  showSfcDialog.value = false;
  resetForm();
};

// 包含城市改变
const includeCityChange = value => {
  try {
    console.log("包含城市改变", value);
    if (formData.includeCinemaNames.length) {
      formData.includeCinemaNames = formData.includeCinemaNames.filter(item =>
        value.some(itemV => item.includes(itemV.replace(/市$/, "")))
      );
    } else if (formData.excludeCinemaNames.length) {
      formData.excludeCinemaNames = formData.excludeCinemaNames.filter(item =>
        value.some(itemV => item.includes(itemV.replace(/市$/, "")))
      );
    }
  } catch (error) {
    console.warn("包含城市改变处理异常", error);
  }
};

// 排除城市改变
const excludeCityChange = value => {
  try {
    console.log("排除城市改变", value);
    if (formData.includeCinemaNames.length) {
      formData.includeCinemaNames = formData.includeCinemaNames.filter(
        item => !value.some(itemV => item.includes(itemV.replace(/市$/, "")))
      );
    } else if (formData.excludeCinemaNames.length) {
      formData.excludeCinemaNames = formData.excludeCinemaNames.filter(
        item => !value.some(itemV => item.includes(itemV.replace(/市$/, "")))
      );
    }
  } catch (error) {
    console.warn("排查城市改变处理异常", error);
  }
};

// 获取城市列表
const getCityList = async () => {
  try {
    let params = {};
    const { shadowLineName } = formData;
    let list = appBaseData[shadowLineName]?.cityList;
    console.log("获取城市列表参数", params, shadowLineName, toRaw(list));
    if (!list?.length) {
      const res = await SFC_API_OBJ[shadowLineName].getCityList(params);
      list = res?.data?.all_city || [];
      setSfcBaseData({ cityList: list }, shadowLineName);
    }
    console.log("获取城市列表返回", toRaw(list));
    cityList.value = list;
    return list;
  } catch (error) {
    console.warn("获取城市列表异常", error);
  }
};

// 获取线上电影列表
const getFilmList = async (city_id, cinema_id) => {
  try {
    const params = {
      city_id: city_id,
      cinema_id: cinema_id,
      width: "240",
      movie_page_num: "1"
    };
    console.log("获取线上电影列表参数", params);
    const { shadowLineName } = formData;
    const res = await SFC_API_OBJ[shadowLineName].getMovieList(params);
    console.log("获取线上电影列表返回", res);
    let list = res.data?.movie_data || [];
    filmList.value = list;
    return list;
  } catch (error) {
    console.warn("获取线上电影列表异常", error);
  }
};

// 根据城市获取影院列表
const getCinemaListByCityId = async city_id => {
  try {
    let params = {
      city_id: city_id
    };
    console.log("根据城市获取影院列表参数", params);
    const { shadowLineName } = formData;
    const res = await SFC_API_OBJ[shadowLineName].getCinemaList(params);
    console.log("根据城市获取影院列表返回", res);
    let cinemaList = res.data?.cinema_data || [];
    return cinemaList;
  } catch (error) {
    console.warn("根据城市获取影院列表异常", error);
  }
};

// 获取全部影院列表
const getAllCinemaList = async cityList => {
  try {
    const { shadowLineName } = formData;
    let allCinemaList = appBaseData[shadowLineName]?.allCinemaList || [];
    console.log("获取全部影院列表", shadowLineName, toRaw(allCinemaList));
    if (!allCinemaList?.length) {
      for (let index = 0; index < cityList.length; index++) {
        const item = cityList[index];
        let list = await getCinemaListByCityId(item.id);
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
      setSfcBaseData({ allCinemaList: allCinemaList }, shadowLineName);
    }
    cinemaList.value = allCinemaList;
    return allCinemaList;
  } catch (error) {
    console.warn("获取全部影院列表异常", error);
  }
};

// 子暴露给父组件的值或方法$refs
defineExpose({
  open
});
</script>
