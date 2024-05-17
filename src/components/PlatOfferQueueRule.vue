<!-- 平台自动报价规则设置 -->
<template>
  <span>队列执行总开关：</span>
  <el-switch
    v-model="mainSwitch"
    @change="changeMainSwitch"
    size="large"
    active-text="启动"
    inactive-text="停止"
  />
  <el-button
    type="primary"
    style="margin-left: 20px"
    v-if="!mainSwitch"
    @click="oneClickAutoOffer"
    v-throttle
    >一键全部启动</el-button
  >
  <el-button type="primary" v-if="mainSwitch" @click="stopAutoOffer" v-throttle
    >一键停止</el-button
  >

  <el-table :data="displayItems" show-overflow-tooltip>
    <el-table-column prop="platName" label="平台名称">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{ row.platName }}</span>
        <el-input
          v-else
          v-model="editingRow.platName"
          @blur="saveEdit(row.id)"
        />
      </template>
    </el-table-column>
    <el-table-column prop="getInterval" label="订单获取间隔">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{ row.getInterval }}</span>
        <el-input-number
          v-else
          v-model.number="editingRow.getInterval"
          controls-position="right"
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
    <el-table-column prop="platToken" label="平台Token">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{ row.platToken }}</span>
        <el-input
          v-else
          v-model="editingRow.platToken"
          show-password
          @blur="saveEdit(row.id)"
        />
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
import { ElMessageBox, ElMessage } from "element-plus";
import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
import offerQueue from "@/common/useLierenOffer";
// console.log("offerQueue===>", offerQueue);
const tableDataStore = usePlatTableDataStore();
const displayItems = computed(() => tableDataStore.items);

const platLinkApp = {
  lieren: ["sfc"]
};

// 正在编辑id
const editingRowId = ref(null);
// 正在编辑内容
const editingRow = ref({});
// 队列总开关
const mainSwitch = ref(false);

// 一键启动
const oneClickAutoOffer = () => {
  ElMessageBox.confirm("确定要一键全部启动吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning"
  })
    .then(() => {
      console.warn("一键启动全部自动报价队列");
      tableDataStore.items = tableDataStore.items.map(item => {
        item.isEnabled = true;
        return item;
      });
      console.log("tableDataStore.items", tableDataStore.items);
      offerQueue.start();
    })
    .catch(() => {});
};
// 一键停止
const stopAutoOffer = () => {
  ElMessageBox.confirm("确定要一键停止吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning"
  })
    .then(() => {
      console.warn("一键停止自动报价队列");
      offerQueue.stop();
    })
    .catch(() => {});
};
// 队列总开关改变
const changeMainSwitch = () => {
  if (mainSwitch.value) {
    oneClickAutoOffer();
  } else {
    stopAutoOffer();
  }
};

// 单个启动或停止
const singleStartOrStop = ({ id, platToken, platName }, flag) => {
  // 单个启动
  if (!mainSwitch.value && flag === 1) {
    if (platName === "lieren") {
    }
    offerQueue.start(platToken);
  }
  tableDataStore.toggleEnable(id);
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
