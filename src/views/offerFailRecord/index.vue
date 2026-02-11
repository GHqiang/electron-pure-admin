<template>
  <div class="auto-offer">
    <el-divider content-position="center">未报价记录</el-divider>
    <HistoryOfferRecord :orderStatus="2" />
  </div>
</template>

<script setup>
defineOptions({
  name: "offerFailRecord"
});
import HistoryOfferRecord from "@/components/HistoryOfferRecord.vue";
</script>

<style></style>
