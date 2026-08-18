/**
 * 测试猎人同步函数的日志埋点是否正确
 * 通过 mock 外部 API，验证各场景下 addRuleOperationLog 的调用参数
 */
import useLierenOfferRuleSyncFun from "@/mixins/useLierenOfferRuleSyncFun";

// Mock 外部依赖
jest.mock("@/utils/utils", () => ({
  getCurrentTime: jest.fn(() => "2026-07-06 12:00:00"),
  sendWxPusherMessage: jest.fn(),
  getLongestPart: jest.fn(s => s),
  formatErrInfo: jest.fn(e => (e instanceof Error ? e.message : String(e)))
}));

jest.mock("@/api/sv-api", () => ({
  __esModule: true,
  default: {
    addRuleOperationLog: jest.fn(() => Promise.resolve({ code: 1 })),
    batchAddRuleOperationLog: jest.fn(() => Promise.resolve({ code: 1 })),
    updateRuleRecord: jest.fn(() => Promise.resolve({ code: 1 }))
  }
}));

jest.mock("@/api/lieren-api", () => ({
  __esModule: true,
  default: {
    ruleAdd: jest.fn(),
    ruleDel: jest.fn(),
    ruleState: jest.fn(),
    ruleList: jest.fn()
  }
}));

jest.mock("@/store/platTokens", () => ({
  platTokens: jest.fn(() => ({
    userInfo: { rule: "testUser", name: "测试员" }
  }))
}));

jest.mock("@/store/dictTable", () => ({
  dictTable: jest.fn(() => ({
    dictInfo: {
      lierenMainAccountAkSk: JSON.stringify({ testUser: ["ak123", "sk456"] }),
      fixedOfferToPlatList: "lieren"
    }
  }))
}));

jest.mock("@/store/specialNameRule", () => ({
  useCinemaCodeMatchList: jest.fn(() => ({
    getCinemaCodeFlag: jest.fn(() => ({ plat_cinema_code: "CD001" }))
  }))
}));

jest.mock("@/store/cinemaList", () => ({
  useCinemaList: jest.fn(() => ({
    getLierenCinemaGroup: jest.fn(() => "万达")
  }))
}));

jest.mock("element-plus", () => ({
  ElMessage: { error: jest.fn(), success: jest.fn() }
}));

import svApi from "@/api/sv-api";
import lierenApi from "@/api/lieren-api";
import { platTokens } from "@/store/platTokens";

const {
  lierenOfferRuleSyncPlat,
  lierenOfferRuleDelPlat,
  lierenOfferRuleEditStatusPlat,
  checkAndUpdateLierenRuleState
} = useLierenOfferRuleSyncFun();

