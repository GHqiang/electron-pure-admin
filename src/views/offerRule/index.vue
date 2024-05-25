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
        <el-input
          v-model="formData.shadowLineName"
          placeholder="请输入影线名称"
          clearable
        />
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
      <template v-if="isCollapse">
        <el-form-item label="包含城市">
          <el-input
            v-model="formData.includeCityNames"
            placeholder="请输入包含城市"
            clearable
          />
        </el-form-item>
        <el-form-item label="排除城市">
          <el-input
            v-model="formData.excludeCityNames"
            placeholder="请输入排除城市"
            clearable
          />
        </el-form-item>
        <el-form-item label="包含影院">
          <el-input
            v-model="formData.includeCinemaNames"
            placeholder="请输入包含影院"
            clearable
          />
        </el-form-item>
        <el-form-item label="排除影院">
          <el-input
            v-model="formData.excludeCinemaNames"
            placeholder="请输入排除影院"
            clearable
          />
        </el-form-item>
        <el-form-item label="包含影厅">
          <el-input
            v-model="formData.includeHallNames"
            placeholder="请输入包含影厅"
            clearable
          />
        </el-form-item>
        <el-form-item label="排除影厅">
          <el-input
            v-model="formData.excludeHallNames"
            placeholder="请输入排除影厅"
            clearable
          />
        </el-form-item>
        <el-form-item label="包含影片">
          <el-input
            v-model="formData.includeFilmNames"
            placeholder="请输入包含影片"
            clearable
          />
        </el-form-item>
        <el-form-item label="排除影片">
          <el-input
            v-model="formData.excludeFilmNames"
            placeholder="请输入排除影片"
            clearable
          />
        </el-form-item>
      </template>

      <el-form-item>
        <el-button type="primary" @click="isCollapse = !isCollapse">{{
          !isCollapse ? "展开" : "收起"
        }}</el-button>
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
        <el-button type="primary" @click="addRule" style="padding-left: 0px">
          <template #default>
            <el-select
              v-model="shadowLine"
              placeholder="请选择影线名称"
              style="width: 120px; margin-left: -1px"
            >
              <el-option
                v-for="item in shadowLineList"
                :key="item.value"
                :label="item.label"
                :value="item.value"
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
    <div style="margin-bottom: 15px"></div>

    <!-- 表格 -->
    <el-table
      ref="multipleTable"
      style="width: 100%"
      :data="tableDataFilter"
      border
      stripe
      show-overflow-tooltip
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" fixed width="55" />
      <el-table-column prop="ruleName" fixed label="规则名称" width="110" />
      <el-table-column prop="orderForm" fixed label="订单来源" width="90">
        <template #default="scope">
          <span>{{ orderFormObj[scope.row.orderForm] }}</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="shadowLineName"
        fixed
        label="影线名称"
        width="90"
      />
      <el-table-column label="状态" fixed width="60">
        <template #default="scope">
          <span>{{ scope.row.status === "1" ? "正常" : "禁用" }}</span>
        </template>
      </el-table-column>
      <el-table-column label="报价类型" fixed width="100">
        <template #default="scope">
          <span>{{ offerTypeObj[scope.row.offerType] || "" }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="用券面额"
        prop="quanValue"
        fixed
        width="90"
      ></el-table-column>
      <el-table-column
        label="报价金额"
        prop="offerAmount"
        fixed
        width="90"
      ></el-table-column>
      <el-table-column
        label="加价金额"
        prop="addAmount"
        fixed
        width="90"
      ></el-table-column>
      <el-table-column
        label="会员日"
        prop="memberDay"
        width="100"
      ></el-table-column>
      <el-table-column
        label="开场时间限制"
        prop="timeLimit"
        width="110"
      ></el-table-column>
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
      <el-table-column
        label="座位数"
        prop="seatNum"
        width="90"
      ></el-table-column>
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
    <SfcRuleDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveRule"
    ></SfcRuleDialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, toRaw } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";
import SfcRuleDialog from "@/components/SfcRuleDialog.vue";
import { ORDER_FORM } from "@/common/constant";
import { useDataTableStore } from "@/store/offerRule";
const dataTableStore = useDataTableStore();
dataTableStore.fetchItemsFromLocalStorage();
const { addItem, updateItem, deleteItem, batchDeleteItem } = dataTableStore;
// 使用computed确保items响应式
const tableData = computed(() => dataTableStore.items);

// 是否展开
const isCollapse = ref(false);
// 订单来源枚举
// 订单来源
const orderFormObj = ref(ORDER_FORM);

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
  shadowLineName: "sfc", // 影线名称
  status: "", // 状态
  offerType: "", // 报价类型
  offerAmount: "", // 报价金额
  quanValue: "", // 用券面额
  weekDay: [], // 星期几
  seatNum: "", // 座位数
  includeCityNames: "", // 包含城市
  excludeCityNames: "", // 排除城市
  includeCinemaNames: "", // 包含影院
  excludeCinemaNames: "", // 排除影院
  includeHallNames: "", // 包含影厅
  excludeHallNames: "", // 排除影厅
  includeFilmNames: "", // 包含影片
  excludeFilmNames: "" // 排除影片
});

