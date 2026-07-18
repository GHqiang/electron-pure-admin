<template>
  <div>
    <el-container>
      <el-aside width="200px">
        <el-input
          v-model="filterText"
          class="w-60 mb-2"
          placeholder="可输入影院过滤"
        />
        <!-- 左侧树 -->
        <el-tree
          ref="treeRef"
          class="tree-list"
          :data="treeData"
          node-key="id"
          highlight-current
          style="max-height: 650px; overflow-y: auto"
          :default-expanded-keys="[1]"
          :props="defaultProps"
          :filter-node-method="filterNode"
          @node-click="nodeClick"
        />
      </el-aside>
      <el-main style="margin-left: 15px; padding: 0">
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
          <el-form-item label="规则名称">
            <el-input
              v-model="formData.ruleName"
              placeholder="请输入规则名称"
              clearable
            />
          </el-form-item>
          <el-form-item
            :label="`状&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;态`"
          >
            <el-select
              v-model="formData.status"
              placeholder="状态"
              style="width: 194px"
              clearable
            >
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
              style="width: 194px"
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
              style="width: 194px"
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
              style="width: 194px"
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
          <el-form-item>
            <el-button type="primary" @click="searchData">搜索</el-button>
            <el-button @click="resetForm">重置</el-button>
            <el-button type="primary" style="padding-left: 0px">
              <template #default>
                <el-cascader
                  v-model="shadowLine"
                  :options="appCascaderOptions"
                  :props="appCascaderProps"
                  filterable
                  clearable
                  placeholder="请选择影线名称"
                  style="width: 210px; margin-left: -1px"
                />
                <span @click="addRule">新增</span>
              </template>
            </el-button>
            <el-button
              type="danger"
              :disabled="!hasSelected"
              @click="batchDelete"
              >批量删除</el-button
            >
            <el-button
              type="primary"
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
              >批量同步新平台</el-button
            >
          </el-form-item>
        </el-form>
        <!-- 表格 -->
        <el-table
          ref="multipleTable"
          style="width: 100%"
          :data="tableData"
          border
          stripe
          show-overflow-tooltip
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" fixed width="55" />
          <el-table-column prop="ruleName" fixed label="规则名称" width="185" />
          <!-- <el-table-column
            prop="shadowLineName"
            fixed
            label="影线名称"
            width="105"
          >
            <template #default="scope">
              <span>{{ APP_LIST[scope.row.shadowLineName] }}</span>
            </template>
          </el-table-column> -->
          <el-table-column label="状态" fixed width="70">
            <template #default="scope">
              <span v-if="scope.row.status === '3'" style="color: red">{{
                statusObj[scope.row.status]
              }}</span>
              <el-switch
                v-else
                v-model="scope.row.status"
                active-value="1"
                inactive-value="2"
                @change="handleStatusChange(scope.row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="报价类型" fixed width="110">
            <template #default="scope">
              <el-popover
                placement="top"
                :width="1200"
                trigger="hover"
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
            </template>
          </el-table-column>
          <el-table-column prop="includeCinemaNames" label="包含影院">
            <template #default="scope">
              <span>{{ scope.row.includeCinemaNames.join() }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="excludeCinemaNames" label="排除影院">
            <template #default="scope">
              <span>{{ scope.row.excludeCinemaNames.join() }}</span>
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
                {{ row.last_used_time }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" width="110" />
          <el-table-column label="操作" fixed="right" align="left" width="350">
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
                type="success"
                @click="querRule(scope.row, '3')"
                >查看</el-button
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
          style="margin-top: 10px; display: flex; justify-content: flex-end"
          :page-sizes="[10, 20, 30, 50]"
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
      title="批量同步新平台报价"
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

import { getCurrentTime, getNextDayTime } from "@/utils/utils";
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
  checkAndUpdateLierenRuleState
} = useLierenOfferRuleSyncFun();

// 猎人规则一致性检查（挂载到 window 供控制台调用，同时支持按钮点击）
import useCheckLierenRuleSync from "@/mixins/useCheckLierenRuleSync";
const { checkLierenRuleSync } = useCheckLierenRuleSync();
const checking = ref(false);
const handleCheckLierenRuleSync = async () => {
  checking.value = true;
  try {
    const result = await checkLierenRuleSync();
    if (result?.inconsistent > 0) {
      ElMessage({
        type: "warning",
        message: `发现 ${result.inconsistent} 条规则不一致，请查看控制台详情，点击"规则同步修复"进行修复`,
        duration: 8000
      });
    } else {
      ElMessage({ type: "success", message: "所有规则一致，无需修复" });
    }
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
    await checkAndUpdateLierenRuleState(ruleRecords, "manual_fix");
    ElMessage({
      type: "success",
      message: "规则同步修复完成，请查看控制台详情"
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

// 影线二级级联配置（系列 -> 影线）
const appCascaderOptions = treeData;
const appCascaderProps = {
  value: "value",
  label: "label",
  children: "children",
  emitPath: false
};
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
  1: "日常固定价",
  2: "会员价加价",
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
  app_type: "", // 影线名称
  shadowLineName: "", // 影线名称
  status: "", // 状态
  offerType: "", // 报价类型
  quanValue: "", // 用券类型
  remark: "", // 备注
  is_sync_plat: null // 是否同步平台 1:是 2:否
});

formData.rule = rule;

// 树节点点击
const nodeClick = nodeData => {
  console.log("nodeData", nodeData);
  if (nodeData.id < 100) {
    formData.app_type = nodeData.value;
    formData.shadowLineName = "";
  } else {
    formData.shadowLineName = nodeData.value;
    shadowLine.value = nodeData.value;
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
const shadowLine = ref("sfc");

// 新增规则
const addRule = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ shadowLineName: shadowLine.value });
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
    // 修改规则状态同步到平台
    await editRuleStatusSyncToPlat(row);
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
// 当日不报
const currentDayNoOfferHandle = async row => {
  try {
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
    // 与机器「当日不报」一致：猎人侧禁用（status 非 '1' 即关）
    await editRuleStatusSyncToPlat({ ...row, status: "5" });
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
      await svApi.updateRuleRecord(jiqiRuleInfo);
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
      const addRes = await svApi.addRuleRecord({
        ...jiqiRuleInfo,
        id: undefined
      });
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
      await saveRuleSyncToPlat(ruleInfo);
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
    return await lierenOfferRuleSyncPlat(ruleInfo);
  } else if (lierenOfferRule.isSyncPlat == 2 && lierenOfferRule.platRuleId) {
    console.log("取消同步了，准备删除平台规则", lierenOfferRule);
    // 如果之前是同步到平台的，现在取消同步了，则删除平台规则
    // 注意：此处不 catch，让异常传播到 saveRule 以阻断后续落库，避免 platRuleId 丢失无法重试
    await lierenOfferRuleDelPlat([lierenOfferRule.platRuleId]);
  }
  console.log("同步规则到平台成功");
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
      .filter(item => item.isSyncPlat == 1); // 只处理同步平台

    // 只处理日常固定价的规则
    ruleList = ruleList.filter(item => item.offerType == 1);
    console.warn("待删除同步的规则", ruleList);
    if (ruleList.length === 0) return;

    const platRuleIdList = ruleList.map(item => item.platRuleId);
    await lierenOfferRuleDelPlat(platRuleIdList);
    console.log("删除规则同步到平台成功");
  } catch (error) {
    console.warn("删除规则同步到平台异常", error);
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
  }
};

// 选中项
const multipleSelection = ref([]);
// 是否有选中项
const hasSelected = computed(() => multipleSelection.value.length > 0);

// 重置表单
const resetForm = () => {
  formData.id = "";
  formData.orderForm = ""; // 规则名称
  formData.ruleName = ""; // 规则名称
  formData.shadowLineName = ""; // 影线名称
  formData.quanValue = ""; // 是否报价
  formData.remark = ""; // 备注
  formData.status = ""; // 状态
  formData.offerType = ""; // 报价类型
  currentPage.value = 1;
  pageSize.value = 10;
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
        for (const quan of relatedQuans) {
          await svApi.deleteQuanType({ id: quan.id });
        }
        await svApi.deleteRule({ id: row.id });
        await delRuleSyncToPlat([row]);
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
        let ids = multipleSelection.value.map(item => item.id);
        console.log("ids===>", ids);
        await svApi.batchDeleteRule({ delIds: ids });
        await delRuleSyncToPlat(multipleSelection.value);
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
    if (treeRef.value) {
      treeRef.value.setCurrentKey(1);
      formData.app_type = "ume_applet";
      searchData();
    }
  });
});
</script>
<style scoped>
.tree-list :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: #5fe3de;
}
</style>