// 构造一个标准的测试规则
function makeRuleInfo(overrides = {}) {
  return {
    id: 1001,
    ruleName: "测试规则",
    shadowLineName: "sfc",
    status: "1",
    seatNum: "4",
    offerType: "1",
    offerAmount: "35",
    includeCityNames: JSON.stringify(["北京", "上海"]),
    excludeCityNames: JSON.stringify([]),
    includeCinemaCodes: "1_100",
    excludeCinemaCodes: "",
    includeFilmNames: JSON.stringify([]),
    excludeFilmNames: JSON.stringify([]),
    includeHallNames: JSON.stringify([]),
    excludeHallNames: JSON.stringify([]),
    platOfferList: [
      { platName: "lieren", value: "35", isSyncPlat: "1", platRuleId: 999 }
    ],
    film_type: "2D",
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ========================== D: sync_add_update ==========================
describe("D — lierenOfferRuleSyncPlat (sync_add_update)", () => {
  const ruleInfo = makeRuleInfo();

  test("成功时记录 sync_add_update 日志，含 old/new status+seat", async () => {
    // Mock lierenApi 返回
    lierenApi.ruleAdd.mockResolvedValue({ data: { rule_id: 999 } });
    // Mock 查询旧状态返回
    lierenApi.ruleList.mockResolvedValue({
      data: [{ rule_id: 999, state: 1, seats: "1,2,3" }]
    });

    await lierenOfferRuleSyncPlat(ruleInfo);

    // 验证日志调用
    const args = svApi.addRuleOperationLog.mock.calls[0][0];
    expect(args.operation_type).toBe("sync_add_update");
    expect(args.rule_id).toBe(1001);
    expect(args.old_status).toBe(1); // 平台旧状态
    expect(args.old_seat_num).toBe("1,2,3");
    expect(args.new_status).toBe("1");
    expect(args.new_seat_num).toBe("4");
    expect(args.trigger_source).toBe("rule_edit_save");
    expect(args.success).toBe(1);
    expect(args.operator).toBe("测试员");
  });

  test("失败时记录 sync_add_update 错误日志", async () => {
    lierenApi.ruleAdd.mockRejectedValue(new Error("网络超时"));

    await lierenOfferRuleSyncPlat(ruleInfo);

    const args = svApi.addRuleOperationLog.mock.calls[0][0];
    expect(args.operation_type).toBe("sync_add_update");
    expect(args.success).toBe(0);
    expect(args.error_msg).toBeTruthy();
  });

  test("新增规则（无 platRuleId）trigger_source 为 rule_add_save", async () => {
    const newRule = makeRuleInfo();
    newRule.platOfferList[0].platRuleId = undefined;

    lierenApi.ruleAdd.mockResolvedValue({ data: { rule_id: 1000 } });
    lierenApi.ruleList.mockResolvedValue({ data: [] });

    await lierenOfferRuleSyncPlat(newRule);

    const args = svApi.addRuleOperationLog.mock.calls[0][0];
    expect(args.trigger_source).toBe("rule_add_save");
  });

  test("编辑时平台返回新 rule_id：更新本地 platRuleId 并落库", async () => {
    const ruleInfo = makeRuleInfo(); // platRuleId: 999
    // 平台在编辑时返回了与本地不一致的新规则id（如账号变更后平台新建规则），
    // 若不落库新 id，平台按新规则报价中标后本地永远匹配不上
    lierenApi.ruleAdd.mockResolvedValue({ data: { rule_id: 888 } });
    lierenApi.ruleList.mockResolvedValue({ data: [] });

    const result = await lierenOfferRuleSyncPlat(ruleInfo);

    // 落库更新 platOfferList 中的新 platRuleId
    expect(svApi.updateRuleRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1001,
        platOfferList: expect.stringContaining('"platRuleId":888')
      })
    );
    // 返回值含新 platRuleId，供调用方落库避免旧 id 覆盖
    expect(result.platOfferList[0].platRuleId).toBe(888);
  });

  test("编辑时平台返回相同 rule_id：不重复落库", async () => {
    const ruleInfo = makeRuleInfo(); // platRuleId: 999
    lierenApi.ruleAdd.mockResolvedValue({ data: { rule_id: 999 } });
    lierenApi.ruleList.mockResolvedValue({ data: [] });

    await lierenOfferRuleSyncPlat(ruleInfo);

    expect(svApi.updateRuleRecord).not.toHaveBeenCalled();
  });
});

// ========================== E: sync_status ==========================
describe("E — lierenOfferRuleEditStatusPlat (sync_status)", () => {
  test("手动切换时记录 sync_status，trigger_source=manual_toggle", async () => {
    const ruleInfo = makeRuleInfo({ status: "2" });
    lierenApi.ruleState.mockResolvedValue({ code: 1 });

    await lierenOfferRuleEditStatusPlat(ruleInfo);

    const args = svApi.addRuleOperationLog.mock.calls[0][0];
    expect(args.operation_type).toBe("sync_status");
    expect(args.new_status).toBe("2");
    expect(args.trigger_source).toBe("manual_toggle");
    expect(args.change_reason).toBe("用户禁用规则，同步禁用");
  });

  test("启用时 change_reason 正确", async () => {
    const ruleInfo = makeRuleInfo({ status: "1" });
    lierenApi.ruleState.mockResolvedValue({ code: 1 });

    await lierenOfferRuleEditStatusPlat(ruleInfo);

    const args = svApi.addRuleOperationLog.mock.calls[0][0];
    expect(args.change_reason).toBe("用户启用规则，同步启用");
  });

  test("当日不报时 trigger_source=no_offer_today", async () => {
    const ruleInfo = makeRuleInfo({ status: "5" });
    lierenApi.ruleState.mockResolvedValue({ code: 1 });

    await lierenOfferRuleEditStatusPlat(ruleInfo);

    const args = svApi.addRuleOperationLog.mock.calls[0][0];
    expect(args.trigger_source).toBe("no_offer_today");
    expect(args.change_reason).toBe("当日不报，同步禁用");
  });

  test("无 platRuleId 时跳过", async () => {
    const ruleInfo = makeRuleInfo();
    ruleInfo.platOfferList[0].platRuleId = undefined;

    await lierenOfferRuleEditStatusPlat(ruleInfo);

    expect(svApi.addRuleOperationLog).not.toHaveBeenCalled();
  });
});

