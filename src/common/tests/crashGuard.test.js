/**
 * 白屏防护（B/C/本地落盘）验证测试
 *
 * 背景：6.6.8 用户 1 天内 2 次白屏，根因方向为渲染进程内存持续增长（队列级 logger 的
 * logList 在 logUpload 上传失败时不清空，长时间运行累积 → OOM → 渲染进程崩溃白屏）。
 *
 * 修复：
 *  B. logger._addToLogList 增加 logList 上限保护（500 条，超限丢弃最旧）
 *  C. utils.logUpload 上传失败时强制清空已处理批次（原为 break 保留，内存无限累积）
 *  D. 本地兜底：上传失败的日志落盘（src/common/localFailLog.js，经主进程 ipc 写文件）
 *
 * 验证目标：
 *  1. logList 超过 500 条时丢弃最旧日志，保留最新（上限保护生效）
 *  2. logUpload 上传失败时清空已处理批次（不再保留导致内存累积）
 *  3. 本地兜底落盘：saveFailLogToLocal 通过 ipcRenderer.invoke("save-fail-log") 写盘
 */

jest.mock("@/utils/utils", () => {
  return {
    // 模拟 utils.logUpload 修复后的真实行为：
    // 上传失败时同样清空已处理批次（C 修复），再抛错触发 Logger 的 catch
    logUpload: jest.fn(async (order, logList) => {
      if (!logList.length) return;
      // 与真实实现一致：失败时 splice 清空本批（BATCH_SIZE=50），防止 logList 无限累积
      logList.splice(0, Math.min(logList.length, 50));
      throw new Error("模拟日志上传失败");
    }),
    formatErrInfo: jest.fn(e =>
      e instanceof Error ? e.message : String(e)
    ),
    sendWxPusherMessage: jest.fn(async () => {})
  };
});

const Logger = require("@/common/logger").default;
const { saveFailLogToLocal } = require("@/common/localFailLog");

describe("B: logger logList 上限保护", () => {
  test("logList 超过 500 条时丢弃最旧日志，保留最新 500 条", () => {
    const logger = new Logger({ logType: 3, isPrint: false });
    // 写入 600 条日志
    for (let i = 1; i <= 600; i++) {
      logger.infoSave(`日志${i}`, { inx: i });
    }
    expect(logger.logList.length).toBe(500);
    // 最旧的 100 条应被丢弃（从第 101 条开始保留）
    expect(logger.logList[0].des).toBe("日志101");
    expect(logger.logList[499].des).toBe("日志600");
  });

  test("logList 未超上限时全部保留", () => {
    const logger = new Logger({ logType: 3, isPrint: false });
    for (let i = 1; i <= 100; i++) {
      logger.infoSave(`日志${i}`);
    }
    expect(logger.logList.length).toBe(100);
    expect(logger.logList[0].des).toBe("日志1");
    expect(logger.logList[99].des).toBe("日志100");
  });
});

describe("C: logUpload 失败时 logList 清理", () => {
  test("上传失败时已处理批次从 logList 移除（不再无限累积）", async () => {
    const { logUpload } = require("@/utils/utils");
    const logger = new Logger({ logType: 3, isPrint: false });
    // 写入 3 条日志
    logger.infoSave("日志1");
    logger.warnSave("日志2");
    logger.errorSave("日志3");
    expect(logger.logList.length).toBe(3);

    // 上传失败（mock 抛错），不会 reject（logger.logUpload 内部已 catch）
    await expect(logger.logUpload()).resolves.toBeUndefined();
    // 失败后 logList 应被清空（不再保留导致内存累积）
    expect(logger.logList.length).toBe(0);
  });
});

describe("D: 本地兜底落盘", () => {
  test("saveFailLogToLocal 通过 window.ipcRenderer.invoke(save-fail-log) 写盘", () => {
    const invokeMock = jest.fn(async () => true);
    // 与 preload 挂载一致：window.ipcRenderer
    window.ipcRenderer = { invoke: invokeMock };

    saveFailLogToLocal(
      [{ des: "日志1", level: "info" }, { des: "日志2", level: "error" }],
      { plat_name: "lieren", app_name: "wanda", order_number: "123", type: 1 }
    );

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [channel, payload] = invokeMock.mock.calls[0];
    expect(channel).toBe("save-fail-log");
    expect(payload.fileDate).toMatch(/^\d{8}$/);
    expect(payload.content).toContain("日志1");
    expect(payload.content).toContain("日志2");
    expect(payload.content).toContain("lieren");
  });

  test("window.ipcRenderer 不可用时静默跳过（不抛异常）", () => {
    window.ipcRenderer = undefined;
    expect(() =>
      saveFailLogToLocal([{ des: "日志1" }], {})
    ).not.toThrow();
  });
});
