<template>
  <div class="order-diagnosis">
    <el-divider content-position="center">订单排查</el-divider>

    <el-form :inline="true" class="query-form">
      <el-form-item label="订单号">
        <el-input
          v-model="form.order_number"
          placeholder="请输入订单号"
          clearable
          style="width: 220px"
          @input="onOrderInput"
        />
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker
          v-model="form.date"
          type="date"
          placeholder="选择日期"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
          style="width: 160px"
        />
      </el-form-item>
      <el-form-item label="用户">
        <el-select
          v-model="form.user_id"
          placeholder="选择用户"
          clearable
          filterable
          :disabled="!isInternal"
          style="width: 160px"
        >
          <el-option
            v-for="item in userList"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="query">
          排查
        </el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
    </el-form>

    <el-alert
      v-if="conclusion"
      :type="conclusion.type"
      :title="conclusion.title"
      :description="conclusion.desc"
      :closable="false"
      show-icon
      class="conclusion"
    />

    <el-card v-if="queried && localCheck" class="module-card">
      <div class="section-title">
        本机配置对照（当前打开页面的这台机器）
        <span class="section-sub"
          >用同角色记录的影院 code/名称模拟「本机拉到这单会怎样」；查用户 B 请到
          B 的客户端打开</span
        >
      </div>
      <el-alert
        :type="localCheck.level"
        :title="localCheck.title"
        :description="localCheck.text"
        :closable="false"
        show-icon
      />
    </el-card>

    <el-card v-if="queried" class="module-card">
      <div class="section-title">
        同角色记录（不按用户过滤）
        <span class="section-sub">用于对照「谁有记录、谁没有」</span>
      </div>
      <el-table :data="recordRows" border stripe size="small">
        <el-table-column prop="record_type" label="类型" width="110" />
        <el-table-column label="是否目标用户" width="110">
          <template #default="{ row }">
            <el-tag :type="row.is_target ? 'success' : 'info'" size="small">
              {{ row.is_target ? "目标用户" : "其他用户" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="user_name" label="报价人" width="100" />
        <el-table-column label="失败类型" width="200">
          <template #default="{ row }">
            {{ reasonLabel(row.err_type) }}
          </template>
        </el-table-column>
        <el-table-column prop="err_msg" label="失败原因" min-width="240" />
        <el-table-column prop="processing_time" label="时间" width="170" />
      </el-table>
      <el-empty
        v-if="!recordRows.length"
        description="该日期无报价/未报价记录"
      />
    </el-card>

    <el-card v-if="queried" class="module-card">
      <div class="section-title">
        证据时间线（L2 明细 + L1 日志）
        <span class="section-sub">{{ traceUserIdText }}</span>
      </div>
      <el-timeline v-if="timeline.length">
        <el-timeline-item
          v-for="(item, idx) in timeline"
          :key="idx"
          :timestamp="item.time"
          :type="item.type"
        >
          <div class="timeline-title">{{ item.title }}</div>
          <div v-if="item.desc" class="timeline-desc">{{ item.desc }}</div>
        </el-timeline-item>
      </el-timeline>
      <el-empty
        v-else
        description="无 L1/L2 记录（可能未拉到、超保留期、平台未接入，或该单属于无关订单按规则未记录）"
      />
    </el-card>

    <el-card v-if="queried" class="module-card">
      <div class="section-title">
        拉单摘要（订单时间 ±10 分钟）
        <span class="section-sub">近 7 天，5 分钟一条</span>
      </div>
      <el-table :data="summaryWindow" border stripe size="small">
        <el-table-column prop="opera_time" label="时间" width="170" />
        <el-table-column label="平台" width="120">
          <template #default="{ row }">
            {{ row.plat_name || summaryInfo(row).plat_name || "-" }}
          </template>
        </el-table-column>
        <el-table-column label="轮次/成功/失败" width="140">
          <template #default="{ row }">
            {{ summaryInfo(row).rounds ?? "-" }} /
            {{ summaryInfo(row).ok_rounds ?? "-" }} /
            {{ summaryInfo(row).fail_rounds ?? "-" }}
          </template>
        </el-table-column>
        <el-table-column label="拉取/过滤/入队" width="150">
          <template #default="{ row }">
            {{ summaryInfo(row).returned ?? "-" }} /
            {{ summaryInfo(row).filtered ?? "-" }} /
            {{ summaryInfo(row).enqueued ?? "-" }}
          </template>
        </el-table-column>
        <el-table-column label="最大轮次间隔" width="120">
          <template #default="{ row }">
            {{ summaryInfo(row).max_round_gap_ms ?? "-" }}ms
          </template>
        </el-table-column>
        <el-table-column label="trace 失败" width="100">
          <template #default="{ row }">
            {{ summaryInfo(row).trace_fail ?? "-" }}
          </template>
        </el-table-column>
        <el-table-column label="证据溢出" width="100">
          <template #default="{ row }">
            {{ summaryInfo(row).evidence_dropped ?? "-" }}
          </template>
        </el-table-column>
        <el-table-column label="丢弃入库失败" width="120">
          <template #default="{ row }">
            {{ summaryInfo(row).discard_record_fail ?? "-" }}
          </template>
        </el-table-column>
        <el-table-column label="上限丢弃" width="100">
          <template #default="{ row }">
            {{ summaryInfo(row).discard_record_dropped ?? "-" }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty
        v-if="!summaryWindow.length"
        description="该时段无拉单摘要（可能未接入/超出保留期）"
      />
    </el-card>
  </div>
</template>

<script setup>
defineOptions({
  name: "orderDiagnosis"
});
import { ref, reactive, computed, onBeforeMount, onActivated } from "vue";
import { useRoute } from "vue-router";
import { ElMessage } from "element-plus";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
import { OFFER_FAIL_TYPE, IN_RULE_LIST } from "@/common/constant.js";
import {
  getCinemaFlagDetail,
  getPullEvidencePlatList,
  hasAnyRoleLogin,
  isPullEvidenceEnabled
} from "@/utils/utils";
import { useCinemaCodeMatchList } from "@/store/specialNameRule";
import {
  pickOrderPlatform,
  filterSummaryByPlatform
} from "@/views/orderDiagnosis/platform.js";

const route = useRoute();
const cinemaCodeMatch = useCinemaCodeMatchList();
const {
  userInfo: { rule, user_id }
} = platTokens();

const isInternal = computed(() => [1, ...IN_RULE_LIST].includes(Number(rule)));
const form = reactive({
  order_number: "",
  date: "",
  user_id: ""
});
const userList = ref([]);
const loading = ref(false);
const queried = ref(false);
const conclusion = ref(null);
const recordRows = ref([]);
const timeline = ref([]);
const summaryRows = ref([]);
const orderPlatform = ref("");
const traceUserId = ref("");
const localCheck = ref(null);

const traceUserIdText = computed(() =>
  traceUserId.value ? `用户 ${traceUserId.value}` : "未选择用户"
);

const pad2 = n => String(n).padStart(2, "0");
const formatDate = d =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const nextDay = dateStr => {
  const d = new Date(`${dateStr} 00:00:00`);
  d.setDate(d.getDate() + 1);
  return formatDate(d);
};

// 订单号前 14 位 = 下单时间（yyyyMMddHHmmss，本案例 t+lieren 订单即此规则）
const parseOrderDateTime = orderNumber => {
  const match = String(orderNumber || "").match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/
  );
  if (!match) return null;
  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}:${match[6]}`
  };
};

const onOrderInput = value => {
  const parsed = parseOrderDateTime(value);
  if (parsed) form.date = parsed.date;
};

const reasonLabel = errType => {
  if (!errType) return "";
  return OFFER_FAIL_TYPE[errType] || `未知(${errType})`;
};

const parseInfo = info => {
  if (!info) return {};
  if (typeof info === "object") return info;
  try {
    return JSON.parse(info);
  } catch {
    return {};
  }
};
const summaryInfo = row => parseInfo(row.info);

const resetForm = () => {
  form.order_number = "";
  form.date = "";
  form.user_id = isInternal.value ? "" : user_id;
  queried.value = false;
  conclusion.value = null;
  recordRows.value = [];
  timeline.value = [];
  summaryRows.value = [];
  orderPlatform.value = "";
  localCheck.value = null;
};

const summaryWindow = computed(() => {
  const platformRows = filterSummaryByPlatform(
    summaryRows.value,
    orderPlatform.value
  );
  const parsed = parseOrderDateTime(form.order_number);
  if (!parsed) return platformRows;
  const center = new Date(`${parsed.date} ${parsed.time}`).getTime();
  return platformRows.filter(row => {
    const ts = new Date(row.opera_time).getTime();
    if (Number.isNaN(ts)) return false;
    return Math.abs(ts - center) <= 10 * 60 * 1000;
  });
});

// 本机配置对照：用同角色记录里的 cinema_code/名称，模拟「本机拉到这单会怎样」
const computeLocalCheck = (failList, successList) => {
  const refRow = [...successList, ...failList].find(
    row => row.cinema_code || row.app_name
  );
  if (!refRow) return null;
  if (!cinemaCodeMatch.items?.length) {
    return {
      level: "warning",
      title: "本机影院映射未加载",
      text: "本机影院映射列表为空（可能在登录/映射同步完成前启动）；请打开「影院映射」页刷新或重新登录后再试。此时不能判断是否缺 code。",
      applicable: true,
      codeMatched: false,
      mappingEmpty: true
    };
  }
  const detail = getCinemaFlagDetail(
    {
      cinema_code: refRow.cinema_code,
      cinema_name: refRow.cinema_name,
      city_name: refRow.city_name
    },
    { requireSession: true }
  );
  const appName = detail.app_name || refRow.app_name || "";
  const anyLogin = appName ? hasAnyRoleLogin(appName) : false;
  const target = `${refRow.cinema_name || "-"} / ${
    refRow.cinema_code || "-"
  } / ${appName || "-"}`;
  if (detail.reason === "unknown_cinema") {
    return {
      level: "warning",
      title: "本机影院映射缺少该 code",
      text: `本机影院映射表没有 ${refRow.cinema_code || "-"}，若本机拉到会按无关订单丢弃且不记录。对照：${target}`,
      applicable: true,
      codeMatched: false
    };
  }
  if (detail.reason === "disabled_series") {
    return {
      level: "warning",
      title: "本机系列/影院被禁用",
      text: `本机该系列或影院被禁用（${
        detail.detail?.source || "未开放"
      }），若本机拉到不会报价。对照：${target}`,
      applicable: true,
      codeMatched: true
    };
  }
  if (detail.reason === "not_login") {
    return {
      level: "warning",
      title: anyLogin ? "本机无该影院登录" : "本机登录列表未同步",
      text: anyLogin
        ? `本机没有 ${appName} 的可用登录（同角色其他用户有），若本机拉到会写 17 未报价记录。对照：${target}`
        : `本机 loginInfoList 里同角色都没有 ${appName} 的登录；若其他用户有记录，本机登录列表可能没刷新，请打开「影院登录」页刷新后再试。对照：${target}`,
      applicable: true,
      codeMatched: true
    };
  }
  return {
    level: "success",
    title: "本机配置可报价",
    text: `本机映射/系列/登录均正常；若本机仍无记录，重点看拉单是否返回。对照：${target}`,
    applicable: true,
    codeMatched: true
  };
};

const buildConclusion = (
  targetFailList,
  targetSuccessList,
  otherRecords,
  traceList,
  l1List,
  summaryList,
  local,
  platform
) => {
  if (!traceUserId.value) {
    return {
      type: "info",
      title: "请选择用户",
      desc: "拉单证据按用户目录存储，请先选择要排查的用户。"
    };
  }
  if (platform && !isPullEvidenceEnabled(platform)) {
    return {
      type: "warning",
      title: "该平台未开启拉单证据",
      desc: `当前白名单：${getPullEvidencePlatList().join(",")}；请在 sys_dict 的 pullEvidencePlatList 增加 ${platform} 后再排查。`
    };
  }
  const discardRows = targetFailList.filter(row => Number(row.err_type) >= 16);
  const quoteFailRows = targetFailList.filter(
    row => !(Number(row.err_type) >= 16)
  );
  const hasPullReturn = traceList.some(row => row.des === "报价队列-拉单返回");
  const hasDiscard = traceList.some(row =>
    String(row.des || "").startsWith("报价队列-订单丢弃-")
  );
  const hasEnqueue =
    traceList.some(row => row.des === "新的待报价订单") ||
    l1List.some(row => row.des === "新的待报价订单");
  const infos = summaryList.map(row => parseInfo(row.info));
  const rounds = infos.reduce((s, i) => s + (Number(i.rounds) || 0), 0);
  const maxGap = infos.reduce(
    (m, i) => Math.max(m, Number(i.max_round_gap_ms) || 0),
    0
  );
  const failRounds = infos.reduce(
    (s, i) => s + (Number(i.fail_rounds) || 0),
    0
  );
  const traceFail = infos.reduce((s, i) => s + (Number(i.trace_fail) || 0), 0);
  const discardRecordFail = infos.reduce(
    (s, i) => s + (Number(i.discard_record_fail) || 0),
    0
  );
  const discardRecordDropped = infos.reduce(
    (s, i) => s + (Number(i.discard_record_dropped) || 0),
    0
  );
  const evidenceDropped = infos.reduce(
    (s, i) => s + (Number(i.evidence_dropped) || 0),
    0
  );
  const discardIncomplete = discardRecordFail + discardRecordDropped > 0;
  const evidenceIncomplete = evidenceDropped > 0;
  const otherNames = [
    ...new Set(otherRecords.map(row => row.user_name).filter(Boolean))
  ].join("、");

  if (discardRows.length) {
    const row = discardRows[0];
    return {
      type: "warning",
      title: "目标用户已拉到，入队前丢弃",
      desc: `${reasonLabel(row.err_type)}｜${row.err_msg || ""}｜报价人：${
        row.user_name || ""
      }｜${row.processing_time || ""}`
    };
  }
  if (targetSuccessList.length) {
    return {
      type: "success",
      title: "目标用户已拉到并报价成功",
      desc: `报价人：${targetSuccessList[0].user_name || ""}｜${
        targetSuccessList[0].processing_time || ""
      }`
    };
  }
  if (quoteFailRows.length) {
    return {
      type: "warning",
      title: "目标用户已拉到并进入报价流程，报价失败",
      desc: `${reasonLabel(quoteFailRows[0].err_type) || "未分类"}｜${
        quoteFailRows[0].err_msg || ""
      }｜报价人：${quoteFailRows[0].user_name || ""}`
    };
  }
  if (hasPullReturn && hasEnqueue) {
    return {
      type: "success",
      title: "目标用户已拉到并正常入队",
      desc: "后续报价成功/失败见「报价记录」/「未报价记录」。"
    };
  }
  if (hasDiscard) {
    return {
      type: "warning",
      title: "目标用户已拉到，发现丢弃明细，但页面记录缺失",
      desc: `L2 有「订单丢弃-*」，但 A 行未写入或达到每日上限（C2 discard_record_fail=${discardRecordFail} / dropped=${discardRecordDropped}）；请看下方时间线的丢弃明细。`
    };
  }
  if (hasPullReturn) {
    if (discardIncomplete) {
      return {
        type: "warning",
        title: "目标用户已拉到，但丢弃记录未写全",
        desc: `C2 discard_record_fail=${discardRecordFail} / dropped=${discardRecordDropped}，A 行可能缺失；不能按「异常缺口」定性。`
      };
    }
    return {
      type: "error",
      title: "目标用户已拉到，但未发现丢弃/入队记录",
      desc: "属于异常缺口，请提交开发按代码缺陷排查。"
    };
  }
  if (otherRecords.length && local) {
    if (local.applicable === false) {
      if (!summaryList.length) {
        return {
          type: "info",
          title: "同角色其他用户有记录，目标用户无记录：无拉单摘要",
          desc: `本机不是目标用户，无法判断目标用户配置；目标用户没有该时段的拉单摘要（超出 7 天/客户端未运行/平台未接入）。有记录的用户：${
            otherNames || "-"
          }`
        };
      }
      if (traceFail > 0) {
        return {
          type: "warning",
          title: "同角色其他用户有记录，目标用户无记录：证据上传失败",
          desc: `该时段 trace_fail=${traceFail}，不能凭「无拉单返回」下结论。有记录的用户：${
            otherNames || "-"
          }`
        };
      }
      if (evidenceIncomplete) {
        return {
          type: "warning",
          title: "同角色其他用户有记录，目标用户无记录：证据队列溢出",
          desc: `该时段 evidence_dropped=${evidenceDropped}，C1/B 可能丢失，不能判「未拉到」。有记录的用户：${
            otherNames || "-"
          }`
        };
      }
      if (discardIncomplete) {
        return {
          type: "warning",
          title: "同角色其他用户有记录，目标用户无记录：丢弃记录未写全",
          desc: `C2 discard_record_fail=${discardRecordFail} / dropped=${discardRecordDropped}，目标用户可能已丢弃但 A 行缺失。有记录的用户：${
            otherNames || "-"
          }`
        };
      }
      if (rounds === 0 || maxGap > 60 * 1000 || failRounds > 0) {
        return {
          type: "warning",
          title: "同角色其他用户有记录，目标用户无记录：目标用户未正常拉单",
          desc: `rounds=${rounds}，max_gap=${maxGap}ms，fail_rounds=${failRounds}（网络/停机/水位线跳变）。有记录的用户：${
            otherNames || "-"
          }`
        };
      }
      return {
        type: "info",
        title:
          "同角色其他用户有记录，目标用户无记录：请到目标用户客户端确认配置",
        desc: `本机不是目标用户；目标用户拉单循环正常（rounds=${rounds}）但无该单拉单返回。有记录的用户：${
          otherNames || "-"
        }`
      };
    }
    if (local.mappingEmpty) {
      return {
        type: "warning",
        title: "同角色其他用户有记录，目标用户无记录：本机影院映射未加载",
        desc: `${local.text} 有记录的用户：${otherNames || "-"}`
      };
    }
    if (local.level === "warning") {
      return {
        type: "warning",
        title: "同角色其他用户有记录，目标用户未记录：本机（当前页面）配置原因",
        desc: `${local.text}｜有记录的用户：${otherNames || "-"}`
      };
    }
    if (!summaryList.length) {
      return {
        type: "info",
        title: "同角色其他用户有记录，目标用户无记录：无拉单摘要",
        desc: `本机（当前页面）配置可报价，但目标用户没有该时段的拉单摘要（超出 7 天/客户端未运行/平台未接入）。有记录的用户：${
          otherNames || "-"
        }`
      };
    }
    if (traceFail > 0) {
      return {
        type: "warning",
        title: "同角色其他用户有记录，目标用户无记录：证据上传失败",
        desc: `该时段 trace_fail=${traceFail}，不能凭「无拉单返回」下结论。有记录的用户：${
          otherNames || "-"
        }`
      };
    }
    if (evidenceIncomplete) {
      return {
        type: "warning",
        title: "同角色其他用户有记录，目标用户无记录：证据队列溢出",
        desc: `该时段 evidence_dropped=${evidenceDropped}，C1/B 可能丢失，不能判「未拉到」。有记录的用户：${
          otherNames || "-"
        }`
      };
    }
    if (discardIncomplete) {
      return {
        type: "warning",
        title: "同角色其他用户有记录，目标用户无记录：丢弃记录未写全",
        desc: `C2 discard_record_fail=${discardRecordFail} / dropped=${discardRecordDropped}，目标用户可能已丢弃但 A 行缺失。有记录的用户：${
          otherNames || "-"
        }`
      };
    }
    if (rounds === 0 || maxGap > 60 * 1000 || failRounds > 0) {
      return {
        type: "warning",
        title: "同角色其他用户有记录，目标用户无记录：目标用户未正常拉单",
        desc: `rounds=${rounds}，max_gap=${maxGap}ms，fail_rounds=${failRounds}（网络/停机/水位线跳变）。有记录的用户：${
          otherNames || "-"
        }`
      };
    }
    return {
      type: "info",
      title: "同角色其他用户有记录，目标用户无记录：本机配置正常，疑似未拉到",
      desc: `本机（当前页面）配置可报价、目标用户拉单循环正常（rounds=${rounds}），但没有该单的拉单返回；平台未返回或目标用户错过。有记录的用户：${
        otherNames || "-"
      }`
    };
  }
  if (!summaryList.length) {
    return {
      type: "info",
      title: "未拉到（无拉单摘要）",
      desc: "可能超出 7 天保留期、该平台未接入拉单证据，或该单属于无关订单（未映射影院/同角色全无登录/系列禁用）按规则未记录。"
    };
  }
  if (traceFail > 0) {
    return {
      type: "warning",
      title: "证据上传失败，无法判断",
      desc: `该时段 trace_fail=${traceFail}，不能凭「无拉单返回」下结论。`
    };
  }
  if (evidenceIncomplete) {
    return {
      type: "warning",
      title: "证据队列溢出，无法判断是否拉到",
      desc: `该时段 evidence_dropped=${evidenceDropped}，C1/B 可能丢失，不能判「未拉到」。`
    };
  }
  if (discardIncomplete) {
    return {
      type: "warning",
      title: "丢弃记录未写全，无法确认是否丢弃",
      desc: `C2 discard_record_fail=${discardRecordFail} / dropped=${discardRecordDropped}，A 行可能缺失。`
    };
  }
  if (rounds === 0 || maxGap > 60 * 1000 || failRounds > 0) {
    return {
      type: "warning",
      title: "未拉到：客户端当时未正常拉单",
      desc: `rounds=${rounds}，max_gap=${maxGap}ms，fail_rounds=${failRounds}（网络/停机/水位线跳变）。`
    };
  }
  return {
    type: "info",
    title: "未拉到：平台该轮未返回或属于无关订单",
    desc: "拉单循环正常、无失败；平台未返回，或该单属于无关订单（未映射影院/同角色全无登录/系列禁用）按规则未记录。"
  };
};

const query = async () => {
  if (!form.order_number) {
    ElMessage.warning("请输入订单号");
    return;
  }
  const parsed = parseOrderDateTime(form.order_number);
  if (!form.date && parsed) form.date = parsed.date;
  if (!form.date) {
    ElMessage.warning("请选择日期");
    return;
  }
  traceUserId.value = form.user_id || user_id || "";
  const startTime = `${form.date} 00:00:00`;
  const endTime = `${nextDay(form.date)} 00:00:00`;
  const dateCompact = form.date.replace(/-/g, "");
  const baseParams = {
    order_number: form.order_number,
    start_time: startTime,
    end_time: endTime,
    page_num: 1,
    page_size: 100
  };
  // 记录查询不按用户过滤：要同时看到同角色其他用户（有记录）和本机用户（无记录）

  loading.value = true;
  queried.value = false;
  try {
    const [failRes, successRes, traceRes, l1Res, summaryRes] =
      await Promise.allSettled([
        svApi.queryOfferList({ ...baseParams, order_status: 2 }),
        svApi.queryOfferList({ ...baseParams, order_status: 1 }),
        svApi.queryLogTrace({
          order_number: form.order_number,
          date: dateCompact,
          userId: traceUserId.value,
          type: 1
        }),
        svApi.queryLogRecord({
          order_number: form.order_number,
          user_id: traceUserId.value,
          type: 1
        }),
        svApi.queryLogRecord({
          user_id: traceUserId.value,
          des: "报价队列-拉单摘要",
          opera_time_start: startTime,
          opera_time_end: endTime,
          page_size: 1000
        })
      ]);

    const failedSources = [];
    if (failRes.status !== "fulfilled") failedSources.push("未报价记录");
    if (successRes.status !== "fulfilled") failedSources.push("报价记录");
    if (traceRes.status !== "fulfilled") failedSources.push("L2 明细");
    if (l1Res.status !== "fulfilled") failedSources.push("L1 日志");
    if (summaryRes.status !== "fulfilled") failedSources.push("拉单摘要");

    const failRaw =
      failRes.status === "fulfilled" ? failRes.value.data?.offerList || [] : [];
    const successRaw =
      successRes.status === "fulfilled"
        ? successRes.value.data?.offerList || []
        : [];
    // 后台按 JWT rule 返回的是「可见范围」，内部/管理员可能跨角色；这里按目标用户 rule 再收口到同角色
    const targetUser = userList.value.find(
      item => String(item.id) === String(traceUserId.value)
    );
    const targetRule =
      targetUser?.rule ??
      (String(traceUserId.value) === String(user_id) ? rule : null);
    const sameRule = row =>
      targetRule === null ||
      targetRule === undefined ||
      row.rule === null ||
      row.rule === undefined ||
      String(row.rule) === String(targetRule);
    const failList = failRaw.filter(sameRule);
    const successList = successRaw.filter(sameRule);
    const traceList =
      traceRes.status === "fulfilled" ? traceRes.value.data?.list || [] : [];
    const l1List =
      l1Res.status === "fulfilled" ? l1Res.value.data?.cardList || [] : [];
    const summaryList =
      summaryRes.status === "fulfilled"
        ? summaryRes.value.data?.cardList || []
        : [];
    const isTarget = row =>
      String(row.user_id ?? "") === String(traceUserId.value);
    const targetFailList = failList.filter(isTarget);
    const targetSuccessList = successList.filter(isTarget);
    const otherRecords = [...failList, ...successList].filter(
      row => !isTarget(row)
    );
    const isLocalTarget = String(traceUserId.value) === String(user_id);
    const recordsComplete =
      failRes.status === "fulfilled" && successRes.status === "fulfilled";
    const local = isLocalTarget
      ? recordsComplete
        ? computeLocalCheck(failList, successList)
        : null
      : {
          level: "info",
          title: "本机配置对照不适用",
          text: "当前选择的是其他用户，本机配置不代表目标用户；请到目标用户客户端打开。",
          applicable: false
        };

    recordRows.value = [
      ...failList.map(row => ({
        ...row,
        record_type: "未报价记录",
        is_target: isTarget(row)
      })),
      ...successList.map(row => ({
        ...row,
        record_type: "报价记录",
        is_target: isTarget(row)
      }))
    ];
    summaryRows.value = summaryList;
    orderPlatform.value = pickOrderPlatform(
      [...failList, ...successList],
      traceList
    );
    timeline.value = [
      ...failList.map(row => ({
        time: row.processing_time,
        type: "warning",
        title: `未报价记录：${reasonLabel(row.err_type) || "未报价"}`,
        desc: `${row.err_msg || ""}｜报价人：${row.user_name || ""}${
          isTarget(row) ? "（目标用户）" : "（其他用户）"
        }`
      })),
      ...successList.map(row => ({
        time: row.processing_time,
        type: "success",
        title: "报价记录：成功",
        desc: `报价人：${row.user_name || ""}${
          isTarget(row) ? "（目标用户）" : "（其他用户）"
        }`
      })),
      ...traceList.map(row => ({
        time: row.opera_time,
        type: row.level === "error" ? "danger" : "primary",
        title: `L2 ${row.des || ""}`,
        desc:
          row.info && typeof row.info === "object"
            ? JSON.stringify(row.info)
            : String(row.info || "")
      })),
      ...l1List.map(row => ({
        time: row.opera_time,
        type: row.level === "error" ? "danger" : "info",
        title: `L1 ${row.des || ""}`,
        desc: row.info ? String(row.info) : ""
      }))
    ].sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));

    localCheck.value = local;
    if (failedSources.length) {
      conclusion.value = {
        type: "warning",
        title: "部分数据源查询失败，无法下结论",
        desc: `${failedSources.join("、")} 查询失败；请稍后重试。页面仅展示已成功返回的部分数据。`
      };
      queried.value = true;
      return;
    }
    conclusion.value = buildConclusion(
      targetFailList,
      targetSuccessList,
      otherRecords,
      traceList,
      l1List,
      summaryWindow.value,
      local,
      orderPlatform.value
    );
    queried.value = true;
  } catch (error) {
    console.warn("订单排查异常", error);
    ElMessage.error("订单排查失败，请稍后重试");
  } finally {
    loading.value = false;
  }
};

const appliedRouteKey = ref("");
const applyRouteQuery = () => {
  if (!route.query.order_number) return;
  const key = `${route.query.order_number}_${route.query.user_id || ""}`;
  if (key === appliedRouteKey.value) return;
  appliedRouteKey.value = key;
  form.order_number = String(route.query.order_number);
  onOrderInput(form.order_number);
  if (isInternal.value && route.query.user_id) {
    form.user_id = Number(route.query.user_id) || route.query.user_id;
  }
  query();
};

let firstActivation = true;
onActivated(() => {
  // 首次挂载由 onBeforeMount 在 userList 加载完成后处理；缓存页再次进入时重新应用 query
  if (firstActivation) {
    firstActivation = false;
    return;
  }
  applyRouteQuery();
});

onBeforeMount(async () => {
  if (!isInternal.value) form.user_id = user_id || "";
  try {
    const res = await svApi.getUserList();
    userList.value = res.data?.userList || [];
  } catch (error) {
    console.warn("获取用户列表失败", error);
  }
  // 从「报价记录/未报价记录」页「排查」按钮跳转：自动带出订单号/用户并查询
  applyRouteQuery();
});
</script>

<style scoped>
.order-diagnosis {
  padding: 4px 8px;
}
.query-form {
  margin-bottom: 8px;
}
.conclusion {
  margin-bottom: 12px;
}
.module-card {
  border: 1px solid var(--el-border-color-lighter, #e0e0e0);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
  background: #fff;
}
.section-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.section-sub {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
  margin-left: 8px;
}
.timeline-title {
  font-size: 13px;
  font-weight: 500;
}
.timeline-desc {
  font-size: 12px;
  color: #606266;
  word-break: break-all;
  margin-top: 2px;
}
</style>
