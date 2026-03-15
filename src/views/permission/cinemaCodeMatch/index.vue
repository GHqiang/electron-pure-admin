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
          <el-form-item label="平台影院code">
            <el-input
              v-model="formData.plat_cinema_code"
              placeholder="请输入平台影院code"
              clearable
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="searchData">搜索</el-button>
            <el-button
              type="primary"
              :loading="syncLoading"
              @click="syncCinemeCodeMatch()"
              >同步映射信息</el-button
            >

            <el-button
              type="primary"
              :loading="exportLoading"
              @click="exportCinemeCodeMatch"
              >导出映射维护信息</el-button
            >
            <el-button
              v-if="IN_RULE_LIST.includes(rule)"
              type="primary"
              @click="checkCinemaUpdate"
            >
              检查影院变更
            </el-button>
            <el-button
              v-if="IN_RULE_LIST.includes(rule)"
              type="primary"
              @click="openAddDialog"
            >
              手动新增
            </el-button>
            <el-upload
              v-if="IN_RULE_LIST.includes(rule)"
              ref="uploadRef"
              style="margin: 0 15px"
              class="upload-demo"
              :limit="1"
              :on-change="importCinemaMatch"
              action="#"
              accept=".xlsx, .xls"
              :auto-upload="false"
            >
              <template #trigger>
                <el-button type="primary">导入映射维护信息</el-button>
              </template>
            </el-upload>
            <el-button
              v-if="IN_RULE_LIST.includes(rule)"
              type="primary"
              style="padding-left: 0px"
              :disabled="!shadowLine"
              @click="deleteCinemeCodeMatch"
            >
              <template #default>
                <el-cascader
                  v-model="shadowLine"
                  :options="appCascaderOptions"
                  :props="appCascaderProps"
                  filterable
                  clearable
                  placeholder="请选择影线"
                  style="width: 210px; margin-left: -1px"
                />
                &nbsp;&nbsp;删除
              </template>
            </el-button>
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
        >
          <el-table-column
            v-if="!formData.app_name"
            prop="app_label"
            label="影线名称"
            sortable
            min-width="120"
          />
          <el-table-column
            prop="app_cinema_name"
            label="影院名称"
            min-width="180"
          />
          <el-table-column
            prop="app_cinema_code"
            label="影院唯一标识"
            min-width="100"
          />
          <el-table-column
            prop="plat_cinema_code"
            label="平台影院编码"
            min-width="100"
          />
          <el-table-column
            v-if="IN_RULE_LIST.includes(rule)"
            prop="plat_cinema_name"
            label="平台影院名称"
            min-width="100"
          />
          <el-table-column
            v-if="IN_RULE_LIST.includes(rule)"
            prop="update_time"
            label="更新时间"
            min-width="120"
          />
          <el-table-column
            v-if="IN_RULE_LIST.includes(rule)"
            label="操作"
            fixed="right"
            align="center"
            width="160"
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
                type="warning"
                @click="deleteRow(scope.row)"
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

    <CinemaMatchDialog ref="sfcDialogRef" @submit="saveCinema" />

    <!-- 手动新增影院映射 -->
    <el-dialog
      v-model="addDialogVisible"
      title="手动新增影院映射"
      width="520px"
      :close-on-click-modal="false"
      @close="resetAddForm"
    >
      <el-form
        ref="addFormRef"
        :model="addForm"
        :rules="addFormRules"
        label-width="120px"
      >
        <el-form-item label="影线" prop="app_name">
          <el-cascader
            v-model="addForm.app_name"
            :options="appCascaderOptions"
            :props="appCascaderProps"
            filterable
            clearable
            style="width: 100%"
            placeholder="请选择影线"
            @change="onAddFormAppChange"
          />
        </el-form-item>
        <el-form-item label="影院名称" prop="app_cinema_name">
          <el-input
            v-model="addForm.app_cinema_name"
            placeholder="请输入影院名称"
            clearable
          />
        </el-form-item>
        <el-form-item label="影院唯一标识" prop="app_cinema_code">
          <el-input
            v-model="addForm.app_cinema_code"
            placeholder="如 city_id_cinema_id 或 cinema_code"
            clearable
          />
        </el-form-item>
        <el-form-item label="平台影院编码" prop="plat_cinema_code">
          <el-input
            v-model="addForm.plat_cinema_code"
            placeholder="请输入平台影院编码"
            clearable
          />
        </el-form-item>
        <el-form-item label="平台影院名称" prop="plat_cinema_name">
          <el-input
            v-model="addForm.plat_cinema_name"
            type="textarea"
            :rows="2"
            placeholder="选填，多个用#分隔"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="addSubmitLoading"
          @click="submitAddCinema"
        >
          确定新增
        </el-button>
      </template>
    </el-dialog>

    <!-- 影院变更结果弹框：新增（可同步 / 需导出）、删除 -->
    <el-dialog
      v-model="diffDialogVisible"
      title="影院变更结果"
      width="900px"
      destroy-on-close
    >
      <div v-if="diffNewSyncList.length">
        <div style="margin-bottom: 8px; font-weight: 600">
          可自动同步的新增影院（{{ diffNewSyncList.length }} 条）
          <el-button
            size="small"
            type="primary"
            style="margin-left: 12px"
            @click="handleSyncNewCinema"
          >
            执行新增同步
          </el-button>
          <el-button
            size="small"
            text
            style="margin-left: 8px"
            @click="handleSelectAll('newSync')"
          >
            全选
          </el-button>
          <el-button size="small" text @click="handleClearSelection('newSync')">
            全不选
          </el-button>
        </div>
        <el-table
          ref="diffNewSyncTableRef"
          :data="diffNewSyncList"
          size="small"
          border
          max-height="200"
          @selection-change="rows => (selectedNewSyncList = rows)"
        >
          <el-table-column type="selection" width="50" />
          <el-table-column prop="app_label" label="影线名称" min-width="120" />
          <el-table-column
            prop="app_cinema_name"
            label="影院名称"
            min-width="180"
          />
          <el-table-column
            prop="app_cinema_code"
            label="影院唯一标识"
            min-width="140"
          />
          <el-table-column
            prop="app_type_name"
            label="应用类型"
            min-width="120"
          />
        </el-table>
      </div>

      <div v-if="diffNewManualList.length" style="margin-top: 16px">
        <div style="margin-bottom: 8px; font-weight: 600">
          需导出维护后再导入的新增影院（{{ diffNewManualList.length }} 条）
          <el-button
            size="small"
            type="primary"
            style="margin-left: 12px"
            @click="handleExportManualNew"
          >
            导出维护模板
          </el-button>
          <el-button
            size="small"
            text
            style="margin-left: 8px"
            @click="handleSelectAll('newManual')"
          >
            全选
          </el-button>
          <el-button
            size="small"
            text
            @click="handleClearSelection('newManual')"
          >
            全不选
          </el-button>
        </div>
        <el-table
          ref="diffNewManualTableRef"
          :data="diffNewManualList"
          size="small"
          border
          max-height="200"
          @selection-change="rows => (selectedNewManualList = rows)"
        >
          <el-table-column type="selection" width="50" />
          <el-table-column prop="app_label" label="影线名称" min-width="120" />
          <el-table-column
            prop="app_cinema_name"
            label="影院名称"
            min-width="180"
          />
          <el-table-column
            prop="app_cinema_code"
            label="影院唯一标识"
            min-width="140"
          />
          <el-table-column
            prop="app_type_name"
            label="应用类型"
            min-width="120"
          />
        </el-table>
        <p style="margin-top: 6px; color: #999; font-size: 12px">
          提示：导出后请在 Excel 中填写平台影院编码 plat_cinema_code，
          然后使用上方「导入映射维护信息」按钮导入即可。
        </p>
      </div>

      <div v-if="diffDeleteList.length" style="margin-top: 16px">
        <div style="margin-bottom: 8px; font-weight: 600">
          可删除的影院映射（{{ diffDeleteList.length }} 条）
          <el-button
            size="small"
            type="danger"
            style="margin-left: 12px"
            @click="handleDeleteCinemaMatch"
          >
            删除这些映射
          </el-button>
          <el-button
            size="small"
            text
            style="margin-left: 8px"
            @click="handleSelectAll('delete')"
          >
            全选
          </el-button>
          <el-button size="small" text @click="handleClearSelection('delete')">
            全不选
          </el-button>
        </div>
        <el-table
          ref="diffDeleteTableRef"
          :data="diffDeleteList"
          size="small"
          border
          max-height="200"
          @selection-change="rows => (selectedDeleteList = rows)"
        >
          <el-table-column type="selection" width="50" />
          <el-table-column prop="app_label" label="影线名称" min-width="120" />
          <el-table-column
            prop="app_cinema_name"
            label="影院名称"
            min-width="180"
          />
          <el-table-column
            prop="app_cinema_code"
            label="影院唯一标识"
            min-width="140"
          />
        </el-table>
      </div>

      <template #footer>
        <el-button @click="diffDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
