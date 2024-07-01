<!-- 影院登录列表 -->
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
      <el-form-item label="所属账号">
        <el-input
          v-model="formData.mobile"
          placeholder="请输入所属账号(手机号)"
          clearable
        />
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
            <span @click="addCard">新增</span>
          </template>
        </el-button>
        <el-button type="danger" :disabled="!hasSelected" @click="batchDelete"
          >批量删除</el-button
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
      max-height="450"
      show-overflow-tooltip
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" />
      <el-table-column
        prop="app_name"
        label="影线名称"
        sortable
        min-width="100"
      >
        <template #default="{ row }">
          <span>{{ APP_LIST[row.app_name] }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="mobile" label="所属账号" min-width="90" />
      <el-table-column prop="session_id" label="Session ID" min-width="300" />
      <el-table-column prop="member_pwd" label="会员卡密码" min-width="70" />
      <el-table-column prop="remark" label="备注" min-width="80" />
      <el-table-column
        label="操作"
        fixed="right"
        align="center"
        min-width="150"
      >
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

    <LoginDialog
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
import LoginDialog from "@/components/LoginDialog.vue";
import { APP_LIST } from "@/common/constant";
import { getCurrentFormattedDateTime } from "@/utils/utils";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();

const tableData = ref([]);

const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);

// 表单查询数据
const formData = reactive({
  app_name: "",
  mobile: ""
});

// 设置本地的登录信息列表
const setLocalLoginList = async () => {
  const loginRes = await svApi.getLoginList();
  // console.log("ruleRes", ruleRes);
  let loginRecords = loginRes.data.loginList || [];
  loginRecords = loginRecords.map(item => ({
    app_name: item.app_name,
    mobile: item.mobile,
    session_id: item.session_id,
    member_pwd: item.member_pwd
  }));
  userInfoAndTokens.setLoginInfoList(loginRecords);
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
    console.log("queryParams", queryParams);
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    let res = await svApi.queryLoginList({
      ...queryParams,
      page_num,
      page_size
    });
    let loginList = res.data.loginList || [];
    // console.log("登录信息列表===>", loginList);
    tableData.value = loginList;
    totalNum.value = res.data.totalNum || 0;
    setLocalLoginList();
  } catch (error) {
    console.warn("获取登录信息列表失败", error);
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
const mobile = ref("");

// 新增登录信息
const addCard = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ app_name: shadowLine.value });
};

// 编辑登录信息
const editCard = (row, type) => {
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 保存登录信息
const saveCard = async cardInfo => {
  try {
    cardInfo.update_time = getCurrentFormattedDateTime();
    if (cardInfo.id) {
      console.log("编辑保存登录信息", cardInfo);
      await svApi.updateLoginRecord(cardInfo);
      sfcDialogRef.value.closeTck();
      ElMessage.success("编辑成功！");
      searchData();
    } else {
      console.log("新增保存登录信息", cardInfo);
      await svApi.addLoginRecord({ ...cardInfo, id: undefined });
      sfcDialogRef.value.closeTck();
      ElMessage.success("保存成功！");
      searchData();
    }
  } catch (error) {
    console.warn("新增/编辑保存登录信息异常", error);
  }
};

// 选中项
const multipleSelection = ref([]);
// 是否有选中项
const hasSelected = computed(() => multipleSelection.value.length > 0);

// 重置表单
const resetForm = () => {
  formData.app_name = "";
  formData.mobile = "";

  currentPage.value = 1;
  pageSize.value = 10;
};

// 处理选择变化
const handleSelectionChange = val => {
  console.log("选中变化", val);
  multipleSelection.value = val;
};

// 删除单行登录信息
const deleteRow = (index, row) => {
  ElMessageBox.confirm("确定要删除该登录信息吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      await svApi.deleteLogin({ id: row.id });
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
      `批量删除 ${multipleSelection.value.length} 条登录信息?`,
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
        await svApi.batchDeleteLogin({ delIds: ids });
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
