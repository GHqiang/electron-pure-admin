/**
 * v3Mode 同步预判定（_applyV3FlagsSync）回归测试
 *
 * 背景（2026-08-20 线上问题）：正常报价 opera_record 仍落 infoSave 日志
 * （"新的待报价订单"/"订单报价链路开始"/"进入 singleOffer"/"订单入队-调度诊断"等）。
 * 根因：v3Mode 判定两处失效——
 *  ① 异步竞态：_applyV3Flags 动态 import + 查库未完成时流程早期日志已打（v3Mode 仍 false）
 *  ② 反查失败：GET_APP_TYPE_LIST 是"当前登录账号可用影线"列表（getCanAppTypeList），
 *     可能不含该影线 → appTypeCode=undefined → v3Mode 恒 false
 * 修复：init 增加 app_type_code 直传（订单自带字段最可靠），
 *  新增 _applyV3FlagsSync 用 localStorage 字典缓存（dictTableList）同步判定立即生效；
 *  异步刷新仅兜底 app_type_code 缺失场景，不覆盖同步结果。
 *
 * 验证目标：
 *  1. 白名单命中 + 订单自带 app_type_code → init 后同步 v3Mode=true
 *  2. app_type_code 不在白名单 → v3Mode=false
 *  3. 无 app_type_code → 同步不判定（保持 false，等异步刷新）
 *  4. localStorage 无缓存/脏数据 → 同步跳过不抛错
 *  5. v3Mode 下 infoSave 不入 L1（收窄生效，仍进 traceBuffer）
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

const WHITE_LIST = [
  {
    dict_type: "log_v3_enabled_series",
    dict_value: "chenxing_applet",
    status: 1
  }
];

describe("Logger v3Mode 同步预判定", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("白名单命中 + 订单自带 app_type_code → init 后同步 v3Mode=true", () => {
    window.localStorage.setItem("dictTableList", JSON.stringify(WHITE_LIST));
    const logger = new Logger({ logType: 1, isPrint: false });
    logger.init({
      plat_name: "mayi",
      order_number: "TEST001",
      app_name: "xingfulanhai",
      app_type_code: "chenxing_applet"
    });
    expect(logger.v3Mode).toBe(true);
    expect(logger.traceEnabled).toBe(true);
  });

  test("app_type_code 不在白名单 → v3Mode=false", () => {
    window.localStorage.setItem("dictTableList", JSON.stringify(WHITE_LIST));
    const logger = new Logger({ logType: 1, isPrint: false });
    logger.init({
      plat_name: "mayi",
      order_number: "TEST002",
      app_name: "x",
      app_type_code: "other_applet"
    });
    expect(logger.v3Mode).toBe(false);
    expect(logger.traceEnabled).toBe(false);
  });

  test("无 app_type_code → 同步不判定（保持 false，等异步刷新）", () => {
    window.localStorage.setItem("dictTableList", JSON.stringify(WHITE_LIST));
    const logger = new Logger({ logType: 1, isPrint: false });
    logger.init({
      plat_name: "mayi",
      order_number: "TEST003",
      app_name: "xingfulanhai"
    });
    expect(logger.v3Mode).toBe(false);
    expect(logger.traceEnabled).toBe(false);
  });

  test("localStorage 无缓存 → 同步跳过不抛错", () => {
    const logger = new Logger({ logType: 1, isPrint: false });
    logger.init({
      plat_name: "mayi",
      order_number: "TEST004",
      app_name: "x",
      app_type_code: "chenxing_applet"
    });
    expect(logger.v3Mode).toBe(false);
  });

  test("localStorage 脏数据（非 JSON）→ 同步跳过不抛错", () => {
    window.localStorage.setItem("dictTableList", "{broken json");
    const logger = new Logger({ logType: 1, isPrint: false });
    logger.init({
      plat_name: "mayi",
      order_number: "TEST005",
      app_name: "x",
      app_type_code: "chenxing_applet"
    });
    expect(logger.v3Mode).toBe(false);
  });

  test("v3Mode 下 infoSave 不入 L1（收窄生效，仍进 traceBuffer）", () => {
    window.localStorage.setItem("dictTableList", JSON.stringify(WHITE_LIST));
    const logger = new Logger({ logType: 1, isPrint: false });
    logger.init({
      plat_name: "mayi",
      order_number: "TEST006",
      app_name: "x",
      app_type_code: "chenxing_applet"
    });
    logger.infoSave("新的待报价订单", { newOrder: {} });
    expect(logger.logList.length).toBe(0);
    expect(logger.traceBuffer.length).toBe(1);
  });
});
