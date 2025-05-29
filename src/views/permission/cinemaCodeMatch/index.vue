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
            <el-button type="primary" @click="syncCinemeCodeMatch()"
              >同步映射信息</el-button
            >

            <el-button type="primary" @click="exportCinemeCodeMatch"
              >导出映射维护信息</el-button
            >
            <el-upload
              ref="uploadRef"
              style="margin-left: 15px"
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
import {
  ref,
  reactive,
  computed,
  toRaw,
  onBeforeMount,
  nextTick,
  watch
} from "vue";
import svApi from "@/api/sv-api";
import { APP_API_OBJ } from "@/common/index.js";
import { ElMessage, ElLoading } from "element-plus";
import CinemaMatchDialog from "@/components/CinemaMatchDialog.vue";
import {
  GET_APP_LIST,
  GET_APP_TYPE_LIST,
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_CHENXING_LIST,
  GET_SFC_APP_LIST,
  GE_APP_INFO
} from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());
const UME_LIST = computed(() => GET_UME_LIST());
const H5_UME_LIST = computed(() => GET_H5_UME_LIST());
const CHENXING_LIST = computed(() => GET_CHENXING_LIST());
const SFC_LIST = computed(() => GET_SFC_APP_LIST());

import {
  getCurrentTime,
  mockDelay,
  createExcelDown,
  parseExcel
} from "@/utils/utils";
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

const appName = ref("");
const operateName = computed(() => {
  if (UME_LIST.value.includes(appName.value)) {
    return "1";
  }
  if (CHENXING_LIST.value.includes(appName.value)) {
    return "1";
  }
  if (H5_UME_LIST.value.includes(appName.value)) {
    return "2";
  }
  if (SFC_LIST.value.includes(appName.value)) {
    return "2";
  }
  if ("lma" == appName.value) {
    return "2";
  }
  return "1";
});
let cinemaList = ref([]); // 影院列表

// 获取某个影线的全部影院列表
const getCinemaList = async app_name => {
  const { cityList = [], cityCinemaList = [] } = await getCityList(app_name);
  let list = [];
  if (cityList?.length) {
    list = await getAllCinemaList(cityList, app_name, cityCinemaList);
  } else {
    console.warn("获取城市列表异常", app_name);
  }
  return list || [];
};
// 同步影院code映射
const syncCinemeCodeMatch = async isExport => {
  try {
    // 1、获取未同步的影院列表
    const cinemaListRes = await svApi.queryNoSyncCinemaList({});
    let cinemaList = cinemaListRes?.data?.cinemaList || [];
    console.warn("获取未同步的影院列表", cinemaList);

    // 2、获取可以同步的影院列表
    let syncCinemaList = cinemaList.filter(item => {
      let canSyncAppTypeCodeList = ["ume_applet", "chenxing_applet"];
      let isInclude = canSyncAppTypeCodeList.includes(item.app_type_code);
      return isExport ? !isInclude : isInclude;
    });
    console.warn("获取可以同步的影院列表", syncCinemaList);

    // 组装映射同步数据
    let syncList = [];
    for (let i = 0; i < syncCinemaList.length; i++) {
      const { app_name, app_type_code } = syncCinemaList[i];
      let list = await getCinemaList(app_name);
      console.warn("getCinemaList", list);
      const appInfo = GE_APP_INFO(app_name);
      list = list.map(item => {
        let app_cinema_code = item.cinemaCode;
        let isH5_UME = app_type_code === "ume_h5";
        let isLMA = app_name === "lma";
        let isSFC = app_type_code === "sfc_applet";
        // 以下三种没有cinema_code，用city_id+id组合当唯一标识
        if (isH5_UME || isLMA || isSFC) {
          app_cinema_code = item.cityId + "_" + item.cinemaId;
        }
        return {
          app_label: appInfo.app_label,
          app_name: appInfo.app_name,
          app_type_code: appInfo.app_type_code,
          app_type_name: appInfo.app_type_name,
          app_cinema_name: item.cinemaName,
          app_cinema_code,
          plat_cinema_code: item.cinemaCode || ""
        };
      });
      syncList = syncList.concat(list);
    }
    console.warn("组装好的同步映射列表数据syncList", syncList);
    if (isExport) return syncList;
    if (syncList.length > 0) {
      await syncCinemaMatch(syncList);
    } else {
      ElMessage.warning("没有可同步的影院");
    }
  } catch (error) {
    console.warn("获取可以同步映射列表异常", error);
  }
};

