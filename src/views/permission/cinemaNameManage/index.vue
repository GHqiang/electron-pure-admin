<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="影线名称">
        <el-select
          v-model="formData.app_name"
          placeholder="请选择影线名称"
          style="width: 194px"
          clearable
          filterable
        >
          <el-option
            v-for="(keyValue, keyName) in APP_LIST"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="影院名称">
        <el-input
          v-model="formData.cinema_name"
          style="width: 210px"
          placeholder="请输入影院名称(可模糊搜索)"
          clearable
        />
      </el-form-item>
      <el-form-item label="特殊匹配名称">
        <el-input
          v-model="formData.special_name"
          style="width: 240px"
          placeholder="请输入特殊匹配名称(可模糊搜索)"
          clearable
        />
      </el-form-item>
      <el-form-item :label="`备&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;注`">
        <el-input
          v-model="formData.remark"
          placeholder="请输入备注(可模糊搜索)"
          clearable
        />
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
                v-for="(keyValue, keyName) in APP_LIST"
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
      <el-table-column prop="app_name" fixed label="影线名称" min-width="110">
        <template #default="scope">
          <span>{{ APP_LIST[scope.row.app_name] }}</span>
        </template>
      </el-table-column>
      <el-table-column
        label="影院名称"
        prop="cinema_name"
        fixed
        min-width="160"
      />
      <!-- 做个换行展示 -->
      <el-table-column label="特殊匹配名称" prop="special_name" min-width="190">
        <template #default="scope">
          <span>{{ scope.row.special_name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="update_time" label="更新时间" min-width="135" />
      <el-table-column prop="city_name" label="城市" min-width="80" />
      <el-table-column prop="remark" label="备注" min-width="70" />
      <el-table-column label="操作" fixed="right" align="left" min-width="170">
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
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      style="margin-top: 10px; display: flex; justify-content: flex-end"
      :page-sizes="[10, 30, 50, 100]"
      :background="true"
      layout="total, sizes, prev, pager, next, jumper"
      :total="totalNum"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />

    <SpecialNameDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveRule"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, toRaw, onBeforeMount } from "vue";
import svApi from "@/api/sv-api";
import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import SpecialNameDialog from "@/components/SpecialNameDialog.vue";
import { GET_APP_LIST } from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());

import { getCurrentTime } from "@/utils/utils";
import { useDataTableStoreBySpecialName } from "@/store/specialNameRule";
const specialRules = useDataTableStoreBySpecialName();

const tableData = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);

// 表单查询数据
const formData = reactive({
  app_name: "", // 影线名称
  cinema_name: "", // 影院名称
  special_name: "", // 特殊匹配
  remark: "" // 备注
});

// 设置本地的特殊匹配列表
const setLocalSpecialMatchList = async () => {
  try {
    const ruleRes = await svApi.querySpecialNameList();
    // console.log("ruleRes", ruleRes);
    let ruleRecords = ruleRes.data.list || [];
    specialRules.setRuleList(ruleRecords);
  } catch (error) {
    console.warn("查询规则列表时设置本地规则数据异常", error);
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
    let res = await svApi.querySpecialNameList({
      ...queryParams,
      page_num,
      page_size
    });
    let ruleRecords = res.data.list || [];
    // console.log("规则列表===>", ruleRecords);
    tableData.value = ruleRecords;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
    setLocalSpecialMatchList();
  } catch (error) {
    loading.close();
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
  sfcDialogRef.value.open({ app_name: shadowLine.value });
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
    ruleInfo.update_time = getCurrentTime();
    if (ruleInfo.id) {
      console.log("编辑保存规则", ruleInfo);
      await svApi.updateSpecialNameRecord(ruleInfo);
      sfcDialogRef.value.closeTck();
      searchData();
    } else {
      console.log("新增保存规则", ruleInfo);
      await svApi.addSpecialNameRecord({ ...ruleInfo, id: undefined });
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
  formData.app_name = ""; // 影线名称
  formData.cinema_name = "";
  formData.special_name = "";
  formData.remark = ""; // 备注
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
  ElMessageBox.confirm("确定要删除该记录吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      await svApi.deleteSpecialName({ id: row.id });
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
      `批量删除 ${multipleSelection.value.length} 条记录?`,
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
        await svApi.batchDeleteSpecialName({ delIds: ids });
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

onBeforeMount(async () => {});
</script>
