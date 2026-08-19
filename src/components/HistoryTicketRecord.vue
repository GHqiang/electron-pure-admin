<!-- 历史出票记录 -->
<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline" label-width="80px">
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
      <el-form-item label="出票用户">
        <el-select v-model="formData.user_id" placeholder="出票用户" clearable>
          <el-option
            v-for="(item, inx) in userList"
            :key="inx"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="出票状态">
        <el-select
          v-model="formData.order_status"
          placeholder="出票状态"
          clearable
        >
          <el-option
            v-for="(label, value) of TICKET_STATUS"
            :key="value"
            :label="label"
            :value="value"
          />
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
      <el-form-item label="优惠券码">
        <el-input
          v-model="formData.quan_code"
          placeholder="请输入优惠券"
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
      <el-form-item label="放映时间">
        <el-date-picker
          v-model="formData.show_time"
          type="datetime"
          placeholder="请选择放映时间"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
          time-format="HH:mm:ss"
          clearable
        />
      </el-form-item>
      <el-form-item label="失败原因">
        <el-input
          v-model="formData.err_msg"
          placeholder="请输入失败原因"
          clearable
        />
      </el-form-item>
      <el-form-item label="影片名称">
        <el-input
          v-model="formData.film_name"
          placeholder="请输入影片名称"
          clearable
        />
      </el-form-item>
      <el-form-item label="座位">
        <el-input
          v-model="formData.lockseat"
          placeholder="请输入座位,多个用空号分割"
          clearable
        />
      </el-form-item>
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
      <el-form-item style="margin-left: 10px">
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 操作按钮 -->
    <div style="margin-bottom: 15px" />

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
      <el-table-column label="状态" fixed width="90">
        <template #default="{ row: { order_status } }">
          <el-tag
            :type="getStatusType(order_status)"
            size="default"
            effect="dark"
            class="status-tag"
          >
            {{ TICKET_STATUS[order_status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column fixed label="订单号" width="110">
        <template #default="{ row: { order_number, plat_order_sn } }">
          <!-- 出票记录优先展示平台出票单号 plat_order_sn，缺失时用报价单号 order_number 兜底 -->
          <span>{{ plat_order_sn || order_number }}</span>
        </template>
      </el-table-column>
      <el-table-column fixed label="影院" width="205">
        <template #default="{ row }">
          <el-popover
            placement="top"
            :width="800"
            trigger="hover"
            popper-class="ticket-info-popover"
          >
            <template #reference>
              <span>{{ row.cinema_name }}</span>
            </template>
            <el-table :data="[row]" border style="width: 100%">
              <el-table-column prop="hall_name" label="影厅" />
              <el-table-column prop="film_name" label="片名" />
              <el-table-column prop="lockseat" label="座位" />
              <el-table-column prop="show_time" label="放映时间" />
            </el-table>
          </el-popover>
        </template>
      </el-table-column>
      <el-table-column fixed label="限价/中标价" width="100">
        <template
          #default="{ row: { supplier_max_price, supplier_end_price } }"
        >
          <span
            >{{ supplier_max_price || 0 }}/<span class="winning-price">{{
              supplier_end_price || 0
            }}</span></span
          >
        </template>
      </el-table-column>
      <el-table-column prop="user_name" label="出票人" width="85" />
      <el-table-column prop="mobile" label="出票手机号" width="125" />
      <el-table-column label="利润" width="80">
        <template
          #default="{
            row: { profit, original_profit, order_status, transfer_fee }
          }"
        >
          <div class="profit-container">
            <el-tag
              :type="getProfitType(profit, order_status, transfer_fee)"
              size="small"
              effect="dark"
              :class="{ 'line-through': order_status === '3' }"
              style="padding: 0 8px; font-weight: 600"
            >
              {{ transfer_fee && transfer_fee > 0 ? -transfer_fee : profit || 0
              }}{{
                original_profit && original_profit !== profit && !transfer_fee
                  ? `(${original_profit})`
                  : ""
              }}
            </el-tag>
            <el-tag
              v-if="transfer_fee && transfer_fee > 0"
              size="small"
              type="danger"
              effect="dark"
              class="transfer-label"
            >
              转
            </el-tag>
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
      <el-table-column prop="quan_value" label="用券类型" width="85" />
      <el-table-column prop="quan_code" label="优惠券码" width="90" />
      <el-table-column prop="card_num" label="支付卡号" width="90" />
      <el-table-column prop="processing_time" label="创建时间" width="160" />
      <el-table-column prop="err_msg" label="失败原因" width="110">
        <template #default="scope">
          <span>{{
            scope.row.order_status === "2" ? scope.row.err_msg : ""
          }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" align="center" width="260">
        <template
          #default="{
            row,
            row: {
              order_status,
              profit,
              id,
              order_number,
              user_id: rowUserId,
              lockseat,
              processing_time
            }
          }"
        >
          <el-button size="small" type="info" @click="showDetail(row)"
            >详情</el-button
          >
          <el-button
            v-if="order_status === '2' && String(user_id) === String(rowUserId)"
            size="small"
            type="primary"
            @click="
              againTicket({ order_number, user_id: rowUserId, id, lockseat })
            "
            >重新出票</el-button
          >

          <el-button
            v-if="profit && order_status === '1'"
            size="small"
            type="danger"
            @click="refundTicket({ profit, id })"
            >退票</el-button
          >

          <el-button
            v-if="order_status != 1"
            size="small"
            type="primary"
            @click="
              queryLog({ order_number, user_id: rowUserId, processing_time })
            "
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

    <el-dialog v-model="dialogLogVisible" title="订单日志" width="1100">
      <el-tabs v-model="logTabActive">
        <el-tab-pane label="异常日志" name="error">
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
        </el-tab-pane>
        <el-tab-pane label="明细日志" name="trace">
          <div style="margin-bottom: 10px">
            <span style="margin-right: 8px"
              >订单号：{{ currentLogOrderNumber }}</span
            >
            <el-date-picker
              v-model="traceDate"
              type="date"
              placeholder="选择日期"
              value-format="YYYYMMDD"
              format="YYYY-MM-DD"
              style="width: 160px; margin-right: 10px"
            />
            <el-button size="small" type="primary" @click="queryTrace"
              >查询明细</el-button
            >
            <el-checkbox v-model="traceBrief" style="margin-left: 10px"
              >仅时间线（不含 info，省流量）</el-checkbox
            >
            <span style="margin-left: 10px; color: #909399; font-size: 12px"
              >来源：后端日志文件 /svpi/log/trace（按日/按用户目录）</span
            >
          </div>
          <el-table :data="traceData" border max-height="500">
            <el-table-column type="index" label="序号" width="60" />
            <el-table-column
              property="opera_time"
              sortable
              label="操作时间"
              width="160"
            />
            <el-table-column property="des" width="220" label="操作描述" />
            <el-table-column property="level" width="70" label="级别" />
            <el-table-column
              v-if="!traceBrief"
              property="info"
              show-overflow-tooltip
              label="详细信息"
            />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <!-- 出票详情弹框（V3 L0：用户关心的用券用卡字段直接展示） -->
    <el-dialog v-model="dialogDetailVisible" title="出票详情" width="760">
      <el-descriptions v-if="currentTicketRow" :column="2" border>
        <el-descriptions-item label="订单号">{{
          currentTicketRow.plat_order_sn || currentTicketRow.order_number
        }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{
          TICKET_STATUS[currentTicketRow.order_status]
        }}</el-descriptions-item>
        <el-descriptions-item label="出票手机号">{{
          currentTicketRow.mobile || ""
        }}</el-descriptions-item>
        <el-descriptions-item label="支付卡号">{{
          currentTicketRow.card_num || ""
        }}</el-descriptions-item>
        <el-descriptions-item label="支付前卡余额">{{
          currentTicketRow.card_balance ?? ""
        }}</el-descriptions-item>
        <el-descriptions-item label="实付金额">{{
          currentTicketRow.payment_amount ?? ""
        }}</el-descriptions-item>
        <el-descriptions-item label="用券类型">{{
          currentTicketRow.quan_value || ""
        }}</el-descriptions-item>
        <el-descriptions-item label="优惠券码">{{
          currentTicketRow.quan_code || ""
        }}</el-descriptions-item>
        <el-descriptions-item label="利润">{{
          currentTicketRow.profit ?? ""
        }}</el-descriptions-item>
        <el-descriptions-item label="取票码">{{
          currentTicketRow.qrcode || ""
        }}</el-descriptions-item>
        <el-descriptions-item label="用券明细" :span="2">{{
          formatCoupons(currentTicketRow.coupons)
        }}</el-descriptions-item>
        <el-descriptions-item label="用券用卡路径" :span="2">{{
          currentTicketRow.use_path || ""
        }}</el-descriptions-item>
        <el-descriptions-item
          v-if="currentTicketRow.order_status === '2'"
          label="失败原因"
          :span="2"
          >{{ currentTicketRow.err_msg || "" }}</el-descriptions-item
        >
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onBeforeUnmount, onBeforeMount, computed } from "vue";
import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, user_id }
} = platTokens();

