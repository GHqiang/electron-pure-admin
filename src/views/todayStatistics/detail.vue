<template>
  <div>
    <!-- 返回栏 -->
    <div class="detail-topbar">
      <el-button size="small" @click="goBack">← 返回统计分析</el-button>
      <span class="detail-title">影线明细</span>
    </div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="订单来源">
        <el-select
          v-model="formData.plat_name"
          placeholder="订单来源"
          clearable
          style="width: 194px"
        >
          <el-option
            v-for="(keyValue, keyName) in orderFormObj"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="用户">
        <el-select
          v-model="formData.user_id"
          placeholder="用户"
          style="width: 194px"
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
      <el-form-item label="影线名称">
        <el-cascader
          v-model="formData.app_name"
          :options="appCascaderOptions"
          :props="appCascaderProps"
          style="width: 220px"
          clearable
          filterable
          placeholder="影线名称"
        />
      </el-form-item>
      <el-form-item label="开始时间">
        <el-date-picker
          v-model="formData.start_time"
          type="datetime"
          style="width: 194px"
          placeholder="请选择开始时间"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
          time-format="HH:mm"
        />
      </el-form-item>
      <el-form-item label="结束时间">
        <el-date-picker
          v-model="formData.end_time"
          type="datetime"
          style="width: 194px"
          placeholder="请选择结束时间"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
          time-format="HH:mm"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="loadData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>
    <!-- 明细表格(原今日统计表) -->
    <el-table
      height="500"
      style="width: 100%"
      :data="tableData"
      :default-sort="{ prop: 'successRate', order: 'ascending' }"
      border
      stripe
      show-summary
      :summary-method="getSummaries"
      show-overflow-tooltip
    >
      <el-table-column
        type="index"
        fixed
        label="序号"
        align="center"
        width="60"
      />
      <el-table-column prop="app_name" label="影线名称" min-width="100">
        <template #default="{ row: { app_name } }">
          <span>{{ APP_LIST[app_name] || app_name + "-已调整" }}</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="profitTotal"
        sortable
        label="利润总和"
        min-width="105"
      />
      <el-table-column
        prop="transferTotal"
        label="手续费总和"
        min-width="100"
      />
      <el-table-column
        prop="supplier_end_price_total"
        sortable
        label="流水"
        min-width="105"
      />
      <el-table-column
        prop="offerTotalNum"
        sortable
        label="报价总数"
        min-width="105"
      />
      <el-table-column
        prop="offerSuccessNum"
        sortable
        label="成功数"
        min-width="95"
      />
      <el-table-column
        prop="offerFailNum"
        sortable
        label="失败数"
        min-width="95"
      />
      <el-table-column
        prop="offerRuleMatchEmptyNum"
        sortable
        label="规则为空"
        min-width="105"
      />
      <el-table-column
        prop="offerExceedLimitedPriceNum"
        sortable
        label="超出成本"
        min-width="105"
      />
      <el-table-column
        prop="offerExceedLimitedMaxPriceNum"
        sortable
        label="超出限价"
        min-width="105"
      />
      <el-table-column
        prop="ticketTotalNum"
        sortable
        label="中标数"
        min-width="95"
      />
      <el-table-column
        label="中标率%"
        sortable
        :sort-orders="['ascending', 'descending']"
        :sort-method="sortHandle"
        prop="successRate"
        width="105"
      >
        <template #default="{ row: { offerSuccessNum, ticketTotalNum } }">
          <span
            >{{
              ticketTotalNum
                ? (((ticketTotalNum / offerSuccessNum) * 10000) / 100).toFixed(
                    2
                  )
                : 0
            }}
            %</span
          >
        </template>
      </el-table-column>
      <el-table-column
        prop="ticketSuccessNum"
        sortable
        label="成功数"
        min-width="95"
      />
      <el-table-column
        prop="ticketNum"
        sortable
        label="出票数"
        min-width="95"
      />
      <el-table-column label="成功率" width="90">
        <template #default="{ row: { ticketTotalNum, ticketSuccessNum } }">
          <span
            >{{
              ticketSuccessNum
                ? Math.floor((ticketSuccessNum / ticketTotalNum) * 100)
                : 0
            }}
            %</span
          >
        </template>
      </el-table-column>
      <el-table-column
        prop="ticketFailNum"
        sortable
        label="失败数"
        min-width="95"
      />
      <el-table-column
        prop="ticketTransferNum"
        sortable
        label="转单数"
        min-width="95"
      />
    </el-table>
  </div>