defineOptions({
  name: "CinemaCodeMatch"
});
import { ref, reactive, computed, onBeforeMount, nextTick, watch } from "vue";
import svApi from "@/api/sv-api";
import { ElMessage, ElLoading, ElMessageBox } from "element-plus";
import CinemaMatchDialog from "@/components/CinemaMatchDialog.vue";
import {
  GET_APP_LIST,
  GET_APP_TYPE_LIST,
  GET_APP_INFO,
  IN_RULE_LIST,
  SYNC_CINEMA_CODE_APP_TYPE_LIST
} from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());
import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();
// 影院基础方法
import useCinemaBaseFun from "@/mixins/useCinemaBaseFun";
const { getCityList, getAllCinemaList } = useCinemaBaseFun();
import {
  getCurrentTime,
  mockDelay,
  createExcelDown,
  parseExcel,
  getCinemaLoginInfoList
} from "@/utils/utils";
import { useCinemaCodeMatchList } from "@/store/specialNameRule";
import { useCinemaList } from "@/store/cinemaList";
const cinemaCodeMatchObj = useCinemaCodeMatchList();
const cinemaListStore = useCinemaList();
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

const tableData = ref([]);

const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);

// 影院变更结果弹框
const diffDialogVisible = ref(false);
const diffNewSyncList = ref([]);
const diffNewManualList = ref([]);
const diffDeleteList = ref([]);

