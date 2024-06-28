<!-- 会员卡列表 -->
<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline">
      <el-form-item label="影线名称">
        <el-select
          v-model="formData.app_name"
          placeholder="影线名称"
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
      <el-form-item label="卡&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;ID">
        <el-input
          v-model="formData.card_id"
          placeholder="请输入卡ID"
          clearable
        />
      </el-form-item>
      <el-form-item
        label="卡&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;号"
      >
        <el-input
          v-model="formData.card_num"
          placeholder="请输入卡号"
          clearable
        />
      </el-form-item>
      <el-form-item label="目标余额">
        <el-input
          v-model="formData.balance"
          placeholder="请输入目标余额"
          clearable
        />
      </el-form-item>
      <el-form-item label="影院名称">
        <el-input
          v-model="formData.cinema_name"
          placeholder="请输入影院名称"
          clearable
        />
      </el-form-item>
      <el-form-item label="所属账号">
        <el-input
          v-model="formData.phone"
          placeholder="请输入所属账号(手机号)"
          clearable
        />
      </el-form-item>
      <el-form-item label="出票限制">
        <el-select
          v-model="formData.use_limit_day"
          placeholder="出票限制（当天）"
          clearable
          style="width: 194px"
        >
          <el-option
            v-for="(item, index) in 10"
            :key="index"
            :label="item"
            :value="item"
          />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
        <el-button type="primary" style="padding-left: 0px" @click="addCard">
          <template #default>
            <el-select
              v-model="shadowLine"
              filterable
              placeholder="影线名称"
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

        <el-button
          type="primary"
          style="padding-left: 0px"
          @click="syncBalance"
        >
          <template #default>
            <el-input
              v-model="phone"
              placeholder="所属账号(手机号)"
              clearable
              style="width: 150px; margin-left: -1px"
            />
            同步余额
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
      <el-table-column prop="app_name" fixed label="影线名称" width="110" />
      <el-table-column prop="app_name" fixed label="影院名称" width="110" />
      <el-table-column prop="app_name" fixed label="所属账号" width="110" />
      <el-table-column prop="app_name" fixed label="卡 余额" width="110" />
      <el-table-column prop="app_name" fixed label="卡 成本" width="110" />
      <el-table-column prop="app_name" fixed label="卡 密码" width="110" />
      <el-table-column prop="app_name" fixed label="出票限制" width="110" />
      <el-table-column label="操作" fixed="right" align="center" width="200">
        <template #default="scope">
          <el-button
            size="small"
            type="primary"
            @click="editCard(scope.row, '1')"
            >编辑</el-button
          >
          <el-button
            size="small"
            type="success"
            @click="editCard(scope.row, '2')"
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
    <!-- <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      style="margin-top: 10px; display: flex; justify-content: flex-end"
      :page-sizes="[10, 20, 30, 50]"
      :background="true"
      layout="total, sizes, prev, pager, next, jumper"
      :total="totalNum"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    /> -->

    <CardDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveCard"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import svApi from "@/api/sv-api";
import { ElMessageBox, ElMessage } from "element-plus";
import CardDialog from "@/components/CardDialog.vue";
import { APP_LIST } from "@/common/constant";
const tableData = ref([]);

const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);

// 表单查询数据
const formData = reactive({
  app_name: "",
  cinema_name: "",
  card_id: "",
  card_num: "",
  balance: "",
  use_limit_day: "",
  phone: ""
});

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
    // let page_num = currentPage.value;
    // let page_size = pageSize.value;
    if (JSON.stringify(queryParams) === "{}") {
      res = await svApi.getCardList();
    } else {
      res = await svApi.queryCardList({
        ...queryParams
        // page_num,
        // page_size
      });
    }
    let cardList = res.data.cardList || [];
    // console.log("卡列表===>", cardList);
    tableData.value = cardList;
    totalNum.value = res.data.totalNum || 0;
  } catch (error) {
    console.warn("获取卡列表失败", error);
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

// 同步余额
const syncBalance = async () => {
  try {
  } catch (error) {
    console.warn("同步余额异常", error);
  }
};

// 弹框实例
const sfcDialogRef = ref(null);
const dialogTitle = ref("新增");
const shadowLine = ref("");
const phone = ref("");

// 新增卡
const addCard = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ app_name: shadowLine.value });
};

// 编辑卡
const editCard = (row, type) => {
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 保存卡
const saveCard = async cardInfo => {
  try {
    if (cardInfo.id) {
      console.log("编辑保存卡", cardInfo);
      await svApi.updateCardRecord(cardInfo);
      sfcDialogRef.value.closeTck();
      searchData();
    } else {
      console.log("新增保存卡", cardInfo);
      await svApi.addCardRecord({ ...cardInfo, id: undefined });
      sfcDialogRef.value.closeTck();
      searchData();
    }
  } catch (error) {
    console.warn("新增/编辑保存卡异常", error);
  }
};

// 选中项
const multipleSelection = ref([]);
// 是否有选中项
const hasSelected = computed(() => multipleSelection.value.length > 0);

// 重置表单
const resetForm = () => {
  formData.app_name = "";
  formData.cinema_name = "";
  formData.card_id = "";
  formData.card_num = "";
  formData.balance = "";
  formData.use_limit_day = "";
  formData.phone = "";

  // currentPage.value = 1;
  // pageSize.value = 10;
};

// 处理选择变化
const handleSelectionChange = val => {
  console.log("选中变化", val);
  multipleSelection.value = val;
};

// 删除单行卡
const deleteRow = (index, row) => {
  ElMessageBox.confirm("确定要删除该卡吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      await svApi.deleteCard({ id: row.id });
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
      `批量删除 ${multipleSelection.value.length} 张卡?`,
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
        await svApi.batchDeleteCard({ delIds: ids });
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
