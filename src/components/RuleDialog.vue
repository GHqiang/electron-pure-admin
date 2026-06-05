<!-- 报价规则弹框 -->
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
        label-width="120px"
      >
        <!-- <el-form-item label="订单来源" prop="orderForm">
          <el-select
            v-model="formData.orderForm"
            placeholder="订单来源"
            clearable
            required
            multiple
          >
            <el-option
              v-for="(keyValue, keyName) in orderFormObj"
              :key="keyName"
              :label="keyValue"
              :value="keyName"
            />
          </el-select>
        </el-form-item> -->
        <el-form-item label="影线名称" prop="shadowLineName">
          <el-cascader
            v-model="formData.shadowLineName"
            :options="appCascaderOptions"
            :props="appCascaderProps"
            placeholder="请选择影线名称"
            clearable
            filterable
            style="width: 100%"
            @change="shadowLineChange"
          />
        </el-form-item>
        <el-form-item label="规则名称" prop="ruleName">
          <el-input v-model="formData.ruleName" clearable />
        </el-form-item>
        <!-- // 报价规则：一线普通厅41、二线37、特殊厅会员卡 会员价加2，（特殊厅需要先查会员价） -->
        <el-form-item label="包含城市">
          <el-select
            v-model="formData.includeCityNames"
            :disabled="
              !!(formData.excludeCityNames && formData.excludeCityNames.length)
            "
            filterable
            multiple
            clearable
            placeholder="包含城市"
            @change="includeCityChange"
          >
            <el-option
              v-for="item in cityList"
              :key="item.city_id"
              :label="item.city_name"
              :value="item.city_name"
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
            clearable
            placeholder="排除城市"
            @change="excludeCityChange"
          >
            <el-option
              v-for="item in excludeCityList"
              :key="item.city_id"
              :label="item.city_name"
              :value="item.city_name"
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
            @change="includeCinemaChange"
            placeholder="包含影院"
          >
            <el-option
              v-for="item in cinemaListFilter"
              :key="item.cinema_id"
              :label="item.cinema_name"
              :value="item.cinema_name"
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
            @change="excludeCinemaChange"
            placeholder="排除影院"
          >
            <el-option
              v-for="item in cinemaListFilter"
              :key="item.cinema_id"
              :label="item.cinema_name"
              :value="item.cinema_name"
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
              :key="item.film_id"
              :label="item.film_name"
              :value="item.film_name"
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
              :key="item.film_id"
              :label="item.film_name"
              :value="item.film_name"
            />
          </el-select>
          <span style="color: red"
            >可自定义影片名称，输入所需名称并点击选择</span
          >
        </el-form-item>
        <el-form-item label="电影格式">
          <el-select
            v-model="formData.film_type"
            clearable
            placeholder="电影格式"
            @clear="formData.film_type = ''"
          >
            <el-option label="2D" value="2D" />
            <el-option label="3D" value="3D" />
          </el-select>
          <span style="color: red">注意：如果不区分电影格式请不要选择</span>
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
        <el-form-item v-if="isShowOfferFlag" label="会员价取值规则">
          <el-radio-group v-model="formData.memberPriceRule">
            <el-radio value="1" size="large">座位分区最高价</el-radio>
            <el-radio value="2" size="large">剩余最多座位价格</el-radio>
          </el-radio-group>
          <span style="color: red; margin-left: 15px"
            >提示：默认按座位分区最高价报</span
          >
        </el-form-item>
        <el-form-item
          v-if="formData.offerType === '3'"
          label="会员日"
          prop="memberDay"
          :rules="[
            {
              required: true,
              message: '会员日不可为空',
              trigger: 'blur'
            }
          ]"
        >
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
        <template v-if="formData.offerType !== '3'">
          <el-form-item
            v-for="(domain, index) in formData.platOfferList"
            :key="domain.platName"
            :label="
              orderFormObj[domain.platName] + offerTypeObj[formData.offerType]
            "
            :prop="'platOfferList.' + index + '.value'"
            :rules="{
              required: true,
              message:
                orderFormObj[domain.platName] +
                offerTypeObj[formData.offerType] +
                '不可为空',
              trigger: 'blur'
            }"
          >
            <el-input
              v-model="domain.value"
              :placeholder="offerTypeObj[formData.offerType]"
              clearable
            >
              <template #prepend>
                <el-select
                  v-model="domain.platName"
                  placeholder="请选择平台"
                  style="width: 120px"
                >
                  <el-option
                    v-for="(keyValue, keyName) in orderFormObj"
                    :key="keyName"
                    :label="keyValue"
                    :value="keyName"
                  />
                </el-select>
              </template>
              <template #append>
                <el-select
                  v-model="domain.isSyncPlat"
                  placeholder="请选择是否同步平台"
                  style="width: 200px"
                >
                  <el-option label="同步平台" value="1" />
                  <el-option label="不同步平台" value="2" />
                </el-select>
              </template>
            </el-input>
            <el-button
              v-if="index > 0"
              class="mt-2"
              @click.prevent="removeDomain(domain)"
            >
              删除
            </el-button>
            <el-button
              v-if="index === formData.platOfferList.length - 1"
              class="mt-2"
              @click.prevent="addDomain"
              >新增</el-button
            >
          </el-form-item>
        </template>

        <el-form-item
          v-if="formData.offerType === '1'"
          label="用券类型"
          prop="quanValue"
          :rules="[
            {
              required: true,
              message: '用券类型不可为空',
              trigger: 'blur'
            }
          ]"
        >
          <el-select
            v-model="formData.quanValue"
            placeholder="用券类型"
            multiple
            filterable
            clearable
          >
            <el-option
              v-for="item in quanType"
              :key="item.id"
              :label="item.quan_name"
              :value="item.quan_value"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="formData.offerType !== '3'" label="星期几">
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
        <el-form-item
          v-if="formData.offerType !== '1' && formData.shadowLineName !== 'lma'"
          label="灵活用券配置"
        >
          <el-row :gutter="24" style="width: 100%">
            <el-col :span="2">
              <el-switch
                v-model="formData.autoUseQuanStatus"
                active-value="1"
                inactive-value="2"
              />
            </el-col>
            <el-col :span="8">
              中标价超过&nbsp;&nbsp;<el-input
                v-model="formData.autoUseQuanPrice"
                type="number"
                style="width: 80px"
              />&nbsp;&nbsp;用券
            </el-col>
            <el-col :span="14">
              用券类型：
              <el-select
                v-model="formData.auto_quan_value"
                placeholder="用券类型"
                style="width: 194px"
                filterable
                clearable
              >
                <el-option
                  v-for="item in quanType"
                  :key="item.id"
                  :label="item.quan_name"
                  :value="item.quan_value"
                />
              </el-select>
            </el-col>
          </el-row>
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
        <el-form-item label="允许报价时间">
          <el-date-picker
            v-model="formData.allow_offer_time"
            type="datetime"
            placeholder="允许报价时间"
            format="YYYY-MM-DD hh:mm:ss"
            value-format="YYYY-MM-DD hh:mm:ss"
            clearable
          />
          <span style="color: red"
            >提示：主要是配合当日不报使用，如果想关闭当日不报可置空，如果次日下午才能报，也可调整其时间来实现</span
          >
        </el-form-item>
        <el-form-item label="最后报价时间">
          <span>{{ formData.last_used_time }}</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="formData.remark"
            placeholder="请输入备注"
            clearable
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="formData.status">
            <el-radio value="1" size="large">正常</el-radio>
            <el-radio value="2" size="large">禁用</el-radio>
            <el-radio value="3" size="large">仅报价</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item>
          <el-button
            v-if="dialogTitle != '查看规则'"
            type="primary"
            @click="saveRule"
            >保存</el-button
          >
          <el-button @click="cancel(ruleFormRef)">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import { ElLoading, ElMessage } from "element-plus";
