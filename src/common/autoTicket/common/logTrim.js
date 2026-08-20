// 日志裁剪器（V3 L2：08-18 写入体积整改方案 §3.1）
// 大对象打点统一改走摘要：完整订单/响应只留业务定位字段，避免 10~100KB 的
// 全量对象（卡列表/座位/规则/响应）直传 L2 明细，单用户单日 trace 落盘从
// 数百 MB 级降回设计预期（1G/用户/天 → 每单 30~60KB）。
// 引用：doc/plans/2026-08-18-报价出票日志写入体积整改方案.md

/**
 * 订单摘要：只留业务定位字段（与 serOrderInfo 字段集一致，保证排查字段齐全）
 * @param {Object} order - 完整订单对象
 * @returns {Object} 摘要对象（order 为空时返回空对象）
 */
const trimOrderForLog = order => {
  if (!order || typeof order !== "object") return {};
  return {
    order_number: order.order_number,
    plat_name: order.plat_name,
    app_name: order.app_name,
    cinema_name: order.cinema_name,
    hall_name: order.hall_name,
    film_name: order.film_name,
    show_time: order.show_time,
    ticket_num: order.ticket_num,
    tpp_price: order.tpp_price,
    supplier_end_price: order.supplier_end_price,
    lockseat: order.lockseat,
    offer_end_time: order.offer_end_time
  };
};

/**
 * 接口响应摘要：只留结果判定字段
 * @param {Object} res - 完整接口响应
 * @returns {Object} 摘要对象（res 为空时返回空对象）
 */
const trimResForLog = res => {
  if (!res || typeof res !== "object") return {};
  return {
    success: res?.success,
    msg: res?.msg,
    order_status: res?.order_status,
    quote_id: res?.data?.quote_id,
    qrcode: res?.qrcode,
    profit: res?.profit,
    card_id: res?.card_id
  };
};

/**
 * 会员卡摘要：每张卡只留 4 个关键字段（08-06 方案 §3.1.7）
 * @param {Object} card - 完整会员卡对象
 * @returns {Object} 摘要对象（card 为空时返回空对象）
 */
const trimCardForLog = card => {
  if (!card || typeof card !== "object") return {};
  return {
    mobile: card.mobile,
    card_num: card.card_num,
    daily_usage: card.daily_usage,
    monthly_usage: card.monthly_usage
  };
};

/**
 * 报价规则摘要：每条规则只留 11 个关键字段（08-06 方案 §3.1.7）
 * @param {Object} rule - 完整报价规则
 * @returns {Object} 摘要对象（rule 为空时返回空对象）
 */
const trimRuleForLog = rule => {
  if (!rule || typeof rule !== "object") return {};
  return {
    id: rule.id,
    ruleName: rule.ruleName,
    offerType: rule.offerType,
    offerAmount: rule.offerAmount,
    addAmount: rule.addAmount,
    quanValue: rule.quanValue,
    memberDay: rule.memberDay,
    seatNum: rule.seatNum,
    film_type: rule.film_type,
    includeCinemaCodes: rule.includeCinemaCodes,
    allow_offer_time: rule.allow_offer_time
  };
};

/**
 * 影片信息摘要：targetShow 展开对象可达数十 KB，只留场次定位字段（各系列字段名略有差异，兜底取常见名）
 * @param {Object} movie - 完整影片/场次信息对象
 * @returns {Object} 摘要对象（movie 为空时返回空对象）
 */
const trimMovieForLog = movie => {
  if (!movie || typeof movie !== "object") return {};
  return {
    filmId: movie.filmId ?? movie.film_id ?? "",
    filmName: movie.filmName ?? movie.film_name ?? "",
    hallName: movie.hallName ?? movie.hall_name ?? "",
    startTime: movie.startTime ?? movie.start_time ?? "",
    showTime: movie.showTime ?? movie.show_time ?? "",
    scheduleId: movie.scheduleId ?? movie.schedule_id ?? "",
    scheduleKey: movie.scheduleKey ?? movie.schedule_key ?? "",
    cinemaLinkId: movie.cinemaLinkId ?? movie.cinema_link_id ?? "",
    filmVersion: movie.filmVersion ?? movie.film_version ?? ""
  };
};

/**
 * 通用摘要：深度 5 / 数组 ≤10 项 / 字符串 ≤200 字符（兜底裁剪，防止漏网大对象）
 * @param {*} v - 任意值
 * @param {Object} [options] - { depth?: number, arrMax?: number, strMax?: number }
 * @returns {*} 摘要值
 */
const summarizeForLog = (v, options = {}) => {
  const { depth = 5, arrMax = 10, strMax = 200 } = options;
  const walk = (val, d) => {
    if (d > depth) return "[MaxDepth]";
    if (val === null || val === undefined) return val;
    const t = typeof val;
    if (t === "string") {
      return val.length > strMax ? val.slice(0, strMax) + "…" : val;
    }
    if (t === "number" || t === "boolean" || t === "bigint") return val;
    if (Array.isArray(val)) {
      if (val.length > arrMax) {
        return [
          ...val.slice(0, arrMax).map(x => walk(x, d + 1)),
          `…共${val.length}项`
        ];
      }
      return val.map(x => walk(x, d + 1));
    }
    if (t === "object") {
      const out = {};
      for (const k of Object.keys(val)) {
        out[k] = walk(val[k], d + 1);
      }
      return out;
    }
    return String(val);
  };
  try {
    return walk(v, 0);
  } catch {
    return { _summarizeFailed: true };
  }
};

export {
  summarizeForLog,
  trimOrderForLog,
  trimResForLog,
  trimCardForLog,
  trimRuleForLog,
  trimMovieForLog
};
