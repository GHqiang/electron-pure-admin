/**
 * retry-helper.js 单元测试
 * 验证所有重试逻辑的正确性
 */
import axios from "axios";
import {
  isNetworkError,
  isTimeoutError,
  isRetryableError,
  checkUrlCanRetry,
  mockDelay,
  handleNetworkRetry
} from "@/utils/http/retry-helper";

// Mock axios.isAxiosError
jest.mock("axios", () => ({
  isAxiosError: jest.fn()
}));

describe("retry-helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // 1. isRetryableError 测试
  // ============================================================
  describe("isRetryableError", () => {
    it("非 axios 错误返回 false", () => {
      axios.isAxiosError.mockReturnValue(false);
      expect(isRetryableError(new Error("test"))).toBe(false);
    });

    it("timeout 消息返回 true", () => {
      axios.isAxiosError.mockReturnValue(true);
      expect(isRetryableError({ message: "timeout of 20000ms exceeded" })).toBe(
        true
      );
    });

    it("network error 消息返回 true", () => {
      axios.isAxiosError.mockReturnValue(true);
      expect(isRetryableError({ message: "Network Error" })).toBe(true);
    });

    it("Request failed with status code 408 返回 true", () => {
      axios.isAxiosError.mockReturnValue(true);
      expect(
        isRetryableError({ message: "Request failed with status code 408" })
      ).toBe(true);
    });

    it("ECONNABORTED 错误码返回 true", () => {
      axios.isAxiosError.mockReturnValue(true);
      expect(isRetryableError({ code: "ECONNABORTED", message: "" })).toBe(
        true
      );
    });

    it("4xx 错误返回 false", () => {
      axios.isAxiosError.mockReturnValue(true);
      expect(
        isRetryableError({ message: "Request failed with status code 400" })
      ).toBe(false);
    });

    it("5xx 错误返回 false（不应重试服务器错误）", () => {
      axios.isAxiosError.mockReturnValue(true);
      expect(
        isRetryableError({ message: "Request failed with status code 500" })
      ).toBe(false);
    });
  });

  // ============================================================
  // 2. checkUrlCanRetry 测试
  // ============================================================
  describe("checkUrlCanRetry", () => {
    const whitelist = ["/cinema/", "/film/", "/seat/", "citycinemas.get"];

    it("匹配白名单中的 URL 返回 true", () => {
      expect(checkUrlCanRetry("/sfc/cinema/list", whitelist)).toBe(true);
      expect(checkUrlCanRetry("/wanda/film/info", whitelist)).toBe(true);
      expect(checkUrlCanRetry("/api/seat/map", whitelist)).toBe(true);
    });

    it("MTOP 方法名匹配返回 true", () => {
      expect(
        checkUrlCanRetry("/fenghuang/...citycinemas.get...", whitelist)
      ).toBe(true);
    });

    it("不匹配的 URL 返回 false", () => {
      expect(checkUrlCanRetry("/api/lock/seat", whitelist)).toBe(false);
      expect(checkUrlCanRetry("/api/order/create", whitelist)).toBe(false);
    });

    it("空 URL 返回 false", () => {
      expect(checkUrlCanRetry("", whitelist)).toBe(false);
      expect(checkUrlCanRetry(null, whitelist)).toBe(false);
    });

    it("空白名单返回 false", () => {
      expect(checkUrlCanRetry("/api/cinema/list", [])).toBe(false);
    });

    it("大小写不敏感", () => {
      expect(checkUrlCanRetry("/API/CINEMA/LIST", ["/cinema/"])).toBe(true);
    });
  });

  // ============================================================
  // 3. handleNetworkRetry 测试
  // ============================================================
  describe("handleNetworkRetry", () => {
    let mockInstance;

    beforeEach(() => {
      jest.useFakeTimers();
      mockInstance = jest.fn();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("config 为 null 返回 null", async () => {
      axios.isAxiosError.mockReturnValue(true);
      const result = await handleNetworkRetry(
        { message: "timeout" },
        null,
        mockInstance,
        {}
      );
      expect(result).toBeNull();
    });

    it("不可重试的错误返回 null", async () => {
      axios.isAxiosError.mockReturnValue(false);
      const config = {};
      const result = await handleNetworkRetry(
        new Error("test"),
        config,
        mockInstance,
        {}
      );
      expect(result).toBeNull();
      expect(config.retryCount).toBe(0);
    });

    it("URL 不在白名单时返回 null", async () => {
      axios.isAxiosError.mockReturnValue(true);
      const config = { url: "/api/lock/seat" };
      const result = await handleNetworkRetry(
        { message: "timeout", code: "ECONNABORTED" },
        config,
        mockInstance,
        { whitelist: ["/cinema/"] }
      );
      expect(result).toBeNull();
    });

    it("可重试错误 + 白名单匹配 → 调用 instance(config) 并递增重试计数", async () => {
      axios.isAxiosError.mockReturnValue(true);
      mockInstance.mockResolvedValue({ data: "success" });

      const config = { url: "/sfc/cinema/list" };
      const result = handleNetworkRetry(
        { message: "timeout of 20000ms exceeded" },
        config,
        mockInstance,
        { maxRetries: 3, whitelist: ["/cinema/"] }
      );

      // 快进定时器
      jest.advanceTimersByTime(1000);

      const resolved = await result;
      expect(resolved).toEqual({ data: "success" });
      expect(config.retryCount).toBe(1);
      expect(mockInstance).toHaveBeenCalledWith(config);
    });

    it("空白名单允许所有接口重试", async () => {
      axios.isAxiosError.mockReturnValue(true);
      mockInstance.mockResolvedValue({ data: "success" });

      const config = { url: "/api/any/endpoint" };
      const result = handleNetworkRetry(
        { message: "Network Error" },
        config,
        mockInstance,
        { maxRetries: 3, whitelist: [] }
      );

      jest.advanceTimersByTime(1000);
      const resolved = await result;
      expect(resolved).toEqual({ data: "success" });
      expect(config.retryCount).toBe(1);
    });

    it("达到最大重试次数后返回 null", async () => {
      axios.isAxiosError.mockReturnValue(true);
      const config = { url: "/api/cinema", retryCount: 3 };

      const result = await handleNetworkRetry(
        { message: "timeout" },
        config,
        mockInstance,
        { maxRetries: 3, whitelist: [] }
      );
      expect(result).toBeNull();
      expect(config.retryCount).toBe(3); // 未递增
      expect(mockInstance).not.toHaveBeenCalled();
    });

    it("递增延迟：第1次 1s，第2次 2s，第3次 3s", async () => {
      axios.isAxiosError.mockReturnValue(true);
      const config = { url: "/api/cinema", retryCount: 0 };
      mockInstance.mockRejectedValue(new Error("fail"));

      const promise = handleNetworkRetry(
        { message: "timeout" },
        config,
        mockInstance,
        { maxRetries: 3, whitelist: [] }
      );
      // 捕获重试最终失败后的 rejection
      promise.catch(() => {});

      // 第1次重试：应该在 1s 后调用
      jest.advanceTimersByTime(1000);
      // 刷新微任务队列确保 await 后的代码执行
      await Promise.resolve();
      expect(mockInstance).toHaveBeenCalledTimes(1);
      expect(config.retryCount).toBe(1);
    });

    it("onRetry 回调被正确调用", async () => {
      axios.isAxiosError.mockReturnValue(true);
      mockInstance.mockResolvedValue({ data: "ok" });
      const onRetry = jest.fn();

      const config = { url: "/api/cinema" };
      const result = handleNetworkRetry(
        { message: "timeout" },
        config,
        mockInstance,
        { whitelist: [], onRetry }
      );

      jest.advanceTimersByTime(1000);
      await result;
      expect(onRetry).toHaveBeenCalledWith(config, expect.any(Object));
    });
  });

  // ============================================================
  // 4. mockDelay 测试
  // ============================================================
  describe("mockDelay", () => {
    it("延迟指定秒数", async () => {
      jest.useFakeTimers();
      let resolved = false;
      const promise = mockDelay(2).then(() => {
        resolved = true;
      });

      jest.advanceTimersByTime(1999);
      expect(resolved).toBe(false);
      jest.advanceTimersByTime(1);
      await promise;
      expect(resolved).toBe(true);
      jest.useRealTimers();
    });
  });

  // ============================================================
  // 5. 各系列白名单覆盖验证
  // ============================================================
  describe("各系列白名单覆盖验证", () => {
    const whitelists = {
      sfc: [
        "/city/list",
        "/cinema/list",
        "/movie/movie-online-list",
        "/cinema/play-info",
        "/play/seat",
        "/card/get-user-cinema-card",
        "/coupon/get-list",
        "v2/coupon/bind-coupon-code"
      ],
      lma: [
        "/index/film",
        "/index/sell_session",
        "/ibuypro/index",
        "/imember/index",
        "/icoupon/index",
        "/iorder/get_order",
        "/ihistory/ticket_info",
        "/ihistory/ticket"
      ],
      ume: [
        "/cinCinemaInfoService/findCinCityToApp",
        "/cinCinemaFilmInfoService/findFilmInfoToApp",
        "/cinScheduleInfoService/findCinScheduleDataToApp",
        "/cinScheduleInfoService/findScheduleInfoToApp",
        "/cinSyncService/findSeatMapInfo",
        "/optimalCombinatService/getOptimalCombination"
      ],
      fenghuang: [
        "citycinemas.get",
        "cinemafilms.get",
        "filmschedules.get",
        "scheduleseats.get",
        "scheduleseatprices.get",
        "membercards.get",
        "membercarddetail.get",
        "mycoupon.get",
        "order.detail.get",
        "orders.get"
      ],
      jinyi: ["/ticket/", "/citys/"],
      wandaFilm: [
        "/wanda-film/cinema",
        "/wanda-film/film",
        "/wanda-film/schedule",
        "/wanda-film/seat",
        "/wanda-film/order/query"
      ]
    };

    it("sfc 白名单覆盖所有查询接口", () => {
      // 影院列表
      expect(checkUrlCanRetry("/sfc/city/list", whitelists.sfc)).toBe(true);
      expect(checkUrlCanRetry("/sfc/cinema/list", whitelists.sfc)).toBe(true);
      // 电影列表
      expect(
        checkUrlCanRetry("/sfc/movie/movie-online-list", whitelists.sfc)
      ).toBe(true);
      // 排期/座位
      expect(checkUrlCanRetry("/sfc/cinema/play-info", whitelists.sfc)).toBe(
        true
      );
      expect(checkUrlCanRetry("/sfc/play/seat", whitelists.sfc)).toBe(true);
      // 卡/券
      expect(
        checkUrlCanRetry("/sfc/card/get-user-cinema-card", whitelists.sfc)
      ).toBe(true);
      expect(checkUrlCanRetry("/sfc/coupon/get-list", whitelists.sfc)).toBe(
        true
      );
      expect(
        checkUrlCanRetry("/sfc/v2/coupon/bind-coupon-code", whitelists.sfc)
      ).toBe(true);
      // 写操作不在白名单
      expect(checkUrlCanRetry("/sfc/user/lock-seat", whitelists.sfc)).toBe(
        false
      );
      expect(checkUrlCanRetry("/sfc/v2/order/ng-create", whitelists.sfc)).toBe(
        false
      );
      expect(checkUrlCanRetry("/sfc/ticket/ng-buy", whitelists.sfc)).toBe(
        false
      );
    });

    it("lma 白名单覆盖所有查询接口", () => {
      expect(checkUrlCanRetry("/lma/mp/index/film", whitelists.lma)).toBe(true);
      expect(
        checkUrlCanRetry("/lma/mp/index/sell_session", whitelists.lma)
      ).toBe(true);
      expect(checkUrlCanRetry("/lma/mp/ibuypro/index", whitelists.lma)).toBe(
        true
      );
      expect(checkUrlCanRetry("/lma/mp/imember/index", whitelists.lma)).toBe(
        true
      );
      expect(checkUrlCanRetry("/lma/mp/icoupon/index", whitelists.lma)).toBe(
        true
      );
      expect(checkUrlCanRetry("/lma/mp/iorder/get_order", whitelists.lma)).toBe(
        true
      );
      expect(
        checkUrlCanRetry("/lma/mp/ihistory/ticket_info", whitelists.lma)
      ).toBe(true);
      expect(checkUrlCanRetry("/lma/mp/ihistory/ticket", whitelists.lma)).toBe(
        true
      );
      // 写操作不在白名单
      expect(
        checkUrlCanRetry("/lma/mp/ibuypro/add_ticket", whitelists.lma)
      ).toBe(false);
      expect(checkUrlCanRetry("/lma/mp/iorder/complete", whitelists.lma)).toBe(
        false
      );
    });

    it("ume 白名单覆盖所有查询接口", () => {
      expect(
        checkUrlCanRetry(
          "/ume/api/storeServer/cinCinemaInfoService/findCinCityToApp",
          whitelists.ume
        )
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ume/api/storeServer/cinCinemaFilmInfoService/findFilmInfoToApp",
          whitelists.ume
        )
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ume/api/storeServer/cinScheduleInfoService/findCinScheduleDataToApp",
          whitelists.ume
        )
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ume/api/storeServer/cinScheduleInfoService/findScheduleInfoToApp",
          whitelists.ume
        )
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ume/api/storeServer/cinSyncService/findSeatMapInfo",
          whitelists.ume
        )
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ume/api/storeServer/optimalCombinatService/getOptimalCombination",
          whitelists.ume
        )
      ).toBe(true);
      // 写操作不在白名单
      expect(
        checkUrlCanRetry(
          "/ume/api/storeServer/storeTkOrderHeaderService/createMovieTicketsOrder",
          whitelists.ume
        )
      ).toBe(false);
    });

    it("fenghuang 白名单覆盖所有查询 MTOP 接口", () => {
      expect(checkUrlCanRetry("citycinemas.get", whitelists.fenghuang)).toBe(
        true
      );
      expect(checkUrlCanRetry("cinemafilms.get", whitelists.fenghuang)).toBe(
        true
      );
      expect(checkUrlCanRetry("filmschedules.get", whitelists.fenghuang)).toBe(
        true
      );
      expect(checkUrlCanRetry("scheduleseats.get", whitelists.fenghuang)).toBe(
        true
      );
      expect(
        checkUrlCanRetry("scheduleseatprices.get", whitelists.fenghuang)
      ).toBe(true);
      expect(checkUrlCanRetry("membercards.get", whitelists.fenghuang)).toBe(
        true
      );
      expect(
        checkUrlCanRetry("membercarddetail.get", whitelists.fenghuang)
      ).toBe(true);
      expect(checkUrlCanRetry("mycoupon.get", whitelists.fenghuang)).toBe(true);
      expect(checkUrlCanRetry("order.detail.get", whitelists.fenghuang)).toBe(
        true
      );
      expect(checkUrlCanRetry("orders.get", whitelists.fenghuang)).toBe(true);
      // 写操作不在白名单
      expect(checkUrlCanRetry("scheduleseats.lock", whitelists.fenghuang)).toBe(
        false
      );
      expect(checkUrlCanRetry("ticketorder.create", whitelists.fenghuang)).toBe(
        false
      );
      expect(checkUrlCanRetry("order.cancel", whitelists.fenghuang)).toBe(
        false
      );
    });

    it("jinyi 白名单覆盖所有 /ticket/ 下查询接口", () => {
      expect(
        checkUrlCanRetry("/ticket/channelCode/citys/", whitelists.jinyi)
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ticket/channelCode/cinema/123/movies/",
          whitelists.jinyi
        )
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ticket/channelCode/cinema/123/shows/",
          whitelists.jinyi
        )
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ticket/channelCode/cinema/123/hall/info/",
          whitelists.jinyi
        )
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ticket/channelCode/cinema/123/hall/saleable/",
          whitelists.jinyi
        )
      ).toBe(true);
      expect(
        checkUrlCanRetry(
          "/ticket/channelCode/cinema/123/order/info",
          whitelists.jinyi
        )
      ).toBe(true);
    });
  });
});
