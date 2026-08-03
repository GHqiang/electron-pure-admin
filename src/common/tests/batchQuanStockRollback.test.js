/**
 * 批量券库存更新 - B1 缓存回滚范围验证测试
 *
 * 验证目标：batchCheckLierenFixedRule 的 catch 块只回滚 needSyncItems（真正进入同步流程的项），
 * 不误删 B1 命中跳过的项的缓存。
 *
 * 验证方法：通过观察 svApi.queryRuleList 的调用次数间接判断 B1 缓存是否命中。
 *  - 缓存命中跳过 → queryRuleList 不被调用
 *  - 缓存未命中 → queryRuleList 被调用
 *
 * 触发外层 catch 的方式：让 lierenOfferRuleSyncPlat 抛异常（平台同步接口异常），
 * 该异常传播到 batchCheckLierenFixedRule 的外层 catch 块。
 */

// Mock 外部依赖（在 import 被测模块前完成 mock）
jest.mock("@/utils/utils", () => ({
  getCurrentTime: jest.fn(() => "2026-07-30 12:00:00"),
  couponInfoSpecial: jest.fn(s => s),
  getCinemaLoginInfoList: jest.fn(() => []),
  formatErrInfo: jest.fn(e => (e instanceof Error ? e.message : String(e))),
  logUpload: jest.fn()
}));

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

// lierenOfferRuleSyncPlat mock：默认成功，可用 mockRejectedValueOnce 触发外层 catch
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

// 构造 logger mock（收集日志便于断言）
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
      ? [
        {
          phone: "13800000001",
          quan_stock: maxStock,
          real_quan_stock: maxStock,
          update_time: "2026-07-30 12:00:00"
        }
      ]
      : [];
  return {
    id: `qt_${quan_value}`,
    quan_value,
    quanStockList: JSON.stringify(quanStockList),
    update_time: "2026-07-30 12:00:00"
  };
}

// 构造匹配的规则（isSameState=true，让正常流程不触发平台同步，保留 B1 缓存）
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

