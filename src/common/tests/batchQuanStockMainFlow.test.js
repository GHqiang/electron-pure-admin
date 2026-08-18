/**
 * 批量券库存更新 - 主流程集成测试
 *
 * 验证目标：batchUpdateQuanStockWithSync 的完整主流程
 *  1. 批量落库（svApi.batchUpdateQuanType）调用参数正确
 *  2. 规则同步：queryRuleList 查询 → isSameState 短路 / 触发平台同步
 *  3. 规则同步成功：updateRuleRecord 更新本地 + batchAddRuleOperationLog 批量日志
 *  4. 规则同步失败：不更新本地 DB + 回滚 B1 缓存
 *  5. 落库失败：不触发规则同步
 *  6. dbList 字段剥离：业务字段不传后端
 *  7. 无关联规则：回滚 B1 缓存
 */

// Mock 外部依赖
jest.mock("@/utils/utils", () => {
  // 模拟真实 utils.logUpload：上传后 splice 清空 logList，并记录每次上传的日志快照供断言
  const logUpload = jest.fn(async (order, logList) => {
    logUpload._received.push(
      logList.map(item => ({ des: item.des, info: item.info }))
    );
    logList.splice(0, logList.length);
  });
  logUpload._received = [];
  return {
    getCurrentTime: jest.fn(() => "2026-07-30 12:00:00"),
    couponInfoSpecial: jest.fn(s => s),
    getCinemaLoginInfoList: jest.fn(() => []),
    formatErrInfo: jest.fn(e => (e instanceof Error ? e.message : String(e))),
    logUpload
  };
});

jest.mock("@/store/platTokens", () => ({
  platTokens: jest.fn(() => ({
    userInfo: { rule: "testRule", name: "测试员" }
  }))
}));

const mockBatchUpdateQuanType = jest.fn();
const mockQueryRuleList = jest.fn();
const mockUpdateRuleRecord = jest.fn();
const mockBatchAddRuleOperationLog = jest.fn();

jest.mock("@/api/sv-api", () => ({
  __esModule: true,
  default: {
    batchUpdateQuanType: mockBatchUpdateQuanType,
    queryRuleList: mockQueryRuleList,
    updateRuleRecord: mockUpdateRuleRecord,
    batchAddRuleOperationLog: mockBatchAddRuleOperationLog
  }
}));

// lierenOfferRuleSyncPlat mock：默认返回成功
const mockLierenOfferRuleSyncPlat = jest.fn();
jest.mock("@/mixins/useLierenOfferRuleSyncFun", () => {
  const formatSeats = jest.fn(s =>
    s == null ? [] : String(s).split(",").map(Number)
  );
  return {
    __esModule: true,
    default: jest.fn(() => ({
      lierenOfferRuleSyncPlat: mockLierenOfferRuleSyncPlat
    })),
    formatSeats
  };
});

function makeLogger() {
  const logs = [];
  return {
    infoSave: jest.fn((msg, data) => logs.push({ msg, data })),
    logUpload: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    errorSave: jest.fn(),
    logList: [], // 与真实 Logger 对齐（commonQuanStock 结束日志读取该属性）
    _logs: logs
  };
}

// 构造券类型更新项（quanStockList 已序列化）
function makeItem(quan_value, maxStock) {
  const quanStockList =
    maxStock > 0
      ? [{ phone: "13800000001", quan_stock: maxStock, real_quan_stock: maxStock, update_time: "2026-07-30 12:00:00" }]
      : [];
  return {
    id: `qt_${quan_value}`,
    quan_value,
    quanStockList: JSON.stringify(quanStockList),
    update_time: "2026-07-30 12:00:00"
  };
}

// 构造匹配的规则（offerType=1, 含 lieren 同步平台）
function makeMatchedRule(quan_value, seatNum = 4, status = "1") {
  return {
    id: `rule_${quan_value}`,
    ruleName: `规则_${quan_value}`,
    shadowLineName: "test_app",
    quanValue: quan_value,
    offerType: "1",
    status,
    seatNum: String(seatNum),
    platOfferList: JSON.stringify([{ platName: "lieren", isSyncPlat: 1 }]),
    allow_offer_time: "",
    last_used_time: ""
  };
}