// 搜索过滤后的数据
const tableDataFilter = ref([]);

const judgeHandle = (arr, str) => {
  let tempArr = str.split(",");
  return tempArr.every(item => arr.join().indexOf(item) !== -1);
};
// 搜索数据
const searchData = () => {
  console.log("tableData==>", toRaw(tableData.value));
  tableDataFilter.value = tableData.value.filter(item => {
    const {
      orderForm,
      ruleName,
      shadowLineName,
      status,
      offerType,
      quanValue,
      offerAmount,
      seatNum, // 座位数
      weekDay, // 星期几
      includeCityNames,
      excludeCityNames,
      includeCinemaNames,
      excludeCinemaNames,
      includeHallNames,
      excludeHallNames,
      includeFilmNames,
      excludeFilmNames
    } = formData;
    let judge0 = orderForm ? item.orderForm === orderForm : true;
    let judge1 = shadowLineName ? item.shadowLineName === shadowLineName : true;
    let judge2 = ruleName ? item.ruleName.indexOf(ruleName) !== -1 : true;
    let judge3 = includeCityNames
      ? judgeHandle(item.includeCityNames, includeCityNames)
      : true;
    let judge4 = excludeCityNames
      ? judgeHandle(item.excludeCityNames, excludeCityNames)
      : true;
    let judge5 = includeCinemaNames
      ? judgeHandle(item.includeCinemaNames, includeCinemaNames)
      : true;
    let judge6 = excludeCinemaNames
      ? judgeHandle(item.excludeCinemaNames, excludeCinemaNames)
      : true;
    let judge7 = includeHallNames
      ? judgeHandle(item.includeHallNames, includeHallNames)
      : true;
    let judge8 = excludeHallNames
      ? judgeHandle(item.excludeHallNames, excludeHallNames)
      : true;
    let judge9 = includeFilmNames
      ? judgeHandle(item.includeFilmNames, includeFilmNames)
      : true;
    let judge10 = excludeFilmNames
      ? judgeHandle(item.excludeFilmNames, excludeFilmNames)
      : true;
    let judge11 = quanValue ? item.quanValue === quanValue : true;
    let judge12 = status ? item.status === status : true;
    let judge13 = offerType ? item.offerType === offerType : true;
    let judge14 = offerAmount ? item.offerAmount === offerAmount : true;
    let judge15 = seatNum ? item.seatNum === seatNum : true;
    let judge16 = weekDay
      ? weekDay.every(itemW => item.weekDay.includes(itemW))
      : true;
    return (
      judge0 &&
      judge1 &&
      judge2 &&
      judge3 &&
      judge4 &&
      judge5 &&
      judge6 &&
      judge7 &&
      judge8 &&
      judge9 &&
      judge10 &&
      judge11 &&
      judge12 &&
      judge13 &&
      judge14 &&
      judge15 &&
      judge16
    );
  });
  let list = JSON.parse(JSON.stringify(tableDataFilter.value));
  console.log("tableDataFilter===>", list);
};
searchData();

// sfc弹框实例
const sfcDialogRef = ref(null);
const dialogTitle = ref("新增");
const shadowLineList = ref([
  { value: "sfc", label: "sfc" },
  { value: "选项2", label: "影线2" },
  { value: "选项3", label: "影线3" }
]);
const shadowLine = ref("sfc");

// 新增规则
const addRule = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open();
};

// 编辑规则
const editRule = (row, type) => {
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 保存规则
const saveRule = ruleInfo => {
  ruleInfo = toRaw(ruleInfo);
  ruleInfo = JSON.parse(JSON.stringify(ruleInfo));
  if (ruleInfo.id) {
    console.log("编辑保存规则", ruleInfo);
    let inx = tableDataFilter.value.findIndex(item => item.id === ruleInfo.id);
    console.log("inx", inx);
    if (inx !== -1) {
      updateItem(inx, ruleInfo);
      searchData();
    }
  } else {
    console.log("新增保存规则", ruleInfo);
    let id = 1;
    if (tableData.value.length) {
      id = tableData.value[tableData.value.length - 1].id + 1;
    }
    addItem({ ...ruleInfo, id });
    searchData();
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
  formData.includeCityNames = ""; // 包含城市
  formData.excludeCityNames = ""; // 排除城市
  formData.includeCinemaNames = ""; // 包含影院
  formData.excludeCinemaNames = ""; // 排除影院
  formData.includeFilmNames = ""; // 包含影片
  formData.excludeFilmNames = ""; // 排除影片
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
    .then(() => {
      let inx = tableDataFilter.value.findIndex(item => item.id === row.id);
      if (inx !== -1) {
        deleteItem(inx);
        searchData();
      }
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
      .then(() => {
        let ids = multipleSelection.value.map(item => item.id);
        console.log("ids===>", ids);
        batchDeleteItem(ids);
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
