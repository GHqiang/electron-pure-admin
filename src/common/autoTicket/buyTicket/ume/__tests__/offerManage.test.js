/**
 * UME报价管理模块单元测试
 */
import getUmeOfferPrice from "../offerManage.js";
import svApi from "@/api/sv-api";

// Mock 依赖
jest.mock("@/common/index.js", () => ({
  APP_API_OBJ: {
    hsmzyc: {
      getCinemaList: jest.fn(),
      getMoviePlayInfo: jest.fn(),
      getMoviePlaySeat: jest.fn()
    }
  },
  GET_UME_LIST: jest.fn(() => ["hsmzyc"])
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
        quan_value: "35",
        supplier_max_price: 50
      }
    ]
  })),
  roundToHalf: jest.fn(n => n),
  formatErrInfo: jest.fn(err => (err?.message || String(err))),
  getCinemaLoginInfoList: jest.fn(() => [
    {
      app_name: "hsmzyc",
      mobile: "13800138000",
      session_id: "test_session"
    }
  ]),
  calcCount: jest.fn(() => 1),
  getCurrentDay: jest.fn(() => "2026-01-25"),
  isDateInCurrentMonth: jest.fn(() => true),
  calculateMarkup: jest.fn((price, markup) => price + markup),
  getPreviousDay: jest.fn((dateStr) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split("T")[0];
  }),
  findMostRepeatedChars: jest.fn((str1, str2, type) => ({
    similarity: 0.8,
    [type]: str2
  })),
  getMovieInfoFromFilmName: jest.fn(({ movieData, film_name }) => {
    const movie = movieData?.find(m => m.film_name === film_name);
    return movie || null;
  })
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
        couponCode: "QUAN001",
        discountAmount: 3500,
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
      cinemaCode: "32012801",
      cinemaLinkId: "15946"
    }),
    getMoviePlayInfo: jest.fn().mockResolvedValue({
      movieData: [
        {
          film_name: "测试电影",
          filmUniqueId: "film123"
        }
      ]
    })
  }));
});

jest.mock("../seatManage.js", () => {
  return jest.fn().mockImplementation(() => ({
    getSeatLayout: jest.fn().mockResolvedValue({
      seatList: [
        {
          seatId: "seat1",
          rowName: "7",
          columnName: "1",
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
    }))
  }));
});

jest.mock("@/store/platTokens", () => ({
  platTokens: jest.fn(() => ({
    userInfo: {
      rule: {},
      user_id: "1"
    }
  }))
}));

jest.mock("../../../autoOffer/umeOffer.js", () => {
  return jest.fn().mockImplementation(() => ({
    getEndOfferPrice: jest.fn().mockResolvedValue({
      endPrice: 35,
      offerRule: {},
      err_msg: ""
    })
  }));
});

describe("getUmeOfferPrice", () => {
  let offerPrice;

  beforeEach(() => {
    offerPrice = new getUmeOfferPrice({
      appFlag: "hsmzyc",
      plat_name: "mayi"
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getEndMatchOfferRule", () => {
    test("应该成功获取匹配的报价规则", async () => {
      const order = {
        plat_name: "mayi",
        app_name: "hsmzyc",
        city_name: "南京",
        cinema_name: "测试影院",
        cinema_code: "32012801",
        film_name: "测试电影",
        hall_name: "1号厅",
        show_time: "2026-01-25 10:00:00",
        ticket_num: 2,
        supplier_max_price: 50
      };

      const result = await offerPrice.getEndMatchOfferRule(order);

      expect(result).toBeDefined();
    });

    test("应该处理wanxiangh5特殊处理", async () => {
      const { offerRuleMatch } = require("@/utils/utils");
      offerRuleMatch.mockReturnValueOnce({
        matchRuleList: [
          {
            id: "1",
            shadowLineName: "wanxiangh5"
          }
        ]
      });

      const order = {
        plat_name: "mayi",
        app_name: "hsmzyc",
        city_name: "南京",
        cinema_name: "测试影院",
        cinema_code: "32012801",
        film_name: "测试电影",
        hall_name: "1号厅",
        show_time: "2026-01-25 10:00:00",
        ticket_num: 2,
        supplier_max_price: 50
      };

      const result = await offerPrice.getEndMatchOfferRule(order);

      expect(result).toBe("wanxiangh5");
    });
  });

  describe("getEndOfferPrice", () => {
    test("应该成功获取最终报价", async () => {
      const order = {
        plat_name: "mayi",
        app_name: "hsmzyc",
        city_name: "南京",
        cinema_name: "测试影院",
        cinema_code: "32012801",
        film_name: "测试电影",
        hall_name: "1号厅",
        show_time: "2026-01-25 10:00:00",
        ticket_num: 2,
        supplier_max_price: 50,
        order_number: "test001"
      };

      const result = await offerPrice.getEndOfferPrice({
        order,
        offerList: []
      });

      expect(result).toBeDefined();
    });
  });

  describe("getMostSeatPrice", () => {
    test("应该成功计算最多座位价格", () => {
      const seat_data = [
        { areaId: "0", status: 0 },
        { areaId: "0", status: 0 },
        { areaId: "1", status: 0 }
      ];
      const areaList = [
        {
          areaId: "0",
          settlePrice: 3300,
          areaServiceFee: 0
        },
        {
          areaId: "1",
          settlePrice: 3500,
          areaServiceFee: 0
        }
      ];

      const result = offerPrice.getMostSeatPrice(seat_data, areaList);

      expect(result).toBeDefined();
      expect(typeof result).toBe("number");
    });

    test("应该处理空座位数据", () => {
      const seat_data = [];
      const areaList = [
        {
          areaId: "0",
          settlePrice: 3300,
          areaServiceFee: 0
        }
      ];

      const result = offerPrice.getMostSeatPrice(seat_data, areaList);

      expect(result).toBeNull();
    });
  });
});
