// 队列启动与自动恢复模块
// 用途：
//   1. startQueues：启动指定平台/影院队列的公共函数，一键启动（queueManage 页面）与崩溃自愈（主进程 reload 后）共用，
//      保证行为同源——报价队列启动前从 platOfferRuleTable（localStorage 持久化）读 platToken 写回 platTokens store
//      （供 haha/mangguo 等从 store 读 token 的请求层使用），否则 reload 后 store 为空 token 报价必失败。
//   2. autoRestoreQueues：渲染进程崩溃自愈后，按快照（localStorage("__queueSnapshot")）自动拉起崩溃前正在运行的队列。
// 说明：登录信息与平台 token 均在 localStorage，reload 后保留，无需重新登录。

import {
  offerQueueFactory,
  fetchOrderQueueFactory
} from "@/common/factories/QueueFactory.js";
import { getTicketQueue } from "@/common/autoTicket/comTicketHandle";
import { platTokens } from "@/store/platTokens";
import { usePlatTableDataStore } from "@/store/platOfferRuleTable";
import {
  getCinemaLoginInfoList,
  getCurrentTime,
  logUpload
} from "@/utils/utils";

const SNAPSHOT_KEY = "__queueSnapshot";

// 平台名 → platTokens store 的 token 设置 action 名
// 注意：与 queueManage 页面 setPlatFunObj 保持一致，若新增平台两处需同步维护
const PLAT_TOKEN_SETTERS = {
  lieren: "setLierenPlatToken",
  mangguo: "setMangguoPlatToken",
  mayi: "setMayiPlatToken",
  yangcong: "setYangcongPlatToken",
  yinghuasuan: "setYinghuasuanPlatToken",
  shangzhan: "setShangzhanPlatToken",
  haha: "setHahaPlatToken",
  sheng: "setShengPlatToken",
  shoutu: "setShoutuPlatToken",
  mahua: "setMahuaPlatToken",
  piaosheng: "setPiaoShengPlatToken"
};

/**
 * 读取崩溃前队列启动快照
 * @returns {{platOfferQueue: string[], appTicketQueue: string[], time: string}}
 */
export const getQueueSnapshot = () => {
  try {
    return JSON.parse(window.localStorage.getItem(SNAPSHOT_KEY) || "{}");
  } catch {
    return {};
  }
};

/**
 * 保存队列启动快照（崩溃后自动恢复用）
 * @param {string[]} platOfferQueue - 已启动报价/拉单队列的平台列表
 * @param {string[]} appTicketQueue - 已启动出票队列的影院列表
 */
export const saveQueueSnapshot = (platOfferQueue, appTicketQueue) => {
  const snapshot = {
    platOfferQueue,
    appTicketQueue,
    time: getCurrentTime()
  };
  try {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.error("保存队列启动快照失败", error);
  }
};

/**
 * 启动指定平台/影院的队列（一键启动与崩溃自愈共用，保证行为同源）
 * 报价/拉单队列：从 platOfferRuleTable store（localStorage 持久化）取 platToken，
 * 写回 platTokens store 后 start；无 token 的平台跳过。仅对已知平台生效（无 setter 则跳过）。
 * 出票队列：仅启动 loginInfoList 中有 session_id 的影院（与一键启动的过滤逻辑一致）。
 * @param {Object} opts
 * @param {string[]} [opts.platNames] - 需要启动报价/拉单队列的平台列表
 * @param {string[]} [opts.appNames] - 需要启动出票队列的影院列表
 * @param {boolean} [opts.startOffer=true] - 是否启动报价队列（测试模式开关，与页面一致）
 * @param {boolean} [opts.startFetch=true] - 是否启动拉单队列
 * @param {boolean} [opts.startTicket=true] - 是否启动出票队列
 * @returns {{startedOffer: string[], skippedOffer: {plat:string,reason:string,error?:string}[],
 *           startedTicket: string[], skippedTicket: {app:string,reason:string,error?:string}[]}}
 *  skipped 列表带原因和错误信息，便于远端日志直接定位失败根因，无需现场开 DevTools。
 */
export const startQueues = ({
  platNames = [],
  appNames = [],
  startOffer = true,
  startFetch = true,
  startTicket = true
} = {}) => {
  const tokens = platTokens();
  const tableDataStore = usePlatTableDataStore();
  const loginInfoList = getCinemaLoginInfoList();
  const startedOffer = [];
  const skippedOffer = [];
  const startedTicket = [];
  const skippedTicket = [];

  platNames.forEach(platName => {
    try {
      // 从持久化的平台规则表取 token（与一键启动同一数据源）
      const item = tableDataStore.items.find(i => i.platName === platName);
      const platToken = item?.platToken;
      const setter = PLAT_TOKEN_SETTERS[platName];
      if (!platToken || !setter) {
        console.warn(`[队列启动] 跳过无 token/未知平台的报价队列: ${platName}`);
        skippedOffer.push({ plat: platName, reason: "no_token_or_unknown_plat" });
        return;
      }
      // 写回 platTokens store：reload 后 store 初始为空，
      // haha/mangguo 等请求层直接读 store token，不写回则报价必失败
      tokens[setter](platToken);
      // 队列实例可能创建失败（工厂 catch 返回 null），实例都不存在时视为跳过
      const offerQueue = startOffer
        ? offerQueueFactory.getOfferQueue(platName)
        : null;
      const fetchQueue = startFetch
        ? fetchOrderQueueFactory.getFetchOrderQueue(platName)
        : null;
      if (!offerQueue && !fetchQueue) {
        console.warn(`[队列启动] 报价/拉单队列实例创建失败: ${platName}`);
        skippedOffer.push({ plat: platName, reason: "instance_create_failed" });
        return;
      }
      offerQueue?.start();
      fetchQueue?.start();
      startedOffer.push(platName);
    } catch (error) {
      console.error(`[队列启动] 报价队列启动失败: ${platName}`, error);
      skippedOffer.push({
        plat: platName,
        reason: "start_throw",
        error: String(error?.message || error)
      });
    }
  });

  appNames.forEach(appName => {
    try {
      const hasLogin = loginInfoList.some(
        item => item.app_name === appName && item.session_id
      );
      if (!hasLogin) {
        console.warn(`[队列启动] 跳过无登录信息的出票队列: ${appName}`);
        skippedTicket.push({ app: appName, reason: "no_login_info" });
        return;
      }
      startTicket && getTicketQueue(appName).start();
      startedTicket.push(appName);
    } catch (error) {
      console.error(`[队列启动] 出票队列启动失败: ${appName}`, error);
      skippedTicket.push({
        app: appName,
        reason: "start_throw",
        error: String(error?.message || error)
      });
    }
  });

  return { startedOffer, skippedOffer, startedTicket, skippedTicket };
};