// 影院变更结果表格多选
const diffNewSyncTableRef = ref(null);
const diffNewManualTableRef = ref(null);
const diffDeleteTableRef = ref(null);
const selectedNewSyncList = ref([]);
const selectedNewManualList = ref([]);
const selectedDeleteList = ref([]);

// 手动新增
const addDialogVisible = ref(false);
const addFormRef = ref(null);
const addSubmitLoading = ref(false);
const addForm = reactive({
  app_name: "",
  app_cinema_name: "",
  app_cinema_code: "",
  plat_cinema_code: "",
  plat_cinema_name: ""
});
const addFormRules = {
  app_name: [{ required: true, message: "请选择影线", trigger: "change" }],
  app_cinema_name: [
    { required: true, message: "请输入影院名称", trigger: "blur" }
  ],
  app_cinema_code: [
    { required: true, message: "请输入影院唯一标识", trigger: "blur" }
  ],
  plat_cinema_code: [
    { required: true, message: "请输入平台影院编码", trigger: "blur" }
  ]
};

// 弹框表格全选 / 全不选
const handleSelectAll = type => {
  let listRef = null;
  let tableRef = null;
  let selectedRef = null;
  if (type === "newSync") {
    listRef = diffNewSyncList;
    tableRef = diffNewSyncTableRef;
    selectedRef = selectedNewSyncList;
  } else if (type === "newManual") {
    listRef = diffNewManualList;
    tableRef = diffNewManualTableRef;
    selectedRef = selectedNewManualList;
  } else if (type === "delete") {
    listRef = diffDeleteList;
    tableRef = diffDeleteTableRef;
    selectedRef = selectedDeleteList;
  }
  if (!tableRef?.value || !listRef?.value) return;
  tableRef.value.clearSelection();
  listRef.value.forEach(row => {
    tableRef.value.toggleRowSelection(row, true);
  });
  selectedRef.value = [...listRef.value];
};

const handleClearSelection = type => {
  let tableRef = null;
  let selectedRef = null;
  if (type === "newSync") {
    tableRef = diffNewSyncTableRef;
    selectedRef = selectedNewSyncList;
  } else if (type === "newManual") {
    tableRef = diffNewManualTableRef;
    selectedRef = selectedNewManualList;
  } else if (type === "delete") {
    tableRef = diffDeleteTableRef;
    selectedRef = selectedDeleteList;
  }
  if (!tableRef?.value) return;
  tableRef.value.clearSelection();
  selectedRef.value = [];
};

