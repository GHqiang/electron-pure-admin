<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="订单来源">
        <el-select
          v-model="formData.plat_name"
          placeholder="订单来源"
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
            v-for="(keyValue, keyName) in shadowLineObj"
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
          date-format="MMM DD, YYYY"
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
          date-format="MMM DD, YYYY"
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
        <template #default="scope">
          <span>{{ shadowLineObj[scope.row.app_name] }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="profitTotal" label="利润总和" min-width="90" />
      <el-table-column prop="offerTotalNum" label="报价总数" min-width="90" />
      <el-table-column prop="offerSuccessNum" label="成功数" min-width="90" />
      <el-table-column prop="offerFailNum" label="失败数" min-width="90" />
      <el-table-column
        prop="offerRuleMatchEmptyNum"
        label="规则为空"
        min-width="90"
      />
      <el-table-column
        prop="offerExceedLimitedPriceNum"
        label="超过限价"
        min-width="90"
      />
      <el-table-column prop="ticketTotalNum" label="中标数" min-width="90" />
      <el-table-column label="中标率%" width="90">
        <template #default="{ row: { ticketTotalNum, offerTotalNum } }">
          <span
            >{{
              ticketTotalNum
                ? Math.floor((ticketTotalNum / offerTotalNum) * 100)
                : 0
            }}
            %</span
          >
        </template>
      </el-table-column>
      <el-table-column prop="ticketSuccessNum" label="成功数" min-width="90" />
      <el-table-column prop="ticketNum" label="出票数" min-width="90" />
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
      <el-table-column prop="ticketFailNum" label="失败数" min-width="90" />
      <el-table-column
        prop="ticketTransferNum"
        label="转单数"
        min-width="100"
      />
    </el-table>
  </div>
</template>
<script setup>
import { ref, reactive, onBeforeMount } from "vue";
import { ElLoading } from "element-plus";
import svApi from "@/api/sv-api";
import { ORDER_FORM, APP_LIST } from "@/common/constant.js";
import { getCinemaFlag } from "@/utils/utils";
defineOptions({
  name: "Welcome"
});
// 用户列表
const userList = ref([]);
// 订单来源
const orderFormObj = ORDER_FORM;
// 影线列表
const shadowLineObj = APP_LIST;
// 表单查询数据
const formData = reactive({
  plat_name: "lieren", // 订单来源
  user_id: "", // 用户id
  app_name: "", // 影线名称
  start_time: "",
  end_time: ""
});
const tableData = ref([]);

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
// 获取当天报价记录
const getOfferList = async () => {
  try {
    let formInfo = JSON.parse(JSON.stringify(formData));
    const filteredEntries = Object.entries(formInfo).filter(([key, value]) => {
      return value !== null && value !== undefined && value !== "";
    });
    // 使用Object.fromEntries将过滤后的键值对数组转换回对象
    let queryParams = Object.fromEntries(filteredEntries);
    const res = await svApi.queryOfferList(queryParams);
    return res.data.offerList || [];
  } catch (error) {
    console.error("获取报价记录异常", error);
    return [];
  }
};

// 获取当天出票记录
const getTicketList = async () => {
  try {
    let formInfo = JSON.parse(JSON.stringify(formData));
    const filteredEntries = Object.entries(formInfo).filter(([key, value]) => {
      return value !== null && value !== undefined && value !== "";
    });
    // 使用Object.fromEntries将过滤后的键值对数组转换回对象
    let queryParams = Object.fromEntries(filteredEntries);
    const ticketRes = await svApi.queryTicketList(queryParams);
    return ticketRes.data.ticketList || [];
  } catch (error) {
    console.error("获取出票记录异常", error);
    return [];
  }
};

// 重置
const resetForm = () => {
  formData.plat_name = "lieren";
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
  sums[9] = Math.floor((sums[8] / sums[4]) * 100) + "%";
  sums[12] = sums[10] > 0 ? Math.floor((sums[10] / sums[8]) * 100) + "%" : "0%";
  return sums;
};

const loadData = async () => {
  const loading = ElLoading.service({
    lock: true,
    text: "Loading",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    let list = [];
    const offerRecord = await getOfferList();
    const ticketRecord = await getTicketList();
    list = Object.keys(APP_LIST).map(item => ({
      app_name: item,
      profitTotal: 0,
      offerTotalNum: 0,
      offerSuccessNum: 0,
      offerFailNum: 0,
      offerRuleMatchEmptyNum: 0,
      offerExceedLimitedPriceNum: 0,
      ticketTotalNum: 0,
      ticketSuccessNum: 0,
      ticketNum: 0,
      ticketFailNum: 0,
      ticketTransferNum: 0
    }));
    offerRecord.forEach(item => {
      let appName = item.app_name;
      if (!appName) {
        appName = getCinemaFlag(item);
      }
      let inx = list.findIndex(itemA => itemA.app_name === appName);
      // console.log("inx", inx, list);
      list[inx].offerTotalNum++;
      item.order_status === "1"
        ? list[inx].offerSuccessNum++
        : list[inx].offerFailNum++;
      item.err_msg?.includes("规则不存在")
        ? list[inx].offerRuleMatchEmptyNum++
        : null;
      item.err_msg?.includes("超过平台限价")
        ? list[inx].offerExceedLimitedPriceNum++
        : null;
    });
    ticketRecord.forEach(item => {
      let appName = item.app_name;
      if (!appName) {
        appName = getCinemaFlag(item);
      }
      let inx = list.findIndex(itemA => itemA.app_name === appName);
      list[inx].ticketTotalNum++;
      list[inx].profitTotal +=
        Math.round(
          (Number(item.profit || 0) - Number(item.transfer_fee || 0)) * 100
        ) / 100;
      if (item.order_status === "1") {
        list[inx].ticketNum += Number(item.ticket_num);
        list[inx].ticketSuccessNum++;
      } else {
        list[inx].ticketFailNum++;
      }
      item.err_msg?.includes("规则不存在")
        ? list[inx].offerRuleMatchEmptyNum++
        : null;
      item.transfer_fee ? list[inx].ticketTransferNum++ : null;
    });
    // console.log("最终数据", list);
    list = list
      .sort((a, b) => b.offerTotalNum - a.offerTotalNum)
      .map(item => {
        return {
          ...item,
          profitTotal: Number(item.profitTotal.toFixed(2))
        };
      });
    tableData.value = list.filter(item =>
      !formData.app_name ? true : item.app_name === formData.app_name
    );
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