describe("batchUpdateQuanStockWithSync - B1 缓存回滚范围验证", () => {
  let commonQuanStock;

  beforeEach(() => {
    // 重置模块以清空 _lastMaxStockMap（模块级私有状态）
    jest.resetModules();
    commonQuanStock = require("@/common/autoTicket/commonQuanStock");
    mockBatchUpdateQuanType.mockReset();
    mockQueryRuleList.mockReset();
    mockUpdateRuleRecord.mockReset();
    mockBatchAddRuleOperationLog.mockReset();
    mockLierenOfferRuleSyncPlat.mockReset();
    mockBatchUpdateQuanType.mockResolvedValue({ data: { affectedRows: 1 } });
    mockBatchAddRuleOperationLog.mockResolvedValue({ code: 1 });
    // 默认平台同步成功
    mockLierenOfferRuleSyncPlat.mockResolvedValue({ platOfferList: [] });
  });

  test("修复核心：B1 命中跳过的项在异常路径下不被误删缓存", async () => {
    const logger = makeLogger();

    // ===== Step 1：首次调用 Q1(maxStock=4)，正常完成，写入 B1 缓存 =====
    // queryRuleList 返回匹配规则，isSameState 短路（seatNum=4, status=1 一致），不触发平台同步
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q1", 4, "1")] }
    });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });

    expect(mockQueryRuleList).toHaveBeenCalledTimes(1); // Step1 调用 1 次
    expect(mockUpdateRuleRecord).not.toHaveBeenCalled(); // isSameState 短路

    // ===== Step 2：[Q1(命中), Q2(未命中)]，Q2 平台同步抛异常触发外层 catch =====
    // Q2 规则 seatNum=2 与目标 4 不一致 → 进入同步流程 → lierenOfferRuleSyncPlat 抛异常
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q2", 2, "1")] }
    });
    mockLierenOfferRuleSyncPlat.mockRejectedValueOnce(
      new Error("平台同步异常")
    );

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4), makeItem("Q2", 5)],
      app_name: "test_app",
      logger
    });

    // 累计调用 2 次（Step1 的 1 次 + Step2 的 1 次，Q1 命中跳过未新增调用）
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);

    // 异常路径：catch 块被触发，needSyncItemsSafe 仅含 Q2（Q1 命中跳过未进入 needSyncItems）
    const catchLog = logger._logs.find(
      l => l.msg === "批量根据券库存检查猎人固定报价规则更新座位数异常"
    );
    expect(catchLog).toBeDefined();
    expect(catchLog.data.needSyncItemsSafe).toEqual([
      { id: "qt_Q2", quan_value: "Q2" }
    ]);

    // ===== Step 3：再次调用 Q1(maxStock=4)，验证 B1 缓存是否保留 =====
    mockQueryRuleList.mockResolvedValueOnce({ data: { ruleList: [] } });

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q1", 4)],
      app_name: "test_app",
      logger
    });

    // 核心断言：
    //   修复后：Q1 缓存未被 Step2 的 catch 误删 → 命中缓存跳过 → queryRuleList 调用次数仍为 2
    //   修复前：Q1 缓存被 Step2 的 catch 误删 → cache miss → queryRuleList 调用次数变为 3
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);
  });

  test("对照：全部未命中时异常回滚所有 needSyncItems", async () => {
    const logger = makeLogger();

    // Q3/Q4 规则 seatNum 与目标不一致，均进入同步流程；第一条同步抛异常触发外层 catch
    mockQueryRuleList.mockResolvedValueOnce({
      data: {
        ruleList: [makeMatchedRule("Q3", 2, "1"), makeMatchedRule("Q4", 2, "1")]
      }
    });
    mockLierenOfferRuleSyncPlat.mockRejectedValueOnce(
      new Error("平台同步异常")
    );

    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q3", 3), makeItem("Q4", 2)],
      app_name: "test_app",
      logger
    });

    // catch 块回滚 needSyncItems（含 Q3 和 Q4）
    const catchLog = logger._logs.find(
      l => l.msg === "批量根据券库存检查猎人固定报价规则更新座位数异常"
    );
    expect(catchLog).toBeDefined();
    expect(catchLog.data.needSyncItemsSafe).toEqual([
      { id: "qt_Q3", quan_value: "Q3" },
      { id: "qt_Q4", quan_value: "Q4" }
    ]);

    // 再次调用 Q3，应未命中缓存（被 catch 回滚了）
    mockQueryRuleList.mockResolvedValueOnce({ data: { ruleList: [] } });
    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q3", 3)],
      app_name: "test_app",
      logger
    });
    // 累计 2 次（第一次 + Q3 回滚后重新查询）
    expect(mockQueryRuleList).toHaveBeenCalledTimes(2);
  });

  test("全部 B1 命中跳过时不触发任何 DB 查询与平台同步", async () => {
    const logger = makeLogger();

    // Step 1：首次写入 B1 缓存
    mockQueryRuleList.mockResolvedValueOnce({
      data: { ruleList: [makeMatchedRule("Q5", 4, "1")] }
    });
    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q5", 4)],
      app_name: "test_app",
      logger
    });
    expect(mockQueryRuleList).toHaveBeenCalledTimes(1);

    // Step 2：再次调用相同 maxStock，应全部命中跳过
    await commonQuanStock.batchUpdateQuanStockWithSync({
      list: [makeItem("Q5", 4)],
      app_name: "test_app",
      logger
    });

    // queryRuleList 调用次数仍为 1（第二次命中跳过，未新增调用）
    expect(mockQueryRuleList).toHaveBeenCalledTimes(1);
    const skipLog = logger._logs.find(
      l => l.msg === "批量规则同步：所有券类型 maxQuanStock 未变化，整体跳过"
    );
    expect(skipLog).toBeDefined();
  });
});
