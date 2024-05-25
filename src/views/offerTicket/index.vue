<template>
  <div class="auto-ticket">
    <!-- 平台启动获取订单队列 -->
    <el-divider content-position="left">订单自动获取队列</el-divider>
    <PlatFetchOrderQueueRule></PlatFetchOrderQueueRule>
    <el-divider content-position="left">订单自动出票队列</el-divider>
    <AppTicketQueueRule></AppTicketQueueRule>
    <el-divider content-position="center">订单出票记录</el-divider>
    <HistoryTicketRecord></HistoryTicketRecord>
  </div>
</template>

<script setup>
import PlatFetchOrderQueueRule from "@/components/PlatFetchOrderQueueRule.vue";
import AppTicketQueueRule from "@/components/AppTicketQueueRule.vue";
import HistoryTicketRecord from "@/components/HistoryTicketRecord.vue";
</script>

<style></style>
