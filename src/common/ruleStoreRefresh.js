// 本地报价规则 store 刷新
// 背景：规则 store（offerRuleList）只在登录/规则页刷新，长跑机器的出票/报价匹配
// 可能读到过期快照；而券库存同步等流程只更新 DB 与平台、不刷新 store，
// 导致"DB 已有规则/状态已变更，但机器匹配仍用旧数据"（如平台规则中标后本地匹配不上）。
// 统一从这里重新拉取 SV 启用/仅报价规则刷新 store。
import svApi from "@/api/sv-api";
import { useDataTableStore } from "@/store/offerRule";
import { platTokens } from "@/store/platTokens";

/**
 * 按影线轻量查询该 app_name 下的规则（供出票匹配重试，避免全量查询拖慢出票）
 * @param {string} app_name - 影线标识
 * @param {Object} [logger] - 可选日志实例（infoSave/errorSave）
 * @returns {Promise<Array|null>} 已解析 platOfferList 的规则列表；异常返回 null
 */
export async function queryAppOfferRuleList(app_name, logger) {
  try {
    const res = await svApi.queryRuleList({
      shadowLineName: app_name,
      rule: platTokens().userInfo?.rule
    });
    const list = (res?.data?.ruleList || []).filter(
      item => item.shadowLineName === app_name
    );
    // platOfferList 单条容错解析：某条规则数据损坏只跳过该条，不影响其余规则参与匹配
    return list
      .map(item => {
        try {
          return { ...item, platOfferList: JSON.parse(item.platOfferList || "[]") };
        } catch (e) {
          logger?.errorSave?.("按影线查询规则 platOfferList 解析失败，跳过该规则", {
            ruleId: item.id,
            ruleName: item.ruleName,
            error: e?.message || String(e)
          });
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    logger?.errorSave?.("按影线查询报价规则异常", { error, app_name });
    return null;
  }
}

/**
 * 从 SV 重新拉取本账号启用/仅报价规则，刷新本地规则 store
 * 并发去重：多个调用方（出票匹配失败 / 券库存同步）同时触发时共享同一次刷新，
 * 避免瞬时 N 个全量查询打爆 SV；完成后自动释放，下次调用重新发起
 * @param {Object} [logger] - 可选日志实例（infoSave/errorSave）
 * @returns {Promise<boolean>} 是否刷新成功
 */
let refreshInFlight = null;
export default async function refreshLocalOfferRuleList(logger) {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const ruleRes = await svApi.queryRuleList({
        rule: platTokens().userInfo?.rule
      });
      const ruleRecords = ruleRes?.data?.ruleList || [];
      ruleRecords.forEach(item => {
        item.includeCityNames = JSON.parse(item.includeCityNames);
        item.excludeCityNames = JSON.parse(item.excludeCityNames);
        item.includeCinemaNames = JSON.parse(item.includeCinemaNames);
        item.excludeCinemaNames = JSON.parse(item.excludeCinemaNames);
        item.includeHallNames = JSON.parse(item.includeHallNames);
        item.excludeHallNames = JSON.parse(item.excludeHallNames);
        item.includeFilmNames = JSON.parse(item.includeFilmNames);
        item.excludeFilmNames = JSON.parse(item.excludeFilmNames);
        item.platOfferList = JSON.parse(item.platOfferList || "[]");
        item.weekDay = JSON.parse(item.weekDay);
        item.film_type = item.film_type ? item.film_type?.split(",") : [];
      });
      // 可用的规则列表
      const useRuleRecords = ruleRecords.filter(item =>
        ["1", "3"].includes(item.status)
      );
      useDataTableStore().setRuleList(useRuleRecords);
      logger?.infoSave?.("本地报价规则列表刷新成功", {
        count: useRuleRecords.length,
        total: ruleRecords.length
      });
      return true;
    } catch (error) {
      logger?.errorSave?.("本地报价规则列表刷新异常", { error });
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
