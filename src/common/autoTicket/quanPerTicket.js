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
// 兑换比例上限：TINYINT UNSIGNED 支持 255，业务上 1-20 已远超实际（避免误填造成巨额取券）
export const QUAN_RATIO_MAX = 20;

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
  // 空串/纯空白：表单清空后尚未落库的空值 → 默认 1（不告警）
  if (typeof raw === "string" && raw.trim() === "") {
    return DEFAULT_QUAN_PER_TICKET;
  }
  // 类型守卫：只接受 number 或非空字符串。
  // 布尔/对象/数组等真值不能进 Number()——Number(true) === 1 会被误判为合法正整数。
  const isNumericString = typeof raw === "string";
  if (typeof raw !== "number" && !isNumericString) {
    logger?.warn?.(
      `券兑换比例类型非法，按1处理：ruleId=${
        rule?.id ?? rule?.offer_rule_id ?? ""
      }，类型=${typeof raw}`
    );
    return DEFAULT_QUAN_PER_TICKET;
  }
  const num = Number(isNumericString ? raw.trim() : raw);
  // 只接受正整数（含 "2" 这类数字字符串）；小数/0/负数/NaN → 回退 1
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

/**
 * 校验用户输入/待落库的券兑换比例是否可配置
 *
 * 规则（与规则弹窗显隐条件保持一致，但这里是"保存前的最后一道闸"）：
 * - 留空：合法，表示不配置（返回 value = null）
 * - 已同步猎人平台：不支持（平台会按 1:1 报价，出票按 N:1 会系统性转单）
 * - 多券类型（quanValue 数量 > 1）：不支持（座位数收缩按单一券类型匹配）
 * - 非 1-QUAN_RATIO_MAX 的整数：不支持
 *
 * @param {Object} params
 * @param {number|string} params.ratio - 用户输入的比例
 * @param {number} params.quanValueCount - 规则选中的券类型数量
 * @param {boolean} params.isLierenSynced - 规则是否已同步猎人平台
 * @returns {{ok:boolean, value?:number|null, reason?:string}}
 *   reason: "range" | "lieren_synced" | "multi_quan_type"
 */
export function validateQuanRatioInput({
  ratio,
  quanValueCount = 0,
  isLierenSynced = false
}) {
  if (ratio === "" || ratio === null || ratio === undefined) {
    return { ok: true, value: null };
  }
  // 类型守卫：布尔/对象等真值不能进 Number()（Number(true) === 1 会被当成合法值）
  if (typeof ratio !== "number" && typeof ratio !== "string") {
    return { ok: false, reason: "range" };
  }
  const num = Number(typeof ratio === "string" ? ratio.trim() : ratio);
  if (!Number.isInteger(num) || num < 1 || num > QUAN_RATIO_MAX) {
    return { ok: false, reason: "range" };
  }
  if (isLierenSynced) {
    return { ok: false, reason: "lieren_synced" };
  }
  if (Number(quanValueCount) > 1) {
    return { ok: false, reason: "multi_quan_type" };
  }
  return { ok: true, value: num };
}

/**
 * 构造「用券价格校验」的券列表入参
 *
 * 背景：`useQuanOrCard` 返回体没有 `useQuan` 字段，基类 `validateCouponPrice`
 * 在空列表时直接放行（该校验对 SFC 券单此前从未生效）。
 * 这里按比例规则限定启用范围，避免存量"券只抵部分、余款另付"场景突然开始转单。
 *
 * @param {Object} params
 * @param {string} params.couponNums - useRes.coupon_nums（真实核销券码，逗号分隔）
 * @param {string} params.quanCode - useRes.quan_code（线下券码，逗号分隔）
 * @param {number} params.ratio - 券兑换比例
 * @returns {string[]} 比例 > 1 时返回真实券码列表，否则返回空数组（保持原行为）
 */
export function buildCouponCheckList({ couponNums, quanCode, ratio }) {
  if (!(Number(ratio) > 1)) return [];
  return String(couponNums || quanCode || "")
    .split(",")
    .filter(Boolean);
}

export default getQuanPerTicket;
