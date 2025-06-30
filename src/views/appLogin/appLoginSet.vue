<!-- 影院登录列表 -->
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
          <el-form-item label="所属账号">
            <el-input
              v-model="formData.mobile"
              placeholder="请输入所属账号(手机号)"
              clearable
            />
          </el-form-item>
          <el-form-item label="支持用户">
            <el-select
              v-model="formData.link_user_id"
              placeholder="支持用户"
              style="width: 194px"
              clearable
            >
              <el-option
                v-for="(item, inx) in userList"
                :key="inx"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="是否小号">
            <el-select
              v-model="formData.is_xiaohao"
              placeholder="是否小号"
              style="width: 194px"
              clearable
            >
              <el-option label="是" value="1" />
              <el-option label="否" value="2" />
            </el-select>
          </el-form-item>
          <el-form-item label="是否优先">
            <el-select
              v-model="formData.first"
              placeholder="是否优先"
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
                <span @click="addCard">新增</span>
              </template>
            </el-button>
            <el-button
              type="danger"
              :disabled="!hasSelected"
              @click="batchDelete"
              >批量删除</el-button
            >
            <el-button
              style="margin-left: 10px"
              type="primary"
              :loading="queryExpireLoading"
              @click="queryExpireLoginList"
              >查看登录失效影院</el-button
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
          <el-table-column type="selection" width="55" />
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
          <el-table-column prop="mobile" label="所属账号" min-width="120" />
          <el-table-column label="是否优先" min-width="90">
            <template #default="{ row: { first } }">
              <span>{{ first == "1" ? "是" : "否" }}</span>
            </template>
          </el-table-column>
          <el-table-column label="支持用户" min-width="85">
            <template #default="{ row: { link_user_id } }">
              <span>{{ formatUserName(link_user_id) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="是否小号" min-width="90">
            <template #default="{ row: { is_xiaohao } }">
              <span>{{ is_xiaohao == "1" ? "是" : "否" }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="session_id"
            label="Session ID"
            min-width="200"
          />
          <el-table-column prop="tid" label="续期tid" min-width="120" />
          <el-table-column
            prop="member_pwd"
            label="会员卡密码"
            min-width="95"
          />
          <el-table-column prop="remark" label="备注" min-width="80" />
          <el-table-column
            label="操作"
            fixed="right"
            align="center"
            min-width="210"
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
      </el-main>
    </el-container>

    <LoginDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      :userList="userList"
      @submit="saveCard"
    />

    <el-dialog v-model="exprieCinemaVisible" width="60%" title="失效影院列表">
      <el-table
        :data="exprieCinemaList"
        border
        style="width: 100%"
        max-height="400"
      >
        <el-table-column
          prop="app_type_name"
          sortable
          label="影线系列"
          width="180"
        />
        <el-table-column
          prop="app_label"
          sortable
          label="影线名称"
          width="180"
        />
        <el-table-column prop="mobile" sortable label="手机号" />
        <el-table-column prop="session_id" label="失效session" />
      </el-table>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="exportExpireList"> 导出 </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onBeforeMount, nextTick, watch } from "vue";
import svApi from "@/api/sv-api";
import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import LoginDialog from "@/components/LoginDialog.vue";
import {
  GET_APP_LIST,
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_CHENXING_LIST,
  GET_APP_TYPE_LIST,
  GET_USABLE_APP_LIST,
  GE_APP_INFO
} from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());
const UME_LIST = computed(() => GET_UME_LIST());
const H5_UME_LIST = computed(() => GET_H5_UME_LIST());
const CHENXING_LIST = computed(() => GET_CHENXING_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());

import { APP_API_OBJ } from "@/common/index.js";
import { getCurrentTime, mockDelay, createExcelDown } from "@/utils/utils";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();

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

// 用户列表
const userList = ref([]);

const tableData = ref([]);

const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);

// 表单查询数据
const formData = reactive({
  app_type: "",
  app_name: "",
  link_user_id: "",
  mobile: "",
  is_xiaohao: "",
  first: ""
});

formData.rule = rule;

// 树节点点击
const nodeClick = nodeData => {
  console.log("nodeData", nodeData);
  if (nodeData.id < 100) {
    formData.app_type = nodeData.value;
    formData.app_name = "";
  } else {
    formData.app_name = nodeData.value;
    formData.app_type = "";
  }
  searchData();
};
// 设置本地的登录信息列表
const setLocalLoginList = async () => {
  const loginRes = await svApi.queryLoginList({ rule });
  // console.log("ruleRes", ruleRes);
  let loginRecords = loginRes.data.loginList || [];
  loginRecords = loginRecords.map(item => ({
    app_name: item.app_name,
    mobile: item.mobile,
    session_id: item.session_id,
    tid: item.tid,
    member_pwd: item.member_pwd,
    first: item.first,
    is_xiaohao: item.is_xiaohao,
    link_user_id: item.link_user_id
  }));
  userInfoAndTokens.setLoginInfoList(
    loginRecords.filter(item => item.is_xiaohao != 1)
  );
  userInfoAndTokens.setAllLoginInfoList(loginRecords);
};

