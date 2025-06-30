<!-- 影院影院列表 -->
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
          <el-form-item label="状态">
            <el-select
              v-model="formData.status"
              placeholder="状态"
              style="width: 194px"
              clearable
            >
              <el-option
                v-for="(keyValue, keyName) in CINEMA_STATUS_OBJ"
                :key="keyName"
                :label="keyValue"
                :value="keyName"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button @click="resetForm">重置</el-button>
            <el-button type="primary" @click="searchData">搜索</el-button>
            <el-button type="primary" @click="addCard">新增</el-button>
            <el-button
              type="danger"
              :disabled="!hasSelected"
              @click="batchDelete"
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
          show-overflow-tooltip
          @selection-change="handleSelectionChange"
        >
          <el-table-column type="selection" width="55" />
          <el-table-column
            prop="app_label"
            label="影线名称"
            sortable
            min-width="150"
          />
          <el-table-column label="状态" min-width="90">
            <template #default="{ row: { status } }">
              <span>{{ CINEMA_STATUS_OBJ[status] }}</span>
            </template>
          </el-table-column>
          <el-table-column label="是否外用" min-width="90">
            <template #default="{ row: { is_out_use } }">
              <span>{{ is_out_use == 2 ? "否" : "是" }}</span>
            </template>
          </el-table-column>
          <el-table-column
            v-if="formData.app_type_code === 'chenxing_applet'"
            prop="api_version"
            label="api服务版本"
            min-width="110"
          />
          <el-table-column
            v-if="formData.app_type_code === 'sfc_applet'"
            prop="sfc_group_id"
            label="乐影影院groupID"
            min-width="140"
          />
          <el-table-column
            v-if="formData.app_type_code === 'sfc_applet'"
            prop="sfc_open_id"
            label="乐影影院openID"
            min-width="180"
          />
          <el-table-column
            v-if="formData.app_type_code === 'ume_h5'"
            prop="cinemaLinkId"
            label="凤凰云智影院id"
            min-width="100"
          />
          <el-table-column
            v-if="formData.app_type_code === 'ume_h5'"
            prop="channelCode"
            label="凤凰云智影院标识"
            min-width="210"
          />
          <el-table-column prop="remark" label="备注" min-width="100" />
          <el-table-column
            prop="update_time"
            label="更新时间"
            min-width="150"
          />
          <el-table-column
            label="操作"
            fixed="right"
            align="center"
            width="210"
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

    <CinemaDialog
      ref="sfcDialogRef"
      :dialogTitle="dialogTitle"
      @submit="saveCinema"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onBeforeMount, nextTick, watch } from "vue";
import svApi from "@/api/sv-api";
import { ElMessageBox, ElMessage, ElLoading } from "element-plus";
import CinemaDialog from "@/components/CinemaDialog.vue";
import {
  GET_ALL_APP_LIST,
  GET_ALL_APP_TYPE_LIST,
  CINEMA_STATUS_OBJ
} from "@/common/constant";
const APP_LIST = computed(() => GET_ALL_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_ALL_APP_TYPE_LIST());
import { getCurrentTime, mockDelay } from "@/utils/utils";
import { useCinemaList } from "@/store/cinemaList";
const useCinemaListObj = useCinemaList();
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
  app_type_code: "",
  app_name: "",
  status: "1"
});

// 树节点点击
const nodeClick = nodeData => {
  console.log("nodeData", nodeData);
  if (nodeData.id < 100) {
    formData.app_type_code = nodeData.value;
    formData.app_name = "";
  } else {
    formData.app_name = nodeData.value;
    formData.app_type_code = "";
  }
  searchData();
};
// 设置本地的影院信息列表
const setLocalCinemaList = async () => {
  const res = await svApi.queryCinemaList({});
  let cinemaList = res.data.cinemaList || [];
  useCinemaListObj.setCinemaInfoList(cinemaList);
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
    let res = await svApi.queryCinemaList({
      ...queryParams,
      page_num,
      page_size
    });
    let cinemaList = res.data.cinemaList || [];
    // console.log("影院信息列表===>", loginList);
    tableData.value = cinemaList;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
    setLocalCinemaList();
  } catch (error) {
    loading.close();
    console.warn("获取影院信息列表失败", error);
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

// 新增影院信息
const addCard = () => {
  dialogTitle.value = "新增";
  sfcDialogRef.value.open({ app_type_code: formData.app_type_code });
};

// 编辑影院信息
const editCard = (row, type) => {
  dialogTitle.value = type === "1" ? "编辑" : "复制新增";
  sfcDialogRef.value.open(type === "1" ? row : { ...row, id: "" });
};

// 保存影院信息
const saveCinema = async cinemaInfo => {
  try {
    cinemaInfo.update_time = getCurrentTime();
    // cardInfo.rule = rule;
    if (cinemaInfo.id) {
      console.log("编辑保存影院信息", cinemaInfo);
      await svApi.updateCinemaRecord(cinemaInfo);
      sfcDialogRef.value.closeTck();
      ElMessage.success("编辑成功！");
      searchData();
    } else {
      console.log("新增保存影院信息", cinemaInfo);
      await svApi.addCinemaRecord({ ...cinemaInfo, id: undefined });
      sfcDialogRef.value.closeTck();
      ElMessage.success("保存成功！");
      searchData();
    }
  } catch (error) {
    console.warn("新增/编辑保存影院信息异常", error);
  }
};

// 选中项
const multipleSelection = ref([]);
// 是否有选中项
const hasSelected = computed(() => multipleSelection.value.length > 0);

// 重置表单
const resetForm = () => {
  formData.status = "1";

  currentPage.value = 1;
  pageSize.value = 10;
};

// 处理选择变化
const handleSelectionChange = val => {
  console.log("选中变化", val);
  multipleSelection.value = val;
};

// 删除单行影院信息
const deleteRow = (index, row) => {
  ElMessageBox.confirm("确定要删除该影院信息吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      await svApi.deleteCinema({ id: row.id });
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
      `批量删除 ${multipleSelection.value.length} 条影院信息?`,
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
        await svApi.batchDeleteCinema({ delIds: ids });
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
onBeforeMount(async () => {
  await mockDelay(0.1);
  nextTick(() => {
    if (treeRef.value) {
      treeRef.value.setCurrentKey(1);
      formData.app_type_code = "ume_applet";
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
