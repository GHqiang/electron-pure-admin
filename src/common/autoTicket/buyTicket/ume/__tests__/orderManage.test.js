/**
 * UME订单管理模块单元测试
 */
import UmeOrderManage from "../orderManage.js";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";

// Mock 依赖
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    hsmzyc: {
      getOptimalCardQuanCompose: jest.fn(),
      createOrder: jest.fn(),
      buyTicket: jest.fn(),
      getPayResult: jest.fn(),
      cannelOneOrder: jest.fn()
    }
  }
}));

jest.mock("@/api/sv-api", () => ({
  __esModule: true,
  default: {
    updateTicketRecord: jest.fn()
  }
}));

jest.mock("@/utils/utils", () => ({
  formatErrInfo: jest.fn(err => (err?.message || String(err))),
  sendWxPusherMessage: jest.fn(),
  mockDelay: jest.fn(() => Promise.resolve()),
  trial: jest.fn((fn, times, interval) => fn(1)),
  getCurrentTime: jest.fn(() => "2026-01-25 10:00:00")
}));

jest.mock("@/mixins/usesMachineBaseFun", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    updateQuanBlackInfo: jest.fn()
  }))
}));

describe("UmeOrderManage", () => {
  let orderManage;
  let mockLogger;
  let mockPlatManage;
  let mockOrder;
  let getCurrentParams;

  beforeEach(() => {
    mockLogger = {
      infoSave: jest.fn(),
      errorSave: jest.fn(),
      warn: jest.fn(),
      logList: []
    };

    mockPlatManage = {
      submitTicketCode: jest.fn().mockResolvedValue({ success: true }),
      orderTransferByPlat: jest.fn().mockResolvedValue({})
    };

    mockOrder = {
      app_name: "hsmzyc",
      plat_name: "mayi",
      order_number: "test001"
    };

    getCurrentParams = jest.fn(() => ({
      list: [
        {
          mobile: "13800138000",
          session_id: "test_session"
        }
      ],
      inx: 0
    }));

    orderManage = new UmeOrderManage(
      mockOrder,
      mockLogger,
      mockPlatManage,
      false,
      getCurrentParams
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getOptimalCardQuanCompose", () => {
    test("应该成功获取最优卡券组合", async () => {
      const mockData = {
        data: {
          cards: [
            {
              cardNo: "card123",
              cardAmount: 10000,
              discountAmount: 500
            }
          ],
          coupons: [
            {
              couponCode: "quan123",
              discountAmount: 1000
            }
          ]
        }
      };
      APP_API_OBJ.hsmzyc.getOptimalCardQuanCompose.mockResolvedValue(mockData);

      const result = await orderManage.getOptimalCardQuanCompose({
        orderCode: "order123",
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        orderHeaderId: "header123"
      });

      expect(result.cards).toBeDefined();
      expect(result.coupons).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.hsmzyc.getOptimalCardQuanCompose.mockRejectedValue(error);

      const result = await orderManage.getOptimalCardQuanCompose({
        orderCode: "order123",
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        orderHeaderId: "header123"
      });

      expect(result.error).toBeDefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("createOrder", () => {
    test("应该成功创建订单", async () => {
      const mockData = {
        data: {
          payOrderCode: "order123",
          orderHeaderId: "header123",
          paymentAmount: 5000
        }
      };
      APP_API_OBJ.hsmzyc.createOrder.mockResolvedValue(mockData);

      const result = await orderManage.createOrder({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        orderHeaderId: "header123",
        coupon: [],
        card_id: "card123",
        total_price: 50,
        timestamp: Date.now(),
        session_id: "test_session",
        mobile: "13800138000"
      });

      expect(result).toEqual(mockData.data);
      expect(APP_API_OBJ.hsmzyc.createOrder).toHaveBeenCalled();
    });

    test("应该处理创建订单超时重试", async () => {
      const error = { msg: "超时" };
      APP_API_OBJ.hsmzyc.createOrder
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          data: {
            payOrderCode: "order123",
            orderHeaderId: "header123"
          }
        });

      const result = await orderManage.createOrder({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        orderHeaderId: "header123",
        coupon: [],
        card_id: "card123",
        total_price: 50,
        timestamp: Date.now(),
        session_id: "test_session",
        mobile: "13800138000",
        isTimeoutRetry: 1
      });

      expect(result).toBeDefined();
      expect(APP_API_OBJ.hsmzyc.createOrder).toHaveBeenCalledTimes(2);
    });

    test("应该处理创建订单失败", async () => {
      const error = new Error("创建订单失败");
      APP_API_OBJ.hsmzyc.createOrder.mockRejectedValue(error);

      await expect(
        orderManage.createOrder({
          cinemaCode: "32012801",
          cinemaLinkId: "15946",
          orderHeaderId: "header123",
          coupon: [],
          card_id: "card123",
          total_price: 50,
          timestamp: Date.now(),
          session_id: "test_session",
          mobile: "13800138000"
        })
      ).rejects.toThrow();

      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("cancelOrder", () => {
    test("应该成功取消订单", async () => {
      const mockData = {
        data: {
          success: "1"
        }
      };
      APP_API_OBJ.hsmzyc.cannelOneOrder.mockResolvedValue(mockData);

      const result = await orderManage.cancelOrder({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        orderHeaderId: "header123",
        session_id: "test_session"
      });

      expect(result).toEqual(mockData);
      expect(APP_API_OBJ.hsmzyc.cannelOneOrder).toHaveBeenCalled();
    });

    test("应该处理取消订单失败", async () => {
      const error = new Error("取消订单失败");
      APP_API_OBJ.hsmzyc.cannelOneOrder.mockRejectedValue(error);

      const result = await orderManage.cancelOrder({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        orderHeaderId: "header123"
      });

      expect(result).toBeUndefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });
});
