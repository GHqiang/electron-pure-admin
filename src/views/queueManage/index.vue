<template>
  <div class="auto-ticket">
    <el-divider content-position="left">订单自动报价队列</el-divider>
    <PlatOfferQueueRule></PlatOfferQueueRule>
    <el-divider content-position="left">待出票订单自动获取队列</el-divider>
    <PlatFetchOrderQueueRule></PlatFetchOrderQueueRule>
    <el-divider content-position="left">订单自动出票队列</el-divider>
    <AppTicketQueueRule></AppTicketQueueRule>
  </div>
</template>

<script setup>
import PlatOfferQueueRule from "@/components/PlatOfferQueueRule.vue";
import PlatFetchOrderQueueRule from "@/components/PlatFetchOrderQueueRule.vue";
import AppTicketQueueRule from "@/components/AppTicketQueueRule.vue";
</script>

<style></style>
