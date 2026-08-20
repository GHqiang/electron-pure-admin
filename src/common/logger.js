// logger.js - 统一日志处理
import {
  logUpload, // 日志上传
  traceUpload, // V3 L2：明细日志上传（/svpi/log/trace）
  formatErrInfo
} from "@/utils/utils";

// V3：降级/辅助动作 des 前缀（仅作根因排除与 L1 收窄白名单判定，非流程前缀）
const REMEDY_KEYWORDS = ["降级-", "辅助-"];
const MAX_TRACE_LIST = 500; // traceBuffer 上限（与 logList 一致，丢最旧）
// ⚠️ 调整（2026-08-20）：本地（L3）完全不写日志——明细只落 L2 服务器文件；
//   客户端本地磁盘零写入（原"失败订单全量写本地"方案已按用户要求移除）
const MAX_L1_ERROR_COUNT = 5; // v3Mode 下每订单 L1 入库异常条数上限（超出转 L2，P1-3）

export default class Logger {
  static levels = { INFO: "info", WARN: "warn", ERROR: "error" };
  constructor({ logType, isPrint }) {
    this.logList = [];
    this.type = logType; // 日志类型 1-报价队列 2-获取待出票队列 3-出票队列 4-凤凰新sid续期 5-帮助锁座6-h5ume-sid续期
    // isPrint 显式传 false 时不打印控制台（内部独立 logger 场景，日志仅入 logList 上传）
    this.isPrint = isPrint ?? true;
    // V3：明细日志通道（L2 上传；L3 本地写已停用，客户端不写日志文件）
    this.traceBuffer = []; // 待上传明细（console 级 + 入库级）
    this.traceEnabled = false; // 字典白名单判定（log_v3_enabled_series）
    this.v3Mode = false; // L1 收窄开关（同字典，默认关=全量回退）
    // V3：根因缓存（失败根因不被降级/辅助动作覆盖）
    this._rootErrCache = null;
    this._l1ErrorCount = 0; // v3Mode 下本实例 L1 入库 errorSave 计数
  }
  init({ plat_name, order_number, app_name, appName, app_type_code }) {
    this.plat_name = plat_name;
    this.order_number = order_number;
    // fetcher（待出票队列）订单多为 appName 驼峰字段、无 app_name——兜底取同一值，
    // 否则系列判定/L2 上传的 app_name 为 undefined，type=2 明细永远采不到（2026-08-20 修复）
    this.app_name = app_name || appName;
    // V3：按字典白名单启用——app_name 反查系列 key（getSeriesKeyByAppName，如 hsmzyc→chenxing）
    // 与字典比对（字典配系列名，如 "chenxing"）。
    // ⚠️ 修复（2026-08-19）：不能用 plat_name（订单来源平台，如 mayi/lieren）判定——
    //   plat_name 是平台维度，字典配的是系列维度，导致 v3Mode 恒 false、字典"开了不生效"。
    // ⚠️ 修复（2026-08-20）：① 订单自带 app_type_code 优先判定——getCanAppTypeList 是
    //   "当前登录账号可用影线"列表，可能不含该影线导致反查失败（v3Mode 恒 false 根因）；
    //   ② 同步预判定（localStorage 字典缓存立即生效），消除异步动态 import 完成前
    //   流程早期日志（如"新的待报价订单"紧跟 init）按 v3Mode=false 全量入库的竞态。
    this._applyV3FlagsSync(app_type_code);
    // ⚠️ 修复（2026-08-20 二轮）：传 this.app_name（含 appName 兜底）而非解构参数——
    //   fetcher 订单只有 appName 时，原实现把 undefined 传给异步反查，系列恒判不中。
    //   promise 挂到实例上，短生命周期 logger（fetcher/待出票队列）写日志前
    //   可 await v3Ready() 消除"异步判定未完成 → traceEnabled=false → 明细丢失"竞态。
    this._v3FlagsPromise = this._applyV3Flags(this.app_name, app_type_code);
  }

