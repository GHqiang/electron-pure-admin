// 队列拉单心跳告警公共逻辑（2026-08-23）
// 供 BaseOrderFetcher（待出票拉单）与 BaseOfferQueue（待报价拉单）复用：
// 1. 心跳静默检测：调用方每轮拉单完成后刷新 owner.lastFetchTime，本模块定时检查——
//    队列仍在运行但超过阈值未拉单（队列停止/循环卡死/网络全断，无任何拉单行为与日志）
//    则微信推送告警（msgType=12 待出票 / 13 待报价）；
// 2. 连续拉单失败检测：调用方每轮拉单完成后比对平台级 logger 中"获取...列表异常"
//    类 error 日志的新增数量，连续失败超过阈值（请求超时/网络异常但循环仍在跑）
//    则微信推送告警（msgType=14 拉单连续失败）。
// 两类告警共用 30 分钟冷却防刷屏。

import { sendWxPusherMessage } from "@/utils/utils.js";

// 检测阈值（2026-08-23 用户要求：10 分钟改为 5 分钟）：
// 正常轮询 5 秒/轮（报价队列间隔可配），超过以下阈值未刷新/连续失败视为异常
const FETCH_ALARM_IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 分钟无拉单日志判定异常
const FETCH_ALARM_CHECK_INTERVAL_MS = 60 * 1000; // 心跳检查间隔 1 分钟
const FETCH_ALARM_COOLDOWN_MS = 30 * 60 * 1000; // 同队列告警冷却 30 分钟，防刷屏
// 拉单失败日志特征：各平台 adapter/fetcher 拉单失败统一 errorSave("获取...列表异常...")，
// 订单处理失败（"提交报价异常"等）不匹配该特征，用于无噪音区分"拉单失败"
const FETCH_FAIL_DES_RE = /获取.+列表异常/;

/**
 * 统计 logger.logList 中"拉单失败"类 error 日志数量（按 des 特征匹配）
 * @param {Object} [logger] - Logger 实例（平台级/适配器级，可能为 undefined）
 * @returns {number}
 */
export const countFetchFailLogs = logger => {
  if (!logger?.logList) return 0;
  return logger.logList.filter(
    log => log?.level === "error" && FETCH_FAIL_DES_RE.test(log.des || "")
  ).length;
};

/**
 * 启动拉单心跳监控（幂等：已启动则忽略）
 * @param {Object} owner - 队列实例，需具备 platName / isRunning / isTestOrder /
 *   lastFetchTime / _fetchAlarmTimer / _lastFetchAlarmTime / _consecutiveFetchFailStart
 *   字段（监控相关字段若未初始化将在此强制补齐，避免接入方遗漏导致监控静默失效）
 * @param {number} msgType - 微信消息类型（12-待出票队列无拉单日志 13-待报价队列无拉单日志）
 * @param {string} label - 队列名称（"待出票"/"待报价"），用于告警文案
 * @param {number} [failMsgType=14] - 连续拉单失败告警的消息类型（默认 14-拉单连续失败）
 */
export const startFetchAlarmMonitor = (
  owner,
  msgType,
  label,
  failMsgType = 14
) => {
  if (owner._fetchAlarmTimer) return;
  // 强制补齐监控状态字段（防御接入方遗漏初始化）
  if (!owner.lastFetchTime) owner.lastFetchTime = Date.now();
  if (!owner._lastFetchAlarmTime) owner._lastFetchAlarmTime = 0;
  if (!owner._consecutiveFetchFailStart) owner._consecutiveFetchFailStart = 0;
  owner._fetchAlarmTimer = setInterval(() => {
    checkFetchAlarm(owner, msgType, label, failMsgType);
  }, FETCH_ALARM_CHECK_INTERVAL_MS);
};

/**
 * 拉单心跳检查：超阈值未拉单 / 连续拉单失败 且队列仍在运行 → 微信推送告警
 * @param {Object} owner - 队列实例（见 startFetchAlarmMonitor）
 * @param {number} msgType - 静默告警的微信消息类型
 * @param {string} label - 队列名称
 * @param {number} failMsgType - 连续失败告警的微信消息类型
 */
export const checkFetchAlarm = async (
  owner,
  msgType,
  label,
  failMsgType = 14
) => {
  if (!owner.isRunning) return;
  // 测试模式队列不推送告警（开发调试场景，避免微信消息噪音）
  if (owner.isTestOrder) return;
  const now = Date.now();
  // 告警冷却：同队列 30 分钟内不重复推送（静默/连续失败共用）
  if (
    owner._lastFetchAlarmTime &&
    now - owner._lastFetchAlarmTime < FETCH_ALARM_COOLDOWN_MS
  ) {
    return;
  }
  // 场景 1：连续拉单失败（请求超时/网络异常但循环仍在跑，心跳正常刷新）
  if (
    owner._consecutiveFetchFailStart &&
    now - owner._consecutiveFetchFailStart >= FETCH_ALARM_IDLE_THRESHOLD_MS
  ) {
    owner._lastFetchAlarmTime = now;
    const failMin = Math.floor(
      (now - owner._consecutiveFetchFailStart) / 60000
    );
    sendWxPusherMessage({
      app_name: owner.platName,
      orderInfo: { plat_name: owner.platName },
      msgType: failMsgType,
      transferTip: `${owner.platName}平台${label}队列拉单已连续失败 ${failMin} 分钟（请求超时/网络异常，但队列仍在运行），请检查该平台网络连接与登录状态，必要时重启队列。`
    }).catch(() => {});
    return;
  }
  // 场景 2：心跳静默（队列停止/卡死/网络全断，无任何拉单行为）
  const idleMs = now - (owner.lastFetchTime || now);
  if (idleMs < FETCH_ALARM_IDLE_THRESHOLD_MS) return;
  owner._lastFetchAlarmTime = now;
  const idleMin = Math.floor(idleMs / 60000);
  sendWxPusherMessage({
    app_name: owner.platName,
    orderInfo: { plat_name: owner.platName },
    msgType,
    transferTip: `${owner.platName}平台${label}队列已连续 ${idleMin} 分钟未产生拉单日志，队列可能已停止、卡死或网络完全中断，请检查该平台网络与${label}队列状态，必要时重启队列。`
  }).catch(() => {});
};

/**
 * 停止拉单心跳监控（清理定时器）
 * @param {Object} owner - 队列实例
 */
export const stopFetchAlarmMonitor = owner => {
  if (owner._fetchAlarmTimer) {
    clearInterval(owner._fetchAlarmTimer);
    owner._fetchAlarmTimer = null;
  }
};
