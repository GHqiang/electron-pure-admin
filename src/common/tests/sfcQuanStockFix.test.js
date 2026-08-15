/**
 * SFC 出票券库存修复回归测试
 *
 * 事故背景（2026-08-15）：SFC 出票后券库存被错误覆盖
 *  - _getQuanListForPay 会员赠券按 card_num 分组后 slice(0, ticket_num) 返回，
 *    导致 quanStock = 本次出票张数（如 2），出票前 updateQuanStock 把真实库存
 *    （quan_stock=19 / real_quan_stock=51）覆盖成 2，并触发规则座位数 4→2 误同步猎人平台
 *  - 本次出票即使失败（券未消耗），库存同样被扣
 *
 * 修复验证目标：
 *  1. 会员赠券分组后返回完整目标卡组（quanStock = 完整组长度，而非出票张数）
 *  2. updateQuanStock 独立写入 real_quan_stock（全部券数），不再等于 quan_stock
 *  3. 出票取券逻辑不受影响：仍取前 ticket_num 张（member_coupon_id 一致）
 */

// Mock 外部依赖
jest.mock("@/utils/utils", () => ({
  formatErrInfo: jest.fn(e => (e instanceof Error ? e.message : String(e))),
  getCurrentTime: jest.fn(() => "2026-08-15 17:30:13"),
  couponInfoSpecial: jest.fn(s => s),
  mockDelay: jest.fn(),
  getOfferRuleById: jest.fn(() => null),
  mulDecimal: jest.fn((a, b) => Number(a) * Number(b))
}));

jest.mock("@/store/platTokens", () => ({
  platTokens: jest.fn(() => ({
    userInfo: { rule: "testRule", name: "测试员" }
  }))
}));

jest.mock("@/common/constant", () => ({
  sfcV3AppList: [],
  TEST_NEW_PLAT_LIST: []
}));

const mockGetQuanList = jest.fn();
jest.mock("@/common/index", () => ({
  APP_API_OBJ: {
    baoliyingcheng: { getQuanList: mockGetQuanList }
  }
}));

const mockQueryQuanTypeList = jest.fn();
const mockBatchUpdateQuanStockWithSync = jest.fn();
jest.mock("@/api/sv-api", () => ({
  __esModule: true,
  default: {
    queryQuanTypeList: mockQueryQuanTypeList,
    queryQuanTypeInfo: jest.fn(),
    queryRuleList: jest.fn(),
    updateRuleRecord: jest.fn(),
    batchAddRuleOperationLog: jest.fn()
  }
}));

jest.mock("@/common/autoTicket/commonQuanStock.js", () => ({
  batchUpdateQuanStockWithSync: mockBatchUpdateQuanStockWithSync
}));

jest.mock("@/common/autoTicket/buyTicket/common/cardQuanHelper", () => ({
  getQuanInfoCommon: jest.fn(),
  getUsableCardListCommon: jest.fn(() => []),
  getQuanTypeListByAppCommon: jest.fn(() => []),
  getSortPhoneByQuanTypeListCommon: jest.fn(() => [])
}));

jest.mock("@/common/autoTicket/buyTicket/common/cardBalanceSync", () => ({
  syncCardBalanceToSv: jest.fn(() => Promise.resolve())
}));

jest.mock("@/common/autoTicket/buyTicket/common/offerHelper", () => ({
  getPlatFeeRate: jest.fn(() => 0.01)
}));

jest.mock("@/mixins/usesMachineBaseFun", () => {
  const getQuanValueListByQuanFlag = jest.fn();
  return {
    __esModule: true,
    default: jest.fn(() => ({ getQuanValueListByQuanFlag }))
  };
});

// 延迟到 jest.mock 注册完成后引用被测模块
const { default: SfcCardQuanManage } = require("../autoTicket/buyTicket/sfc/cardQuanManage");
const {
  getQuanInfoCommon
} = require("../autoTicket/buyTicket/common/cardQuanHelper");

function makeLogger() {
  const logs = [];
  return {
    infoSave: jest.fn((msg, data) => logs.push({ msg, data })),
    logUpload: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    errorSave: jest.fn(),
    logList: [],
    _logs: logs
  };
}