import {
  ORDER_FORM,
  GET_APP_LIST,
  GET_APP_INFO,
  GET_APP_TYPE_LIST,
  SYNC_CINEMA_CODE_APP_TYPE_LIST
} from "@/common/constant";
import { cinemNameSpecial } from "@/utils/utils";

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
const { getCityList, getAllCinemaList, getFilmList } = useCinemaBaseFun();
// 机器基础方法
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";
const { getQuanTypeList } = usesMachineBaseFun();

const ruleFormRef = ref(null);
// 父传子props
const props = defineProps({
  dialogTitle: String
});

//defineEmits接受一个数组，元素为自定义事件名
//返回一个触发器，用于触发事件，第一个参数是具体事件名，第二个是传递的值
// 子传父emit
let $emit = defineEmits([`submit`]);

// 是否显示对话框
const showSfcDialog = ref(false);
const quanType = ref([]);
const offerTypeObj = {
  1: "报价金额",
  2: "会员加价"
};
// 订单来源
const orderFormObj = ref(ORDER_FORM);
// 表单数据
let formData = reactive({
  id: "",
  ruleName: "", // 规则名称
  orderForm: [], // 订单来源
  shadowLineName: "sfc", // 影线名称
  includeCityNames: [], // 包含城市
  excludeCityNames: [], // 排除城市
  includeCinemaNames: [], // 包含影院
  excludeCinemaNames: [], // 排除影院
  includeCinemaCodes: "", // 包含影院对应的 app_cinema_code 集合,逗号分隔
  excludeCinemaCodes: "", // 排除影院对应的 app_cinema_code 集合,逗号分隔
  includeHallNames: [], // 包含影厅
  excludeHallNames: [], // 排除影厅
  includeFilmNames: [], // 包含影片
  excludeFilmNames: [], // 排除影片
  quanValue: [], // 用券类型
  allow_offer_time: "", // 允许报价时间
  last_used_time: "", // 最后报价时间
  offerType: "1", // 报价类型, 1-固定价 2-会员价加价 3-会员日报价
  weekDay: [], // 启用星期
  seatNum: "", // 座位数
  memberDay: "", // 会员日
  film_type: "", // 电影格式
  remark: "", // 备注
  status: "1", // 状态
  platOfferList: [
    {
      platName: "lieren",
      value: "",
      isSyncPlat: "" // 是否同步平台，1-同步 2-不同步
    }
  ], // 平台报价规则
  autoUseQuanStatus: "2", // 自动用券状态 1-开启 2-关闭
  autoUseQuanPrice: "", // 自动用券价格
  auto_quan_value: "", // 自动用券类型
  memberPriceRule: "" // 会员价取值报价规则
});

