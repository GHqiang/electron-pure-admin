/**
 * SFC订单管理模块单元测试
 */
import SfcOrderManage from "../orderManage.js";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";

// Mock 依赖
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    sfc: {
      priceCalculation: jest.fn(),
      createOrder: jest.fn(),
      buyTicket: jest.fn(),
      payOrder: jest.fn(),
      getOrderList: jest.fn(),
      cancelOrder: jest.fn()
    }
  },
  GET_APP_INFO: jest.fn(() => ({
    sfc_open_id: "test_open_id"
  }))
}));

jest.mock("@/common/constant", () => ({
  GET_APP_INFO: jest.fn(() => ({
    sfc_open_id: "test_open_id"
  })),
  sfcV3AppList: []
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

jest.mock("@/utils/sfc-member-password", () => ({
  encode: jest.fn(pwd => `encoded_${pwd}`)
}));

describe("SfcOrderManage", () => {
  let orderManage;
  let mockLogger;
  let mockPlatManage;
  let mockSeatManage;
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

    mockSeatManage = {
      getSeatLayout: jest.fn().mockResolvedValue({
        seatData: [["seat1", 1, "0", 2, 50, "5排5号"]]
      }),
      lockSeatHandle: jest.fn().mockResolvedValue({ success: "1" })
    };

    mockOrder = {
      app_name: "sfc",
      plat_name: "lieren",
      order_number: "test001"
    };

    getCurrentParams = jest.fn(() => ({
      list: [
        {
          mobile: "13800138000",
          member_pwd: "123456",
          session_id: "test_session"
        }
      ],
      inx: 0
    }));

    orderManage = new SfcOrderManage(
      mockOrder,
      mockLogger,
      mockPlatManage,
      false,
      getCurrentParams,
      mockSeatManage
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("priceCalculation", () => {
    test("应该成功计算订单价格", async () => {
      const mockData = {
        data: {
          price: {
            total_price: 50,
            price: 50
          }
        }
      };
      APP_API_OBJ.sfc.priceCalculation.mockResolvedValue(mockData);

      const result = await orderManage.priceCalculation({
        city_id: "500",
        cinema_id: "13",
        show_id: "7255871",
        seat_ids: "seat1",
        session_id: "test_session",
        appFlag: "sfc"
      });

      expect(result.price).toEqual(mockData.data.price);
      expect(APP_API_OBJ.sfc.priceCalculation).toHaveBeenCalled();
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.sfc.priceCalculation.mockRejectedValue(error);

      const result = await orderManage.priceCalculation({
        city_id: "500",
        cinema_id: "13",
        show_id: "7255871",
        seat_ids: "seat1",
        session_id: "test_session",
        appFlag: "sfc"
      });

      expect(result.error).toBeDefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("createOrder", () => {
    test("应该成功创建订单", async () => {
      const mockData = {
        data: {
          order_num: "202601250121200451038686"
        }
      };
      APP_API_OBJ.sfc.createOrder.mockResolvedValue(mockData);

      const result = await orderManage.createOrder({
        city_id: "500",
        cinema_id: "13",
        show_id: "7255871",
        seat_ids: "seat1",
        seat_info: "5排5号",
        pay_money: 50,
        session_id: "test_session"
      });

      expect(result).toBe("202601250121200451038686");
      expect(APP_API_OBJ.sfc.createOrder).toHaveBeenCalled();
    });

    test("应该处理超时重试", async () => {
      const error = { msg: "请求接口超时,请重试" };
      APP_API_OBJ.sfc.createOrder
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          data: { order_num: "202601250121200451038686" }
        });

      const result = await orderManage.createOrder({
        city_id: "500",
        cinema_id: "13",
        show_id: "7255871",
        seat_ids: "seat1",
        pay_money: 50,
        session_id: "test_session",
        isTimeoutRetry: 1
      });

      expect(result).toBe("202601250121200451038686");
      expect(APP_API_OBJ.sfc.createOrder).toHaveBeenCalledTimes(2);
    });
  });

  describe("buyTicket", () => {
    test("应该成功购买订单", async () => {
      const mockData = {
        data: { success: "1" }
      };
      APP_API_OBJ.sfc.buyTicket.mockResolvedValue(mockData);

      const result = await orderManage.buyTicket({
        city_id: "500",
        cinema_id: "13",
        order_num: "202601250121200451038686",
        pay_money: 50,
        session_id: "test_session",
        orderInfo: mockOrder
      });

      expect(result.buyRes).toEqual(mockData);
      expect(APP_API_OBJ.sfc.buyTicket).toHaveBeenCalled();
    });

    test("应该处理购买失败", async () => {
      const error = new Error("购买失败");
      APP_API_OBJ.sfc.buyTicket.mockRejectedValue(error);

      const result = await orderManage.buyTicket({
        city_id: "500",
        cinema_id: "13",
        order_num: "202601250121200451038686",
        pay_money: 50,
        session_id: "test_session",
        orderInfo: mockOrder
      });

      expect(result.error).toBeDefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("payOrder", () => {
    test("应该成功获取取票码", async () => {
      const mockData = {
        data: {
          qrcode: "123456|789"
        }
      };
      APP_API_OBJ.sfc.payOrder.mockResolvedValue(mockData);

      const result = await orderManage.payOrder({
        city_id: "500",
        cinema_id: "13",
        order_num: "202601250121200451038686",
        session_id: "test_session",
        logger: mockLogger
      });

      expect(result).toBe("123456|789");
    });

    test("应该从订单列表获取取票码（非V3版本）", async () => {
      const error = new Error("获取失败");
      APP_API_OBJ.sfc.payOrder.mockRejectedValue(error);

      const mockOrderList = {
        data: {
          order_data: [
            {
              order_num: "202601250121200451038686",
              ticket_code: "123456,789"
            }
          ]
        }
      };
      APP_API_OBJ.sfc.getOrderList.mockResolvedValue(mockOrderList);

      const result = await orderManage.payOrder({
        city_id: "500",
        cinema_id: "13",
        order_num: "202601250121200451038686",
        session_id: "test_session",
        logger: mockLogger
      });

      expect(result).toBe("123456|789");
    });
  });

  describe("cancelOrder", () => {
    test("应该成功取消订单", async () => {
      const mockData = { data: { success: "1" } };
      APP_API_OBJ.sfc.cancelOrder.mockResolvedValue(mockData);

      const result = await orderManage.cancelOrder({
        city_id: "500",
        cinema_id: "13",
        order_num: "202601250121200451038686",
        session_id: "test_session"
      });

      expect(result).toEqual(mockData);
      expect(APP_API_OBJ.sfc.cancelOrder).toHaveBeenCalledWith({
        order_num: "202601250121200451038686",
        session_id: "test_session"
      });
    });

    test("应该处理取消订单失败", async () => {
      const error = new Error("取消失败");
      APP_API_OBJ.sfc.cancelOrder.mockRejectedValue(error);

      const result = await orderManage.cancelOrder({
        city_id: "500",
        cinema_id: "13",
        order_num: "202601250121200451038686",
        session_id: "test_session"
      });

      expect(result).toBeUndefined();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("releaseSeat", () => {
    test("应该成功释放座位", async () => {
      const result = await orderManage.releaseSeat(
        {
          city_id: "500",
          cinema_id: "13",
          show_id: "7255871",
          start_day: "2026-01-25",
          start_time: "10:25",
          session_id: "test_session"
        },
        1
      );

      expect(result).toBeDefined();
      expect(mockSeatManage.getSeatLayout).toHaveBeenCalled();
      expect(mockSeatManage.lockSeatHandle).toHaveBeenCalled();
    });
  });
});
