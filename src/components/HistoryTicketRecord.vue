<!-- 历史出票记录 -->
<template>
  <div>
    <!-- 查询区：只放条件，全部平铺，栅格按屏幕宽度自动排列换行 -->
    <div class="search-panel">
      <el-form
        class="search-panel__form"
        :model="formData"
        label-width="76px"
        @keyup.enter="searchData"
      >
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
        <el-form-item label="院线名称">
          <el-cascader
            v-model="formData.app_name"
            :options="appCascaderOptions"
            :props="appCascaderProps"
            clearable
            filterable
            placeholder="院线名称"
          />
        </el-form-item>
        <el-form-item label="影院名称">
          <el-input
            v-model="formData.cinema_name"
            placeholder="请输入影院名称"
            clearable
          />
        </el-form-item>
        <el-form-item label="订单号">
          <el-input
            v-model="formData.order_number"
            placeholder="请输入订单号"
            clearable
          />
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
        <el-form-item label="出票用户">
          <el-select
            v-model="formData.user_id"
            placeholder="出票用户"
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
        <el-form-item label="失败原因">
          <el-input
            v-model="formData.err_msg"
            placeholder="请输入失败原因"
            clearable
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
      </el-form>
    </div>

    <!-- 操作栏：本页只有查询动作，跟随查询区靠左 -->
    <div class="page-toolbar">
      <div class="page-toolbar__group">
        <el-button type="primary" @click="searchData">查询</el-button>
        <el-button @click="resetForm">重置</el-button>
      </div>
    </div>

    <!-- 表格 -->
    <el-table
      class="page-table"
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
      <!-- 院线名称、报价来源、用券类型、优惠券码、支付卡号：列表不显示，统一在「详情」弹窗查看 -->
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
      <el-table-column fixed label="订单号">
        <template #default="{ row }">
          <!-- 出票记录优先展示平台出票单号 plat_order_sn，缺失时用报价单号 order_number 兜底 -->
          <!-- 点订单号开详情（.order-link 是全局样式：灰色点线下划线，hover 变主题色） -->
          <span class="order-link" @click="showDetail(row)">{{
            row.plat_order_sn || row.order_number
          }}</span>
        </template>
      </el-table-column>
      <el-table-column fixed label="影院" width="300">
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
      <el-table-column
        prop="user_name"
        label="用户"
        width="80"
        align="center"
      />
      <el-table-column
        prop="mobile"
        label="出票手机号"
        width="125"
        align="center"
      />
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
      <el-table-column label="类型" width="80" align="center">
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
      <el-table-column prop="err_msg" label="失败原因">
        <template #default="scope">
          <span>{{
            scope.row.order_status === "2"
              ? scope.row.err_msg || "未记录失败原因（历史数据）"
              : ""
          }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" fixed="right" align="center" width="264">
        <template
          #default="{
            row: {
              order_status,
              profit,
              id,
              order_number,
              plat_order_sn,
              user_id: rowUserId,
              lockseat,
              processing_time
            }
          }"
        >
          <!-- 详情入口已挂到订单号上（.order-link），操作列只留真正要点的动作 -->
          <el-button
            v-if="order_status === '2' && String(user_id) === String(rowUserId)"
            size="small"
            type="primary"
            @click="
              againTicket({
                order_number,
                user_id: rowUserId,
                id,
                lockseat,
                processing_time
              })
            "
            >重新出票</el-button
          >

          <!-- 换座出票（2026-10-23）：自选座位出票，出票成功不回传取票码到平台，码只落本地记录 -->
          <el-button
            v-if="order_status === '2' && String(user_id) === String(rowUserId)"
            size="small"
            type="warning"
            plain
            @click="
              openSeatDialog({
                order_number,
                plat_order_sn,
                user_id: rowUserId,
                id,
                lockseat,
                processing_time
              })
            "
            >人工换座</el-button
          >

          <el-button
            v-if="profit && order_status === '1'"
            size="small"
            type="danger"
            @click="refundTicket({ profit, id })"
            >退票</el-button
          >

          <el-button
            v-if="IS_DEV || order_status === '2'"
            size="small"
            type="primary"
            @click="
              queryLog({ order_number, user_id: rowUserId, processing_time })
            "
            >日志</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      class="page-pagination"
      :page-sizes="[10, 20, 30, 50]"
      :background="true"
      layout="total, sizes, prev, pager, next, jumper"
      :total="totalNum"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />

    <el-dialog v-model="dialogLogVisible" title="订单日志" width="1100">
      <el-tabs v-model="logTabActive">
        <el-tab-pane label="明细日志" name="trace">
          <div style="margin-bottom: 10px">
            <span style="margin-right: 8px"
              >订单号：{{ currentLogOrderNumber }}</span
            >
            <el-button size="small" type="primary" @click="queryTrace"
              >查询明细</el-button
            >
            <el-checkbox v-model="traceShowOffer" style="margin-left: 10px"
              >查看报价阶段日志</el-checkbox
            >
            <el-checkbox v-model="traceBrief" style="margin-left: 10px"
              >仅时间线（不含 info，省流量）</el-checkbox
            >
            <span style="margin-left: 10px; font-size: 12px; color: #909399"
              >来源：后端日志文件 /svpi/log/trace（按日/按用户目录）</span
            >
          </div>
          <!-- max-height 用视口：写死像素在小屏会让弹框超出视口、遮罩层出第二条滚动条 -->
          <el-table :data="traceData" border max-height="calc(85vh - 150px)">
            <el-table-column type="index" label="序号" width="60" />
            <el-table-column
              property="opera_time"
              sortable
              label="操作时间"
              width="160"
            />
            <el-table-column property="des" width="220" label="操作描述" />
            <el-table-column property="level" width="70" label="级别" />
            <el-table-column property="upload_type" width="70" label="类型" />
            <el-table-column
              v-if="!traceBrief"
              property="info"
              show-overflow-tooltip
              label="详细信息"
              :formatter="formatTraceInfo"
            />
          </el-table>
        </el-tab-pane>
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
      </el-tabs>
    </el-dialog>

    <!-- 出票详情弹框（V3 L0：用户关心的用券用卡字段直接展示） -->
    <el-dialog v-model="dialogDetailVisible" title="出票详情" width="760">
      <el-descriptions v-if="currentTicketRow" :column="2" border>
        <el-descriptions-item label="订单号">{{
          currentTicketRow.plat_order_sn || currentTicketRow.order_number
        }}</el-descriptions-item>
        <el-descriptions-item label="院线名称">{{
          APP_LIST[currentTicketRow.app_name] || currentTicketRow.app_name || ""
        }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{
          TICKET_STATUS[currentTicketRow.order_status]
        }}</el-descriptions-item>
        <el-descriptions-item label="报价来源">{{
          currentTicketRow.offer_from == 1
            ? "平台"
            : currentTicketRow.offer_from == 2
              ? "机器"
              : ""
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

    <!-- 换座出票：自选目标座位，出票成功后不回传平台，只本地拿取票码 -->
    <el-dialog
      v-model="seatDialogVisible"
      title="换座出票（不上传平台）"
      width="520"
    >
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="订单号">{{
          seatForm.order_number
        }}</el-descriptions-item>
        <el-descriptions-item v-if="seatForm.platOrderSn" label="出票单号">{{
          seatForm.platOrderSn
        }}</el-descriptions-item>
        <el-descriptions-item label="原座位">{{
          seatForm.oldSeat || "-"
        }}</el-descriptions-item>
      </el-descriptions>
      <div class="seat-field">
        <div class="seat-field__label">目标座位</div>
        <el-input
          v-model="seatForm.seatText"
          placeholder="如 3排7座,3排8座"
          clearable
        />
        <div class="seat-field__tip">
          格式「x排y座」，多个座位用逗号或空格分隔，座位数需与票数一致
        </div>
      </div>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="本次出票不会上传取票码到平台"
        description="出票成功后取票码只写入本机出票记录（详情可见），完成后本页会自动弹窗展示并可复制。"
      />
      <template #footer>
        <el-button @click="seatDialogVisible = false">取消</el-button>
        <el-button
          type="warning"
          :loading="seatSubmitting"
          @click="confirmSeatTicket"
          >开始出票</el-button
        >
      </template>
    </el-dialog>

    <!-- 取票码：轮询到码后自动弹出 -->
    <el-dialog v-model="codeDialogVisible" title="取票码" width="420">
      <div class="code-order">订单号：{{ codeOrderNumber }}</div>
      <div class="code-box">{{ codeValue }}</div>
      <template #footer>
        <el-button @click="codeDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="copyCode">复制取票码</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  onBeforeUnmount,
  onBeforeMount,
  computed,
  watch
} from "vue";
import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
// 开发环境不限制"查询日志"入口（生产仅失败订单可查看，2026-08-21 用户要求）
const IS_DEV = import.meta.env.DEV;
const {
  userInfo: { rule, user_id }
} = platTokens();

import {
  ORDER_FORM,
  GET_APP_LIST,
  TICKET_STATUS,
  IN_RULE_LIST,
  GET_APP_TYPE_LIST,
  TICKET_CODE_READY_EVENT
} from "@/common/constant.js";
import {
  parseSeatText,
  resolveSeatChangeOrigin,
  isTicketQueueRunningForOrder,
  matchCodeWatchKey
} from "@/common/autoTicket/buyTicket/common/manualSeatChange.js";

// 券类型列表
const quanType = ref([]);

// console.log("ORDER_FORM", ORDER_FORM);
// 订单来源
const orderFormObj = ORDER_FORM;
// 院线列表
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());