</template>
<script setup>
defineOptions({
  name: "todayStatisticsDetail"
});
import { ref, reactive, computed, onBeforeMount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElLoading, ElMessageBox } from "element-plus";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

import { ORDER_FORM, GET_APP_LIST, GET_APP_TYPE_LIST } from "@/common/constant.js";
// 用户列表
const userList = ref([]);
// 订单来源
const orderFormObj = ORDER_FORM;
// 影线列表
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());

// 影线二级级联配置(系列 -> 影线)
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

// 表单查询数据
const formData = reactive({
  plat_name: "", // 订单来源
  user_id: "", // 用户id
  app_name: "", // 影线名称
  start_time: "",
  end_time: ""
});
const tableData = ref([]);

formData.rule = rule;

const getTodayTime = sjc => {
  const now = new Date(sjc);
  // 获取年、月、日、小时、分钟、秒
  const year = now.getFullYear();
  const month = ("0" + (now.getMonth() + 1)).slice(-2); // 月份数字是从0开始的，所以需要加1
  const date = ("0" + now.getDate()).slice(-2);
  return `${year}-${month}-${date} 00:00:00`;
};

formData.start_time = getTodayTime(+new Date());
formData.end_time = getTodayTime(+new Date() + 1 * 24 * 60 * 60 * 1000);

// 返回
const router = useRouter();
const route = useRoute();
const goBack = () => router.push("/set/todayStatistics");

// 中标率排序(沿用原逻辑)
const sortHandle = (a, b) => {
  // 1. offerSuccessNum 为 0 的排在最后
  if (a.offerSuccessNum == 0 && b.offerSuccessNum == 0) {
    return 0;
  }
  if (a.offerSuccessNum == 0) {
    return 1; // a排在最后
  }
  if (b.offerSuccessNum == 0) {
    return -1; // b排在最后
  }

  const isAscending = true;

  // 2. & 3. 根据ticketTotalNum是否为0来决定排序方式
  const aIsZeroRate = a.ticketTotalNum == 0;
  const bIsZeroRate = b.ticketTotalNum == 0;

  // 如果都是0%或都不是0%
  if (aIsZeroRate === bIsZeroRate) {
    if (aIsZeroRate) {
      // 都是0%，按offerSuccessNum排序
      return isAscending
        ? a.offerSuccessNum - b.offerSuccessNum
        : b.offerSuccessNum - a.offerSuccessNum;
    } else {
      // 都不是0%，按中标率排序
      const aRate = a.ticketTotalNum / a.offerSuccessNum;
      const bRate = b.ticketTotalNum / b.offerSuccessNum;
      return isAscending ? aRate - bRate : bRate - aRate;
    }
  }

  // 一个0%一个非0%
  if (aIsZeroRate) {
    return isAscending ? -1 : 1;
  } else {
    return isAscending ? 1 : -1;
  }
};

// 重置
const resetForm = () => {
  formData.plat_name = "";
  formData.app_name = "";
  formData.user_id = "";
  formData.start_time = getTodayTime(+new Date());
  formData.end_time = getTodayTime(+new Date() + 1 * 24 * 60 * 60 * 1000);
};

const getSummaries = param => {
  const { columns, data } = param;
  const sums = [];
  columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = "合计";
    } else {
      const values = data.map(item => Number(item[column.property]));
      if (!values.every(value => Number.isNaN(value))) {
        sums[index] = `${values.reduce((prev, curr) => {
          const value = Number(curr);
          if (!Number.isNaN(value)) {
            return prev + curr;
          } else {
            return prev;
          }
        }, 0)}`;
      } else {
        sums[index] = "N/A";
      }
    }
  });
  sums[2] = Number(sums[2]).toFixed(2);
  sums[3] = Number(sums[3]).toFixed(2);
  sums[4] = Number(sums[4]).toFixed(2);
  sums[12] = Math.floor((sums[11] / sums[6]) * 100) + "%";
  sums[15] =
    sums[13] > 0 ? Math.floor((sums[13] / sums[11]) * 100) + "%" : "0%";
  return sums;
};

