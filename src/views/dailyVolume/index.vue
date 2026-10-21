<template>
  <div>
    <!-- 查询区 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="时间范围">
        <el-button-group>
          <el-button size="small" :type="quickActive === 1 ? 'primary' : 'default'" @click="quickRange(1)">当天</el-button>
          <el-button size="small" :type="quickActive === 7 ? 'primary' : 'default'" @click="quickRange(7)">近7天</el-button>
          <el-button size="small" :type="quickActive === 30 ? 'primary' : 'default'" @click="quickRange(30)">近30天</el-button>
        </el-button-group>
      </el-form-item>
      <el-form-item label="平台">
        <el-select
          v-model="platFilter"
          multiple
          collapse-tags
          clearable
          placeholder="全部平台"
          style="width: 220px"
        >
          <el-option
            v-for="(keyValue, keyName) in orderFormObj"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="系列">
        <el-select
          v-model="seriesFilter"
          multiple
          collapse-tags
          clearable
          placeholder="全部系列"
          style="width: 200px"
        >
          <el-option
            v-for="item in seriesOptions"
            :key="item.app_type_code"
            :label="item.app_type_name"
            :value="item.app_type_code"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="用户">
        <el-select v-model="formData.user_id" clearable placeholder="全部用户" style="width: 160px">
          <el-option
            v-for="item in userList"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSearch">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 指标切换 + 周期小结 -->
    <div class="metric-bar">
      <el-radio-group v-model="metric" size="small">
        <el-radio-button v-for="item in METRIC_OPTIONS" :key="item.value" :value="item.value">
          {{ item.label }}
        </el-radio-button>
      </el-radio-group>
      <span class="metric-summary">
        周期内 报价量 <b>{{ formatNum(summary.offerTotalNum) }}</b> · 报价成功
        <b>{{ formatNum(summary.offerSuccessNum) }}</b> · 出票量
        <b>{{ formatNum(summary.ticketTotalNum) }}</b> · 出票成功
        <b>{{ formatNum(summary.ticketSuccessNum) }}</b>
        · 报价成功率 {{ formatRate(summary.offerRate) }} · 出票成功率
        {{ formatRate(summary.ticketRate) }}
      </span>
      <span v-if="!seriesOptions.length" class="metric-hint">
        影院列表未加载,系列维度暂不可用
      </span>
      <span v-else-if="crossView.unmatchedCinemas > 0" class="metric-hint">
        {{ crossView.unmatchedCinemas }} 家影院未匹配到系列,已计入「未分类」
      </span>
    </div>

    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      :closable="false"
      class="load-alert"
    >
      <el-button size="small" @click="loadData">重试</el-button>
    </el-alert>

    <!-- 三视图 -->
    <el-tabs v-model="activeTab">
      <el-tab-pane label="平台 × 系列" name="cross">
        <CrossTable :view="crossView" :plat-labels="orderFormObj" />
      </el-tab-pane>
      <el-tab-pane label="系列排行" name="series">
        <SeriesRank
          :data="seriesRank"
          :metric="metric"
          :metric-label="metricLabel"
          @select="onSeriesSelect"
        />
      </el-tab-pane>
      <el-tab-pane label="影院排行" name="cinema">
        <CinemaBoard
          :data="cinemaRank"
          :metric="metric"
          :metric-label="metricLabel"
          @drill="onCinemaDrill"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
defineOptions({
  name: "dailyVolume"
});
import { ref, reactive, computed, onBeforeMount } from "vue";
import { useRouter } from "vue-router";
import { ElLoading, ElMessageBox } from "element-plus";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
import { ORDER_FORM, GET_ALL_APP_LIST, GET_ALL_APP_TYPE_LIST } from "@/common/constant.js";
import CrossTable from "./components/CrossTable.vue";
import SeriesRank from "./components/SeriesRank.vue";
import CinemaBoard from "./components/CinemaBoard.vue";
import {
  buildSeriesIndex,
  buildCrossView,
  buildSeriesRank,
  buildCinemaRank,
  buildSummary,
  formatNum,
  formatRate
} from "./utils/aggregate.js";

const router = useRouter();
const {
  userInfo: { rule }
} = platTokens();

const orderFormObj = ORDER_FORM;
const orderFormKeys = Object.keys(ORDER_FORM);
const METRIC_OPTIONS = [
  { label: "报价量", value: "offerTotalNum" },
  { label: "报价成功量", value: "offerSuccessNum" },
  { label: "出票量", value: "ticketTotalNum" },
  { label: "出票成功量", value: "ticketSuccessNum" }
];
// 影院显示名:取全部影院(含禁用/历史影院,避免老单显示成 code-已调整)
const APP_LIST = computed(() => GET_ALL_APP_LIST());
// 系列树(全部影院,保证历史单也能映射到系列):[{ app_type_code, app_type_name, app_name_list }]
const seriesOptions = computed(() =>
  GET_ALL_APP_TYPE_LIST().filter(item => (item.app_name_list || []).length > 0)
);

const userList = ref([]);
const rawRows = ref([]);
const loadError = ref("");
const activeTab = ref("cross");
const metric = ref("offerTotalNum");
const quickActive = ref(7);
// 平台/系列多选在前端过滤:后端只做等值过滤,多选循环请求代价高
const platFilter = ref([]);
const seriesFilter = ref([]);

