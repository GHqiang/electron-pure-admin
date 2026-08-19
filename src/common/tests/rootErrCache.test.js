/**
 * 根因缓存（_rootErrCache）回归测试
 *
 * 背景（2026-08-19 回归）：errorSave 曾写 `const des = this.log(...)`，而 log() 无 return，
 * 导致 des===undefined → _rootErrCache/_lastErrCache.message 恒为 undefined、
 * 降级/辅助前缀排除全部失效（任何 errorSave 都覆盖根因且 message 为空）。
 * 修复：errorSave 捕获 message 本身（String 兜底），不取 log() 返回值。
 *
 * 验证目标：
 *  1. errorSave 后根因缓存 message 为传入文本（非 undefined）
 *  2. 降级-/辅助- 前缀 errorSave 不覆盖根因
 *  3. resetRootErr 同时清空根因与最近错误缓存
 *  4. getLastErrMsg / getLastErrMsgAndInfo 优先根因，回退链完整
 *  5. 非字符串 message 不抛错（String 兜底）
 */

jest.mock("@/utils/utils", () => {
  const logUpload = jest.fn(async () => {});
  const traceUpload = jest.fn(async () => {});
  return {
    logUpload,
    traceUpload,
    formatErrInfo: jest.fn(e => (e instanceof Error ? e.message : String(e)))
  };
});

const Logger = require("@/common/logger").default;

describe("Logger 根因缓存", () => {
  let consoleSpy;
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test("errorSave 后根因缓存 message 为传入文本（防 des=undefined 回归）", () => {
    const logger = new Logger({ logType: 3, isPrint: false });
    logger.errorSave("锁定座位-失败", { error: "seats sold" });
    expect(logger._rootErrCache).not.toBeNull();
    expect(logger._rootErrCache.message).toBe("锁定座位-失败");
    expect(logger._lastErrCache.message).toBe("锁定座位-失败");
  });

  test("降级-/辅助- 前缀 errorSave 不覆盖根因", () => {
    const logger = new Logger({ logType: 3, isPrint: false });
    logger.errorSave("锁定座位-失败", { error: "seats sold" });
    logger.errorSave("降级-转单-进入", { 原因: "锁座失败" });
    logger.errorSave("辅助-同步卡余额-异常", { error: "timeout" });
    // 根因保持为最近一次非降级/辅助 errorSave
    expect(logger._rootErrCache.message).toBe("锁定座位-失败");
    // 最近错误缓存仍记录最后一条（兜底）
    expect(logger._lastErrCache.message).toBe("辅助-同步卡余额-异常");
  });

  test("resetRootErr 同时清空根因与最近错误缓存", () => {
    const logger = new Logger({ logType: 3, isPrint: false });
    logger.errorSave("锁定座位-失败", { error: "x" });
    logger.resetRootErr();
    expect(logger._rootErrCache).toBeNull();
    expect(logger._lastErrCache).toBeNull();
  });

  test("getLastErrMsgAndInfo 优先根因（不被降级动作污染）", () => {
    const logger = new Logger({ logType: 3, isPrint: false });
    logger.errorSave("锁定座位-失败", { error: "seats sold" });
    logger.errorSave("降级-转单-进入", { 原因: "锁座失败" });
    const { err_msg, err_info } = logger.getLastErrMsgAndInfo();
    expect(err_msg).toBe("锁定座位-失败");
    expect(err_info).toContain("seats sold");
    expect(logger.getLastErrMsg()).toBe("锁定座位-失败");
  });

  test("无缓存时回退 logList 中的 error 条目", () => {
    const logger = new Logger({ logType: 3, isPrint: false });
    logger.logList.push({
      opera_time: "2026-08-19 10:00:00",
      des: "创建订单-失败",
      level: "error",
      info: { error: "create fail" }
    });
    const { err_msg } = logger.getLastErrMsgAndInfo();
    expect(err_msg).toBe("创建订单-失败");
  });

  test("非字符串 message 不抛错（String 兜底）", () => {
    const logger = new Logger({ logType: 3, isPrint: false });
    expect(() => logger.errorSave(new Error("boom"))).not.toThrow();
    expect(logger._rootErrCache.message).toBe("Error: boom");
  });
});