// 院线二级级联配置（系列 -> 院线）
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
  1: "券",
  2: "会员",
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
  app_name: "", // 院线名称
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

// 取订单出票快照：优先内存（出票队列 handleNewOrder 写入，零网络延迟），
// 内存缺失（客户端重启等）时降级走 L1/L2 日志查询兜底
const resolveTicketOrder = async ({
  order_number,
  user_id,
  lockseat,
  processing_time
}) => {
  if (!order_number) return null;
  // 2026-08-21：L2 日志异步上传（fire-and-forget 串行链）失败瞬间可能尚未落盘，日志查询还原会失败
  let order = window.__ticketOrderSnapshots?.get(order_number);
  if (!order) {
    // 内存快照缺失（客户端重启等场景）：降级走 L1/L2 日志查询兜底
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
    // V3 修复（2026-08-21）：出票队列 v3Mode 生效后，订单入口快照（infoSave）不再入
    // opera_record（L1）只落 L2 明细——L1 查不到时兜底查 L2 明细文件，否则重新出票失效
    if (!ticketLogInfo && processing_time) {
      const date = String(processing_time).slice(0, 10).replace(/-/g, "");
      const traceRes = await svApi.queryLogTrace({
        order_number,
        userId: user_id,
        date,
        type: 3,
        brief: 0
      });
      const traceList = traceRes.data?.list || [];
      const hit = traceList.find(
        item => item.des == "自动出票队列获取到新的待出票订单"
      );
      if (hit) {
        // L2 明细 info 为对象（原样落盘），与 L1 的字符串格式统一处理
        ticketLogInfo = hit.info;
      }
    }
    if (ticketLogInfo && typeof ticketLogInfo === "string") {
      ticketLogInfo = JSON.parse(ticketLogInfo);
    }
    order = ticketLogInfo?.newOrders || ticketLogInfo?.newOrder;
  }
  if (!order) return null;
  if (!order?.lockseat) {
    order.lockseat = lockseat;
  }
  return order;
};

