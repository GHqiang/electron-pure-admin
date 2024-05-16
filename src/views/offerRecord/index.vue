<template>
  <div class="auto-offer">
    <PlatOfferQueueRule></PlatOfferQueueRule>
    <el-divider content-position="center">报价记录</el-divider>
    <HistoryOfferRecord></HistoryOfferRecord>
  </div>
</template>

<script setup>
import PlatOfferQueueRule from "@/components/PlatOfferQueueRule.vue";
import HistoryOfferRecord from "@/components/HistoryOfferRecord.vue";
</script>

<style></style>