const metricLabel = computed(() => {
  const target = METRIC_OPTIONS.find(item => item.value === metric.value);
  return target ? target.label : "单量";
});

// 表单只放需要下发给后端的参数(平台/系列多选由前端过滤)
const formData = reactive({
  user_id: "",
  start_time: "",
  end_time: ""
});
const pad2 = n => String(n).padStart(2, "0");
const getDayStart = offset => {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())} 00:00:00`;
};
formData.start_time = getDayStart(-6);
formData.end_time = getDayStart(1);

// 系列索引:app_name -> { code, name }
const seriesIndex = computed(() => buildSeriesIndex(seriesOptions.value));

// 影院过滤集合:选系列时收敛到该系列下的影院
const seriesAppSet = computed(() => {
  if (!seriesFilter.value.length) return null;
  const set = new Set();
  seriesOptions.value.forEach(item => {
    if (!seriesFilter.value.includes(item.app_type_code)) return;
    (item.app_name_list || []).forEach(appName => set.add(appName));
  });
  return set;
});

const filteredRows = computed(() =>
  rawRows.value.filter(row => {
    if (platFilter.value.length && !platFilter.value.includes(row.plat_name)) return false;
    if (seriesAppSet.value && !seriesAppSet.value.has(row.app_name)) return false;
    return true;
  })
);

const summary = computed(() => buildSummary(filteredRows.value));
const crossView = computed(() =>
  buildCrossView(filteredRows.value, {
    seriesIndex: seriesIndex.value,
    platOrder: orderFormKeys,
    metric: metric.value
  })
);
const seriesRank = computed(() =>
  buildSeriesRank(filteredRows.value, {
    seriesIndex: seriesIndex.value,
    metric: metric.value
  })
);
const cinemaRank = computed(() =>
  buildCinemaRank(filteredRows.value, {
    seriesIndex: seriesIndex.value,
    appLabels: APP_LIST.value,
    metric: metric.value
  })
);

// 时间范围上限:实时表保留 30 天,超出部分由预聚合表(stat_daily_record)兜底
const MAX_QUERY_DAYS = 31;
const confirmQueryRange = async () => {
  if (!formData.start_time || !formData.end_time) return true;
  const rangeDays = (new Date(formData.end_time) - new Date(formData.start_time)) / 86400000;
  if (rangeDays <= MAX_QUERY_DAYS) return true;
  ElMessageBox.alert(
    `查询时间范围不能超过 ${MAX_QUERY_DAYS} 天(报价记录仅保留 ${MAX_QUERY_DAYS} 天,超出部分无数据)`,
    "提示",
    { type: "warning", confirmButtonText: "知道了" }
  );
  return false;
};

const quickRange = days => {
  quickActive.value = days;
  formData.start_time = days === 1 ? getDayStart(0) : getDayStart(-(days - 1));
  formData.end_time = getDayStart(1);
  loadData();
};
const onSearch = () => {
  quickActive.value = null;
  loadData();
};
const resetForm = () => {
  platFilter.value = [];
  seriesFilter.value = [];
  formData.user_id = "";
  formData.start_time = getDayStart(-6);
  formData.end_time = getDayStart(1);
  quickActive.value = 7;
  loadData();
};

// 请求竞态:序号守卫 + AbortController(与统计分析页一致)
let abortController = null;
let reqSeq = 0;
const loadData = async () => {
  if (!(await confirmQueryRange())) return;
  const seq = ++reqSeq;
  abortController?.abort();
  abortController = new AbortController();
  const signal = abortController.signal;
  const loading = ElLoading.service({
    lock: true,
    text: "Loading",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    // 与现有统计页一致:空值参数不下发(rule 可能为空)
    const queryParams = Object.fromEntries(
      Object.entries({
        start_time: formData.start_time,
        end_time: formData.end_time,
        user_id: formData.user_id,
        rule
      }).filter(([, value]) => value !== null && value !== undefined && value !== "")
    );
    const res = await svApi.queryAnalysisCross(queryParams, { signal });
    if (seq !== reqSeq) return;
    rawRows.value = res.data?.list || [];
    loadError.value = "";
  } catch (error) {
    if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") return;
    if (seq !== reqSeq) return;
    rawRows.value = [];
    loadError.value = error?.message || "单量数据加载失败,请重试";
  } finally {
    loading.close();
  }
};

// 系列排行点行:切到影院榜并带上该系列筛选
const onSeriesSelect = code => {
  seriesFilter.value = [code];
  activeTab.value = "cinema";
};
// 影院点行:复用现有影线明细页
const onCinemaDrill = appName => {
  router.push({ path: "/set/todayStatistics/detail", query: { app_name: appName } });
};

loadData();
onBeforeMount(async () => {
  const res = await svApi.getUserList();
  userList.value = res.data?.userList || [];
});
</script>

<style scoped>
.metric-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter, #e0e0e0);
  border-radius: 8px;
  background: #fff;
}
.metric-summary {
  font-size: 13px;
  color: #606266;
}
.metric-summary b {
  color: #303133;
  font-variant-numeric: tabular-nums;
}
.metric-hint {
  font-size: 12px;
  color: #909399;
}
.load-alert {
  margin-bottom: 12px;
}
</style>
