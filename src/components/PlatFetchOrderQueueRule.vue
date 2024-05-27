<!-- 平台自动获取订单队列规则列表 -->
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
  <el-button type="primary" @click="isCollapse = !isCollapse">{{
    !isCollapse ? "展开" : "收起"
  }}</el-button>
  <el-table :data="displayItems" v-if="isCollapse" show-overflow-tooltip>
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
    <el-table-column label="状态">
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
import { usePlatFetchOrderStore } from "@/store/platOfferRuleTable";
import lierenFetchOrder from "@/common/orderFetch/lierenFetchOrder";

const tableDataStore = usePlatFetchOrderStore();
const displayItems = computed(() => tableDataStore.items);
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const platTokenInfo = platTokens();
// const { lierenToken } = storeToRefs(platTokenInfo);
const { lierenToken, setLierenPlatToken } = platTokenInfo;

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

// 是否展开
const isCollapse = ref(true);
// 正在编辑id
const editingRowId = ref(null);
// 正在编辑内容
const editingRow = ref({});

// 一键启动
const oneClickAutoOffer = () => {
  ElMessageBox.confirm("确定要一键启动吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(() => {
      console.warn("一键启动订单自动获取队列");
      tableDataStore.items.forEach(item => {
        item.isEnabled = true;
        if (item.platName === "lieren") {
          if (!lierenToken) {
            setLierenPlatToken(platToken);
          }
          lierenFetchOrder.start();
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
      console.warn("一键停止订单自动获取队列");
      tableDataStore.items.forEach(item => {
        item.isEnabled = false;
      });
    })
    .catch(() => {});
};

// 单个启动或停止
const singleStartOrStop = ({ id, platToken, platName }, flag) => {
  if (flag === 1) {
    if (platName === "lieren") {
      if (!lierenToken) {
        setLierenPlatToken(platToken);
      }
      tableDataStore.toggleEnable(id);
      lierenFetchOrder.start();
    }
  } else {
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