// ========================== F: sync_delete ==========================
describe("F — lierenOfferRuleDelPlat (sync_delete)", () => {
  test("成功时记录 sync_delete 日志", async () => {
    lierenApi.ruleDel.mockResolvedValue({ code: 1 });

    await lierenOfferRuleDelPlat([999, 1000]);

    const args = svApi.addRuleOperationLog.mock.calls[0][0];
    expect(args.operation_type).toBe("sync_delete");
    expect(args.trigger_source).toBe("rule_delete");
    expect(args.success).toBe(1);
    expect(args.change_reason).toContain("2条");
  });

  test("失败时记录错误并重新抛出", async () => {
    lierenApi.ruleDel.mockRejectedValue(new Error("删除失败"));

    await expect(lierenOfferRuleDelPlat([999])).rejects.toThrow("删除失败");

    const args = svApi.addRuleOperationLog.mock.calls[0][0];
    expect(args.operation_type).toBe("sync_delete");
    expect(args.success).toBe(0);
    expect(args.error_msg).toBeTruthy();
  });
});

// ========================== G: sync_bidirectional ==========================
describe("G — checkAndUpdateLierenRuleState (sync_bidirectional)", () => {
  const ruleList = [
    {
      id: 1001,
      ruleName: "规则A",
      shadowLineName: "sfc",
      status: "1",
      seatNum: "4",
      offerType: "1",
      allow_offer_time: null,
      platOfferList: [
        { platName: "lieren", isSyncPlat: "1", platRuleId: "999" }
      ]
    }
  ];

  test("状态不一致时记录 sync_bidirectional 修复日志", async () => {
    // 猎人平台返回：状态为 0（禁用），座位空
    lierenApi.ruleList.mockResolvedValue({
      data: [{ rule_id: "999", state: 0, seats: "", sum_mode: 2 }]
    });
    // ruleAdd 成功
    lierenApi.ruleAdd.mockResolvedValue({ data: { rule_id: "999" } });

    await checkAndUpdateLierenRuleState(ruleList);

    // 先有 sync_add_update 日志（由内部 lierenOfferRuleSyncPlat 触发），再有 sync_bidirectional
    const syncBidirectionalLog = svApi.addRuleOperationLog.mock.calls
      .map(c => c[0])
      .find(log => log.operation_type === "sync_bidirectional");
    expect(syncBidirectionalLog).toBeDefined();
    expect(syncBidirectionalLog.rule_id).toBe(1001);
    expect(syncBidirectionalLog.old_status).toBe("2"); // 平台是 0 → "2"
    expect(syncBidirectionalLog.new_status).toBe("1"); // 本地是 "1" → 修复为 "1"
    expect(syncBidirectionalLog.old_seat_num).toBe(null); // "" || null → null
    expect(syncBidirectionalLog.new_seat_num).toBe("1,2,3,4"); // 修复后
    expect(syncBidirectionalLog.trigger_source).toBe("login_sync"); // 默认值
  });

  test("手动修复时 trigger_source=manual_fix", async () => {
    lierenApi.ruleList.mockResolvedValue({
      data: [{ rule_id: "999", state: 0, seats: "", sum_mode: 2 }]
    });
    lierenApi.ruleAdd.mockResolvedValue({ data: { rule_id: "999" } });

    await checkAndUpdateLierenRuleState(ruleList, "manual_fix");

    const syncBidirectionalLog = svApi.addRuleOperationLog.mock.calls
      .map(c => c[0])
      .find(log => log.operation_type === "sync_bidirectional");
    expect(syncBidirectionalLog.trigger_source).toBe("manual_fix");
  });

  test("启用中的孤儿规则（平台有本地无且state=1）先禁用", async () => {
    // 本地没有同步到猎人的规则
    // 但平台有固定价规则且处于启用中
    lierenApi.ruleList.mockResolvedValue({
      data: [{ rule_id: "888", state: 1, seats: "1,2", sum_mode: 2 }]
    });
    lierenApi.ruleState.mockResolvedValue({ code: 1 });

    await checkAndUpdateLierenRuleState(ruleList);

    // 调用 ruleState 禁用，不调用 ruleDel 删除
    expect(lierenApi.ruleState).toHaveBeenCalledWith(
      expect.objectContaining({ rule_id: ["888"], state: 0 })
    );
    expect(lierenApi.ruleDel).not.toHaveBeenCalled();
    // batchAddRuleOperationLog 被调用
    expect(svApi.batchAddRuleOperationLog).toHaveBeenCalled();
    const batchArgs = svApi.batchAddRuleOperationLog.mock.calls[0][0];
    const log = batchArgs.logs[0];
    expect(log.operation_type).toBe("sync_bidirectional");
    expect(log.old_status).toBe("1");
    expect(log.new_status).toBe("2");
    expect(log.change_reason).toContain("自动禁用");
    expect(log.trigger_source).toBe("login_sync");
  });

  test("已禁用的孤儿规则（平台有本地无且state=0）自动删除", async () => {
    // 平台孤儿规则已是禁用状态 → 应直接删除，检查才能收敛
    lierenApi.ruleList.mockResolvedValue({
      data: [{ rule_id: "888", state: 0, seats: "1,2", sum_mode: 2 }]
    });
    lierenApi.ruleDel.mockResolvedValue({ code: 1 });

    await checkAndUpdateLierenRuleState(ruleList);

    // 调用 ruleDel 删除，不再调用 ruleState
    expect(lierenApi.ruleDel).toHaveBeenCalledWith(
      expect.objectContaining({ rule_id: ["888"] })
    );
    expect(lierenApi.ruleState).not.toHaveBeenCalled();
    // 批量日志为 sync_delete
    expect(svApi.batchAddRuleOperationLog).toHaveBeenCalled();
    const batchArgs = svApi.batchAddRuleOperationLog.mock.calls[0][0];
    const log = batchArgs.logs[0];
    expect(log.operation_type).toBe("sync_delete");
    expect(log.old_status).toBe("2");
    expect(log.new_status).toBe(null);
    expect(log.change_reason).toContain("自动删除");
    expect(log.trigger_source).toBe("login_sync");
  });

  test("启用与已禁用的孤儿规则混合时分别禁用和删除", async () => {
    lierenApi.ruleList.mockResolvedValue({
      data: [
        { rule_id: "888", state: 1, seats: "1,2", sum_mode: 2 }, // 启用中 → 禁用
        { rule_id: "777", state: 0, seats: "", sum_mode: 2 } // 已禁用 → 删除
      ]
    });
    lierenApi.ruleState.mockResolvedValue({ code: 1 });
    lierenApi.ruleDel.mockResolvedValue({ code: 1 });

    await checkAndUpdateLierenRuleState(ruleList);

    expect(lierenApi.ruleState).toHaveBeenCalledWith(
      expect.objectContaining({ rule_id: ["888"], state: 0 })
    );
    expect(lierenApi.ruleDel).toHaveBeenCalledWith(
      expect.objectContaining({ rule_id: ["777"] })
    );
    // 批量日志按 删除 + 禁用 顺序生成
    const batchArgs = svApi.batchAddRuleOperationLog.mock.calls[0][0];
    expect(batchArgs.logs).toHaveLength(2);
    expect(batchArgs.logs[0].operation_type).toBe("sync_delete");
    expect(batchArgs.logs[0].ext_data).toContain("777");
    expect(batchArgs.logs[1].operation_type).toBe("sync_bidirectional");
    expect(batchArgs.logs[1].ext_data).toContain("888");
  });

  test("状态未知（state=null）的孤儿规则按禁用处理而非跳过", async () => {
    // 平台返回 state 非 0/1（如 null）时，应走保守的禁用分支，不能静默跳过
    lierenApi.ruleList.mockResolvedValue({
      data: [{ rule_id: "888", state: null, seats: "1,2", sum_mode: 2 }]
    });
    lierenApi.ruleState.mockResolvedValue({ code: 1 });

    await checkAndUpdateLierenRuleState(ruleList);

    expect(lierenApi.ruleState).toHaveBeenCalledWith(
      expect.objectContaining({ rule_id: ["888"], state: 0 })
    );
    expect(lierenApi.ruleDel).not.toHaveBeenCalled();
    // 日志按"非1即禁用"约定记录 old_status
    const batchArgs = svApi.batchAddRuleOperationLog.mock.calls[0][0];
    const log = batchArgs.logs[0];
    expect(log.operation_type).toBe("sync_bidirectional");
    expect(log.old_status).toBe("2");
  });

  test("删除孤儿规则失败时不影响其他规则且不计入删除数", async () => {
    // 两条已禁用孤儿规则：第一条删除失败，第二条删除成功
    lierenApi.ruleList.mockResolvedValue({
      data: [
        { rule_id: "777", state: 0, seats: "", sum_mode: 2 },
        { rule_id: "888", state: 0, seats: "1,2", sum_mode: 2 }
      ]
    });
    lierenApi.ruleDel.mockResolvedValueOnce({ code: 1 }).mockRejectedValueOnce(
      new Error("删除失败")
    );

    await checkAndUpdateLierenRuleState(ruleList);

    // 两条都尝试删除（失败不中断循环）
    expect(lierenApi.ruleDel).toHaveBeenCalledTimes(2);
    // 失败那条不阻止成功那条（第二次调用成功）
    expect(lierenApi.ruleDel).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ rule_id: ["777"] })
    );
    expect(lierenApi.ruleDel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ rule_id: ["888"] })
    );
  });
});
