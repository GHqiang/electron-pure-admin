/**
 * SFC出票主流程模块单元测试
 */
import SfcBuyTicket from "../buyTicket.js";
import { APP_API_OBJ } from "@/common/index";
import svApi from "@/api/sv-api";

// Mock 依赖
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    sfc: {
      getCityList: jest.fn(),
      getCinemaList: jest.fn(),
      getMoviePlayInfo: jest.fn(),
      getMoviePlaySeat: jest.fn(),
      lockSeat: jest.fn(),
      priceCalculation: jest.fn(),
      createOrder: jest.fn(),
      buyTicket: jest.fn(),
      payOrder: jest.fn()
    }
  }
}));

jest.mock("@/api/sv-api", () => ({
  __esModule: true,
  default: {
    queryOfferInfo: jest.fn(),
    updateCardDayUse: jest.fn()
  }
}));

jest.mock("@/utils/utils", () => ({
  formatErrInfo: jest.fn(err => (err?.message || String(err))),
  getCinemaLoginInfoList: jest.fn(() => [
    {
      app_name: "sfc",
      mobile: "13800138000",
      session_id: "test_session",
      member_pwd: "123456",
      first: "1"
    }
  ]),
  sendWxPusherMessage: jest.fn(),
  getTargetCinemaCommon: jest.fn(({ cinemaList, cinema_name }) => {
    return cinemaList?.find(c => c.name?.includes(cinema_name)) || null;
  }),
  findMostRepeatedChars: jest.fn(str => str),
  getMovieInfoFromFilmName: jest.fn(({ movieData, film_name }) => {
    const movie = movieData?.find(m => m.film_name === film_name);
    return movie || null;
  }),
  isNextDay: jest.fn(() => false),
  getPreviousDay: jest.fn((dateStr) => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split("T")[0];
  }),
  subDecimal: jest.fn((a, b) => a - b),
  trial: jest.fn((fn, times, interval) => fn(1))
}));

jest.mock("@/common/constant", () => ({
  sfcV3AppList: []
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

jest.mock("@/utils/sfc-member-password", () => ({
  encode: jest.fn(pwd => `encoded_${pwd}`)
}));

jest.mock("../cinemaManage.js", () => {
  return jest.fn().mockImplementation(() => ({
    getCityList: jest.fn().mockResolvedValue([
      { id: "500", name: "上海" }
    ]),
    getCityCinemaList: jest.fn().mockResolvedValue({
      cinemaList: [
        { id: "13", name: "SFC上影影城", cinemaId: "13" }
      ]
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
    }),
    getMovieInfo: jest.fn().mockResolvedValue({
      film_name: "测试电影",
      media: "2D",
      cinema_id: "13",
      city_id: "500"
    })
  }));
});

jest.mock("../seatManage.js", () => {
  return jest.fn().mockImplementation(() => ({
    getSeatLayout: jest.fn().mockResolvedValue({
      seatData: [
        ["seat1", 1, "0", 2, 50, "5排5号"],
        ["seat2", 1, "0", 2, 50, "5排6号"]
      ],
      area_price: [{ area_id: "1", price: 50 }]
    }),
    lockSeatHandle: jest.fn().mockResolvedValue({
      data: { success: "1" }
    })
  }));
});

jest.mock("../orderManage.js", () => {
  return jest.fn().mockImplementation(() => ({
    priceCalculation: jest.fn().mockResolvedValue({
      price: { total_price: 50 }
    }),
    createOrder: jest.fn().mockResolvedValue("202601250121200451038686"),
    buyTicket: jest.fn().mockResolvedValue({
      buyRes: { success: "1" }
    }),
    lastHandle: jest.fn().mockResolvedValue({
      submitRes: { success: true },
      qrcode: "123456|789"
    }),
    cancelOrder: jest.fn().mockResolvedValue({ success: "1" }),
    releaseSeat: jest.fn().mockResolvedValue({ success: "1" }),
    transferOrder: jest.fn().mockResolvedValue({})
  }));
});

jest.mock("../cardQuanManage.js", () => {
  return jest.fn().mockImplementation(() => ({
    getUsableCardList: jest.fn().mockResolvedValue([
      {
        id: "card1",
        balance: 100,
        default_card: "1",
        mobile: "13800138000"
      }
    ]),
    useQuanOrCard: jest.fn().mockResolvedValue({
      card_id: "card1",
      profit: 10,
      priceInfo: { total_price: 50 }
    }),
    updateQuanStock: jest.fn()
  }));
});

jest.mock("@/common/autoTicket/buyTicket/platManage.js", () => {
  return jest.fn().mockImplementation(() => ({
    submitTicketCode: jest.fn().mockResolvedValue({ success: true }),
    orderTransferByPlat: jest.fn().mockResolvedValue({})
  }));
});

jest.mock("@/common/logger", () => {
  return jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    infoSave: jest.fn(),
    errorSave: jest.fn(),
    warn: jest.fn(),
    warnSave: jest.fn(),
    logList: [],
    getLastErrMsg: jest.fn(() => ""),
    getLastErrMsgAndInfo: jest.fn(() => ({
      err_msg: "",
      err_info: ""
    }))
  }));
});

