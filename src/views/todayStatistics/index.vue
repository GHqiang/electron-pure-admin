<template>
  <div>
    <!-- 查询区 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="订单来源">
        <el-select
          v-model="formData.plat_name"
          placeholder="订单来源"
          clearable
          style="width: 160px"
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
          style="width: 160px"
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
          style="width: 200px"
          clearable
          filterable
          placeholder="影线名称"
        />
      </el-form-item>
      <el-form-item label="开始时间">
        <el-date-picker
          v-model="formData.start_time"
          type="datetime"
          style="width: 180px"
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
          style="width: 180px"
          placeholder="请选择结束时间"
          format="YYYY-MM-DD HH:mm:ss"
          value-format="YYYY-MM-DD HH:mm:ss"
          time-format="HH:mm"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSearch">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
        <el-button-group style="margin-left: 8px">
          <el-button size="small" :type="quickActive === 1 ? 'primary' : 'default'" @click="quickRange(1)">当天</el-button>
          <el-button size="small" :type="quickActive === 7 ? 'primary' : 'default'" @click="quickRange(7)">近7天</el-button>
          <el-button size="small" :type="quickActive === 30 ? 'primary' : 'default'" @click="quickRange(30)">近30天</el-button>
        </el-button-group>
        <el-button style="margin-left: 8px" @click="goDetail()">查看影线明细 →</el-button>
      </el-form-item>
    </el-form>

    <!-- KPI 概览(带 vs 昨日 / 7日均 双参照) -->
    <div class="kpi-row">
      <KpiCard
        label="利润"
        :tip="kpi.profitTip"
        :value-text="`¥${fmtMoney(kpi.profit)}`"
        :value-class="kpi.profit < 0 ? 'down' : ''"
        :delta="kpi.profitDelta" :delta-label="kpi.deltaLabel"
        :delta7="kpi.profitDelta7"
      />
      <KpiCard
        label="流水"
        :tip="kpi.supplyTip"
        :value-text="`¥${fmtMoney(kpi.supply)}`"
        :delta="kpi.supplyDelta" :delta-label="kpi.deltaLabel"
        :delta7="kpi.supplyDelta7"
      />
      <KpiCard
        label="转单手续费"
        :tip="kpi.transferTip"
        :value-text="`¥${fmtMoney(kpi.transferTotal)}`"
        :delta="kpi.transferDelta" :delta-label="kpi.deltaLabel"
        :delta7="kpi.transferDelta7"
      />
      <KpiCard
        label="中标率"
        :tip="kpi.dealTip"
        :value-text="kpi.dealRate"
        :delta="kpi.dealDelta" :delta-label="kpi.deltaLabel"
        :delta7="kpi.dealDelta7"
      />
      <KpiCard
        label="成功率"
        :tip="kpi.successTip"
        :value-text="kpi.successRate"
        :delta="kpi.successDelta" :delta-label="kpi.deltaLabel"
        :delta7="kpi.successDelta7"
      />
    </div>

    <!-- 诊断摘要条 -->
    <div class="module-gap">
      <DiagnosisBar :level="diagnosis.level" :title="diagnosis.title" :text="diagnosis.text" :action="diagnosis.action" />
    </div>

    <!-- 趋势曲线 -->
    <div class="module-card">
      <div class="module-title">
        近 {{ moduleRangeDays }} 天趋势
        <span class="module-sub">报价量(柱) · 利润(虚线) · 报价成功率/中标率/出票成功率(%,右轴)</span>
      </div>
      <TrendChart :data="chartData" />
    </div>

    <!-- 失败原因构成 -->
    <div class="module-card">
      <div class="module-title">
        失败原因构成
        <span class="module-sub">按日堆叠 · 规则为空/超成本/超限价/其他</span>
      </div>
      <FailStackChart :data="chartData" />
    </div>

    <!-- 平台拆解 -->
    <div class="module-card">
      <div class="module-title">
        平台拆解
        <span class="module-sub">今日各订单来源表现,按利润排序</span>
      </div>
      <PlatBreakdown :data="platData" />
    </div>

    <!-- 待处理 -->
    <div class="module-card">
      <div class="module-title">
        待处理
        <span class="module-sub">异常预警,点击可下钻影线明细</span>
      </div>
      <PendingAlerts :alerts="alerts" />
    </div>
  </div>