// 构造 platOfferList 为非法 JSON 的规则（容错解析应跳过该规则，不影响其他规则）
function makeBadPlatOfferRule(quan_value) {
  return {
    id: `rule_${quan_value}`,
    ruleName: `规则_${quan_value}`,
    shadowLineName: "test_app",
    quanValue: quan_value,
    offerType: "1",
    status: "1",
    seatNum: "4",
    platOfferList: "{invalid_json",
    allow_offer_time: "",
    last_used_time: ""
  };
}

describe("batchUpdateQuanStockWithSync - 主流程集成测试", () => {
  let commonQuanStock;

  beforeEach(() => {
    jest.resetModules();
    commonQuanStock = require("@/common/autoTicket/commonQuanStock");
    mockBatchUpdateQuanType.mockReset();
    mockQueryRuleList.mockReset();
    mockUpdateRuleRecord.mockReset();
    mockBatchAddRuleOperationLog.mockReset();
    mockLierenOfferRuleSyncPlat.mockReset();
    // 默认 mock：落库成功
    mockBatchUpdateQuanType.mockResolvedValue({ data: { affectedRows: 1 } });
    // 默认 mock：平台同步成功
    mockLierenOfferRuleSyncPlat.mockResolvedValue({ platOfferList: [{ platName: "lieren", isSyncPlat: 1 }] });
    // 默认 mock：日志批量写入成功
    mockBatchAddRuleOperationLog.mockResolvedValue({ code: 1 });
  });

  test("dbList 字段剥离：业务字段（quan_value/app_name/logger）不传后端", async () => {
    const logger = makeLogger();
    mockQueryRuleList.mockResolvedValueOnce({ data: { ruleList: [] } });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [
        {
          id: 1,
          quan_value: "Q1",
          quanStockList: '[{"phone":"138"}]',
          update_time: "2026-07-30 12:00:00",
          app_name: "test_app", // 业务字段
          logger, // 业务字段
          quanFlag: "flag1" // 业务字段
        }
      ],
      app_name: "test_app",
      logger
    });

    // 验证 batchUpdateQuanType 入参：仅含 dbList 白名单字段
    const callArgs = mockBatchUpdateQuanType.mock.calls[0][0];
    expect(callArgs.list).toHaveLength(1);
    expect(callArgs.list[0]).toEqual({
      id: 1,
      quanStockList: '[{"phone":"138"}]',
      update_time: "2026-07-30 12:00:00"
    });
    // 不含业务字段
    expect(callArgs.list[0]).not.toHaveProperty("quan_value");
    expect(callArgs.list[0]).not.toHaveProperty("app_name");
    expect(callArgs.list[0]).not.toHaveProperty("logger");
    expect(callArgs.list[0]).not.toHaveProperty("quanFlag");
  });

  test("规则同步成功：触发 lierenOfferRuleSyncPlat + updateRuleRecord + batchAddRuleOperationLog", async () => {
    const logger = makeLogger();
    // 规则状态不一致（status=1, seatNum=2 → targetStatus=1, targetSeatNum=4），触发同步
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q1", 2, "1")] }
    });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)], // maxStock=4 → targetSeatNum=4, targetStatus=1
      app_name: "test_app",
      logger
    });

    // 平台同步被调用
    expect(mockLierenOfferRuleSyncPlat).toHaveBeenCalledTimes(1);
    // 本地 DB 更新被调用
    expect(mockUpdateRuleRecord).toHaveBeenCalledTimes(1);
    // 批量日志被调用（1 条日志）
    expect(mockBatchAddRuleOperationLog).toHaveBeenCalledTimes(1);
    expect(mockBatchAddRuleOperationLog.mock.calls[0][0].logs).toHaveLength(1);

    // 验证日志内容
    const logEntry = mockBatchAddRuleOperationLog.mock.calls[0][0].logs[0];
    expect(logEntry.rule_id).toBe("rule_Q1");
    expect(logEntry.old_seat_num).toBe("2");
    expect(logEntry.new_seat_num).toBe("4");
    expect(logEntry.old_status).toBe("1");
    expect(logEntry.new_status).toBe("1");
    expect(logEntry.success).toBe(1);
    expect(logEntry.trigger_source).toBe("quan_stock_update");
  });

  test("isSameState 短路：规则状态一致时不触发平台同步", async () => {
    const logger = makeLogger();
    // 规则状态一致（seatNum=4, status=1）
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q1", 4, "1")] }
    });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)], // maxStock=4 → targetSeatNum=4, targetStatus=1
      app_name: "test_app",
      logger
    });

    // 不触发平台同步、不更新本地 DB、不写日志
    expect(mockLierenOfferRuleSyncPlat).not.toHaveBeenCalled();
    expect(mockUpdateRuleRecord).not.toHaveBeenCalled();
    expect(mockBatchAddRuleOperationLog).not.toHaveBeenCalled();
  });

  test("券库存归零：规则状态改为禁用（status=2, seatNum=undefined）", async () => {
    const logger = makeLogger();
    // 规则原状态为启用（seatNum=4, status=1）
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q1", 4, "1")] }
    });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 0)], // maxStock=0 → targetStatus=2, targetSeatNum=undefined
      app_name: "test_app",
      logger
    });

    // 触发平台同步（status 从 1 → 2）
    expect(mockLierenOfferRuleSyncPlat).toHaveBeenCalledTimes(1);
    expect(mockUpdateRuleRecord).toHaveBeenCalledTimes(1);

    // 验证传给 lierenOfferRuleSyncPlat 的规则状态
    const syncCallArgs = mockLierenOfferRuleSyncPlat.mock.calls[0][0];
    expect(syncCallArgs.status).toBe("2");
    expect(syncCallArgs.seatNum).toBeUndefined();

    // 验证日志
    const logEntry = mockBatchAddRuleOperationLog.mock.calls[0][0].logs[0];
    expect(logEntry.new_status).toBe("2");
    expect(logEntry.new_seat_num).toBeNull();
    expect(logEntry.trigger_source).toBe("quan_stock_zero");
    expect(logEntry.change_reason).toContain("券库存归零");
  });

  test("平台同步失败：不更新本地 DB + 回滚 B1 缓存", async () => {
    const logger = makeLogger();
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q1", 2, "1")] }
    });
    // 平台同步返回 null（失败）
    mockLierenOfferRuleSyncPlat.mockResolvedValueOnce(null);

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });

    // 平台同步被调用但失败
    expect(mockLierenOfferRuleSyncPlat).toHaveBeenCalledTimes(1);
    // 不更新本地 DB
    expect(mockUpdateRuleRecord).not.toHaveBeenCalled();
    // 不写日志
    expect(mockBatchAddRuleOperationLog).not.toHaveBeenCalled();

    // B1 缓存被回滚：再次调用应重新触发 queryRuleList
    mockQueryRuleList.mockResolvedValueOnce({ data: { ruleList: [] } });
    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });
    // queryRuleList 被调用 2 次（第一次 + 回滚后重新查询）
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);
  });

  test("落库失败：不触发规则同步", async () => {
    const logger = makeLogger();
    mockBatchUpdateQuanType.mockRejectedValueOnce(new Error("数据库连接失败"));

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });

    // 落库失败
    expect(mockBatchUpdateQuanType).toHaveBeenCalledTimes(1);
    // 不触发规则同步
    expect(mockQueryRuleList).not.toHaveBeenCalled();
    expect(mockLierenOfferRuleSyncPlat).not.toHaveBeenCalled();
    expect(mockUpdateRuleRecord).not.toHaveBeenCalled();

    // 异常被 catch，日志记录
    const failLog = logger._logs.find(
      l => l.msg === "批量更新券库存异常"
    );
    expect(failLog).toBeDefined();
  });

  test("无关联规则：回滚 B1 缓存", async () => {
    const logger = makeLogger();
    // queryRuleList 返回空（无关联规则）
    mockQueryRuleList.mockResolvedValueOnce({ data: { ruleList: [] } });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });

    // 无关联规则日志
    const noRuleLog = logger._logs.find(
      l => l.msg === "批量规则同步：无关联猎人同步规则"
    );
    expect(noRuleLog).toBeDefined();

    // B1 缓存被回滚：再次调用应重新触发 queryRuleList
    mockQueryRuleList.mockResolvedValueOnce({ data: { ruleList: [] } });
    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);
  });

  test("多条批量同步：规则按 rule.id 去重", async () => {
    const logger = makeLogger();
    // 2 个券类型对应同一规则（同 rule.id）
    const sameRule = {
      ...makeMatchedRule("Q1", 2, "1"),
      id: "rule_shared",
      quanValue: "Q1"
    };
    const sameRule2 = {
      ...makeMatchedRule("Q2", 2, "1"),
      id: "rule_shared", // 同一 rule.id
      quanValue: "Q2"
    };
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [sameRule, sameRule2] }
    });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4), makeItem("Q2", 4)],
      app_name: "test_app",
      logger
    });

    // 平台同步只调用 1 次（同 rule.id 去重）
    expect(mockLierenOfferRuleSyncPlat).toHaveBeenCalledTimes(1);
    expect(mockUpdateRuleRecord).toHaveBeenCalledTimes(1);
    // 日志只 1 条
    expect(mockBatchAddRuleOperationLog.mock.calls[0][0].logs).toHaveLength(1);
  });

  test("多券类型不同规则：各自独立同步", async () => {
    const logger = makeLogger();
    mockQueryRuleList.mockResolvedValueOnce({
      data: {
        ruleList: [
          makeMatchedRule("Q1", 2, "1"), // seatNum 不一致，触发同步
          makeMatchedRule("Q2", 2, "1")  // seatNum 不一致，触发同步
        ]
      }
    });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4), makeItem("Q2", 4)],
      app_name: "test_app",
      logger
    });

    // 两条规则各自独立同步
    expect(mockLierenOfferRuleSyncPlat).toHaveBeenCalledTimes(2);
    expect(mockUpdateRuleRecord).toHaveBeenCalledTimes(2);
    expect(mockBatchAddRuleOperationLog.mock.calls[0][0].logs).toHaveLength(2);
  });

  test("空 list：直接返回，不触发任何调用", async () => {
    const logger = makeLogger();

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [],
      app_name: "test_app",
      logger
    });

    expect(mockBatchUpdateQuanType).not.toHaveBeenCalled();
    expect(mockQueryRuleList).not.toHaveBeenCalled();
  });

  test("日志批量写入失败：不影响主流程（缓存状态不变）", async () => {
    const logger = makeLogger();
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q1", 2, "1")] }
    });
    mockBatchAddRuleOperationLog.mockRejectedValueOnce(new Error("日志服务不可用"));

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });

    // 主流程仍完成
    expect(mockLierenOfferRuleSyncPlat).toHaveBeenCalledTimes(1);
    expect(mockUpdateRuleRecord).toHaveBeenCalledTimes(1);

    // 日志失败被记录但不抛出
    const logFailLog = logger._logs.find(
      l => l.msg === "批量写入规则操作日志失败"
    );
    expect(logFailLog).toBeDefined();

    // B1 缓存未被回滚（日志失败不应影响缓存）：再次调用应命中跳过
    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });
    // queryRuleList 共 2 次：第1次为同步流程查询关联规则，第2次为规则更新后刷新本地规则 store
    // （第二次 batchUpdate 命中 B1 缓存跳过，不再新增调用）
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);
  });

  test("queryRuleList 返回 data 为空：不误报查询异常，正常走无关联规则分支", async () => {
    const logger = makeLogger();
    // res.data 为 undefined（接口异常返回），空值保护应直接视为无规则
    mockQueryRuleList.mockResolvedValueOnce({ data: undefined });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });

    // 空值保护生效：不记录"查询影院报价规则异常"
    expect(
      logger._logs.find(l => l.msg === "查询影院报价规则异常")
    ).toBeUndefined();
    // 正常走"无关联规则"分支并回滚 B1 缓存
    expect(
      logger._logs.find(l => l.msg === "批量规则同步：无关联猎人同步规则")
    ).toBeDefined();

    // B1 缓存被回滚：再次调用应重新触发 queryRuleList
    mockQueryRuleList.mockResolvedValueOnce({ data: { ruleList: [] } });
    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);
  });

  test("规则 platOfferList 解析失败：跳过该规则，不影响其他规则同步", async () => {
    const logger = makeLogger();
    // Q1 关联规则数据损坏（非法 JSON），Q2 关联规则正常
    mockQueryRuleList.mockResolvedValueOnce({
      data: {
        ruleList: [makeBadPlatOfferRule("Q1"), makeMatchedRule("Q2", 2, "1")]
      }
    });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4), makeItem("Q2", 4)],
      app_name: "test_app",
      logger
    });

    // 损坏规则被跳过并记录日志，不抛异常中断整批
    const skipLog = logger._logs.find(
      l => l.msg === "规则 platOfferList 解析失败，跳过该规则"
    );
    expect(skipLog).toBeDefined();
    expect(skipLog.data.ruleId).toBe("rule_Q1");
    // 正常规则仍被同步
    expect(mockLierenOfferRuleSyncPlat).toHaveBeenCalledTimes(1);
    expect(mockUpdateRuleRecord).toHaveBeenCalledTimes(1);
  });

  test("券库存序列化解析失败：跳过该券类型规则同步，不误禁规则", async () => {
    const logger = makeLogger();
    // 仅 Q2 有正常关联规则；Q1 的 quanStockList 为非法 JSON
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q2", 2, "1")] }
    });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [
        {
          id: 1,
          quan_value: "Q1",
          quanStockList: "{invalid_json",
          update_time: "2026-07-30 12:00:00"
        },
        makeItem("Q2", 4)
      ],
      app_name: "test_app",
      logger
    });

    // Q1 解析失败被跳过并记录日志（不能静默当作空库存禁用规则）
    const skipLog = logger._logs.find(
      l => l.msg === "券库存序列化解析失败，跳过该券类型的规则同步"
    );
    expect(skipLog).toBeDefined();
    expect(skipLog.data.quan_value).toBe("Q1");
    // Q2 正常同步
    expect(mockLierenOfferRuleSyncPlat).toHaveBeenCalledTimes(1);
    expect(mockUpdateRuleRecord).toHaveBeenCalledTimes(1);

    // 再次调用：Q2 命中 B1 缓存跳过（Q1 的失败不影响 Q2 缓存），整体跳过不查规则
    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [
        {
          id: 1,
          quan_value: "Q1",
          quanStockList: "{invalid_json",
          update_time: "2026-07-30 12:00:00"
        },
        makeItem("Q2", 4)
      ],
      app_name: "test_app",
      logger
    });
    // queryRuleList 共 2 次：第1次为同步流程查询关联规则，第2次为规则更新后刷新本地规则 store
    // （第二次 batchUpdate Q2 命中缓存整体跳过，不再新增调用）
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);
  });

  test("空手机号条目（phone:''）不参与最大券库存计算", async () => {
    const logger = makeLogger();
    // 空 phone 条目 quan_stock=99，正常条目 quan_stock=2 → maxQuanStock 应为 2（忽略脏条目）
    const quanStockList = JSON.stringify([
      {
        phone: "",
        quan_stock: 99,
        real_quan_stock: 99,
        update_time: "2026-07-30 12:00:00"
      },
      {
        phone: "13800000001",
        quan_stock: 2,
        real_quan_stock: 2,
        update_time: "2026-07-30 12:00:00"
      }
    ]);
    // 规则 seatNum=4 与目标 2 不一致 → 触发平台同步
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q1", 4, "1")] }
    });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [
        {
          id: 1,
          quan_value: "Q1",
          quanStockList,
          update_time: "2026-07-30 12:00:00"
        }
      ],
      app_name: "test_app",
      logger
    });

    // 同步与本地更新使用的座位数均为 2（空 phone 条目的 99 被忽略）
    expect(mockLierenOfferRuleSyncPlat).toHaveBeenCalledTimes(1);
    expect(mockLierenOfferRuleSyncPlat.mock.calls[0][0].seatNum).toBe(2);
    expect(mockUpdateRuleRecord.mock.calls[0][0].seatNum).toBe(2);
  });

  test("syncUpdateQuanStock：写回库存时剔除空手机号条目（自动清理脏数据）", async () => {
    const utilsMock = require("@/utils/utils");
    mockQueryRuleList.mockResolvedValueOnce({ data: { ruleList: [] } });

    await commonQuanStock.syncUpdateQuanStock({
      order: {
        app_name: "test_app",
        plat_name: "test",
        order_number: "TEST001"
      },
      quanTypeList: [
        {
          id: 1,
          quan_flag: "flag1",
          quan_value: "Q1",
          black_quans: "",
          quan_stock: 2,
          // 含空手机号脏条目 + 正常条目
          quanStockList: [
            {
              phone: "",
              quan_stock: 99,
              real_quan_stock: 99,
              update_time: ""
            },
            {
              phone: "13800000001",
              quan_stock: 2,
              real_quan_stock: 2,
              update_time: "2026-07-30 12:00:00"
            }
          ],
          quanStockListByPhone: [
            {
              phone: "13800000001",
              quan_stock: 2,
              real_quan_stock: 2,
              update_time: ""
            }
          ]
        }
      ],
      getQuanListByPhone: jest.fn()
    });

    // 落库的 quanStockList 不含空 phone 条目（脏数据随本次写回自动清理）
    const callArgs = mockBatchUpdateQuanType.mock.calls[0][0];
    const writtenStock = JSON.parse(callArgs.list[0].quanStockList);
    expect(writtenStock).toHaveLength(1);
    expect(writtenStock[0].phone).toBe("13800000001");

    // 内部独立 logger：日志一次上传（仅 1 次 utils.logUpload 调用，sync finally 时已清空）
    expect(utilsMock.logUpload).toHaveBeenCalledTimes(1);
  });

  test("手机号券库存明细日志：内部 logger 一次上传，含券类型、数量与券号", async () => {
    const utilsMock = require("@/utils/utils");
    mockQueryRuleList.mockResolvedValueOnce({ data: { ruleList: [] } });
    // 模拟一个可用登录账号
    utilsMock.getCinemaLoginInfoList.mockReturnValueOnce([
      { app_name: "test_app", mobile: "13800000001", session_id: "s1" }
    ]);

    await commonQuanStock.syncUpdateQuanStock({
      order: {
        app_name: "test_app",
        plat_name: "test",
        order_number: "TEST002"
      },
      quanTypeList: [
        {
          id: 1,
          quan_flag: "flag1",
          quan_value: "Q1",
          black_quans: "",
          quan_stock: 2,
          quanStockList: [
            {
              phone: "13800000001",
              quan_stock: 0,
              real_quan_stock: 0,
              update_time: ""
            }
          ],
          quanStockListByPhone: [
            {
              phone: "13800000001",
              quan_stock: 0,
              real_quan_stock: 0,
              update_time: ""
            }
          ]
        }
      ],
      getQuanListByPhone: jest.fn().mockResolvedValue([
        {
          coupon_info: "flag1",
          coupon_num: "CODE123",
          endDateTime: "2026-08-10 12:00:00"
        },
        {
          coupon_info: "flag1",
          coupon_num: "CODE456",
          endDateTime: "2026-08-11 12:00:00"
        },
        {
          coupon_info: "other",
          coupon_num: "CODE789",
          endDateTime: "2026-08-12 12:00:00"
        }
      ])
    });

    // 内部独立 logger：券库存全流程日志一次上传（仅 1 次 utils.logUpload 调用）
    expect(utilsMock.logUpload).toHaveBeenCalledTimes(1);
    const uploadedLogs = utilsMock.logUpload._received[0];

    // 逐号分类日志：消息为极简样式，data 仅含 quan_value 与券号列表
    const typeLog = uploadedLogs.find(
      item => item.des === "13800000001—flag1—2"
    );
    expect(typeLog).toBeDefined();
    expect(typeLog.info.quan_value).toBe("Q1");
    expect(typeLog.info).not.toHaveProperty("mobile");
    expect(typeLog.info).not.toHaveProperty("matchedCount");
    expect(typeLog.info.matchedQuanList.map(q => q.couponNum)).toEqual([
      "CODE123",
      "CODE456"
    ]);

    // 汇总日志：每个券类型 → 最大库存 + 有货手机号（phone→quan_stock 映射，0 库存号不展示）
    const sumLog = uploadedLogs.find(
      item => item.des === "最终要更新的券类型列表汇总"
    );
    expect(sumLog).toBeDefined();
    expect(sumLog.info.updateTypeList[0]).toEqual({
      id: 1,
      quan_value: "Q1",
      quan_flag: "flag1",
      maxQuanStock: 2,
      stockByPhone: { "13800000001": 2 }
    });

    // 批量更新日志也在同一次上传中
    expect(
      uploadedLogs.find(item => item.des === "批量更新券库存开始")
    ).toBeDefined();
  });
});