// 时间范围上限:报价记录实时表保留 30 天,超出部分由预聚合表(stat_daily_record,永久保留)兜底,故放开到 31 天
const MAX_QUERY_DAYS = 31;
const confirmQueryRange = async () => {
  if (!formData.start_time || !formData.end_time) return true;
  const rangeDays =
    (new Date(formData.end_time) - new Date(formData.start_time)) / 86400000;
  if (rangeDays <= MAX_QUERY_DAYS) return true;
  ElMessageBox.alert(
    `查询时间范围不能超过 ${MAX_QUERY_DAYS} 天(报价记录仅保留 ${MAX_QUERY_DAYS} 天,超出部分无数据)`,
    "提示",
    { type: "warning", confirmButtonText: "知道了" }
  );
  return false;
};

const loadData = async () => {
  if (!(await confirmQueryRange())) return;
  const loading = ElLoading.service({
    lock: true,
    text: "Loading",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    let formInfo = JSON.parse(JSON.stringify(formData));
    const filteredEntries = Object.entries(formInfo).filter(([key, value]) => {
      return value !== null && value !== undefined && value !== "";
    });
    // 使用Object.fromEntries将过滤后的键值对数组转换回对象
    let queryParams = Object.fromEntries(filteredEntries);
    // appList 已移除:后端只返回有数据的影线,无数据影线由本地 APP_LIST 补 0(整改方案 §3.5)
    const res = await svApi.queryAnalysis(queryParams);
    // console.log("res", res);
    let list = res.data?.list || [];
    // 本地补 0:后端只返回有数据的影线,按全量 APP_LIST 补全无数据影线(保持原"全量展示"行为)
    // 下钻模式(带 app_name 进入)不补 0,只展示目标影线
    if (!isDrillDown.value) {
      const hasApp = new Set(list.map(item => item.app_name));
      const zeroRow = app_name => ({
        app_name,
        profitTotal: 0,
        supplier_end_price_total: 0,
        transferTotal: 0,
        offerTotalNum: 0,
        offerSuccessNum: 0,
        offerFailNum: 0,
        offerRuleMatchEmptyNum: 0,
        offerExceedLimitedPriceNum: 0,
        offerExceedLimitedMaxPriceNum: 0,
        ticketTotalNum: 0,
        ticketSuccessNum: 0,
        ticketNum: 0,
        ticketFailNum: 0,
        ticketTransferNum: 0
      });
      Object.keys(APP_LIST.value).forEach(appName => {
        if (!hasApp.has(appName)) list.push(zeroRow(appName));
      });
    }
    tableData.value = list;
    loading.close();
  } catch (error) {
    loading.close();
    console.warn("加载数据异常", error);
  }
};

// 下钻模式:从主页面带 app_name 进入时,只展示该影线(不补 0,避免其余影线全 0 行无意义)
const isDrillDown = ref(!!route.query.app_name);

// 支持从主页面下钻:回填 app_name 后加载;keepAlive 缓存下组件实例复用,query 变化需重新加载
if (route.query.app_name) {
  formData.app_name = route.query.app_name;
}
loadData();
watch(
  () => route.query.app_name,
  val => {
    if (val) {
      formData.app_name = val;
      isDrillDown.value = true;
      loadData();
    } else {
      isDrillDown.value = false;
    }
  }
);
onBeforeMount(async () => {
  const res = await svApi.getUserList();
  // console.log("res", res);
  let list = res.data.userList || [];
  // console.log("list", list);
  userList.value = list;
});
</script>
<style scoped>
.detail-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.detail-title {
  font-size: 15px;
  font-weight: 600;
}
</style>
