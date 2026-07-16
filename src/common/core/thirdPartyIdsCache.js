// 第三方 ID 缓存本地进程内 LRU 缓存
// 作用：减少 tryGetCachedThirdPartyIds 对后端 /offer-record/cached-ids 的重复查询
// 核心定位：后端缓存的"热数据子集"，本地未命中仍需查后端
//
// 设计要点：
// - 只缓存命中结果（null 不缓存），避免首单写入 third_party_ids 后被本地 null 挡住
// - 逐条过期（每条各自 6 小时有效期），惰性清理（无定时器）
// - LRU 淘汰（超容量淘汰最近最少访问）
// - 参数从 sys_dict 字典表读取，60 秒查一次字典（避免每单查字典接口）
// - 异常不缓存（避免异常状态被缓存）

import svApi from "@/api/sv-api";

// 默认值（字典读取失败时兜底）
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 小时
const DEFAULT_MAX_SIZE = 2000;

// 字典配置缓存（60 秒查一次，避免每单都查字典接口）
const DICT_CACHE_TTL_MS = 60 * 1000;
let _dictConfigCache = null;

/**
 * 读取字典配置（带 60 秒缓存）
 * 字典项：
 * - third_party_ids_cache_ttl  : 本地缓存有效期(毫秒)，默认 21600000(6小时)
 * - third_party_ids_cache_size : 本地缓存最大条数，默认 2000
 * @returns {Promise<{ttlMs: number, maxSize: number}>}
 */
async function getDictConfig() {
  const now = Date.now();
  if (_dictConfigCache && now - _dictConfigCache.fetchedAt < DICT_CACHE_TTL_MS) {
    return _dictConfigCache.data;
  }
  try {
    const res = await svApi.queryDictList();
    const list = res?.data?.dictList || [];
    const findVal = (type) =>
      list?.find(i => i.dict_type === type)?.dict_value;
    const config = {
      ttlMs: parseInt(findVal("third_party_ids_cache_ttl")) || DEFAULT_TTL_MS,
      maxSize:
        parseInt(findVal("third_party_ids_cache_size")) || DEFAULT_MAX_SIZE
    };
    _dictConfigCache = { data: config, fetchedAt: now };
    return config;
  } catch (e) {
    // 字典查询异常，回退默认值
    return { ttlMs: DEFAULT_TTL_MS, maxSize: DEFAULT_MAX_SIZE };
  }
}

/**
 * 清除字典配置缓存（供手动刷新或单测使用）
 */
function clearDictConfigCache() {
  _dictConfigCache = null;
}

// LRU 缓存存储（Map 保持插入顺序，便于 LRU 淘汰）
// key: `${app_name}|${cinema_code}|${film_name}`
// 注：不含 show_time —— third_party_ids 是影院+影片级字段，与场次无关
//     同影院同影片一天多个场次共享同一份第三方 ID，避免被场次维度稀释命中率
// value: { value: third_party_ids, expireAt: number }
const _cache = new Map();

/**
 * 生成缓存 key
 */
function buildCacheKey(app_name, cinema_code, film_name) {
  return `${app_name}|${cinema_code}|${film_name}`;
}

/**
 * 从本地缓存读取（含过期判断 + LRU 访问更新）
 * @returns {Object|null|undefined} 命中返回第三方ID对象；未命中返回 undefined（需查后端）
 */
function getFromCache(key, config) {
  if (!key) return undefined;
  const entry = _cache.get(key);
  if (!entry) return undefined;
  // 逐条过期判断
  if (Date.now() > entry.expireAt) {
    _cache.delete(key); // 惰性清理
    return undefined;
  }
  // LRU：访问时移到末尾（最近使用）
  _cache.delete(key);
  _cache.set(key, entry);
  return entry.value;
}

/**
 * 写入本地缓存（仅缓存命中结果，null 不缓存）
 * 超容量时淘汰最早未访问的条目（LRU）
 */
function setToCache(key, value, config) {
  if (!key || value == null) return;
  const expireAt = Date.now() + (config?.ttlMs || DEFAULT_TTL_MS);
  // 已存在则先删除（更新到末尾）
  if (_cache.has(key)) _cache.delete(key);
  _cache.set(key, { value, expireAt });
  // LRU 淘汰：超容量删除头部（最早未访问）
  const maxSize = config?.maxSize || DEFAULT_MAX_SIZE;
  while (_cache.size > maxSize) {
    const oldestKey = _cache.keys().next().value;
    _cache.delete(oldestKey);
  }
}

// 缓存命中来源标识（写入 offer_record.cache_hit 字段）
// 0 = 未命中，1 = 本地缓存命中，2 = 远端缓存命中
const CACHE_SOURCE = {
  MISS: 0,
  LOCAL: 1,
  REMOTE: 2
};

/**
 * 查询第三方 ID 缓存（带本地 LRU 缓存）
 * 流程：本地命中 → 直接返回；本地未命中 → 查后端，命中结果写本地
 *
 * @param {Object} params - { app_name, cinema_code, film_name }
 *   注：show_time 不参与缓存 key —— third_party_ids 是影院+影片级字段，与场次无关
 * @param {Function} fetcher - 后端查询函数，返回 { data: { third_party_ids } }
 * @returns {Promise<{ids: Object|null, source: number}>}
 *   - ids: 第三方 ID 集合，未命中或异常返回 null
 *   - source: 命中来源 0=未命中 1=本地命中 2=远端命中（写入 offer_record.cache_hit）
 */
async function getCachedThirdPartyIdsWithCache(params, fetcher) {
  const { app_name, cinema_code, film_name } = params;
  const key = buildCacheKey(app_name, cinema_code, film_name);
  const config = await getDictConfig();

  // 1. 查本地缓存
  const cached = getFromCache(key, config);
  if (cached !== undefined) {
    // 本地命中，直接返回（省掉 HTTP 调用，这是本地缓存的核心价值）
    return { ids: cached, source: CACHE_SOURCE.LOCAL };
  }

  // 2. 本地未命中，查后端
  let result = null;
  try {
    const res = await fetcher();
    result = res?.data?.third_party_ids || null;
  } catch (error) {
    // 异常不缓存，返回 null
    return { ids: null, source: CACHE_SOURCE.MISS };
  }

  // 3. 只缓存命中结果（null 不缓存）
  if (result) {
    setToCache(key, result, config);
    return { ids: result, source: CACHE_SOURCE.REMOTE };
  }
  return { ids: null, source: CACHE_SOURCE.MISS };
}

/**
 * 获取缓存统计信息（供调试/监控使用）
 */
function getStats() {
  return {
    size: _cache.size,
    maxSize: _dictConfigCache?.data?.maxSize || DEFAULT_MAX_SIZE,
    ttlMs: _dictConfigCache?.data?.ttlMs || DEFAULT_TTL_MS
  };
}

/**
 * 清空本地缓存（供手动刷新或单测使用）
 */
function clear() {
  _cache.clear();
}

export {
  getCachedThirdPartyIdsWithCache,
  getDictConfig,
  clearDictConfigCache,
  getStats,
  clear
};
