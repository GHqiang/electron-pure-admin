/**
 * 测试出票队列 lierenRuleCheck 的本地规则匹配与刷新重试逻辑
 *
 * 背景：猎人平台主动报价中标（订单带平台规则id rule_id），出票前需在本地匹配到
 * 对应规则补写报价记录。若本地 store 过期（登录后 SV 侧新增/修改了规则），
 * 匹配会失败导致"补写报价记录失败 → 出票失败"（线上事故日志：
 * "机器未找到匹配的报价规则" + "获取该订单报价记录失败，微信通知手动出票"）。
 * 修复：匹配失败时先按 app_name 轻量查询重试匹配，再异步刷新全量规则 store（不阻塞出票）。
 */
// 注意：被测模块必须放在所有 jest.mock 与 mock 常量声明之后导入，
// 否则 jest.mock 工厂执行时 mock 常量尚未初始化（TDZ 报错）
jest.mock("@/utils/utils", () => ({
  getCurrentTime: jest.fn(() => "2026-08-18 03:50:45"),
  formatErrInfo: jest.fn(e => (e instanceof Error ? e.message : String(e))),
  logUpload: jest.fn(),
  sendWxPusherMessage: jest.fn(() => Promise.resolve())
}));

jest.mock("../logger", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    init: jest.fn(),
    infoSave: jest.fn(),
    info: jest.fn(),
    warnSave: jest.fn(),
    warn: jest.fn(),
    errorSave: jest.fn(),
    getLastErrMsgAndInfo: jest.fn(() => ({})),
    logUpload: jest.fn()
  }))
}));

jest.mock("@/common/autoTicket/buyTicket/index", () => ({
  __esModule: true,
  default: { createSeatStrategy: jest.fn() }
}));

const mockQueryOfferInfo = jest.fn();
const mockQueryRuleList = jest.fn();
const mockAddOfferRecord = jest.fn();

jest.mock("@/api/sv-api", () => ({
  __esModule: true,
  default: {
    queryOfferInfo: mockQueryOfferInfo,
    queryRuleList: mockQueryRuleList,
    addOfferRecord: mockAddOfferRecord
  }
}));

jest.mock("@/store/platTokens", () => ({
  platTokens: jest.fn(() => ({
    userInfo: { user_id: 10, rule: "testUser" }
  }))
}));

jest.mock("@/common/constant", () => ({
  GET_APP_TYPE_LIST: jest.fn(() => [
    { app_type_code: "01", app_name_list: ["suzhousuyi"] }
  ]),
  LIERENR_REWARDS: { 0: 0, 1: 1, 2: 2, 3: 3 }
}));

jest.mock("@/common/autoTicket/buyTicket/common/offerHelper", () => ({
  getPlatFeeRate: jest.fn(() => 0)
}));

jest.mock("@/store/dictTable", () => ({
  dictTable: jest.fn(() => ({
    dictInfo: { lierenOfferTicketIsSplitUser: 1 }
  }))
}));

// 规则 store 状态容器：模拟"登录后 SV 侧新增/修改规则，本地 store 仍为旧数据"
const mockStoreState = { items: [] };
jest.mock("@/store/offerRule", () => ({
  useDataTableStore: jest.fn(() => ({
    get items() {
      return mockStoreState.items;
    },
    set items(v) {
      mockStoreState.items = v;
    },
    setRuleList(list) {
      mockStoreState.items = list;
    }
  }))
}));

jest.mock("pinia", () => ({
  storeToRefs: jest.fn(store => ({
    offerRuleList: {
      get value() {
        return store.items;
      },
      set value(v) {
        store.items = v;
      }
    }
  }))
}));

// 注意：本仓库 babel 会把顶层 import 提升到 const 声明之前执行，
// 被测模块与 mock 模块必须用 require() 延迟加载（见 beforeEach），
// 否则 jest.mock 工厂执行时 mock 常量尚未初始化（TDZ 报错）

// 构造与 SV queryRuleList 返回一致的规则（platOfferList 为 JSON 字符串，刷新时会 JSON.parse）
function makeRule(id, platRuleId, overrides = {}) {
  return {
    id,
    ruleName: `规则${id}`,
    shadowLineName: "suzhousuyi",
    status: "1",
    offerType: "1",
    orderForm: "lieren",
    includeCityNames: "[]",
    excludeCityNames: "[]",
    includeCinemaNames: "[]",
    excludeCinemaNames: "[]",
    includeHallNames: "[]",
    excludeHallNames: "[]",
    includeFilmNames: "[]",
    excludeFilmNames: "[]",
    weekDay: "[]",
    film_type: "2D",
    platOfferList: JSON.stringify([
      { platName: "lieren", value: "118", platRuleId }
    ]),
    ...overrides
  };
}

