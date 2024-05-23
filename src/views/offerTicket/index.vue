<template>
  <div class="auto-ticket">
    <AppTicketQueueRule></AppTicketQueueRule>
    <el-divider content-position="center">出票记录</el-divider>
    <HistoryTicketRecord></HistoryTicketRecord>
  </div>
</template>

<script setup>
import AppTicketQueueRule from "@/components/AppTicketQueueRule.vue";
import HistoryTicketRecord from "@/components/HistoryTicketRecord.vue";
</script>

<style></style>
