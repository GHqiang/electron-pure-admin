/**
 * 卡券相关的通用工具方法（跨系列复用）
 *
 * ## 边界/约定
 * - 以“数据整理与通用规则”为主，少量方法会调用接口（svApi）以复用跨系列相同的查询/更新逻辑
 * - 优先保持纯函数：`getLoginMobileList` 会读取全局登录信息，其余函数尽量只处理入参
 * - 兼容历史字段：例如 `monthly_usage` / `month_usage`、`quanStockList` 为 string 或 array
 *
 * ## 为什么要抽
 * 各系列（SFC/UME/LMA/辰星/凤凰等）在“会员卡筛选”“券类型库存聚合”“券库存排序手机号”上高度相似，
 * 统一到这里后，后续规则/字段变动只需要改一处。
 */
import {
  getCurrentDay,
  getCinemaLoginInfoList,
  isDateInCurrentMonth,
  formatErrInfo,
  getCurrentTime
} from "@/utils/utils";
import svApi from "@/api/sv-api";
import { platTokens } from "@/store/platTokens";

const tokens = platTokens();

/**
 * 安全 JSON.parse：对非法 JSON 返回 fallback
 * @param {any} raw
 * @param {any} fallback
 * @returns {any}
 */
function safeJsonParse(raw, fallback) {
  if (!raw) return fallback;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

/**
 * 规范化会员卡的日/月使用量字段（usage_date 非当天/非当月则归零）
 *
 * @param {Array<Object>} list - `svApi.queryCardList` 返回的 cardList
 * @returns {Array<Object>} 规范化后的卡列表（不改变入参引用）
 */
export function normalizeCardUsage(list) {
  return (list || []).map(item => ({
    ...item,
    daily_usage:
      item.usage_date !== getCurrentDay() ? 0 : item.daily_usage || 0,
    month_usage: !isDateInCurrentMonth(item.usage_date)
      ? 0
      : item.monthly_usage || item.month_usage || 0
  }));
}

/**
 * 获取某 app 下“已登录且有效 session”的关联手机号列表
 *
 * 说明：
 * - 这是为了与现有“登录账号池”对齐：只有已登录且 session 有效的手机号才有资格参与用卡/用券。
 * - 若未来登录信息来源变更，只需要改这一处。
 *
 * @param {string} app_name - 影院标识（appFlag/app_name）
 * @returns {Array<string>} mobile 列表
 */
export function getLoginMobileList(app_name) {
  return (getCinemaLoginInfoList() || [])
    .filter(i => i.app_name === app_name && i.mobile && i.session_id)
    .map(i => i.mobile);
}

/**
 * 过滤：只保留关联手机号的会员卡
 *
 * @param {Array<Object>} cardList
 * @param {string} app_name
 * @param {Array<string>} [useMobileList] - 预先算好的手机号列表（可选）
 * @returns {Array<Object>}
 */
export function filterCardsByLoginMobiles(cardList, app_name, useMobileList) {
  const mobiles = useMobileList || getLoginMobileList(app_name);
  return (cardList || []).filter(i => mobiles.includes(i.mobile));
}

/**
 * 过滤：按日/月出票量限制过滤
 *
 * 规则：
 * - `use_limit_day`：当天剩余额度 >= `ticket_num`
 * - `use_limit_month`：当月剩余额度 >= `ticket_num`
 *
 * @param {Array<Object>} cardList
 * @param {number} ticket_num
 * @returns {Array<Object>}
 */
export function filterCardsByUsageLimit(cardList, ticket_num) {
  return (cardList || []).filter(item => {
    const { use_limit_day, use_limit_month, daily_usage, month_usage } = item;
    if (!use_limit_day && !use_limit_month) return true;
    return (
      (use_limit_day
        ? ticket_num <= use_limit_day - (daily_usage || 0)
        : true) &&
      (use_limit_month
        ? ticket_num <= use_limit_month - (month_usage || 0)
        : true)
    );
  });
}

/**
 * 过滤：按指定影院关联卡过滤（linkCinemaIds 为空表示通用卡）
 *
 * @param {Array<Object>} cardList
 * @param {string|number} cinemaIdOrCode - 不同系列可能是 cinema_id 或 cinemaCode
 * @returns {Array<Object>}
 */
export function filterCardsByCinemaLink(cardList, cinemaIdOrCode) {
  return (cardList || []).filter(item => {
    if (!item.linkCinemaIds) return true;
    return item.linkCinemaIds.split(",").some(id => id == cinemaIdOrCode);
  });
}

/**
 * 排序：指定影院卡优先（有 linkCinemaIds 的排前）
 *
 * 说明：
 * - 只做“是否指定影院”这一层排序，不做默认卡/余额等排序（各系列差异较大）
 *
 * @param {Array<Object>} cardList
 * @returns {Array<Object>}
 */
export function sortCardsPreferLinkedCinema(cardList) {
  return (cardList || []).slice().sort((a, b) => {
    if (a.linkCinemaIds && !b.linkCinemaIds) return -1;
    if (!a.linkCinemaIds && b.linkCinemaIds) return 1;
    return 0;
  });
}

/**
 * 通用：直接从接口获取并构建“可用会员卡列表”
 * 目前主要给新架构 SFC 使用，其他系列若字段完全一致也可复用。
 *
 * @param {Object} params
 * @param {string} params.appFlag - 影院标识（app_name）
 * @param {string|number} params.cinema_id - 影院 ID / 编码
 * @param {number} params.ticket_num - 票数
 * @param {Object} [params.logger] - 可选 logger
 * @returns {Promise<Array<Object>>} 可用卡列表
 */
export async function getUsableCardListCommon({
  appFlag,
  cinema_id,
  ticket_num,
  logger
}) {
  try {
    const res = await svApi.queryCardList({
      app_name: appFlag,
      rule: tokens.userInfo?.rule,
      status: "1",
      isNeedTotalNum: 0,
      queryFields:
        "card_num,card_id,balance,mobile,default_card,card_discount,linkCinemaIds,use_limit_day,use_limit_month,daily_usage,monthly_usage,usage_date"
    });
    const rawCardList = res?.data?.cardList || [];
    return buildUsableCardList({
      rawCardList,
      appFlag,
      cinemaIdOrCode: cinema_id,
      ticket_num,
      logger
    });
  } catch (error) {
    logger?.errorSave?.("获取会员卡维护列表异常", {
      error: formatErrInfo(error)
    });
    return [];
  }
}

/**
 * 规范化券类型列表里的 quanStockList：安全 JSON.parse + 补齐 quan_stock 默认值
 *
 * @param {Array<Object>} quanTypeList - `svApi.queryQuanTypeList` 返回的 quanTypeList
 * @returns {Array<Object>} 规范化后的券类型列表
 */
export function normalizeQuanTypeList(quanTypeList) {
  return (quanTypeList || []).map(item => {
    let raw = safeJsonParse(item.quanStockList, []);
    raw = (raw || []).map(s => ({
      ...s,
      quan_stock: s.quan_stock || 0,
      real_quan_stock: s.real_quan_stock || s.quan_stock || 0
    }));
    return { ...item, quanStockList: raw };
  });
}

/**
 * 获取某手机号在该券类型下的最大库存（同手机号可能出现多条记录）
 *
 * @param {Array<Object>} quanStockList - `quanStockList`（已解析）
 * @param {string} phone
 * @returns {number}
 */
export function getMaxQuanStockForPhone(quanStockList, phone) {
  const list = (quanStockList || []).filter(i => i.phone === phone);
  if (!list.length) return 0;
  return Math.max(...list.map(i => Number(i.quan_stock || 0)));
}

/**
 * 将券类型列表按券类型顺序、并在每个券类型内按库存降序，最终输出“去重后的手机号列表”
 *
 * @param {Object} params
 * @param {Array} params.quanTypeList - svApi.queryQuanTypeList 返回的 quanTypeList（已 normalize 也可）
 * @param {Array<string>} params.quanValueList - 规则里的券类型顺序（如 ["40", "45"]）
 * @param {number} params.ticket_num - 需要库存阈值（>= 才参与）
 * @param {Array<string>} params.useMobileList - 只考虑这些手机号（通常是已登录手机号）
 *
 * @returns {Array<string>} 去重且有序的手机号列表
 *
 * @example
 * sortPhonesByQuanValueAndStock({
 *   quanTypeList,
 *   quanValueList: ["40", "45"],
 *   ticket_num: 2,
 *   useMobileList: ["138xxxx", "139xxxx"]
 * })
 */
export function sortPhonesByQuanValueAndStock({
  quanTypeList,
  quanValueList,
  ticket_num,
  useMobileList
}) {
  const values = (quanValueList || []).filter(Boolean);
  const allowedPhones = new Set((useMobileList || []).filter(Boolean));
  const normalized = normalizeQuanTypeList(quanTypeList);

  let target = normalized.filter(i => values.includes(i.quan_value));

  target = target.map(item => {
    const filteredStockList = (item.quanStockList || []).filter(
      s => allowedPhones.has(s.phone) && Number(s.quan_stock || 0) >= ticket_num
    );
    return { ...item, quanStockList: filteredStockList };
  });

  target = target.filter(i => (i.quanStockList || []).length > 0);
  target.sort(
    (a, b) => values.indexOf(a.quan_value) - values.indexOf(b.quan_value)
  );

  const phoneSet = new Set();
  const out = [];
  for (const item of target) {
    const stocks = (item.quanStockList || [])
      .slice()
      .sort((a, b) => Number(b.quan_stock || 0) - Number(a.quan_stock || 0));
    for (const s of stocks) {
      if (!phoneSet.has(s.phone)) {
        phoneSet.add(s.phone);
        out.push(s.phone);
      }
    }
  }
  return out;
}

/**
 * 通用：获取券类型信息（供各系列 getQuanInfo 复用）
 *
 * @param {Object} params
 * @param {string} params.quan_value - 券类型值
 * @param {string} params.app_name - 影院标识
 * @param {Object} [params.logger] - 可选 logger，需支持 infoSave/errorSave
 * @returns {Promise<Object|Array|null>} 券类型信息或 null
 */
export async function getQuanInfoCommon({ quan_value, app_name, logger }) {
  try {
    const res = await svApi.queryQuanTypeInfo({
      quan_value,
      app_name
    });
    logger?.infoSave?.("获取券类型信息返回", { res });
    return res.data?.quanInfo || null;
  } catch (error) {
    logger?.errorSave?.("获取券类型信息异常", {
      error: formatErrInfo(error)
    });
    return null;
  }
}

/**
 * 通用：构建可用会员卡列表（不负责发请求，只处理原始 cardList）
 *
 * @param {Object} params
 * @param {Array<Object>} params.rawCardList - svApi.queryCardList 返回的 cardList
 * @param {string} params.appFlag - 影院标识
 * @param {string|number} params.cinemaIdOrCode - 影院 ID 或编码
 * @param {number} params.ticket_num - 票数
 * @param {Object} [params.logger] - 可选 logger
 * @returns {Array<Object>} 可用卡列表
 */
export function buildUsableCardList({
  rawCardList,
  appFlag,
  cinemaIdOrCode,
  ticket_num,
  logger
}) {
  let list = normalizeCardUsage(rawCardList || []);
  const useMobileList = getLoginMobileList(appFlag);
  list = filterCardsByLoginMobiles(list, appFlag, useMobileList);
  list = filterCardsByUsageLimit(list, ticket_num);
  list = filterCardsByCinemaLink(list, cinemaIdOrCode);
  list = sortCardsPreferLinkedCinema(list);
  logger?.infoSave?.("buildUsableCardList 过滤后卡列表", {
    appFlag,
    cinemaIdOrCode,
    ticket_num,
    mobiles: useMobileList,
    cardNums: list.map(i => i.card_num)
  });
  return list;
}

/**
 * 通用：根据影院获取券类型列表，并按手机号聚合库存（供各系列 getQuanTypeListByApp 复用）
 *
 * @param {Object} params
 * @param {string} params.app_name - 影院标识
 * @param {string} params.mobile - 手机号
 * @param {Object} [params.logger] - 可选 logger
 * @returns {Promise<Array<Object>>} 带聚合库存字段 quan_stock 的券类型列表
 */
export async function getQuanTypeListByAppCommon({ app_name, mobile, logger }) {
  const params = {
    app_name,
    isNeedTotalNum: 0,
    queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
  };
  try {
    const quanTypeRes = await svApi.queryQuanTypeList(params);
    let quanTypeList = normalizeQuanTypeList(
      quanTypeRes?.data?.quanTypeList || []
    );
    quanTypeList = quanTypeList.map(item => ({
      ...item,
      quan_stock: getMaxQuanStockForPhone(item.quanStockList, mobile)
    }));
    logger?.infoSave?.("根据影院获取券类型列表返回", { quanTypeList });
    return quanTypeList;
  } catch (error) {
    logger?.errorSave?.("根据影院获取券类型列表返回异常", {
      error: formatErrInfo(error)
    });
    return [];
  }
}

/**
 * 通用：按券类型排序手机号（整合查询 + 排序逻辑）
 *
 * @param {Object} params
 * @param {string} params.app_name - 影院标识
 * @param {string} params.quan_value - 券类型值（逗号分隔）
 * @param {number} params.ticket_num - 票数
 * @param {Object} [params.logger] - 可选 logger
 * @returns {Promise<Array<string>>} 排序后的手机号列表
 */
export async function getSortPhoneByQuanTypeListCommon({
  app_name,
  quan_value,
  ticket_num,
  logger
}) {
  try {
    const params = {
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
    };
    const quanTypeRes = await svApi.queryQuanTypeList(params);
    const quanValueList = (quan_value || "").split(",").filter(Boolean);
    const quanTypeList = quanTypeRes?.data?.quanTypeList || [];
    const useMobileList = getLoginMobileList(app_name);
    const sortedPhones = sortPhonesByQuanValueAndStock({
      quanTypeList,
      quanValueList,
      ticket_num,
      useMobileList
    });
    logger?.infoSave?.("getSortPhoneByQuanTypeListCommon 排序结果", {
      app_name,
      quan_value,
      ticket_num,
      sortedPhones
    });
    return sortedPhones;
  } catch (error) {
    logger?.errorSave?.("getSortPhoneByQuanTypeListCommon 异常", {
      error: formatErrInfo(error)
    });
    return [];
  }
}

/**
 * 通用：更新券库存（聚焦于修改 quanStockList 字段）
 *
 * @param {Object} params
 * @param {number} params.ticket_num - 使用票数
 * @param {number} [params.quan_stock] - 直接写入的新库存；不传则按 ticket_num 递减
 * @param {string} params.quan_flag - 券标识
 * @param {string} params.phone - 手机号
 * @param {string} params.app_name - 影院标识
 * @param {string} [params.quan_value] - 券类型值（可选，用于更新 end_use_time）
 * @param {Object} [params.logger] - 可选 logger
 */
export async function updateQuanStockCommon(_params) {
  try {
    const { ticket_num, quan_stock, quan_flag, phone, app_name, quan_value } =
      _params || {};
    const res = await svApi.queryQuanTypeList({
      app_name,
      isNeedTotalNum: 0,
      queryFields: "id,quan_flag,app_name,quan_value,quanStockList"
    });
    const list = (res?.data?.quanTypeList || []).filter(
      i => i.quan_flag == quan_flag
    );
    for (const item of list) {
      let raw = item.quanStockList;
      if (!raw) continue;
      raw = typeof raw === "string" ? JSON.parse(raw) : raw;
      const idx = raw.findIndex(i => i.phone === phone);
      if (idx < 0) continue;
      const prev = raw[idx];
      raw[idx] = {
        ...prev,
        quan_stock:
          quan_stock !== undefined
            ? quan_stock
            : (prev.quan_stock || 0) - (ticket_num || 0),
        real_quan_stock:
          quan_stock !== undefined
            ? quan_stock
            : (prev.real_quan_stock || prev.quan_stock || 0) -
              (ticket_num || 0),
        update_time: getCurrentTime()
      };
      const update = {
        id: item.id,
        quanStockList: JSON.stringify(raw),
        update_time: getCurrentTime()
      };
      if (
        quan_value &&
        (quan_value.split(",") || []).includes(item.quan_value)
      ) {
        update.end_use_time = getCurrentTime();
      }
      await svApi.updateQuanType(update);
    }
  } catch (e) {
    _params?.logger?.errorSave?.("updateQuanStockCommon 异常", {
      error: formatErrInfo(e)
    });
  }
}
