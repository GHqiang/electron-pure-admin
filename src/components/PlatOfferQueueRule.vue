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
import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
import lierenOfferQueue from "@/common/autoOffer/useLierenOffer";
import { PLAT_LINK_APP, APP_LIST } from "@/common/constant";
import { appUserInfo } from "@/store/appUserInfo";
const userInfoAndTokens = appUserInfo();
const { allUserInfo } = userInfoAndTokens;

const tableDataStore = usePlatTableDataStore();
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

// token集合
const appTokenObj = {};
// 填充token及队列集合
Object.keys(APP_LIST).forEach(item => {
  appTokenObj[item] = allUserInfo[item]?.session_id || "";
});
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
      console.warn("一键启动全部自动报价队列");
      tableDataStore.items.forEach(item => {
        item.isEnabled = true;
        if (item.platName === "lieren") {
          let platToken = displayItems.value.find(
            item => item.platName === "lieren"
          )?.platToken;
          lierenOfferQueue.start(platToken);
        }
      });
      svApi.updateUser({
        plat_offer_queue: JSON.stringify(tableDataStore.items)
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
    const checkToken = PLAT_LINK_APP[platName];
    const noTokenByApp = checkToken.filter(item => !appTokenObj[item]);
    let noTokenByAppName = noTokenByApp.map(item => APP_LIST[item]);
    if (noTokenByAppName.length) {
      ElMessageBox.confirm(
        noTokenByAppName.join("，") + " 未登录，确定仍要启动报价吗?",
        "提示",
        {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "warning",
          showClose: false,
          closeOnClickModal: false,
          closeOnPressEscape: false
        }
      )
        .then(() => {
          tableDataStore.toggleEnable(id);
          lierenOfferQueue.start(platToken);
        })
        .catch(() => {});
    } else {
      tableDataStore.toggleEnable(id);
      lierenOfferQueue.start(platToken);
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
