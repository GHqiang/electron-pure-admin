/**
 * 乐影（SFC）券兑换比例解析
 *
 * 背景：
 * - 部分影院特殊厅晚场存在「同一种券 N 张抵 1 张票」的场景，比例配在报价规则上
 *   （rule_record.quanExchangeRatio，语义=每票消耗券张数，2 表示 2 张券兑 1 张票）。
 * - 老规则（DDL 前创建）该列为 NULL；旧 store 缓存 / 旧接口可能不带该字段；
 *   手工改库也可能出现脏值。
 * - 统一在此归一：**取不到或非法一律按 1（一票一券）**，保证老规则行为与上线前完全一致。
 *
 * 取数约定：
 * - 报价侧：rule.quanExchangeRatio（rule_record，camelCase）
 * - 出票侧：offerRule.quan_exchange_ratio（offer_record + 规则联表别名，snake_case）
 *
 * 使用约定：报价/出票的所有消费点只经本方法取值，禁止各自 Number(x) || 1
 * （那样会漏判 ""、2.5、-1、true 等情况）。
 *
 * @module common/quanPerTicket
 */

const DEFAULT_QUAN_PER_TICKET = 1;

/**
 * 获取「每票消耗券张数」
 * @param {Object} rule - 报价规则或出票 offerRule
 * @param {Object} [logger] - 可选日志实例（需支持 warn），仅对"有值但非法"打告警
 * @returns {number} 每票券张数，最小为 1
 */
export function getQuanPerTicket(rule, logger) {
  const raw = rule?.quanExchangeRatio ?? rule?.quan_exchange_ratio;
  // null/undefined：老规则、老订单、字段不存在（旧缓存/旧接口）→ 默认 1
  if (raw === null || raw === undefined) return DEFAULT_QUAN_PER_TICKET;
  // 空串/纯空白：表单清空后尚未落库的空值 → 默认 1
  if (typeof raw === "string" && raw.trim() === "") {
    return DEFAULT_QUAN_PER_TICKET;
  }
  const num = Number(raw);
  // 只接受正整数（含 "2" 这类数字字符串）；小数/0/负数/NaN/对象 → 回退 1
  if (Number.isInteger(num) && num >= 1) return num;

  logger?.warn?.(
    `券兑换比例非法，按1处理：ruleId=${
      rule?.id ?? rule?.offer_rule_id ?? ""
    }，值=${String(raw)}`
  );
  return DEFAULT_QUAN_PER_TICKET;
}

/**
 * 计算本次订单需要消耗的券张数
 * @param {number} ticketNum - 票数
 * @param {number} quanPerTicket - 每票券张数（getQuanPerTicket 结果）
 * @returns {number} 需要消耗的券张数
 */
export function calcNeedQuanNum(ticketNum, quanPerTicket) {
  const tickets = Number(ticketNum) || 0;
  const per = Number(quanPerTicket) || DEFAULT_QUAN_PER_TICKET;
  return tickets * per;
}

/**
 * 计算规则座位数目标值（券库存收缩用）
 *
 * 券库存单位是"张"，每票消耗 quanPerTicket 张，因此可支撑票数 = floor(库存 / N)，
 * 再受 4 席上限约束（与历史 `maxQuanStock >= 4 ? 4 : maxQuanStock` 口径一致）。
 *
 * @param {number} maxQuanStock - 单账号最大券库存（张）
 * @param {number} quanPerTicket - 每票消耗券张数（getQuanPerTicket 结果）
 * @returns {number} 目标座位数；0 表示无库存，调用方应把规则置为禁用
 */
export function calcTargetSeatNum(maxQuanStock, quanPerTicket) {
  const stock = Number(maxQuanStock) || 0;
  const per =
    Number.isInteger(Number(quanPerTicket)) && Number(quanPerTicket) >= 1
      ? Number(quanPerTicket)
      : 1;
  const effStock = Math.floor(stock / per);
  return effStock >= 4 ? 4 : effStock;
}

export default getQuanPerTicket;
