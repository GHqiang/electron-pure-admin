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
    this.isPrint = isPrint || true;
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
    if (logList.length) {
      return logUpload(
        {
          plat_name,
          app_name,
          order_number,
          type: this.type
        },
        logList
      );
    }
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