// 构造券列表：4302 卡 3 张（08.22 到期）+ 4301 卡 2 张（08.29 到期）
function makeCouponList() {
  const base = {
    coupon_name: "JT_会员卡 19.9元观影优惠券",
    coupon_info: "JT_会员卡 19.9元观影优惠券"
  };
  return [
    { ...base, id: "106059", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.22" },
    { ...base, id: "106058", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.22" },
    { ...base, id: "106057", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.22" },
    { ...base, id: "114904", card_num: "811322017004301", coupon_num: "尾号为4301的卡内赠券", validate_date_end: "2026.08.29" },
    { ...base, id: "114903", card_num: "811322017004301", coupon_num: "尾号为4301的卡内赠券", validate_date_end: "2026.08.29" }
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetQuanList.mockResolvedValue({
    data: { unused: { lists: makeCouponList(), total_page: 1 } }
  });
  getQuanInfoCommon.mockResolvedValue({
    id: 928,
    quan_cost: "30.00",
    quan_flag: "JT_会员卡 19.9元观影优惠券",
    quan_fee: "0",
    is_store: "2",
    black_quans: "",
    quanStockList: JSON.stringify([
      { phone: "13073792313", quan_stock: 19, real_quan_stock: 51, update_time: "2026-08-15 17:19:23" }
    ])
  });
  // getTargetQuanByApp：返回 928 券类型（DB 旧库存 19/51）
  mockQueryQuanTypeList.mockResolvedValue({
    data: {
      quanTypeList: [
        {
          id: 928,
          quan_flag: "JT_会员卡 19.9元观影优惠券",
          app_name: "baoliyingcheng",
          quan_value: "baolibjbeiyuan",
          quanStockList: JSON.stringify([
            { phone: "13073792313", quan_stock: 19, real_quan_stock: 51, update_time: "2026-08-15 17:19:23" }
          ])
        }
      ]
    }
  });
});

const baseOrder = {
  app_name: "baoliyingcheng",
  plat_name: "sheng",
  order_number: "TEST001",
  ticket_num: 2
};

function makeUseQuanParams() {
  return {
    appFlag: "baoliyingcheng",
    offerRule: {
      offer_type: "1",
      quan_value: "baolibjbeiyuan",
      quan_flag: "JT_会员卡 19.9元观影优惠券",
      member_price: 36,
      real_member_price: 36,
      offer_rule_id: "1738"
    },
    currentParamsList: [{ session_id: "s1", mobile: "13073792313" }],
    currentParamsInx: 0,
    order: baseOrder,
    logger: makeLogger(),
    curPhone: "13073792313",
    usableCardList: [],
    city_id: "499",
    cinema_id: "92",
    show_id: "868930",
    seat_ids: "57588,57589",
    ticket_num: 2,
    supplier_end_price: 35.5,
    rewards: 0,
    plat_name: "sheng",
    order_number: "TEST001"
  };
}

describe("SFC 出票券库存修复回归", () => {
  test("会员赠券分组后返回完整目标卡组，而非 slice 成出票张数", async () => {
    const manage = new SfcCardQuanManage(baseOrder, makeLogger());
    const res = await manage._getQuanListForPay({
      city_id: "499",
      cinema_id: "92",
      session_id: "s1",
      quan_value: "baolibjbeiyuan",
      quan_flag: "JT_会员卡 19.9元观影优惠券",
      black_quans: "",
      ticket_num: 2,
      logger: makeLogger()
    });
    // 4302 卡组 3 张完整返回（修复前 slice(0,2) 只返回 2 张）
    expect(res.quanList).toHaveLength(3);
    expect(res.quanList[0].card_num).toBe("811322017004302");
    expect(res.quanType).toBe("offline_member_quan");
    // 真实全部券数：4302(3) + 4301(2) = 5
    expect(res.realStockNum).toBe(5);
  });

  test("useQuanOrCard 出票后库存写完整组长度与全部券数，不再覆盖成出票张数", async () => {
    const manage = new SfcCardQuanManage(baseOrder, makeLogger());
    const params = makeUseQuanParams();
    const result = await manage.useQuanOrCard(params);

    // 1. 返回的 quanStock 为完整卡组长度 3（修复前为 2）
    expect(result.quanStock).toBe(3);
    // 2. 出票仍取前 2 张（用券逻辑不受影响）
    expect(result.member_coupon_id).toBe("106059,106058");
    expect(result.quanType).toBe("offline_member_quan");

    // 3. updateQuanStock → 批量落库入参：quan_stock=3, real_quan_stock=5（修复前均为 2）
    expect(mockBatchUpdateQuanStockWithSync).toHaveBeenCalledTimes(1);
    const { list } = mockBatchUpdateQuanStockWithSync.mock.calls[0][0];
    expect(list).toHaveLength(1);
    const writtenStockList = JSON.parse(list[0].quanStockList);
    expect(writtenStockList).toEqual([
      expect.objectContaining({
        phone: "13073792313",
        quan_stock: 3,
        real_quan_stock: 5
      })
    ]);
  });

  test("非会员赠券（普通券）路径库存不受分组逻辑影响", async () => {
    // 普通券：无 card_num
    mockGetQuanList.mockResolvedValue({
      data: {
        unused: {
          lists: [
            { id: "2001", coupon_info: "JT_会员卡 19.9元观影优惠券", coupon_num: "券A", validate_date_end: "2026.08.29" },
            { id: "2002", coupon_info: "JT_会员卡 19.9元观影优惠券", coupon_num: "券B", validate_date_end: "2026.08.29" },
            { id: "2003", coupon_info: "JT_会员卡 19.9元观影优惠券", coupon_num: "券C", validate_date_end: "2026.08.29" }
          ],
          total_page: 1
        }
      }
    });
    const manage = new SfcCardQuanManage(baseOrder, makeLogger());
    const res = await manage._getQuanListForPay({
      city_id: "499",
      cinema_id: "92",
      session_id: "s1",
      quan_value: "baolibjbeiyuan",
      quan_flag: "JT_会员卡 19.9元观影优惠券",
      black_quans: "",
      ticket_num: 2,
      logger: makeLogger()
    });
    expect(res.quanList).toHaveLength(3);
    expect(res.quanType).toBe("offline_quan");
    expect(res.realStockNum).toBe(3);
    expect(res.quanStockNum).toBe(3);
  });

  test("快过期的小卡组排在前面时，库存按最大卡组统计而非第一个满足组", async () => {    // 4301 卡 2 张先到期（08.22，排前）→ 出票用该组；
    // 4302 卡 5 张后到期（08.29，排后）→ 最大卡组
    const base = {
      coupon_name: "JT_会员卡 19.9元观影优惠券",
      coupon_info: "JT_会员卡 19.9元观影优惠券"
    };
    mockGetQuanList.mockResolvedValue({
      data: {
        unused: {
          lists: [
            { ...base, id: "114904", card_num: "811322017004301", coupon_num: "尾号为4301的卡内赠券", validate_date_end: "2026.08.22" },
            { ...base, id: "114903", card_num: "811322017004301", coupon_num: "尾号为4301的卡内赠券", validate_date_end: "2026.08.22" },
            { ...base, id: "114902", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" },
            { ...base, id: "114901", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" },
            { ...base, id: "114900", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" },
            { ...base, id: "114899", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" },
            { ...base, id: "114898", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" }
          ],
          total_page: 1
        }
      }
    });
    const manage = new SfcCardQuanManage(baseOrder, makeLogger());
    const params = makeUseQuanParams();
    const result = await manage.useQuanOrCard(params);

    // 1. 出票仍用第一个满足组（快过期的 4301 卡券）
    expect(result.member_coupon_id).toBe("114904,114903");
    // 2. 库存按最大卡组统计：4302 卡 5 张（而非第一个满足组 2 张）
    expect(result.quanStock).toBe(5);
    const { list } = mockBatchUpdateQuanStockWithSync.mock.calls[0][0];
    const writtenStockList = JSON.parse(list[0].quanStockList);
    expect(writtenStockList).toEqual([
      expect.objectContaining({
        phone: "13073792313",
        quan_stock: 5,
        real_quan_stock: 7
      })
    ]);
  });

  test("多页券列表时全量获取，最大卡组统计不因分页截断而低估", async () => {
    const base = {
      coupon_name: "JT_会员卡 19.9元观影优惠券",
      coupon_info: "JT_会员卡 19.9元观影优惠券"
    };
    const page1 = [
      { ...base, id: "114904", card_num: "811322017004301", coupon_num: "尾号为4301的卡内赠券", validate_date_end: "2026.08.22" },
      { ...base, id: "114903", card_num: "811322017004301", coupon_num: "尾号为4301的卡内赠券", validate_date_end: "2026.08.22" },
      { ...base, id: "114902", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" }
    ];
    const page2 = [
      { ...base, id: "114901", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" },
      { ...base, id: "114900", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" },
      { ...base, id: "114899", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" },
      { ...base, id: "114898", card_num: "811322017004302", coupon_num: "尾号为4302的卡内赠券", validate_date_end: "2026.08.29" }
    ];
    mockGetQuanList.mockImplementation(({ page }) => ({
      data: { unused: { lists: page === 1 ? page1 : page2, total_page: 2 } }
    }));
    const manage = new SfcCardQuanManage(baseOrder, makeLogger());
    const res = await manage._getQuanListForPay({
      city_id: "499",
      cinema_id: "92",
      session_id: "s1",
      quan_value: "baolibjbeiyuan",
      quan_flag: "JT_会员卡 19.9元观影优惠券",
      black_quans: "",
      ticket_num: 2,
      logger: makeLogger()
    });
    // 分页全部聚合：4301 卡 2 张 + 4302 卡 5 张 = 7 张
    expect(res.realStockNum).toBe(7);
    // 最大卡组 = 4302 卡 5 张（若按修复前 targetNum=12 截断会漏统计，此处全量拿到）
    expect(res.quanStockNum).toBe(5);
    // 出票仍用第一个满足组（快过期的 4301 卡 2 张）
    expect(res.quanList).toHaveLength(2);
    expect(res.quanList[0].card_num).toBe("811322017004301");
  });
});
