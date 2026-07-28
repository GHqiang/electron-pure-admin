<!-- 字典管理列表页 -->
<template>
  <div>
    <el-container>
      <el-main>
        <!-- 查询表单 -->
        <el-form :inline="true" :model="searchForm" class="search-form">
          <el-form-item label="字典类型">
            <el-input
              v-model="searchForm.dict_type"
              placeholder="支持模糊搜索"
              clearable
              @keyup.enter="searchData"
            />
          </el-form-item>
          <el-form-item label="状态">
            <el-select
              v-model="searchForm.status"
              placeholder="全部"
              clearable
              style="width: 120px"
            >
              <el-option :value="1" label="启用" />
              <el-option :value="0" label="停用" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="searchData">搜索</el-button>
            <el-button @click="resetSearch">重置</el-button>
            <el-button type="success" @click="openAddDialog">新增</el-button>
            <el-button
              type="danger"
              :disabled="!selectedRows.length"
              @click="batchDelete"
            >
              批量删除
            </el-button>
          </el-form-item>
        </el-form>

        <!-- 表格 -->
        <el-table
          ref="multipleTable"
          :data="tableData"
          border
          stripe
          show-overflow-tooltip
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <el-table-column
            type="selection"
            width="55"
            :selectable="row => !row.is_readonly"
          />
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column
            prop="dict_type"
            label="字典类型"
            min-width="160"
          />
          <el-table-column
            prop="dict_label"
            label="字典标签"
            min-width="180"
          />
          <el-table-column
            prop="dict_value"
            label="字典值"
            min-width="200"
            show-overflow-tooltip
          />
          <el-table-column
            prop="dict_desc"
            label="描述"
            min-width="260"
            show-overflow-tooltip
          />
          <el-table-column label="状态" width="100" align="center">
            <template #default="scope">
              <el-switch
                :model-value="scope.row.status"
                :active-value="1"
                :inactive-value="0"
                :disabled="scope.row.is_readonly == 1"
                @change="val => handleStatusChange(scope.row, val)"
              />
            </template>
          </el-table-column>
          <el-table-column label="只读" width="80" align="center">
            <template #default="scope">
              <el-tag :type="scope.row.is_readonly == 1 ? 'danger' : 'info'">
                {{ scope.row.is_readonly == 1 ? "是" : "否" }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="rule" label="指定角色" width="100" align="center">
            <template #default="scope">
              {{ formatRule(scope.row.rule) }}
            </template>
          </el-table-column>
          <el-table-column
            prop="update_time"
            label="更新时间"
            width="170"
          />
          <el-table-column
            label="操作"
            width="150"
            fixed="right"
            align="center"
          >
            <template #default="scope">
              <el-button
                size="small"
                type="primary"
                :disabled="scope.row.is_readonly == 1"
                @click="openEditDialog(scope.row)"
              >
                编辑
              </el-button>
              <el-button
                size="small"
                type="danger"
                :disabled="scope.row.is_readonly == 1"
                @click="deleteRow(scope.row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <el-pagination
          class="pagination"
          :current-page="currentPage"
          :page-size="pageSize"
          :page-sizes="[10, 20, 30, 50]"
          :total="totalNum"
          layout="total, sizes, prev, pager, next, jumper"
          background
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </el-main>
    </el-container>

    <!-- 新增/编辑弹框 -->
    <DictDialog ref="dictDialogRef" @submit="handleSubmit" />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import svApi from "@/api/sv-api";
import { ElMessage, ElLoading, ElMessageBox } from "element-plus";
import DictDialog from "@/components/DictDialog.vue";
import { dictTable } from "@/store/dictTable";

defineOptions({
  name: "dictManage"
});

const dictStore = dictTable();

// 查询表单
const searchForm = reactive({
  dict_type: "",
  status: ""
});

// 列表数据
const tableData = ref([]);
const totalNum = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);
const selectedRows = ref([]);
const multipleTable = ref(null);

// 弹框
const dictDialogRef = ref(null);

