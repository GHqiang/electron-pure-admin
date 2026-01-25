/**
 * UME卡券管理模块单元测试
 */
import UmeCardQuanManage from "../cardQuanManage.js";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";

// Mock 依赖
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    hsmzyc: {
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
    updateCardDayUse: jest.fn(),
    queryUsedQuanList: jest.fn()
  }
}));

jest.mock("@/utils/utils", () => ({
  formatErrInfo: jest.fn(err => (err?.message || String(err))),
  getCurrentTime: jest.fn(() => "2026-01-25 10:00:00"),
  formatTimeOfTime: jest.fn(time => time),
  getCurrentDay: jest.fn(() => "2026-01-25"),
  isDateInCurrentMonth: jest.fn(() => true),
  getCinemaLoginInfoList: jest.fn(() => [
    {
      app_name: "hsmzyc",
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

describe("UmeCardQuanManage", () => {
  let cardQuanManage;
  let mockLogger;
  let mockOrder;

  beforeEach(() => {
    mockLogger = {
      infoSave: jest.fn(),
      errorSave: jest.fn(),
      warn: jest.fn()
    };

    mockOrder = {
      app_name: "hsmzyc",
      plat_name: "mayi",
      order_number: "test001"
    };

    cardQuanManage = new UmeCardQuanManage(mockOrder, mockLogger);
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
            quan_name: "测试券"
          }
        }
      };
      svApi.queryQuanTypeInfo.mockResolvedValue(mockData);

      const result = await cardQuanManage.getQuanInfo("35", "hsmzyc");

      expect(result).toEqual(mockData.data.quanInfo);
      expect(svApi.queryQuanTypeInfo).toHaveBeenCalledWith({
        quan_value: "35",
        app_name: "hsmzyc"
      });
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      svApi.queryQuanTypeInfo.mockRejectedValue(error);

      const result = await cardQuanManage.getQuanInfo("35", "hsmzyc");

      expect(result).toBeNull();
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("getQuanListByPhone", () => {
    test("应该成功获取优惠券列表", async () => {
      const mockData = {
        data: {
          quanList: [
            {
              couponCode: "quan123",
              discountAmount: 1000,
              status: 1
            }
          ]
        }
      };
      APP_API_OBJ.hsmzyc.getQuanList.mockResolvedValue(mockData);

      const result = await cardQuanManage.getQuanListByPhone({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        session_id: "test_session",
        mobile: "13800138000"
      });

      expect(result).toBeDefined();
      expect(APP_API_OBJ.hsmzyc.getQuanList).toHaveBeenCalled();
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.hsmzyc.getQuanList.mockRejectedValue(error);

      const result = await cardQuanManage.getQuanListByPhone({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        session_id: "test_session",
        mobile: "13800138000"
      });

      expect(result).toEqual([]);
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });

  describe("getUsableCardList", () => {
    test("应该成功获取可用会员卡列表", async () => {
      const mockData = {
        data: {
          cardList: [
            {
              cardNo: "card123",
              cardAmount: 10000,
              discountAmount: 500
            }
          ]
        }
      };
      APP_API_OBJ.hsmzyc.getCardList.mockResolvedValue(mockData);

      const result = await cardQuanManage.getUsableCardList({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        session_id: "test_session",
        mobile: "13800138000"
      });

      expect(result).toBeDefined();
      expect(APP_API_OBJ.hsmzyc.getCardList).toHaveBeenCalled();
    });

    test("应该处理API错误", async () => {
      const error = new Error("网络错误");
      APP_API_OBJ.hsmzyc.getCardList.mockRejectedValue(error);

      const result = await cardQuanManage.getUsableCardList({
        cinemaCode: "32012801",
        cinemaLinkId: "15946",
        session_id: "test_session",
        mobile: "13800138000"
      });

      expect(result).toEqual([]);
      expect(mockLogger.errorSave).toHaveBeenCalled();
    });
  });
});
