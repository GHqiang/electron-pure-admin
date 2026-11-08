// 场次短缓存 + 同请求合并（2026-11-08）
//
// 背景：上游限流期间，报价队列会对「同一影院 + 同一影片 + 同一日期」反复查询场次
// （同一单几分钟内重试多轮、同批次订单常命中同一场次），全部直打上游。
// 本模块做两件事，降低限流窗口内的无谓请求：
//   1) 短 TTL 缓存（默认 90 秒）：命中直接复用，避免重复请求
//   2) 同请求合并（single-flight）：并发相同 key 只发一次上游请求
//
// 设计要点：
// - 只缓存非空结果（shouldCache 可配）：空数组/异常不缓存，避免把一次限流失败固化住
// - 出票链路传 forceFresh=true 跳过缓存与合并，保证锁座前拿到实时排期
// - 逐条过期 + 惰性清理（无定时器）+ LRU 淘汰
// - 纯内存、无外部依赖，便于单测

const DEFAULT_TTL_MS = 90 * 1000; // 90 秒
const DEFAULT_MAX_SIZE = 200;

// key -> { value, expireAt }
const _cache = new Map();
// key -> Promise（同请求合并）
const _inflight = new Map();

/**
 * 生成场次缓存 key
 * 同一 app_name 下，影院 + 影片 + 日期唯一确定一批场次
 * @param {Object} parts
 * @param {string} parts.app_name
 * @param {string|number} [parts.cinemaCode]
 * @param {string|number} [parts.cinemaId]
 * @param {string|number} [parts.filmId]
 * @param {string} [parts.showDate]
 * @returns {string}
 */
export function buildShowTimeKey({
  app_name,
  cinemaCode,
  cinemaId,
  filmId,
  showDate
} = {}) {
  return [
    app_name || "",
    cinemaCode ?? "",
    cinemaId ?? "",
    filmId ?? "",
    showDate ?? ""
  ].join("|");
}

/**
 * 读取缓存（过期即删）
 * @param {string} key
 * @returns {Object|undefined}
 */
function getFromCache(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expireAt) {
    _cache.delete(key); // 惰性清理
    return undefined;
  }
  // LRU：访问后移到末尾
  _cache.delete(key);
  _cache.set(key, entry);
  return entry.value;
}

/**
 * 写入缓存（LRU 淘汰）
 * @param {string} key
 * @param {*} value
 * @param {number} ttlMs
 * @param {number} maxSize
 */
function setToCache(key, value, ttlMs, maxSize) {
  if (_cache.has(key)) _cache.delete(key);
  _cache.set(key, { value, expireAt: Date.now() + ttlMs });
  while (_cache.size > maxSize) {
    const oldestKey = _cache.keys().next().value;
    if (oldestKey === undefined) break;
    _cache.delete(oldestKey);
  }
}

/**
 * 带缓存与同请求合并地获取场次
 * @param {string} key - buildShowTimeKey 生成
 * @param {Function} fetcher - 实际请求函数，返回 Promise
 * @param {Object} [options]
 * @param {number} [options.ttlMs=90000] - 缓存有效期（毫秒）
 * @param {number} [options.maxSize=200] - 缓存最大条数
 * @param {boolean} [options.forceFresh=false] - 跳过缓存与合并（出票链路）
 * @param {Function} [options.shouldCache] - 判断结果是否值得缓存，默认非空数组
 * @returns {Promise<*>}
 */
export async function getShowTimeWithCache(
  key,
  fetcher,
  {
    ttlMs = DEFAULT_TTL_MS,
    maxSize = DEFAULT_MAX_SIZE,
    forceFresh = false,
    shouldCache = value => Array.isArray(value) && value.length > 0
  } = {}
) {
  if (!key || forceFresh) return fetcher();

  const cached = getFromCache(key);
  if (cached !== undefined) return cached;

  // 同请求合并：并发相同 key 复用同一个 Promise
  if (_inflight.has(key)) return _inflight.get(key);

  const task = (async () => {
    try {
      const value = await fetcher();
      if (shouldCache(value)) setToCache(key, value, ttlMs, maxSize);
      return value;
    } finally {
      _inflight.delete(key);
    }
  })();

  _inflight.set(key, task);
  return task;
}

/**
 * 清空缓存与在途请求记录（供单测/手动恢复使用）
 */
export function clearShowTimeCache() {
  _cache.clear();
  _inflight.clear();
}

/**
 * 缓存状态（诊断/单测用）
 */
export function getShowTimeCacheSize() {
  return _cache.size;
}
