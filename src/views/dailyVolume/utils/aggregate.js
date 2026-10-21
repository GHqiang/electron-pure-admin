/**
 * 单量分析聚合工具(纯函数,无 Vue 依赖,便于单测)
 * 入参 rows 为后端 /statisticalAnalysis/cross 的原始行:
 *   { app_name, plat_name, offer_success_num, offer_fail_num, ticket_total_num, ticket_success_num }
 */

export const UNKNOWN_SERIES_CODE = "unknown";
export const UNKNOWN_SERIES_NAME = "未分类";

const METRIC_FIELDS = [
  "offerTotalNum",
  "offerSuccessNum",
  "ticketTotalNum",
  "ticketSuccessNum"
];

const toNum = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// 成功率:分母 <= 0 返回 null(页面显示 "--"),避免"没单"与"全失败"混淆
export const rateOf = (numerator, denominator) =>
  denominator > 0 ? numerator / denominator : null;

// 系列索引:appTypeList = [{ app_type_code, app_type_name, app_name_list: [] }]
export const buildSeriesIndex = (appTypeList = []) => {
  const map = new Map();
  (appTypeList || []).forEach(item => {
    ((item && item.app_name_list) || []).forEach(appName => {
      map.set(appName, {
        code: item.app_type_code,
        name: item.app_type_name || item.app_type_code
      });
    });
  });
  return map;
};

// 取系列信息,未知影院归「未分类」
export const seriesOf = (seriesIndex, appName) =>
  (seriesIndex && seriesIndex.get(appName)) || {
    code: UNKNOWN_SERIES_CODE,
    name: UNKNOWN_SERIES_NAME
  };

// 单行 -> 四指标(缺字段按 0)
export const metricsOf = row => {
  const offerSuccessNum = toNum(row && row.offer_success_num);
  const offerFailNum = toNum(row && row.offer_fail_num);
  return {
    offerTotalNum: offerSuccessNum + offerFailNum,
    offerSuccessNum,
    ticketTotalNum: toNum(row && row.ticket_total_num),
    ticketSuccessNum: toNum(row && row.ticket_success_num)
  };
};

const emptyMetrics = () =>
  METRIC_FIELDS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

const addMetrics = (target, source) => {
  METRIC_FIELDS.forEach(key => {
    target[key] += toNum(source && source[key]);
  });
  return target;
};

// 平台列顺序:已知平台按 platOrder 排在前,未知平台按出现顺序追加
const orderPlats = (plats, platOrder = []) => {
  const known = platOrder.filter(plat => plats.has(plat));
  const unknown = [...plats].filter(plat => !platOrder.includes(plat));
  return [...known, ...unknown];
};

// 平台×系列交叉:行=系列,列=平台,单元格=当前指标值
export const buildCrossView = (
  rows = [],
  { seriesIndex, platOrder = [], metric = "offerTotalNum" } = {}
) => {
  const seriesMap = new Map();
  const plats = new Set();
  const unmatchedCinemas = new Set();

  (rows || []).forEach(row => {
    if (!row || !row.app_name) return;
    const series = seriesOf(seriesIndex, row.app_name);
    if (series.code === UNKNOWN_SERIES_CODE) unmatchedCinemas.add(row.app_name);
    const plat = row.plat_name || "";
    plats.add(plat);
    let seriesItem = seriesMap.get(series.code);
    if (!seriesItem) {
      seriesItem = {
        code: series.code,
        name: series.name,
        cells: {},
        metrics: emptyMetrics()
      };
      seriesMap.set(series.code, seriesItem);
    }
    const metrics = metricsOf(row);
    addMetrics(seriesItem.metrics, metrics);
    seriesItem.cells[plat] = (seriesItem.cells[plat] || 0) + metrics[metric];
  });

  const platList = orderPlats(plats, platOrder);
  const seriesRows = [...seriesMap.values()]
    .map(item => ({ ...item, total: item.metrics[metric] || 0 }))
    .sort((a, b) => b.total - a.total);
  const colTotals = platList.reduce((acc, plat) => {
    acc[plat] = seriesRows.reduce((sum, item) => sum + (item.cells[plat] || 0), 0);
    return acc;
  }, {});
  // 每列最大值:交叉表热力底色按列归一化
  const maxCell = platList.reduce((acc, plat) => {
    acc[plat] = seriesRows.reduce((max, item) => Math.max(max, item.cells[plat] || 0), 0);
    return acc;
  }, {});
  const grandTotal = seriesRows.reduce((sum, item) => sum + item.total, 0);

  return {
    seriesRows,
    plats: platList,
    colTotals,
    grandTotal,
    maxCell,
    unmatchedCinemas: unmatchedCinemas.size
  };
};

