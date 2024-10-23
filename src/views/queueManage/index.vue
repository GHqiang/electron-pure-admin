<template>
  <div class="auto-ticket">
    <div style="margin-bottom: 12px">
      <el-button
        v-if="isActiveOneClickStart"
        v-throttle
        type="primary"
        @click="oneClickStart"
        >一键全部启动</el-button
      >
      <el-button
        v-if="isActiveOneClickStop"
        v-throttle
        type="primary"
        :style="{ marginLeft: isActiveOneClickStart ? '20px' : 0 }"
        @click="oneClickStop"
        >一键停止</el-button
      >
      <el-button type="primary" @click="isOverrunOffer = !isOverrunOffer">{{
        !isOverrunOffer ? "开启超限报价" : "关闭超限报价"
      }}</el-button>

      <el-button type="primary" @click="isAnomaly = !isAnomaly">{{
        !isAnomaly ? "开启sfc故障检测" : "关闭sfc故障检测"
      }}</el-button>

      <el-button type="primary" @click="isAutoTransfer = !isAutoTransfer">{{
        !isAutoTransfer ? "开启自动转单" : "关闭自动转单"
      }}</el-button>

      <el-button type="primary" @click="getQuanInventory">查询券库存</el-button>
    </div>

    <el-table :data="platQueueList" border show-overflow-tooltip>
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
            v-if="platQueueList.length > 1"
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

    <el-dialog v-model="dialogQuanVisible" title="服务器券库存" width="800">
      <el-table :data="quanData" border>
        <el-table-column type="index" label="序号" width="120" />
        <el-table-column property="quan_value" sortable label="券类型">
          <template #default="{ row }">
            <span>{{ QUAN_TYPE[row.quan_value] }}</span>
          </template>
        </el-table-column>
        <el-table-column property="remaining_count" sortable label="数量" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeMount, watch } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";
import svApi from "@/api/sv-api";

// 平台报价执行队列
import lierenOfferQueue from "@/common/autoOffer/useLierenOffer";
import shengOfferQueue from "@/common/autoOffer/useShengOffer";
import mangguoOfferQueue from "@/common/autoOffer/useMangguoOffer";
import mayiOfferQueue from "@/common/autoOffer/useMayiOffer";
import yangcongOfferQueue from "@/common/autoOffer/useYangcongOffer";
import yinghuasuanOfferQueue from "@/common/autoOffer/useYinghuasuanOffer";
import shangzhanOfferQueue from "@/common/autoOffer/useShangzhanOffer";
import hahaOfferQueue from "@/common/autoOffer/useHahaOffer";

// 平台待出票订单执行队列
import lierenFetchOrder from "@/common/orderFetch/lierenFetchOrder";
import shengFetchOrder from "@/common/orderFetch/shengFetchOrder";
import mangguoFetchOrder from "@/common/orderFetch/mangguoFetchOrder";
import mayiFetchOrder from "@/common/orderFetch/mayiFetchOrder";
import yangcongFetchOrder from "@/common/orderFetch/yangcongFetchOrder";
import yinghuasuanFetchOrder from "@/common/orderFetch/yinghuasuanFetchOrder";
import shangzhanFetchOrder from "@/common/orderFetch/shangzhanFetchOrder";
import hahaFetchOrder from "@/common/orderFetch/hahaFetchOrder";

