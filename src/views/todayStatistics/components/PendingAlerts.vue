<template>
  <div class="pending-alerts">
    <div v-for="(a, i) in alerts" :key="i" class="alert-card" :class="a.level">
      <div class="alert-title">
        <span class="alert-dot"></span>{{ a.title }}
      </div>
      <div class="alert-desc">{{ a.desc }}</div>
      <el-button
        v-if="a.action"
        size="small"
        type="primary"
        link
        class="alert-action"
        @click="a.action.handler"
      >{{ a.action.label }} →</el-button>
    </div>
    <div v-if="!alerts.length" class="empty">今日无异常 ✓</div>
  </div>
</template>

<script setup>
// 待处理:异常预警卡片(红/黄/提示三色),action.handler 由父组件注入(设计文档 §3.7)
defineProps({
  alerts: { type: Array, default: () => [] }
});
</script>

<style scoped>
.alert-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  border: 1px solid transparent;
}
.alert-card.danger { background: #fef0f0; border-color: #fde2e2; }
.alert-card.warning { background: #fdf6ec; border-color: #faecd8; }
.alert-card.info { background: #f4f4f5; border-color: #e9e9eb; }
.alert-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.alert-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.alert-card.danger .alert-dot { background: #f56c6c; }
.alert-card.warning .alert-dot { background: #e6a23c; }
.alert-card.info .alert-dot { background: #909399; }
.alert-desc {
  flex: 1;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.alert-action { flex-shrink: 0; }
.empty {
  color: #67c23a;
  font-size: 13px;
  text-align: center;
  padding: 16px 0;
}
</style>
