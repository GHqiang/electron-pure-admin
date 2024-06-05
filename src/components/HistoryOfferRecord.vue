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
        >
          <el-option
            v-for="(keyValue, keyName) in shadowLineObj"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>

      <el-form-item :label="`状&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;态`">
        <el-select
          v-model="formData.status"
          placeholder="状态"
          style="width: 194px"
          clearable
        >
          <el-option label="成功" value="1" />
          <el-option label="失败" value="2" />
        </el-select>
      </el-form-item>
      <el-form-item label="报价类型">
        <el-select
          v-model="formData.offer_type"
          placeholder="报价类型"
          style="width: 194px"
          clearable
        >
          <el-option label="固定价" value="1" />
          <el-option label="会员价加价" value="2" />
          <el-option label="会员日报价" value="3" />
        </el-select>
      </el-form-item>
      <el-form-item label="用券面额">
        <el-select
          v-model="formData.quan_value"
          placeholder="用券面额"
          style="width: 194px"
          clearable
        >
          <el-option label="40" value="40" />
          <el-option label="35" value="35" />
          <el-option label="30" value="30" />
        </el-select>
      </el-form-item>
      <el-form-item label="报价价格">
        <el-input
          v-model="formData.offer_end_amount"
          placeholder="请输入报价价格"
          clearable
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
      :data="tableDataFilter"
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
      <el-table-column prop="quan_value" label="用券面额" width="90" />
    </el-table>
  </div>
</template>

<script setup>
import { ref, reactive, onBeforeUnmount, toRaw } from "vue";
import idbApi from "@/api/idbApi";
import svApi from "@/api/sv-api";

import { ORDER_FORM, APP_LIST } from "@/common/constant.js";
// 订单来源
const orderFormObj = ORDER_FORM;

// 使用computed确保items响应式
const tableData = ref([]);

// 影线列表
const shadowLineObj = APP_LIST;

// 报价类型枚举
const offerTypeObj = {
  1: "日常固定价",
  2: "会员价加价",
  3: "会员日报价"
};

// 格式化中标价格
const supplier_end_price_filter = row => {
  let obj = JSON.parse(JSON.stringify(row));
  console.log("obj", obj);

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
  plat_name: "lieren", // 订单来源
  app_name: "", // 影线名称
  status: "", // 状态
  offer_type: "", // 报价类型
  offer_end_amount: "", // 中标价
  quan_value: "" // 用券面额
});

// 搜索过滤后的数据
const tableDataFilter = ref([]);
let timer;

// 搜索数据
const searchData = () => {
  // console.log("tableData==>", toRaw(tableData.value));
  tableDataFilter.value = tableData.value.filter(item => {
    const {
      plat_name, // 订单来源
      app_name, // 影线名称
      status, // 状态
      offer_type, // 报价类型
      offer_end_amount, // 最终报价
      quan_value // 用券面额
    } = formData;
    // console.log("plat_name", plat_name, "app_name", app_name);
    let judge1 = plat_name ? item.plat_name === plat_name : true;
    let judge2 = app_name ? item.app_name?.indexOf(app_name) >= 0 : true;
    let judge3 = status ? item.order_status === status : true;
    let judge4 = offer_type ? item.offer_type === offer_type : true;
    let judge5 = offer_end_amount
      ? supplier_end_price_filter(item) === offer_end_amount
      : true;
    console.log("judge5", supplier_end_price_filter(item), offer_end_amount);
    let judge6 = quan_value ? item.quan_value === quan_value : true;
    return judge1 && judge2 && judge3 && judge4 && judge5 && judge6;
  });
  let list = JSON.parse(JSON.stringify(tableDataFilter.value));
  console.log("tableDataFilter===>", list);
};

const loadData = async () => {
  try {
    const res = await svApi.getOfferList();
    let offerRecords = res.data.offerList || [];
    console.log("历史报价记录", offerRecords);
    tableData.value = offerRecords.reverse();
    searchData();
    timer = setInterval(async () => {
      const res = await svApi.getOfferList();
      let offerRecords = res.data.offerList || [];
      console.log("历史报价记录===>", offerRecords);
      tableData.value = offerRecords.reverse();
      searchData();
    }, 60 * 1000);
  } catch (error) {
    console.error("获取历史报价记录失败===>", error);
  }
};
loadData();

// 重置表单
const resetForm = () => {
  formData.plat_name = "lieren";
  formData.app_name = ""; // 影线名称
  formData.status = ""; // 状态
  formData.offer_type = ""; // 报价类型
  formData.offer_end_amount = ""; // 最终报价
  formData.quan_value = ""; // 是否报价
};
onBeforeUnmount(() => {
  clearInterval(timer);
  timer = null;
});
</script>