</template>

<script setup>
defineOptions({
  name: "todayStatistics"
});
import { ref, reactive, computed, onBeforeMount } from "vue";
import { useRouter } from "vue-router";
import { ElLoading, ElMessageBox } from "element-plus";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
import { ORDER_FORM, GET_APP_LIST, GET_APP_TYPE_LIST } from "@/common/constant.js";
import KpiCard from "./components/KpiCard.vue";
import DiagnosisBar from "./components/DiagnosisBar.vue";
import TrendChart from "./components/TrendChart.vue";
import FailStackChart from "./components/FailStackChart.vue";
import PlatBreakdown from "./components/PlatBreakdown.vue";
import PendingAlerts from "./components/PendingAlerts.vue";
import { rate, ratePercent, deltaInfo, deltaPpInfo, fmtMoney } from "./utils/rate.js";

const router = useRouter();
const {
  userInfo: { rule, user_id }
} = platTokens();

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
const pad2 = n => String(n).padStart(2, "0");

formData.rule = rule;

const getTodayTime = sjc => {
  const now = new Date(sjc);
  const year = now.getFullYear();
  const month = ("0" + (now.getMonth() + 1)).slice(-2);
  const date = ("0" + now.getDate()).slice(-2);
  return `${year}-${month}-${date} 00:00:00`;
};

formData.start_time = getTodayTime(+new Date());
formData.end_time = getTodayTime(+new Date() + 1 * 24 * 60 * 60 * 1000);

// 数据状态
const listData = ref([]); // query 接口:影线级明细(用于 KPI 汇总与影线级预警)
const trendData = ref([]); // trend 接口:按日序列(含扩展前 8 天,供环比/激增计算)
const platData = ref([]); // plat 接口:平台拆解
const kpi = ref({
  profit: 0,
  supply: 0,
  dealRate: "--",
  successRate: "--",
  profitDelta: null,
  profitDelta7: null,
  supplyDelta: null,
  supplyDelta7: null,
  dealDelta: null,
  dealDelta7: null,
  successDelta: null,
  successDelta7: null,
  hasData: false
});
const alerts = ref([]);
const diagnosis = ref({ level: "info", text: "", action: null });

// 图表数据:trend 截取查询范围(不展示向前扩展段)
const chartData = computed(() => {
  const startDate = formData.start_time ? formData.start_time.slice(0, 10) : "";
  return startDate ? trendData.value.filter(d => d.date >= startDate) : trendData.value;
});

// 查询范围天数(模块标题用)
const moduleRangeDays = computed(() => {
  if (!formData.start_time || !formData.end_time) return 0;
  return Math.round((new Date(formData.end_time) - new Date(formData.start_time)) / 86400000);
});

// 时间范围上限:报价记录仅保留 30 天(offer_record 30 天 / offer_record_fail 3 天),超过 30 天无数据可查,直接拦截
const MAX_QUERY_DAYS = 30;
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

// 时间范围快捷:当天/近7天/近30天,选中态高亮(点搜索/改条件后清除选中态)
const getDayStart = offset => {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  return `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())} 00:00:00`;
};
const quickActive = ref(1); // 1-当天 7-近7天 30-近30天 null-自定义条件
const quickRange = async days => {
  quickActive.value = days;
  formData.start_time = days === 1 ? getDayStart(0) : getDayStart(-(days - 1));
  formData.end_time = getDayStart(1);
  loadData();
};
// 手动搜索:清除快捷选中态(视为自定义条件)
const onSearch = () => {
  quickActive.value = null;
  loadData();
};

// 重置
const resetForm = () => {
  formData.plat_name = "";
  formData.app_name = "";
  formData.user_id = "";
  formData.start_time = getTodayTime(+new Date());
  formData.end_time = getTodayTime(+new Date() + 1 * 24 * 60 * 60 * 1000);
  quickActive.value = 1;
};