// 角色格式化
const formatRule = rule => {
  if (rule === null || rule === undefined || rule === "") return "全角色";
  const map = { 1: "管理员", 2: "内部用户", 3: "外部用户" };
  return `${rule}-${map[rule] || "未知"}`;
};

// 查询数据
const searchData = async () => {
  const loading = ElLoading.service({
    lock: true,
    text: "Loading",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    let params = {
      page_num: currentPage.value,
      page_size: pageSize.value
    };
    if (searchForm.dict_type) params.dict_type = searchForm.dict_type;
    if (searchForm.status !== "" && searchForm.status !== null) {
      params.status = searchForm.status;
    }
    const res = await svApi.queryDictListPage(params);
    tableData.value = res.data.dictList || [];
    totalNum.value = res.data.totalNum || 0;
  } catch (error) {
    console.warn("查询字典列表失败", error);
  } finally {
    loading.close();
  }
};

const resetSearch = () => {
  searchForm.dict_type = "";
  searchForm.status = "";
  currentPage.value = 1;
  searchData();
};

const handleSizeChange = val => {
  pageSize.value = val;
  currentPage.value = 1;
  searchData();
};

const handleCurrentChange = val => {
  currentPage.value = val;
  searchData();
};

const handleSelectionChange = rows => {
  selectedRows.value = rows;
};

// 刷新字典缓存（CRUD 后调用，保证其他模块即时生效）
const refreshDictCache = async () => {
  try {
    const res = await svApi.queryDictList();
    dictStore.setDictTableList(res?.data?.dictList || []);
  } catch (error) {
    console.warn("刷新字典缓存失败", error);
  }
};

// 状态切换
const handleStatusChange = async (row, val) => {
  try {
    await svApi.updateDictRecord({ id: row.id, status: val });
    row.status = val;
    await refreshDictCache();
    ElMessage.success("状态切换成功");
  } catch (error) {
    console.warn("状态切换失败", error);
    // 失败时不更新 row.status，保持原值
  }
};

// 新增
const openAddDialog = () => {
  dictDialogRef.value.open(null);
};

// 编辑
const openEditDialog = row => {
  dictDialogRef.value.open(row);
};

// 弹框提交（新增/编辑统一处理）
const handleSubmit = async ({ isEdit, formData }) => {
  try {
    if (isEdit) {
      // 编辑：排除 dict_type（后端也会排除 is_readonly）
      const { dict_type, id, ...updateData } = formData;
      await svApi.updateDictRecord({ id, ...updateData });
      ElMessage.success("修改字典成功");
    } else {
      // 新增：is_readonly 不传，由后端走 DB 默认值 0
      const { id, ...addData } = formData;
      await svApi.addDictRecord(addData);
      ElMessage.success("新增字典成功");
    }
    dictDialogRef.value.close();
    await refreshDictCache();
    searchData();
  } catch (error) {
    console.warn("保存字典失败", error);
    dictDialogRef.value.close();
  }
};

// 单条删除（逻辑删除）
const deleteRow = row => {
  ElMessageBox.confirm(
    "删除后该字典将不再生效（状态置为已删除），确认删除？",
    "提示",
    {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning"
    }
  )
    .then(async () => {
      try {
        await svApi.deleteDictRecord({ id: row.id });
        ElMessage.success("删除字典成功");
        await refreshDictCache();
        searchData();
      } catch (error) {
        console.warn("删除字典失败", error);
      }
    })
    .catch(() => {});
};

// 批量删除（逻辑删除）
const batchDelete = () => {
  if (!selectedRows.value.length) return;
  ElMessageBox.confirm(
    `确认删除选中的 ${selectedRows.value.length} 条字典（状态置为已删除）？`,
    "提示",
    {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning"
    }
  )
    .then(async () => {
      try {
        const delIds = selectedRows.value.map(item => item.id);
        await svApi.batchDeleteDictRecord({ delIds });
        ElMessage.success("批量删除字典成功");
        await refreshDictCache();
        searchData();
      } catch (error) {
        console.warn("批量删除字典失败", error);
      }
    })
    .catch(() => {});
};

onMounted(() => {
  searchData();
});
</script>

<style scoped>
.search-form {
  margin-bottom: 16px;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
