<!-- 券类型列表 -->
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
      <el-form-item label="券&nbsp;&nbsp;&nbsp;&nbsp;名称">
        <el-input
          v-model="formData.quan_name"
          placeholder="请输入券名称"
          clearable
        />
      </el-form-item>
      <el-form-item label="券&nbsp;&nbsp;&nbsp;&nbsp;类型">
        <el-input
          v-model="formData.quan_value"
          placeholder="请输入券类型"
          clearable
        />
      </el-form-item>
      <el-form-item label="券&nbsp;&nbsp;&nbsp;&nbsp;成本">
        <el-input
          v-model="formData.quan_cost"
          placeholder="请输入券成本"
          clearable
        />
      </el-form-item>
      <el-form-item label="券&nbsp;&nbsp;&nbsp;&nbsp;标识">
        <el-input
          v-model="formData.quan_flag"
          placeholder="请输入券标识"
          clearable
        />
      </el-form-item>
      <el-form-item label="券手续费">
        <el-input
          v-model="formData.quan_fee"
          placeholder="请输入券手续费"
          clearable
        />
      </el-form-item>
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
      <el-form-item label="外部可用">
        <el-select
          v-model="formData.is_outuse"
          placeholder="是否外部可用"
          style="width: 194px"
          clearable
        >
          <el-option label="是" value="1" />
          <el-option label="否" value="2" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button @click="resetForm">重置</el-button>
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button type="primary" style="padding-left: 0px">
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
            <span @click="addQuan">新增</span>
          </template>
        </el-button>
        <el-button type="danger" :disabled="!hasSelected" @click="batchDelete"
          >批量删除</el-button
        >
        <el-upload
          ref="uploadRef"
          style="margin-left: 15px"
          class="upload-demo"
          :limit="1"
          :on-change="importQuan"
          :before-upload="beforeUpload"
          action="#"
          accept=".xlsx, .xls"
          :auto-upload="false"
        >
          <template #trigger>
            <el-select
              v-model="quan_value"
              placeholder="用券类型"
              style="width: 194px; vertical-align: middle"
            >
              <el-option
                v-for="(item, index) in quanType"
                :key="item.id"
                :label="item.quan_name"
                :value="item.quan_value"
              />
            </el-select>
            <el-button type="primary">导入券</el-button>
          </template>
        </el-upload>
      </el-form-item>
    </el-form>

    <!-- 表格 -->
    <el-table
      ref="multipleTable"
      style="width: 100%"
      :data="tableData"
      border
      stripe
      max-height="450"
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
      <el-table-column prop="quan_name" label="券名称" min-width="100" />
      <el-table-column prop="quan_value" label="券类型" min-width="100" />
      <el-table-column prop="quan_cost" label="券成本" min-width="100" />
      <el-table-column prop="quan_flag" label="券标识" min-width="100" />
      <el-table-column prop="quan_fee" label="券手续费" min-width="100" />
      <el-table-column prop="is_store" label="是否入库" min-width="100">
        <template #default="{ row: { is_store } }">
          <span :class="{ red: is_store == 1 }">{{
            is_store == "1" ? "是 " : "否"
          }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="is_outuse" label="是否外部可用" min-width="110">
        <template #default="{ row: { is_outuse } }">
          <span :class="{ red: is_outuse == 1 }">{{
            is_outuse == "1" ? "是 " : "否"
          }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="black_quans" label="黑名单券" min-width="100" />
      <el-table-column prop="update_time" label="更新时间" min-width="160">
        <template #default="{ row }">
          <span>{{
            getCurrentFormattedDateTime(+new Date(row.update_time))
          }}</span>
        </template>
      </el-table-column>

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
  </div>
</template>

<script setup>
defineOptions({
  // name 作为一种规范最好必须写上并且和路由的name保持一致
  name: "QuanTypeManage"
});
import { ref, reactive, computed, onBeforeMount } from "vue";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import QuanDialog from "@/components/QuanDialog.vue";
import { APP_LIST } from "@/common/constant";
import {
  getCurrentFormattedDateTime,
  parseExcel,
  getCurrentDay
} from "@/utils/utils";
const tableData = ref([]);

const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);
const uploadRef = ref(null);
// 表单查询数据
const formData = reactive({
  app_name: "",
  quan_name: "",
  quan_value: "",
  quan_cost: "",
  quan_flag: "",
  quan_fee: "",
  is_store: "",
  is_outuse: ""
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
    // console.log("券类型列表===>", quanTypeList);
    tableData.value = quanTypeList;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
  } catch (error) {
    loading.close();
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

// 弹框实例
const sfcDialogRef = ref(null);
const dialogTitle = ref("新增");
const shadowLine = ref("");

// 新增券类型
const addQuan = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ app_name: shadowLine.value });
};

