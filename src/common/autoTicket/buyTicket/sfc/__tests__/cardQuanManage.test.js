/**
 * SFC卡券管理模块单元测试
 */
import SfcCardQuanManage from "../cardQuanManage.js";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";

// Mock 依赖
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    sfc: {
      getQuanList: jest.fn(),
      bandQuan: jest.fn(),
      getCardList: jest.fn()
    }
  }
}));

jest.mock("@/api/sv-api", () => ({
  __esModule: true,
  default: {
    queryQuanTypeInfo: jest.fn(),
    queryQuanTypeList: jest.fn(),
    updateQuanType: jest.fn(),
    updateCardDayUse: jest.fn()
  }
}));

jest.mock("@/utils/utils", () => ({
  formatErrInfo: jest.fn(err => (err?.message || String(err))),
  getCurrentTime: jest.fn(() => "2026-01-25 10:00:00"),
  getCurrentDay: jest.fn(() => "2026-01-25"),
  isDateInCurrentMonth: jest.fn(() => true),
  getCinemaLoginInfoList: jest.fn(() => [
    {
      app_name: "sfc",
      mobile: "13800138000",
      session_id: "test_session"
    }
  ]),
  couponInfoSpecial: jest.fn(str => str),
  mockDelay: jest.fn(() => Promise.resolve()),
  getOfferRuleById: jest.fn(() => ({
    autoUseQuanStatus: "1",
    autoUseQuanPrice: 30,
    auto_quan_value: "35"
  }))
}));

jest.mock("@/mixins/usesMachineBaseFun", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    getQuanValueListByQuanFlag: jest.fn(() => [])
  }))
}));

jest.mock("@/store/platTokens", () => ({
  platTokens: jest.fn(() => ({
    userInfo: {
      rule: {},
      user_id: "1",
      phone: "13800138000"
    }
  }))
}));

describe("SfcCardQuanManage", () => {
  let cardQuanManage;
  let mockLogger;
  let mockOrder;
  let mockOrderManage;

  beforeEach(() => {
    mockLogger = {
      infoSave: jest.fn(),
      errorSave: jest.fn(),
      warn: jest.fn()
    };

    mockOrder = {
      app_name: "sfc",
      plat_name: "lieren",
      order_number: "test001"
    };

    mockOrderManage = {
      priceCalculation: jest.fn().mockResolvedValue({
        price: { total_price: 50 }
      })
    };

    cardQuanManage = new SfcCardQuanManage(
      mockOrder,
      mockLogger,
      mockOrderManage
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getQuanInfo", () => {
    test("应该成功获取券类型信息", async () => {
      const mockData = {
        data: {
          quanInfo: {
            quan_value: "35",
            quan_flag: "35元券",
            quan_cost: 30,
            quan_fee: 0
          }
        }
      };
      svApi.queryQuanTypeInfo.mockResolvedValue(mockData);

      const result = await cardQuanManage.getQuanInfo("35", "sfc");

      expect(result).toEqual(mockData.data.quanInfo);
      expect(svApi.queryQuanTypeInfo).toHaveBeenCalledWith({
        quan_value: "35",
        app_name: "sfc"
      });
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      svApi.queryQuanTypeInfo.mockRejectedValue(error);

      const result = await cardQuanManage.getQuanInfo("35", "sfc");

      expect(result).toBeNull();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("continuousGetQuan", () => {
    test("应该成功连续获取券", async () => {
      const mockData = {
        data: {
          unused: {
            lists: [
              {
                coupon_num: "QUAN001",
                coupon_info: "35元券",
                card_num: "",
                validate_date_end: "2026.06.30"
              }
            ],
            total_page: 1
          }
        }
      };

      APP_API_OBJ.sfc.getQuanList.mockResolvedValue(mockData);

      const result = await cardQuanManage.continuousGetQuan({
        city_id: "500",
        cinema_id: "13",
        session_id: "test_session",
        appFlag: "sfc",
        targetNum: Infinity,
        logger: mockLogger
      });

      expect(result.list).toBeDefined();
      expect(APP_API_OBJ.sfc.getQuanList).toHaveBeenCalled();
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.sfc.getQuanList.mockRejectedValue(error);

      const result = await cardQuanManage.continuousGetQuan({
        city_id: "500",
        cinema_id: "13",
        session_id: "test_session",
        appFlag: "sfc",
        logger: mockLogger
      });

      expect(result.list).toEqual([]);
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("getQuanListByPhone", () => {
    test("应该成功获取优惠券列表", async () => {
      jest.spyOn(cardQuanManage, "continuousGetQuan").mockResolvedValue({
        list: [
          {
            coupon_num: "QUAN001",
            coupon_info: "35元券",
            validate_date_end: "2026.06.30"
          }
        ]
      });

      const result = await cardQuanManage.getQuanListByPhone({
        city_id: "500",
        cinema_id: "13",
        session_id: "test_session",
        logger: mockLogger
      });

      expect(result).toBeDefined();
      expect(result[0]).toHaveProperty("endDateTime");
    });
  });
});
