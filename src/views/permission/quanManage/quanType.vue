<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline" label-width="80px">
      <el-form-item label="券类型">
        <el-select
          v-model="formData.quan_value"
          clearable
          filterable
          placeholder="券类型"
          style="width: 194px"
        >
          <el-option
            v-for="item in quanType"
            :key="item.id"
            :label="item.quan_name"
            :value="item.quan_value"
          />
        </el-select>
      </el-form-item>
      <!-- <el-form-item label="券名称">
        <el-input
          v-model="formData.quan_name"
          placeholder="请输入券名称"
          clearable
          style="width: 194px"
        />
      </el-form-item> -->
      <!-- <el-form-item label="券成本">
        <el-input
          v-model="formData.quan_cost"
          placeholder="请输入券成本"
          clearable
          style="width: 194px"
        />
      </el-form-item> -->
      <el-form-item label="券标识">
        <el-input
          v-model="formData.quan_flag"
          placeholder="请输入券标识"
          clearable
          style="width: 194px"
        />
      </el-form-item>
      <!-- <el-form-item label="券手续费">
        <el-input
          v-model="formData.quan_fee"
          placeholder="请输入券手续费"
          clearable
          style="width: 194px"
        />
      </el-form-item> -->
      <el-form-item label="是否入库">
        <el-select
          v-model="formData.is_store"
          placeholder="是否入库"
          style="width: 194px"
          clearable
        >
          <el-option label="是" value="1" />
          <el-option label="否" value="2" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
      <el-form-item class="demo-form-inline__submit">
        <el-button type="primary" @click="addQuan"> 新增 </el-button>
        <el-button type="primary" style="margin-left: 10px" @click="expireQuery"
          >临期查询</el-button
        >
        <el-button
          type="primary"
          style="margin-left: 10px"
          @click="getQuanInventory"
          >券库存</el-button
        >
        <el-button
          style="margin-left: 10px"
          type="primary"
          @click="queryQuanBalanceTotal"
          >券余额</el-button
        >
        <el-button
          type="danger"
          style="margin-left: 10px"
          :disabled="!hasSelected"
          @click="batchDelete"
          >批量删除</el-button
        >
        <!-- 同步券库存 -->
        <!-- <el-button type="primary" style="padding-left: 0px; margin-left: 15px">
          <template #default>
            <el-input
              v-model="mobile"
              placeholder="所属账号(手机号)"
              clearable
              style="width: 350px; margin-left: -1px"
            >
              <template #prepend>
                <el-select
                  v-model="syncType"
                  placeholder="Select"
                  style="width: 150px"
                >
                  <el-option label="凤凰云智除外" value="1" />
                  <el-option label="仅同步凤凰云智" value="2" />
                </el-select>
              </template>
            </el-input>
            <span @click="syncQuanInfo">同步券库存</span>
          </template>
        </el-button> -->
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
      <el-table-column type="selection" min-width="55" />
      <el-table-column
        prop="app_name"
        label="影线名称"
        sortable
        min-width="110"
      >
        <template #default="{ row }">
          <span>{{ APP_LIST[row.app_name] }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="quan_name" label="券名称" min-width="180" />
      <el-table-column prop="quan_value" label="券类型" min-width="100" />
      <el-table-column
        prop="quan_cost"
        label="券成本"
        min-width="70"
        align="center"
      />
      <el-table-column prop="quan_flag" label="券标识" min-width="180" />
      <el-table-column prop="quan_fee" label="券手续费" min-width="100" />
      <el-table-column
        prop="is_store"
        label="是否入库"
        min-width="90"
        align="center"
      >
        <template #default="{ row: { is_store } }">
          <el-tag v-if="is_store == '1'" type="success" size="small">是</el-tag>
          <el-tag v-else type="info" size="small">否</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="券库存" min-width="100">
        <template #default="{ row: { quan_stock, quanStockList } }">
          <span v-if="quanStockFormat({ quan_stock, quanStockList }) == 0">{{
            quanStockFormat({ quan_stock, quanStockList })
          }}</span>
          <el-tag
            v-else
            type="success"
            size="small"
            effect="dark"
            class="transfer-label"
            style="padding: 0 8px; font-weight: 600"
          >
            {{ quanStockFormat({ quan_stock, quanStockList }) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="end_use_time" label="最后使用时间" min-width="160">
        <template #default="{ row }">
          <span
            :class="getLastUseTimeClass(row)"
            title="红色为:最后使用时间距离今天超过10天且库存超过20,用户是否需要调整报价? 黄色为:最后使用时间超过四个月,该规则是否需要删除?"
          >
            {{ row.end_use_time }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="update_time" label="更新时间" min-width="160" />
      <el-table-column prop="black_quans" label="黑名单券" min-width="100" />
      <el-table-column prop="remark" label="备注" min-width="100" />

      <el-table-column
        label="操作"
        fixed="right"
        align="center"
        min-width="200"
      >
        <template #default="scope">
          <el-button
            size="small"
            type="primary"
            @click="editQuan(scope.row, '1')"
            >编辑</el-button
          >
          <el-button
            size="small"
            type="success"
            @click="editQuan(scope.row, '2')"
            >复制</el-button
          >
          <el-button
            size="small"
            type="danger"
            @click="deleteRow(scope.$index, scope.row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页 -->
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      style="margin-top: 10px; display: flex; justify-content: flex-end"
      :page-sizes="[10, 20, 50, 100]"
      :background="true"
      layout="total, sizes, prev, pager, next, jumper"
      :total="totalNum"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />

    <QuanDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveQuan"
    />

    <el-dialog
      v-model="dialogQueryQuanVisible"
      title="服务器券库存"
      width="800"
    >
      <el-table :data="quanData" border max-height="800">
        <el-table-column type="index" label="序号" width="80" />
        <el-table-column property="quan_name" sortable label="券名称" />
        <!-- <el-table-column property="quan_flag" sortable label="券标识" />
        <el-table-column property="quan_desc" sortable label="券描述" />
        <el-table-column property="quan_value" sortable label="券类型" /> -->
        <el-table-column property="quan_stock" sortable label="数量" />
        <el-table-column
          property="real_total_price"
          sortable
          label="实际价值"
        />
      </el-table>
    </el-dialog>

    <el-dialog v-model="quanBalanceVisible" width="50%" title="券余额汇总结果">
      <el-table :data="summaryData" border style="width: 100%" max-height="800">
        <el-table-column prop="appName" label="应用名称" width="180" />
        <el-table-column prop="totalBalance" sortable label="总余额" />
        <el-table-column
          prop="discountTotalBalance"
          sortable
          label="实际总余额"
        />
      </el-table>
    </el-dialog>

    <el-dialog v-model="quanExpireVisible" width="70%" title="临近过期券明细">
      <el-table :data="expireQuanList" border style="width: 100%">
        <el-table-column prop="app_name" label="应用名称" />
        <el-table-column prop="quan_flag" sortable label="券标识" />
        <el-table-column prop="quan_value" sortable label="券类型" />
        <el-table-column prop="real_quan_stock" sortable label="券库存" />
        <el-table-column prop="phone" sortable label="手机号" />
        <el-table-column prop="expire_time" sortable label="最快过期时间" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import {
  ref,
  reactive,
  toRaw,
  computed,
  onBeforeMount,
  nextTick,
  watch
} from "vue";

// 接收父组件传递的属性
const props = defineProps({
  appType: {
    type: String,
    default: ""
  },
  appName: {
    type: String,
    default: ""
  }
});
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import QuanDialog from "@/components/QuanDialog.vue";
import { GET_APP_LIST, GET_APP_TYPE_LIST } from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());

import { getCurrentTime, parseExcel, formatTimeOfTime } from "@/utils/utils";

// 猎人规则同步相关方法
import useLierenOfferRuleSyncFun from "@/mixins/useLierenOfferRuleSyncFun";
const { lierenOfferRuleDelPlat } = useLierenOfferRuleSyncFun();

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

const tableData = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);
// 表单查询数据
const formData = reactive({
  app_type: "",
  app_name: "",
  // quan_name: "",
  quan_value: "",
  quan_cost: "",
  quan_flag: "",
  quan_fee: "",
  is_store: ""
});

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
    console.log("queryParams", queryParams);
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    let res = await svApi.queryQuanTypeList({
      ...queryParams,
      page_num,
      page_size
    });
    let quanTypeList = res.data.quanTypeList || [];
    quanTypeList.forEach(item => {
      item.quanStockList = item.quanStockList
        ? JSON.parse(item.quanStockList)
        : [];
      item.end_use_time = item.end_use_time
        ? formatTimeOfTime(+new Date(item.end_use_time))
        : "";
    });
    // console.log("券类型列表===>", quanTypeList);
    tableData.value = quanTypeList;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
  } catch (error) {
    loading.close();
    console.warn("获取卡列表失败", error);
  }
};

