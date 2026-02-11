<template>
  <div class="auto-ticket">
    <el-divider content-position="center">订单出票记录</el-divider>
    <HistoryTicketRecord />
  </div>
</template>

<script setup>
defineOptions({
  name: "ticketRecord"
});
import HistoryTicketRecord from "@/components/HistoryTicketRecord.vue";
</script>

<style></style>
