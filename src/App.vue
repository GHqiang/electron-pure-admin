<template>
  <el-config-provider :locale="currentLocale">
    <router-view />
    <ReDialog />
  </el-config-provider>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { ElConfigProvider } from "element-plus";
import { ReDialog } from "@/components/ReDialog";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import svApi from "@/api/sv-api";

export default defineComponent({
  name: "app",
  components: {
    [ElConfigProvider.name]: ElConfigProvider,
    ReDialog
  },
  computed: {
    currentLocale() {
      return zhCn;
    }
  }
});
window.onbeforeunload = function (e) {
  window.localStorage.removeItem("selfToken");
  window.localStorage.removeItem("userInfo");
  window.localStorage.removeItem("user-info");
};
// 查询操作日志
const queryLog = async (order_number, user_id) => {
  try {
    const res = await svApi.queryLogRecord({
      order_number,
      user_id,
    });
    let logList = res.data?.cardList || [];
    logList.reverse();
    console.warn("查询操作日志返回", logList);
  } catch (error) {
    console.warn("查询操作日志返回异常", error);
  }
};
window.queryLog = queryLog
</script>
