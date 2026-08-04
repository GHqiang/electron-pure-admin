<template>
  <div class="plat-breakdown">
    <div v-if="rows.length" class="plat-table">
      <div class="plat-head">
        <span class="col-name">订单来源</span>
        <span class="col-profit">利润</span>
        <span class="col-rate">报价成功率</span>
        <span class="col-rate">中标率</span>
        <span class="col-rate">出票成功率</span>
      </div>
      <div v-for="row in rows" :key="row.plat_name" class="plat-row">
        <span class="col-name">{{ row.plat_name }}</span>
        <span class="col-profit">
          <span class="profit-bar-wrap">
            <span class="profit-bar" :class="row.profitCls" :style="{ width: row.profitPct + '%' }"></span>
          </span>
          <span :class="row.profitCls">{{ row.profitText }}</span>
        </span>
        <span class="col-rate">{{ row.offerRate }}</span>
        <span class="col-rate">{{ row.dealRate }}</span>
        <span class="col-rate">{{ row.ticketRate }}</span>
      </div>
    </div>
    <div v-else class="empty">暂无平台数据</div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { ratePercent, fmtMoney } from "../utils/rate";

// 平台拆解:利润(带条形对比)+ 报价成功率 / 中标率 / 出票成功率(设计文档 §3.6)
const props = defineProps({
  data: { type: Array, default: () => [] }
});

const rows = computed(() => {
  const list = props.data.map(item => {
    const profit = Number(item.profit_total || 0);
    return {
      plat_name: item.plat_name,
      profit,
      profitText: fmtMoney(profit),
      profitCls: profit >= 0 ? "up" : "down",
      offerRate: ratePercent(item.offer_success_num, item.offer_success_num + item.offer_fail_num),
      dealRate: ratePercent(item.ticket_total_num, item.offer_success_num),
      ticketRate: ratePercent(item.ticket_success_num, item.ticket_total_num)
    };
  });
  // 利润条形按绝对值最大者归一化
  const maxAbs = Math.max(...list.map(r => Math.abs(r.profit)), 1);
  list.forEach(r => { r.profitPct = Math.max(2, Math.round((Math.abs(r.profit) / maxAbs) * 100)); });
  // 按利润降序
  return list.sort((a, b) => b.profit - a.profit);
});
</script>

<style scoped>
.plat-table {
  font-size: 13px;
}
.plat-head, .plat-row {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px dashed #ebeef5;
}
.plat-head {
  color: #909399;
  font-size: 12px;
  border-bottom: 1px solid #e4e7ed;
}
.col-name { flex: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-profit { flex: 1.6; display: flex; align-items: center; gap: 8px; }
.col-rate { flex: 1; text-align: center; }
.profit-bar-wrap {
  width: 80px;
  height: 8px;
  background: #f0f2f5;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}
.profit-bar { display: block; height: 100%; border-radius: 4px; }
.profit-bar.up { background: #67c23a; }
.profit-bar.down { background: #f56c6c; }
.up { color: #67c23a; }
.down { color: #f56c6c; }
.empty {
  color: #909399;
  font-size: 13px;
  text-align: center;
  padding: 20px 0;
}
</style>
