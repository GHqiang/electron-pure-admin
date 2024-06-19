<!-- 历史出票记录 -->
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
      <el-form-item label="出票用户">
        <el-select
          v-model="formData.user_id"
          placeholder="出票用户"
          style="width: 194px"
          clearable
        >
          <el-option
            v-for="(item, inx) in userList"
            :label="item.name"
            :value="item.id"
            :key="inx"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="出票状态">
        <el-select
          v-model="formData.order_status"
          placeholder="出票状态"
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
      <el-table-column label="出票状态" fixed width="90">
        <template #default="scope">
          <span>{{ scope.row.order_status === "1" ? "成功" : "失败" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="user_name" fixed label="出票人" width="110" />
      <el-table-column prop="order_number" fixed label="订单号" width="110" />
      <el-table-column prop="cinema_name" label="影院" width="110" />
      <el-table-column prop="hall_name" label="影厅" width="110" />
      <el-table-column prop="film_name" label="片名" width="110" />
      <el-table-column prop="ticket_num" label="座位数" width="110" />
      <el-table-column prop="supplier_end_price" label="中标价" width="110" />
      <el-table-column label="报价类型" width="100">
        <template #default="scope">
          <span>{{ offerTypeObj[scope.row.offer_type] || "" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="rewards" label="奖励订单" width="90">
        <template #default="scope">
          <span>{{ scope.row.rewards == 1 ? "是" : "否" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="quan_value" label="用券面额" width="90" />
      <el-table-column prop="profit" label="利润" width="80" />
      <el-table-column label="转单手续费" width="100">
        <template #default="scope">
          <span>{{ transferFeeFilter(scope.row) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="err_msg" label="失败原因" width="110" />
    </el-table>
    <el-pagination
      style="margin-top: 10px; display: flex; justify-content: flex-end"
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
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
import svApi from "@/api/sv-api";
import { ORDER_FORM, APP_LIST } from "@/common/constant.js";
// console.log("ORDER_FORM", ORDER_FORM);
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

// 表单查询数据
const formData = reactive({
  plat_name: "lieren", // 订单来源
  app_name: "", // 影线名称
  order_status: "", // 状态
  user_id: "", // 出票用户
  offer_type: "", // 报价类型
  supplier_end_price: "", // 中标价
  quan_value: "" // 用券面额
});

// 转单手续费
const transferFeeFilter = ({
  order_status,
  ticket_num,
  supplier_end_price
}) => {
  if (order_status === "2") {
    return (
      (Number(ticket_num) * Number(supplier_end_price) * 100 * 3) /
      10000
    ).toFixed(2);
  }
};

let timer;
// 搜索数据
const searchData = async () => {
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
      res = await svApi.getTicketList({ page_num, page_size });
    } else {
      res = await svApi.queryTicketList({
        ...queryParams,
        page_num,
        page_size
      });
    }
    let offerRecords = res.data.ticketList || [];
    // console.log("历史出票记录===>", offerRecords);
    tableData.value = offerRecords;
    totalNum.value = res.data.totalNum || 0;
  } catch (error) {
    console.warn("获取出票记录失败", error);
  }
};

const handleSizeChange = val => {
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
    console.error("获取历史出票记录失败===>", error);
  }
};
loadData();

// 重置表单
const resetForm = () => {
  formData.plat_name = "lieren";
  formData.app_name = ""; // 影线名称
  formData.order_status = ""; // 状态
  formData.user_id = ""; // 出票用户
  formData.offer_type = ""; // 报价类型
  formData.supplier_end_price = ""; // 中标价
  formData.quan_value = ""; // 是否报价
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
