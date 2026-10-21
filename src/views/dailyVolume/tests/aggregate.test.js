// 单量分析聚合纯函数单测
import {
  UNKNOWN_SERIES_CODE,
  UNKNOWN_SERIES_NAME,
  buildSeriesIndex,
  seriesOf,
  metricsOf,
  rateOf,
  buildCrossView,
  buildSeriesRank,
  buildCinemaRank,
  buildSummary,
  formatNum,
  formatRate
} from "../utils/aggregate";

const APP_TYPE_LIST = [
  { app_type_code: "sfc_applet", app_type_name: "乐影", app_name_list: ["sfc001", "sfc002"] },
  { app_type_code: "ume_applet", app_type_name: "凤凰云智小程序", app_name_list: ["ume001"] }
];

const ROWS = [
  { app_name: "sfc001", plat_name: "lieren", offer_success_num: 10, offer_fail_num: 2, ticket_total_num: 6, ticket_success_num: 5 },
  { app_name: "sfc002", plat_name: "sheng", offer_success_num: 4, offer_fail_num: 1, ticket_total_num: 2, ticket_success_num: 2 },
  { app_name: "ume001", plat_name: "lieren", offer_success_num: 3, offer_fail_num: 1, ticket_total_num: 1, ticket_success_num: 1 },
  { app_name: "gone001", plat_name: "sheng", offer_success_num: 1, offer_fail_num: 0, ticket_total_num: 0, ticket_success_num: 0 }
];

describe("buildSeriesIndex / seriesOf", () => {
  it("按 app_name 建立系列索引", () => {
    const index = buildSeriesIndex(APP_TYPE_LIST);
    expect(seriesOf(index, "sfc001")).toEqual({ code: "sfc_applet", name: "乐影" });
    expect(seriesOf(index, "ume001")).toEqual({ code: "ume_applet", name: "凤凰云智小程序" });
  });

  it("未匹配影院归入未分类", () => {
    const index = buildSeriesIndex(APP_TYPE_LIST);
    expect(seriesOf(index, "gone001")).toEqual({ code: UNKNOWN_SERIES_CODE, name: UNKNOWN_SERIES_NAME });
  });

  it("空列表不抛错", () => {
    expect(seriesOf(buildSeriesIndex([]), "x")).toEqual({ code: UNKNOWN_SERIES_CODE, name: UNKNOWN_SERIES_NAME });
    expect(seriesOf(buildSeriesIndex(), "x")).toEqual({ code: UNKNOWN_SERIES_CODE, name: UNKNOWN_SERIES_NAME });
  });
});

describe("metricsOf / rateOf", () => {
  it("缺字段按 0 处理", () => {
    expect(metricsOf({})).toEqual({ offerTotalNum: 0, offerSuccessNum: 0, ticketTotalNum: 0, ticketSuccessNum: 0 });
    expect(metricsOf(null).offerTotalNum).toBe(0);
  });

  it("报价量 = 成功 + 失败", () => {
    expect(metricsOf(ROWS[0])).toEqual({
      offerTotalNum: 12,
      offerSuccessNum: 10,
      ticketTotalNum: 6,
      ticketSuccessNum: 5
    });
  });

  it("分母为 0 返回 null", () => {
    expect(rateOf(0, 0)).toBeNull();
    expect(rateOf(3, 4)).toBe(0.75);
  });
});