// 派发重新出票事件（出票队列 BaseTicketQueue.handleNewOrder 监听 newOrder_<appFlag>）
const dispatchTicketOrder = order => {
  const eventName = `newOrder_${order.appName || order.app_name}`;
  window.dispatchEvent(
    new CustomEvent(eventName, {
      detail: {
        order: order,
        isAgain: true
      }
    })
  );
};

// 派发前确认该院线出票队列已启动：未启动时事件会被 handleNewOrder 静默丢弃，
// 但页面已经把记录置为 5，订单会卡在「重新出票中」且操作按钮消失（2026-10-23）
const ensureTicketQueueStarted = order => {
  if (isTicketQueueRunningForOrder(order, window.__ticketQueueRegistry)) {
    return true;
  }
  const appFlag = order?.app_name || order?.appName || "";
  ElMessage.error(
    `院线「${APP_LIST.value[appFlag] || appFlag || "未知"}」的出票队列未启动，请先在队列管理启动`
  );
  return false;
};

// 列表行状态置为「出票中」，与出票队列回写保持一致。
// 先 await 写库再派发，避免后到的 order_status=5 覆盖队列写入的成功/失败状态
const markTicketingStatus = async ({ order_number, user_id: uid, id }) => {
  try {
    await svApi.updateTicketRecord({
      whereObj: {
        order_number,
        user_id: uid
      },
      updateObj: {
        order_status: 5,
        err_info: ""
      }
    });
    let item = tableData.value.find(item => item.id == id);
    if (item) {
      item.order_status = 5;
    }
    return true;
  } catch (error) {
    console.warn("更新出票状态异常", error);
    return false;
  }
};

