/**
 * 手动换座（仅取票码模式）的纯函数工具
 *
 * 只放不依赖 Vue/Pinia/网络的逻辑，便于单测覆盖：
 * - 座位串解析/原座位回填
 * - 仅在取票码模式下写回 ticket_record 的 patch
 * - 重新出票成功的记录补充字段
 * - 出票队列启动状态判断
 * - 取票码事件与待等订单的匹配
 */

/**
 * 解析人工输入的座位串。
 * 支持「3排7座 / 3排7号 / 3排7」，多个座位用中英文逗号、分号、顿号或空格分隔。
 * 非法项返回空串，由调用方统一拦截并提示。
 * @param {string} raw
 * @returns {string[]} 归一化后的座位串，如 ["3排7座", "3排8座"]
 */
export function parseSeatText(raw) {
  return String(raw || "")
    .split(/[,，;；、\s]+/)
    .filter(Boolean)
    .map(text => {
      const matched = text.match(/^(\d+)\s*排\s*(\d+)\s*(?:座|号)?$/);
      return matched ? `${matched[1]}排${matched[2]}座` : "";
    });
}

/**
 * 计算换座前真正的原座位。
 * 内存快照会被复用：第一次换座后 order.lockseat 已是目标座位，
 * 再次换座时必须优先保留上一次记录的 seatChangedFrom，避免把上次目标当原座位。
 * @param {Object} params
 * @param {string} [params.lockseat] - 当前快照/订单上的座位
 * @param {string} [params.seatChangedFrom] - 之前记录的原座位
 * @param {string} [params.fallback] - 快照无座位时用列表行兜底
 * @returns {{origin: string, seatChangedFrom: string}}
 */
export function resolveSeatChangeOrigin({
  lockseat,
  seatChangedFrom,
  fallback
} = {}) {
  const origin = seatChangedFrom || lockseat || fallback || "";
  return {
    origin,
    seatChangedFrom: seatChangedFrom || origin
  };
}

/**
 * 换座出票成功后写回出票记录的 patch。
 * 只取票码模式不上传平台，但本地记录必须落 qrcode / order_status / 新座位，
 * 否则列表仍显示原座位，异步取码时记录还会停在失败状态。
 * @param {Object} params
 * @param {string} params.orderNumber
 * @param {string} params.platName
 * @param {string} params.qrcode
 * @param {string} [params.lockseat]
 * @returns {{whereObj: Object, updateObj: Object}|null}
 */
export function buildOnlyTicketCodeRecordPatch({
  orderNumber,
  platName,
  qrcode,
  lockseat
} = {}) {
  if (!orderNumber || !platName || !qrcode) return null;
  const updateObj = {
    qrcode,
    order_status: 1,
    err_msg: "换座出票成功（未上传平台）",
    err_info: ""
  };
  // 没拿到座位时不要写空串，避免把记录里已有的座位清掉
  if (lockseat) updateObj.lockseat = lockseat;
  return {
    whereObj: {
      order_number: orderNumber,
      plat_name: platName
    },
    updateObj
  };
}

/**
 * 重新出票成功时补充分阶段字段：
 * - lockseat：换座后的真实座位（自动换座重新出票也适用）
 * - err_info：成功时清空上一次失败的诊断信息
 * @param {Object} updateObj - 原有更新字段
 * @param {Object} order
 * @returns {Object}
 */
export function withAgainSuccessRecordExtras(updateObj, order) {
  const extras = {
    err_info: ""
  };
  // 没拿到座位时不要写空串，避免把记录里已有的座位清掉
  if (order?.lockseat) extras.lockseat = order.lockseat;
  return {
    ...updateObj,
    ...extras
  };
}

/**
 * 判断某院线的出票队列是否已启动（可接收 newOrder_* 事件）。
 * 队列未启动时派发事件会静默丢失，但页面已经把记录置为 5，订单会卡住。
 * @param {Object} order - 含 app_name 或 appName
 * @param {Map} registry - window.__ticketQueueRegistry
 * @returns {boolean}
 */
export function isTicketQueueRunningForOrder(order, registry) {
  const appFlag = order?.app_name || order?.appName;
  if (!appFlag) return false;
  if (!registry || typeof registry.get !== "function") return false;
  const queue = registry.get(appFlag);
  return !!queue?.isStart;
}

/**
 * 在待等取票码的订单集合里匹配事件。
 * 影划算/票圣/麻花的记录里 order_number 是报价单号、出票单号在 plat_order_sn，
 * 事件可能只带其中一个，因此两个都要匹配。
 * @param {Set<string>} watchedOrders
 * @param {string} orderNumber
 * @param {string} platOrderSn
 * @returns {string} 命中的 watch key；未命中返回空串
 */
export function matchCodeWatchKey(watchedOrders, orderNumber, platOrderSn) {
  if (!watchedOrders || typeof watchedOrders.has !== "function") return "";
  const orderKey = orderNumber ? String(orderNumber) : "";
  const platOrderSnKey = platOrderSn ? String(platOrderSn) : "";
  if (orderKey && watchedOrders.has(orderKey)) return orderKey;
  if (platOrderSnKey && watchedOrders.has(platOrderSnKey)) {
    return platOrderSnKey;
  }
  return "";
}
