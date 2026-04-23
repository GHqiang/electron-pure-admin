<template>
  <div>
    <!-- 查询表单 -->
    <el-form :inline="true" class="demo-form-inline" label-width="80px">
      <el-form-item label="券类型">
        <el-select
          v-model="formData.quan_value"
          clearable
          filterable
          placeholder="券类型"
          style="width: 194px"
        >
          <el-option
            v-for="item in quanType"
            :key="item.id"
            :label="item.quan_name"
            :value="item.quan_value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="券状态">
        <el-select
          v-model="formData.quan_status"
          clearable
          placeholder="券状态"
          style="width: 194px"
        >
          <el-option label="可用" value="1" />
          <el-option label="已绑定" value="2" />
          <el-option label="绑定异常" value="3" />
          <el-option label="正常券已导出" value="4" />
          <el-option label="不可用券已导出" value="5" />
        </el-select>
      </el-form-item>
      <el-form-item label="券码">
        <el-input
          v-model="formData.coupon_num"
          placeholder="请输入券码"
          clearable
          style="width: 194px"
        />
      </el-form-item>
      <el-form-item label="导出数量">
        <el-input
          v-model="formData.export_count"
          type="number"
          min="1"
          max="1000"
          placeholder="请输入导出数量"
          style="width: 194px"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="searchData">搜索</el-button>
        <el-button @click="resetForm">重置</el-button>
      </el-form-item>
      <el-form-item class="demo-form-inline__submit">
        <el-button type="success" @click="exportQuanHandle">导出券</el-button>
        <el-button type="primary" @click="handleImportClick">导入券</el-button>
        <input
          ref="importInputRef"
          type="file"
          accept=".xlsx,.xls"
          style="display: none"
          @change="handleFileChange"
        />
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
        prop="coupon_num"
        label="券码"
        min-width="180"
        align="center"
      />
      <el-table-column prop="quan_name" label="券名称" min-width="110">
        <template #default="{ row }">
          <span>{{ row.quan_name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="quan_value" label="券类型" min-width="100" />
      <el-table-column
        prop="quan_status"
        label="券状态"
        min-width="100"
        align="center"
      >
        <template #default="{ row: { quan_status } }">
          <el-tag v-if="quan_status == '1'" type="success" size="small"
            >可用</el-tag
          >
          <el-tag v-else-if="quan_status == '2'" type="primary" size="small"
            >已绑定</el-tag
          >
          <el-tag v-else-if="quan_status == '3'" type="danger" size="small"
            >绑定异常</el-tag
          >
          <el-tag v-else-if="quan_status == '4'" type="info" size="small"
            >正常券已导出</el-tag
          >
          <el-tag v-else-if="quan_status == '5'" type="warning" size="small"
            >不可用券已导出</el-tag
          >
          <el-tag v-else size="small">{{ quan_status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="user_name"
        label="使用人"
        min-width="100"
        align="center"
      />
      <el-table-column
        prop="use_time"
        label="绑定使用时间"
        min-width="160"
        align="center"
      >
        <template #default="{ row }">
          {{ row.use_time ? formatTimeOfTime(row.use_time) : "" }}
        </template>
      </el-table-column>
      <el-table-column
        prop="create_time"
        label="创建时间"
        min-width="160"
        align="center"
      >
        <template #default="{ row }">
          {{ row.create_time ? formatTimeOfTime(row.create_time) : "" }}
        </template>
      </el-table-column>
      <el-table-column
        prop="export_time"
        label="导出时间"
        min-width="160"
        align="center"
      >
        <template #default="{ row }">
          {{ row.export_time ? formatTimeOfTime(row.export_time) : "" }}
        </template>
      </el-table-column>
      <el-table-column
        prop="expire_time"
        label="到期时间"
        min-width="160"
        align="center"
      >
        <template #default="{ row }">
          <span
            v-if="row.expire_time"
            :class="{ 'expire-warning': isExpireWarning(row.expire_time) }"
          >
            {{ formatTimeOfTime(row.expire_time) }}
          </span>
          <span v-else />
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="100" />
      <el-table-column label="操作" min-width="150" align="center">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="editQuanStatus(row)">
            修改状态
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 修改券状态弹窗 -->
    <el-dialog
      v-model="editStatusDialogVisible"
      title="修改券状态"
      width="400px"
    >
      <el-form :model="editStatusForm" label-width="80px">
        <el-form-item label="券码">
          <el-input v-model="editStatusForm.coupon_num" disabled />
        </el-form-item>
        <el-form-item label="当前状态">
          <el-input v-model="editStatusForm.currentStatus" disabled />
        </el-form-item>
        <el-form-item label="新状态">
          <el-select
            v-model="editStatusForm.quan_status"
            placeholder="请选择新状态"
          >
            <el-option label="可用" value="1" />
            <el-option label="已绑定" value="2" />
            <el-option label="绑定异常" value="3" />
            <el-option label="正常券已导出" value="4" />
            <el-option label="不可用券已导出" value="5" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="editStatusDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="updateQuanStatus">确定</el-button>
        </span>
      </template>
    </el-dialog>
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, onBeforeMount, watch } from "vue";
import svApi from "@/api/sv-api";
import { ElMessage, ElLoading, ElMessageBox } from "element-plus";
import { GET_APP_LIST } from "@/common/constant";
import {
  formatTimeOfTime,
  createExcelDown,
  getCurrentDay,
  parseExcel
} from "@/utils/utils";

// 接收父组件传递的属性
const props = defineProps({
  appType: {
    type: String,
    default: ""
  },
  appName: {
    type: String,
    default: ""
  }
});

const APP_LIST = computed(() => GET_APP_LIST());

const tableData = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);
const totalNum = ref(0);

// 表单查询数据
const formData = reactive({
  quan_value: "",
  quan_status: "1",
  coupon_num: "",
  export_count: null,
  isNeedTotalNum: 1
});

// 券类型列表
const quanType = ref([]);

// 导入券相关
const importInputRef = ref(null);

// 修改券状态相关
const editStatusDialogVisible = ref(false);
const editStatusForm = reactive({
  id: "",
  coupon_num: "",
  currentStatus: "",
  quan_status: ""
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
    // 排除export_count字段，因为它不是数据库字段
    const { export_count, ...filteredFormInfo } = formInfo;
    const filteredEntries = Object.entries(filteredFormInfo).filter(
      ([key, value]) => {
        return value !== null && value !== undefined && value !== "";
      }
    );
    let queryParams = Object.fromEntries(filteredEntries);
    let page_num = currentPage.value;
    let page_size = pageSize.value;
    let res = await svApi.queryQuanList({
      ...queryParams,
      page_num,
      page_size
    });
    let quanList = res.data.quanList || [];
    tableData.value = quanList;
    totalNum.value = res.data.totalNum || 0;
    loading.close();
  } catch (error) {
    loading.close();
    console.warn("获取券列表失败", error);
    ElMessage.error("获取券列表失败");
  }
};

// 导出券
const exportQuanHandle = async () => {
  try {
    if (!formData.quan_value) {
      ElMessage.error("请选择券类型");
      return;
    }
    if (!formData.export_count || formData.export_count <= 0) {
      ElMessage.error("请输入有效的导出数量");
      return;
    }

    // 根据选择的券类型获取对应的影线
    const selectedQuanType = quanType.value.find(
      item => item.quan_value === formData.quan_value
    );
    if (!selectedQuanType) {
      ElMessage.error("未找到选择的券类型信息");
      return;
    }
    const app_name = selectedQuanType.app_name;

    const loading = ElLoading.service({
      lock: true,
      text: "正在导出券...",
      background: "rgba(0, 0, 0, 0.7)"
    });

    // 调用接口获取券列表
    let res = await svApi.queryQuanList({
      app_name: app_name,
      quan_value: formData.quan_value,
      quan_status: "1", // 只导出可用券
      page_num: 1,
      page_size: formData.export_count
    });

    let quanList = res.data.quanList || [];
    if (quanList.length === 0) {
      loading.close();
      ElMessage.warning("没有可用券可导出");
      return;
    }

    // 限制导出数量
    const exportList = quanList.slice(0, formData.export_count);
    const coupon_num_list = exportList.map(item => item.coupon_num);

    // 调用导出接口更新状态
    let params = {
      coupon_num_list,
      quan_value: formData.quan_value,
      app_name: app_name,
      quan_status: 4 // 正常券已导出
    };

    await svApi.exportQuanList(params);

    // 准备导出数据
    let exportData = exportList.map(item => [
      item.coupon_num,
      item.quan_value,
      item.create_time
    ]);
    exportData.unshift(["券号", "券类型", "入库时间"]);

    // 生成文件名
    const today = getCurrentDay();
    let fileName = `${formData.quan_value}_${exportData.length - 1}张_${today}.xlsx`;

    // 下载Excel
    createExcelDown(exportData, fileName);

    loading.close();
    ElMessage.success("导出成功！");

    // 重新搜索数据，更新列表
    searchData();
  } catch (error) {
    console.warn("导出券失败", error);
    ElMessage.error("导出券失败");
  }
};

// 监听属性变化
watch(
  [() => props.appType, () => props.appName],
  ([newAppType, newAppName]) => {
    formData.app_name = newAppName;
    searchData();
  },
  { immediate: true }
);

const handleSizeChange = val => {
  currentPage.value = 1;
  searchData();
};

const handleCurrentChange = val => {
  searchData();
};

// 重置表单
const resetForm = () => {
  formData.app_name = "";
  formData.quan_value = "";
  formData.quan_status = "1";
  formData.coupon_num = "";
  currentPage.value = 1;
  pageSize.value = 10;
};

// 导入券
const handleImportClick = () => {
  if (!formData.quan_value) {
    ElMessage({
      type: "warning",
      message: "请先选择要导入的券类型"
    });
    return;
  }
  importInputRef.value?.click();
};

const handleFileChange = e => {
  const file = e.target.files?.[0];
  if (file) {
    importQuan(file);
  }
  e.target.value = "";
};

const importQuan = async file => {
  const loading = ElLoading.service({
    lock: true,
    text: "上传中",
    background: "rgba(0, 0, 0, 0.7)"
  });
  try {
    const res = await parseExcel(file);
    console.warn("解析表格文件返回", res);
    if (res) {
      let tableDate = [...(res.header ?? []), ...res.content];
      console.warn("表格内容数据", tableDate);
      let quanTypeInfo = quanType.value.find(
        item => item.quan_value == formData.quan_value
      );
      console.warn("要导入的券类型信息", quanTypeInfo);
      tableDate = tableDate
        .map(item => {
          const expire_time = item[1] ? String(item[1]).trim() : "";
          return {
            app_name: quanTypeInfo.app_name,
            coupon_num: item[0] ? String(item[0]).trim() : "",
            quan_value: quanTypeInfo.quan_value,
            quan_status: "1",
            create_time: getCurrentDay(),
            ...(expire_time && { expire_time })
          };
        })
        .filter(item => item.coupon_num);
      console.warn("最终组装好要上传的数据", tableDate);
      // 先查一下库里面的券过滤一下，如果存在该券已使用就不执行导入了
      let params = {
        quan_value: quanTypeInfo.quan_value,
        app_name: quanTypeInfo.app_name,
        haveQuans: tableDate.map(item => item.coupon_num).join(",")
      };
      let quanRes = await svApi.queryQuanRecordList(params);
      let quanList = quanRes?.data?.quanList || [];
      // 1-未使用 2-已绑定 3-绑定异常 4-正常券已导出 5-不可用券已导出
      quanList = quanList
        .filter(item => ["1", "2", "3"].includes(item.quan_status))
        .map(item => item.coupon_num);
      console.log("quanList", quanList);
      tableDate = tableDate.filter(item => !quanList.includes(item.coupon_num));
      console.log("tableDate", tableDate);
      if (!tableDate.length) {
        ElMessage({
          type: "warning",
          message: "导入失败，根据库里去重后没有可以导入的券"
        });
      } else {
        await svApi.batchAddQuan({
          addList: tableDate
        });
        ElMessage({
          type: "success",
          message: "导入成功，请查询券库存检查"
        });
        // 导入成功后重新搜索数据
        searchData();
      }
    }
    loading.close();
  } catch (error) {
    console.error("导入券异常", error);
    ElMessage({
      type: "warning",
      message: "导入失败，请联系技术解决"
    });
    loading.close();
  }
};

// 选中项
const multipleSelection = ref([]);

// 处理选择变化
const handleSelectionChange = val => {
  multipleSelection.value = val;
};

// 获取券类型列表
const getQuanTypeList = async () => {
  try {
    const params = {
      page_num: 1,
      page_size: 1000
    };
    const res = await svApi.queryQuanTypeList(params);
    let quanTypeList = res.data.quanTypeList || [];
    quanType.value = quanTypeList;
  } catch (error) {
    console.error("获取券类型列表异常", error);
  }
};

// 修改券状态
const editQuanStatus = row => {
  // 状态映射
  const statusMap = {
    1: "可用",
    2: "已绑定",
    3: "绑定异常",
    4: "正常券已导出",
    5: "不可用券已导出"
  };

  editStatusForm.id = row.id;
  editStatusForm.coupon_num = row.coupon_num;
  editStatusForm.currentStatus = statusMap[row.quan_status] || row.quan_status;
  editStatusForm.quan_status = row.quan_status;
  editStatusDialogVisible.value = true;
};

// 更新券状态
const updateQuanStatus = async () => {
  try {
    const loading = ElLoading.service({
      lock: true,
      text: "更新中",
      background: "rgba(0, 0, 0, 0.7)"
    });

    const params = {
      id: editStatusForm.id,
      quan_status: editStatusForm.quan_status
    };

    await svApi.updateQuanRecord(params);

    loading.close();
    ElMessage.success("状态更新成功");
    editStatusDialogVisible.value = false;
    searchData();
  } catch (error) {
    console.error("更新券状态失败", error);
    ElMessage.error("更新券状态失败");
  }
};

// 判断券是否即将到期（低于2个月）
const isExpireWarning = expireTime => {
  const now = new Date();
  const expireDate = new Date(expireTime);
  const diffTime = expireDate - now;
  const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30);
  return diffMonths < 2 && diffMonths > 0;
};

onBeforeMount(async () => {
  await getQuanTypeList();
  searchData();
});
</script>

<style scoped>
.demo-form-inline .el-form-item__content {
  flex: 1;
  min-width: 0;
}

.expire-warning {
  color: red;
  font-weight: bold;
}
</style>
