<template>
  <div class="auto-offer">
    <el-divider content-position="center">报价记录</el-divider>
    <HistoryOfferRecord :orderStatus="1"></HistoryOfferRecord>
  </div>
</template>

<script setup>
defineOptions({
  name: "offerRecord"
});
import HistoryOfferRecord from "@/components/HistoryOfferRecord.vue";
</script>

<style></style>
