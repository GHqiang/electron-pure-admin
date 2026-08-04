<template>
  <div class="fail-stack-chart" ref="chartRef"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import echarts from "../utils/echarts";

// 失败原因构成:按日堆叠柱(规则为空/超成本/超限价/其他),既看失败总数趋势也看占比变化(设计文档 §3.5)
const props = defineProps({
  data: { type: Array, default: () => [] }
});

const CATEGORIES = ["规则为空", "超成本", "超限价", "其他"];
const COLORS = { "规则为空": "#e6a23c", "超成本": "#f56c6c", "超限价": "#409eff", "其他": "#909399" };

const chartRef = ref(null);
let chart = null;

const render = () => {
  if (!chart) return;
  const dates = props.data.map(d => d.date);
  chart.setOption({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { data: CATEGORIES, top: 0, textStyle: { fontSize: 12 } },
    grid: { left: 50, right: 24, top: 36, bottom: 30 },
    xAxis: { type: "category", data: dates, axisLabel: { fontSize: 11 } },
    yAxis: { type: "value", name: "失败次数", splitLine: { lineStyle: { type: "dashed" } } },
    series: CATEGORIES.map(name => ({
      name,
      type: "bar",
      stack: "fail",
      data: props.data.map(d => Number(d.fail?.[name] || 0)),
      itemStyle: { color: COLORS[name] },
      emphasis: { focus: "series" }
    }))
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
.fail-stack-chart {
  width: 100%;
  height: 240px;
}
</style>
