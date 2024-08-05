<!-- 平台自动报价队列规则列表 -->
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

  <el-table :data="displayItems" border show-overflow-tooltip>
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
            v-for="(keyValue, keyName) in ORDER_FORM"
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
          @blur="saveEdit(row.id)"
        />
      </template>
    </el-table-column>
    <el-table-column label="队列执行状态">
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
import { ref, computed, onBeforeMount } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";
import svApi from "@/api/sv-api";
import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
import lierenOfferQueue from "@/common/autoOffer/useLierenOffer";
import shengOfferQueue from "@/common/autoOffer/useShengOffer";
import mangguoOfferQueue from "@/common/autoOffer/useMangguoOffer";
import mayiOfferQueue from "@/common/autoOffer/useMayiOffer";
import yangcongOfferQueue from "@/common/autoOffer/useYangcongOffer";
import hahaOfferQueue from "@/common/autoOffer/useHahaOffer";
import { ORDER_FORM, APP_LIST } from "@/common/constant";
import {
  getCinemaLoginInfoList,
  getCurrentFormattedDateTime
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();
const tableDataStore = usePlatTableDataStore();
const displayItems = computed(() => tableDataStore.items);
// 是否显示一键启动
const isActiveOneClickStart = computed(() => {
  return !isActiveOneClickStop.value;
});

// 是否显示一键停止
const isActiveOneClickStop = computed(() => {
  return tableDataStore.items.filter(item => item.isEnabled).length > 0;
});
// 正在编辑id
const editingRowId = ref(null);
// 正在编辑内容
const editingRow = ref({});

// token集合
const appTokenObj = {};
// 填充token及队列集合

// 是否启动队列（该为false可进行测试用户）
let isStartQueue = true;

// 平台报价队列集合
let platOfferQueueObj = {
  lieren: lierenOfferQueue,
  mangguo: lierenOfferQueue,
  mayi: mayiOfferQueue,
  yangcong: yangcongOfferQueue,
  haha: hahaOfferQueue,
  sheng: shengOfferQueue
};

window.offerQueueObj = platOfferQueueObj;

// 设置平台token方法集合
let setPlatFunObj = {
  lieren: tokens.setLierenPlatToken,
  mangguo: tokens.setMangguoPlatToken,
  mayi: tokens.setMayiPlatToken,
  yangcong: tokens.setYangcongPlatToken,
  haha: tokens.setHahaPlatToken,
  sheng: () => {}
};

// 一键启动
const oneClickAutoOffer = () => {
  let loginInfoList = getCinemaLoginInfoList();
  Object.keys(APP_LIST).forEach(item => {
    let obj = loginInfoList.find(
      itemA => itemA.app_name === item && itemA.session_id
    );
    appTokenObj[item] = obj?.session_id || "";
  });
  // shengOfferQueue.start();
  ElMessageBox.confirm("确定要一键全部启动吗?", "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false
  })
    .then(async () => {
      let isStart = true;
      tableDataStore.items.forEach(item => {
        let platToken = displayItems.value.find(
          itemA => itemA.platName === item.platName
        )?.platToken;
        if (!platToken && item.platName !== "sheng") {
          isStart = false;
        } else {
          tableDataStore.toggleEnable(item.id);
          setPlatFunObj[item.platName](platToken);
          isStartQueue && platOfferQueueObj[item.platName].start();
        }
      });
      if (isStart) {
        console.warn("一键启动全部自动报价队列");
        svApi.updateUser({
          plat_offer_queue: JSON.stringify(tableDataStore.items),
          offer_queue_time: getCurrentFormattedDateTime()
        });
      } else {
        ElMessage.warning("有平台token未设置，请先设置再启动");
      }
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
      console.warn("一键停止自动报价队列");
      tableDataStore.items.forEach(item => {
        item.isEnabled = false;
      });
    })
    .catch(() => {});
};

// 单个启动或停止
const singleStartOrStop = ({ id, platToken, platName }, flag) => {
  // 单个启动
  if (flag === 1) {
    tableDataStore.toggleEnable(id);
    setPlatFunObj[platName](platToken);
    isStartQueue && platOfferQueueObj[platName].start();
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
    const { platToken, platName } = editingRow.value;
    platToken && setPlatFunObj[platName](platToken);
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
onBeforeMount(() => {
  // const socket = new WebSocket("ws://localhost:3000");
  // socket.addEventListener("message", function (event) {
  //   console.log("Message from server ", event.data);
  // });
});
</script>
