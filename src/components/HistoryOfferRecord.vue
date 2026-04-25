<!-- 历史报价记录 -->
<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="订单来源">
        <el-select
          v-model="formData.plat_name"
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
        <el-cascader
          v-model="formData.app_name"
          :options="appCascaderOptions"
          :props="appCascaderProps"
          clearable
          filterable
          placeholder="影线名称"
        />
      </el-form-item>
      <el-form-item label="影院名称">
        <el-input
          v-model="formData.cinema_name"
          placeholder="请输入影院名称"
          clearable
        />
      </el-form-item>
      <el-form-item label="报价用户">
        <el-select v-model="formData.user_id" placeholder="报价用户" clearable>
          <el-option
            v-for="(item, inx) in userList"
            :key="inx"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <!-- <el-form-item label="报价状态">
        <el-select
          v-model="formData.order_status"
          placeholder="报价状态"
          style="width: 194px"
          clearable
        >
          <el-option label="成功" value="1" />
          <el-option label="失败" value="2" />
        </el-select>
      </el-form-item> -->
      <el-form-item v-if="orderStatus == 1" label="是否中标">
        <el-select v-model="formData.is_deal" placeholder="是否中标" clearable>
          <el-option label="是" value="1" />
          <el-option label="否" value="2" />
        </el-select>
      </el-form-item>
      <!-- <el-form-item
        v-if="IN_RULE_LIST.includes(rule) && orderStatus == 1"
        label="报价差异"
      >
        <el-select
          v-model="formData.is_price_diff"
          placeholder="报价差异"
          clearable
        >
          <el-option label="是" value="1" />
          <el-option label="否" value="" />
        </el-select>
      </el-form-item> -->
      <el-form-item label="报价来源">
        <el-select
          v-model="formData.offer_from"
          placeholder="报价来源"
          clearable
        >
          <el-option label="平台" :value="1" />
          <el-option label="机器" :value="2" />
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
          clearable
          filterable
        >
          <el-option
            v-for="item in quanType"
            :key="item.id"
            :label="item.quan_name"
            :value="item.quan_value"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="orderStatus == 2" label="失败原因">
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
      <el-table-column prop="plat_name" fixed label="订单来源" width="100">
        <template #default="scope">
          <div class="order-source-container">
            <span>{{ orderFormObj[scope.row.plat_name] }}</span>
            <el-tag
              v-if="scope.row.rewards > 0"
              size="small"
              type="danger"
              effect="dark"
              class="reward-tag"
              >奖</el-tag
            >
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="app_name" fixed label="影线名称" width="100">
        <template #default="scope">
          <span>{{ APP_LIST[scope.row.app_name] }}</span>
        </template>
      </el-table-column>
      <!-- <el-table-column label="报价状态" fixed width="85">
        <template #default="scope">
          <span>{{ scope.row.order_status === "1" ? "成功" : "失败" }}</span>
        </template>
      </el-table-column> -->
      <el-table-column prop="order_number" fixed label="订单号" width="110" />
      <el-table-column fixed label="限价 / 税前成本 " width="130">
        <template #default="scope">
          <span>
            {{ scope.row.supplier_max_price || 0 }}
            <span> / {{ scope.row.member_price || 0 }} </span>
          </span>
        </template>
      </el-table-column>
      <el-table-column
        v-if="IN_RULE_LIST.includes(rule) && orderStatus == 1"
        prop="adjust_price"
        fixed
        label="动态调价"
        width="85"
      />
      <!-- <el-table-column
        v-if="IN_RULE_LIST.includes(rule) && orderStatus == 1"
        prop="price_spread"
        fixed
        label="成本价差"
        width="85"
      /> -->
      <el-table-column label="报价来源" width="120">
        <template #default="scope">
          <el-tag
            :type="getOfferFromType(scope.row.offer_from)"
            size="default"
            effect="dark"
            class="offer-type-tag"
          >
            {{ scope.row.offer_from == 1 ? "平台" : "机器" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="报价规则 / 用券类型" width="150">
        <template #default="scope">
          <span
            >{{ scope.row.rule_name || "" }}
            <span v-if="orderStatus == 1">
              / {{ scope.row.quan_value || "无" }}</span
            >
          </span>
        </template>
      </el-table-column>
      <el-table-column
        v-if="IN_RULE_LIST.includes(rule) && orderStatus == 1"
        label="利润 / 报价"
        width="100"
      >
        <template #default="{ row }">
          <span>{{ formatProfit(row) }} </span>
          <span v-if="orderStatus == 1" class="winning-price">
            / {{ supplier_end_price_filter(row) || 0 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column
        v-if="IN_RULE_LIST.includes(rule) && orderStatus == 1"
        prop="is_deal"
        label="是否中标"
        width="85"
      >
        <template #default="{ row: { is_deal } }">
          <span>{{ is_deal == 1 ? "是" : is_deal == 2 ? "否" : "" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="user_name" label="报价人" width="85" />
      <el-table-column prop="cinema_name" label="影院" width="205" />
      <el-table-column prop="hall_name" label="影厅" width="90" />
      <el-table-column label="座位数/片名" width="150">
        <template #default="scope">
          <div class="film-name-container">
            <el-tag
              size="small"
              type="success"
              effect="dark"
              class="ticket-num-tag"
            >
              {{ scope.row.ticket_num }}
            </el-tag>
            <span>{{ scope.row.film_name }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="报价类型" width="120">
        <template #default="scope">
          <el-tag
            v-if="scope.row.offer_type"
            :type="getOfferType(scope.row.offer_type)"
            size="default"
            effect="dark"
            class="offer-type-tag"
          >
            {{ offerTypeObj[scope.row.offer_type] || "" }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="processing_time" label="创建时间" width="160" />
      <el-table-column
        v-if="orderStatus != 1"
        prop="err_msg"
        label="失败原因"
        width="280"
      />
      <el-table-column label="操作" fixed="right" align="center" width="120">
        <template #default="{ row: { order_number, user_id } }">
          <el-button
            v-if="IN_RULE_LIST.includes(rule)"
            size="small"
            type="primary"
            @click="queryLog({ order_number, user_id })"
            >查询日志</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      style="display: flex; justify-content: flex-end; margin-top: 10px"
      :page-sizes="[10, 20, 30, 50]"
      :background="true"
      layout="total, sizes, prev, pager, next, jumper"
      :total="totalNum"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />

    <el-dialog v-model="dialogLogVisible" title="订单操作日志" width="1000">
      <el-table :data="logData" border>
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column
          property="opera_time"
          sortable
          label="操作时间"
          width="160"
        />
        <el-table-column property="des" width="180" label="操作描述" />
        <el-table-column
          property="info"
          show-overflow-tooltip
          label="详细信息"
        />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onBeforeUnmount, onBeforeMount, computed } from "vue";
import { ElLoading } from "element-plus";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

import {
  ORDER_FORM,
  GET_APP_LIST,
  IN_RULE_LIST,
  NO_FEE_PLAT_LIST,
  GET_APP_TYPE_LIST
} from "@/common/constant.js";
import { addDecimal, subDecimal } from "@/utils/utils";
// 券类型列表
const quanType = ref([]);

// 订单来源
const orderFormObj = ORDER_FORM;
// 影线列表
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

// 操作日志弹框
const dialogLogVisible = ref(false);
// 操作日志列表
const logData = ref([]);
// 格式化最终价格
const supplier_end_price_filter = row => {
  let obj = JSON.parse(JSON.stringify(row));
  // console.log("obj", obj);
  if (obj.offer_end_amount) {
    return obj.offer_end_amount;
  }
};

// 表单查询数据
const formData = reactive({
  plat_name: "", // 订单来源
  app_name: "", // 影线名称
  cinema_name: "", // 影院名称
  user_id: "", // 报价用户
  order_status: "", // 报价状态
  is_deal: "", // 是否中标 1-中标 2-未中标
  is_price_diff: "", // 报价差异 1-是
  offer_from: null, // 报价来源 1-平台 2-机器
  order_number: "", // 报价类型
  err_msg: "", // 失败原因
  quan_value: "", // 用券类型
  start_time: "",
  end_time: ""
});

if (!IN_RULE_LIST.includes(rule)) {
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

// 父传子props
const props = defineProps({
  orderStatus: Number
});

formData.order_status = props.orderStatus;

// 查询操作日志
const queryLog = async ({ order_number, user_id }) => {
  try {
    const res = await svApi.queryLogRecord({
      order_number,
      user_id,
      type: 1
    });
    console.warn("查询操作日志返回", res);
    let logList = res.data?.cardList || [];
    dialogLogVisible.value = true;
    logData.value = logList;
  } catch (error) {
    console.warn("查询操作日志返回异常", error);
  }
};

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
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    let res = await svApi.queryOfferList({
      ...queryParams,
      page_num,
      page_size
    });
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
  formData.is_deal = ""; // 是否中标
  formData.user_id = ""; // 报价用户
  formData.order_number = ""; // 报价类型
  formData.err_msg = ""; // 最终报价
  formData.quan_value = ""; // 是否报价
  formData.start_time = getTodayTime(+new Date());
  formData.end_time = getTodayTime(+new Date() + 1 * 24 * 60 * 60 * 1000);
  currentPage.value = 1;
  pageSize.value = 10;
};

// 税后成本价（含手续费）
const formatCostPrice = ({
  offer_end_amount,
  order_status,
  member_price,
  plat_name
}) => {
  if (order_status != 1) {
    return;
  }
  let shouxufei = (offer_end_amount * 100) / 10000;
  if (NO_FEE_PLAT_LIST.includes(plat_name)) {
    shouxufei = 0;
  }
  // 真实成本
  return addDecimal(member_price, shouxufei).toFixed(2);
};

// 预计利润
const formatProfit = ({
  offer_end_amount,
  order_status,
  member_price,
  plat_name,
  rewards = 0,
  offer_from
}) => {
  if (order_status != 1 || offer_from == 1) {
    return;
  }
  let shouxufei = (offer_end_amount * 100) / 10000;
  if (NO_FEE_PLAT_LIST.includes(plat_name)) {
    shouxufei = 0;
  }
  // 奖励费用
  const rewardPrice =
    rewards > 0 ? (offer_end_amount * 100 * rewards) / 10000 : 0;
  return subDecimal(
    addDecimal(offer_end_amount, rewardPrice),
    addDecimal(member_price, shouxufei)
  ).toFixed(2);
};

// 根据报价来源获取标签类型
const getOfferFromType = offer_from => {
  switch (offer_from) {
    case 1:
      return "warning";
    case 2:
      return "primary";
    default:
      return "primary";
  }
};
// 根据报价类型获取标签类型
const getOfferType = offer_type => {
  switch (offer_type) {
    case "1":
      return "info";
    case "2":
      return "primary";
    case "3":
      return "success";
    default:
      return "info";
  }
};
// 获取券类型列表
const getQuanTypeList = async () => {
  try {
    const params = {
      page_num: 1,
      page_size: 1000
    };
    const res = await svApi.queryQuanTypeList(params);
    let quanTypeList = res.data.quanTypeList || [];
    // console.log("券类型列表===>", quanTypeList);
    quanType.value = quanTypeList;
  } catch (error) {
    console.error("获取券类型列表异常", error);
  }
};

onBeforeMount(async () => {
  await getQuanTypeList();
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

<style scoped>
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgb(103 194 58 / 40%);
  }

  70% {
    box-shadow: 0 0 0 10px rgb(103 194 58 / 0%);
  }

  100% {
    box-shadow: 0 0 0 0 rgb(103 194 58 / 0%);
  }
}

.demo-form-inline .el-form-item {
  width: 20%;
  margin-right: 0;
}

.demo-form-inline .el-form-item__content {
  flex: 1;
  min-width: 0;
}

.demo-form-inline .el-input,
.demo-form-inline .el-select,
.demo-form-inline :deep(.el-cascader),
.demo-form-inline :deep(.el-date-editor.el-input) {
  width: 95%;
}

.status-success {
  color: #67c23a;
}

.status-failed {
  color: #f56c6c;
}

.status-refunded {
  color: #e6a23c;
}

.status-offer-only {
  color: #909399;
}

.status-retrying {
  color: #409eff;
}

.winning-price {
  font-weight: 600;
  color: #d60a40;
}

.order-source-container {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.reward-tag {
  height: 16px;
  padding: 0 4px;
  font-size: 9px;
  font-weight: 600;
  line-height: 14px;
  border-radius: 2px;
}

.status-tag {
  padding: 0 10px;
  font-weight: 600;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgb(0 0 0 / 10%);
  transition: all 0.3s ease;
}

.status-tag:hover {
  box-shadow: 0 4px 8px rgb(0 0 0 / 15%);
  transform: scale(1.05);
}

.offer-type-tag {
  padding: 0 10px;
  font-weight: 600;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgb(0 0 0 / 10%);
  transition: all 0.3s ease;
}

.offer-type-tag:hover {
  box-shadow: 0 4px 8px rgb(0 0 0 / 15%);
  transform: scale(1.05);
}

.line-through {
  color: #909399;
  text-decoration: line-through;
}

.status-container,
.offer-type-container {
  display: flex;
  gap: 4px;
  align-items: center;
}

.status-icon,
.offer-icon {
  font-size: 12px;
}

.profit-container {
  display: flex;
  flex-wrap: nowrap;
  gap: 5px;
  align-items: center;
}

.transfer-label {
  height: 18px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  border: 1px solid #f56c6c;
  border-radius: 2px;
}

.film-name-container {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}

.ticket-num-tag {
  height: 16px;
  padding: 0 4px;
  font-size: 9px;
  font-weight: 600;
  line-height: 14px;
  border-radius: 2px;
}

/* 表单布局调整 */
</style>
