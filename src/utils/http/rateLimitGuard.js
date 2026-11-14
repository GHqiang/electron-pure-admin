/**
 * 上游限流识别 + 熔断（仅幸福蓝海系列，2026-11-08）
 *
 * 背景：幸福蓝海（辰星 3.0C「幸福看-自营」）高峰期限流返回
 * 「现在人太多了，请耐心等待一下下哦」，报价队列会以秒级频率持续重撞，
 * 造成「一条限流 → 数小时报错风暴 + 请求量翻倍」。
 *
 * 范围约定（2026-11-08 用户要求）：只作用于 app_name=xingfulanhai，
 * 其它辰星系列/其它平台行为完全不变。
 *
 * 本模块只做纯逻辑（不依赖 axios / Element Plus），便于单测：
 *  - isResilienceApp：是否目标系列
 *  - isBreakerGuardedUrl：是否只读查询（写接口永不快速失败）
 *  - isRateLimitedPayload：识别限流文案
 *  - createCircuitBreaker：窗口内计数 + 冷却 + 半开探针
 */

// 本次韧性整改作用对象（仅幸福蓝海主品牌）。
// 如需扩展到幸福蓝海其它子品牌（如 yonglesuzhou 和乐影院），在此加一项即可
const RESILIENCE_APP_NAMES = new Set(["xingfulanhai"]);

/**
 * 是否本次韧性整改的目标系列
 * @param {string} appName
 * @returns {boolean}
 */
export function isResilienceApp(appName) {
  return RESILIENCE_APP_NAMES.has(appName);
}

// 上游限流/排队文案：
// - 旧文案「现在人太多了，请耐心等待一下下哦」
// - 新文案（2026-11-13 起）「检测到访问异常，已触发限流保护，请规范操作…」
// - 兼容常见「系统繁忙/访问频繁」表述
const RATE_LIMIT_PATTERN =
  /人太多|请耐心等待|系统繁忙|访问过于频繁|请求过于频繁|活动太火爆|访问异常|限流保护/;

// 熔断只覆盖「报价/场次/座位布局」等只读查询（3.0C 路径均含 /cticket/）；
// 锁座/下单/支付/释放/取消等写接口（/trade/…）永不快速失败，避免座位残留、支付中断
const BREAKER_GUARDED_URL_PATTERN = /\/cticket\//i;

// 半开探针超时：必须大于请求超时（默认 20s），否则探针未返回时会再放一个
const HALF_OPEN_TIMEOUT_MS = 25 * 1000;

/**
 * 该 URL 是否属于熔断保护范围（只读查询）
 * @param {string} url
 * @returns {boolean}
 */
export function isBreakerGuardedUrl(url) {
  return BREAKER_GUARDED_URL_PATTERN.test(String(url || ""));
}

/**
 * 判断响应是否为上游限流/排队
 * 只认文案，不认 code/timestamp：3.0C 的 500 也可能是真实业务错误或登录失效，
 * 误判会把登录告警吃掉（2026-11-08 评审 I6）
 * @param {Object} data - 上游响应体
 * @returns {boolean}
 */
export function isRateLimitedPayload(data) {
  if (!data) return false;
  const msg = data.msg || data.retMsg || data.message || data.info || "";
  return typeof msg === "string" && RATE_LIMIT_PATTERN.test(msg);
}

/**
 * 构造带限流标记的错误对象（保留上游原始字段，便于日志追溯）
 * @param {Object} data - 上游响应体
 * @param {string} appName - 连锁标识
 * @returns {Object}
 */
export function buildRateLimitedError(data, appName) {
  return {
    ...(data || {}),
    isRateLimited: true,
    app_name: appName
  };
}

/**
 * 创建按 key 计数的熔断器
 *
 * 行为：
 *  - 窗口 windowMs 内累计 threshold 次限流 → 打开 cooldownMs 冷却（调用方快速失败）
 *  - 冷却结束只放一个「半开探针」；探针成功（任何非限流完成）关闭，再次限流重新冷却
 *  - 冷却期内的在途成功不会提前关闭；未熔断时的成功也不清零（按窗口计数，
 *    避免「限流中夹一次成功」导致熔断永远开不起来，2026-11-08 评审 P1）
 *
 * @param {Object} [options]
 * @param {number} [options.threshold=5] - 窗口内限流次数阈值
 * @param {number} [options.cooldownMs=60000] - 冷却时长（毫秒）
 * @param {number} [options.windowMs=120000] - 计数窗口（毫秒）
 * @param {Function} [options.now] - 取当前时间（单测注入）
 * @returns {Object} 熔断器
 */
export function createCircuitBreaker({
  threshold = 5,
  cooldownMs = 60 * 1000,
  windowMs = 2 * 60 * 1000,
  now = () => Date.now()
} = {}) {
  const states = new Map();

  const getState = key => {
    if (!states.has(key)) {
      states.set(key, {
        failCount: 0,
        windowStart: 0,
        openUntil: 0,
        halfOpen: false,
        probeAt: 0
      });
    }
    return states.get(key);
  };

  return {
    /**
     * 是否处于「快速失败」状态（仅对只读查询调用）
     * 冷却结束后的第一次调用会放行（返回 false）并登记半开探针
     * @param {string} key
     * @returns {boolean}
     */
    isOpen(key) {
      const st = getState(key);
      if (!st.openUntil) return false;
      const ts = now();
      if (ts < st.openUntil) return true;
      // 冷却结束：放一个探针；探针卡住超过 HALF_OPEN_TIMEOUT_MS 再放一个
      if (!st.halfOpen || ts - st.probeAt > HALF_OPEN_TIMEOUT_MS) {
        st.halfOpen = true;
        st.probeAt = ts;
        return false;
      }
      return true;
    },

    /**
     * 记录一次限流
     * @param {string} key
     */
    onRateLimited(key) {
      const st = getState(key);
      const ts = now();
      // 窗口外重新计数：几小时内零星的限流不应累加触发熔断
      if (!st.windowStart || ts - st.windowStart > windowMs) {
        st.windowStart = ts;
        st.failCount = 0;
      }
      st.failCount += 1;
      if (st.halfOpen || st.failCount >= threshold) {
        st.openUntil = ts + cooldownMs;
        st.halfOpen = false;
        st.probeAt = 0;
      }
    },

    /**
     * 记录一次「非限流」的完成（HTTP 响应/网络错误）
     * - 冷却期内：忽略（避免在途成功把刚打开的熔断提前关掉）
     * - 半开探针：清零并恢复正常放行
     * - 未熔断：不清零，计数交给窗口（评审 P1）
     * @param {string} key
     */
    onNonRateLimited(key) {
      const st = states.get(key);
      if (!st) return;
      if (st.openUntil && now() < st.openUntil) return;
      if (st.halfOpen) states.delete(key);
    },

    /**
     * 读取状态（诊断/日志用）
     * @param {string} key
     * @returns {Object}
     */
    getState(key) {
      const st = getState(key);
      return {
        failCount: st.failCount,
        windowStart: st.windowStart,
        openUntil: st.openUntil,
        halfOpen: st.halfOpen
      };
    },

    /**
     * 是否处于打开状态（不触发半开登记，供只读诊断）
     * @param {string} key
     * @returns {boolean}
     */
    isCoolingDown(key) {
      const st = states.get(key);
      return !!st && now() < st.openUntil;
    },

    /**
     * 重置（单测/手动恢复用）
     * @param {string} [key] - 不传则全部重置
     */
    reset(key) {
      if (key === undefined) states.clear();
      else states.delete(key);
    }
  };
}
