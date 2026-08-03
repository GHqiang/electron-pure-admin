/**
 * Logger.logUpload 串行化验证测试
 *
 * 背景：utils.logUpload 上传成功后 splice 清空 logList；若同一 logger 的多次 logUpload
 * 并发调用（fire-and-forget，不 await），两个 while 循环会同时 slice/splice 同一数组，
 * 造成日志重复上传或部分丢失（批量更新券库存的内层 finally 与外层 finally 紧邻两次调用、
 * 报价流程结束与后台异步任务并发时均可能触发）。
 *
 * 修复：Logger.logUpload 通过 promise 链将同一实例的多次上传串行执行。
 * 验证目标：
 *  1. 连续两次 logUpload 并发峰值不超过 1（串行化生效）
 *  2. 第二次排队执行时 logList 已被第一次清空，不重复上传
 *  3. 单次上传异常不阻断 promise 链，后续日志仍能上传
 */

jest.mock("@/utils/utils", () => {
  let concurrent = 0;
  let maxConcurrent = 0;
  // 记录每次调用收到日志条数（splice 前），mock.calls 里的数组是引用，
  // await 完成后会被 splice 清空，不能用于断言
  const receivedLengths = [];
  const logUpload = jest.fn(async (order, logList) => {
    receivedLengths.push(logList.length);
    if (!logList.length) return;
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    // 模拟上传耗时，放大并发窗口
    await new Promise(r => setTimeout(r, 30));
    // 模拟真实 utils.logUpload：上传成功后 splice 清空
    logList.splice(0, logList.length);
    concurrent--;
  });
  return {
    logUpload,
    formatErrInfo: jest.fn(e => (e instanceof Error ? e.message : String(e))),
    _getMaxConcurrent: () => maxConcurrent,
    _getReceivedLengths: () => receivedLengths.slice(),
    _reset: () => {
      concurrent = 0;
      maxConcurrent = 0;
      receivedLengths.length = 0;
      // 注意：用 mockClear 而非 mockReset，避免清除工厂定义的默认实现（慢速上传+splice）
      logUpload.mockClear();
    }
  };
});

const utilsMock = require("@/utils/utils");
const Logger = require("@/common/logger").default;

describe("Logger.logUpload 串行化", () => {
  // 屏蔽 infoSave 的 console 输出噪音
  let consoleSpy;
  beforeEach(() => {
    utilsMock._reset();
    consoleSpy = jest
      .spyOn(console, "info")
      .mockImplementation(() => {});
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test("连续两次 logUpload 串行执行，并发峰值不超过 1，且不重复上传", async () => {
    const logger = new Logger({ logType: 1, isPrint: false });
    logger.infoSave("日志1", { a: 1 });
    logger.infoSave("日志2", { a: 2 });

    // 不 await 连续触发两次（模拟 fire-and-forget 调用点）
    const p1 = logger.logUpload();
    const p2 = logger.logUpload();
    await Promise.all([p1, p2]);

    // 串行化生效：同一时刻最多 1 个上传在跑
    expect(utilsMock._getMaxConcurrent()).toBe(1);
    // utils.logUpload 被调用 2 次；第一次收到 2 条日志，第二次排队执行时
    // logList 已被第一次 splice 清空 → 收到 0 条，不重复上传
    expect(utilsMock.logUpload).toHaveBeenCalledTimes(2);
    expect(utilsMock._getReceivedLengths()).toEqual([2, 0]);
    // logList 最终清空
    expect(logger.logList.length).toBe(0);
  });

  test("上传异常被捕获，不阻断 promise 链，后续日志仍能上传", async () => {
    const logger = new Logger({ logType: 1, isPrint: false });
    logger.infoSave("日志A", { a: 1 });

    // 第一次上传抛异常（模拟网络失败），第二次恢复正常
    utilsMock.logUpload.mockRejectedValueOnce(new Error("网络异常"));
    const p1 = logger.logUpload();

    // 第一次上传异常期间新产生的日志
    logger.infoSave("日志B", { a: 2 });
    const p2 = logger.logUpload();
    await Promise.all([p1, p2]);

    // 第一次异常被 catch，未导致链路中断；第二次仍执行。
    // receivedLengths 只记录成功执行原始实现的调用：第一次 reject（未执行实现、未 splice，
    // 日志保留），第二次成功收到 2 条（日志A+B）
    expect(utilsMock.logUpload).toHaveBeenCalledTimes(2);
    expect(utilsMock._getReceivedLengths()).toEqual([2]);
    expect(logger.logList.length).toBe(0);
  });

  test("空 logList 时 logUpload 直接返回，不触发上传", async () => {
    const logger = new Logger({ logType: 1, isPrint: false });
    await logger.logUpload();
    expect(utilsMock.logUpload).not.toHaveBeenCalled();
  });
});