// ---------- 基准提取 ----------
// 仅"当天范围(≤1天)"提供环比参照:昨日单日 + 前 7 日均值;
// 多天范围(近7天/近30天/自定义区间)直接隐藏环比——范围合计对比单日无意义
const toDateStr = (dateStr, offset) => {
  const d = new Date(dateStr + " 00:00:00");
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const sumField = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
const sumFailField = (rows, key) => rows.reduce((s, r) => s + Number(r.fail?.[key] || 0), 0);

const extractBaseline = (trend, startTime, endTime) => {
  if (!trend.length || !startTime || !endTime) return null;
  const last = trend[trend.length - 1]; // 查询范围最后一天
  const rangeDays = Math.round((new Date(endTime) - new Date(startTime)) / 86400000);
  if (rangeDays > 1) return { isSingleDay: false }; // 多天范围:无环比参照
  const yesterday = trend.find(d => d.date === toDateStr(last.date, -1)) || null;
  const fromDate = toDateStr(last.date, -7);
  const toDate = toDateStr(last.date, -1);
  const week = trend.filter(d => d.date >= fromDate && d.date <= toDate);
  const avg = (v, n) => (n ? v / n : 0);
  return {
    cur: last,
    yesterday,
    avg7: {
      profit: avg(sumField(week, "profit_total"), week.length),
      supply: avg(sumField(week, "supplier_end_price_total"), week.length),
      transfer: avg(sumField(week, "transfer_total"), week.length),
      offerSuccess: avg(sumField(week, "offer_success_num"), week.length),
      offerFail: avg(sumField(week, "offer_fail_num"), week.length),
      ticketSuccess: avg(sumField(week, "ticket_success_num"), week.length),
      ticketTotal: avg(sumField(week, "ticket_total_num"), week.length),
      ruleEmpty: avg(sumFailField(week, "规则为空"), week.length)
    },
    isSingleDay: true
  };
};

// ---------- KPI 概览 ----------
const computeKpi = (list, baseline) => {
  let profit = 0, supply = 0, transferTotal = 0, offerSuccess = 0, ticketTotal = 0, ticketSuccess = 0;
  list.forEach(item => {
    profit += Number(item.profitTotal || 0);
    supply += Number(item.supplier_end_price_total || 0);
    transferTotal += Number(item.transferTotal || 0);
    offerSuccess += Number(item.offerSuccessNum || 0);
    ticketTotal += Number(item.ticketTotalNum || 0);
    ticketSuccess += Number(item.ticketSuccessNum || 0);
  });
  const y = baseline?.yesterday;
  const a7 = baseline?.avg7;
  const isSingleDay = baseline ? baseline.isSingleDay : true; // 无基准时按单日处理(null 参照自然不显示)
  const dealRateVal = rate(ticketTotal, offerSuccess);
  const successRateVal = rate(ticketSuccess, ticketTotal);
  // 金额类环比用百分比变化,比率类(中标率/成功率)用百分点差值(如 ▲0.9pp)
  // 多天范围:环比参照全部隐藏(范围合计 vs 单日无意义)
  kpi.value = {
    profit,
    supply,
    transferTotal,
    dealRate: ratePercent(ticketTotal, offerSuccess),
    successRate: ratePercent(ticketSuccess, ticketTotal),
    deltaLabel: "较昨日",
    profitDelta: isSingleDay ? deltaInfo(profit, y?.profit_total) : null,
    profitDelta7: isSingleDay ? deltaInfo(profit, a7?.profit) : null,
    supplyDelta: isSingleDay ? deltaInfo(supply, y?.supplier_end_price_total) : null,
    supplyDelta7: isSingleDay ? deltaInfo(supply, a7?.supply) : null,
    transferDelta: isSingleDay ? deltaInfo(transferTotal, y?.transfer_total) : null,
    transferDelta7: isSingleDay ? deltaInfo(transferTotal, a7?.transfer) : null,
    dealDelta: isSingleDay ? deltaPpInfo(dealRateVal, y ? rate(y.ticket_total_num, y.offer_success_num) : null) : null,
    dealDelta7: isSingleDay ? deltaPpInfo(dealRateVal, a7 ? rate(a7.ticketTotal, a7.offerSuccess) : null) : null,
    successDelta: isSingleDay ? deltaPpInfo(successRateVal, y ? rate(y.ticket_success_num, y.ticket_total_num) : null) : null,
    successDelta7: isSingleDay ? deltaPpInfo(successRateVal, a7 ? rate(a7.ticketSuccess, a7.ticketTotal) : null) : null,
    // hover 说明:当天展示昨日/7日均具体值,多天仅口径说明
    profitTip: isSingleDay
      ? `今日利润总和 = 出票成功单(订单状态=1)的利润累加;昨日 ¥${fmtMoney(y?.profit_total || 0)} · 7日均 ¥${fmtMoney(a7?.profit || 0)}`
      : "本周期利润合计 = 出票成功单利润累加",
    supplyTip: isSingleDay
      ? `今日流水 = 供应商价 × 票数累加(仅订单状态=1);昨日 ¥${fmtMoney(y?.supplier_end_price_total || 0)} · 7日均 ¥${fmtMoney(a7?.supply || 0)}`
      : "本周期流水合计 = 供应商价 × 票数累加",
    transferTip: isSingleDay
      ? `转单手续费 = 转单记录(transfer_fee 非空)的手续费累加,计入全部订单状态;昨日 ¥${fmtMoney(y?.transfer_total || 0)} · 7日均 ¥${fmtMoney(a7?.transfer || 0)}`
      : "本周期转单手续费合计 = 转单记录手续费累加",
    dealTip: isSingleDay
      ? `中标率 = 出票中标数 / 报价成功数;昨日 ${ratePercent(y?.ticket_total_num, y?.offer_success_num)} · 7日均 ${ratePercent(a7?.ticketTotal, a7?.offerSuccess)}`
      : "中标率 = 出票中标数 / 报价成功数",
    successTip: isSingleDay
      ? `成功率 = 出票成功数 / 出票总数;昨日 ${ratePercent(y?.ticket_success_num, y?.ticket_total_num)} · 7日均 ${ratePercent(a7?.ticketSuccess, a7?.ticketTotal)}`
      : "成功率 = 出票成功数 / 出票总数",
    hasData: list.length > 0 && (offerSuccess > 0 || ticketTotal > 0 || profit !== 0)
  };
};

// ---------- 待处理预警 ----------
const appNameText = appName => APP_LIST.value[appName] || appName + "-已调整";

const computeAlerts = (list, baseline) => {
  const result = [];
  const cur = baseline?.cur;
  const avg7 = baseline?.avg7;
  // 1. 规则异常激增(全局,红):今日"规则为空" > 前 7 日均值 × 2 且占当日失败 > 50%
  if (cur && avg7 && avg7.ruleEmpty > 0) {
    const curRuleEmpty = Number(cur.fail?.["规则为空"] || 0);
    const curOfferFail = Number(cur.offer_fail_num || 0);
    if (curRuleEmpty > avg7.ruleEmpty * 2 && curOfferFail > 0 && curRuleEmpty > curOfferFail * 0.5) {
      // 估算影响:规则为空次数 × 近 7 日平均单笔利润
      const avgProfitPerTicket = avg7.ticketSuccess > 0 ? avg7.profit / avg7.ticketSuccess : 0;
      const impact = curRuleEmpty * avgProfitPerTicket;
      result.push({
        level: "danger",
        title: "规则异常激增",
        desc: `今日"规则为空" ${curRuleEmpty} 次,为前 7 日均值 ${Math.round(avg7.ruleEmpty)} 次的 ${(curRuleEmpty / avg7.ruleEmpty).toFixed(1)} 倍,占失败 ${Math.round((curRuleEmpty / curOfferFail) * 100)}%;估算影响约 -¥${fmtMoney(Math.abs(impact))}`,
        action: { label: "去检查规则", handler: goRulePage }
      });
    }
  }
  // 2. 影线级阈值(黄):中标率过低 / 成功率异常
  // 分母需达到最小样本数才触发(样本不足时比率不可靠,见设计评审反馈)
  const MIN_DEAL_SAMPLE = 100; // 中标率分母(报价成功数)最小样本:分母需 > 100 才触发
  const MIN_TICKET_SAMPLE = 20; // 成功率分母(出票总数)最小样本
  list.forEach(item => {
    const dealRate = rate(item.ticketTotalNum, item.offerSuccessNum);
    if (dealRate !== null && dealRate < 0.05 && item.offerSuccessNum > MIN_DEAL_SAMPLE) {
      result.push({
        level: "warning",
        title: "中标率过低",
        desc: `${appNameText(item.app_name)} 中标率 ${(dealRate * 100).toFixed(1)}%(中标 ${item.ticketTotalNum}/报价成功 ${item.offerSuccessNum})`,
        action: { label: "查看明细", handler: () => goDetail(item.app_name) }
      });
    }
    const successRate = rate(item.ticketSuccessNum, item.ticketTotalNum);
    if (successRate !== null && successRate < 0.2 && item.ticketTotalNum >= MIN_TICKET_SAMPLE) {
      result.push({
        level: "warning",
        title: "成功率异常",
        desc: `${appNameText(item.app_name)} 出票成功率 ${(successRate * 100).toFixed(1)}%(成功 ${item.ticketSuccessNum}/${item.ticketTotalNum})`,
        action: { label: "查看明细", handler: () => goDetail(item.app_name) }
      });
    }
  });
  // 3. 无数据(提示)
  if (!kpi.value.hasData) {
    result.push({
      level: "info",
      title: "无数据",
      desc: "当前查询条件下无报价/出票数据,请调整时间或过滤条件",
      action: null
    });
  }
  alerts.value = result;
};

// ---------- 诊断摘要 ----------
const computeDiagnosis = () => {
  const target =
    alerts.value.find(a => a.level === "danger") ||
    alerts.value.find(a => a.level === "warning");
  if (target) {
    // 结构化结论:标题(问题)+ 说明(影响)+ 建议动作按钮
    diagnosis.value = {
      level: target.level,
      title: target.title,
      text: target.desc,
      action: target.action
    };
  } else if (kpi.value.hasData) {
    // 环比仅当天范围展示;多天范围不拼接环比文本
    const deltaText = kpi.value.profitDelta
      ? `(${kpi.value.deltaLabel} ${kpi.value.profitDelta.text})`
      : "";
    diagnosis.value = {
      level: "success",
      title: "表现良好",
      text: `利润 ¥${fmtMoney(kpi.value.profit)}${deltaText ? " " + deltaText : ""},中标率 ${kpi.value.dealRate},成功率 ${kpi.value.successRate}`,
      action: { label: "查看影线明细", handler: () => goDetail() }
    };
  } else {
    diagnosis.value = {
      level: "info",
      title: "无数据",
      text: "当前查询条件下无报价/出票数据,请调整时间或过滤条件",
      action: null
    };
  }
};

// ---------- 加载与下钻 ----------
const goDetail = appName => {
  router.push({
    path: "/set/todayStatistics/detail",
    query: appName ? { app_name: appName } : {}
  });
};
const goRulePage = () => {
  router.push("/set/offerRule");
};

// 请求竞态:序号守卫 + AbortController(取消的请求不会触发重试,见 retry-helper isRetryableError)
let abortController = null;
let reqSeq = 0;
const loadData = async () => {
  if (!(await confirmQueryRange())) return;
  const seq = ++reqSeq;
  abortController?.abort();
  abortController = new AbortController();
  const signal = abortController.signal;
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
    const queryParams = Object.fromEntries(filteredEntries);
    // 3 个请求并行,独立容错:任一失败不阻塞其他模块
    const [queryRes, trendRes, platRes] = await Promise.allSettled([
      svApi.queryAnalysis(queryParams, { signal }),
      svApi.queryAnalysisTrend(queryParams, { signal }),
      svApi.queryAnalysisPlat(queryParams, { signal })
    ]);
    if (seq !== reqSeq) return; // 已被更新的请求取代(竞态守卫)
    listData.value = queryRes.status === "fulfilled" ? (queryRes.value.data?.list || []) : [];
    trendData.value = trendRes.status === "fulfilled" ? (trendRes.value.data?.trend || []) : [];
    platData.value = platRes.status === "fulfilled" ? (platRes.value.data?.plat || []) : [];
    const baseline = extractBaseline(trendData.value, formData.start_time, formData.end_time);
    computeKpi(listData.value, baseline);
    computeAlerts(listData.value, baseline);
    computeDiagnosis();
  } catch (error) {
    if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") return;
    console.warn("加载数据异常", error);
  } finally {
    loading.close();
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
.kpi-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.module-gap {
  margin-bottom: 12px;
}
.module-card {
  border: 1px solid var(--el-border-color-lighter, #e0e0e0);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
  background: #fff;
}
.module-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.module-sub {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
  margin-left: 8px;
}
</style>
