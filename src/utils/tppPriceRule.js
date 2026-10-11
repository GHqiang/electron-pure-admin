// 原价（tpp_price）报区间：解析、判定、格式化、校验
//
// 背景：运营按订单原价（tpp_price）过滤报价规则——原价落在配置区间内才报，
// 不在区间内则剔除该规则；未配置 = 不限制。
// 存储为 rule_record.offerTppRange，单字符串「下限-上限」（闭区间，含端点）：
//   50-80   50 ≤ 原价 ≤ 80
//   50-     原价 ≥ 50（上限空 = 正无穷）
//   -80     原价 ≤ 80（下限空 = 0）
//   -       原价 ≥ 0（等价"不限制"）
//   NULL/空 未配置 → 不限制
//
// 说明：纯函数、无 store 依赖，便于单测；不复用 calculateMarkup（那是加价链路，
// 且其区间操作符 <> / !<> 实现有误）。
const RANGE_RE = /^\s*(-?\d+(?:\.\d+)?)?\s*-\s*(-?\d+(?:\.\d+)?)?\s*$/;

/**
 * 解析原价报区间
 * @param {string} rangeStr - 形如 "50-80" / "50-" / "-80" / "-"
 * @returns {{configured: boolean, invalid?: boolean, reason?: string, min?: number, max?: number}}
 */
export const parseOfferTppRange = rangeStr => {
  if (rangeStr === null || rangeStr === undefined) return { configured: false };
  const str = String(rangeStr).trim();
  if (!str) return { configured: false };
  const match = str.match(RANGE_RE);
  if (!match) {
    return { configured: true, invalid: true, reason: "格式无法识别" };
  }
  const min = match[1] !== undefined ? Number(match[1]) : 0;
  const max = match[2] !== undefined ? Number(match[2]) : Infinity;
  // 上下限颠倒视为非法，避免"看起来配了其实不生效"
  if (min > max) {
    return { configured: true, invalid: true, reason: "下限不能大于上限" };
  }
  return { configured: true, invalid: false, min, max };
};

/**
 * 判断原价是否在报区间内（true = 保留该规则 / 照报）
 * @param {number|string} tppPrice - 订单原价
 * @param {string} rangeStr - 报区间表达式
 * @returns {boolean}
 */
export const isTppPriceInOfferRange = (tppPrice, rangeStr) => {
  const price = Number(tppPrice);
  // 原价缺失/非数值/非正数：一律放行，避免字段缺失导致大面积不报价
  if (!Number.isFinite(price) || price <= 0) return true;
  const parsed = parseOfferTppRange(rangeStr);
  // 未配置 / 配置非法：一律放行（不因配置问题停报）
  if (!parsed.configured || parsed.invalid) return true;
  return price >= parsed.min && price <= parsed.max;
};

/**
 * 报区间转人话（列表/详情回显）
 * @param {string} rangeStr - 报区间表达式
 * @returns {string} 如 "原价50~80" / "原价≥50" / "原价≤80" / "不限"；未配置返回空串
 */
export const formatOfferTppRange = rangeStr => {
  const parsed = parseOfferTppRange(rangeStr);
  if (!parsed.configured) return "";
  if (parsed.invalid) return `配置无效:${String(rangeStr).trim()}`;
  const { min, max } = parsed;
  if (min === 0 && max === Infinity) return "不限";
  if (max === Infinity) return `原价≥${min}`;
  if (min === 0) return `原价≤${max}`;
  return `原价${min}~${max}`;
};

/**
 * 保存前校验
 * @param {string} rangeStr - 报区间表达式
 * @returns {{ok: boolean, msg: string}}
 */
export const validateOfferTppRange = rangeStr => {
  const parsed = parseOfferTppRange(rangeStr);
  if (parsed.configured && parsed.invalid) {
    return {
      ok: false,
      msg: `原价报区间${parsed.reason}：${String(rangeStr).trim()}；格式为 下限-上限（如 50-80 / 50- / -80），闭区间含端点，端点可留空（下限留空=0，上限留空=正无穷）`
    };
  }
  return { ok: true, msg: "" };
};
