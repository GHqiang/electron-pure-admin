// extractThirdPartyIds 单测
// 验证跨订单第三方 ID 缓存复用的字段提取逻辑
// 覆盖 8 个系列的 fieldMap 映射、app_name→系列key 映射、空值过滤、边界条件

// mock 常量列表函数（实际从 store 读取影院列表）
jest.mock("@/common/constant", () => ({
  GET_UME_LIST: () => ["ume_app1", "ume_app2"],
  GET_H5_UME_LIST: () => ["h5ume_app1", "h5ume_app2"],
  GET_SFC_APP_LIST: () => ["sfc_app1", "sfc_app2"],
  GET_CHENXING_LIST: () => ["chenxing_app1"],
  GET_FENGHUANG_LIST: () => ["fenghuang_app1"],
  GET_JINYI_LIST: () => ["jinyi_app1", "guangmeiwenhua"]
}));

import {
  extractThirdPartyIds,
  fieldMap,
  getSeriesKeyByAppName
} from "@/common/core/extractThirdPartyIds.js";

describe("extractThirdPartyIds - 第三方 ID 缓存提取", () => {
  describe("空值与边界", () => {
    it("cinemaInfo 为 null 应返回 null", () => {
      expect(extractThirdPartyIds(null, "wanda")).toBeNull();
    });

    it("cinemaInfo 为 undefined 应返回 null", () => {
      expect(extractThirdPartyIds(undefined, "wanda")).toBeNull();
    });

    it("appFlag 为空字符串应返回 null", () => {
      expect(extractThirdPartyIds({ cinema_id: "1" }, "")).toBeNull();
    });

    it("appFlag 为 null 应返回 null", () => {
      expect(extractThirdPartyIds({ cinema_id: "1" }, null)).toBeNull();
    });

    it("未知的 appFlag 应返回 null", () => {
      expect(extractThirdPartyIds({ cinema_id: "1" }, "unknown_app")).toBeNull();
    });

    it("所有字段都为空应返回 null", () => {
      expect(
        extractThirdPartyIds(
          { cinema_id: "", city_id: null, film_id: undefined },
          "wanda"
        )
      ).toBeNull();
    });
  });

  describe("wanda（完整版）", () => {
    const fields = ["city_id", "cinema_id", "film_id"];

    it("全部字段齐全应全部提取", () => {
      const cinemaInfo = {
        city_id: "110100",
        cinema_id: "12345",
        film_id: "67890",
        show_id: "abc123" // 场次级字段不应被提取
      };
      expect(extractThirdPartyIds(cinemaInfo, "wanda")).toEqual({
        city_id: "110100",
        cinema_id: "12345",
        film_id: "67890"
      });
    });

    it("部分字段缺失应只提取存在的字段", () => {
      const result = extractThirdPartyIds(
        { city_id: "110100", cinema_id: "12345", film_id: "", show_id: null },
        "wanda"
      );
      expect(result).toEqual({ city_id: "110100", cinema_id: "12345" });
    });

    it("应为深拷贝，不引用原对象", () => {
      const cinemaInfo = { city_id: "110100", cinema_id: "12345" };
      const result = extractThirdPartyIds(cinemaInfo, "wanda");
      result.city_id = "modified";
      expect(cinemaInfo.city_id).toBe("110100");
    });
  });

  describe("fenghuang（完整版）", () => {
    it("应提取 cinemaLinkId/filmId（场次级字段不缓存）", () => {
      const cinemaInfo = {
        cinemaLinkId: "link1",
        filmId: "film1",
        scheduleId: "sch1", // 场次级字段不应被提取
        scheduleKey: "key1" // 场次级字段不应被提取
      };
      expect(extractThirdPartyIds(cinemaInfo, "fenghuang")).toEqual({
        cinemaLinkId: "link1",
        filmId: "film1"
      });
    });
  });

  describe("sfc（精简版）", () => {
    it("应仅提取 city_id/cinema_id（不缓存影片和场次）", () => {
      const cinemaInfo = {
        city_id: "110100",
        cinema_id: "12345",
        film_id: "67890", // 不应被提取
        show_id: "abc123" // 不应被提取
      };
      expect(extractThirdPartyIds(cinemaInfo, "sfc")).toEqual({
        city_id: "110100",
        cinema_id: "12345"
      });
    });
  });

  describe("chenxing（完整版）", () => {
    it("应提取 cinemaId/filmId", () => {
      const cinemaInfo = {
        cinemaId: "c1",
        filmId: "f1",
        cinemaCode: "cc1" // 不应被提取
      };
      expect(extractThirdPartyIds(cinemaInfo, "chenxing")).toEqual({
        cinemaId: "c1",
        filmId: "f1"
      });
    });
  });

  describe("jinyi（完整版）", () => {
    it("应提取 cinema_id/film_id", () => {
      const cinemaInfo = {
        cinema_id: "c1",
        film_id: "f1",
        cinema_code: "cc1", // 不应被提取
        schedule_id: "s1", // 不应被提取
        hall_id: "h1" // 不应被提取
      };
      expect(extractThirdPartyIds(cinemaInfo, "jinyi")).toEqual({
        cinema_id: "c1",
        film_id: "f1"
      });
    });
  });

  describe("lma（完整版+：含影片级属性）", () => {
    it("应提取 cinema_id/city_id/short_code/feature/language_type", () => {
      const cinemaInfo = {
        cinema_id: "111",
        city_id: "222",
        short_code: "333",
        feature: "2D",
        language_type: "中文",
        session_id: "s1", // 场次级，不应被提取
        start_day: "2026-07-14" // 不应被提取
      };
      expect(extractThirdPartyIds(cinemaInfo, "lma")).toEqual({
        cinema_id: "111",
        city_id: "222",
        short_code: "333",
        feature: "2D",
        language_type: "中文"
      });
    });

    it("feature/language_type 为空时应只提取影院级 ID", () => {
      const result = extractThirdPartyIds(
        {
          cinema_id: "111",
          city_id: "222",
          short_code: "333",
          feature: null,
          language_type: ""
        },
        "lma"
      );
      expect(result).toEqual({
        cinema_id: "111",
        city_id: "222",
        short_code: "333"
      });
    });

    it("city_id 缺失时仍应提取其他字段（city_id 缓存命中分支单独恢复）", () => {
      const result = extractThirdPartyIds(
        { cinema_id: "111", short_code: "333", feature: "2D" },
        "lma"
      );
      expect(result).toEqual({
        cinema_id: "111",
        short_code: "333",
        feature: "2D"
      });
    });
  });

  describe("ume（完整版）", () => {
    it("应提取 cinemaCode/cinemaLinkId/filmUniqueId", () => {
      const cinemaInfo = {
        cinemaCode: "cc1",
        cinemaLinkId: "link1",
        filmUniqueId: "film1",
        scheduleId: "s1", // 不应被提取
        scheduleKey: "k1" // 不应被提取
      };
      expect(extractThirdPartyIds(cinemaInfo, "ume")).toEqual({
        cinemaCode: "cc1",
        cinemaLinkId: "link1",
        filmUniqueId: "film1"
      });
    });

    it("filmUniqueId 缺失应导致缓存不完整（影响命中校验）", () => {
      const result = extractThirdPartyIds(
        { cinemaCode: "cc1", cinemaLinkId: "link1" },
        "ume"
      );
      expect(result).toEqual({
        cinemaCode: "cc1",
        cinemaLinkId: "link1"
      });
      // 注意：出票流程 tryGetCachedThirdPartyIds 命中条件要求三字段齐全，
      // 缺 filmUniqueId 会导致 ume 缓存永不命中
    });
  });

  describe("h5ume（精简版）", () => {
    it("应提取 cinemaLinkId/filmId（不缓存场次级）", () => {
      const cinemaInfo = {
        cinemaLinkId: "link1",
        filmId: "film1",
        scheduleId: "s1", // 不应被提取
        scheduleKey: "k1", // 不应被提取
        hallId: "h1" // 不应被提取
      };
      expect(extractThirdPartyIds(cinemaInfo, "h5ume")).toEqual({
        cinemaLinkId: "link1",
        filmId: "film1"
      });
    });
  });

  describe("字段值类型支持", () => {
    it("应支持数字类型值", () => {
      const result = extractThirdPartyIds(
        { city_id: 110100, cinema_id: 12345 },
        "sfc"
      );
      expect(result).toEqual({ city_id: 110100, cinema_id: 12345 });
    });

    it("应支持 0 值（非空）", () => {
      const result = extractThirdPartyIds(
        { city_id: 0, cinema_id: 0 },
        "sfc"
      );
      expect(result).toEqual({ city_id: 0, cinema_id: 0 });
    });

    it("应过滤 undefined 和空字符串，保留 0", () => {
      const result = extractThirdPartyIds(
        { city_id: 0, cinema_id: "", film_id: undefined },
        "wanda"
      );
      expect(result).toEqual({ city_id: 0 });
    });
  });

  describe("fieldMap 完整性（8 个系列）", () => {
    const expectedSeries = [
      "wanda",
      "fenghuang",
      "sfc",
      "chenxing",
      "jinyi",
      "lma",
      "ume",
      "h5ume"
    ];

    it("fieldMap 应包含全部 8 个系列", () => {
      expectedSeries.forEach(series => {
        expect(fieldMap[series]).toBeDefined();
        expect(Array.isArray(fieldMap[series])).toBe(true);
        expect(fieldMap[series].length).toBeGreaterThan(0);
      });
      expect(Object.keys(fieldMap)).toHaveLength(8);
    });

    expectedSeries.forEach(series => {
      it(`${series} 应有对应的 fieldMap 配置且能提取字段`, () => {
        const testData = {};
        fieldMap[series].forEach(f => (testData[f] = "test_value"));
        const result = extractThirdPartyIds(testData, series);
        expect(result).not.toBeNull();
        expect(Object.keys(result).sort()).toEqual(
          [...fieldMap[series]].sort()
        );
      });
    });
  });

  describe("app_name → 系列 key 映射", () => {
    it("wanda 应直接命中 fieldMap", () => {
      expect(getSeriesKeyByAppName("wanda")).toBe("wanda");
    });

    it("lma 应直接命中 fieldMap", () => {
      expect(getSeriesKeyByAppName("lma")).toBe("lma");
    });

    it("ume 系列影院应映射为 ume", () => {
      expect(getSeriesKeyByAppName("ume_app1")).toBe("ume");
      expect(getSeriesKeyByAppName("ume_app2")).toBe("ume");
    });

    it("h5ume 系列影院应映射为 h5ume", () => {
      expect(getSeriesKeyByAppName("h5ume_app1")).toBe("h5ume");
      expect(getSeriesKeyByAppName("h5ume_app2")).toBe("h5ume");
    });

    it("sfc 系列影院应映射为 sfc", () => {
      expect(getSeriesKeyByAppName("sfc_app1")).toBe("sfc");
    });

    it("chenxing 系列影院应映射为 chenxing", () => {
      expect(getSeriesKeyByAppName("chenxing_app1")).toBe("chenxing");
    });

    it("fenghuang 系列影院应映射为 fenghuang", () => {
      expect(getSeriesKeyByAppName("fenghuang_app1")).toBe("fenghuang");
    });

    it("jinyi 系列影院（含 guangmeiwenhua）应映射为 jinyi", () => {
      expect(getSeriesKeyByAppName("jinyi_app1")).toBe("jinyi");
      expect(getSeriesKeyByAppName("guangmeiwenhua")).toBe("jinyi");
    });

    it("未知 app_name 应返回 null", () => {
      expect(getSeriesKeyByAppName("unknown_app")).toBeNull();
    });

    it("空值应返回 null", () => {
      expect(getSeriesKeyByAppName("")).toBeNull();
      expect(getSeriesKeyByAppName(null)).toBeNull();
      expect(getSeriesKeyByAppName(undefined)).toBeNull();
    });

    it("具体影院标识应能正确提取缓存字段", () => {
      // h5ume 系列的某个具体影院
      const result = extractThirdPartyIds(
        { cinemaLinkId: "link1", filmId: "film1" },
        "h5ume_app1"
      );
      expect(result).toEqual({ cinemaLinkId: "link1", filmId: "film1" });
    });

    it("sfc 系列的具体影院标识应能正确提取缓存字段", () => {
      const result = extractThirdPartyIds(
        { city_id: "110100", cinema_id: "12345" },
        "sfc_app1"
      );
      expect(result).toEqual({ city_id: "110100", cinema_id: "12345" });
    });
  });
});