// 导出映射维护信息列表
const exportCinemeCodeMatch = async () => {
  const exportList = await syncCinemeCodeMatch(true);
  if (exportList.length === 0) {
    ElMessage.warning("没有可导出维护映射信息的影院");
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
};

const uploadRef = ref(null);

// 同步映射维护信息
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
    } else {
      await svApi.batchAddCinemaMatch({ addList });
      ElMessage({
        type: "success",
        message: "同步成功，可查询检查"
      });
    }
    loading.close();
  } catch (error) {
    console.error("同步映射维护信息异常", error);
    ElMessage({
      type: "warning",
      message: "同步失败，请联系技术解决"
    });
    loading.close();
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
      tableList = tableList.map(item => {
        const result = keys.reduce((obj, key, index) => {
          obj[key] = item[index] || ""; // 空字符串转为 null（可选）
          return obj;
        }, {});
        // console.log("result", result);
        return {
          ...result,
          update_time: getCurrentTime()
        };
      });
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
// 获取城市列表
const getCityList = async app_name => {
  try {
    let params = {};
    let cityList, cityCinemaList;
    console.log("获取城市列表参数", params, app_name);
    if (UME_LIST.value.includes(app_name)) {
      let params = {
        params: {
          channelCode: "QD0000001",
          sysSourceCode: "YZ001",
          cinemaCode: "32012801",
          cinemaLinkId: "15946"
        }
      };
      const res = await APP_API_OBJ[app_name].getCinemaList(params);
      cityCinemaList = res.data || [];
      cityList = cityCinemaList.map(item => ({
        cityName: item.cityName,
        cityId: item.cityCode
      }));
    } else if (H5_UME_LIST.value.includes(app_name)) {
      let params = {
        empCode: "",
        leaseCode: ""
      };
      const res = await APP_API_OBJ[app_name].getCinemaList(params);
      cityCinemaList = res.bizValue?.cities || [];
      cityList = cityCinemaList.map(item => ({
        cityName: item.cityName,
        cityId: item.cityCode
      }));
    } else if (CHENXING_LIST.value.includes(app_name)) {
      let params = {};
      const res = await APP_API_OBJ[app_name].getCinemaList(params);
      let api_version = GE_APP_INFO(app_name)?.api_version || "";
      if (api_version === "3.0C") {
        cityCinemaList = res.data || [];
        cityList = cityCinemaList.map(item => ({
          cityName: item.cityInfoDTO.cityName,
          cityId: item.cityInfoDTO.cityCode
        }));
      } else if (api_version === "C") {
        cityCinemaList = res.data?.resultDOList || [];
        cityList = cityCinemaList.map(item => ({
          cityName: item.cityInfo.chName,
          cityId: item.cityInfo.id
        }));
      }
    } else if (app_name === "lma") {
      const res = await APP_API_OBJ[app_name].getCityList();
      cityList = res.data.list || [];
      cityList = cityList.map(item => ({
        cityName: item.city_name,
        cityId: item.city_id
      }));
    } else {
      const res = await APP_API_OBJ[app_name].getCityList(params);
      cityList = res?.data?.all_city || [];
      cityList = cityList.map(item => ({
        cityName: item.name,
        cityId: item.id
      }));
    }
    console.log("获取城市列表返回", cityList, cityCinemaList);
    return { cityList, cityCinemaList };
  } catch (error) {
    console.warn("获取城市列表异常", error);
    return {};
  }
};

// 根据城市获取影院列表
const getCinemaListByCityId = async (cityId, app_name, cityCinemaList) => {
  try {
    let params = {
      city_id: cityId
    };
    console.log("根据城市获取影院列表参数", params);
    let cinemaList = [];
    if (UME_LIST.value.includes(app_name)) {
      cinemaList =
        cityCinemaList.find(item => item.cityCode === cityId)?.cinemaList || [];
      cinemaList = cinemaList.map(item => ({
        ...item,
        cinemaCode: item.cinemaCode,
        cinemaName: item.cinemaName,
        cinemaId: ""
      }));
    } else if (H5_UME_LIST.value.includes(app_name)) {
      cinemaList =
        cityCinemaList.find(item => item.cityCode === cityId)?.cinemas || [];
      cinemaList = cinemaList.map(item => ({
        ...item,
        cinemaCode: "",
        cinemaName: item.cinemaName,
        cinemaId: item.cinemaLinkId
      }));
    } else if (CHENXING_LIST.value.includes(app_name)) {
      let api_version = GE_APP_INFO(app_name)?.api_version || "";
      if (api_version === "3.0C") {
        cinemaList =
          cityCinemaList.find(item => item.cityInfoDTO.cityCode === cityId)
            ?.cinemaResultDTOList || [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinemaCode: item.cinemaCode,
          cinemaName: item.cinemaName,
          cinemaId: ""
        }));
      } else if (api_version === "C") {
        cinemaList =
          cityCinemaList.find(item => item.cityInfo.id === cityId)?.cinemas ||
          [];
        cinemaList = cinemaList.map(item => ({
          ...item,
          cinemaCode: item.unifiedCode,
          cinemaName: item.name,
          cinemaId: ""
        }));
      }
    } else if (app_name === "lma") {
      const res = await APP_API_OBJ[app_name].getCinemaList(cityId);
      cinemaList = res.data.list || [];
      cinemaList = cinemaList.map(item => ({
        ...item,
        cinemaCode: "",
        cinemaName: item.cinema_name,
        cinemaId: item.cinema_id
      }));
    } else {
      // sfc
      const res = await APP_API_OBJ[app_name].getCinemaList(params);
      console.log("根据城市获取影院列表返回", res);
      cinemaList = res.data?.cinema_data || [];
      cinemaList = cinemaList.map(item => ({
        ...item,
        cinemaCode: "",
        cinemaName: item.name,
        cinemaId: item.id
      }));
    }
    return cinemaList;
  } catch (error) {
    console.warn("根据城市获取影院列表异常", error);
  }
};

// 获取全部影院列表
const getAllCinemaList = async (cityList, app_name, cityCinemaList) => {
  try {
    let allCinemaList = [];
    for (let index = 0; index < cityList.length; index++) {
      const item = cityList[index];
      let list = await getCinemaListByCityId(
        item.cityId,
        app_name,
        cityCinemaList
      );
      list = list.map(itemA => {
        return {
          ...itemA,
          // 只关心以下字段
          // cityName: item.cityName,
          cityId: item.cityId,
          cinemaId: itemA.cinemaId,
          cinemaCode: itemA.cinemaCode,
          cinemaName: itemA.cinemaName
        };
      });
      if (list.length > 0) {
        allCinemaList = allCinemaList.concat(list);
      }
    }
    if (!allCinemaList.length) {
      console.warn(`${app_name} 获取影院列表为空`);
    }
    console.log("allCinemaList" + "——" + app_name, allCinemaList);
    cinemaList.value = allCinemaList;
    return allCinemaList;
  } catch (error) {
    console.warn("获取全部影院列表异常", error);
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
.demo-form-inline :deep(.el-form-item__content) {
  align-items: baseline;
}
</style>
