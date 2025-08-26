<template>
  <div>
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
        <el-select
          v-model="formData.app_name"
          placeholder="影线名称"
          style="width: 194px"
          clearable
          filterable
        >
          <el-option
            v-for="(keyValue, keyName) in APP_LIST"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
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
    <!-- 表格 -->
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
import { ref, reactive, onBeforeMount, computed } from "vue";
import { ElLoading } from "element-plus";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

import { ORDER_FORM, GET_APP_LIST } from "@/common/constant.js";
// 用户列表
const userList = ref([]);
// 订单来源
const orderFormObj = ORDER_FORM;
// 影线列表
const APP_LIST = computed(() => GET_APP_LIST());

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
// 每个影院报价数

const sortHandle = (a, b) => {
  // 1. offerSuccessNum 为 0 的排在最后
  if (a.offerSuccessNum == 0 && b.offerSuccessNum == 0) {
    // console.log("Case 1: both offerSuccessNum are 0");
    return 0;
  }
  if (a.offerSuccessNum == 0) {
    // console.log("Case 2: a.offerSuccessNum is 0, return 1");
    return 1; // a排在最后
  }
  if (b.offerSuccessNum == 0) {
    // console.log("Case 3: b.offerSuccessNum is 0, return -1");
    return -1; // b排在最后
  }

  const isAscending = true;
  // console.log("isAscending:", isAscending);

  // 2. & 3. 根据ticketTotalNum是否为0来决定排序方式
  const aIsZeroRate = a.ticketTotalNum == 0;
  const bIsZeroRate = b.ticketTotalNum == 0;
  // console.log("aIsZeroRate:", aIsZeroRate, "bIsZeroRate:", bIsZeroRate);

  // 如果都是0%或都不是0%
  if (aIsZeroRate === bIsZeroRate) {
    if (aIsZeroRate) {
      // 都是0%，按offerSuccessNum排序
      // console.log("Case 4: both are 0%, sort by offerSuccessNum");
      return isAscending
        ? a.offerSuccessNum - b.offerSuccessNum
        : b.offerSuccessNum - a.offerSuccessNum;
    } else {
      // 都不是0%，按中标率排序
      const aRate = a.ticketTotalNum / a.offerSuccessNum;
      const bRate = b.ticketTotalNum / b.offerSuccessNum;
      // console.log("Case 5: both are normal rates, sort by rate", aRate, bRate);
      return isAscending ? aRate - bRate : bRate - aRate;
    }
  }

  // 一个0%一个非0%
  if (aIsZeroRate) {
    // a是0%，b是正常率
    // console.log("Case 6: a is 0%, b is normal");
    return isAscending ? -1 : 1;
  } else {
    // a是正常率，b是0%
    // console.log("Case 7: a is normal, b is 0%");
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
  sums[10] = Math.floor((sums[9] / sums[5]) * 100) + "%";
  sums[13] = sums[11] > 0 ? Math.floor((sums[11] / sums[9]) * 100) + "%" : "0%";
  return sums;
};

const loadData = async () => {
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
    queryParams.appList = JSON.stringify(Object.keys(APP_LIST.value));
    console.log("queryParams", queryParams);
    const res = await svApi.queryAnalysis(queryParams);
    // console.log("res", res);
    let list = res.data?.list || [];
    console.warn("list", list);
    tableData.value = list;
    loading.close();
  } catch (error) {
    loading.close();
    console.warn("加载数据异常", error);
  }
};
loadData();
onBeforeMount(async () => {
  const res = await svApi.getUserList();
  // console.log("res", res);
  let list = res.data.userList || [];
  // console.log("list", list);
  userList.value = list;
});
</script>
<style scoped>
.p-15 {
  padding: 10px;
}
</style>
