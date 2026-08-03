// logger.js - 统一日志处理
import {
  logUpload, // 日志上传
  formatErrInfo
} from "@/utils/utils";

export default class Logger {
  static levels = { INFO: "info", WARN: "warn", ERROR: "error" };
  constructor({ logType, isPrint }) {
    this.logList = [];
    this.type = logType; // 日志类型 1-报价队列 2-获取待出票队列 3-出票队列 4-凤凰新sid续期 5-帮助锁座6-h5ume-sid续期
    // isPrint 显式传 false 时不打印控制台（内部独立 logger 场景，日志仅入 logList 上传）
    this.isPrint = isPrint ?? true;
  }
  init({ plat_name, order_number, app_name }) {
    this.plat_name = plat_name;
    this.order_number = order_number;
    this.app_name = app_name;
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
    if (isSave) {
      // 统一日志格式
      this._addToLogList({
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
    this.log(Logger.levels.ERROR, message, true, meta);
    this._lastErrCache = { message, meta };
  }
  logUpload(logIngo = this) {
    const { plat_name, order_number, app_name, logList } = logIngo;
    if (!logList.length) return Promise.resolve();
    // 同一 logger 实例的多次 logUpload 串行执行（promise 链）：
    // utils.logUpload 上传成功后 splice 清空 logList，若并发调用（如批量更新券库存的
    // 内层 finally 与外层 finally 紧邻两次调用、报价流程结束与后台异步任务并发），
    // 两个 while 循环会同时 slice/splice 同一数组，造成日志重复上传或部分丢失。
    // 串行化后：前一次上传完成 splice 清空，后续排队执行时 logList 为空自然跳过。
    const prev = this._uploadChain || Promise.resolve();
    this._uploadChain = prev
      .then(() =>
        logUpload(
          {
            plat_name,
            app_name,
            order_number,
            type: this.type
          },
          logList
        )
      )
      .catch(error => {
        // 单次上传异常不阻断后续日志上传（恢复 promise 链）
        console.error("日志上传链路异常", error);
      });
    return this._uploadChain;
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
    if (this._lastErrCache) return this._lastErrCache.message;
    const errInfoObj = this.logList
      .filter(item => item.level === "error")
      .reverse()?.[0];
    return errInfoObj?.des || "";
  }
  getLastErrMsgAndInfo() {
    try {
      // 优先使用缓存（防止logUpload splice 清空 logList 后丢失）
      if (this._lastErrCache) {
        const { message, meta } = this._lastErrCache;
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
