<!-- app自动出票规则设置 -->
<template>
  <el-button
    type="primary"
    v-if="isActiveOneClickStart"
    @click="oneClickAutoOffer"
    v-throttle
    >一键全部启动</el-button
  >
  <el-button
    type="primary"
    :style="{ marginLeft: isActiveOneClickStart ? '20px' : 0 }"
    v-if="isActiveOneClickStop"
    @click="stopAutoOffer"
    v-throttle
    >一键停止</el-button
  >

  <el-table :data="displayItems" show-overflow-tooltip>
    <el-table-column prop="appName" label="影院名称">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{ row.appName }}</span>
        <el-input
          v-else
          v-model="editingRow.appName"
          @blur="saveEdit(row.id)"
        />
      </template>
    </el-table-column>
    <el-table-column prop="handleInterval" label="订单执行间隔">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{ row.handleInterval }}</span>
        <el-input-number
          v-else
          v-model.number="editingRow.handleInterval"
          controls-position="right"
          @blur="saveEdit(row.id)"
        />
      </template>
    </el-table-column>
    <el-table-column label="影院Token">
      <template #default="{ row, $index }">
        <span v-if="row.appName === 'sfc'">{{ sfcToken }}</span>
        <span v-if="row.appName === 'lumiai'">{{ lmaToken }}</span>
      </template>
    </el-table-column>
    <el-table-column label="队列执行状态">
      <template #default="{ row }">
        <el-switch disabled v-model="row.isEnabled" />
      </template>
    </el-table-column>
    <el-table-column label="操作" width="210">
      <template #default="{ row, $index }">
        <el-popconfirm
          title="确定启动吗？"
          v-if="!row.isEnabled && row.id !== editingRowId"
          @confirm="singleStartOrStop(row, 1)"
        >
          <template #reference>
            <el-button size="small" type="success">启动</el-button>
          </template>
        </el-popconfirm>

        <el-popconfirm
          title="确定停止吗？"
          v-if="row.isEnabled"
          @confirm="singleStartOrStop(row, 2)"
        >
          <template #reference>
            <el-button size="small" type="danger">停止</el-button>
          </template>
        </el-popconfirm>

        <el-button
          type="primary"
          v-if="$index === 0 && row.id !== editingRowId"
          @click="addNewItem"
          size="small"
          >新增</el-button
        >
        <el-button
          v-if="row.id !== editingRowId"
          size="small"
          @click="startEdit(row)"
          >编辑</el-button
        >
        <el-button
          v-if="row.id === editingRowId"
          size="small"
          @click="cancelEdit"
          >取消</el-button
        >
        <el-button
          v-if="row.id === editingRowId"
          size="small"
          type="success"
          @click="saveEdit(row.id)"
          >保存</el-button
        >
        <el-popconfirm
          title="确定删除吗？"
          v-if="displayItems.length > 1"
          @confirm="deleteItem(row.id)"
        >
          <template #reference>
            <el-button size="small" type="danger">删除</el-button>
          </template>
        </el-popconfirm>
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { ElMessageBox, ElMessage } from "element-plus";
import { useAppRuleListStore } from "@/store/appTicketRuleTable";
import sfcTicketQueue from "@/common/autoTicket/sfcAutoTicket";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
const { sfcToken, lmaToken } = storeToRefs(userInfoAndTokens);

const tableDataStore = useAppRuleListStore();
const displayItems = computed(() => tableDataStore.items);

// 是否显示一键启动
const isActiveOneClickStart = computed(() => {
  return (
    tableDataStore.items.filter(item => item.isEnabled).length <
    tableDataStore.items.length
  );
});

// 是否显示一键停止
const isActiveOneClickStop = computed(() => {
  return tableDataStore.items.filter(item => item.isEnabled).length > 0;
});
// 正在编辑id
const editingRowId = ref(null);
// 正在编辑内容
const editingRow = ref({});

// 一键启动
const oneClickAutoOffer = () => {
  ElMessageBox.confirm("确定要一键全部启动吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(() => {
      console.warn("一键启动全部自动出票队列");
      tableDataStore.items.forEach(item => {
        if (item.appName === "sfc" && sfcToken.value) {
          item.isEnabled = true;
          sfcTicketQueue.start();
        } else if (item.appName === "lumiai" && lmaToken.value) {
          console.log("lumiai==");
          item.isEnabled = true;
        }
      });
    })
    .catch(() => {});
};
// 一键停止
const stopAutoOffer = () => {
  ElMessageBox.confirm("确定要一键停止吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(() => {
      console.warn("一键停止自动出票队列");
      tableDataStore.items.forEach(item => {
        item.isEnabled = false;
      });
    })
    .catch(() => {});
};

// 单个启动或停止
const singleStartOrStop = ({ id, appName }, flag) => {
  // 单个启动
  if (flag === 1) {
    let sfcCheckFail = appName === "sfc" && !sfcToken.value;
    let lmaCheckFail = appName === "lumiai" && !lmaToken.value;
    if (sfcCheckFail || lmaCheckFail) {
      ElMessage.error(appName + "未登录，请先去影院登录页面登录后再启动");
      return;
    }
    tableDataStore.toggleEnable(id);
    if (appName === "sfc") {
      sfcTicketQueue.start();
    } else if (appName === "lumiai") {
      console.log("lmaToken===>", lmaToken);
    }
  } else {
    // 单个停止
    tableDataStore.toggleEnable(id);
  }
};

// 添加新增按钮的处理函数
const addNewItem = () => {
  tableDataStore.addNewItem();
};
// 开始编辑
const startEdit = row => {
  editingRowId.value = row.id;
  editingRow.value = { ...row };
};
// 保存编辑
const saveEdit = id => {
  if (id === editingRowId.value) {
    tableDataStore.saveEdit(editingRow.value);
    editingRowId.value = null;
  }
};
// 删除
const deleteItem = id => {
  tableDataStore.deleteItem(id);
};
// 取消
const cancelEdit = () => {
  editingRowId.value = null;
};
</script>