// 格式化支持用户
const formatUserName = link_user_id => {
  if (!link_user_id) return "全部";
  return userList.value.find(item => item.id == link_user_id)?.name;
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
    loading.close();
    setLocalLoginList();
  } catch (error) {
    loading.close();
    console.warn("获取登录信息列表失败", error);
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
    cardInfo.update_time = getCurrentTime();
    cardInfo.rule = rule;
    cardInfo.link_user_id = cardInfo.link_user_id || null;
    let targetInfo = APP_TYPE_LIST.value.find(item =>
      item.app_name_list.includes(cardInfo.app_name)
    );
    if (targetInfo) {
      cardInfo.app_type = targetInfo.app_type_code;
    }
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

const exprieCinemaVisible = ref(false);
const exprieCinemaList = ref([]);
const queryExpireLoading = ref(false);
// 查看登录失效影院列表
const queryExpireLoginList = async () => {
  try {
    queryExpireLoading.value = true;
    // 1、拿到全部登录信息列表进行可用影院过滤
    const loginRes = await svApi.queryLoginList({ rule });
    let loginRecords = loginRes.data.loginList || [];
    let loginInfoList = loginRecords.filter(itemA => {
      let checkUsable = GET_USABLE_APP_LIST()?.["" + itemA.app_name];
      return checkUsable && itemA.is_xiaohao != 1;
    });
    console.warn("loginInfoListt", loginInfoList);
    console.warn("全部手机号列表", [
      ...new Set(loginInfoList.map(itemA => itemA.mobile))
    ]);
    let abnormalLoginInfoList = [];
    for (let index = 0; index < loginInfoList.length; index++) {
      const { app_name, session_id, mobile } = loginInfoList[index];
      await getCardListByApp(
        app_name,
        mobile,
        session_id,
        index,
        abnormalLoginInfoList
      );
    }
    abnormalLoginInfoList = abnormalLoginInfoList.map(itemA => {
      let appInfo = GE_APP_INFO(itemA.app_name);
      return {
        ...itemA,
        app_label: appInfo?.app_label || "",
        app_type_name: appInfo?.app_type_name || ""
      };
    });
    console.warn("abnormalLoginInfoList", abnormalLoginInfoList);
    if (abnormalLoginInfoList.length) {
      exprieCinemaVisible.value = true;
      exprieCinemaList.value = abnormalLoginInfoList;
    } else {
      ElMessage({
        type: "info",
        message: "没有登录失效的影院"
      });
    }
    queryExpireLoading.value = false;
  } catch (error) {
    queryExpireLoading.value = false;
  }
};

// 导出失效列表
const exportExpireList = async () => {
  let tableData = exprieCinemaList.value.map(item => [
    item.app_type_name,
    item.app_label,
    item.mobile,
    item.session_id
  ]);
  tableData.unshift(["影线系列", "影线名称", "手机号", "失效session"]);
  let fileName = `登录失效影院列表.xlsx`;
  console.warn("tableData", tableData, "fileName", fileName);
  createExcelDown(tableData, fileName);
};
// 获取会员卡
const getCardListByApp = async (
  app_name,
  phone,
  session_id,
  index,
  abnormalLoginInfoList = []
) => {
  let params = {};
  try {
    if (UME_LIST.value.includes(app_name)) {
      params.params = {
        status: "CAN_USED",
        channelCode: "QD0000001",
        sysSourceCode: "YZ001"
        // cinemaCode: "11015502",
        // cinemaLinkId: "15953"
      };
      params.session_id = session_id;
    } else if (H5_UME_LIST.value.includes(app_name)) {
      params = {
        cinemaLinkId: GE_APP_INFO(app_name)?.cinemaLinkId,
        pageNo: 1,
        pageSize: 30,
        umeToken: session_id
      };
    } else if (CHENXING_LIST.value.includes(app_name)) {
      params = {
        session_id
      };
    } else if (app_name === "lma") {
      params.lmaToken = session_id;
    } else {
      // params.city_id = "500";
      // params.cinema_id = "1";
      params.session_id = session_id;
    }
    await mockDelay(H5_UME_LIST.value.includes(app_name) ? 1 : 0.01);
    if (index % 8) {
      await mockDelay(1);
    }
    await APP_API_OBJ[app_name].getCardList(params);
  } catch (err) {
    console.warn(app_name + "——获取会员卡列表异常", err, params);
    abnormalLoginInfoList.push({
      app_name,
      mobile: phone,
      session_id
    });
  }
};
onBeforeMount(async () => {
  const res = await svApi.getUserList();
  // console.log("res", res);
  let list = res.data.userList || [];
  // console.log("list", list);
  userList.value = list.filter(item => [9, 10].includes(item.id));
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