describe("SfcBuyTicket", () => {
  let buyTicket;
  let mockLogger;
  let mockOrder;

  beforeEach(() => {
    mockLogger = {
      init: jest.fn(),
      infoSave: jest.fn(),
      errorSave: jest.fn(),
      warn: jest.fn(),
      logList: []
    };

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
      supplier_end_price: 50
    };

    buyTicket = new SfcBuyTicket(mockOrder, mockLogger, false);
    buyTicket.initModules();
    buyTicket.currentParamsList = [
      {
        mobile: "13800138000",
        member_pwd: "123456",
        session_id: "test_session",
        first: "1"
      }
    ];
    buyTicket.currentParamsInx = 0;
    buyTicket.currentPhone = "13800138000";
    buyTicket.usableCardList = [
      {
        id: "card1",
        balance: 100,
        default_card: "1",
        mobile: "13800138000"
      }
    ];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getCinemaLoginInfo", () => {
    test("应该成功获取影院登录信息", async () => {
      await buyTicket.getCinemaLoginInfo();

      expect(buyTicket.currentParamsList).toBeDefined();
      expect(buyTicket.currentParamsList.length).toBeGreaterThan(0);
    });
  });

  describe("getOrderOfferRule", () => {
    test("应该成功获取订单报价规则", async () => {
      const mockOfferInfo = {
        data: {
          offerInfo: {
            id: "1",
            offerType: "1",
            offerAmount: 35,
            quanValue: "35"
          }
        }
      };
      svApi.queryOfferInfo.mockResolvedValue(mockOfferInfo);
      buyTicket.offerRule = null; // 确保初始状态

      await buyTicket.getOrderOfferRule();

      // getOrderOfferRule 不返回值，而是设置 this.offerRule
      expect(buyTicket.offerRule).toBeDefined();
      expect(buyTicket.offerRule).toEqual(mockOfferInfo.data.offerInfo);
      expect(svApi.queryOfferInfo).toHaveBeenCalled();
    });
  });

  describe("validateTicketOrder", () => {
    test("应该成功验证出票订单", async () => {
      const orderJson = {
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
        supplier_end_price: 50
      };

      const result = await buyTicket.validateTicketOrder(orderJson);

      expect(result).toBeDefined();
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errMsg");
      expect(result).toHaveProperty("steps");
    });

    test("应该处理必填字段缺失", async () => {
      const invalidOrder = {
        plat_name: "lieren"
      };

      const result = await buyTicket.validateTicketOrder(invalidOrder);

      expect(result.valid).toBe(false);
      expect(result.errMsg).toBeDefined();
    });
  });
});
