/**
 * SFC座位管理模块单元测试
 */
import SfcSeatManage from "../seatManage.js";
import { APP_API_OBJ } from "@/common/index";

// Mock 依赖
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    sfc: {
      getMoviePlaySeat: jest.fn(),
      lockSeat: jest.fn()
    }
  }
}));

jest.mock("@/utils/utils", () => ({
  formatErrInfo: jest.fn(err => (err?.message || String(err)))
}));

describe("SfcSeatManage", () => {
  let seatManage;
  let mockLogger;
  let mockOrder;

  beforeEach(() => {
    mockLogger = {
      infoSave: jest.fn(),
      errorSave: jest.fn(),
      info: jest.fn()
    };

    mockOrder = {
      app_name: "sfc",
      plat_name: "lieren",
      order_number: "test001"
    };

    seatManage = new SfcSeatManage(mockOrder, mockLogger, false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getSeatLayout", () => {
    test("应该成功获取座位布局", async () => {
      const mockData = {
        data: {
          play_data: {
            seat_data: [
              ["seat1", 1, "0", 2, 50, "5排5座"],
              ["seat2", 1, "0", 2, 50, "5排6座"]
            ],
            area_price: [{ area_id: "1", price: 50 }],
            promo_num: 0
          }
        }
      };
      APP_API_OBJ.sfc.getMoviePlaySeat.mockResolvedValue(mockData);

      const result = await seatManage.getSeatLayout({
        city_id: "500",
        cinema_id: "13",
        show_id: "7255871",
        session_id: "test_session"
      });

      expect(result.seatData).toEqual(mockData.data.play_data.seat_data);
      expect(result.area_price).toEqual(mockData.data.play_data.area_price);
      expect(result.promo_num).toBe(0);
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.sfc.getMoviePlaySeat.mockRejectedValue(error);

      const result = await seatManage.getSeatLayout({
        city_id: "500",
        cinema_id: "13",
        show_id: "7255871",
        session_id: "test_session"
      });

      expect(result.error).toBeDefined();
      expect(result.seatData).toEqual([]);
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("getTargetSeat", () => {
    test("应该成功获取目标座位", async () => {
      const seatList = [
        ["seat1", 1, "0", 2, 50, "5排5号"],
        ["seat2", 1, "0", 2, 50, "5排6号"]
      ];

      const result = await seatManage.getTargetSeat({
        lockseat: "5排5座,5排6座",
        seatList,
        ticket_num: 2
      });

      expect(result.seat_ids).toBe("seat1,seat2");
      expect(result.seat_info).toBe("5排5号,5排6号");
    });

    test("应该处理座位数量不匹配", async () => {
      const seatList = [
        ["seat1", 1, "0", 2, 50, "5排5号"]
      ];

      const result = await seatManage.getTargetSeat({
        lockseat: "5排5座,5排6座",
        seatList,
        ticket_num: 2
      });

      expect(result.error).toBe("获取目标座位失败");
      expect(result.seat_ids).toBe("");
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });

    test("应该处理异常", async () => {
      const result = await seatManage.getTargetSeat({
        lockseat: null,
        seatList: null,
        ticket_num: 1
      });

      expect(result.error).toBeDefined();
      expect(result.seat_ids).toBe("");
    });
  });

  describe("lockSeatHandle", () => {
    test("应该成功锁定座位", async () => {
      const mockData = { data: { success: "1" } };
      APP_API_OBJ.sfc.lockSeat.mockResolvedValue(mockData);

      const result = await seatManage.lockSeatHandle({
        city_id: "500",
        cinema_id: "13",
        show_id: "7255871",
        seat_ids: "seat1,seat2",
        start_day: "2026-01-25",
        start_time: "10:25",
        session_id: "test_session"
      });

      expect(result).toEqual(mockData);
      expect(APP_API_OBJ.sfc.lockSeat).toHaveBeenCalledWith(
        expect.objectContaining({
          city_id: "500",
          cinema_id: "13",
          show_id: "7255871",
          seat_ids: "seat1,seat2",
          force_lock: "-1"
        })
      );
    });

    test("应该处理锁定座位失败", async () => {
      const error = new Error("锁定失败");
      APP_API_OBJ.sfc.lockSeat.mockRejectedValue(error);

      await expect(
        seatManage.lockSeatHandle({
          city_id: "500",
          cinema_id: "13",
          show_id: "7255871",
          seat_ids: "seat1",
          start_day: "2026-01-25",
          start_time: "10:25",
          session_id: "test_session"
        })
      ).rejects.toThrow();

      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });
});