describe("buildCrossView", () => {
  const seriesIndex = buildSeriesIndex(APP_TYPE_LIST);

  it("行=系列、列=平台、合计正确（指标=报价量）", () => {
    const view = buildCrossView(ROWS, { seriesIndex, platOrder: ["lieren", "sheng"] });
    expect(view.plats).toEqual(["lieren", "sheng"]);
    expect(view.grandTotal).toBe(22);
    expect(view.seriesRows.map(row => row.name)).toEqual(["乐影", "凤凰云智小程序", "未分类"]);
    const leying = view.seriesRows[0];
    expect(leying.total).toBe(17);
    expect(leying.cells.lieren).toBe(12);
    expect(leying.cells.sheng).toBe(5);
    expect(view.colTotals).toEqual({ lieren: 16, sheng: 6 });
    expect(view.maxCell).toEqual({ lieren: 12, sheng: 5 });
    expect(view.unmatchedCinemas).toBe(1);
  });

  it("切换指标只改单元格,不影响列集合", () => {
    const view = buildCrossView(ROWS, { seriesIndex, metric: "ticketSuccessNum" });
    expect(view.grandTotal).toBe(8);
    expect(view.seriesRows.find(row => row.name === "乐影").total).toBe(7);
    expect(view.plats.sort()).toEqual(["lieren", "sheng"]);
  });

  it("未在 platOrder 中的平台按出现顺序保留,空数组返回空视图", () => {
    const rows = [{ app_name: "sfc001", plat_name: "unknown_plat", offer_success_num: 1 }];
    const view = buildCrossView(rows, { seriesIndex, platOrder: ["lieren"] });
    expect(view.plats).toEqual(["unknown_plat"]);
    const empty = buildCrossView([], { seriesIndex });
    expect(empty).toEqual({ seriesRows: [], plats: [], colTotals: {}, grandTotal: 0, maxCell: {}, unmatchedCinemas: 0 });
  });
});

describe("buildSeriesRank", () => {
  const seriesIndex = buildSeriesIndex(APP_TYPE_LIST);

  it("按指标降序 + 成功率 + 占比", () => {
    const rank = buildSeriesRank(ROWS, { seriesIndex, metric: "offerTotalNum" });
    expect(rank.map(row => row.name)).toEqual(["乐影", "凤凰云智小程序", "未分类"]);
    expect(rank[0].offerTotalNum).toBe(17);
    expect(rank[0].offerSuccessNum).toBe(14);
    expect(rank[0].offerRate).toBeCloseTo(14 / 17);
    expect(rank[0].ticketRate).toBeCloseTo(7 / 8);
    expect(rank[0].share).toBeCloseTo(17 / 22);
    expect(rank[2].ticketTotalNum).toBe(0);
    expect(rank[2].ticketRate).toBeNull();
  });

  it("空数组返回空排行", () => {
    expect(buildSeriesRank([], { seriesIndex })).toEqual([]);
  });
});

describe("buildCinemaRank", () => {
  const seriesIndex = buildSeriesIndex(APP_TYPE_LIST);
  const appLabels = { sfc001: "上影影城A", sfc002: "上影影城B", ume001: "凤凰影城" };

  it("影院级聚合 + 系列名 + 名称回退", () => {
    const rank = buildCinemaRank(ROWS, { seriesIndex, appLabels, metric: "offerTotalNum" });
    expect(rank.map(row => row.appName)).toEqual(["sfc001", "sfc002", "ume001", "gone001"]);
    expect(rank[0]).toMatchObject({ name: "上影影城A", seriesName: "乐影", offerTotalNum: 12 });
    expect(rank[3]).toMatchObject({ name: "gone001-已调整", seriesName: "未分类" });
  });

  it("limit 截断,limit 为空返回全部", () => {
    expect(buildCinemaRank(ROWS, { seriesIndex, metric: "offerTotalNum", limit: 2 })).toHaveLength(2);
    expect(buildCinemaRank(ROWS, { seriesIndex, metric: "offerTotalNum" })).toHaveLength(4);
    expect(buildCinemaRank([], { seriesIndex })).toEqual([]);
  });
});

describe("buildSummary / 格式化", () => {
  it("合计四指标与双成功率", () => {
    const summary = buildSummary(ROWS);
    expect(summary).toMatchObject({
      offerTotalNum: 22,
      offerSuccessNum: 18,
      ticketTotalNum: 9,
      ticketSuccessNum: 8
    });
    expect(summary.offerRate).toBeCloseTo(18 / 22);
    expect(summary.ticketRate).toBeCloseTo(8 / 9);
  });

  it("formatNum 千分位,formatRate 空值显示 --", () => {
    expect(formatNum(12345)).toBe("12,345");
    expect(formatNum(0)).toBe("0");
    expect(formatNum(undefined)).toBe("0");
    expect(formatRate(0.756)).toBe("75.6%");
    expect(formatRate(null)).toBe("--");
  });
});
