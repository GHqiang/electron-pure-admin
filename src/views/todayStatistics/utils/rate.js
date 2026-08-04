// 统计比率/环比计算工具:分母为 0 一律返回 null,由展示层显示 "--",避免 0% / NaN / Infinity

// 比率:分子/分母,保留 digits 位小数;分母为 0 返回 null
export const rate = (numerator, denominator, digits = 4) => {
  if (!denominator) return null;
  return +(numerator / denominator).toFixed(digits);
};

// 百分率展示:"12.3%" 或 "--"
export const ratePercent = (numerator, denominator, digits = 1) => {
  const r = rate(numerator, denominator, digits + 2);
  return r === null ? "--" : `${(r * 100).toFixed(digits)}%`;
};

// 环比百分比:cur 或 base 为 null/0 返回 null
export const deltaPercent = (cur, base, digits = 1) => {
  if (cur === null || cur === undefined || base === null || base === undefined || base === 0) return null;
  return +(((cur - base) / base) * 100).toFixed(digits);
};

// 环比展示信息:返回 { text: "▲12%" / "▼5%", cls: "up" / "down" },无参照返回 null
export const deltaInfo = (cur, base, digits = 1) => {
  const d = deltaPercent(cur, base, digits);
  if (d === null) return null;
  return {
    text: `${d >= 0 ? "▲" : "▼"}${Math.abs(d)}%`,
    cls: d >= 0 ? "up" : "down"
  };
};

// 百分点差值:比率类指标(中标率/成功率)的环比用"百分点"而非百分比——
// 如中标率 9.2% → 10.1% 是 ▲0.9pp,说"▲9.8%"会误导。无参照返回 null
export const deltaPp = (cur, base, digits = 1) => {
  if (cur === null || cur === undefined || base === null || base === undefined) return null;
  return +((cur - base) * 100).toFixed(digits);
};

// 百分点环比展示信息:{ text: "▲0.9pp", cls: "up"|"down" }
export const deltaPpInfo = (cur, base, digits = 1) => {
  const d = deltaPp(cur, base, digits);
  if (d === null) return null;
  return {
    text: `${d >= 0 ? "▲" : "▼"}${Math.abs(d)}pp`,
    cls: d >= 0 ? "up" : "down"
  };
};

// 金额格式化:千分位,保留两位
export const fmtMoney = n => {
  const num = Number(n || 0);
  return Number(num.toFixed(2)).toLocaleString("zh-CN");
};
