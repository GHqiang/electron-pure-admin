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
      <el-form-item label="规则名称">
        <el-input
          v-model="formData.ruleName"
          placeholder="请输入规则名称"
          clearable
        />
      </el-form-item>
      <el-form-item label="影线名称">
        <el-select
          v-model="formData.shadowLineName"
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
      <el-form-item :label="`状&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;态`">
        <el-select
          v-model="formData.status"
          placeholder="状态"
          style="width: 194px"
          clearable
        >
          <el-option label="正常" value="1" />
          <el-option label="禁用" value="2" />
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
      <el-form-item label="报价金额">
        <el-input
          v-model="formData.offerAmount"
          placeholder="请输入报价金额"
          clearable
        />
      </el-form-item>
      <el-form-item label="星期&nbsp;&nbsp;&nbsp;&nbsp;几">
        <el-select
          v-model="formData.weekDay"
          placeholder="星期几"
          style="width: 194px"
          multiple
          clearable
        >
          <el-option label="星期一" value="星期一" />
          <el-option label="星期二" value="星期二" />
          <el-option label="星期三" value="星期三" />
          <el-option label="星期四" value="星期四" />
          <el-option label="星期五" value="星期五" />
          <el-option label="星期六" value="星期六" />
          <el-option label="星期日" value="星期日" />
        </el-select>
      </el-form-item>
      <el-form-item label="座位&nbsp;&nbsp;&nbsp;&nbsp;数">
        <el-select
          v-model="formData.seatNum"
          placeholder="座位数"
          clearable
          style="width: 194px"
        >
          <el-option
            v-for="(item, index) in 10"
            :key="index"
            :label="item"
            :value="String(item)"
          />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
        <el-button type="primary" style="padding-left: 0px" @click="addRule">
          <template #default>
            <el-select
              v-model="shadowLine"
              filterable
              placeholder="请选择影线名称"
              style="width: 120px; margin-left: -1px"
            >
              <el-option
                v-for="(keyValue, keyName) in shadowLineObj"
                :key="keyName"
                :label="keyValue"
                :value="keyName"
              />
            </el-select>
            &nbsp;&nbsp;新增
          </template>
        </el-button>
        <el-button type="danger" :disabled="!hasSelected" @click="batchDelete"
          >批量删除</el-button
        >
      </el-form-item>
    </el-form>

    <!-- 操作按钮 -->
    <div style="margin-bottom: 15px" />

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
      <el-table-column prop="ruleName" fixed label="规则名称" width="110" />
      <el-table-column prop="orderForm" fixed label="订单来源" width="85">
        <template #default="scope">
          <span>{{ orderFormObj[scope.row.orderForm] }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="shadowLineName" fixed label="影线名称" width="85">
        <template #default="scope">
          <span>{{ shadowLineObj[scope.row.shadowLineName] }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" fixed width="55">
        <template #default="scope">
          <span>{{ scope.row.status === "1" ? "正常" : "禁用" }}</span>
        </template>
      </el-table-column>
      <el-table-column label="报价类型" fixed width="100">
        <template #default="scope">
          <span>{{ offerTypeObj[scope.row.offerType] || "" }}</span>
        </template>
      </el-table-column>
      <el-table-column label="用券面额" prop="quanValue" width="85" />
      <el-table-column label="报价金额" prop="offerAmount" width="85" />
      <el-table-column label="加价金额" prop="addAmount" width="85" />
      <el-table-column label="会员日" prop="memberDay" width="85" />
      <el-table-column label="开场时间限制" prop="timeLimit" width="110" />
      <el-table-column label="包含城市" width="110">
        <template #default="scope">
          <span>{{ scope.row.includeCityNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column label="排除城市" width="110">
        <template #default="scope">
          <span>{{ scope.row.excludeCityNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column label="星期几" width="90">
        <template #default="scope">
          <span>{{ scope.row.weekDay.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column label="座位数" prop="seatNum" width="90" />
      <el-table-column prop="includeCinemaNames" label="包含影院" width="110">
        <template #default="scope">
          <span>{{ scope.row.includeCinemaNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="excludeCinemaNames" label="排除影院" width="110">
        <template #default="scope">
          <span>{{ scope.row.excludeCinemaNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="includeHallNames" label="包含影厅" width="110">
        <template #default="scope">
          <span>{{ scope.row.includeHallNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="excludeHallNames" label="排除影厅" width="110">
        <template #default="scope">
          <span>{{ scope.row.excludeHallNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="includeFilmNames" label="包含影片" width="110">
        <template #default="scope">
          <span>{{ scope.row.includeFilmNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="excludeFilmNames" label="排除影片" width="110">
        <template #default="scope">
          <span>{{ scope.row.excludeFilmNames.join() }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="ruleStartTime" label="开始放映时间" width="110" />
      <el-table-column prop="ruleEndTime" label="结束放映时间" width="110" />
      <el-table-column label="操作" fixed="right" align="center" width="200">
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
          <!-- <el-button size="small" @click="viewDetails(scope.row)">详情</el-button> -->
        </template>
      </el-table-column>
    </el-table>
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

    <RuleDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveRule"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, toRaw } from "vue";
import svApi from "@/api/sv-api";
import { ElMessageBox, ElMessage } from "element-plus";
import RuleDialog from "@/components/RuleDialog.vue";
import { ORDER_FORM, APP_LIST } from "@/common/constant";
import { getCurrentFormattedDateTime } from "@/utils/utils";
import { useDataTableStore } from "@/store/offerRule";
const rules = useDataTableStore();

const tableData = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);
// 订单来源枚举
// 订单来源
const orderFormObj = ref(ORDER_FORM);
const shadowLineObj = APP_LIST;
// 报价类型枚举
const offerTypeObj = {
  1: "日常固定价",
  2: "会员价加价",
  3: "会员日报价"
};
// 表单查询数据
const formData = reactive({
  orderForm: "lieren", // 订单来源
  ruleName: "", // 规则名称
  shadowLineName: "", // 影线名称
  status: "", // 状态
  offerType: "", // 报价类型
  offerAmount: "", // 报价金额
  quanValue: "", // 用券面额
  weekDay: [], // 星期几
  seatNum: "" // 座位数
});

const judgeHandle = (arr, str) => {
  let tempArr = str.split(",");
  return tempArr.every(item => arr.join().indexOf(item) !== -1);
};
// 设置本地的规则列表
const setLocalRuleList = async () => {
  try {
    const ruleRes = await svApi.queryRuleList({
      status: "1"
    });
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
      item.weekDay = JSON.parse(item.weekDay);
    });
    rules.setRuleList(ruleRecords);
  } catch (error) {
    console.warn("查询规则列表时设置本地规则数据异常", error);
  }
};
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
      res = await svApi.getRuleList({ page_num, page_size });
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
      item.weekDay = JSON.parse(item.weekDay);
    });
    // console.log("规则列表===>", ruleRecords);
    tableData.value = ruleRecords;
    totalNum.value = res.data.totalNum || 0;
    setLocalRuleList();
  } catch (error) {
    console.warn("获取规则列表失败", error);
  }
};
searchData();
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

// 编辑规则
const editRule = (row, type) => {
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 保存规则
const saveRule = async ruleInfo => {
  try {
    ruleInfo = JSON.parse(JSON.stringify(ruleInfo));
    ruleInfo.includeCityNames = JSON.stringify(ruleInfo.includeCityNames);
    ruleInfo.excludeCityNames = JSON.stringify(ruleInfo.excludeCityNames);
    ruleInfo.includeCinemaNames = JSON.stringify(ruleInfo.includeCinemaNames);
    ruleInfo.excludeCinemaNames = JSON.stringify(ruleInfo.excludeCinemaNames);
    ruleInfo.includeHallNames = JSON.stringify(ruleInfo.includeHallNames);
    ruleInfo.excludeHallNames = JSON.stringify(ruleInfo.excludeHallNames);
    ruleInfo.includeFilmNames = JSON.stringify(ruleInfo.includeFilmNames);
    ruleInfo.excludeFilmNames = JSON.stringify(ruleInfo.excludeFilmNames);
    ruleInfo.weekDay = JSON.stringify(ruleInfo.weekDay);
    ruleInfo.update_time = getCurrentFormattedDateTime();
    if (ruleInfo.id) {
      console.log("编辑保存规则", ruleInfo);
      await svApi.updateRuleRecord(ruleInfo);
      sfcDialogRef.value.closeTck();
      searchData();
    } else {
      console.log("新增保存规则", ruleInfo);
      await svApi.addRuleRecord({ ...ruleInfo, id: undefined });
      sfcDialogRef.value.closeTck();
      searchData();
    }
  } catch (error) {
    console.warn("新增/编辑保存规则异常", error);
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
  formData.status = ""; // 状态
  formData.offerType = ""; // 报价类型
  formData.offerAmount = ""; // 报价金额
  formData.weekDay = []; // 星期几
  formData.seatNum = ""; // 座位数
  currentPage.value = 1;
  pageSize.value = 10;
};

// 处理选择变化
const handleSelectionChange = val => {
  console.log("选中变化", val);
  multipleSelection.value = val;
};

// 删除单行规则
const deleteRow = (index, row) => {
  ElMessageBox.confirm("确定要删除该规则吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      await svApi.deleteRule({ id: row.id });
      searchData();
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
</script>