let againTicketSubmitting = false;
const againTicket = async ({
  order_number,
  user_id,
  id,
  lockseat,
  processing_time
}) => {
  // 防重复点击：重新出票会入队出票，重复派发会重复出票
  if (againTicketSubmitting) return;
  againTicketSubmitting = true;
  try {
    if (!order_number) return;
    const order = await resolveTicketOrder({
      order_number,
      user_id,
      lockseat,
      processing_time
    });
    if (!order) {
      ElMessage.error("未找到该订单的出票快照，无法重新出票");
      return;
    }
    if (!ensureTicketQueueStarted(order)) return;
    // 「换座出票」是一次性的：正常重新出票必须还原原座位、清掉仅取票码标记，
    // 否则内存快照被复用时会沿用改过的座位、并静默跳过上传（2026-10-23）
    if (order.onlyTicketCode) {
      order.lockseat = order.seatChangedFrom || order.lockseat;
      delete order.onlyTicketCode;
      delete order.seatChangedFrom;
    }
    console.warn("待重新出票订单信息", order);
    const marked = await markTicketingStatus({ order_number, user_id, id });
    if (!marked) {
      ElMessage.error("更新出票状态失败，请稍后重试");
      return;
    }
    dispatchTicketOrder(order);
  } catch (error) {
    console.warn("查询操作日志返回异常", error);
  } finally {
    againTicketSubmitting = false;
  }
};

/* ============ 换座出票：自选座位 + 出票成功后不回传平台（仅本地取票码） ============ */

const seatDialogVisible = ref(false);
const seatSubmitting = ref(false);
const seatForm = reactive({
  order_number: "",
  platOrderSn: "",
  user_id: "",
  id: "",
  oldSeat: "",
  seatText: "",
  processing_time: ""
});

const openSeatDialog = ({
  order_number,
  plat_order_sn: platOrderSn,
  user_id: uid,
  id,
  lockseat,
  processing_time
}) => {
  seatForm.order_number = order_number || "";
  seatForm.platOrderSn = platOrderSn || "";
  seatForm.user_id = uid || "";
  seatForm.id = id;
  seatForm.oldSeat = lockseat || "";
  seatForm.seatText = "";
  seatForm.processing_time = processing_time;
  seatDialogVisible.value = true;
};

const confirmSeatTicket = async () => {
  if (seatSubmitting.value) return;
  const seats = parseSeatText(seatForm.seatText);
  if (!seats.length || seats.some(item => !item)) {
    ElMessage.error("座位格式请按「3排7座」填写，多个座位用逗号或空格分隔");
    return;
  }
  seatSubmitting.value = true;
  try {
    const order = await resolveTicketOrder({
      order_number: seatForm.order_number,
      user_id: seatForm.user_id,
      lockseat: seatForm.oldSeat,
      processing_time: seatForm.processing_time
    });
    if (!order) {
      ElMessage.error("未找到该订单的出票快照，无法换座出票");
      return;
    }
    if (!ensureTicketQueueStarted(order)) return;
    const ticketNum = Number(order.ticket_num || 0);
    if (ticketNum && seats.length !== ticketNum) {
      ElMessage.error(`座位数（${seats.length}）与票数（${ticketNum}）不一致`);
      return;
    }
    // 重复换座时保留第一次记录的原座位，避免把上次目标当成原座位
    const seatOrigin = resolveSeatChangeOrigin({
      lockseat: order.lockseat,
      seatChangedFrom: order.seatChangedFrom,
      fallback: seatForm.oldSeat
    });
    const oldSeat = seatOrigin.origin;
    // 覆盖目标座位：出票时各渠道选座的唯一数据源就是 order.lockseat
    order.lockseat = seats.join(" ");
    // 原座位留一份：内存快照是同一个对象，正常「重新出票」时要还原回去
    order.seatChangedFrom = seatOrigin.seatChangedFrom;
    // 仅取票码标识：platManage.submitTicketCode 见到它就跳过回传平台
    order.onlyTicketCode = true;
    console.warn("换座出票订单信息", {
      原座位: oldSeat,
      目标座位: order.lockseat,
      order
    });
    // 先落「出票中」再派发，避免状态 5 覆盖队列的最终状态；
    // 写库失败则中止，避免按钮消失但队列没收到事件
    const marked = await markTicketingStatus({
      order_number: seatForm.order_number,
      user_id: seatForm.user_id,
      id: seatForm.id
    });
    if (!marked) {
      ElMessage.error("更新出票状态失败，请稍后重试");
      return;
    }
    seatDialogVisible.value = false;
    dispatchTicketOrder(order);
    ElMessage.success(
      `已提交换座出票：${oldSeat || "-"} → ${order.lockseat}，本单不上传平台`
    );
    pollTicketCode(seatForm.order_number, seatForm.user_id);
  } catch (error) {
    console.warn("换座出票异常", error);
    ElMessage.error("换座出票提交失败，请查看日志");
  } finally {
    seatSubmitting.value = false;
  }
};

