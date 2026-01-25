/**
 * UME座位管理模块单元测试
 */
import UmeSeatManage from "../seatManage.js";
import { APP_API_OBJ } from "@/common/index";

// Mock 依赖
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    hsmzyc: {
      getMoviePlaySeat: jest.fn(),
      lockSeat: jest.fn()
    }
  }
}));

jest.mock("@/utils/utils", () => ({
  formatErrInfo: jest.fn(err => (err?.message || String(err))),
  mockDelay: jest.fn(() => Promise.resolve())
}));

jest.mock("../../lockSeatQueue", () => ({
  __esModule: true,
  default: {
    assistLockSeatHandle: jest.fn()
  }
}));

describe("UmeSeatManage", () => {
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
      app_name: "hsmzyc",
      plat_name: "mayi",
      order_number: "test001"
    };

    seatManage = new UmeSeatManage(mockOrder, mockLogger, false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getSeatLayout", () => {
    test("应该成功获取座位布局", async () => {
      const mockData = {
        data: {
          seatList: [
            {
              seatId: "seat1",
              rowName: "7",
              columnName: "1",
              areaId: "0",
              status: 0
            },
            {
              seatId: "seat2",
              rowName: "7",
              columnName: "2",
              areaId: "0",
              status: 0
            }
          ],
          areaInfoList: [
            {
              areaId: "0",
              areaName: "普通区",
              areaSettlePrice: "3300",
              areaServiceFee: "0"
            }
          ]
        }
      };
      APP_API_OBJ.hsmzyc.getMoviePlaySeat.mockResolvedValue(mockData);

      const result = await seatManage.getSeatLayout({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        scheduleId: "123456",
        scheduleKey: "abc123",
        session_id: "test_session"
      });

      expect(result.seatList).toEqual(mockData.data.seatList);
      expect(result.areaInfoList).toEqual(mockData.data.areaInfoList);
      expect(result.error).toBeUndefined();
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.hsmzyc.getMoviePlaySeat.mockRejectedValue(error);

      const result = await seatManage.getSeatLayout({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        scheduleId: "123456",
        scheduleKey: "abc123"
      });

      expect(result.error).toBeDefined();
      expect(result.seatList).toEqual([]);
      expect(result.areaInfoList).toEqual([]);
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });

    test("应该处理空数据", async () => {
      const mockData = {
        data: {}
      };
      APP_API_OBJ.hsmzyc.getMoviePlaySeat.mockResolvedValue(mockData);

      const result = await seatManage.getSeatLayout({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        scheduleId: "123456",
        scheduleKey: "abc123"
      });

      expect(result.seatList).toEqual([]);
      expect(result.areaInfoList).toEqual([]);
    });
  });

  describe("getTargetSeat", () => {
    test("应该成功获取目标座位", async () => {
      const seatList = [
        {
          seatId: "seat1",
          rowName: "7",
          columnName: "1",
          areaId: "0",
          status: 0
        },
        {
          seatId: "seat2",
          rowName: "7",
          columnName: "2",
          areaId: "0",
          status: 0
        }
      ];

      const result = await seatManage.getTargetSeat({
        lockseat: "7排1座,7排2座",
        seatList,
        ticket_num: 2
      });

      expect(result.targeSeatList).toHaveLength(2);
      expect(result.error).toBeUndefined();
    });

    test("应该处理座位数量不匹配", async () => {
      const seatList = [
        {
          seatId: "seat1",
          rowName: "7",
          columnName: "1",
          areaId: "0",
          status: 0
        }
      ];

      const result = await seatManage.getTargetSeat({
        lockseat: "7排1座,7排2座",
        seatList,
        ticket_num: 2
      });

      expect(result.error).toBe("获取目标座位失败");
      expect(result.targeSeatList).toEqual([]);
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });

    test("应该处理座位名称格式（座/号/列）", async () => {
      const seatList = [
        {
          seatId: "seat1",
          rowName: "7",
          columnName: "1",
          areaId: "0",
          status: 0
        }
      ];

      const result1 = await seatManage.getTargetSeat({
        lockseat: "7排1座",
        seatList,
        ticket_num: 1
      });

      const result2 = await seatManage.getTargetSeat({
        lockseat: "7排1号",
        seatList,
        ticket_num: 1
      });

      const result3 = await seatManage.getTargetSeat({
        lockseat: "7排1列",
        seatList,
        ticket_num: 1
      });

      expect(result1.targeSeatList).toHaveLength(1);
      expect(result2.targeSeatList).toHaveLength(1);
      expect(result3.targeSeatList).toHaveLength(1);
    });
  });

  describe("lockSeatHandle", () => {
    test("应该成功锁定座位", async () => {
      const mockData = {
        data: {
          orderHeaderId: "order123",
          session_id: "session123"
        }
      };
      APP_API_OBJ.hsmzyc.lockSeat.mockResolvedValue(mockData);
      APP_API_OBJ.hsmzyc.getMoviePlaySeat.mockResolvedValue({
        data: { seatList: [], areaInfoList: [] }
      });

      const result = await seatManage.lockSeatHandle({
        scheduleId: "123456",
        scheduleKey: "abc123",
        filmUniqueId: "film123",
        showDate: "2026-01-25",
        ticketDetail: [],
        showDateTime: "2026-01-25 10:00:00",
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        lockseat: "7排1座",
        plat_name: "mayi",
        order_number: "test001",
        session_id: "test_session"
      });

      expect(result).toEqual(mockData.data);
      expect(APP_API_OBJ.hsmzyc.lockSeat).toHaveBeenCalled();
    });

    test("应该处理锁定座位失败", async () => {
      const error = new Error("座位已被锁定");
      APP_API_OBJ.hsmzyc.lockSeat.mockRejectedValue(error);
      APP_API_OBJ.hsmzyc.getMoviePlaySeat.mockResolvedValue({
        data: { seatList: [], areaInfoList: [] }
      });

      await expect(
        seatManage.lockSeatHandle({
          scheduleId: "123456",
          scheduleKey: "abc123",
          filmUniqueId: "film123",
          showDate: "2026-01-25",
          ticketDetail: [],
          showDateTime: "2026-01-25 10:00:00",
          cinemaCode: "32012801",
          cinemaLinkId: "15946",
          lockseat: "7排1座",
          plat_name: "mayi",
          order_number: "test001",
          session_id: "test_session"
        })
      ).rejects.toThrow();

      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });
});
