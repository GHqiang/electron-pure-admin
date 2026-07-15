// 第三方 ID 缓存提取工具
// 按平台提取第三方 ID 集合，用于跨订单复用，写入 offer_record.third_party_ids
// 纯函数，无副作用，便于单测

import {
  GET_UME_LIST,
  GET_H5_UME_LIST,
  GET_SFC_APP_LIST,
  GET_CHENXING_LIST,
  GET_FENGHUANG_LIST,
  GET_JINYI_LIST
} from "@/common/constant";

/**
 * 各系列第三方 ID 字段映射
 * 字段名与各系列 cinemaManage / offerManage 实际解析的变量名一致
 */
const fieldMap = {
  wanda: ['city_id', 'cinema_id', 'film_id'],
  fenghuang: ['cinemaLinkId', 'filmId'],
  sfc: ['city_id', 'cinema_id'],
  chenxing: ['cinemaId', 'filmId'],
  jinyi: ['cinema_id', 'film_id'],
  lma: ['cinema_id', 'city_id', 'short_code', 'feature', 'language_type'],
  ume: ['cinemaCode', 'cinemaLinkId', 'filmUniqueId'],
  h5ume: ['cinemaLinkId', 'filmId']
};

/**
 * 将 order.app_name（具体影院标识，如 hsmzyc/bona）映射为系列 key（如 h5ume/sfc）
 * wanda 和 lma 的 app_name 恰好等于系列名，直接返回
 * @param {string} appName - 订单的 app_name
 * @returns {string|null} 系列 key（fieldMap 的 key），未匹配返回 null
 */
function getSeriesKeyByAppName(appName) {
  if (!appName) return null;
  if (fieldMap[appName]) return appName; // wanda / lma 直接命中
  if (GET_UME_LIST().includes(appName)) return 'ume';
  if (GET_H5_UME_LIST().includes(appName)) return 'h5ume';
  if (GET_SFC_APP_LIST().includes(appName)) return 'sfc';
  if (GET_CHENXING_LIST().includes(appName)) return 'chenxing';
  if (GET_FENGHUANG_LIST().includes(appName)) return 'fenghuang';
  if (GET_JINYI_LIST().includes(appName)) return 'jinyi';
  return null;
}

/**
 * 按平台提取第三方 ID 集合（用于跨订单复用，写入 offer_record.third_party_ids）
 * 各系列字段名与 cinemaManage 实际解析的变量名一致
 * @param {Object} cinemaInfo - 各系列 getBuyPrevCinemaInfo / getMovieInfo 返回的影院信息
 * @param {string} appName - 订单的 app_name（具体影院标识，如 hsmzyc/bona/wanda）
 * @returns {Object|null} 第三方 ID 集合；cinemaInfo 为空或无匹配字段时返回 null
 */
function extractThirdPartyIds(cinemaInfo, appName) {
  if (!cinemaInfo || !appName) return null;
  const seriesKey = getSeriesKeyByAppName(appName);
  const fields = seriesKey ? fieldMap[seriesKey] : null;
  if (!fields) return null;
  const result = {};
  let hasValue = false;
  for (const field of fields) {
    const v = cinemaInfo[field];
    if (v != null && v !== '') {
      result[field] = v;
      hasValue = true;
    }
  }
  return hasValue ? result : null;
}

export { extractThirdPartyIds, fieldMap, getSeriesKeyByAppName };