import {
  ORDER_FORM,
  GET_APP_LIST,
  TICKET_STATUS,
  IN_RULE_LIST,
  GET_APP_TYPE_LIST
} from "@/common/constant.js";

// 券类型列表
const quanType = ref([]);

// console.log("ORDER_FORM", ORDER_FORM);
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

// 根据订单状态获取标签类型
const getStatusType = order_status => {
  switch (order_status) {
    case "1":
      return "success";
    case "2":
      return "danger";
    case "3":
      return "warning";
    case "4":
      return "info";
    case "5":
      return "primary";
    default:
      return "info";
  }
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

// 根据利润、订单状态和转单手续费获取标签类型
const getProfitType = (profit, order_status, transfer_fee) => {
  // 退单状态
  if (order_status === "3") {
    return "warning";
  }
  // 转单收费
  if (transfer_fee && transfer_fee > 0) {
    return "danger";
  }
  // 利润为正
  if (profit > 0) {
    return "success";
  }
  // 利润为负
  if (profit < 0) {
    return "danger";
  }
  // 无利润
  return "info";
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

// V3 L0：出票详情弹框
const dialogDetailVisible = ref(false);
const currentTicketRow = ref(null);
const showDetail = row => {
  currentTicketRow.value = row;
  dialogDetailVisible.value = true;
};
// 用券明细 JSON 字符串 → 可读文本
const formatCoupons = str => {
  if (!str) return "";
  try {
    const list = JSON.parse(str);
    if (!Array.isArray(list)) return str;
    return list
      .map(
        item =>
          `${item.couponName || item.couponType || "券"}(${
            item.couponCode || ""
          })`
      )
      .join("、");
  } catch {
    return str;
  }
};

// 表单查询数据
const formData = reactive({
  plat_name: "", // 订单来源
  app_name: "", // 影线名称
  cinema_name: "", // 影院名称
  order_status: "", // 状态
  user_id: "", // 出票用户
  order_number: "", // 订单号
  quan_code: "", // 优惠券
  quan_value: "", // 用券类型
  err_msg: "",
  film_name: "",
  lockseat: "",
  start_time: "",
  end_time: "",
  show_time: "", // 放映时间
  offer_from: "" // 报价来源
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
    // 订单号查询特殊处理：影划算/票圣/麻花出票记录的 order_number 存的是报价单号，
    // 用户按出票单号搜索时需转成 plat_order_sn 才能命中
    if (
      ["yinghuasuan", "piaosheng", "mahua"].includes(queryParams.plat_name) &&
      queryParams.order_number
    ) {
      queryParams.plat_order_sn = queryParams.order_number;
      delete queryParams.order_number;
    }
    // console.log("queryParams", queryParams);
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    let res = await svApi.queryTicketList({
      ...queryParams,
      page_num,
      page_size
    });
    let offerRecords = res.data.ticketList || [];
    // console.log("历史出票记录===>", offerRecords);
    tableData.value = offerRecords;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
  } catch (error) {
    loading.close();
    console.warn("获取出票记录失败", error);
  }
};

const againTicket = async ({ order_number, user_id, lockseat }) => {
  try {
    if (!order_number) return;
    const res = await svApi.queryLogRecord({
      order_number,
      user_id,
      type: 3
    });
    console.warn("查询操作日志返回", res);
    let logList = res.data?.cardList || [];
    let ticketLogInfo = logList.find(
      item => item.des == "自动出票队列获取到新的待出票订单"
    )?.info;
    if (ticketLogInfo) {
      ticketLogInfo = JSON.parse(ticketLogInfo);
    }
    let order = ticketLogInfo?.newOrders || ticketLogInfo?.newOrder;
    if (!order?.lockseat) {
      order.lockseat = lockseat;
    }
    console.warn("待重新出票订单信息", order);
    // 动态生成事件名称
    const eventName = `newOrder_${order.appName}`;
    // 创建一个事件对象
    const newOrderEvent = new CustomEvent(eventName, {
      detail: {
        // 将所有数据放入 detail 对象
        order: order,
        isAgain: true
      }
    });
    window.dispatchEvent(newOrderEvent);
    // 更新出票状态
    svApi.updateTicketRecord({
      whereObj: {
        order_number,
        user_id
      },
      updateObj: {
        order_status: 5,
        err_info: ""
      }
    });
    // 更新出票状态
    let item = tableData.value.find(item => item.id == id);
    if (item) {
      item.order_status = 5;
    }
  } catch (error) {
    console.warn("查询操作日志返回异常", error);
  }
};

// 查询操作日志
const queryLog = async ({ order_number, user_id, processing_time }) => {
  try {
    const res = await svApi.queryLogRecord({
      order_number,
      user_id,
      type: 3
    });
    console.warn("查询操作日志返回", res);
    let logList = res.data?.cardList || [];
    currentLogOrderNumber.value = order_number || "";
    // E1 修复：明细默认日期取订单处理时间（而非"今天"——订单可能不是今天处理的）
    if (processing_time) {
      currentLogDate.value = String(processing_time)
        .slice(0, 10)
        .replace(/-/g, "");
    }
    dialogLogVisible.value = true;
    logTabActive.value = "error";
    logData.value = logList;
  } catch (error) {
    console.warn("查询操作日志返回异常", error);
  }
};

// V3 L2：明细日志 Tab（后端日志文件查询）
const logTabActive = ref("error");
const currentLogOrderNumber = ref("");
const currentLogDate = ref("");
const traceDate = ref("");
const traceBrief = ref(false);
const traceData = ref([]);
const queryTrace = async () => {
  if (!currentLogOrderNumber.value) return;
  try {
    const res = await svApi.queryLogTrace({
      order_number: currentLogOrderNumber.value,
      date: traceDate.value || currentLogDate.value,
      brief: traceBrief.value ? 1 : 0
    });
    traceData.value = res.data?.data?.list || [];
  } catch (error) {
    console.warn("查询明细日志返回异常", error);
    traceData.value = [];
  }
};

// 单个退票
const refundTicket = ({ id, profit }) => {
  ElMessageBox.confirm("确定要退票吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      await svApi.refundTicketRecord({ id, profit });
      searchData();
      ElMessage({
        type: "success",
        message: "退票完成"
      });
    })
    .catch(() => {
      ElMessage({
        type: "info",
        message: "退票取消"
      });
    });
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
    console.error("获取历史出票记录失败===>", error);
  }
};
loadData();

// 重置表单
const resetForm = () => {
  formData.plat_name = "";
  formData.app_name = ""; // 影线名称
  formData.cinema_name = ""; // 影院名称
  formData.order_status = ""; // 状态
  formData.user_id = ""; // 出票用户
  formData.order_number = ""; // 订单号
  formData.err_msg = ""; // 失败原因
  formData.quan_code = ""; // 优惠券码
  formData.quan_value = ""; // 是否报价
  formData.start_time = getTodayTime(+new Date());
  formData.end_time = getTodayTime(+new Date() + 1 * 24 * 60 * 60 * 1000);
  formData.show_time = ""; // 放映时间
  currentPage.value = 1;
  pageSize.value = 10;
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

.ticket-info-popover {
  max-width: none !important;
}

.ticket-info-popover .el-table {
  margin: 0;
}

.ticket-info-popover .el-table__body-wrapper {
  overflow: visible !important;
}

.ticket-info-popover .el-table__header-wrapper {
  overflow: visible !important;
}

.ticket-info-popover .el-table__footer-wrapper {
  overflow: visible !important;
}

/* 表单布局调整 */
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
  width: 100%;
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
</style>
