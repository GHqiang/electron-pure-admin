<!-- 平台自动获取订单队列规则列表 -->
<template>
  <el-button
    v-if="isActiveOneClickStart"
    v-throttle
    type="primary"
    @click="oneClickAutoOffer"
    >一键全部启动</el-button
  >
  <el-button
    v-if="isActiveOneClickStop"
    v-throttle
    type="primary"
    :style="{ marginLeft: isActiveOneClickStart ? '20px' : 0 }"
    @click="stopAutoOffer"
    >一键停止</el-button
  >
  <el-button type="primary" @click="isCollapse = !isCollapse">{{
    !isCollapse ? "展开" : "收起"
  }}</el-button>
  <el-table v-if="isCollapse" :data="displayItems" border show-overflow-tooltip>
    <el-table-column prop="platName" label="平台名称">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{ row.platName }}</span>
        <el-select
          v-else
          v-model="editingRow.platName"
          placeholder="平台名称"
          clearable
        >
          <el-option
            v-for="(keyValue, keyName) in orderFormObj"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
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
    <el-table-column label="状态">
      <template #default="{ row }">
        <el-switch v-model="row.isEnabled" disabled />
      </template>
    </el-table-column>
    <el-table-column label="操作" width="270">
      <template #default="{ row, $index }">
        <el-popconfirm
          v-if="!row.isEnabled && row.id !== editingRowId"
          title="确定启动吗？"
          @confirm="singleStartOrStop(row, 1)"
        >
          <template #reference>
            <el-button size="small" type="success">启动</el-button>
          </template>
        </el-popconfirm>

        <el-popconfirm
          v-if="row.isEnabled"
          title="确定停止吗？"
          @confirm="singleStartOrStop(row, 2)"
        >
          <template #reference>
            <el-button size="small" type="danger">停止</el-button>
          </template>
        </el-popconfirm>

        <el-button
          v-if="$index === 0 && row.id !== editingRowId"
          type="primary"
          size="small"
          @click="addNewItem"
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
          v-if="displayItems.length > 1"
          title="确定删除吗？"
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
import svApi from "@/api/sv-api";
import { usePlatFetchOrderStore } from "@/store/platOfferRuleTable";
import lierenFetchOrder from "@/common/orderFetch/lierenFetchOrder";
import shengFetchOrder from "@/common/orderFetch/shengFetchOrder";
import mangguoFetchOrder from "@/common/orderFetch/mangguoFetchOrder";
import mayiFetchOrder from "@/common/orderFetch/mayiFetchOrder";
import yangcongFetchOrder from "@/common/orderFetch/yangcongFetchOrder";
import hahaFetchOrder from "@/common/orderFetch/hahaFetchOrder";

import { ORDER_FORM } from "@/common/constant.js";
import { getCurrentFormattedDateTime } from "@/utils/utils";
const tableDataStore = usePlatFetchOrderStore();
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

// 订单来源
const orderFormObj = ORDER_FORM;
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
        // console.log("item", item, item.platName);
        tableDataStore.toggleEnable(item.id);
        if (item.platName === "lieren") {
          lierenFetchOrder.start();
        }
        if (item.platName === "sheng") {
          shengFetchOrder.start();
        }
        if (item.platName === "mangguo") {
          mangguoFetchOrder.start();
        }
        if (item.platName === "mayi") {
          mayiFetchOrder.start();
        }
        if (item.platName === "yangcong") {
          yangcongFetchOrder.start();
        }
        if (item.platName === "haha") {
          hahaFetchOrder.start();
        }
      });
      svApi.updateUser({
        order_fetch_queue: JSON.stringify(tableDataStore.items),
        fetch_queue_time: getCurrentFormattedDateTime()
      });
    })
    .catch(err => {
      console.error("一键启动订单获取队列报错", err);
    });
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
const singleStartOrStop = ({ id, platName }, flag) => {
  if (flag === 1) {
    if (platName === "lieren") {
      tableDataStore.toggleEnable(id);
      lierenFetchOrder.start();
    }
    if (platName === "sheng") {
      tableDataStore.toggleEnable(id);
      shengFetchOrder.start();
    }
    if (platName === "mangguo") {
      tableDataStore.toggleEnable(id);
      mangguoFetchOrder.start();
    }
    if (platName === "mayi") {
      tableDataStore.toggleEnable(id);
      mayiFetchOrder.start();
    }
    if (platName === "yangcong") {
      tableDataStore.toggleEnable(id);
      yangcongFetchOrder.start();
    }
    if (platName === "haha") {
      tableDataStore.toggleEnable(id);
      hahaFetchOrder.start();
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