// 系列排行:按当前指标降序,附双成功率与占总量比
export const buildSeriesRank = (
  rows = [],
  { seriesIndex, metric = "offerTotalNum" } = {}
) => {
  const map = new Map();
  (rows || []).forEach(row => {
    if (!row || !row.app_name) return;
    const series = seriesOf(seriesIndex, row.app_name);
    let item = map.get(series.code);
    if (!item) {
      item = { code: series.code, name: series.name, metrics: emptyMetrics() };
      map.set(series.code, item);
    }
    addMetrics(item.metrics, metricsOf(row));
  });
  const list = [...map.values()];
  const total = list.reduce((sum, item) => sum + item.metrics[metric], 0);
  return list
    .map(item => ({
      code: item.code,
      name: item.name,
      ...item.metrics,
      offerRate: rateOf(item.metrics.offerSuccessNum, item.metrics.offerTotalNum),
      ticketRate: rateOf(item.metrics.ticketSuccessNum, item.metrics.ticketTotalNum),
      share: total > 0 ? item.metrics[metric] / total : 0
    }))
    .sort((a, b) => b[metric] - a[metric]);
};

// 影院排行:影院级聚合,附系列名与名称回退
export const buildCinemaRank = (
  rows = [],
  { seriesIndex, appLabels = {}, metric = "offerTotalNum", limit = null } = {}
) => {
  const map = new Map();
  (rows || []).forEach(row => {
    if (!row || !row.app_name) return;
    let item = map.get(row.app_name);
    if (!item) {
      const series = seriesOf(seriesIndex, row.app_name);
      item = {
        appName: row.app_name,
        name: appLabels[row.app_name] || `${row.app_name}-已调整`,
        seriesCode: series.code,
        seriesName: series.name,
        metrics: emptyMetrics()
      };
      map.set(row.app_name, item);
    }
    addMetrics(item.metrics, metricsOf(row));
  });
  const list = [...map.values()]
    .map(item => ({
      ...item,
      ...item.metrics,
      offerRate: rateOf(item.metrics.offerSuccessNum, item.metrics.offerTotalNum),
      ticketRate: rateOf(item.metrics.ticketSuccessNum, item.metrics.ticketTotalNum)
    }))
    .sort((a, b) => b[metric] - a[metric]);
  return limit && limit > 0 ? list.slice(0, limit) : list;
};

// 周期小结:四指标合计 + 双成功率
export const buildSummary = (rows = []) => {
  const metrics = emptyMetrics();
  (rows || []).forEach(row => addMetrics(metrics, metricsOf(row)));
  return {
    ...metrics,
    offerRate: rateOf(metrics.offerSuccessNum, metrics.offerTotalNum),
    ticketRate: rateOf(metrics.ticketSuccessNum, metrics.ticketTotalNum)
  };
};

// 千分位数字,空值按 0
export const formatNum = value => {
  const n = Math.round(toNum(value));
  return n.toLocaleString("zh-CN");
};

// 成功率百分比,空值(--)
export const formatRate = value =>
  value === null || value === undefined ? "--" : `${(value * 100).toFixed(1)}%`;