// 规则 store 中持有的是已解析的 platOfferList（登录/刷新时 JSON.parse 过）
function toStoreRule(rule) {
  return { ...rule, platOfferList: JSON.parse(rule.platOfferList) };
}

// 构造与线上事故一致的中标订单（rule_id=2729464 为平台侧新规则）
function makeOrder() {
  return {
    plat_name: "lieren",
    app_name: "suzhousuyi",
    rule_id: 2729464,
    id: 24750322,
    order_number: "2026081803491170652",
    tpp_price: "125.00",
    supplier_end_price: 75.5,
    order_urgent: 0,
    city_name: "苏州",
    cinema_addr: "苏州文化艺术中心",
    ticket_num: 1,
    cinema_name: "苏艺影城",
    hall_name: "8号厅",
    film_name: "奥德赛",
    show_time: "2026-08-18 09:25:00",
    cinema_code: "32021201",
    cinema_group: "优势杂牌"
  };
}

describe("BaseTicketQueue.lierenRuleCheck 规则匹配与刷新重试", () => {
  let queue;
  let svApi;
  let sendWxPusherMessage;

  beforeEach(() => {
    jest.clearAllMocks();
    // 延迟加载被测模块与 mock 模块（避免顶层 import 被 babel 提升导致的 TDZ）
    const BaseTicketQueue = require("../core/BaseTicketQueue").default;
    svApi = require("@/api/sv-api");
    sendWxPusherMessage = require("@/utils/utils").sendWxPusherMessage;
    mockStoreState.items = [toStoreRule(makeRule(1816, 2439903))]; // 旧规则，未含平台规则id 2729464
    mockQueryOfferInfo.mockResolvedValue({ data: { offerInfo: null } });
    mockAddOfferRecord.mockResolvedValue({ code: 1 });
    queue = new BaseTicketQueue("suzhousuyi");
  });

  test("本地 store 已含平台规则id：直接匹配补写报价记录，不触发刷新", async () => {
    mockStoreState.items = [
      toStoreRule(makeRule(1816, 2439903)),
      toStoreRule(makeRule(2999, 2729464))
    ];

    await queue.lierenRuleCheck(makeOrder());

    expect(mockQueryRuleList).not.toHaveBeenCalled();
    expect(mockAddOfferRecord).toHaveBeenCalledTimes(1);
    const record = mockAddOfferRecord.mock.calls[0][0];
    expect(record.offer_rule_id).toBe(2999);
    expect(record.plat_rule_id).toBe(2729464);
    expect(record.order_status).toBe(1);
    expect(record.offer_from).toBe(1);
    expect(sendWxPusherMessage).not.toHaveBeenCalled();
  });

  test("本地 store 过期未含平台规则id：按影线查询重试匹配补写报价记录，并异步刷新全量store", async () => {
    // SV 侧已新增含 2729464 的规则（另一台机器/规则页新增），本地 store 还是旧数据
    mockQueryRuleList.mockResolvedValue({
      data: {
        ruleList: [makeRule(1816, 2439903), makeRule(2999, 2729464)]
      }
    });

    await queue.lierenRuleCheck(makeOrder());

    // 第1次：按影线轻量查询重试匹配（同步等待）；第2次：异步刷新全量 store
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);
    expect(mockQueryRuleList).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        shadowLineName: "suzhousuyi",
        rule: "testUser"
      })
    );
    expect(mockQueryRuleList).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rule: "testUser" })
    );
    expect(mockAddOfferRecord).toHaveBeenCalledTimes(1);
    const record = mockAddOfferRecord.mock.calls[0][0];
    expect(record.offer_rule_id).toBe(2999);
    expect(record.plat_rule_id).toBe(2729464);
    expect(sendWxPusherMessage).not.toHaveBeenCalled();
  });

  test("按影线查询后仍无匹配规则：推送微信告警且不补写报价记录", async () => {
    mockQueryRuleList.mockResolvedValue({
      data: { ruleList: [makeRule(1816, 2439903)] }
    });

    await queue.lierenRuleCheck(makeOrder());

    // 按影线查询 + 异步全量刷新各一次
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);
    expect(mockAddOfferRecord).not.toHaveBeenCalled();
    expect(sendWxPusherMessage).toHaveBeenCalledTimes(1);
  });

  test("已有机器报价记录：跳过规则匹配与刷新", async () => {
    mockQueryOfferInfo.mockResolvedValue({
      data: { offerInfo: { id: 1, rule_status: "1" } }
    });

    await queue.lierenRuleCheck(makeOrder());

    expect(mockQueryRuleList).not.toHaveBeenCalled();
    expect(mockAddOfferRecord).not.toHaveBeenCalled();
    expect(sendWxPusherMessage).not.toHaveBeenCalled();
  });
});
