<template>
  <div class="kpi-card">
    <div class="kpi-label">
      {{ label }}
      <el-tooltip v-if="tip" :content="tip" placement="top" :show-after="200">
        <span class="kpi-tip">ⓘ</span>
      </el-tooltip>
    </div>
    <div class="kpi-value" :class="valueClass">{{ valueText }}</div>
    <div class="kpi-delta">
      <span v-if="delta" :class="delta.cls"
        >{{ deltaLabel }} {{ delta.text }}</span
      >
      <span v-if="delta && delta7" class="sep">·</span>
      <span v-if="delta7" class="avg7">7日均 {{ delta7.text }}</span>
      <!-- <span v-if="!delta && !delta7" class="avg7">无环比参照</span> -->
    </div>
  </div>
</template>

<script setup>
// KPI 卡片:主值 + 环比参照(delta/delta7 由父组件用 utils/rate.js 的 deltaInfo 计算)
// deltaLabel:环比标签(当天范围="较昨日";多天范围父组件不传 delta,自动显示"无环比参照")
defineProps({
  label: { type: String, required: true },
  tip: { type: String, default: "" }, // 口径说明,hover 显示
  valueText: { type: String, default: "--" },
  valueClass: { type: String, default: "" },
  delta: { type: Object, default: null }, // { text: "▲12%", cls: "up"|"down" }
  delta7: { type: Object, default: null },
  deltaLabel: { type: String, default: "较昨日" }
});
</script>

<style scoped>
.kpi-card {
  flex: 1;
  border: 1px solid var(--el-border-color-lighter, #e0e0e0);
  border-radius: 8px;
  padding: 14px 16px;
  background: #fff;
  min-width: 0;
}
.kpi-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.kpi-tip {
  cursor: help;
  font-size: 12px;
  color: #c0c4cc;
}
.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
  margin-bottom: 6px;
  white-space: nowrap;
}
.kpi-value.up {
  color: #67c23a;
}
.kpi-value.down {
  color: #f56c6c;
}
.kpi-delta {
  font-size: 12px;
  display: flex;
  gap: 4px;
  align-items: baseline;
  color: #909399;
}
.kpi-delta .up {
  color: #67c23a;
}
.kpi-delta .down {
  color: #f56c6c;
}
.kpi-delta .sep {
  color: #dcdfe6;
}
.kpi-delta .avg7 {
  color: #909399;
}
</style>