let cityList = ref([]); // 城市列表
let cinemaList = ref([]); // 影院列表
let hallList = ref([]); // 影厅列表
let filmList = ref([]); // 影片列表
const rules = {
  ruleName: [{ required: true, message: "规则名称不能为空", trigger: "blur" }],
  // orderForm: [
  //   { required: true, message: "订单来源不能为空", trigger: "blur" }
  //   // 如果Session ID有特定格式要求，可以在这里添加pattern验证
  // ],
  shadowLineName: [
    { required: true, message: "影线名称不能为空", trigger: "blur" }
    // 如果Session ID有特定格式要求，可以在这里添加pattern验证
  ]
};

// 座位报价规则
const isShowOfferFlag = computed(() => {
  let app_name = formData.shadowLineName;
  let offer_type = formData.offerType;
  return (
    ["ume_applet", "chenxing_applet", "sfc_applet"].includes(
      GET_APP_INFO(app_name)?.app_type_code
    ) && offer_type === "2"
  );
});

// 排除城市列表
const excludeCityList = computed(() => {
  if (!formData.includeCityNames.length) {
    return cityList.value;
  }
  return cityList.value.filter(
    item => !formData.includeCityNames.includes(item.city_name)
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
    formData.orderForm = []; // 订单来源
    formData.shadowLineName = ""; // 影线
  }
  formData.includeCityNames = []; // 包含城市
  formData.excludeCityNames = []; // 排除城市
  formData.includeCinemaNames = []; // 包含影院
  formData.excludeCinemaNames = []; // 排除影院
  formData.includeCinemaCodes = ""; // 包含影院code
  formData.excludeCinemaCodes = ""; // 排除影院code
  formData.includeHallNames = []; // 包含影厅
  formData.excludeHallNames = []; // 排除影厅
  formData.includeFilmNames = []; // 包含影片
  formData.excludeFilmNames = []; // 排除影片
  formData.quanValue = []; // 用券类型
  formData.allow_offer_time = "";
  formData.offerType = "1"; // 报价类型, 1-固定价 2-会员价加价 3-会员日报价
  formData.weekDay = []; // 启用星期
  formData.seatNum = ""; // 座位数
  formData.memberPriceRule = ""; // 座位数
  formData.memberDay = ""; // 会员日
  formData.film_type = "";
  formData.remark = ""; // 备注
  formData.status = "1"; // 状态
  formData.platOfferList = [
    {
      platName: "lieren",
      value: "",
      isSyncPlat: "" // 是否同步平台，1-同步 2-不同步
    }
  ]; // 平台报价规则
  formData.autoUseQuanStatus = "2"; // 自动用券状态 1-开启 2-关闭
  formData.autoUseQuanPrice = ""; // 自动用券价格
  formData.auto_quan_value = ""; // 自动用券标识
};

// 根据当前选中的影院名称，同步对应的 app_cinema_code 集合
const syncCinemaCodesByNames = () => {
  try {
    const app_name = formData.shadowLineName;
    if (!app_name) {
      formData.includeCinemaCodes = "";
      formData.excludeCinemaCodes = "";
      return;
    }
    const appInfo = GET_APP_INFO(app_name);
    const app_type_code = appInfo?.app_type_code;
    const list = cinemaList.value || [];

    // 与影院映射维护列表保持一致的 app_cinema_code 生成规则
    const buildAppCinemaCode = row => {
      if (!row) return "";
      // ume / 辰星等有独立 cinema_code 的系列，直接用 cinema_code
      if (SYNC_CINEMA_CODE_APP_TYPE_LIST.includes(app_type_code)) {
        return row.cinema_code != null ? String(row.cinema_code) : "";
      }
      // 其他系列使用 city_id + "_" + cinema_id 组合
      const cityId =
        row.city_id != null && row.city_id !== undefined
          ? String(row.city_id)
          : "";
      const cinemaId =
        row.cinema_id != null && row.cinema_id !== undefined
          ? String(row.cinema_id)
          : "";
      return cityId && cinemaId ? `${cityId}_${cinemaId}` : "";
    };

    const getCodesByNames = names => {
      if (!names || !names.length) return "";
      const codeSet = new Set();
      // console.log("syncCinemaCodesByNames names", names, list);
      names.forEach(name => {
        const rows = list.filter(
          row => cinemNameSpecial(row.cinema_name) === cinemNameSpecial(name)
        );
        rows.forEach(row => {
          const code = buildAppCinemaCode(row);
          if (code) codeSet.add(code);
        });
      });
      return Array.from(codeSet).join(",");
    };

    formData.includeCinemaCodes = getCodesByNames(formData.includeCinemaNames);
    formData.excludeCinemaCodes = getCodesByNames(formData.excludeCinemaNames);
  } catch (error) {
    console.warn("同步影院 app_cinema_code 集合异常", error);
  }
};

// 影线改变
const shadowLineChange = async app_name => {
  console.log("app_name", app_name);
  // resetForm(1);
  const allCityList = await getCityList(app_name);
  cityList.value = allCityList;
  const allCinemaList = await getAllCinemaList(app_name, allCityList);
  cinemaList.value = allCinemaList;
  const allFilmList = await getFilmList(
    app_name,
    allCityList[0],
    allCinemaList[0]
  );
  filmList.value = allFilmList;
  const quanTypeList = await getQuanTypeList(app_name);
  quanType.value = quanTypeList;
};

// 删除
const removeDomain = item => {
  const index = formData.platOfferList.indexOf(item);
  if (index !== -1) {
    formData.platOfferList.splice(index, 1);
  }
};

// 新增
const addDomain = () => {
  formData.platOfferList.push({
    platName: "",
    value: "",
    isSyncPlat: "" // 是否同步平台，1-同步 2-不同步
  });
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
        console.log("编辑", formInfo);
        formData.id = formInfo.id;
        formData.ruleName = formInfo.ruleName;
        formData.orderForm = formInfo.orderForm.split(",");
        formData.shadowLineName = formInfo.shadowLineName;
        formData.allow_offer_time = formInfo.allow_offer_time;
        formData.last_used_time = formInfo.last_used_time;
        formData.quanValue = formInfo.quanValue;
        formData.weekDay = formInfo.weekDay; // 启用星期
        formData.seatNum = formInfo.seatNum; // 座位数
        formData.memberPriceRule = formInfo.memberPriceRule;
        formData.memberDay = formInfo.memberDay; // 会员日
        formData.film_type = formInfo.film_type;
        formData.remark = formInfo.remark;
        formData.status = formInfo.status;
        formData.offerType = formInfo.offerType;
        formData.includeCityNames = formInfo.includeCityNames;
        formData.excludeCityNames = formInfo.excludeCityNames;
        formData.includeCinemaNames = formInfo.includeCinemaNames;
        formData.excludeCinemaNames = formInfo.excludeCinemaNames;
        formData.includeCinemaCodes = formInfo.includeCinemaCodes || "";
        formData.excludeCinemaCodes = formInfo.excludeCinemaCodes || "";
        formData.includeHallNames = formInfo.includeHallNames;
        formData.excludeHallNames = formInfo.excludeHallNames;
        formData.includeFilmNames = formInfo.includeFilmNames;
        formData.excludeFilmNames = formInfo.excludeFilmNames;
        formData.platOfferList = formInfo.platOfferList;
        formData.autoUseQuanStatus = formInfo.autoUseQuanStatus;
        formData.autoUseQuanPrice = formInfo.autoUseQuanPrice;
        formData.auto_quan_value = formInfo.auto_quan_value;
      } else {
        // 新增
        formData.shadowLineName = formInfo.shadowLineName;
      }
      const app_name = formData.shadowLineName;
      if (props.dialogTitle !== "查看规则") {
        const allCityList = await getCityList(app_name);
        cityList.value = allCityList;
        const allCinemaList = await getAllCinemaList(app_name, allCityList);
        cinemaList.value = allCinemaList;
        const allFilmList = await getFilmList(
          app_name,
          allCityList[0],
          allCinemaList[0]
        );
        filmList.value = allFilmList;
      }
      const quanTypeList = await getQuanTypeList(app_name);
      quanType.value = quanTypeList;
      // 兼容老数据：如 code 集合为空，则根据名称尝试同步一份
      if (!formData.includeCinemaCodes || !formData.excludeCinemaCodes) {
        syncCinemaCodesByNames();
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

// 切换报价类型时保留猎人 platRuleId，避免再次 ruleAdd 产生重复平台规则
const preserveLierenPlatOfferFields = () => {
  const prev = (formData.platOfferList || []).find(
    p => p.platName === "lieren"
  );
  if (!prev) {
    return { value: "", isSyncPlat: "" };
  }
  return {
    value: prev.value ?? "",
    isSyncPlat: prev.isSyncPlat ?? "",
    platRuleId: prev.platRuleId
  };
};

// 报价类型改变
const offerTypeChange = val => {
  console.log("val", val);
  if (val === "1") {
    // 日常固定价
    formData.memberDay = "";
    const lierenPrev = preserveLierenPlatOfferFields();
    formData.platOfferList = [
      {
        platName: "lieren",
        value: lierenPrev.value,
        isSyncPlat: lierenPrev.isSyncPlat,
        ...(lierenPrev.platRuleId ? { platRuleId: lierenPrev.platRuleId } : {})
      }
    ]; // 平台报价规则
    formData.autoUseQuanStatus = "2"; // 自动用券状态 1-开启 2-关闭
    formData.autoUseQuanPrice = ""; // 自动用券价格
    formData.auto_quan_value = ""; // 自动用券标识
  } else if (val === "2") {
    // 会员价加价
    formData.memberDay = "";
    formData.quanValue = [];
    const lierenPrev = preserveLierenPlatOfferFields();
    formData.platOfferList = [
      {
        platName: "lieren",
        value: lierenPrev.value,
        isSyncPlat: lierenPrev.isSyncPlat,
        ...(lierenPrev.platRuleId ? { platRuleId: lierenPrev.platRuleId } : {})
      }
    ]; // 平台报价规则
  } else if (val === "3") {
    // 会员日固定价
    formData.platOfferList = []; // 平台报价规则
  }
};
// 保存规则
const saveRule = async () => {
  ruleFormRef.value.validate(async valid => {
    if (valid) {
      // 保存前根据当前影院名称同步一份 app_cinema_code 集合，避免只存名称
      syncCinemaCodesByNames();
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

// 包含城市改变
const includeCityChange = value => {
  try {
    console.log("包含城市改变", value, formData.includeCinemaNames);
    // if (formData.includeCinemaNames.length) {
    //   formData.includeCinemaNames = formData.includeCinemaNames.filter(item =>
    //     value.some(itemV => item.includes(itemV.replace(/市$/, "")))
    //   );
    // } else if (formData.excludeCinemaNames.length) {
    //   formData.excludeCinemaNames = formData.excludeCinemaNames.filter(item =>
    //     value.some(itemV => item.includes(itemV.replace(/市$/, "")))
    //   );
    // }
  } catch (error) {
    console.warn("包含城市改变处理异常", error);
  }
};

// 排除城市改变
const excludeCityChange = value => {
  try {
    console.log("排除城市改变", value);
    // if (formData.includeCinemaNames.length) {
    //   formData.includeCinemaNames = formData.includeCinemaNames.filter(
    //     item => !value.some(itemV => item.includes(itemV.replace(/市$/, "")))
    //   );
    // } else if (formData.excludeCinemaNames.length) {
    //   formData.excludeCinemaNames = formData.excludeCinemaNames.filter(
    //     item => !value.some(itemV => item.includes(itemV.replace(/市$/, "")))
    //   );
    // }
  } catch (error) {
    console.warn("排除城市改变处理异常", error);
  }
};

const includeCinemaChange = value => {
  try {
    console.log("包含影院改变", value);
    syncCinemaCodesByNames();
    console.log("表单提交的数据:", formData.value);
  } catch (error) {
    console.warn("包含影院改变处理异常", error);
  }
};

const excludeCinemaChange = value => {
  try {
    console.log("排除影院改变", value);
    syncCinemaCodesByNames();
    console.log("表单提交的数据:", formData.value);
  } catch (error) {
    console.warn("排除影院改变处理异常", error);
  }
};

// 子暴露给父组件的值或方法$refs
defineExpose({
  open,
  closeTck
});
</script>
