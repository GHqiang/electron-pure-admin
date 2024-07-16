<!-- app自动出票规则设置 -->
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
  <el-button type="primary" @click="isAutoTransfer = !isAutoTransfer">{{
    !isAutoTransfer ? "开启自动转单" : "关闭自动转单"
  }}</el-button>

  <el-button type="primary" @click="isCollapse = !isCollapse">{{
    !isCollapse ? "展开" : "收起"
  }}</el-button>
  <el-table v-if="isCollapse" :data="displayItems" border show-overflow-tooltip>
    <el-table-column prop="appName" label="影院名称">
      <template #default="{ row, $index }">
        <span v-if="row.id !== editingRowId">{{
          shadowLineObj[row.appName]
        }}</span>
        <el-select
          v-else
          v-model="editingRow.appName"
          placeholder="影院名称"
          clearable
        >
          <el-option
            v-for="(keyValue, keyName) in shadowLineObj"
            :key="keyName"
            :label="keyValue"
            :value="keyName"
          />
        </el-select>
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
import { ref, computed, watch } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";
import svApi from "@/api/sv-api";
import { useAppRuleListStore } from "@/store/appTicketRuleTable";
import createTicketQueue from "@/common/autoTicket/sfcAutoTicket";
import { APP_LIST } from "@/common/constant.js";
import {
  getCinemaLoginInfoList,
  getCurrentFormattedDateTime
} from "@/utils/utils";
import { useStayTicketList } from "@/store/stayTicketList";
const stayTicketList = useStayTicketList();
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

// 影线列表
const shadowLineObj = APP_LIST;

// 是否展开
const isCollapse = ref(true);
// 是否自动转单
let isOpen = localStorage.getItem("isAutoTransfer") == 1;
const isAutoTransfer = ref(isOpen ? true : false);
if (isOpen) {
  window.localStorage.setItem("isAutoTransfer", 1);
}
watch(isAutoTransfer, (newVal, oldVal) => {
  console.log(`isAutoTransfer 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isAutoTransfer", newVal ? "1" : "0");
});

// 正在编辑id
const editingRowId = ref(null);
// 正在查看id
const viewRowId = ref(null);
// 正在编辑内容
const editingRow = ref({});

// 队列集合
const appTicketQueueObj = {};
// token集合
const appTokenObj = {};

window.sfcQueue = appTicketQueueObj["sfc"];
const delay = delayTime => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, delayTime);
  });
};

// 批量绑定优惠券程序
window.testBandquan = async () => {
  let quanList = (window.quanList || []).slice(0);
  console.log(quanList, "quanList");
  let successNum = 0;
  for (let index = 0; index < quanList.length; index++) {
    const coupon_num = quanList[index];
    await delay(200);
    const quan = await window.sfcQueue.bandQuan({
      city_id: "304",
      cinema_id: "33",
      coupon_num
    });
    if (quan) {
      successNum++;
    }
    if (successNum > 30) {
      console.log("成功数已达30", quan, index);
      return;
    }
  }
  console.log("执行成功数", successNum);
};
// console.log("appTokenObj", appTokenObj);
// console.log("appTicketQueueObj", appTicketQueueObj);
// 一键启动
const oneClickAutoOffer = () => {
  let loginInfoList = getCinemaLoginInfoList();
  // 填充token及队列集合
  Object.keys(APP_LIST).forEach(item => {
    let obj = loginInfoList.find(
      itemA => itemA.app_name === item && itemA.session_id
    );
    appTokenObj[item] = obj?.session_id || "";
    appTicketQueueObj[item] = createTicketQueue(item);
  });
  let noSetMemberPwdList = tableDataStore.items.filter(item => {
    let obj = loginInfoList.some(
      itemA => itemA.app_name === item.appName && !itemA.member_pwd
    );
    return obj;
  });
  console.warn("未设置会员卡密码的影院列表", noSetMemberPwdList);
  if (noSetMemberPwdList.length) {
    ElMessage.error("有会员卡密码未设置，请先去维护影院登录信息后再启动");
    return;
  }
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
      stayTicketList.removeStayTicketListByApp();
      tableDataStore.items.forEach(item => {
        if (appTokenObj[item.appName]) {
          item.isEnabled = true;
          appTicketQueueObj[item.appName].start();
        }
      });
      svApi.updateUser({
        app_ticket_queue: JSON.stringify(tableDataStore.items),
        ticket_queue_time: getCurrentFormattedDateTime()
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
    let loginInfoList = getCinemaLoginInfoList();
    let obj = loginInfoList.find(
      itemA => itemA.app_name === appName && itemA.member_pwd
    );
    let pwd = obj?.member_pwd;
    // console.log("pwd", pwd);
    if (!pwd) {
      ElMessage.error("会员卡密码未设置，请先去设置后再启动");
      return;
    }
    Object.keys(APP_LIST).forEach(item => {
      let obj = loginInfoList.find(
        itemA => itemA.app_name === item && itemA.session_id
      );
      appTokenObj[item] = obj?.session_id || "";
      appTicketQueueObj[item] = createTicketQueue(item);
    });
    if (!appTokenObj[appName]) {
      ElMessage.error(appName + "未登录，请先去影院登录页面登录后再启动");
      return;
    }
    tableDataStore.toggleEnable(id);
    // 过滤清空当前影院本地缓存的待出票数据
    stayTicketList.removeStayTicketListByApp(appName);
    appTicketQueueObj[appName].start();
  } else {
    // 单个停止
    tableDataStore.toggleEnable(id);
    appTicketQueueObj[appName].stop();
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
<style scoped>
:deep(.el-icon) {
  font-size: 20px;
  vertical-align: top;
  margin: 0 10px;
}
</style>
