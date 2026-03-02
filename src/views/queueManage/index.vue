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
      <el-button
        v-if="isActiveSyncYangcong"
        v-throttle
        type="primary"
        :style="{ marginLeft: '20px' }"
        :loading="syncYangcongLoading"
        @click="syncYangcongCinemaList()"
        >同步洋葱影院列表</el-button
      >
    </div>

    <el-table :data="platQueueList" border show-overflow-tooltip>
      <el-table-column prop="platName" label="平台名称">
        <template #default="{ row }">
          <span v-if="row.id !== editingRowId">{{
            ORDER_FORM[row.platName]
          }}</span>
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
        <template #default="{ row }">
          <span v-if="row.id !== editingRowId">{{ row.getInterval }}</span>
          <el-input-number
            v-else
            v-model.number="editingRow.getInterval"
            controls-position="right"
            @blur="saveEdit(row.id)"
          />
        </template>
      </el-table-column>
      <el-table-column
        prop="syncPageSize"
        width="160"
        label="同步频率(条数/1分钟)"
      >
        <template #default="{ row }">
          <span v-if="row.id !== editingRowId">{{ row.syncPageSize }}</span>
          <el-input-number
            v-else
            v-model.number="editingRow.syncPageSize"
            controls-position="right"
            @blur="saveEdit(row.id)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="platToken" label="平台Token">
        <template #default="{ row }">
          <span v-if="row.id !== editingRowId">{{ row.platToken }}</span>
          <el-input
            v-else
            v-model="editingRow.platToken"
            @blur="saveEdit(row.id)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="platSubToken" label="平台子Token">
        <template #default="{ row }">
          <span v-if="row.id !== editingRowId">{{ row.platSubToken }}</span>
          <el-input
            v-if="
              ['shoutu', 'mahua', 'mayi'].includes(row.platName) &&
              row.id === editingRowId
            "
            v-model="editingRow.platSubToken"
            @blur="saveEdit(row.id)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="userUUID" label="平台userUUID">
        <template #default="{ row }">
          <span v-if="row.id !== editingRowId">{{ row.userUUID }}</span>
          <el-input
            v-if="
              ['shoutu', 'lieren', 'mangguo', 'yinghuasuan', 'mayi'].includes(
                row.platName
              ) && row.id === editingRowId
            "
            v-model="editingRow.userUUID"
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
  </div>
</template>

<script setup>
// keepAlive生效前提：对应页面 name 必须与路由的 name 保持一致
defineOptions({
  name: "queueManage"
});
import { ref, computed, onBeforeMount } from "vue";
import { ElMessageBox, ElMessage } from "element-plus";
import svApi from "@/api/sv-api";
import yangcongApi from "@/api/yangcong-api";

// 统一使用工厂类创建队列
import {
  offerQueueFactory,
  fetchOrderQueueFactory
} from "@/common/factories/QueueFactory.js";

import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
import createTicketQueueFun from "@/common/autoTicket/comTicketHandle";
import { ORDER_FORM, GET_APP_LIST, IN_RULE_LIST } from "@/common/constant";
const APP_LIST = computed(() => GET_APP_LIST());

