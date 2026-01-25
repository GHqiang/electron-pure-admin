/**
 * SFC报价管理模块单元测试
 */
import getSfcOfferPrice from "../offerManage.js";
import svApi from "@/api/sv-api";

// Mock 依赖
jest.mock("@/common/index.js", () => ({
  APP_API_OBJ: {
    sfc: {
      getCityList: jest.fn(),
      getCinemaList: jest.fn(),
      getMoviePlayInfo: jest.fn()
    }
  }
}));

jest.mock("@/api/sv-api", () => ({
  __esModule: true,
  default: {
    queryOfferInfo: jest.fn(),
    queryQuanTypeList: jest.fn()
  }
}));

jest.mock("@/utils/utils", () => ({
  offerRuleMatch: jest.fn(() => ({
    matchRuleList: [
      {
        id: "1",
        offerType: "1",
        offerAmount: 35,
        quanValue: "35",
        supplier_max_price: 50
      }
    ]
  })),
  roundToHalf: jest.fn(n => n),
  formatErrInfo: jest.fn(err => (err?.message || String(err))),
  getCinemaLoginInfoList: jest.fn(() => [
    {
      app_name: "sfc",
      mobile: "13800138000",
      session_id: "test_session"
    }
  ]),
  calcCount: jest.fn(() => 1),
  getCurrentDay: jest.fn(() => "2026-01-25"),
  isDateInCurrentMonth: jest.fn(() => true),
  calculateMarkup: jest.fn((price, markup) => price + markup)
}));

jest.mock("@/common/autoOffer/commonQuanStock.js", () => ({
  getQuanTypeListByApp: jest.fn()
}));

jest.mock("../cardQuanManage.js", () => {
  return jest.fn().mockImplementation(() => ({
    getQuanInfo: jest.fn().mockResolvedValue({
      quan_value: "35",
      quan_flag: "35元券",
      quan_cost: 30,
      quan_fee: 0
    }),
    getQuanListByPhone: jest.fn().mockResolvedValue([
      {
        coupon_num: "QUAN001",
        coupon_info: "35元券",
        endDateTime: "2026-06-30"
      }
    ])
  }));
});

jest.mock("../cinemaManage.js", () => {
  return jest.fn().mockImplementation(() => ({
    getMovieInfo: jest.fn().mockResolvedValue({
      film_name: "测试电影",
      media: "2D",
      cinema_id: "13",
      city_id: "500"
    }),
    getMoviePlayInfo: jest.fn().mockResolvedValue({
      movieData: [
        {
          film_name: "测试电影",
          shows: {
            "2026-01-25": [
              {
                show_id: "7255871",
                start_time: "10:25",
                hall_name: "6号厅"
              }
            ]
          }
        }
      ]
    })
  }));
});

jest.mock("../seatManage.js", () => {
  return jest.fn().mockImplementation(() => ({
    getSeatLayout: jest.fn().mockResolvedValue({
      seatData: [["seat1", 1, "0", 2, 50, "5排5号"]],
      area_price: [{ area_id: "1", price: 50 }]
    })
  }));
});

jest.mock("@/common/logger.js", () => {
  return jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    infoSave: jest.fn(),
    errorSave: jest.fn(),
    warn: jest.fn(),
    logList: [],
    getLastErrMsg: jest.fn(() => ""),
    getLastErrMsgAndInfo: jest.fn(() => ({
      err_msg: "",
      err_info: ""
    })),
    logUpload: jest.fn()
  }));
});

jest.mock("@/store/platTokens", () => ({
  platTokens: jest.fn(() => ({
    userInfo: {
      rule: {},
      user_id: "1",
      phone: "13800138000"
    }
  }))
}));

describe("getSfcOfferPrice", () => {
  let offerPrice;
  let mockOrder;

  beforeEach(() => {
    offerPrice = new getSfcOfferPrice({
      appFlag: "sfc",
      plat_name: "lieren"
    });

    mockOrder = {
      id: 1,
      order_number: "test001",
      plat_name: "lieren",
      app_name: "sfc",
      city_name: "上海",
      cinema_name: "SFC上影影城",
      cinema_code: "13",
      film_name: "测试电影",
      hall_name: "6号厅",
      show_time: "2026-01-25 10:25:00",
      lockseat: "5排5座",
      ticket_num: 1,
      supplier_max_price: 50
    };

    offerPrice.initModules(mockOrder);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getEndMatchOfferRule", () => {
    test("应该成功匹配报价规则", async () => {
      const result = await offerPrice.getEndMatchOfferRule(mockOrder);

      expect(result).toBeDefined();
      expect(offerPrice.logger.infoSave).toHaveBeenCalled();
    });

    test("应该处理无匹配规则的情况", async () => {
      const { offerRuleMatch } = require("@/utils/utils");
      offerRuleMatch.mockReturnValueOnce({
        matchRuleList: []
      });

      const result = await offerPrice.getEndMatchOfferRule(mockOrder);

      expect(result).toBeNull();
      expect(offerPrice.logger.errorSave).toHaveBeenCalled();
    });
  });

  describe("getCostPrice", () => {
    test("应该成功计算成本价（用券）", async () => {
      const offerRule = {
        offer_type: "1",
        quan_value: "35"
      };

      const result = await offerPrice.getCostPrice(offerRule);

      expect(result).toBeDefined();
      expect(typeof result).toBe("number");
    });

    test("应该成功计算成本价（用卡）", async () => {
      const offerRule = {
        offer_type: "2",
        member_price: "34.2",
        real_member_price: 38
      };

      const result = await offerPrice.getCostPrice(offerRule);

      expect(result).toBeDefined();
    });
  });

  describe("getEndOfferPrice", () => {
    test("应该成功返回最终报价", async () => {
      const result = await offerPrice.getEndOfferPrice({
        order: mockOrder,
        offerList: []
      });

      expect(result).toBeDefined();
      expect(result).toHaveProperty("err_msg");
      expect(result).toHaveProperty("err_info");
    });

    test("应该处理报价失败的情况", async () => {
      const { offerRuleMatch } = require("@/utils/utils");
      offerRuleMatch.mockReturnValueOnce({
        matchRuleList: []
      });

      const result = await offerPrice.getEndOfferPrice({
        order: mockOrder,
        offerList: []
      });

      expect(result.err_msg).toBeDefined();
    });
  });

  describe("validateOfferOrder", () => {
    test("应该成功验证报价订单", async () => {
      const result = await offerPrice.validateOfferOrder(mockOrder);

      expect(result).toBeDefined();
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errMsg");
      expect(result).toHaveProperty("steps");
    });

    test("应该处理必填字段缺失", async () => {
      const invalidOrder = {
        plat_name: "lieren"
      };

      const result = await offerPrice.validateOfferOrder(invalidOrder);

      expect(result.valid).toBe(false);
      expect(result.errMsg).toBeDefined();
    });
  });
});
