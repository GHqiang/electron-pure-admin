<template>
  <div class="auto-offer">
    <el-divider content-position="center">未报价记录</el-divider>
    <HistoryOfferRecord :orderStatus="2"></HistoryOfferRecord>
  </div>
</template>

<script setup>
import HistoryOfferRecord from "@/components/HistoryOfferRecord.vue";
</script>

<style></style>
