/**
 * 锁座重试配置
 *
 * 把各渠道分散的「最多重试次数 + 间隔秒数」集中到一处，便于统一调整。
 *
 * 使用方式（示例）：
 *   import { LOCK_SEAT_RETRY_CONFIG, getLockSeatRetryConfig } from "./retryConfig";
 *
 *   const [maxRetry, intervalSec] = getLockSeatRetryConfig(plat_name);
 *   const res = await trial(
 *     inx => this.seatManage.lockSeatHandle(params, inx),
 *     maxRetry,
 *     intervalSec,
 *   );
 */

/**
 * 平台锁座重试配置表
 * key 为 plat_name，value 为 [maxRetryTimes, intervalSeconds]
 */
export const LOCK_SEAT_RETRY_CONFIG = {
  // 通用出票平台
  lieren: [6, 5],
  mangguo: [6, 5],
  sheng: [6, 5],
  haha: [6, 5],
  yinghuasuan: [6, 5],
  shangzhan: [6, 5],

  // 第三方平台
  mayi: [10, 5],
  yangcong: [10, 5],

  // 直连/特殊平台
  shoutu: [20, 12],
  mahua: [10, 5]
};

/**
 * 获取某个平台的锁座重试配置
 * 若未配置，则返回默认值 [6, 5]
 *
 * @param {string} plat_name - 平台标识
 * @returns {[number, number]} [maxRetryTimes, intervalSeconds]
 */
export function getLockSeatRetryConfig(plat_name) {
  if (!plat_name) return [6, 5];
  return LOCK_SEAT_RETRY_CONFIG[plat_name] || [6, 5];
}

/**
 * 用券创建订单异常换券重试配置
 *
 * 当创建订单返回"优惠券优惠计算异常"或"券数量和票数量不一致"时，
 * 从备选券池换券重试。按备选池剩余量动态选择策略：
 * - 备选池 >= 票数：全量替换（整批换下一批），受 COUPON_RETRY_LIMIT 限制
 * - 备选池 < 票数但 > 0：逐个替换（定位坏券），受 COUPON_SINGLE_RETRY_LIMIT 限制
 */
// 全量替换重试上限（每批已整批验证，2 次足够）
export const COUPON_RETRY_LIMIT = 2;
// 逐个替换重试上限（需覆盖多座位多坏券场景，可按实际座位数调整）
export const COUPON_SINGLE_RETRY_LIMIT = 5;
