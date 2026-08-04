<template>
  <div class="diagnosis-bar" :class="level">
    <span class="diag-icon">{{ icon }}</span>
    <div class="diag-body">
      <div class="diag-title">{{ title }}</div>
      <div class="diag-text">{{ text }}</div>
    </div>
    <el-button
      v-if="action"
      size="small"
      type="primary"
      class="diag-action"
      @click="action.handler"
    >{{ action.label }} →</el-button>
  </div>
</template>

<script setup>
import { computed } from "vue";

// 诊断摘要条:结构化结论(标题 + 说明)+ 建议动作按钮(设计文档 §3.3)
const props = defineProps({
  level: { type: String, default: "info" }, // danger | warning | success | info
  title: { type: String, default: "" },
  text: { type: String, default: "" },
  action: { type: Object, default: null } // { label, handler }
});

const icon = computed(() => {
  const map = { danger: "⚠", warning: "▲", success: "✓", info: "ℹ" };
  return map[props.level] || "ℹ";
});
</script>

<style scoped>
.diagnosis-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
}
.diagnosis-bar.danger { background: #fef0f0; border-left: 4px solid #f56c6c; color: #303133; }
.diagnosis-bar.warning { background: #fdf6ec; border-left: 4px solid #e6a23c; color: #303133; }
.diagnosis-bar.success { background: #f0f9eb; border-left: 4px solid #67c23a; color: #303133; }
.diagnosis-bar.info { background: #f4f4f5; border-left: 4px solid #909399; color: #303133; }
.diag-icon { font-size: 15px; }
.diag-body { flex: 1; min-width: 0; }
.diag-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 2px;
}
.diag-text {
  color: #606266;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diag-action { flex-shrink: 0; }
</style>