// 监听属性变化
watch(
  [() => props.appType, () => props.appName],
  ([newAppType, newAppName]) => {
    formData.app_type = newAppType;
    formData.app_name = newAppName;
    searchData();
  }
);

const quanExpireVisible = ref(false);
const expireQuanList = ref([]);
// 过期查询
const expireQuery = async () => {
  const params = {
    isNeedTotalNum: 0,
    queryFields: "id,app_name,quan_value,quan_flag,quanStockList"
  };
  try {
    let quanTypeRes = await svApi.queryQuanTypeList(params);
    let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
    quanTypeList.forEach(item => {
      item.quanStockList = item.quanStockList
        ? JSON.parse(item.quanStockList)
        : [];
    });
    quanTypeList = quanTypeList
      .map(item =>
        item.quanStockList.map(itemA => ({
          ...itemA,
          app_name: item.app_name,
          quan_value: item.quan_value,
          quan_flag: item.quan_flag
        }))
      )
      .flat()
      .filter(
        item =>
          item.real_quan_stock > 0 &&
          item.endDateTime &&
          +new Date(item.endDateTime) - +new Date() < 15 * 24 * 60 * 60 * 1000
      );
    console.log("quanTypeList", quanTypeList);
    quanExpireVisible.value = true;
    expireQuanList.value = quanTypeList.map(item => ({
      ...item,
      expire_time: formatTimeOfTime(+new Date(item.endDateTime))
    }));
  } catch (error) {
    console.error("根据影院获取券类型列表返回异常", error);
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

// 同步券信息
const mobile = ref("");
const syncType = ref("1");

// 同步券信息
const syncQuanInfo = async () => {
  try {
    const params = {
      isNeedTotalNum: 0,
      queryFields:
        "id,app_name,quan_value,quan_flag,quan_cost,quan_fee,quanStockList"
    };
    let res = await svApi.queryQuanTypeList(params);
    let quanTypeList = res.data.quanTypeList || [];
    quanTypeList = quanTypeList.map(item => {
      item.quanStockList = item.quanStockList
        ? JSON.parse(item.quanStockList)
        : [];
      return item;
    });
  } catch (error) {
    console.error("同步券信息异常", error);
  }
};

const quanBalanceVisible = ref(false);
const summaryData = ref([]);
// 查看券余额
const queryQuanBalanceTotal = async () => {
  try {
    const params = {
      isNeedTotalNum: 0,
      queryFields:
        "id,app_name,quan_value,quan_flag,quan_cost,quan_fee,quanStockList"
    };
    let res = await svApi.queryQuanTypeList(params);
    let quanTypeList = res.data.quanTypeList || [];
    quanTypeList = quanTypeList
      .map(item => {
        item.quanStockList = item.quanStockList
          ? JSON.parse(item.quanStockList)
          : [];
        return item;
      })
      .filter(item => item.quanStockList.length);
    // 做去重处理
    let filterQuanList = [];
    quanTypeList.forEach(item => {
      let quanInfo = filterQuanList.find(
        itemA => itemA.quan_flag == item.quan_flag
      );
      if (!quanInfo) {
        // 找出最大价值的同名券计算券余额价值
        let targetQuanList = quanTypeList.filter(
          itemA =>
            itemA.quan_flag == item.quan_flag && itemA.app_name == item.app_name
        );
        targetQuanList = targetQuanList.sort((a, b) => a.quan_fee - b.quan_fee);
        let quanInfo = targetQuanList[0];
        filterQuanList.push(quanInfo);
      }
    });
    console.log("filterQuanList", filterQuanList);
    const summary = {};
    let totalBalance = 0,
      discountTotalBalance = 0;
    filterQuanList.forEach(item => {
      const appName = APP_LIST.value[item.app_name];
      const quan_cost_real = parseFloat(item.quan_cost) - (item.quan_fee || 0);
      const quan_num = item.quanStockList
        .map(item => +(item.real_quan_stock || item.quan_stock || 0))
        .reduce((prev, item) => prev + item, 0);
      const quan_balance = (+item.quan_cost * 1000 * quan_num) / 1000;
      const quan_balance_real = (quan_cost_real * 1000 * quan_num) / 1000;
      if (!summary[appName]) {
        summary[appName] = {
          appName,
          totalBalance: 0,
          discountTotalBalance: 0
        };
      }
      summary[appName].totalBalance += quan_balance;
      summary[appName].discountTotalBalance += quan_balance_real;
      totalBalance += quan_balance;
      discountTotalBalance += quan_balance_real || 0;
    });
    let balance_list = Object.values(summary);
    balance_list.unshift({
      appName: "总余额",
      totalBalance: totalBalance,
      discountTotalBalance
    });
    summaryData.value = balance_list.map(item => ({
      ...item,
      totalBalance: +item.totalBalance.toFixed(),
      discountTotalBalance: +item.discountTotalBalance.toFixed()
    }));
    quanBalanceVisible.value = true;
  } catch (error) {
    console.error("同步券信息异常", error);
  }
};

// 弹框实例
const sfcDialogRef = ref(null);
const dialogTitle = ref("新增");

// 新增券类型
const addQuan = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ app_name: props.appName || formData.app_name });
};

