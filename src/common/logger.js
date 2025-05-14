// logger.js - 统一日志处理
import {
  logUpload // 日志上传
} from "@/utils/utils";

export default class Logger {
  static levels = { INFO: "info", WARN: "warn", ERROR: "error" };
  constructor({ logType, isPrint }) {
    this.logList = [];
    this.type = logType; // 日志类型 1-报价队列 2-获取待出票队列 3-出票队列
    this.isPrint = isPrint || true;
  }
  init({ plat_name, order_number, app_name }) {
    this.plat_name = plat_name;
    this.order_number = order_number;
    this.app_name = app_name;
  }
  log(level, message, isSave, meta = {}) {
    const timestamp = new Date().toLocaleString().replaceAll("/", "-");
    if (this.isPrint) {
      // console[level](`[${timestamp}] ${message}`, meta);
      console[level](`${message}`, meta);
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
}