import {
  getCinemaLoginInfoList,
  getCurrentTime,
  logUpload,
  mockDelay
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
// 平台toke列表
const tokens = platTokens();

const tableDataStore = usePlatTableDataStore();
const platQueueList = computed(() => tableDataStore.items);
import { useYangcongCinemaList } from "@/store/specialNameRule";
const yangcongCinemaListObj = useYangcongCinemaList();

// 是否显示一键启动
const isActiveOneClickStart = computed(() => {
  return !isActiveOneClickStop.value;
});

// 是否显示一键停止
const isActiveOneClickStop = computed(() => {
  return tableDataStore.items.filter(item => item.isEnabled).length > 0;
});

// 洋葱同步loading
const syncYangcongLoading = ref(false);
// 是否显示同步洋葱影院列表
const isActiveSyncYangcong = computed(() => {
  return (
    tableDataStore.items.filter(
      item => item.platName == "yangcong" && item.platToken
    ).length > 0
  );
});

// 同步洋葱影院列表
const syncYangcongCinemaList = async (list = [], pageNum = 1) => {
  try {
    if (pageNum == 1) {
      let yangcongToken = tableDataStore.items.find(
        item => item.platName == "yangcong" && item.platToken
      )?.platToken;
      console.log("yangcongToken", yangcongToken);
      setPlatFunObj["yangcong"](yangcongToken);
    }
    syncYangcongLoading.value = true;
    const res = await yangcongApi.queryCinemaList({ pageSize: 500, pageNum });
    // console.log("res", res);
    const { current, pages, records } = res?.data || {};
    list = list.concat(
      records.map(item => ({
        cinemaName: item.cinemaName,
        cinemaCode: item.standardCode
      }))
    );
    if (+current < +pages) {
      return syncYangcongCinemaList(list, pageNum + 1);
    } else {
      syncYangcongLoading.value = false;
      yangcongCinemaListObj.setYangcongCinemaList(list);
      ElMessage.warning("洋葱影院列表同步完成");
    }
  } catch (error) {
    console.warn("同步洋葱影院列表异常", error);
    syncYangcongLoading.value = false;
    ElMessage.warning("同步洋葱影院列表失败");
  }
};

// 平台报价队列集合 - 通过工厂类创建
let platOfferQueueObj = {};
Object.keys(ORDER_FORM).forEach(plat_name => {
  platOfferQueueObj[plat_name] = offerQueueFactory.getOfferQueue(plat_name);
});

// 平台获取待出票订单队列集合 - 通过工厂类创建
let platFetchOrderQueueObj = {};
Object.keys(ORDER_FORM).forEach(plat_name => {
  platFetchOrderQueueObj[plat_name] =
    fetchOrderQueueFactory.getFetchOrderQueue(plat_name);
});

// 平台出票队列集合
// 注意：出票队列在构造函数中会添加事件监听器，不能重新初始化，否则会导致重复订阅
let appTicketQueueObj = {};
// 初始化出票队列（只初始化一次，避免重复订阅事件）
Object.keys(APP_LIST.value).forEach(app_name => {
  appTicketQueueObj[app_name] = createTicketQueueFun(app_name);
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
  sheng: tokens.setShengPlatToken,
  shoutu: tokens.setShoutuPlatToken,
  mahua: tokens.setMahuaPlatToken
};

// 是否启动队列（该为false可进行测试用户）
let isStartOffer = true; // 报价队列
let isStartFetch = true; // 待出票获取队列
let isStartTicket = true; // 自动出票队列

// 一键启动
const oneClickStart = () => {
  // 删除没有登录信息的队列
  // 注意：不能重新初始化出票队列，否则会导致事件监听器重复订阅
  let loginInfoList = getCinemaLoginInfoList();
  Object.keys(APP_LIST.value).forEach(item => {
    let obj = loginInfoList.find(
      itemA => itemA.app_name === item && itemA.session_id
    );
    if (!obj) {
      delete appTicketQueueObj[item];
    } else {
      // 如果队列不存在，则创建（只创建新的，不重新初始化已存在的）
      if (!appTicketQueueObj[item]) {
        appTicketQueueObj[item] = createTicketQueueFun(item);
      }
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
          // 各平台若有子 Token / userUUID，一键启动时同步写入 localStorage（与保存编辑逻辑一致）
          syncPlatExtraTokens(item);
          isStartOffer && platOfferQueueObj[item.platName]?.start();
          isStartFetch && platFetchOrderQueueObj[item.platName]?.start();
        }
      });

      Object.keys(appTicketQueueObj).forEach(item => {
        isStartTicket && appTicketQueueObj[item].start();
      });
      if (isStart) {
        console.warn("一键启动自动出票队列");
        svApi.updateUser({
          plat_offer_queue: JSON.stringify(tableDataStore.items),
          app_ticket_queue: JSON.stringify(Object.keys(appTicketQueueObj)),
          offer_queue_time: getCurrentTime()
        });
        logUpload({ plat_name: "", type: 1 }, [
          {
            opera_time: getCurrentTime(),
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
        isStartOffer && platOfferQueueObj[item.platName]?.stop();
        isStartFetch && platFetchOrderQueueObj[item.platName]?.stop();
      });

      Object.keys(appTicketQueueObj).forEach(item => {
        isStartTicket && appTicketQueueObj[item].stop();
      });
      svApi.updateUser({
        plat_offer_queue: JSON.stringify(tableDataStore.items),
        offer_queue_time: getCurrentTime()
      });
      logUpload({ plat_name: "", type: 1 }, [
        {
          opera_time: getCurrentTime(),
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
const singleStartOrStop = ({ id, platToken, platName, syncPageSize }, flag) => {
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
    isStartOffer && platOfferQueueObj[platName]?.start();
    isStartFetch && platFetchOrderQueueObj[platName]?.start();
    // 删除没有登录信息的队列
    // 注意：不能重新初始化出票队列，否则会导致事件监听器重复订阅
    let loginInfoList = getCinemaLoginInfoList();
    Object.keys(APP_LIST.value).forEach(item => {
      let obj = loginInfoList.find(
        itemA => itemA.app_name === item && itemA.session_id
      );
      if (!obj) {
        delete appTicketQueueObj[item];
      } else {
        // 如果队列不存在，则创建（只创建新的，不重新初始化已存在的）
        if (!appTicketQueueObj[item]) {
          appTicketQueueObj[item] = createTicketQueueFun(item);
        }
      }
    });
    // 其它没有一个启动的再启动
    if (!otherPlatQueueList.some(item => item.isEnabled)) {
      Object.keys(appTicketQueueObj).forEach(item => {
        isStartTicket && appTicketQueueObj[item].start();
      });
    }
  } else {
    // 单个停止
    tableDataStore.toggleEnable(id);
    isStartOffer && platOfferQueueObj[platName]?.stop();
    isStartFetch && platFetchOrderQueueObj[platName]?.stop();
    // 其它没有一个启动的再停止
    if (!otherPlatQueueList.some(item => item.isEnabled)) {
      Object.keys(appTicketQueueObj).forEach(item => {
        isStartTicket && appTicketQueueObj[item].stop();
      });
    }
  }
  svApi.updateUser({
    plat_offer_queue: JSON.stringify(tableDataStore.items),
    offer_queue_time: getCurrentTime()
  });
  logUpload({ plat_name: platName, type: 1 }, [
    {
      opera_time: getCurrentTime(),
      des: `单个${flag !== 1 ? "停止" : "启动"}队列`,
      level: "info",
      info: {
        queue: JSON.stringify(tableDataStore.items)
      }
    }
  ]);
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
/**
 * 将平台子 Token / userUUID 同步到 localStorage（与保存编辑时一致）
 * 供一键启动与保存编辑共用，保证各平台接口能拿到正确配置
 */
const syncPlatExtraTokens = ({
  platName,
  platToken,
  platSubToken,
  userUUID
}) => {
  const sub = platSubToken ?? "";
  const uuid = userUUID ?? "";
  if (platName === "shoutu") {
    localStorage.setItem("shoutuPlatSubToken", sub);
    localStorage.setItem("shoutuPlatUserUUID", uuid);
  } else if (platName === "mahua") {
    localStorage.setItem("mahuPlatSubToken", sub);
  } else if (platName === "yinghuasuan") {
    localStorage.setItem("yinghuasuanPlatUserUUID", uuid);
  } else if (platName === "mayi") {
    localStorage.setItem("mayiPlatSubToken", sub);
    localStorage.setItem("mayiPlatUserUUID", uuid);
  } else if (platName === "sheng") {
    localStorage.setItem("shengPlatToken", platToken);
  }
};

// 保存编辑
const saveEdit = id => {
  if (id === editingRowId.value) {
    tableDataStore.saveEdit(editingRow.value);
    const { platToken, platSubToken, userUUID, platName } = editingRow.value;
    platToken && setPlatFunObj[platName](platToken);
    syncPlatExtraTokens({ platName, platToken, platSubToken, userUUID });
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

onBeforeMount(async () => {
  // const socket = new WebSocket("ws://localhost:3000");
  // socket.addEventListener("message", function (event) {
  //   console.log("Message from server ", event.data);
  // });
});
</script>
