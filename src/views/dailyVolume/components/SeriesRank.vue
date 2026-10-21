<template>
  <el-table
    :data="rows"
    border
    stripe
    size="small"
    empty-text="当前条件下没有数据"
    @row-click="onRowClick"
  >
    <el-table-column type="index" label="#" width="55" align="center" />
    <el-table-column prop="name" label="系列" min-width="120" />
    <el-table-column :label="metricLabel" min-width="200">
      <template #default="{ row }">
        <div class="bar-cell">
          <span class="bar" :style="{ width: (row.barPct || 0) + '%' }"></span>
          <span class="bar-value">{{ formatNum(row[metric]) }}</span>
        </div>
      </template>
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
    <el-table-column label="占总量" min-width="90" align="right">
      <template #default="{ row }">{{ formatRate(row.share) }}</template>
    </el-table-column>
  </el-table>
</template>

<script setup>
import { computed } from "vue";
import { formatNum, formatRate } from "../utils/aggregate";

// 系列排行:条形长度按当前指标相对最大值;点行由父级切到影院榜并带系列筛选
const props = defineProps({
  data: { type: Array, default: () => [] },
  metric: { type: String, default: "offerTotalNum" },
  metricLabel: { type: String, default: "单量" }
});
const emit = defineEmits(["select"]);

const rows = computed(() => {
  const list = props.data || [];
  const max = list.reduce((m, row) => Math.max(m, Number(row[props.metric] || 0)), 0);
  return list.map(row => ({
    ...row,
    barPct: max > 0 ? Math.max(2, Math.round((Number(row[props.metric] || 0) / max) * 100)) : 0
  }));
});

const onRowClick = row => emit("select", row.code);
</script>

<style scoped>
.bar-cell {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}
.bar {
  position: absolute;
  left: 0;
  top: 3px;
  height: 14px;
  background: rgba(64, 158, 255, 0.25);
  border-radius: 3px;
}
.bar-value {
  position: relative;
  padding-left: 6px;
  font-variant-numeric: tabular-nums;
}
</style>
