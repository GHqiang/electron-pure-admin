<!-- 历史报价记录 -->
<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="订单来源">
        <el-select
          v-model="formData.plat_name"
          placeholder="订单来源"
          style="width: 194px"
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
      <el-form-item label="影院名称">
        <el-input
          v-model="formData.cinema_name"
          placeholder="请输入影院名称"
          clearable
        />
      </el-form-item>
      <el-form-item label="报价用户">
        <el-select
          v-model="formData.user_id"
          placeholder="报价用户"
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
      <el-form-item label="报价状态">
        <el-select
          v-model="formData.order_status"
          placeholder="报价状态"
          style="width: 194px"
          clearable
        >
          <el-option label="成功" value="1" />
          <el-option label="失败" value="2" />
        </el-select>
      </el-form-item>

      <el-form-item label="订&nbsp;&nbsp;单&nbsp;&nbsp;号">
        <el-input
          v-model="formData.order_number"
          placeholder="请输入订单号"
          clearable
        />
      </el-form-item>
      <el-form-item label="用券类型">
        <el-select
          v-model="formData.quan_value"
          placeholder="用券类型"
          style="width: 194px"
          clearable
        >
          <el-option
            v-for="(keyValue, keyName) in QUAN_TYPE"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="失败原因">
        <el-input
          v-model="formData.err_msg"
          placeholder="请输入报价失败原因"
          clearable
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
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 表格 -->
    <el-table
      style="width: 100%"
      :data="tableData"
      border
      stripe
      show-overflow-tooltip
    >
      <el-table-column
        type="index"
        fixed
        label="序号"
        align="center"
        width="60"
      />
      <el-table-column prop="plat_name" fixed label="订单来源" width="110">
        <template #default="scope">
          <span>{{ orderFormObj[scope.row.plat_name] }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="app_name" fixed label="影线名称" width="110">
        <template #default="scope">
          <span>{{ shadowLineObj[scope.row.app_name] }}</span>
        </template>
      </el-table-column>
      <el-table-column label="报价状态" fixed width="90">
        <template #default="scope">
          <span>{{ scope.row.order_status === "1" ? "成功" : "失败" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="user_name" fixed label="报价人" width="110" />
      <el-table-column prop="order_number" fixed label="订单号" width="110" />
      <el-table-column prop="cinema_name" label="影院" width="110" />
      <el-table-column prop="hall_name" label="影厅" width="110" />
      <el-table-column prop="film_name" label="片名" width="110" />
      <el-table-column prop="ticket_num" label="座位数" width="110" />
      <el-table-column prop="offer_end_amount" label="最终报价" width="110">
        <template #default="scope">
          <span>{{ supplier_end_price_filter(scope.row) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="报价类型" width="100">
        <template #default="scope">
          <span>{{ offerTypeObj[scope.row.offer_type] || "" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="rewards" label="奖励订单" width="90">
        <template #default="scope">
          <span>{{ scope.row.rewards > 0? "是" : "否" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="quan_value" label="用券类型" width="90" />
      <el-table-column prop="err_msg" label="失败原因" width="110" />
    </el-table>
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      style="margin-top: 10px; display: flex; justify-content: flex-end"
      :page-sizes="[10, 20, 30, 50]"
      :background="true"
      layout="total, sizes, prev, pager, next, jumper"
      :total="totalNum"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onBeforeUnmount, onBeforeMount } from "vue";
import { ElLoading } from "element-plus";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

import { ORDER_FORM, APP_LIST, QUAN_TYPE } from "@/common/constant.js";
// 订单来源
const orderFormObj = ORDER_FORM;
// 影线列表
const shadowLineObj = APP_LIST;
// 报价类型枚举
const offerTypeObj = {
  1: "日常固定价",
  2: "会员价加价",
  3: "会员日报价"
};

// 列表数据
const tableData = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);
// 用户列表
const userList = ref([]);

// 格式化最终价格
const supplier_end_price_filter = row => {
  let obj = JSON.parse(JSON.stringify(row));
  // console.log("obj", obj);
  if (obj.offer_end_amount) {
    return obj.offer_end_amount;
  }
  if (obj.offer_type === "1" || obj.offer_type === "3") {
    return obj.offer_amount;
  }
  return obj.member_offer_amount;
};

// 表单查询数据
const formData = reactive({
  plat_name: "", // 订单来源
  app_name: "", // 影线名称
  cinema_name: "", // 影院名称
  user_id: "", // 报价用户
  order_status: "", // 状态
  order_number: "", // 报价类型
  err_msg: "", // 失败原因
  quan_value: "", // 用券类型
  start_time: "",
  end_time: ""
});

if (rule !== 2) {
  formData.rule = rule;
}
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
// 搜索过滤后的数据
const tableDataFilter = ref([]);
let timer;

// 搜索数据
const searchData = async () => {
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
    // console.log("queryParams", queryParams);
    let res;
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    if (JSON.stringify(queryParams) === "{}") {
      res = await svApi.getOfferList({ page_num, page_size });
    } else {
      res = await svApi.queryOfferList({
        ...queryParams,
        page_num,
        page_size
      });
    }
    let offerRecords = res.data.offerList || [];
    // console.log("历史报价记录===>", offerRecords);
    tableData.value = offerRecords;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
  } catch (error) {
    loading.close();
    console.warn("获取报价记录失败", error);
  }
};
const handleSizeChange = val => {
  currentPage.value = 1;
  console.log(`${val} items per page`);
  searchData();
};
const handleCurrentChange = val => {
  console.log(`current page: ${val}`);
  searchData();
};
const loadData = async () => {
  try {
    searchData();
    // timer = setInterval(async () => {
    //   searchData();
    // }, 60 * 1000);
  } catch (error) {
    console.error("获取历史报价记录失败===>", error);
  }
};
loadData();

// 重置表单
const resetForm = () => {
  formData.plat_name = "";
  formData.app_name = ""; // 影线名称
  formData.cinema_name = ""; // 影院名称
  formData.order_status = ""; // 状态
  formData.user_id = ""; // 报价用户
  formData.order_number = ""; // 报价类型
  formData.err_msg = ""; // 最终报价
  formData.quan_value = ""; // 是否报价
  formData.start_time = getTodayTime(+new Date());
  formData.end_time = getTodayTime(+new Date() + 1 * 24 * 60 * 60 * 1000);
  currentPage.value = 1;
  pageSize.value = 10;
};
onBeforeMount(async () => {
  const res = await svApi.getUserList();
  // console.log("res", res);
  let list = res.data.userList || [];
  // console.log("list", list);
  userList.value = list;
});
onBeforeUnmount(() => {
  clearInterval(timer);
  timer = null;
});
</script>