// 编辑券类型
const editQuan = (row, type) => {
  console.log("row", row);
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 格式化券库存
const quanStockFormat = ({ quan_stock, quanStockList }) => {
  if (quanStockList?.length) {
    // 所有数相加当做券库存
    let totalNum = 0;
    quanStockList.forEach(item => {
      totalNum += +item.quan_stock || 0;
    });
    return totalNum;
  } else {
    return quan_stock;
  }
};

// 判断最后使用时间是否超过10天且库存超过20
const getLastUseTimeClass = row => {
  if (!row.end_use_time) return "";

  // 计算最后使用时间距离今天的天数
  const lastUseTime = new Date(row.end_use_time);
  const today = new Date();
  const diffTime = today - lastUseTime;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // 计算券库存
  const stock = quanStockFormat({
    quan_stock: row.quan_stock,
    quanStockList: row.quanStockList
  });

  // 最后使用时间超过四个月（120天），不管有没有库存，都用黄色
  if (diffDays > 120) {
    return "yellow";
  }
  // 最后使用时间超过10天且库存超过20，用红色
  if (diffDays > 10 && stock > 20) {
    return "red";
  }
  return "";
};
// 保存券类型
const saveQuan = async cardInfo => {
  try {
    cardInfo.update_time = getCurrentTime();
    cardInfo.quanStockList = JSON.stringify(cardInfo.quanStockList);
    cardInfo.linkCinemaIds = cardInfo.linkCinemaIds?.join();
    let targetInfo = APP_TYPE_LIST.value.find(item =>
      item.app_name_list.includes(cardInfo.app_name)
    );
    if (targetInfo) {
      cardInfo.app_type = targetInfo.app_type_code;
    }
    console.log("新增/编辑保存券类型", JSON.parse(JSON.stringify(cardInfo)));
    if (cardInfo.id) {
      await svApi.updateQuanType(cardInfo);
      sfcDialogRef.value.closeTck();
      ElMessage.success("编辑成功！");
      searchData();
    } else {
      await svApi.addQuanType({ ...cardInfo, id: undefined });
      sfcDialogRef.value.closeTck();
      ElMessage.success("保存成功！");
      searchData();
    }
  } catch (error) {
    console.warn("新增/编辑保存券类型异常", error);
  }
};

// 选中项
const multipleSelection = ref([]);
// 是否有选中项
const hasSelected = computed(() => multipleSelection.value.length > 0);

// 重置表单
const resetForm = () => {
  formData.app_name = "";
  // formData.quan_name = "";
  formData.quan_value = "";
  formData.quan_cost = "";
  formData.quan_flag = "";
  formData.quan_fee = "";
  formData.is_store = "";

  currentPage.value = 1;
  pageSize.value = 10;
};

// 处理选择变化
const handleSelectionChange = val => {
  console.log("选中变化", val);
  multipleSelection.value = val;
};

// 检查券是否在报价规则中被使用
const checkQuanInRules = async (app_name, quan_value) => {
  try {
    const res = await svApi.queryRuleList({
      shadowLineName: app_name,
      rule
    });
    let ruleRecords = res.data.ruleList || [];
    ruleRecords = ruleRecords.filter(item => {
      const quanValueArray = item.quanValue ? item.quanValue.split(",") : [];
      return (
        item.shadowLineName === app_name && quanValueArray.includes(quan_value)
      );
    });
    return ruleRecords;
  } catch (error) {
    console.error("检查券在规则中使用情况异常", error);
    return [];
  }
};

// 删除单行券
const deleteRow = async (index, row) => {
  // 检查券是否在报价规则中被使用
  const usedRules = await checkQuanInRules(row.app_name, row.quan_value);
  console.log("usedRules", usedRules);
  if (usedRules.length > 0) {
    // 检查是否有规则包含多个券
    const multiQuanRules = usedRules.filter(rule => {
      const quanValueArray = rule.quanValue ? rule.quanValue.split(",") : [];
      return quanValueArray.length > 1;
    });

    let message = `该券在 ${usedRules.length} 个报价规则中被使用，是否同时删除这些规则？`;
    if (multiQuanRules.length > 0) {
      message += `\n注意：其中 ${multiQuanRules.length} 个规则包含多个券，删除后这些规则将被完全删除。`;
    }

    ElMessageBox.confirm(message, "提示", {
      confirmButtonText: "删除券和规则",
      cancelButtonText: "仅删除券",
      type: "warning",
      showClose: true,
      closeOnClickModal: true,
      closeOnPressEscape: true,
      distinguishCancelAndClose: true // 添加这个选项
    })
      .then(async () => {
        // 用户点击了"删除券和规则"按钮
        for (const rule of usedRules) {
          await svApi.deleteRule({ id: rule.id });
          await delRuleSyncToPlat([rule]);
        }
        // 删除券
        await svApi.deleteQuanType({ id: row.id });
        searchData();
        ElMessage({
          type: "success",
          message: `删除完成，同时删除了 ${usedRules.length} 个相关规则`
        });
      })
      .catch(action => {
        // 当distinguishCancelAndClose为true时，action是一个对象
        const actionName = typeof action === "object" ? action.name : action;
        if (actionName === "cancel") {
          // 用户点击了"仅删除券"按钮
          svApi.deleteQuanType({ id: row.id }).then(() => {
            searchData();
            ElMessage({
              type: "success",
              message: "删除完成，相关规则未删除"
            });
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
    // 券未在规则中使用，直接删除
    ElMessageBox.confirm("确定要删除该券吗?", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      distinguishCancelAndClose: true // 这里也需要
    })
      .then(async () => {
        // 点击"确定"按钮
        await svApi.deleteQuanType({ id: row.id });
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
// 删除规则同步到平台
const delRuleSyncToPlat = async ruleList => {
  try {
    ruleList = JSON.parse(JSON.stringify(ruleList));
    // 先处理猎人的规则删除（因为删除时不区分是批量删除还是单条删除，所以都走这个方法）
    ruleList = ruleList
      .map(item => {
        let platOfferList = item.platOfferList;
        if (platOfferList && !Array.isArray(platOfferList)) {
          platOfferList = JSON.parse(platOfferList);
        }
        let lierenOffer = platOfferList.find(
          item => item.platName === "lieren"
        );
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

// 批量删除券
const batchDelete = () => {
  if (multipleSelection.value.length) {
    ElMessageBox.confirm(
      `批量删除 ${multipleSelection.value.length} 张券?`,
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
        await svApi.batchDeleteQuanType({ delIds: ids });
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

// 券库存弹框
const dialogQueryQuanVisible = ref(false);
const quanData = ref([]); // 券库存列表

// 格式化券类型展示
const formatQuanType = quan_value => {
  return (
    quanType.value?.find(item => item.quan_value === quan_value)?.quan_name ||
    quan_value
  );
};

// 查询券库存
const getQuanInventory = async () => {
  try {
    const params = {
      isNeedTotalNum: 0,
      is_store: 1,
      queryFields:
        "id,app_name,quan_name,quan_value,quan_flag,quan_desc,quan_cost,quan_fee,is_base_quan"
    };
    let quanTypeRes = await svApi.queryQuanTypeList(params);
    let quanTypeList = quanTypeRes.data.quanTypeList || [];
    console.warn("quanTypeList", quanTypeList);
    const res = await svApi.queryQuanInventory();
    console.warn("查询券库存返回", res);
    let quanList = res.data?.quanList;
    let total_num = 0,
      total_price = 0;
    let quanDataList = [];
    quanTypeList.forEach(item => {
      const {
        app_name,
        quan_name,
        is_base_quan,
        quan_flag,
        quan_desc,
        quan_value
      } = item;
      let index = quanDataList.findIndex(
        itemA => itemA.quan_flag == quan_flag && itemA.quan_desc == quan_desc
      );
      let quan_stock =
        quanList.find(item => item.quan_value == quan_value)?.remaining_count ||
        0;
      if (index == -1) {
        quanDataList.push({
          app_name,
          quan_name,
          quan_value,
          quan_flag,
          quan_desc,
          quan_stock
        });
      } else {
        quanDataList[index].quan_stock += quan_stock;
        // 同名券合并后按照基础券的券名称显示
        if (is_base_quan == 1) {
          quanDataList[index].quan_value = quan_value;
          quanDataList[index].quan_name = quan_name;
        }
      }
    });
    quanDataList = quanDataList.map(item => {
      let targetQuanList = quanTypeList.filter(
        itemA =>
          itemA.quan_flag == item.quan_flag &&
          itemA.app_name == item.app_name &&
          itemA.quan_desc == item.quan_desc
      );
      // 找出最大价值的同名券计算券库存
      targetQuanList = targetQuanList.sort((a, b) => a.quan_fee - b.quan_fee);
      let quanInfo = targetQuanList[0];
      let real_total_price = 0;
      if (quanInfo) {
        const quan_cost_real =
          parseFloat(quanInfo.quan_cost) - (quanInfo.quan_fee || 0);
        real_total_price = (quan_cost_real * 1000 * item.quan_stock) / 1000;
      }
      total_num += item.quan_stock;
      total_price += real_total_price;
      return {
        ...item,
        real_total_price
      };
    });
    console.warn("quanDataList", quanDataList);
    quanDataList.unshift({
      quan_flag: "总余额",
      quan_stock: total_num,
      real_total_price: total_price
    });
    dialogQueryQuanVisible.value = true;
    quanData.value = quanDataList;
  } catch (error) {
    console.warn("查询券库存返回异常", error);
  }
};

// 券类型列表
const quanType = ref([]);
let quanTypeFetched = false;

onBeforeMount(async () => {
  await searchData();
});
</script>

<style scoped>
.special-item :deep(.el-form-item__content) {
  align-items: baseline;
}
.red {
  color: red;
  font-weight: bold;
}
.yellow {
  color: orange;
  font-weight: bold;
}
.tree-list :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: #5fe3de;
}
.special-tree :deep(.el-form-item__content) {
  align-items: baseline;
}
.upload-demo {
  margin-top: 10px;
}

.demo-form-inline .el-form-item__content {
  flex: 1;
  min-width: 0;
}
</style>
