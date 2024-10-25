<template>
  <div
    style="
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    "
  >
    <!-- <h1>仪表台功能正在开发中......</h1> -->
  </div>
</template>

<script setup>
defineOptions({
  name: "Welcome"
});
import svApi from "@/api/sv-api";
// 查询操作日志
const queryLog = async (order_number, user_id, type) => {
  try {
    const res = await svApi.queryLogRecord({
      order_number,
      user_id,
      type
    });
    let logList = res.data?.cardList || [];
    logList.reverse();
    console.warn("查询操作日志返回", logList);
  } catch (error) {
    console.warn("查询操作日志返回异常", error);
  }
};
window.queryLog = queryLog;
</script>
