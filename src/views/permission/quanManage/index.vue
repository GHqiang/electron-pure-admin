<!-- 券类型管理 -->
<template>
  <div style="height: 100%">
    <el-container style="height: 100">
      <el-aside width="200px">
        <el-input
          v-model="filterText"
          class="w-60 mb-2"
          placeholder="可输入影院过滤"
        />
        <!-- 左侧树 -->
        <el-tree
          ref="treeRef"
          class="tree-list"
          :data="treeData"
          node-key="id"
          highlight-current
          style="max-height: 650px; overflow-y: auto"
          :default-expanded-keys="[1]"
          :props="defaultProps"
          :filter-node-method="filterNode"
          @node-click="nodeClick"
        />
      </el-aside>
      <el-main style="margin-left: 15px; padding: 0; height: 100%">
        <!-- Tab切换 -->
        <el-tabs
          v-model="activeTab"
          type="border-card"
          style="height: 100%; min-height: 800px"
          lazy
        >
          <el-tab-pane label="券类型列表" name="quanType">
            <QuanType :app-type="appType" :app-name="appName" />
          </el-tab-pane>
          <el-tab-pane label="券码列表" name="quanList">
            <QuanList :app-type="appType" :app-name="appName" />
          </el-tab-pane>
        </el-tabs>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
defineOptions({
  name: "QuanTypeManage"
});
import { ref, computed, watch } from "vue";
import { ElMessage } from "element-plus";
import QuanType from "./quanType.vue";
import QuanList from "./quanList.vue";
import { GET_APP_LIST, GET_APP_TYPE_LIST } from "@/common/constant";
import { sendWxPusherMessage } from "@/utils/utils";
import svApi from "@/api/sv-api";
const APP_LIST = computed(() => GET_APP_LIST());
const APP_TYPE_LIST = computed(() => GET_APP_TYPE_LIST());

// 树节点属性映射
const defaultProps = {
  children: "children",
  label: "label"
};
// 定义树形结构数据
const treeData = APP_TYPE_LIST.value.map((item, inx) => {
  return {
    id: inx + 1,
    label: item.app_type_name,
    value: item.app_type_code,
    children: item.app_name_list.map((itemA, index) => ({
      id: index + 1 + (inx + 1) * 100,
      label: APP_LIST.value[itemA],
      value: itemA
    }))
  };
});

// 树过滤
const filterText = ref("");
const filterNode = (value, data) => {
  if (!value) return true;
  return data.label.includes(value);
};

// 树组件的引用
const treeRef = ref(null);
watch(filterText, val => {
  treeRef.value.filter(val);
});

// Tab切换状态
const activeTab = ref("quanType");

// 应用类型和应用名称状态
const appType = ref("");
const appName = ref("");

// 树节点点击
const nodeClick = nodeData => {
  console.log("nodeData", nodeData);
  if (nodeData.id < 100) {
    appType.value = nodeData.value;
    appName.value = "";
  } else {
    appName.value = nodeData.value;
    appType.value = "";
  }
};

// 查询临期券
const checkExpiringQuan = async () => {
  try {
    const res = await svApi.queryExpiringQuan({ days: 30 });
    const quanList = res.data.quanList || [];
    if (quanList.length > 0) {
      // 构建消息内容
      const tipContent = quanList
        .map(item => `${item.quan_name}：${item.count}张`)
        .join("<br/>");

      // 发送微信通知
      await sendWxPusherMessage({
        msgType: 10, // 服务器券到期提醒
        transferTip: tipContent
      });

      // 同时页面提示
      ElMessage({
        type: "warning",
        message: `检测到30天内${quanList.length}种临期券，请及时处理！`,
        duration: 5000
      });
    }
  } catch (error) {
    console.error("查询临期券异常", error);
  }
};

// 监听tab切换
watch(activeTab, newTab => {
  if (newTab === "quanList") {
    checkExpiringQuan();
  }
});
</script>

<style scoped>
.tree-list :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background-color: #5fe3de;
}
</style>
