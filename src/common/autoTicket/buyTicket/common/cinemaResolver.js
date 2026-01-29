/**
 * 影院解析工具
 * 统一封装各影院系列的影院匹配逻辑
 *
 * 说明：同一系列下的不同影院（appFlag）共享相同的匹配逻辑
 */

import { getTargetCinemaCommon } from "@/utils/utils";

/**
 * 解析目标影院
 * @param {Object} params
 * @param {string} params.appFlag - 影院标识
 * @param {string|number} params.plat_cinema_code - 平台影院编码
 * @param {string} params.city_name - 城市名称
 * @param {Array} params.cinemaList - 影院列表
 * @param {Function} [params.cinemaListAdapter] - 影院列表适配器（可选，用于转换数据结构）
 * @returns {Object|null} 目标影院信息或 null
 */
export function resolveCinema({
  appFlag,
  plat_cinema_code,
  city_name,
  cinemaList,
  cinemaListAdapter
}) {
  if (!cinemaList?.length) return null;

  // 如果提供了适配器，先转换数据结构
  const adaptedList = cinemaListAdapter
    ? cinemaList.map(cinemaListAdapter)
    : cinemaList;

  // 优先通过 cinema_code 精确匹配
  if (plat_cinema_code) {
    const exactMatch = adaptedList.find(
      item =>
        item.cinemaCode === plat_cinema_code ||
        item.cinema_code === plat_cinema_code
    );
    if (exactMatch) return exactMatch;
  }

  // 使用通用匹配逻辑
  const result = getTargetCinemaCommon({
    app_name: appFlag,
    plat_cinema_code,
    cinema_list: adaptedList
  });

  return result ?? null;
}
