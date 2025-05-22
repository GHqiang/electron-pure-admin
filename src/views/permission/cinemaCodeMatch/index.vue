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
          <el-form-item>
            <el-button type="primary" @click="searchData">搜索</el-button>
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
        >
          <el-table-column
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
            prop="update_time"
            label="更新时间"
            min-width="120"
          />
          <el-table-column
            label="操作"
            fixed="right"
            align="center"
            width="100"
          >
            <template #default="scope">
              <el-button
                size="small"
                type="primary"
                @click="editCard(scope.row, '1')"
                >编辑</el-button
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, onBeforeMount, nextTick, watch } from "vue";
import svApi from "@/api/sv-api";
import { ElMessage, ElLoading } from "element-plus";
import CinemaMatchDialog from "@/components/CinemaMatchDialog.vue";
import { GET_APP_LIST, GET_APP_TYPE_LIST } from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());

import { getCurrentTime, mockDelay } from "@/utils/utils";
import { useCinemaCodeMatchList } from "@/store/specialNameRule";
const cinemaCodeMatchObj = useCinemaCodeMatchList();
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

const tableData = ref([]);

const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);

// 表单查询数据
const formData = reactive({
  app_type_code: "",
  app_name: ""
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
</style>