// 取票码弹窗 + 轮询：出票是队列异步跑的，队列跑完先推事件（主路径），
// 轮询只作兜底（事件丢失、页面重开等场景）
const codeDialogVisible = ref(false);
const codeValue = ref("");
const codeOrderNumber = ref("");
// 可能同时有多单在等取票码：Set 记录待等订单，Map 记录各自轮询，避免后一单覆盖前一单
const codeWatchOrders = new Set();
const codePollTimers = new Map();
const shownCodeKeys = new Set();
let codeRefreshTimer = null;

const stopCodePoll = orderNumber => {
  if (orderNumber) {
    const timer = codePollTimers.get(orderNumber);
    if (timer) clearInterval(timer);
    codePollTimers.delete(orderNumber);
    return;
  }
  for (const timer of codePollTimers.values()) clearInterval(timer);
  codePollTimers.clear();
};

// 事件可能早于 saveTicketRecord 写库到达；延迟再刷一次，保证列表状态/座位是最新的
const scheduleCodeRefresh = () => {
  if (codeRefreshTimer) clearTimeout(codeRefreshTimer);
  codeRefreshTimer = setTimeout(() => {
    codeRefreshTimer = null;
    searchData();
  }, 2000);
};

const showCodeDialog = (orderNumber, qrcode) => {
  if (!qrcode) return;
  // 同一单同一个码只展示一次；用户关掉弹窗后不再被轮询重新弹开
  const codeKey = `${orderNumber}|${qrcode}`;
  if (shownCodeKeys.has(codeKey)) return;
  shownCodeKeys.add(codeKey);
  // 弹窗一次只展示一单；已有别的单的码时提示去详情查看，避免覆盖当前码
  if (codeDialogVisible.value && codeValue.value !== qrcode) {
    ElMessage.info(`订单 ${orderNumber} 的取票码已获取，可在出票详情中查看`);
    return;
  }
  codeOrderNumber.value = orderNumber;
  codeValue.value = qrcode;
  codeDialogVisible.value = true;
};

// 队列出票完成事件（BaseTicketQueue.saveTicketRecord / platManage 派发）：
// 本地事件不受各平台订单号字段差异影响，拿到码直接弹窗
const handleTicketCodeReady = event => {
  const {
    order_number,
    plat_order_sn: platOrderSn,
    qrcode,
    errMsg
  } = event.detail || {};
  const watchKey = matchCodeWatchKey(
    codeWatchOrders,
    order_number,
    platOrderSn
  );
  if (!watchKey) return;
  if (qrcode) {
    showCodeDialog(order_number || platOrderSn || watchKey, qrcode);
    // 事件先于写库到达时列表会停在「重新出票中/失败」和旧座位；
    // 保留 watch（由轮询/后续权威事件收尾）并延迟补刷一次，避免提前清空后收不到队列事件
    searchData();
    scheduleCodeRefresh();
  } else {
    // 异步取码场景：队列先写一次失败，取票码随后才由轮询接口补回，
    // 所以这里只提示、不结束等待，避免把「还在取码」误报成失败
    ElMessage.warning(`换座出票暂未拿到取票码：${errMsg || "继续等待"}`);
    searchData();
  }
};

const pollTicketCode = (order_number, uid) => {
  const watchKey = String(order_number);
  stopCodePoll(watchKey);
  codeWatchOrders.add(watchKey);
  let times = 0;
  const timer = setInterval(async () => {
    times += 1;
    // 10s × 66 ≈ 11 分钟，覆盖正常出票 + 系统延迟异步取码（3 分钟 + 7 分钟两轮）
    if (times > 66) {
      // 轮询超时但保留 watch：异步取码事件可能晚于 8~10 分钟到达
      stopCodePoll(watchKey);
      return;
    }
    try {
      const res = await svApi.queryTicketList({
        order_number,
        user_id: uid,
        page_num: 1,
        page_size: 1
      });
      const row = (res?.data?.ticketList || [])[0];
      if (row?.qrcode) {
        stopCodePoll(watchKey);
        codeWatchOrders.delete(watchKey);
        showCodeDialog(order_number, row.qrcode);
        searchData();
      }
    } catch (error) {
      console.warn("轮询取票码失败", error);
    }
  }, 10000);
  codePollTimers.set(watchKey, timer);
};