import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
import createTucketQueueFun from "@/common/autoTicket/comTicketHandle";
import { ORDER_FORM, APP_LIST, QUAN_TYPE } from "@/common/constant";
import {
  getCinemaLoginInfoList,
  getCurrentFormattedDateTime,
  logUpload
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();
const tableDataStore = usePlatTableDataStore();
const platQueueList = computed(() => tableDataStore.items);

// 是否显示一键启动
const isActiveOneClickStart = computed(() => {
  return !isActiveOneClickStop.value;
});

// 是否显示一键停止
const isActiveOneClickStop = computed(() => {
  return tableDataStore.items.filter(item => item.isEnabled).length > 0;
});

// 是否超限报价
let isOpenOverrunOffer = localStorage.getItem("isOverrunOffer") == 1;
const isOverrunOffer = ref(isOpenOverrunOffer ? true : false);
watch(isOverrunOffer, (newVal, oldVal) => {
  console.log(`isOverrunOffer 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isOverrunOffer", newVal ? "1" : "0");
});

// 是否sfc故障检测
let isOpenAnomaly = localStorage.getItem("isAnomaly") == 1;
const isAnomaly = ref(isOpenAnomaly ? true : false);
watch(isAnomaly, (newVal, oldVal) => {
  console.log(`isAnomaly 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isAnomaly", newVal ? "1" : "0");
});

// 是否自动转单
let isOpen = localStorage.getItem("isAutoTransfer") == 1;
const isAutoTransfer = ref(isOpen ? true : false);
watch(isAutoTransfer, (newVal, oldVal) => {
  console.log(`isAutoTransfer 的值从 '${oldVal}' 变为 '${newVal}'`);
  window.localStorage.setItem("isAutoTransfer", newVal ? "1" : "0");
});

// 券库存弹框
const dialogQuanVisible = ref(false);
const quanData = ref([]); // 券库存列表
// 平台报价队列集合
let platOfferQueueObj = {
  lieren: lierenOfferQueue,
  mangguo: mangguoOfferQueue,
  mayi: mayiOfferQueue,
  yangcong: yangcongOfferQueue,
  yinghuasuan: yinghuasuanOfferQueue,
  shangzhan: shangzhanOfferQueue,
  haha: hahaOfferQueue,
  sheng: shengOfferQueue
};

// 平台获取待出票订单队列集合
let platFetchOrderQueueObj = {
  lieren: lierenFetchOrder,
  mangguo: mangguoFetchOrder,
  mayi: mayiFetchOrder,
  yangcong: yangcongFetchOrder,
  yinghuasuan: yinghuasuanFetchOrder,
  shangzhan: shangzhanFetchOrder,
  haha: hahaFetchOrder,
  sheng: shengFetchOrder
};

// 平台出票队列集合
let appTicketQueueObj = {};
Object.keys(APP_LIST).forEach(item => {
  appTicketQueueObj[item] = createTucketQueueFun(item);
});
window.appTicketQueueObj = appTicketQueueObj;

window.offerQueueObj = platOfferQueueObj;
window.platFetchOrderQueueObj = platFetchOrderQueueObj;

// 设置平台token方法集合
let setPlatFunObj = {
  lieren: tokens.setLierenPlatToken,
  mangguo: tokens.setMangguoPlatToken,
  mayi: tokens.setMayiPlatToken,
  yangcong: tokens.setYangcongPlatToken,
  yinghuasuan: tokens.setYinghuasuanPlatToken,
  shangzhan: tokens.setShangzhanPlatToken,
  haha: tokens.setHahaPlatToken,
  sheng: tokens.setShengPlatToken
};

// 是否启动队列（该为false可进行测试用户）
let isStartOffer = true; // 报价队列
let isStartFetch = true; // 待出票获取队列
let isStartTicket = true; // 自动出票队列

// 一键启动
const oneClickStart = () => {
  // 删除没有登录信息的队列
  let loginInfoList = getCinemaLoginInfoList();
  Object.keys(APP_LIST).forEach(item => {
    let obj = loginInfoList.find(
      itemA => itemA.app_name === item && itemA.session_id
    );
    if (!obj) {
      delete appTicketQueueObj[item];
    }
  });

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
      platQueueList.value.forEach(item => {
        if (!item.platToken) {
          isStart = false;
        } else {
          tableDataStore.toggleEnable(item.id);
          setPlatFunObj[item.platName](item.platToken);
          isStartOffer && platOfferQueueObj[item.platName].start();
          isStartFetch && platFetchOrderQueueObj[item.platName].start();
        }
      });

      Object.keys(appTicketQueueObj).forEach(item => {
        isStartTicket && appTicketQueueObj[item].start();
      });
      if (isStart) {
        console.warn("一键启动自动出票队列");
        svApi.updateUser({
          plat_offer_queue: JSON.stringify(tableDataStore.items),
          offer_queue_time: getCurrentFormattedDateTime()
        });
        logUpload({ plat_name: "", type: 1 }, [
          {
            opera_time: getCurrentFormattedDateTime(),
            des: "一键启动队列",
            level: "info",
            info: {
              queue: JSON.stringify(tableDataStore.items)
            }
          }
        ]);
      } else {
        ElMessage.warning("有平台token未设置，请先设置再启动");
      }
    })
    .catch(() => {});
};

