// 网络错误日志攒批上传模块（整改 v1.4）
// 背景：每个网络失败事件都会触发一次 logUpload（POST /svpi/operaRecord/addList，
//       内部超时重试最多 3 次）——拥堵期 60+ 次失败 → 60+ 条追加请求，
//       继续占客户端 6 槽放大排队（失败反馈循环，8-14 日志 inFlight 列表 addList 占多数为证）。
// 方案：网络错误日志进内存队列，30s 窗口或满 20 条触发一次批量上传；
//       上传失败静默丢弃（D3 本地文件 network-error-*.log 已兜底，云端记录结构不变）。
// v1.4 审查修正：
//   1) 用裸 axios 直传（不经过 sv-request 拦截器）——避免 addList 失败被拦截器
//      重新入队 + 弹窗（旧实现会形成"每 30s 重试一次"的有界循环，且无限重试）；
//   2) flush 串行互斥（isFlushing），避免多链并发占 6 槽；
//   3) 队列上限 500，持续故障期丢弃新条目（D3 本地兜底）；
//   4) 不再依赖 utils.logUpload —— 消除 utils → sv-api → sv-request → batcher 循环依赖。
// 注意：仅网络错误（弹窗路径）走本模块；正常业务日志不受影响。

import axios from "axios";
import { platTokens } from "@/store/platTokens";

const BATCH_MAX = 20; // 满 20 条立即触发
const FLUSH_INTERVAL_MS = 30 * 1000; // 30s 窗口
const QUEUE_LIMIT = 500; // 队列上限（持续故障且上传全挂时丢弃新条目）
const UPLOAD_TIMEOUT_MS = 15000; // 单次上传超时（失败即弃，不重试）

const IS_DEV = process.env.NODE_ENV === "development";
const ADD_LIST_URL = IS_DEV
  ? "/svpi/operaRecord/addList"
  : "http://47.113.191.173:3000/svpi/operaRecord/addList";

let queue = [];
let timer = null;
let isFlushing = false; // flush 串行互斥（防多链并发占 6 槽）

/**
 * 网络错误日志入队（攒批）
 * @param {Object} order - 上传参数 { plat_name, app_name, order_number, type }
 * @param {Array} logList - 与 logUpload 的 logList 条目结构一致（info.error 已由拦截器 formatErrInfo）
 */
export const enqueueNetworkError = (order = {}, logList = []) => {
  if (!logList.length) return;
  if (queue.length >= QUEUE_LIMIT) return; // 超限丢弃（D3 本地已兜底）
  queue.push({ order, logList });
  if (queue.length >= BATCH_MAX) {
    flush();
    return;
  }
  if (!timer) {
    timer = setTimeout(flush, FLUSH_INTERVAL_MS);
  }
};

/**
 * 立即冲刷队列（定时器到期 / 满批触发 / 重排）
 * 顺序上传（保持日志时序）；单条失败静默（D3 本地兜底），不重试不入队
 */
const flush = async () => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length || isFlushing) return;
  isFlushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    for (const { order, logList } of batch) {
      try {
        await uploadOne(order, logList);
      } catch (_) {
        /* 上传失败静默：D3 本地文件已记录，不追加请求 */
      }
    }
  } finally {
    isFlushing = false;
    // 冲刷期间又有入队 → 重排定时器（否则队列滞留到下次满批）
    if (queue.length) {
      timer = setTimeout(flush, FLUSH_INTERVAL_MS);
    }
  }
};

/**
 * 单条上传：裸 axios 直传（无拦截器 → 失败不会触发 sv-request 的
 * 落盘/弹窗/重试/重新入队，杜绝反馈循环）
 */
const uploadOne = async (order, logList) => {
  const { order_number = "", app_name = "", plat_name = "", type = 3 } = order;
  // 清理特殊表情，避免后端入库失败（与 utils.logUpload 行为一致）
  const cleaned = JSON.stringify(logList).replace(
    /[\u{1F600}-\u{1F64F}]/gu,
    ""
  );
  const token =
    platTokens().selfToken || localStorage.getItem("selfToken") || "";
  await axios.post(
    ADD_LIST_URL,
    {
      plat_name,
      app_name,
      order_number,
      type,
      log_list: JSON.parse(cleaned)
    },
    {
      timeout: UPLOAD_TIMEOUT_MS,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }
  );
};