// 表单查询数据
const formData = reactive({
  app_type_code: "",
  app_name: "",
  plat_cinema_code: ""
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
// 设置本地的影院映射信息列表
const setLocalCinemaList = async () => {
  const res = await svApi.queryCinemaMatchList({});
  let cinemaList = res.data.cinemaList || [];
  cinemaCodeMatchObj.setCinemaCodeMatchList(cinemaList);
};

// 获取某个影线的全部影院列表
const getCinemaList = async app_name => {
  console.log("获取某个影线的全部影院列表", app_name);
  const allCityList = await getCityList(app_name);
  let allCinemaList = [];
  if (allCityList?.length) {
    allCinemaList = await getAllCinemaList(app_name, allCityList);
  } else {
    console.warn("获取城市列表异常", app_name);
  }
  return allCinemaList || [];
};

const shadowLine = ref("");
// 删除
const deleteCinemeCodeMatch = () => {
  ElMessageBox.confirm("确定要删除该影院映射吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      console.warn("app_name", shadowLine.value);
      await svApi.deleteCinemaMatch({ app_name: shadowLine.value });
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

const syncLoading = ref(false);

// 测试同步影院映射是否有出入
const testSyncCinemaCodeMatch = async () => {
  try {
    // 1、先获取库里凤凰新的映射维护列表
    const res = await svApi.queryCinemaMatchList({});
    let cinemaList = res.data.cinemaList || [];
    cinemaList = cinemaList.filter(
      item => item.app_type_code === "fenghuang_applet"
    );
    console.warn("获取凤凰映射维护列表", cinemaList);
    let asyncAppNamList = cinemaList.map(item => item.app_name);
    asyncAppNamList = [...new Set(asyncAppNamList)];
    console.warn("asyncAppNamList", asyncAppNamList);
    // 2、那这些影院组装数据
    // 组装映射同步数据
    let syncList = [];
    for (let i = 0; i < asyncAppNamList.length; i++) {
      let app_name = asyncAppNamList[i],
        app_type_code = "fenghuang_applet";
      let list = await getCinemaList(app_name);
      // console.warn("getCinemaList", list);
      const appInfo = GET_APP_INFO(app_name);
      list = list.map(item => {
        let app_cinema_code = item.cinema_code;
        // 除以下2种外没有cinema_code，用city_id+id组合当唯一标识
        if (!SYNC_CINEMA_CODE_APP_TYPE_LIST.includes(app_type_code)) {
          app_cinema_code = item.city_id + "_" + item.cinema_id;
        }
        return {
          app_label: appInfo.app_label,
          app_name: appInfo.app_name,
          app_type_code: appInfo.app_type_code,
          app_type_name: appInfo.app_type_name,
          app_cinema_name: item.cinema_name,
          app_cinema_code,
          plat_cinema_code: item.cinema_code || "" // 没值就为空，导出维护
        };
      });
      syncList = syncList.concat(list);
    }
    console.warn("组装好的同步映射列表数据syncList", syncList);
    // 3、进行对比找出不一致的
    let noSomeList = cinemaList.filter(
      item =>
        !syncList.some(
          itemA =>
            itemA.app_cinema_name == item.app_cinema_name &&
            itemA.app_cinema_code == item.app_cinema_code
        )
    );
    let noSomeList1 = syncList.filter(
      item =>
        !cinemaList.some(
          itemA =>
            itemA.app_cinema_name == item.app_cinema_name &&
            itemA.app_cinema_code == item.app_cinema_code
        )
    );
    console.warn("noSomeList", noSomeList);
    console.warn("noSomeList1", noSomeList1);
  } catch (error) {}
};
window.testSyncCinemaCodeMatch = testSyncCinemaCodeMatch;

// 同步影院code映射
const syncCinemeCodeMatch = async isExport => {
  try {
    if (!isExport) {
      syncLoading.value = true;
    }
    // 1、获取未同步的影院列表
    const cinemaListRes = await svApi.queryNoSyncCinemaList({});
    let cinemaList = cinemaListRes?.data?.cinemaList || [];
    cinemaList = cinemaList.filter(item => item.status != 3);
    let loginInfoList = getCinemaLoginInfoList().filter(
      itemA => itemA.session_id
    );
    console.warn("loginInfoList", loginInfoList, cinemaList);
    cinemaList = cinemaList.filter(item =>
      loginInfoList.find(itemA => itemA.app_name == item.app_name)
    );
    console.warn("获取未同步的影院列表", cinemaList);

    // 2、获取可以同步的影院列表
    let syncCinemaList = cinemaList.filter(item => {
      let isInclude = SYNC_CINEMA_CODE_APP_TYPE_LIST.includes(
        item.app_type_code
      );
      return isExport ? !isInclude : isInclude;
    });
    console.warn("获取可以同步的影院列表", syncCinemaList);

    // 组装映射同步数据
    let syncList = [];
    for (let i = 0; i < syncCinemaList.length; i++) {
      const { app_name, app_type_code } = syncCinemaList[i];
      let list = await getCinemaList(app_name);
      console.warn("getCinemaList", list);
      const appInfo = GET_APP_INFO(app_name);
      list = list.map(item => {
        let app_cinema_code = item.cinema_code;
        // 除以下2种外没有cinema_code，用city_id+id组合当唯一标识
        if (!SYNC_CINEMA_CODE_APP_TYPE_LIST.includes(app_type_code)) {
          app_cinema_code = item.city_id + "_" + item.cinema_id;
        }
        return {
          app_label: appInfo.app_label,
          app_name: appInfo.app_name,
          app_type_code: appInfo.app_type_code,
          app_type_name: appInfo.app_type_name,
          app_cinema_name: item.cinema_name,
          app_cinema_code,
          plat_cinema_code: item.cinema_code || "" // 没值就为空，导出维护
        };
      });
      syncList = syncList.concat(list);
    }
    console.warn("组装好的同步映射列表数据syncList", syncList);
    if (isExport) {
      return syncList;
    }
    if (syncList.length > 0) {
      await syncCinemaMatch(syncList);
    } else {
      ElMessage.warning("没有可同步的影院");
    }
    syncLoading.value = false;
  } catch (error) {
    console.warn("获取可以同步映射列表异常", error);
    syncLoading.value = false;
  }
};

const exportLoading = ref(false);
// 导出映射维护信息列表
const exportCinemeCodeMatch = async () => {
  exportLoading.value = true;
  const exportList = await syncCinemeCodeMatch(true);
  if (exportList.length === 0) {
    ElMessage.warning("没有可导出维护映射信息的影院");
    exportLoading.value = false;
    return;
  }
  console.log("开始导出", exportList);
  let tableData = exportList.map(item => [
    item.app_type_code,
    item.app_type_name,
    item.app_name,
    item.app_label,
    item.app_cinema_name,
    item.app_cinema_code,
    item.plat_cinema_code
  ]);
  tableData.unshift([
    "app_type_code",
    "app_type_name",
    "app_name",
    "app_label",
    "app_cinema_name",
    "app_cinema_code",
    "plat_cinema_code"
  ]);
  let fileName = `影院映射维护列表.xlsx`;
  console.warn("tableData", tableData, "fileName", fileName);
  createExcelDown(tableData, fileName);
  exportLoading.value = false;
};

const uploadRef = ref(null);

// 生成影院唯一标识（与本地映射表比对用，统一转字符串避免 number/string 不一致）
const getAppCinemaCode = (item, app_type_code) => {
  if (SYNC_CINEMA_CODE_APP_TYPE_LIST.includes(app_type_code)) {
    return item.cinema_code != null ? String(item.cinema_code) : "";
  }
  // 不能同步的系列：city_id+影院id 与本地 app_cinema_code 对应
  const cityId = item.city_id != null ? String(item.city_id) : "";
  const cinemaId = item.cinema_id != null ? String(item.cinema_id) : "";
  return cityId && cinemaId ? `${cityId}_${cinemaId}` : "";
};

// 构建本地影院映射索引
const buildLocalCinemaIndex = cinemaList => {
  const indexMap = {};
  (cinemaList || []).forEach(item => {
    const { app_name, app_cinema_code } = item;
    if (!app_name || !app_cinema_code) return;
    if (!indexMap[app_name]) {
      indexMap[app_name] = {};
    }
    indexMap[app_name][app_cinema_code] = item;
  });
  return indexMap;
};

// 同步映射维护信息，返回 true 表示成功写入，false 表示未写入或失败
const syncCinemaMatch = async cinema_list => {
  const loading = ElLoading.service({
    lock: true,
    text: "同步中",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    let tableList = cinema_list.map(item => ({
      ...item,
      update_time: getCurrentTime()
    }));
    console.warn("最终组装好要上传的数据", tableList);
    // 先查一下库里面的券过滤一下，如果存在该券已使用就不执行导入了
    let params = {
      queryFields: "plat_cinema_code"
    };
    let queryRes = await svApi.queryCinemaMatchList(params);
    let cinemaList = queryRes.data.cinemaList || [];
    console.warn("远端已有映射数据", cinemaList);
    cinemaList = cinemaList.map(item => item.plat_cinema_code);
    let addList = tableList.filter(
      item =>
        item.plat_cinema_code &&
        !cinemaList.includes("" + item.plat_cinema_code)
    );
    console.warn("要新增的映射数据", addList);
    if (!addList.length) {
      ElMessage({
        type: "warning",
        message: "同步失败，根据库里去重后没有可以同步的映射列表"
      });
      loading.close();
      return false;
    }
    await svApi.batchAddCinemaMatch({ addList });
    ElMessage({
      type: "success",
      message: "同步成功，可查询检查"
    });
    loading.close();
    return true;
  } catch (error) {
    console.error("同步映射维护信息异常", error);
    ElMessage({
      type: "warning",
      message: "同步失败，请联系技术解决"
    });
    loading.close();
    return false;
  }
};
// 导入映射维护信息
const importCinemaMatch = async (uploadFile, uploadFiles) => {
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
      let [keys, ...tableList] = tableDate;
      tableList = tableList
        .map(item => {
          const result = keys.reduce((obj, key, index) => {
            obj[key] = item[index] || ""; // 空字符串转为 null（可选）
            return obj;
          }, {});
          // console.log("result", result);
          return {
            ...result,
            update_time: getCurrentTime()
          };
        })
        .filter(item => item.plat_cinema_code);
      console.warn("最终组装好要上传的数据", tableList);
      if (!tableList.length) {
        ElMessage({
          type: "warning",
          message: "过滤后无可以导入的映射列表，请检查"
        });
        uploadRef.value?.clearFiles();
        loading.close();
        return;
      }
      // 先查一下库里面的券过滤一下，如果存在该券已使用就不执行导入了
      let params = {
        queryFields: "plat_cinema_code"
      };
      let queryRes = await svApi.queryCinemaMatchList(params);
      let cinemaList = queryRes.data.cinemaList || [];
      console.warn("远端已有映射数据", cinemaList);
      cinemaList = cinemaList.map(item => item.plat_cinema_code);
      let addList = tableList.filter(
        item => !cinemaList.includes("" + item.plat_cinema_code)
      );
      console.warn("要新增的映射数据", addList);
      if (!addList.length) {
        ElMessage({
          type: "warning",
          message: "导入失败，根据库里去重后没有可以导入的映射列表"
        });
      } else {
        await svApi.batchAddCinemaMatch({ addList });
        ElMessage({
          type: "success",
          message: "导入成功，可查询检查"
        });
      }
      uploadRef.value?.clearFiles();
      loading.close();
    }
  } catch (error) {
    console.error("导入映射维护信息异常", error);
    ElMessage({
      type: "warning",
      message: "导入失败，请联系技术解决"
    });
    loading.close();
    uploadRef.value?.clearFiles();
  }
};

// 检查影院新增/删除
const checkCinemaUpdate = async () => {
  const startTime = getCurrentTime();
  console.log("开始检查影院新增/删除，时间：", startTime);
  const loading = ElLoading.service({
    lock: true,
    text: "检查影院变更中…",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    // 1. 用 Pinia 可用影院列表，再按登录信息过滤：无登录的不查
    const loginInfoList = getCinemaLoginInfoList().filter(
      item => item && item.session_id && item.app_name
    );
    if (!loginInfoList.length) {
      console.warn("当前无已登录影院，跳过检查");
      loading.close();
      return;
    }
    const canAppList = cinemaListStore.canAppList || [];
    const availableList = canAppList.filter(item =>
      loginInfoList.some(login => login.app_name === item.app_name)
    );
    const appNameSet = new Set(availableList.map(item => item.app_name));
    const appNameList = Array.from(appNameSet);
    if (!appNameList.length) {
      console.warn("可用且已登录的影线为空，跳过检查");
      loading.close();
      return;
    }

    // 2. 本地映射只参与可用数据（排除已禁用），构建索引
    const res = await svApi.queryCinemaMatchList({});
    let cinemaList = res?.data?.cinemaList || [];
    cinemaList = cinemaList.filter(item => item.status != 3);
    const localIndex = buildLocalCinemaIndex(cinemaList);

    const diffList = [];

    for (let i = 0; i < appNameList.length; i++) {
      const app_name = appNameList[i];
      try {
        const appInfo = GET_APP_INFO(app_name);
        const app_type_code = appInfo?.app_type_code || "";
        const app_type_name = appInfo?.app_type_name || "";
        const app_label = appInfo?.app_label || "";

        console.log("开始检查影线影院变更", app_name, app_label);

        // 远端影院列表（LMA 用任一城市即返回全量故保留 break，此处统一用 getCinemaList；失败或空时不判定删除）
        let list = [];
        try {
          list = (await getCinemaList(app_name)) || [];
        } catch (e) {
          console.warn("获取远端影院列表失败，跳过该影线对比", app_name, e);
          continue;
        }

        const isCanSync =
          SYNC_CINEMA_CODE_APP_TYPE_LIST.includes(app_type_code);
        const localRows = localIndex[app_name] || {};
        const localMapByAppCode = localRows; // 本地按 app_cinema_code 索引（不能同步用）
        const localByPlatCode = {}; // 本地按 plat_cinema_code 索引（能同步用）
        Object.values(localRows).forEach(row => {
          if (row.plat_cinema_code) {
            localByPlatCode[row.plat_cinema_code] = row;
          }
        });

        if (isCanSync) {
          // 能同步的系列：远端 cinema_code 与 本地 plat_cinema_code 匹配
          const remoteByCode = {};
          list.forEach(item => {
            const code = item.cinema_code;
            if (!code) return;
            remoteByCode[code] = item;
          });
          // 新增：远端有该 code，本地没有 plat_cinema_code 等于该 code 的
          Object.keys(remoteByCode).forEach(code => {
            if (!localByPlatCode[code]) {
              const remoteItem = remoteByCode[code];
              diffList.push({
                changeType: "新增",
                app_name,
                app_label,
                app_type_code,
                app_type_name,
                app_cinema_code: code,
                app_cinema_name:
                  remoteItem.cinema_name ||
                  remoteItem.app_cinema_name ||
                  remoteItem.name ||
                  ""
              });
            }
          });
          // 删除：仅当远端非空时，本地有 plat_cinema_code 但远端没有该 code 的
          if (list.length > 0) {
            Object.keys(localByPlatCode).forEach(platCode => {
              if (!remoteByCode[platCode]) {
                const localItem = localByPlatCode[platCode];
                diffList.push({
                  changeType: "删除",
                  id: localItem.id,
                  app_name,
                  app_label: localItem.app_label || app_label,
                  app_type_code: localItem.app_type_code || app_type_code,
                  app_type_name: localItem.app_type_name || app_type_name,
                  app_cinema_code: localItem.app_cinema_code || platCode,
                  app_cinema_name: localItem.app_cinema_name || ""
                });
              }
            });
          }
        } else {
          // 不能同步的系列：远端 city_id+影院id 与 本地 app_cinema_code 匹配
          const remoteMap = {};
          list.forEach(item => {
            const app_cinema_code = getAppCinemaCode(item, app_type_code);
            if (!app_cinema_code) return;
            remoteMap[app_cinema_code] = item;
          });
          // 新增：远端有该 app_cinema_code，本地无
          Object.keys(remoteMap).forEach(code => {
            if (!localMapByAppCode[code]) {
              const remoteItem = remoteMap[code];
              diffList.push({
                changeType: "新增",
                app_name,
                app_label,
                app_type_code,
                app_type_name,
                app_cinema_code: code,
                app_cinema_name:
                  remoteItem.cinema_name ||
                  remoteItem.app_cinema_name ||
                  remoteItem.name ||
                  ""
              });
            }
          });
          // 删除：仅当远端非空时，本地有 app_cinema_code 但远端无
          if (list.length > 0) {
            Object.keys(localMapByAppCode).forEach(code => {
              if (!remoteMap[code]) {
                const localItem = localMapByAppCode[code];
                diffList.push({
                  changeType: "删除",
                  id: localItem.id,
                  app_name,
                  app_label: localItem.app_label || app_label,
                  app_type_code: localItem.app_type_code || app_type_code,
                  app_type_name: localItem.app_type_name || app_type_name,
                  app_cinema_code: code,
                  app_cinema_name: localItem.app_cinema_name || ""
                });
              }
            });
          }
        }

        if (
          list.length === 0 &&
          (isCanSync
            ? Object.keys(localByPlatCode).length
            : Object.keys(localMapByAppCode).length) > 0
        ) {
          console.warn(
            "影线远端影院列表为空，不参与删除对比，避免误删",
            app_name,
            app_label
          );
        }
      } catch (err) {
        console.warn("检查影线影院变更异常", app_name, err);
      }
    }

    if (!diffList.length) {
      console.log(
        "本次检查未发现影院新增或删除，时间：",
        startTime,
        "，共检查影线数量：",
        appNameList.length
      );
      ElMessage.info("本次检查未发现影院新增或删除");
      loading.close();
      return;
    }

    console.log(
      "本次检查发现影院变更明细（新增/删除）：共",
      diffList.length,
      "条记录"
    );
    try {
      console.table(diffList);
    } catch (e) {
      console.log("影院变更明细：", diffList);
    }

    const addedList = diffList.filter(d => d.changeType === "新增");
    const deletedList = diffList.filter(d => d.changeType === "删除");

    const canSyncNew = addedList.filter(d =>
      SYNC_CINEMA_CODE_APP_TYPE_LIST.includes(d.app_type_code)
    );
    const cannotSyncNew = addedList.filter(
      d => !SYNC_CINEMA_CODE_APP_TYPE_LIST.includes(d.app_type_code)
    );

    diffNewSyncList.value = canSyncNew;
    diffNewManualList.value = cannotSyncNew;
    diffDeleteList.value = deletedList;

    // 默认全选
    selectedNewSyncList.value = [...canSyncNew];
    selectedNewManualList.value = [...cannotSyncNew];
    selectedDeleteList.value = [...deletedList];

    diffDialogVisible.value = true;
    nextTick(() => {
      if (diffNewSyncTableRef.value) {
        diffNewSyncTableRef.value.toggleAllSelection();
      }
      if (diffNewManualTableRef.value) {
        diffNewManualTableRef.value.toggleAllSelection();
      }
      if (diffDeleteTableRef.value) {
        diffDeleteTableRef.value.toggleAllSelection();
      }
    });
    loading.close();
  } catch (error) {
    console.warn("检查影院新增/删除整体流程异常", error);
    loading.close();
  }
};

// 执行新增同步（可自动同步的影院）
const handleSyncNewCinema = async () => {
  const targets = selectedNewSyncList.value.length
    ? selectedNewSyncList.value
    : [];
  if (!targets.length) {
    ElMessage.info("请先勾选需要同步的新增影院");
    return;
  }
  const addList = targets.map(d => ({
    app_label: d.app_label,
    app_name: d.app_name,
    app_type_code: d.app_type_code,
    app_type_name: d.app_type_name,
    app_cinema_name: d.app_cinema_name,
    app_cinema_code: d.app_cinema_code,
    plat_cinema_code: d.app_cinema_code
  }));
  const ok = await syncCinemaMatch(addList);
  if (!ok) {
    ElMessage.warning("同步未成功，列表未清空，可重试或检查后再次同步");
    return;
  }
  ElMessage.success(`已自动同步 ${targets.length} 条新增影院映射`);
  // 剔除已处理的数据
  diffNewSyncList.value = diffNewSyncList.value.filter(
    item => !targets.includes(item)
  );
  selectedNewSyncList.value = [];
  searchData();
  if (
    !diffNewSyncList.value.length &&
    !diffNewManualList.value.length &&
    !diffDeleteList.value.length
  ) {
    diffDialogVisible.value = false;
  }
};

// 导出需手动维护的新增影院模板
const handleExportManualNew = () => {
  const targets = selectedNewManualList.value.length
    ? selectedNewManualList.value
    : [];
  if (!targets.length) {
    ElMessage.info("请先勾选需要导出的新增影院");
    return;
  }
  const header = [
    "app_type_code",
    "app_type_name",
    "app_name",
    "app_label",
    "app_cinema_name",
    "app_cinema_code",
    "plat_cinema_code"
  ];
  const rows = targets.map(d => [
    d.app_type_code,
    d.app_type_name,
    d.app_name,
    d.app_label,
    d.app_cinema_name,
    d.app_cinema_code,
    ""
  ]);
  const tableData = [header, ...rows];
  const fileName = `需维护平台code影院列表_${getCurrentTime()}.xlsx`;
  createExcelDown(tableData, fileName);
  ElMessage.success("导出成功，请在表格中维护平台影院编码后再导入");
  // 剔除已处理的数据
  diffNewManualList.value = diffNewManualList.value.filter(
    item => !targets.includes(item)
  );
  selectedNewManualList.value = [];
  if (
    !diffNewSyncList.value.length &&
    !diffNewManualList.value.length &&
    !diffDeleteList.value.length
  ) {
    diffDialogVisible.value = false;
  }
};

// 删除映射表中已下线的影院
const handleDeleteCinemaMatch = async () => {
  const targets = selectedDeleteList.value.length
    ? selectedDeleteList.value
    : [];
  if (!targets.length) {
    ElMessage.info("请先勾选需要删除的影院映射");
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定要删除这 ${targets.length} 条影院映射吗？`,
      "确认删除",
      {
        confirmButtonText: "确定删除",
        cancelButtonText: "取消",
        type: "warning",
        showClose: false,
        closeOnClickModal: false,
        closeOnPressEscape: false
      }
    );
    // 删除前打印，便于删除后对照
    console.log(
      "即将删除的影院映射（共 " + targets.length + " 条）：",
      targets.map(d => ({
        影线: d.app_label,
        影院名称: d.app_cinema_name,
        影院唯一标识: d.app_cinema_code,
        映射表id: d.id
      }))
    );
    try {
      console.table(
        targets.map(d => ({
          影线: d.app_label,
          影院名称: d.app_cinema_name,
          影院唯一标识: d.app_cinema_code,
          映射表id: d.id
        }))
      );
    } catch (e) {
      // 部分环境 console.table 不支持则忽略
    }
    let deleted = 0;
    for (const d of targets) {
      if (d.id != null && d.id !== undefined && d.id !== "") {
        await svApi.deleteById({ id: d.id });
        deleted++;
      }
    }
    ElMessage.success(`已删除 ${deleted} 条影院映射`);
    // 剔除已处理的数据
    diffDeleteList.value = diffDeleteList.value.filter(
      item => !targets.includes(item)
    );
    selectedDeleteList.value = [];
    searchData();
    if (
      !diffNewSyncList.value.length &&
      !diffNewManualList.value.length &&
      !diffDeleteList.value.length
    ) {
      diffDialogVisible.value = false;
    }
  } catch (e) {
    if (e !== "cancel") {
      console.warn("删除映射异常", e);
    }
    ElMessage.info("已取消删除");
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
    console.log("queryParams", queryParams);
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    let res = await svApi.queryCinemaMatchList({
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
    console.warn("获取影院映射信息列表失败", error);
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

// 删除单行规则
const deleteRow = row => {
  ElMessageBox.confirm("确定要删除该记录吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      await svApi.deleteById({ id: row.id });
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

// 打开手动新增弹框
const openAddDialog = () => {
  resetAddForm();
  addDialogVisible.value = true;
};

const onAddFormAppChange = () => {
  // 可选：根据 app_name 预填说明
};

const resetAddForm = () => {
  addForm.app_name = "";
  addForm.app_cinema_name = "";
  addForm.app_cinema_code = "";
  addForm.plat_cinema_code = "";
  addForm.plat_cinema_name = "";
  addFormRef.value?.clearValidate();
};

// 提交手动新增
const submitAddCinema = async () => {
  if (!addFormRef.value) return;
  const valid = await addFormRef.value.validate().catch(() => false);
  if (!valid) return;
  const app_name = addForm.app_name;
  const appInfo = GET_APP_INFO(app_name);
  if (!appInfo) {
    ElMessage.warning("未找到该影线配置");
    return;
  }
  addSubmitLoading.value = true;
  try {
    const item = {
      app_name: appInfo.app_name,
      app_label: appInfo.app_label,
      app_type_code: appInfo.app_type_code,
      app_type_name: appInfo.app_type_name,
      app_cinema_name: addForm.app_cinema_name.trim(),
      app_cinema_code: addForm.app_cinema_code.trim(),
      plat_cinema_code: addForm.plat_cinema_code.trim(),
      plat_cinema_name: (addForm.plat_cinema_name || "").trim(),
      update_time: getCurrentTime()
    };
    await svApi.batchAddCinemaMatch({ addList: [item] });
    ElMessage.success("新增成功");
    addDialogVisible.value = false;
    resetAddForm();
    searchData();
  } catch (e) {
    console.warn("手动新增影院映射异常", e);
    ElMessage.warning(e?.message || "新增失败，请重试");
  } finally {
    addSubmitLoading.value = false;
  }
};

// 编辑影院信息
const editCard = (row, type) => {
  sfcDialogRef.value.open(row);
};

// 保存影院信息
const saveCinema = async cinemaInfo => {
  try {
    if (cinemaInfo.id) {
      console.log("编辑保存影院映射信息", cinemaInfo);
      await svApi.updateCinemaMatch({
        id: cinemaInfo.id,
        plat_cinema_code: cinemaInfo.plat_cinema_code,
        plat_cinema_name: cinemaInfo.plat_cinema_name,
        update_time: getCurrentTime()
      });
      sfcDialogRef.value.closeTck();
      ElMessage.success("编辑成功！");
      searchData();
    }
  } catch (error) {
    console.warn("编辑保存影院映射信息异常", error);
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
.demo-form-inline :deep(.el-form-item__content) {
  align-items: baseline;
}
</style>
