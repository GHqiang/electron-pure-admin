<template>
  <div class="auto-ticket">
    <!-- 平台启动获取订单队列 -->
    <PlatFetchOrderQueueRule></PlatFetchOrderQueueRule>
    <AppTicketQueueRule></AppTicketQueueRule>
    <el-divider content-position="center">出票记录</el-divider>
    <HistoryTicketRecord></HistoryTicketRecord>
  </div>
</template>

<script setup>
import PlatFetchOrderQueueRule from "@/components/PlatFetchOrderQueueRule.vue";
import AppTicketQueueRule from "@/components/AppTicketQueueRule.vue";
import HistoryTicketRecord from "@/components/HistoryTicketRecord.vue";
</script>

<style></style>
