<template>
  <div class="rule-page">
    <el-container class="rule-page__container">
      <el-aside width="200px" class="rule-page__aside">
        <el-input
          v-model="filterText"
          class="tree-filter"
          placeholder="可输入影院过滤"
        />
        <!-- 左侧树 -->
        <el-tree
          ref="treeRef"
          class="tree-list"
          :data="treeData"
          node-key="id"
          highlight-current
          :default-expanded-keys="[1]"
          :props="defaultProps"
          :filter-node-method="filterNode"
          @node-click="nodeClick"
        />
      </el-aside>
      <el-main class="rule-page__main">
        <!-- 查询区：只放条件，全部平铺，栅格按屏幕宽度自动排列换行 -->
        <div class="search-panel">
          <el-form
            class="search-panel__form"
            :model="formData"
            label-width="76px"
            @keyup.enter="searchData"
          >
            <el-form-item label="规则名称">
              <el-input
                v-model="formData.ruleName"
                placeholder="请输入规则名称"
                clearable
              />
            </el-form-item>
            <el-form-item label="订单来源">
              <el-select
                v-model="formData.orderForm"
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
            <el-form-item label="状态">
              <el-select v-model="formData.status" placeholder="状态" clearable>
                <el-option
                  v-for="(keyValue, keyName) in statusObj"
                  :key="keyName"
                  :label="keyValue"
                  :value="keyName"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="报价类型">
              <el-select
                v-model="formData.offerType"
                placeholder="报价类型"
                clearable
              >
                <el-option label="固定价" value="1" />
                <el-option label="会员价加价" value="2" />
                <el-option label="会员日报价" value="3" />
              </el-select>
            </el-form-item>
            <el-form-item label="用券类型">
              <el-select
                v-model="formData.quanValue"
                placeholder="用券类型"
                filterable
                clearable
              >
                <el-option
                  v-for="item in quanType"
                  :key="item.id"
                  :label="item.quan_name"
                  :value="item.quan_value"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="同步平台">
              <el-select
                v-model="formData.is_sync_plat"
                placeholder="请选择是否同步平台"
                clearable
              >
                <el-option label="是" :value="1" />
                <el-option label="否" :value="2" />
              </el-select>
            </el-form-item>
            <el-form-item label="规则备注">
              <el-input
                v-model="formData.remark"
                placeholder="请输入备注(支撑模糊匹配)"
                clearable
              />
            </el-form-item>
          </el-form>
        </div>
        <!-- 操作栏：一行内按业务分组，组间留 16px；左侧数据/查询动作，右侧工具动作。
              -->
        <div class="page-toolbar">
          <div class="page-toolbar__group">
            <el-button type="primary" @click="addRule">新增</el-button>
            <el-button
              type="danger"
              :disabled="!hasSelected"
              @click="batchDelete"
              >批量删除</el-button
            >
          </div>
          <div class="page-toolbar__group">
            <el-button type="primary" @click="searchData">查询</el-button>
            <el-button @click="resetForm">重置</el-button>
          </div>
          <div class="page-toolbar__group page-toolbar__group--end">
            <el-button
              type="danger"
              :loading="checking"
              @click="handleCheckLierenRuleSync"
              >规则同步检查</el-button
            >
            <el-button
              type="success"
              :loading="fixing"
              @click="handleFixLierenRule"
              >规则同步修复</el-button
            >
            <el-button
              type="warning"
              :loading="batchSyncing"
              @click="handleBatchSyncNewPlat"
              >新平台批量设置价格</el-button
            >
          </div>
        </div>
        <!-- 表格 -->
        <el-table
          ref="multipleTable"
          class="page-table"
          :data="tableData"
          border
          stripe
          show-overflow-tooltip
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" fixed width="55" />
          <el-table-column prop="ruleName" fixed label="规则名称" width="185">
            <template #default="scope">
              <span style="cursor: pointer" @click="querRule(scope.row, '3')">{{
                scope.row.ruleName
              }}</span>
            </template>
          </el-table-column>
          <!-- <el-table-column
            prop="shadowLineName"
            fixed
            label="院线名称"
            width="105"
          >
            <template #default="scope">
              <span>{{ APP_LIST[scope.row.shadowLineName] }}</span>
            </template>
          </el-table-column> -->
          <el-table-column label="状态" fixed width="70" align="center">
            <template #default="scope">
              <span v-if="scope.row.status === '3'" style="color: red">{{
                statusObj[scope.row.status]
              }}</span>
              <!-- 当日不报：status 仍为 1，只有 allow_offer_time 未到，
                   这时不显示开关（开关会误导成"正常报价中"） -->
              <el-tooltip
                v-else-if="
                  scope.row.status === '5' || isNoOfferActive(scope.row)
                "
                :content="
                  scope.row.allow_offer_time
                    ? `当日不报：今日不报价，${formatTimeOfTime(scope.row.allow_offer_time)} 后自动恢复`
                    : '当日不报：今日不报价'
                "
              >
                <el-tag type="warning" size="small" effect="plain">{{
                  statusObj[5]
                }}</el-tag>
              </el-tooltip>
              <el-switch
                v-else
                v-model="scope.row.status"
                active-value="1"
                inactive-value="2"
                @change="handleStatusChange(scope.row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="报价类型" fixed width="85" align="center">
            <template #default="scope">
              <el-popover
                placement="top"
                :width="960"
                trigger="click"
                :popper-style="{ maxWidth: 'calc(100vw - 40px)' }"
                popper-class="ticket-info-popover"
              >
                <template #reference>
                  <el-tag
                    v-if="scope.row.offerType"
                    :type="getOfferType(scope.row.offerType)"
                    size="default"
                    effect="dark"
                    class="offer-type-tag"
                  >
                    {{ offerTypeObj[scope.row.offerType] || "" }}
                  </el-tag>
                </template>
                <el-table :data="[scope.row]" border style="width: 100%">
                  <el-table-column
                    v-if="scope.row.film_type"
                    prop="film_type"
                    label="电影格式"
                    :formatter="row => row.film_type"
                  />
                  <el-table-column
                    v-if="(scope.row.includeCityNames || []).length > 0"
                    prop="includeCityNames"
                    label="包含城市"
                    :formatter="row => (row.includeCityNames || []).join()"
                  />
                  <el-table-column
                    v-if="(scope.row.excludeCityNames || []).length > 0"
                    prop="excludeCityNames"
                    label="排除城市"
                    :formatter="row => (row.excludeCityNames || []).join()"
                  />
                  <el-table-column
                    v-if="(scope.row.weekDay || []).length > 0"
                    prop="weekDay"
                    label="周几"
                    :formatter="row => (row.weekDay || []).join()"
                  />
                  <el-table-column
                    v-if="scope.row.allow_offer_time"
                    prop="allow_offer_time"
                    label="允许报价时间"
                  />
                  <el-table-column
                    v-if="scope.row.seatNum"
                    prop="seatNum"
                    label="座位数"
                  />
                  <el-table-column
                    v-if="(scope.row.excludeHallNames || []).length > 0"
                    prop="excludeHallNames"
                    label="排除影厅"
                    :formatter="row => (row.excludeHallNames || []).join()"
                  />
                  <el-table-column
                    v-if="(scope.row.includeHallNames || []).length > 0"
                    prop="includeHallNames"
                    label="包含影厅"
                    :formatter="row => (row.includeHallNames || []).join()"
                  />
                  <el-table-column
                    v-if="(scope.row.excludeFilmNames || []).length > 0"
                    prop="excludeFilmNames"
                    label="排除影片"
                    :formatter="row => (row.excludeFilmNames || []).join()"
                  />
                  <el-table-column
                    v-if="(scope.row.includeFilmNames || []).length > 0"
                    prop="includeFilmNames"
                    label="包含影片"
                    :formatter="row => (row.includeFilmNames || []).join()"
                  />
                </el-table>
              </el-popover>
            </template>
          </el-table-column>
          <el-table-column label="用券类型" width="145">
            <template #default="scope">
              <span>{{ formatQuanType(scope.row.quanValue) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="报价/加价金额" prop="offerAmount" width="140">
            <template #default="scope">
              <span>{{ formatOfferAmount(scope.row) }}</span>
              <span>{{ formatAddAmount(scope.row) }}</span>
              <!-- <span
                v-if="scope.row.bWalletMarkup"
                style="color: #e6a23c; display: block"
              >
                {{ `B钱包加价:${scope.row.bWalletMarkup}` }}
              </span>
              <span
                v-if="scope.row.offerTppRange"
                style="color: #e6a23c; display: block"
              >
                {{
                  `原价报区间:${formatOfferTppRange(scope.row.offerTppRange)}`
                }}
              </span> -->
            </template>
          </el-table-column>
          <el-table-column
            prop="includeCinemaNames"
            label="包含影院"
            min-width="220"
          >
            <template #default="scope">
              <!-- 一行几十个影院名时只显示前两个，完整列表放 tooltip 里看 -->
              <el-tooltip
                placement="top"
                :disabled="(scope.row.includeCinemaNames || []).length <= 2"
              >
                <template #content>
                  <div
                    style="
                      max-width: 460px;
                      max-height: 320px;
                      overflow-y: auto;
                      line-height: 1.6;
                    "
                  >
                    {{ (scope.row.includeCinemaNames || []).join("、") }}
                  </div>
                </template>
                <span>{{
                  formatCinemaNames(scope.row.includeCinemaNames)
                }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column
            prop="excludeCinemaNames"
            label="排除影院"
            min-width="220"
          >
            <template #default="scope">
              <el-tooltip
                placement="top"
                :disabled="(scope.row.excludeCinemaNames || []).length <= 2"
              >
                <template #content>
                  <div
                    style="
                      max-width: 460px;
                      max-height: 320px;
                      overflow-y: auto;
                      line-height: 1.6;
                    "
                  >
                    {{ (scope.row.excludeCinemaNames || []).join("、") }}
                  </div>
                </template>
                <span>{{
                  formatCinemaNames(scope.row.excludeCinemaNames)
                }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column
            prop="last_used_time"
            label="最后使用时间"
            min-width="160"
          >
            <template #default="{ row }">
              <span
                :class="getLastUseTimeClass(row)"
                title="黄色为:最后使用时间超过四个月,该规则是否需要删除?"
              >
                {{ formatTimeOfTime(row.last_used_time) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" width="110" />
          <el-table-column label="操作" fixed="right" align="left" width="280">
            <template #default="scope">
              <el-button
                size="small"
                type="primary"
                @click="editRule(scope.row, '1')"
                >编辑</el-button
              >
              <el-button
                size="small"
                type="success"
                @click="editRule(scope.row, '2')"
                >复制</el-button
              >
              <el-button
                size="small"
                type="danger"
                @click="deleteRow(scope.$index, scope.row)"
                >删除</el-button
              >
              <el-button
                v-if="scope.row.status === '1' && clickNoOffer(scope.row)"
                size="small"
                type="primary"
                @click="currentDayNoOfferHandle(scope.row)"
                >当日不报</el-button
              >
            </template>
          </el-table-column>
        </el-table>
        <!-- 分页 -->
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          class="page-pagination"
          :page-sizes="[10, 20, 50, 100]"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="totalNum"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </el-main>
    </el-container>

    <!-- 批量同步新平台弹框 -->
    <el-dialog
      v-model="batchSyncDialogVisible"
      title="新平台批量设置价格"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form :model="batchSyncForm" label-width="100px">
        <el-form-item label="参考平台" required>
          <el-select
            v-model="batchSyncForm.sourcePlat"
            placeholder="请选择参考平台"
            style="width: 100%"
          >
            <el-option
              v-for="(keyValue, keyName) in orderFormObj"
              :key="keyName"
              :label="keyValue"
              :value="keyName"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="目标平台" required>
          <el-select
            v-model="batchSyncForm.targetPlat"
            placeholder="请选择目标平台"
            style="width: 100%"
          >
            <el-option
              v-for="(keyValue, keyName) in orderFormObj"
              :key="keyName"
              :label="keyValue"
              :value="keyName"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="筛选范围">
          <el-radio-group v-model="batchSyncForm.filterType">
            <el-radio value="all">不限（全部规则）</el-radio>
            <el-radio value="current">
              当前筛选：{{
                formData.shadowLineName
                  ? APP_LIST[formData.shadowLineName]
                  : formData.app_type || "未选择"
              }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          style="margin-top: 8px"
        >
          <template #title>
            将参考平台的报价<b>原样复制</b>到目标平台，仅处理启用/仅报价状态、已有参考平台但无目标平台的规则
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="batchSyncDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="batchSyncing"
          @click="confirmBatchSyncPlat"
        >
          开始同步
        </el-button>
      </template>
    </el-dialog>

    <!-- 规则同步检查/修复结果 -->
    <el-dialog
      v-model="syncResultVisible"
      :title="syncResult.title"
      width="960px"
      top="6vh"
    >
      <el-descriptions :column="4" border size="small">
        <el-descriptions-item
          v-for="item in syncResult.summary"
          :key="item.label"
          :label="item.label"
        >
          {{ item.value }}
        </el-descriptions-item>
      </el-descriptions>
      <el-table
        v-if="syncResult.rows.length"
        :data="syncResult.rows"
        border
        size="small"
        max-height="420"
        style="margin-top: 12px"
      >
        <el-table-column label="类型" width="130">
          <template #default="{ row }">
            <el-tag
              :type="MATCH_TYPE_TAG[row.matchType] || 'info'"
              size="small"
            >
              {{ MATCH_TYPE_TEXT[row.matchType] || row.matchType }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="院线" width="140" show-overflow-tooltip>
          <template #default="{ row }">
            {{ APP_LIST[row.shadowLineName] || row.shadowLineName }}
          </template>
        </el-table-column>
        <el-table-column
          prop="ruleName"
          label="规则名称"
          min-width="200"
          show-overflow-tooltip
        />
        <el-table-column prop="platRuleId" label="平台规则ID" width="140" />
        <el-table-column label="问题" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ formatIssueText(row) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else :description="syncResult.emptyText" :image-size="70" />
      <template #footer>
        <el-button type="primary" @click="syncResultVisible = false"
          >关闭</el-button
        >
      </template>
    </el-dialog>

    <RuleDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveRule"
    />
  </div>
</template>

<script setup>
defineOptions({
  name: "offerRule"
});
import {
  ref,
  reactive,
  computed,
  toRaw,
  onBeforeMount,
  nextTick,
  watch
} from "vue";
import svApi from "@/api/sv-api";
import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import RuleDialog from "@/components/RuleDialog.vue";
import {
  ORDER_FORM,
  GET_APP_LIST,
  GET_APP_TYPE_LIST,
  IN_RULE_LIST
} from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());
// 机器基础方法
import usesMachineBaseFun from "@/mixins/usesMachineBaseFun";
const { getQuanTypeList } = usesMachineBaseFun();

import {
  getCurrentTime,
  getNextDayTime,
  formatTimeOfTime
} from "@/utils/utils";
import {
  isUnknownBWalletMarkupError,
  isUnknownOfferTppRangeError
} from "@/common/dbColumnFallback";
import { formatOfferTppRange } from "@/utils/tppPriceRule";
import { useDataTableStore } from "@/store/offerRule";
const rules = useDataTableStore();
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, name }
} = platTokens();

import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

// 猎人规则同步相关方法
import useLierenOfferRuleSyncFun from "@/mixins/useLierenOfferRuleSyncFun";
const {
  lierenOfferRuleSyncPlat,
  lierenOfferRuleDelPlat,
  lierenOfferRuleEditStatusPlat,
  checkAndUpdateLierenRuleState,
  pushLierenExtraAmountToPlat
} = useLierenOfferRuleSyncFun();

// 存量刷数（一次性、人工触发）：把已同步猎人平台规则的 B钱包加价推到平台 extra_amount。
// 推送范围与 doc/sql/2026-10-10-bwallet-markup-sync-rules.sql 的 WHERE 一致，
// 需以 rule=2 账号登录后在控制台执行：await window.pushLierenExtraAmountToPlat()
// 关联说明：doc/changes/2026-09-30-猎人B钱包加价报价整改说明.md §12.5-a（方案 A）
window.pushLierenExtraAmountToPlat = pushLierenExtraAmountToPlat;

// 猎人规则一致性检查（挂载到 window 供控制台调用，同时支持按钮点击）
import useCheckLierenRuleSync from "@/mixins/useCheckLierenRuleSync";
const { checkLierenRuleSync } = useCheckLierenRuleSync();

// ── 同步检查/修复结果弹窗（原来只 console.log，用户看不到明细）──
const syncResultVisible = ref(false);
const syncResult = reactive({
  title: "",
  summary: [],
  rows: [],
  emptyText: "无异常数据"
});
const MATCH_TYPE_TEXT = {
  BOTH: "字段不一致",
  LOCAL_ONLY: "本地有平台无",
  PLATFORM_ONLY: "平台有本地无"
};
const MATCH_TYPE_TAG = {
  BOTH: "danger",
  LOCAL_ONLY: "warning",
  PLATFORM_ONLY: "info"
};
const openSyncResult = ({ title, summary, rows = [], emptyText }) => {
  syncResult.title = title;
  syncResult.summary = summary;
  syncResult.rows = rows;
  syncResult.emptyText = emptyText || "无异常数据";
  syncResultVisible.value = true;
};
// 把检查结果里的 issues 拼成人话
const formatIssueText = row => {
  if (row.matchType === "PLATFORM_ONLY") {
    return `平台状态：${row.platState === 1 ? "启用" : "禁用"}；座位：${
      row.platSeats || "空"
    }`;
  }
  if (row.matchType === "LOCAL_ONLY") {
    return `平台不存在该规则；本地状态：${
      statusObj[row.localStatus] || row.localStatus || "-"
    }`;
  }
  return (row.issues || [])
    .map(item => {
      if (item.type === "STATUS_MISMATCH") {
        return `状态 ${item.expected}→${item.actual}`;
      }
      if (item.type === "SEATS_MISMATCH") {
        return `座位 ${item.expected}→${item.actual}`;
      }
      return item.type;
    })
    .join("；");
};

const checking = ref(false);
const handleCheckLierenRuleSync = async () => {
  checking.value = true;
  try {
    const result = await checkLierenRuleSync();
    if (!result) return;
    openSyncResult({
      title: "规则同步检查结果",
      summary: [
        { label: "规则总数", value: result.total },
        { label: "一致", value: result.consistent },
        { label: "不一致", value: result.inconsistent },
        { label: "本地有平台无", value: result.localOnly },
        { label: "平台有本地无", value: result.platOnly },
        { label: "状态不一致", value: result.statusMismatch },
        { label: "座位不一致", value: result.seatsMismatch }
      ],
      rows: result.details || [],
      emptyText: "本地与平台完全一致"
    });
    if (result.inconsistent > 0) {
      ElMessage({
        type: "warning",
        message: `发现 ${result.inconsistent} 条规则不一致，可点击"规则同步修复"处理`,
        duration: 6000
      });
    }
  } catch (error) {
    console.warn("规则同步检查异常", error);
    ElMessage.error("规则同步检查异常，请稍后重试");
  } finally {
    checking.value = false;
  }
};

const fixing = ref(false);
const batchSyncing = ref(false);
const handleFixLierenRule = async () => {
  fixing.value = true;
  try {
    // 重新拉取全量规则（不限制状态），传给检查更新方法
    const ruleRes = await svApi.queryRuleList({ rule });
    let ruleRecords = ruleRes.data.ruleList || [];
    ruleRecords.forEach(item => {
      item.includeCityNames = JSON.parse(item.includeCityNames);
      item.excludeCityNames = JSON.parse(item.excludeCityNames);
      item.includeCinemaNames = JSON.parse(item.includeCinemaNames);
      item.excludeCinemaNames = JSON.parse(item.excludeCinemaNames);
      item.includeHallNames = JSON.parse(item.includeHallNames);
      item.excludeHallNames = JSON.parse(item.excludeHallNames);
      item.includeFilmNames = JSON.parse(item.includeFilmNames);
      item.excludeFilmNames = JSON.parse(item.excludeFilmNames);
      item.platOfferList = JSON.parse(item.platOfferList || "[]");
      item.weekDay = JSON.parse(item.weekDay);
      item.film_type = item.film_type ? item.film_type?.split(",") : [];
      item.quanValueList = item.quanValue ? item.quanValue?.split(",") : [];
    });
    const result = await checkAndUpdateLierenRuleState(
      ruleRecords,
      "manual_fix"
    );
    if (!result) {
      ElMessage.warning(
        "未执行修复：未配置猎人 AK/SK，或当前账号没有已同步到猎人的固定价规则"
      );
      return;
    }
    // 平台侧状态已改，列表重新拉一次保证展示与平台一致
    searchData();
    openSyncResult({
      title: "规则同步修复结果",
      summary: [
        { label: "本地已同步", value: result.totalLocalSynced },
        { label: "平台固定价", value: result.totalPlatRules },
        { label: "双向匹配", value: result.totalMatched },
        { label: "启用", value: result.enableCount },
        { label: "禁用", value: result.disableCount },
        { label: "删除平台孤儿", value: result.deleteCount },
        { label: "修复座位", value: result.seatsFixCount },
        { label: "平台孤儿总数", value: result.platOnlyCount }
      ],
      rows: result.localOnlyRules || [],
      emptyText: "本次没有需要人工处理的规则"
    });
  } catch (error) {
    ElMessage({ type: "error", message: "规则同步修复异常" });
    console.warn("规则同步修复异常", error);
  } finally {
    fixing.value = false;
  }
};

// 批量同步新平台报价
const batchSyncDialogVisible = ref(false);
const batchSyncForm = reactive({
  sourcePlat: "lieren",
  targetPlat: "",
  filterType: "current"
});

const handleBatchSyncNewPlat = () => {
  batchSyncForm.filterType =
    formData.shadowLineName || formData.app_type ? "current" : "all";
  batchSyncForm.targetPlat = "";
  batchSyncDialogVisible.value = true;
};

const confirmBatchSyncPlat = async () => {
  const { sourcePlat, targetPlat, filterType } = batchSyncForm;
  if (!sourcePlat || !targetPlat) {
    ElMessage.warning("请选择参考平台和目标平台");
    return;
  }
  if (sourcePlat === targetPlat) {
    ElMessage.warning("参考平台和目标平台不能相同");
    return;
  }
  batchSyncing.value = true;
  try {
    const params = {
      sourcePlatName: sourcePlat,
      targetPlatName: targetPlat,
      statusList: ["1", "3"],
      rule
    };
    // "不限"时不传筛选参数，全量查询
    if (filterType === "current") {
      if (formData.app_type) params.appType = formData.app_type;
      if (formData.shadowLineName) params.appName = formData.shadowLineName;
    }
    const res = await svApi.batchAddPlatOffer(params);
    if (res.code === 1) {
      const d = res.data || {};
      ElMessage({
        type: "success",
        message: `同步完成：更新${d.updatedCount || 0}条，跳过${d.skippedCount || 0}条（已有），跳过${d.noSourceCount || 0}条（无参考平台）`,
        duration: 6000
      });
      batchSyncDialogVisible.value = false;
      searchData();
    } else {
      ElMessage({
        type: "error",
        message: res.msg || "同步失败",
        duration: 5000
      });
    }
  } catch (err) {
    console.error("批量同步异常", err);
    ElMessage.error("批量同步异常，请查看控制台");
  } finally {
    batchSyncing.value = false;
  }
};

// 树节点属性映射
const defaultProps = {
  children: "children",
  label: "label"
};
// 定义树形结构数据
const treeData = APP_TYPE_LIST.value.map((item, inx) => {
  return {
    id: inx + 1,
    label: item.app_type_name,
    value: item.app_type_code,
    children: item.app_name_list.map((itemA, index) => ({
      id: index + 1 + (inx + 1) * 100,
      label: APP_LIST.value[itemA],
      value: itemA
    }))
  };
});

// 左侧树当前选中的节点（新增规则时直接用它所在的影院，不再让用户选第二次）
const currentNode = ref(null);
// 树过滤
const filterText = ref("");
const filterNode = (value, data) => {
  if (!value) return true;
  return data.label.includes(value);
};

// 树组件的引用
const treeRef = ref(null);
watch(filterText, val => {
  treeRef.value.filter(val);
});

// 券类型列表
const quanType = ref([]);

const tableData = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);
// 订单来源枚举
// 订单来源
const orderFormObj = ref(ORDER_FORM);
// 报价类型枚举
const offerTypeObj = {
  1: "固定",
  2: "会员",
  3: "会员日报价"
};
// 规则状态枚举
const statusObj = {
  1: "正常",
  2: "禁用",
  3: "仅报价",
  5: "当日不报"
  // 4: "删除"
};
// 根据报价类型获取标签类型
const getOfferType = offerType => {
  switch (offerType) {
    case "1":
      return "info";
    case "2":
      return "primary";
    case "3":
      return "success";
    default:
      return "default";
  }
};
// 表单查询数据
const formData = reactive({
  orderForm: "", // 订单来源
  ruleName: "", // 规则名称
  app_type: "", // 院线名称
  shadowLineName: "", // 院线名称
  status: "", // 状态
  offerType: "", // 报价类型
  quanValue: "", // 用券类型
  remark: "", // 备注
  is_sync_plat: null // 是否同步平台 1:是 2:否
});

formData.rule = rule;

// 树节点点击
const nodeClick = nodeData => {
  currentNode.value = nodeData;
  // 一级节点是系列（带 children），二级节点是影院。
  // 原来用 id < 100 判断，依赖"系列数不足 100"的隐式约定，这里改为按结构判断
  if (nodeData.children?.length) {
    formData.app_type = nodeData.value;
    formData.shadowLineName = "";
  } else {
    formData.shadowLineName = nodeData.value;
    formData.app_type = "";
  }
  searchData();
};

// 设置本地的规则列表（获取全量启用/仅报价规则，供出票流程使用）
const setLocalRuleList = async () => {
  try {
    const ruleRes = await svApi.queryRuleList({ rule });
    // console.log("ruleRes", ruleRes);
    let ruleRecords = ruleRes.data.ruleList || [];
    ruleRecords.forEach(item => {
      item.includeCityNames = JSON.parse(item.includeCityNames);
      item.excludeCityNames = JSON.parse(item.excludeCityNames);
      item.includeCinemaNames = JSON.parse(item.includeCinemaNames);
      item.excludeCinemaNames = JSON.parse(item.excludeCinemaNames);
      item.includeHallNames = JSON.parse(item.includeHallNames);
      item.excludeHallNames = JSON.parse(item.excludeHallNames);
      item.includeFilmNames = JSON.parse(item.includeFilmNames);
      item.excludeFilmNames = JSON.parse(item.excludeFilmNames);
      item.platOfferList = JSON.parse(item.platOfferList || "[]");
      item.weekDay = JSON.parse(item.weekDay);
      item.film_type = item.film_type ? item.film_type?.split(",") : [];
      item.quanValueList = item.quanValue ? item.quanValue?.split(",") : [];
    });
    // 可用的规则列表
    const useRuleRecords = ruleRecords.filter(item =>
      ["1", "3"].includes(item.status)
    );
    rules.setRuleList(useRuleRecords);
  } catch (error) {
    ElMessage({
      type: "error",
      message: "设置本地报价规则数据异常"
    });
    console.warn("查询规则列表时设置本地规则数据异常", error);
  }
};

// 判断最后使用时间是否超过10天且库存超过20
const getLastUseTimeClass = row => {
  if (!row.last_used_time) return "";

  // 计算最后使用时间距离今天的天数
  const lastUseTime = new Date(row.last_used_time);
  const today = new Date();
  const diffTime = today - lastUseTime;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // 最后使用时间超过四个月（120天）用黄色
  if (diffDays > 120) {
    return "yellow";
  }
  return "";
};
// 格式化订单来源
const formatPlatName = ({ orderForm, platOfferList }) => {
  return platOfferList?.length
    ? platOfferList.map(item => ORDER_FORM[item.platName]).join()
    : orderForm
        .split(",")
        .map(item => ORDER_FORM[item])
        .join();
};

// 格式化报价金额
const formatOfferAmount = ({ offerAmount, offerType, platOfferList }) => {
  return platOfferList?.length
    ? offerType === "1"
      ? platOfferList
          .map(item => ORDER_FORM[item.platName] + ":" + item.value)
          .join(";")
      : ""
    : offerAmount;
};

// 格式化加价金额
const formatAddAmount = ({ addAmount, offerType, platOfferList }) => {
  return platOfferList?.length
    ? offerType === "2"
      ? platOfferList
          .map(item => ORDER_FORM[item.platName] + ":" + item.value)
          .join(";")
      : ""
    : addAmount;
};

// 影院名列表：只展示前 limit 个，其余折叠成"等 N 个"（完整列表在 tooltip 里）
const formatCinemaNames = (names, limit = 2) => {
  const list = names || [];
  if (!list.length) return "";
  if (list.length <= limit) return list.join("、");
  return `${list.slice(0, limit).join("、")} 等 ${list.length} 个`;
};

// 搜索数据
const searchData = async () => {
  const loading = ElLoading.service({
    lock: true,
    text: "获取列表数据中",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    let formInfo = JSON.parse(JSON.stringify(formData));
    const filteredEntries = Object.entries(formInfo).filter(([key, value]) => {
      return value !== null && value !== undefined && value !== "";
    });
    // 使用Object.fromEntries将过滤后的键值对数组转换回对象
    let queryParams = Object.fromEntries(filteredEntries);
    if (queryParams.status == 5) {
      queryParams.status = 1;
      queryParams.allow_offer_time = getCurrentTime();
    }
    // console.log("queryParams", queryParams);
    let res;
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    if (JSON.stringify(queryParams) === "{}") {
      res = await svApi.queryRuleList({ page_num, page_size });
    } else {
      res = await svApi.queryRuleList({
        ...queryParams,
        page_num,
        page_size
      });
    }
    let ruleRecords = res.data.ruleList || [];
    ruleRecords.forEach(item => {
      item.includeCityNames = JSON.parse(item.includeCityNames);
      item.excludeCityNames = JSON.parse(item.excludeCityNames);
      item.includeCinemaNames = JSON.parse(item.includeCinemaNames);
      item.excludeCinemaNames = JSON.parse(item.excludeCinemaNames);
      item.includeHallNames = JSON.parse(item.includeHallNames);
      item.excludeHallNames = JSON.parse(item.excludeHallNames);
      item.includeFilmNames = JSON.parse(item.includeFilmNames);
      item.excludeFilmNames = JSON.parse(item.excludeFilmNames);
      item.platOfferList = JSON.parse(item.platOfferList || "[]");
      item.weekDay = JSON.parse(item.weekDay);
      item.quanValue = item.quanValue ? item.quanValue?.split(",") : [];
    });
    console.log("规则列表===>", ruleRecords);
    tableData.value = ruleRecords;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
    await setLocalRuleList();
  } catch (error) {
    loading.close();
    console.warn("获取规则列表失败", error);
  }
};
const handleSizeChange = val => {
  console.log(`${val} items per page`);
  currentPage.value = 1;
  searchData();
};
const handleCurrentChange = val => {
  console.log(`current page: ${val}`);
  searchData();
};
// sfc弹框实例
const sfcDialogRef = ref(null);
const dialogTitle = ref("新增");

// 新增规则：院线直接用左侧树当前选中的影院，不需要再选一次
const addRule = () => {
  const node = currentNode.value;
  if (!node || node.children?.length) {
    ElMessage.warning("请先在左侧树选中具体影院，再新增规则");
    return;
  }
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ shadowLineName: node.value });
};

// 处理状态更改
const handleStatusChange = async row => {
  // 更新状态
  try {
    await editStatus(row);
  } catch (err) {
    console.warn("状态更新失败, 还原原状态", err);
    row.status = row.status === "1" ? "2" : "1";
  } finally {
    searchData();
  }
};

// 启用禁用状态
const editStatus = async row => {
  try {
    // 先同步平台状态，成功后再落库本地，避免平台失败时"本地已改、平台未改"的不一致
    await editRuleStatusSyncToPlat(row);
    await svApi.updateRuleRecord({
      id: row.id,
      status: row.status,
      is_sync_plat: row.platOfferList.find(
        item => item.isSyncPlat == 1 && item.platName == "lieren"
      )
        ? 1
        : 2,
      update_time: getCurrentTime()
    });
    // 若未同步到平台则记录状态变更日志；已同步的由 sync_status 日志覆盖，避免重复
    const _fixedOfferToPlatList =
      dictStore.dictInfo.fixedOfferToPlatList?.split(",") || [];
    const _syncedToLieren =
      _fixedOfferToPlatList.length > 0 &&
      row.offerType == 1 &&
      row.platOfferList?.find(
        item => item.platName === "lieren" && item.isSyncPlat == 1
      );
    if (!_syncedToLieren) {
      svApi
        .addRuleOperationLog({
          rule_id: row.id,
          rule_name: row.ruleName,
          shadow_line_name: row.shadowLineName,
          operation_type: "status_change",
          old_status: row.status === "1" ? "2" : "1",
          new_status: row.status,
          trigger_source: "manual_toggle",
          change_reason: "用户手动切换规则状态",
          success: 1,
          operator: name
        })
        .catch(() => {});
    }
    ElMessage.success("状态更新成功");
  } catch (err) {
    throw new Error("状态更新失败");
  }
};

// 是否可以点击当日不报
const clickNoOffer = row => {
  return !row.allow_offer_time
    ? true
    : +new Date() > +new Date(row.allow_offer_time);
};

// 当日不报是否生效中（allow_offer_time 未到 → 今日不报价，但不改 status）
const isNoOfferActive = row => {
  return !!(
    row.allow_offer_time && +new Date(row.allow_offer_time) > +new Date()
  );
};
// 当日不报
const currentDayNoOfferHandle = async row => {
  try {
    // 与机器「当日不报」一致：猎人侧禁用（status 非 '1' 即关）
    // 先同步平台成功，再落库本地，避免平台失败时"本地已改、平台未改"的不一致
    await editRuleStatusSyncToPlat({ ...row, status: "5" });
    await svApi.updateRuleRecord({
      id: row.id,
      allow_offer_time: getNextDayTime(), // 允许报价时间下一天
      is_sync_plat: row.platOfferList.find(
        item => item.isSyncPlat == 1 && item.platName == "lieren"
      )
        ? 1
        : 2,
      update_time: getCurrentTime()
    });
    // 记录时间变更日志（当日不报不改状态，只改 allow_offer_time）
    svApi
      .addRuleOperationLog({
        rule_id: row.id,
        rule_name: row.ruleName,
        shadow_line_name: row.shadowLineName,
        operation_type: "allow_offer_time_change",
        trigger_source: "time_change",
        change_reason: "用户点击当日不报",
        success: 1,
        operator: name
      })
      .catch(() => {});
    searchData();
    ElMessage({
      type: "success",
      message: "操作完成"
    });
  } catch (error) {
    ElMessage({
      type: "error",
      message: "操作失败"
    });
  }
};

// 编辑规则
const editRule = (row, type) => {
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  if (type === "1") {
    sfcDialogRef.value.open(row);
  } else {
    const list = row.platOfferList || [];
    sfcDialogRef.value.open({
      ...row,
      id: "",
      platOfferList: list.map(p => ({ ...p, platRuleId: undefined }))
    });
  }
};

// 查看规则
const querRule = (row, type) => {
  dialogTitle.value = "查看规则";
  sfcDialogRef.value.open(row);
};

// 规则表新增列未落库的兜底：数据库未执行 DDL 时 rule_record 缺列，直接保存会报 Unknown column
// 导致整条规则都无法保存；此处剔除对应字段重试一次并提示，
// 保证"客户端先发版、DDL 后执行"的窗口期规则仍可正常维护（DDL 执行后该分支不再触发）
// 规则表新增列的元数据：column 用于剔除字段重试，label 用于点名业务字段的告警文案
const NEW_RULE_COLUMNS = [
  {
    column: "bWalletMarkup",
    label: "B钱包加价",
    isUnknown: isUnknownBWalletMarkupError
  },
  {
    column: "offerTppRange",
    label: "原价报区间",
    isUnknown: isUnknownOfferTppRangeError
  }
];
const saveRuleRecordWithNewColumnFallback = async (
  request,
  params,
  columns
) => {
  try {
    return await request(params);
  } catch (error) {
    const hitColumn = columns.find(item => item.isUnknown(error));
    if (!hitColumn) throw error;
    const fallbackParams = { ...params };
    delete fallbackParams[hitColumn.column];
    const res = await request(fallbackParams);
    ElMessage.warning(
      `当前数据库尚未升级（rule_record 缺少 ${hitColumn.column} 列），本次保存未包含${hitColumn.label}，请运维执行 DDL 后重新保存`
    );
    return res;
  }
};

// 保存规则
const saveRule = async ruleInfo => {
  try {
    ruleInfo = JSON.parse(JSON.stringify(ruleInfo));
    ruleInfo.cinema_group = ruleInfo.cinema_group?.join();
    ruleInfo.includeCityNames = JSON.stringify(ruleInfo.includeCityNames);
    ruleInfo.excludeCityNames = JSON.stringify(ruleInfo.excludeCityNames);
    ruleInfo.includeCinemaNames = JSON.stringify(ruleInfo.includeCinemaNames);
    ruleInfo.excludeCinemaNames = JSON.stringify(ruleInfo.excludeCinemaNames);
    ruleInfo.includeHallNames = JSON.stringify(ruleInfo.includeHallNames);
    ruleInfo.excludeHallNames = JSON.stringify(ruleInfo.excludeHallNames);
    ruleInfo.includeFilmNames = JSON.stringify(ruleInfo.includeFilmNames);
    ruleInfo.excludeFilmNames = JSON.stringify(ruleInfo.excludeFilmNames);
    ruleInfo.film_type = ruleInfo.film_type || "";
    ruleInfo.allow_offer_time = ruleInfo.allow_offer_time || null;
    ruleInfo.last_used_time = undefined; // 此处不更新该字段
    ruleInfo.quanValue = ruleInfo.quanValue?.join(",");
    ruleInfo.orderForm = (ruleInfo.platOfferList || [])
      .map(item => item.platName)
      .join();
    ruleInfo.weekDay = JSON.stringify(ruleInfo.weekDay);
    // B钱包加价：空值统一转 null，避免 DECIMAL 列收到空串报 1366
    ruleInfo.bWalletMarkup =
      ruleInfo.bWalletMarkup === "" || ruleInfo.bWalletMarkup == null
        ? null
        : Number(ruleInfo.bWalletMarkup);
    // 原价报区间：空值统一转 null（NULL = 未配置，避免空串入库）
    ruleInfo.offerTppRange = ruleInfo.offerTppRange?.trim()
      ? ruleInfo.offerTppRange.trim()
      : null;
    ruleInfo.update_time = getCurrentTime();
    ruleInfo.rule = rule;
    let targetInfo = APP_TYPE_LIST.value.find(item =>
      item.app_name_list.includes(ruleInfo.shadowLineName)
    );
    if (targetInfo) {
      ruleInfo.app_type = targetInfo.app_type_code;
    }
    let jiqiRuleInfo = {
      ...ruleInfo,
      platOfferList: JSON.stringify(
        ruleInfo.platOfferList.map(item => ({
          ...item,
          platRuleId: item.isSyncPlat == 1 ? item.platRuleId : undefined // 如果不同步平台则不传platRuleId
        }))
      )
    };
    // 是否同步平台
    jiqiRuleInfo.is_sync_plat = ruleInfo.platOfferList.some(
      item => item.isSyncPlat == 1 && item.platName == "lieren"
    )
      ? 1
      : 2;
    ruleInfo.platOfferList = JSON.stringify(ruleInfo.platOfferList || []);
    if (ruleInfo.id) {
      console.log("编辑保存规则", jiqiRuleInfo, ruleInfo);
      // 先同步规则到平台（含删除），成功后再落库，避免平台操作失败时本地状态不一致
      const syncResult = await saveRuleSyncToPlat(ruleInfo);
      // 若同步返回了新的 platOfferList（含首次同步获得的 platRuleId），需更新 jiqiRuleInfo 避免覆盖
      if (syncResult?.platOfferList) {
        jiqiRuleInfo.platOfferList = JSON.stringify(syncResult.platOfferList);
      }
      // 保存前从表格数据查旧状态
      let oldStatus = null;
      let oldSeatNum = null;
      const oldRow = tableData.value.find(item => item.id === ruleInfo.id);
      if (oldRow) {
        oldStatus = oldRow.status;
        oldSeatNum = oldRow.seatNum;
      }
      await saveRuleRecordWithNewColumnFallback(
        svApi.updateRuleRecord,
        jiqiRuleInfo,
        NEW_RULE_COLUMNS
      );
      // 记录规则编辑日志（含变更前后状态）
      svApi
        .addRuleOperationLog({
          rule_id: ruleInfo.id,
          rule_name: ruleInfo.ruleName,
          shadow_line_name: ruleInfo.shadowLineName,
          operation_type: "rule_update",
          old_status: oldStatus,
          new_status: jiqiRuleInfo.status,
          old_seat_num: oldSeatNum,
          new_seat_num: jiqiRuleInfo.seatNum,
          trigger_source: "form_save",
          change_reason: "用户编辑保存规则",
          success: 1,
          operator: name
        })
        .catch(() => {});
      sfcDialogRef.value.closeTck();
      searchData();
    } else {
      console.log("新增保存规则", jiqiRuleInfo, ruleInfo);
      const addRes = await saveRuleRecordWithNewColumnFallback(
        svApi.addRuleRecord,
        { ...jiqiRuleInfo, id: undefined },
        NEW_RULE_COLUMNS
      );
      // 同步规则到平台（新增场景需要落库后的 id 来关联 platRuleId）
      // sv-request 响应拦截器已剥离 axios 外层，addRes 即 successRes 返回体
      const newId = addRes?.data?.id;
      if (newId) {
        ruleInfo = { ...ruleInfo, id: newId };
      }
      // 记录规则新增日志
      svApi
        .addRuleOperationLog({
          rule_id: newId || null,
          rule_name: ruleInfo.ruleName,
          shadow_line_name: ruleInfo.shadowLineName,
          operation_type: "rule_create",
          new_status: jiqiRuleInfo.status,
          new_seat_num: jiqiRuleInfo.seatNum,
          trigger_source: "form_save",
          change_reason: "用户新增规则",
          success: 1,
          operator: name
        })
        .catch(() => {});
      // 新增场景本地已落库（需要 id 关联 platRuleId），同步失败仅提示不阻断流程：
      // lierenOfferRuleSyncPlat 内部已有 ElMessage.error，规则保留在本地待下次同步/人工处理
      try {
        await saveRuleSyncToPlat(ruleInfo);
      } catch (error) {
        console.warn("新增规则同步平台失败（本地已创建规则）", error);
      }
      sfcDialogRef.value.closeTck();
      searchData();
    }
  } catch (error) {
    console.warn("新增/编辑保存规则异常", error);
    // 异常时也需关闭弹框并解锁保存按钮，否则用户无法再次操作
    sfcDialogRef.value?.closeTck();
  }
};

// 新增/编辑规则同步到平台
const saveRuleSyncToPlat = async ruleForm => {
  let ruleInfo = JSON.parse(JSON.stringify(ruleForm));
  // 1、解析规则是否要同步平台
  const fixedOfferToPlatList =
    dictStore.dictInfo.fixedOfferToPlatList?.split(",") || [];

  // 固定报价规则同步配置为空时不同步
  if (fixedOfferToPlatList.length === 0) return;

  // 非固定报价规则先不同步
  if (ruleInfo.offerType != 1) {
    console.warn("非固定报价规则不同步到猎人平台");
    return;
  }

  let platOfferList = ruleInfo.platOfferList
    ? JSON.parse(ruleInfo.platOfferList)
    : [];
  ruleInfo.platOfferList = platOfferList;
  let lierenOfferRule = platOfferList.find(item => item.platName === "lieren");
  if (!lierenOfferRule) return;

  // 仅平台选择同步时才同步
  if (lierenOfferRule.isSyncPlat == 1) {
    const syncResult = await lierenOfferRuleSyncPlat(ruleInfo);
    // 同步失败时 lierenOfferRuleSyncPlat 返回 undefined：必须阻断后续落库，
    // 否则本地保存成功但平台未更新，产生本地与平台不一致（8-18/8-23 事故同类问题）
    if (!syncResult) {
      throw new Error("同步规则到猎人平台失败，本地未保存");
    }
    return syncResult;
  } else if (lierenOfferRule.isSyncPlat == 2 && lierenOfferRule.platRuleId) {
    console.log("取消同步了，准备删除平台规则", lierenOfferRule);
    // 如果之前是同步到平台的，现在取消同步了，则删除平台规则
    // 注意：此处 catch 后重新抛出，异常传播到 saveRule 以阻断后续落库，避免 platRuleId 丢失无法重试
    // 传入本地规则信息（ruleInfo），删除同步日志可追溯到本地规则
    try {
      await lierenOfferRuleDelPlat([lierenOfferRule.platRuleId], [ruleInfo]);
    } catch (error) {
      ElMessage.error("删除猎人平台规则失败，规则未保存");
      throw error;
    }
  }
};

// 删除规则同步到平台
const delRuleSyncToPlat = async ruleList => {
  try {
    ruleList = JSON.parse(JSON.stringify(ruleList));
    // 先处理猎人的规则删除（因为删除时不区分是批量删除还是单条删除，所以都走这个方法）
    ruleList = ruleList
      .map(item => {
        let lierenOffer = item.platOfferList?.find(
          sub => sub.platName === "lieren"
        );
        if (!lierenOffer) return null;
        let lierenOfferRule = {
          ...item,
          offerAmount: lierenOffer.value,
          platRuleId: lierenOffer.platRuleId,
          isSyncPlat: lierenOffer.isSyncPlat,
          platOfferList: undefined
        };
        return lierenOfferRule;
      })
      .filter(item => item && item.isSyncPlat == 1); // 只处理同步平台

    // 只处理日常固定价的规则
    ruleList = ruleList.filter(item => item.offerType == 1);
    console.warn("待删除同步的规则", ruleList);
    if (ruleList.length === 0) return;

    const platRuleIdList = ruleList.map(item => item.platRuleId);
    // 传入本地规则信息，删除同步日志可追溯到本地规则
    await lierenOfferRuleDelPlat(platRuleIdList, ruleList);
    console.log("删除规则同步到平台成功");
  } catch (error) {
    console.warn("删除规则同步到平台异常", error);
    // 平台删除失败时不能静默：本地先删会残留平台孤儿规则（8-23 事故根因），
    // 必须抛出让调用方阻断本地删除，用户明确看到失败原因
    ElMessage.error("删除猎人平台规则失败，本地规则未删除，请稍后重试");
    throw error;
  }
};

// 修改规则状态同步到平台
const editRuleStatusSyncToPlat = async ruleInfo => {
  try {
    ruleInfo = JSON.parse(JSON.stringify(ruleInfo));
    console.warn("待修改同步的规则", ruleInfo);
    // 1、解析规则是否要同步平台
    const fixedOfferToPlatList =
      dictStore.dictInfo.fixedOfferToPlatList?.split(",") || [];

    if (fixedOfferToPlatList.length === 0) return;
    // 非固定报价规则先不同步
    if (ruleInfo.offerType != 1) {
      console.warn("非固定报价规则不同步到猎人平台");
      return;
    }

    let platList = ruleInfo.platOfferList;
    if (typeof platList === "string") {
      platList = JSON.parse(platList || "[]");
    }
    const lierenOfferRule = platList.find(item => item.platName === "lieren");
    if (!lierenOfferRule) return;

    if (lierenOfferRule.isSyncPlat == 1) {
      await lierenOfferRuleEditStatusPlat({
        ...ruleInfo,
        platOfferList: platList
      });
    }
    console.log("修改规则状态同步到猎人平台完成");
  } catch (error) {
    console.warn("修改规则状态同步到猎人平台异常", error);
    // 平台状态修改失败必须向上抛出：让 editStatus/currentDayNoOfferHandle 感知，
    // 阻断本地落库/还原状态，避免"本地已改、平台未改"的不一致
    throw error;
  }
};

// 选中项
const multipleSelection = ref([]);
// 是否有选中项
const hasSelected = computed(() => multipleSelection.value.length > 0);

// 重置表单
const resetForm = () => {
  formData.orderForm = "";
  formData.ruleName = "";
  // 原来漏了 app_type：左侧树选中系列后点重置，查询条件里的系列还在，看起来像重置没生效
  formData.app_type = "";
  formData.shadowLineName = "";
  formData.quanValue = "";
  formData.remark = "";
  formData.status = "";
  formData.offerType = "";
  formData.is_sync_plat = null;
  currentPage.value = 1;
  pageSize.value = 10;
  // 树的高亮同步清掉，避免"树上还高亮着某系列、列表已经是全量"的错位
  treeRef.value?.setCurrentKey(null);
  currentNode.value = null;
  searchData();
};

// 处理选择变化
const handleSelectionChange = val => {
  console.log("选中变化", val);
  multipleSelection.value = val;
};

// 检查规则关联的券
const checkQuanInRule = async row => {
  try {
    if (row.offerType !== "1") return [];

    const quanValueArray = Array.isArray(row.quanValue)
      ? row.quanValue
      : row.quanValue
        ? row.quanValue.split(",")
        : [];
    if (quanValueArray.length === 0) return [];

    // 先查询该影院下的所有券，然后在客户端过滤
    const res = await svApi.queryQuanTypeList({
      app_name: row.shadowLineName
    });

    const allQuans = res.data.quanTypeList || [];
    // 过滤出与规则关联的券
    return allQuans.filter(quan => quanValueArray.includes(quan.quan_value));
  } catch (error) {
    console.error("检查规则关联的券异常", error);
    return [];
  }
};

// 删除单行规则
const deleteRow = async (index, row) => {
  // 检查规则是否关联了券（仅日常固定价）
  const relatedQuans = await checkQuanInRule(row);

  if (relatedQuans.length > 0) {
    let message = `该规则关联了 ${relatedQuans.length} 个券，是否同时删除这些券？`;

    ElMessageBox.confirm(message, "提示", {
      confirmButtonText: "删除规则和券",
      cancelButtonText: "仅删除规则",
      type: "warning",
      showClose: true,
      closeOnClickModal: true,
      closeOnPressEscape: true,
      distinguishCancelAndClose: true // 添加这个选项
    })
      .then(async () => {
        // 用户点击了"删除规则和券"按钮
        // 先同步删除平台规则，成功后再删本地，避免平台残留孤儿规则
        // （失败提示由 delRuleSyncToPlat 内部统一弹出，这里仅阻断本地删除）
        try {
          await delRuleSyncToPlat([row]);
        } catch (error) {
          return;
        }
        for (const quan of relatedQuans) {
          await svApi.deleteQuanType({ id: quan.id });
        }
        await svApi.deleteRule({ id: row.id });
        searchData();
        ElMessage({
          type: "success",
          message: `删除完成，同时删除了 ${relatedQuans.length} 个相关券`
        });
      })
      .catch(async action => {
        // 当distinguishCancelAndClose为true时，action是一个对象
        const actionName = typeof action === "object" ? action.name : action;
        if (actionName === "cancel") {
          // 用户点击了"仅删除规则"按钮
          // 先同步删除平台规则，成功后再删本地，避免平台残留孤儿规则
          // （失败提示由 delRuleSyncToPlat 内部统一弹出，这里仅阻断本地删除）
          try {
            await delRuleSyncToPlat([row]);
          } catch (error) {
            return;
          }
          await svApi.deleteRule({ id: row.id });
          searchData();
          ElMessage({
            type: "success",
            message: "删除完成，相关券未删除"
          });
        } else {
          // 用户点击了关闭按钮、遮罩层或按ESC
          ElMessage({
            type: "info",
            message: "删除取消"
          });
        }
      });
  } else {
    // 规则未关联券，直接删除
    ElMessageBox.confirm("确定要删除该规则吗?", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      distinguishCancelAndClose: true // 这里也需要
    })
      .then(async () => {
        // 点击"确定"按钮
        // 先同步删除平台规则，成功后再删本地，避免平台残留孤儿规则
        // （失败提示由 delRuleSyncToPlat 内部统一弹出，这里仅阻断本地删除）
        try {
          await delRuleSyncToPlat([row]);
        } catch (error) {
          return;
        }
        await svApi.deleteRule({ id: row.id });
        searchData();
        ElMessage({
          type: "success",
          message: "删除完成"
        });
      })
      .catch(action => {
        if (action === "cancel") {
          // 用户点击了"取消"按钮
          ElMessage({
            type: "info",
            message: "删除取消"
          });
        } else {
          // 用户点击了关闭按钮
          ElMessage({
            type: "info",
            message: "删除取消"
          });
        }
      });
  }
};

// 批量删除
const batchDelete = () => {
  if (multipleSelection.value.length) {
    ElMessageBox.confirm(
      `批量删除 ${multipleSelection.value.length} 条规则?`,
      "提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        showClose: false,
        closeOnClickModal: false,
        closeOnPressEscape: false
      }
    )
      .then(async () => {
        // 先同步删除平台规则，成功后再删本地，避免平台残留孤儿规则
        // （失败提示由 delRuleSyncToPlat 内部统一弹出，这里仅阻断本地删除）
        try {
          await delRuleSyncToPlat(multipleSelection.value);
        } catch (error) {
          return;
        }
        let ids = multipleSelection.value.map(item => item.id);
        console.log("ids===>", ids);
        await svApi.batchDeleteRule({ delIds: ids });
        searchData();
        multipleSelection.value = [];
        ElMessage({
          type: "success",
          message: "删除完成"
        });
      })
      .catch(() => {
        ElMessage({
          type: "info",
          message: "删除取消"
        });
      });
  }
};
const formatQuanType = quanValueList => {
  if (!quanValueList || !quanValueList.length) return "";
  return quanValueList
    .map(quanValue => {
      const item = quanType.value.find(q => q.quan_value === quanValue);
      return item ? item.quan_name : quanValue;
    })
    .join();
};
onBeforeMount(async () => {
  const quanTypeList = await getQuanTypeList();
  quanType.value = quanTypeList;
  nextTick(() => {
    if (!treeRef.value) return;
    // 默认选中第一个系列，替代原来硬编码的 "ume_applet"（换系列/换账号就会错）
    const firstType = treeData[0];
    if (firstType) {
      treeRef.value.setCurrentKey(firstType.id);
      currentNode.value = firstType;
      formData.app_type = firstType.value;
      formData.shadowLineName = "";
    }
    searchData();
  });
});
</script>
<style scoped>
.tree-list :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: #5fe3de;
}

/* 整页布局：左侧树独立滚动，右侧内容区不再被树的高度顶长 */
.rule-page {
  height: 100%;
}

.rule-page__container {
  align-items: flex-start;
  height: 100%;
}

.rule-page__aside {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.rule-page__main {
  padding: 0;
  margin-left: 15px;
}

/* 原来用 w-60(240px)，比 200px 的 aside 还宽会溢出 */
.tree-filter {
  width: 100%;
  margin-bottom: 8px;
}

/* 原来写死 max-height: 650px，高屏留白、矮屏出现内外两层滚动条 */
.tree-list {
  flex: 1;
  min-height: 0;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

/* 查询区 / 操作按钮行的样式统一放在 src/style/page-layout.scss，
   这里只保留本页特有的部分（左侧树、列表页容器） */
</style>