const copyCode = async () => {
  const text = codeValue.value || "";
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Electron 非安全上下文下 clipboard API 可能不可用，退回 textarea + execCommand
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
  ElMessage.success("取票码已复制");
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
    // 记录归属用户：明细日志按用户目录分片存储，查询必须带 userId 定位该用户目录，
    // 否则后端遍历全部用户目录，同订单号在其他用户目录的分片会被混入（2026-08-20 修复）
    currentLogUserId.value = user_id || "";
    // E1 修复：明细查询日期取订单处理时间（而非"今天"——订单可能不是今天处理的）
    if (processing_time) {
      currentLogDate.value = String(processing_time)
        .slice(0, 10)
        .replace(/-/g, "");
    }
    dialogLogVisible.value = true;
    logTabActive.value = "trace";
    traceAutoQueried.value = true;
    logData.value = logList;
    // 明细日志 Tab 默认在前：打开弹框即自动查询一次（用户手动查询不受影响）
    queryTrace();
  } catch (error) {
    console.warn("查询操作日志返回异常", error);
  }
};

// V3 L2：明细日志 Tab（后端日志文件查询）
const logTabActive = ref("trace");
const currentLogOrderNumber = ref("");
const currentLogDate = ref("");
const currentLogUserId = ref("");
const traceBrief = ref(false);
const traceShowOffer = ref(false); // 是否查看报价阶段（type=1）日志，默认不查看
const traceData = ref([]);
const traceAutoQueried = ref(false);
const queryTrace = async () => {
  if (!currentLogOrderNumber.value) return;
  try {
    const params = {
      order_number: currentLogOrderNumber.value,
      date: currentLogDate.value,
      // 记录归属用户的目录定位：避免后端遍历全部用户目录混入其他用户同单号日志
      userId: currentLogUserId.value,
      brief: traceBrief.value ? 1 : 0
    };
    // 默认不查看报价阶段（type=1）日志，只看出票阶段（type 2/3）；勾选后全量返回
    if (!traceShowOffer.value) {
      params.type = "2,3";
    }
    const res = await svApi.queryLogTrace(params);
    // ⚠️ 修复：sv-request 响应拦截器返回整个响应体（{code,data,msg}），
    // res.data 即后端 data（{list,total}）——取 res.data.list，勿多加一层 data
    traceData.value = res.data?.list || [];
  } catch (error) {
    console.warn("查询明细日志返回异常", error);
    traceData.value = [];
  }
};

// 明细 info 为对象（traceBuffer 原样入参），序列化展示避免 [object Object]
const formatTraceInfo = (row, column, cellValue) => {
  if (cellValue === null || cellValue === undefined) return "";
  if (typeof cellValue === "string") return cellValue;
  try {
    return JSON.stringify(cellValue);
  } catch {
    return String(cellValue);
  }
};

// 首次切到"明细日志"Tab 自动查询（每次打开弹框后仅自动查一次，用户手动查询不受影响）
watch(logTabActive, val => {
  if (val === "trace" && !traceAutoQueried.value) {
    traceAutoQueried.value = true;
    queryTrace();
  }
});

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
  formData.app_name = ""; // 院线名称
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
  // 监听出票队列的「仅取票码」完成事件（换座出票用）
  window.addEventListener(TICKET_CODE_READY_EVENT, handleTicketCodeReady);
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
  stopCodePoll();
  codeWatchOrders.clear();
  shownCodeKeys.clear();
  if (codeRefreshTimer) {
    clearTimeout(codeRefreshTimer);
    codeRefreshTimer = null;
  }
  window.removeEventListener(TICKET_CODE_READY_EVENT, handleTicketCodeReady);
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

/* ===== 换座出票弹窗 ===== */

.seat-field {
  padding: 12px 0 16px;
}

.seat-field__label {
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.seat-field__tip {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}

/* ===== 取票码弹窗 ===== */

.code-order {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.code-box {
  padding: 14px 16px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-color-primary);
  text-align: center;
  letter-spacing: 1px;
  word-break: break-all;
  background: var(--el-color-primary-light-9);
  border-radius: 4px;
}
</style>
