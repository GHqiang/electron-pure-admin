<template>
  <div class="trend-chart" ref="chartRef"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import echarts from "../utils/echarts";

// 趋势图:报价量(柱,左轴,背景)+ 利润(虚线,左轴)+ 报价成功率/中标率/出票成功率(%,右轴)
// 数据为查询范围内的按日序列(父组件已截取,见设计文档 §3.4)
// 口径说明:中标率 = 当日出票中标数 / 当日报价成功数,报价与出票按各自日期,
// 报价日与出票日存在跨日错位(如 8/1 报价 8/2 出票),该线为当日快照口径,仅供参考;
// 出票成功率 = 当日出票成功数 / 当日出票总数,同表同日,口径可靠
const props = defineProps({
  data: { type: Array, default: () => [] }
});

const chartRef = ref(null);
let chart = null;

const dealRate = d => {
  const t = Number(d.ticket_total_num);
  const o = Number(d.offer_success_num);
  return o > 0 ? +((t / o) * 100).toFixed(1) : null;
};
const ticketRate = d => {
  const s = Number(d.ticket_success_num);
  const t = Number(d.ticket_total_num);
  return t > 0 ? +((s / t) * 100).toFixed(1) : null;
};

const render = () => {
  if (!chart) return;
  const dates = props.data.map(d => d.date);
  chart.setOption({
    tooltip: { trigger: "axis" },
    legend: {
      data: ["报价量", "利润", "报价成功率", "中标率", "出票成功率"],
      top: 0,
      textStyle: { fontSize: 12 }
    },
    grid: { left: 64, right: 64, top: 36, bottom: 30 },
    xAxis: { type: "category", data: dates, axisLabel: { fontSize: 11 } },
    yAxis: [
      { type: "value", name: "利润(元)", position: "left", splitLine: { lineStyle: { type: "dashed" } } },
      { type: "value", name: "%", position: "right", max: 100, axisLabel: { formatter: "{value}%" } }
    ],
    series: [
      {
        name: "报价量",
        type: "bar",
        yAxisIndex: 0,
        data: props.data.map(d => d.offer_total_num),
        barWidth: "40%",
        itemStyle: { color: "rgba(64,158,255,0.35)" }
      },
      {
        name: "利润",
        type: "line",
        yAxisIndex: 0,
        data: props.data.map(d => d.profit_total),
        smooth: true,
        symbolSize: 5,
        lineStyle: { type: "dashed", width: 2 },
        itemStyle: { color: "#f56c6c" }
      },
      {
        name: "报价成功率",
        type: "line",
        yAxisIndex: 1,
        data: props.data.map(d => +(d.offer_success_rate * 100).toFixed(1)),
        smooth: true,
        symbolSize: 5,
        lineStyle: { type: "dotted", width: 2 },
        itemStyle: { color: "#67c23a" }
      },
      {
        name: "中标率",
        type: "line",
        yAxisIndex: 1,
        data: props.data.map(dealRate),
        smooth: true,
        symbolSize: 5,
        lineStyle: { width: 2 },
        itemStyle: { color: "#722ed1" }
      },
      {
        name: "出票成功率",
        type: "line",
        yAxisIndex: 1,
        data: props.data.map(ticketRate),
        smooth: true,
        symbolSize: 5,
        lineStyle: { type: "dashed", width: 2 },
        itemStyle: { color: "#e6a23c" }
      }
    ]
  });
};

const handleResize = () => chart && chart.resize();

onMounted(() => {
  chart = echarts.init(chartRef.value);
  render();
  window.addEventListener("resize", handleResize);
});

watch(() => props.data, render, { deep: true });

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
  chart && chart.dispose();
  chart = null;
});
</script>

<style scoped>
.trend-chart {
  width: 100%;
  height: 260px;
}
</style>