// 一键停止
const oneClickStop = () => {
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
        isStartOffer && platOfferQueueObj[item.platName].stop();
        isStartFetch && platFetchOrderQueueObj[item.platName].stop();
      });

      Object.keys(appTicketQueueObj).forEach(item => {
        isStartTicket && appTicketQueueObj[item].stop();
      });
      svApi.updateUser({
        plat_offer_queue: JSON.stringify(tableDataStore.items),
        offer_queue_time: getCurrentFormattedDateTime()
      });
      logUpload({ plat_name: "", type: 1 }, [
        {
          opera_time: getCurrentFormattedDateTime(),
          des: "一键停止队列",
          level: "info",
          info: {
            queue: JSON.stringify(tableDataStore.items)
          }
        }
      ]);
    })
    .catch(() => {});
};

// 单个启动或停止
const singleStartOrStop = ({ id, platToken, platName }, flag) => {
  let otherPlatQueueList = tableDataStore.items.filter(
    item => item.platName !== platName
  );
  // 单个启动
  if (flag === 1) {
    if (!platToken) {
      ElMessage.warning("请先设置平台token后再启动");
      return;
    }
    tableDataStore.toggleEnable(id);
    setPlatFunObj[platName](platToken);
    isStartOffer && platOfferQueueObj[platName].start();
    isStartFetch && platFetchOrderQueueObj[platName].start();
    // 删除没有登录信息的队列
    let loginInfoList = getCinemaLoginInfoList();
    Object.keys(APP_LIST).forEach(item => {
      let obj = loginInfoList.find(
        itemA => itemA.app_name === item && itemA.session_id
      );
      if (!obj) {
        delete appTicketQueueObj[item];
      }
    });
    // 其它没有一个启动的再停止
    if (!otherPlatQueueList.some(item => item.isEnabled)) {
      Object.keys(appTicketQueueObj).forEach(item => {
        isStartTicket && appTicketQueueObj[item].start();
      });
    }
  } else {
    // 单个停止
    tableDataStore.toggleEnable(id);
    isStartOffer && platOfferQueueObj[platName].stop();
    isStartFetch && platFetchOrderQueueObj[platName].stop();
    // 其它没有一个启动的再停止
    if (!otherPlatQueueList.some(item => item.isEnabled)) {
      Object.keys(appTicketQueueObj).forEach(item => {
        isStartTicket && appTicketQueueObj[item].stop();
      });
    }
  }
  svApi.updateUser({
    plat_offer_queue: JSON.stringify(tableDataStore.items),
    offer_queue_time: getCurrentFormattedDateTime()
  });
  logUpload({ plat_name: platName, type: 1 }, [
    {
      opera_time: getCurrentFormattedDateTime(),
      des: `单个${flag !== 1 ? "停止" : "启动"}队列`,
      level: "info",
      info: {
        queue: JSON.stringify(tableDataStore.items)
      }
    }
  ]);
};

// 查询券库存
const getQuanInventory = async () => {
  try {
    const res = await svApi.queryQuanInventory();
    console.warn("查询券库存返回", res);
    let quanList = res.data?.quanList;
    dialogQuanVisible.value = true;
    quanData.value = quanList;
  } catch (error) {
    console.warn("查询券库存返回异常", error);
  }
};
// 正在编辑id
const editingRowId = ref(null);
// 正在编辑内容
const editingRow = ref({});
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