/**
 * 自动恢复队列（崩溃自愈后调用）
 * 原则：
 * - 只重建并启动快照中记录的队列，不触发 svApi.updateUser 重复上报
 * - 启动逻辑与一键启动同源（startQueues），token 从持久化数据恢复
 * - 失败仅记日志，不影响页面
 * @param {string} [crashReason] - 崩溃原因（用于取证日志）
 * @returns {Promise<{restored: boolean, startedOffer: string[], startedTicket: string[]}>}
 *   restored=false 表示无快照（崩溃前未一键启动过），未执行恢复
 */
export const autoRestoreQueues = async (crashReason = "") => {
  const snapshot = getQueueSnapshot();
  const { platOfferQueue = [], appTicketQueue = [] } = snapshot;
  if (!platOfferQueue.length && !appTicketQueue.length) {
    // 无快照：崩溃前未一键启动过队列，记录一笔便于事后分析"为何未恢复"
    console.warn("[队列自动恢复] 无崩溃前队列快照，未执行恢复");
    logUpload({ plat_name: "", type: 1 }, [
      {
        opera_time: getCurrentTime(),
        des: "渲染进程崩溃自愈-队列自动恢复",
        level: "warn",
        info: {
          crashReason,
          restored: false,
          reason: "no_snapshot",
          recoverTime: getCurrentTime()
        }
      }
    ]).catch(error => console.error("[队列自动恢复] 取证日志上报失败", error));
    return { restored: false, startedOffer: [], startedTicket: [] };
  }
  console.warn(
    "[队列自动恢复] 检测到崩溃前队列快照，开始自动恢复",
    snapshot
  );

  // 与一键启动同源的启动逻辑（含 token 写回 platTokens store）
  const { startedOffer, skippedOffer, startedTicket, skippedTicket } =
    startQueues({
      platNames: platOfferQueue,
      appNames: appTicketQueue
    });

  // 恢复结果摘要：成功/失败计数 + 失败详情（带原因和错误信息）
  // expected 列表减去 started 即为未恢复的，与 skipped 对照可发现"既不在 started 也不在 skipped"的异常
  const summary = {
    crashReason,
    snapshotTime: snapshot.time,
    recoverTime: getCurrentTime(),
    expectedOffer: platOfferQueue,
    expectedTicket: appTicketQueue,
    startedOffer,
    startedTicket,
    skippedOffer, // [{plat, reason, error?}]
    skippedTicket, // [{app, reason, error?}]
    offerSuccess: `${startedOffer.length}/${platOfferQueue.length}`,
    ticketSuccess: `${startedTicket.length}/${appTicketQueue.length}`
  };
  console.warn("[队列自动恢复] 恢复结果", summary);

  // 取证上报：远端日志完整记录恢复结果（含 skipped 原因，便于事后分析失败根因）
  // fire-and-forget，不阻塞快照清除；上报失败仅记日志
  logUpload({ plat_name: "", type: 1 }, [
    {
      opera_time: getCurrentTime(),
      des: "渲染进程崩溃自愈-队列自动恢复",
      level: skippedOffer.length || skippedTicket.length ? "error" : "info",
      info: summary
    }
  ]).catch(error => console.error("[队列自动恢复] 取证日志上报失败", error));

  // 本地兜底落盘：远端日志上报可能失败，本地再留一份恢复结果（独立文件，与上传失败兜底日志区分开）
  // 便于现场无网络时也能分析恢复情况
  try {
    const ipcRenderer = window.ipcRenderer;
    if (ipcRenderer?.invoke) {
      const fileDate = todayStrCompact();
      ipcRenderer.invoke("save-fail-log", {
        fileDate,
        fileName: `queueRestore-${fileDate}.log`,
        content:
          JSON.stringify({
            time: getCurrentTime(),
            event: "queue_auto_restore",
            ...summary
          }) + "\n"
      }).catch(() => {});
    }
  } catch (e) {
    console.error("[队列自动恢复] 本地兜底落盘失败", e);
  }

  // 清除快照，避免下次正常启动重复拉起
  try {
    window.localStorage.removeItem(SNAPSHOT_KEY);
    console.warn("[队列自动恢复] 快照已清除，恢复流程结束");
  } catch (error) {
    console.error("[队列自动恢复] 清除快照失败", error);
  }

  return { restored: true, startedOffer, startedTicket };
};

// 紧凑日期 YYYYMMDD（与主进程 todayStr 一致，用于本地兜底日志文件名）
const todayStrCompact = () => {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};