// 编辑券类型
const editQuan = (row, type) => {
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 保存券类型
const saveQuan = async cardInfo => {
  try {
    cardInfo.update_time = getCurrentFormattedDateTime();
    if (cardInfo.id) {
      console.log("编辑保存券类型", cardInfo);
      await svApi.updateQuanType(cardInfo);
      sfcDialogRef.value.closeTck();
      ElMessage.success("编辑成功！");
      searchData();
    } else {
      console.log("新增保存券类型", cardInfo);
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
  formData.quan_name = "";
  formData.quan_value = "";
  formData.quan_cost = "";
  formData.quan_flag = "";
  formData.quan_fee = "";
  formData.is_store = "";
  formData.is_outuse = "";

  currentPage.value = 1;
  pageSize.value = 10;
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
      await svApi.deleteQuanType({ id: row.id });
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

// 券类型列表
const quanType = ref([]);
// 券类型（下载模版使用）
const quan_value = ref("");

// 上传前钩子
const beforeUpload = () => {
  try {
    console.log("quan_value.value", quan_value.value);
    if (!quan_value.value) {
      ElMessage({
        type: "warn",
        message: "请先选择要导入的券类型"
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("导入券异常", error);
    return false;
  }
};

// 导入券
const importQuan = async (uploadFile, uploadFiles) => {
  const loading = ElLoading.service({
    lock: true,
    text: "上传中",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    console.log("uploadFile", uploadFile, uploadFiles);
    const res = await parseExcel(uploadFile.raw);
    console.warn("解析表格文件返回", res);
    if (res) {
      let tableDate = [...(res.header ?? []), ...res.content];
      console.warn("表格内容数据", tableDate);
      let quanTypeInfo = quanType.value.find(
        item => item.quan_value == quan_value.value
      );
      console.warn("要导入的券类型信息", quanTypeInfo);
      tableDate = tableDate
        .map(item => {
          return {
            app_name: quanTypeInfo.app_name,
            coupon_num: item[0]?.trim(),
            quan_value: quanTypeInfo.quan_value,
            quan_status: "1",
            create_time: getCurrentDay()
          };
        })
        .filter(item => item.coupon_num);
      console.warn("最终组装好要上传的数据", tableDate);
      await svApi.batchAddQuan({
        addList: tableDate
      });
      uploadRef.value?.clearFiles();
      loading.close();
      ElMessage({
        type: "success",
        message: "导入成功，请查询券库存检查"
      });
    }
  } catch (error) {
    console.error("导入券异常", error);
    loading.close();
    uploadRef.value?.clearFiles();
  }
};

// 获取券类型列表
const getQuanTypeList = async () => {
  try {
    const params = {
      is_store: "1",
      page_size: 100
    };
    const res = await svApi.queryQuanTypeList(params);
    let quanTypeList = res.data.quanTypeList || [];
    // console.log("券类型列表===>", quanTypeList);
    quanType.value = quanTypeList;
  } catch (error) {
    console.err("获取券类型列表异常", error);
  }
};
onBeforeMount(async () => {
  await getQuanTypeList();
});
</script>
<style scoped>
.red {
  color: red;
  font-weight: bold;
}
</style>
