<template>
  <div class="cross-table">
    <el-table
      :data="view.seriesRows"
      border
      stripe
      size="small"
      show-summary
      :summary-method="summaryMethod"
      :cell-style="cellStyle"
      empty-text="当前条件下没有数据"
    >
      <el-table-column prop="name" label="系列" min-width="120" fixed />
      <el-table-column prop="total" label="合计" min-width="100" align="right" sortable />
      <el-table-column
        v-for="plat in view.plats"
        :key="plat"
        :prop="`cells.${plat}`"
        :label="platLabel(plat)"
        min-width="110"
        align="right"
        sortable
      />
    </el-table>
  </div>
</template>

<script setup>
import { formatNum } from "../utils/aggregate";

// 平台×系列交叉表:单元格按列最大值做热力底色,列合计即平台单量排行
const props = defineProps({
  view: {
    type: Object,
    default: () => ({
      seriesRows: [],
      plats: [],
      colTotals: {},
      grandTotal: 0,
      maxCell: {},
      unmatchedCinemas: 0
    })
  },
  platLabels: { type: Object, default: () => ({}) }
});

const platLabel = plat => props.platLabels[plat] || plat || "--";

const cellStyle = ({ row, column }) => {
  const prop = column.property || "";
  if (!prop.startsWith("cells.")) return {};
  const plat = prop.slice(6);
  const max = props.view.maxCell?.[plat] || 0;
  const value = Number(row.cells?.[plat] || 0);
  if (!max || !value) return {};
  // 8% 起步,按占比线性加深到 50%,保证有单的格子都可辨
  const alpha = 0.08 + (value / max) * 0.42;
  return { background: `rgba(64, 158, 255, ${alpha.toFixed(2)})` };
};

const summaryMethod = ({ columns }) =>
  columns.map((column, index) => {
    if (index === 0) return "合计";
    const prop = column.property || "";
    if (prop === "total") return formatNum(props.view.grandTotal);
    if (prop.startsWith("cells.")) return formatNum(props.view.colTotals?.[prop.slice(6)] || 0);
    return "";
  });
</script>

<style scoped>
.cross-table :deep(.el-table__footer-wrapper td) {
  background: #fafafa;
  font-weight: 600;
}
</style>
