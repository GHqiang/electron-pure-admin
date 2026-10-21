<template>
  <div>
    <el-table
      :data="rows"
      border
      stripe
      size="small"
      empty-text="当前条件下没有数据"
      @row-click="onRowClick"
    >
      <el-table-column type="index" label="#" width="55" align="center" />
      <el-table-column prop="name" label="影院" min-width="180" />
      <el-table-column prop="seriesName" label="系列" min-width="130" />
      <el-table-column :label="metricLabel" min-width="110" align="right">
        <template #default="{ row }">{{ formatNum(row[metric]) }}</template>
      </el-table-column>
      <el-table-column label="报价量" min-width="100" align="right">
        <template #default="{ row }">{{ formatNum(row.offerTotalNum) }}</template>
      </el-table-column>
      <el-table-column label="报价成功量" min-width="110" align="right">
        <template #default="{ row }">{{ formatNum(row.offerSuccessNum) }}</template>
      </el-table-column>
      <el-table-column label="出票量" min-width="100" align="right">
        <template #default="{ row }">{{ formatNum(row.ticketTotalNum) }}</template>
      </el-table-column>
      <el-table-column label="出票成功量" min-width="110" align="right">
        <template #default="{ row }">{{ formatNum(row.ticketSuccessNum) }}</template>
      </el-table-column>
      <el-table-column label="报价成功率" min-width="110" align="right">
        <template #default="{ row }">{{ formatRate(row.offerRate) }}</template>
      </el-table-column>
      <el-table-column label="出票成功率" min-width="110" align="right">
        <template #default="{ row }">{{ formatRate(row.ticketRate) }}</template>
      </el-table-column>
    </el-table>
    <div v-if="data.length > pageSize" class="board-footer">
      <el-button size="small" @click="showAll = !showAll">
        {{ showAll ? "只看前 20" : `显示全部 ${data.length} 家` }}
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { formatNum, formatRate } from "../utils/aggregate";

// 影院排行:默认 Top20,可展开全部;点行由父级跳现有影线明细
const props = defineProps({
  data: { type: Array, default: () => [] },
  metric: { type: String, default: "offerTotalNum" },
  metricLabel: { type: String, default: "单量" }
});
const emit = defineEmits(["drill"]);

const pageSize = 20;
const showAll = ref(false);
// 数据变化(切指标/筛条件)后回到 Top20,避免展开态带到新结果
watch(
  () => props.metric,
  () => {
    showAll.value = false;
  }
);

const rows = computed(() => (showAll.value ? props.data : props.data.slice(0, pageSize)));

const onRowClick = row => emit("drill", row.appName);
</script>

<style scoped>
.board-footer {
  margin-top: 8px;
  text-align: center;
}
</style>