  // V3：等待系列异步判定完成（2026-08-20 二轮新增）
  // 短生命周期 logger（fetcher 每订单日志、sendNewOrderMsg）从 init 到写日志全程
  // 无 await 点，动态 import 的系列判定来不及完成 → traceEnabled/v3Mode 仍为 false
  // → 日志既不进 trace 也不按 v3Mode 收窄。写日志前 await 本方法可消除该竞态；
  // 长流程 logger（报价/出票队列）天然有多个 await 点，无需显式调用。
  async v3Ready() {
    try {
      await this._v3FlagsPromise;
    } catch {
      // 判定失败保持现状（traceEnabled=false，仅 L1）
    }
    return this;
  }

  // V3：同步预判定——localStorage 已有字典缓存时立即生效（消除异步竞态：
  // 动态 import + 查库完成前，流程早期 infoSave 会按 v3Mode=false 全量入库）。
  // 同步阶段拿不到 getCanAppTypeList，仅订单自带 app_type_code 可判；缺失时等异步刷新。
  _applyV3FlagsSync(app_type_code) {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      const raw = window.localStorage.getItem("dictTableList");
      if (!raw) return;
      const list = JSON.parse(raw);
      const dict = Object.fromEntries(
        list
          .filter(item => item.status === 1)
          .map(item => [item.dict_type, item.dict_value])
      );
      const series = (dict.log_v3_enabled_series || "")
        .split(",")
        .filter(Boolean);
      if (app_type_code) {
        this.v3Mode = series.includes(app_type_code);
        this.traceEnabled = this.v3Mode;
      }
    } catch {
      // 缓存解析失败静默，等异步刷新兜底
    }
  }

  // V3：异步应用 V3 开关（动态 import——constant.js 模块级实例化 pinia store，
  // 静态 import 会在无 pinia 的测试环境崩溃；业务运行时毫秒级生效）
  async _applyV3Flags(app_name, app_type_code) {
    try {
      const [{ dictTable }, { GET_APP_TYPE_LIST }] = await Promise.all([
        import("@/store/dictTable"),
        import("@/common/constant")
      ]);
      const series = (dictTable().dictInfo.log_v3_enabled_series || "")
        .split(",")
        .filter(Boolean);
      // 按影线系列标识（app_type_code）判定：优先订单自带字段（订单对象含 app_type_code，
      // 如 chenxing_applet，最可靠）；缺失时按 app_name（具体影线）→ 所属系列反查。
      // ⚠️ 修复（2026-08-20）：getCanAppTypeList 是"当前登录账号可用影线"列表，
      //   可能不含该影线（跨账号/多影线场景）导致反查失败——订单自带字段优先。
      // ⚠️ 简化（2026-08-20 复查）：异步无条件判定——有 app_type_code 时同步（localStorage
      //   缓存）与异步（dictTable store 同源缓存）的 series 相同 → 结果必然一致，无需
      //   "同步成功则不覆盖"标记；无 app_type_code 时异步反查补判；catch 静默不覆盖。
      const appTypeCode = app_type_code
        ? app_type_code
        : GET_APP_TYPE_LIST().find(item =>
            item.app_name_list.includes(app_name)
          )?.app_type_code;
      this.v3Mode = appTypeCode ? series.includes(appTypeCode) : false;
      this.traceEnabled = this.v3Mode;
    } catch {
      // 异步失败静默，不覆盖同步判定结果
    }
  }
  log(level, message, isSave, meta) {
    const timestamp = new Date().toLocaleString().replaceAll("/", "-");
    if (this.isPrint) {
      // console[level](`[${timestamp}] ${message}`, meta);
      if (meta) {
        console[level](`${message}`, meta);
      } else {
        console[level](`${message}`);
      }
    }
    // 调用方 Save 意图（infoSave/warnSave/errorSave=true；info/warn/error=false）：
    // L2 明细采集按此判定——非 Save 调试日志不写后端本地（2026-08-20 用户要求）；
    // L1 收窄（v3Mode 前缀过滤/条数兜底）只影响入库，不影响 L2 明细（原设计：
    // "不入 opera_record，仍进 traceBuffer/L2"、"超上限后仅 L2"——2026-08-20 修复回归）
    const isSaveIntent = isSave;
    // V3：L1 收窄（v3Mode 下 info/warn 非降级/辅助前缀强制不入 opera_record，仍进 traceBuffer/L2）
    if (isSaveIntent && this.v3Mode && level !== "error") {
      const isRemedy = REMEDY_KEYWORDS.some(kw => message.startsWith(kw));
      if (!isRemedy) isSave = false;
    }
    // V3：L1 条数兜底（P1-3）：v3Mode 下 errorSave 超上限后仅 L2
    if (isSaveIntent && this.v3Mode && level === "error") {
      if (this._l1ErrorCount >= MAX_L1_ERROR_COUNT) {
        isSave = false;
      } else {
        this._l1ErrorCount++;
      }
    }
    if (isSave) {
      // 统一日志格式
      this._addToLogList({
        opera_time: timestamp,
        des: message,
        level,
        info: meta
      });
    }
    // V3：明细采集（L2）：按调用方 Save 意图判定——infoSave/warnSave/errorSave 进 L2
    // （无论是否被 L1 收窄）；info/warn/error 非 Save 仅 console 不写后端本地（2026-08-20 用户要求）
    if (this.traceEnabled && isSaveIntent) {
      this._pushTrace({
        opera_time: timestamp,
        des: message,
        level,
        info: meta
      });
    }
  }
  // 添加日志
  _addToLogList({ opera_time, des, level, info }) {
    this.logList.push({ opera_time, des, level, info });
    // 上限保护：logUpload 上传失败时 logList 不清空，长时间运行会导致渲染进程内存持续增长（OOM 白屏根因）。
    // 超过上限丢弃最旧日志，保留最新日志便于排查。
    const MAX_LOG_LIST = 500;
    if (this.logList.length > MAX_LOG_LIST) {
      this.logList.splice(0, this.logList.length - MAX_LOG_LIST);
    }
  }

  // V3：明细入缓存（待上传 L2；客户端本地不写日志文件，L3 已停用）
  _pushTrace(item) {
    this.traceBuffer.push(item);
    if (this.traceBuffer.length > MAX_TRACE_LIST) {
      this.traceBuffer.splice(0, this.traceBuffer.length - MAX_TRACE_LIST);
    }
  }

  info(message, meta) {
    this.log(Logger.levels.INFO, message, false, meta);
  }
  warn(message, meta) {
    this.log(Logger.levels.WARN, message, false, meta);
  }
  error(message, meta) {
    this.log(Logger.levels.ERROR, message, false, meta);
  }

  infoSave(message, meta) {
    this.log(Logger.levels.INFO, message, true, meta);
  }
  warnSave(message, meta) {
    this.log(Logger.levels.WARN, message, true, meta);
  }
  errorSave(message, meta) {
    // 先执行实际日志记录（控制台/入库/trace），再单独捕获消息文本用于根因缓存。
    // ⚠️ 注意：必须捕获 message 本身，不能取 this.log() 的返回值——log() 无 return，取到的是 undefined，
    //   会导致 _rootErrCache/_lastErrCache.message 恒为 undefined，根因缓存与降级排除全部失效（回归点）。
    this.log(Logger.levels.ERROR, message, true, meta);
    // String 兜底：防非字符串 message（Error/数字对象）在 startsWith 抛错（核查建议 3.3）
    const des = typeof message === "string" ? message : String(message ?? "");
    this._lastErrCache = { message: des, meta };
    // V3 根因缓存：降级/辅助动作不覆盖根因（根因=最近一次非降级/辅助 errorSave）
    if (!REMEDY_KEYWORDS.some(kw => des?.startsWith(kw))) {
      this._rootErrCache = { message: des, meta };
    }
  }
  // V3：显式成功节点重置根因（出票提交成功/报价入库成功等明确节点调用）
  // 同时清 _lastErrCache（核查建议 3.2：成功单"完全干净"，避免回退链落到最近错误）
  resetRootErr() {
    this._rootErrCache = null;
    this._lastErrCache = null;
  }
  logUpload(logIngo = this) {
    const { plat_name, order_number, app_name, logList } = logIngo;
    const tasks = [];
    // L1：入库级日志（现状逻辑不变，失败本地兜底 + 微信告警）
    if (logList.length) {
      tasks.push(() =>
        logUpload(
          {
            plat_name,
            app_name,
            order_number,
            type: this.type
          },
          logList
        )
      );
    }
    // L2：明细日志（v3Mode/traceEnabled 时上传 /svpi/log/trace，失败不重试不告警；
    // 客户端本地不写日志文件（L3 已停用，2026-08-20 用户要求），明细只落服务器）
    if (this.traceEnabled && this.traceBuffer.length) {
      const traceBatch = this.traceBuffer.splice(0, this.traceBuffer.length);
      tasks.push(() =>
        traceUpload(
          {
            plat_name,
            app_name,
            order_number,
            type: this.type
          },
          traceBatch
        )
      );
    }
    if (!tasks.length) return Promise.resolve();
    // V3 全局串行链：任意时刻全局最多一个上传批次在途。
    // 替代原每实例 _uploadChain：原实现多 Logger 实例并存时多个 addList 可并发，
    // 无法保证"全局在途≤1"；且同实例并发 splice 同一 logList 会重复/丢失（串行后自然消除）。
    const g = typeof window !== "undefined" ? window : globalThis;
    const prev = g.__logUploadChain || Promise.resolve();
    g.__logUploadChain = prev
      .then(async () => {
        for (const task of tasks) {
          try {
            await task();
          } catch (error) {
            // trace 失败静默（明细只靠 L2 服务器，客户端无本地兜底）；addList 失败已在 utils.logUpload 内部兜底+告警
            console.error("日志上传链路异常", error);
          }
        }
      })
      .catch(error => {
        // 单次上传异常不阻断后续日志上传（恢复 promise 链）
        console.error("日志上传链路异常", error);
      });
    return g.__logUploadChain;
  }

  /**
   * 清空指定时间点之前的日志
   * @param {number} timestamp - 毫秒时间戳，早于此时间的日志将被移除
   */
  clearLogsBefore(timestamp) {
    if (!timestamp) return;
    this.logList = this.logList.filter(item => {
      const logTime = new Date(item.opera_time).getTime();
      return logTime >= timestamp;
    });
  }

  getLastErrMsg() {
    // V3：优先根因（非降级/辅助的最近 errorSave），其次最近错误缓存
    if (this._rootErrCache) return this._rootErrCache.message;
    if (this._lastErrCache) return this._lastErrCache.message;
    const errInfoObj = this.logList
      .filter(item => item.level === "error")
      .reverse()?.[0];
    return errInfoObj?.des || "";
  }
  getLastErrMsgAndInfo() {
    try {
      // V3：优先根因缓存（防止 logUpload splice 清空 logList 后丢失 + 防止降级动作污染根因）
      const cache = this._rootErrCache || this._lastErrCache;
      if (cache) {
        const { message, meta } = cache;
        return {
          err_msg: message,
          err_info: formatErrInfo(meta?.error || meta) || ""
        };
      }
      const errInfoObj = this.logList
        .filter(item => item.level === "error")
        .reverse()?.[0];
      let err_msg = errInfoObj?.des || "";
      let err_info =
        formatErrInfo(errInfoObj?.info?.error || errInfoObj?.info) || "";
      return { err_msg, err_info };
    } catch (error) {
      return { err_msg: "", err_info: "" };
    }
  }
}
