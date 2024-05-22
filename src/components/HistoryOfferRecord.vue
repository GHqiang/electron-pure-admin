<!-- 历史报价记录 -->
<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="订单来源">
        <el-select
          v-model="formData.orderForm"
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
          v-model="formData.shadowLineName"
          placeholder="影线名称"
          style="width: 194px"
          clearable
        >
          <el-option
            v-for="(item, index) in shadowLineList"
            :key="index"
            :label="item.label"
            :value="item.value"
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
          v-model="formData.offerType"
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
          v-model="formData.quanValue"
          placeholder="用券面额"
          style="width: 194px"
          clearable
        >
          <el-option label="40" value="40" />
          <el-option label="35" value="35" />
          <el-option label="30" value="30" />
        </el-select>
      </el-form-item>
      <el-form-item label="中标价格">
        <el-input
          v-model="formData.supplier_end_price"
          placeholder="请输入中标价格"
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
      <el-table-column prop="orderForm" fixed label="订单来源" width="110" />
      <el-table-column
        prop="shadowLineName"
        fixed
        label="影线名称"
        width="110"
      />
      <el-table-column label="状态" fixed width="60">
        <template #default="scope">
          <span>{{ scope.row.status === "1" ? "正常" : "禁用" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="orderNumber" fixed label="订单号" width="110" />
      <el-table-column prop="cinema_name" label="影院" width="110" />
      <el-table-column prop="hall_name" label="影厅" width="110" />
      <el-table-column prop="film_name" label="片名" width="110" />
      <el-table-column prop="seatNum" label="座位数" width="110" />
      <el-table-column prop="supplier_end_price" label="中标价" width="110" />
      <el-table-column label="报价类型" width="100">
        <template #default="scope">
          <span>{{ offerTypeObj[scope.row.offerType] || "" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="quanValue" label="用券面额" width="90" />
    </el-table>
  </div>
</template>

<script setup>
import { ref, reactive, computed, toRaw } from "vue";
import idbApi from "@/api/idbApi";
import { ORDER_FORM } from "@/common/constant.js";
console.log("ORDER_FORM", ORDER_FORM);
// 订单来源
const orderFormObj = ORDER_FORM;

// 使用computed确保items响应式
const tableData = ref([]);

// 影线列表
const shadowLineList = ref([
  { value: "sfc", label: "sfc" },
  { value: "选项2", label: "影线2" },
  { value: "选项3", label: "影线3" }
]);

// 报价类型枚举
const offerTypeObj = {
  1: "日常固定价",
  2: "会员价加价",
  3: "会员日报价"
};

// 表单查询数据
const formData = reactive({
  orderForm: "lieren", // 订单来源
  shadowLineName: "sfc", // 影线名称
  status: "", // 状态
  offerType: "", // 报价类型
  supplier_end_price: "", // 中标价
  quanValue: "" // 用券面额
});

// 搜索过滤后的数据
const tableDataFilter = ref([]);

// 搜索数据
const searchData = () => {
  console.log("tableData==>", toRaw(tableData.value));
  tableDataFilter.value = tableData.value.filter(item => {
    const {
      orderForm, // 订单来源
      shadowLineName, // 影线名称
      status, // 状态
      offerTypeObj, // 报价类型
      supplier_end_price, // 中标价
      quanValue // 用券面额
    } = formData;
    let judge1 = orderForm ? item.orderForm === orderForm : true;
    let judge2 = shadowLineName
      ? item.shadowLineName.indexOf(shadowLineName) !== -1
      : true;
    let judge3 = status ? item.status === status : true;
    let judge4 = offerType ? item.offerType === offerType : true;
    let judge5 = supplier_end_price
      ? item.supplier_end_price === supplier_end_price
      : true;
    let judge6 = quanValue ? item.quanValue === quanValue : true;
    return judge1 && judge2 && judge3 && judge4 && judge5 && judge6;
  });
  let list = JSON.parse(JSON.stringify(tableDataFilter.value));
  console.log("tableDataFilter===>", list);
};

const loadData = () => {
  try {
    setInterval(async () => {
      const offerRecords = await idbApi.getAllOrderRecords(1);
      console.log("历史报价记录===>", offerRecords);
      tableData.value = offerRecords || [];
    }, 60 * 1000);
  } catch (error) {
    console.error("获取历史报价记录失败===>", error);
  }
};
loadData();
setTimeout(() => {
  searchData();
}, 2000);

// 重置表单
const resetForm = () => {
  formData.orderForm = "1";
  formData.shadowLineName = "sfc"; // 影线名称
  formData.status = ""; // 状态
  formData.offerType = ""; // 报价类型
  formData.supplier_end_price = ""; // 中标价
  formData.quanValue = ""; // 是否报价
};
</script>
