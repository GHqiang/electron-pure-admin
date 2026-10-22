import svApi from "@/api/sv-api";
import lierenApi from "@/api/lieren-api";
import { ElMessage } from "element-plus";
import {
  getCurrentTime,
  sendWxPusherMessage,
  getLongestPart,
  formatErrInfo
} from "@/utils/utils";
import { platTokens } from "@/store/platTokens";
import { dictTable } from "@/store/dictTable";
const dictStore = dictTable();

import { useCinemaCodeMatchList } from "@/store/specialNameRule";
const cinemaCodeMatchObj = useCinemaCodeMatchList();

import { useCinemaList } from "@/store/cinemaList";
const cinemaListObj = useCinemaList();
// 格式化影院专资
const formatCinemaCode = (app_cinema_code_list, app_name) =>
  app_cinema_code_list
    .map(
      item =>
        cinemaCodeMatchObj.getCinemaCodeFlag({
          app_cinema_code: item,
          app_name
        })?.plat_cinema_code || ""
    )
    .join(",");
// 格式化座位数
// 导出供 commonQuanStock.js 构造 cachedPlatRule 使用，避免 lierenOfferRuleSyncPlat 内部再调 ruleList
export const formatSeats = seatNum => {
  if (!seatNum) return "";
  let array = [];
  for (let index = 0; index < seatNum; index++) {
    array.push(index + 1);
  }
  return array.join(",");
};

// ── 存量刷数（B钱包加价一次性推送）范围常量 ──
// 必须与 doc/sql/2026-10-10-bwallet-markup-sync-rules.sql 的 WHERE 完全一致，
// 否则「刷了多少条」与「推了多少条」对不上（见变更文档 §12.5-a / §12.11）
export const BWALLET_BACKFILL_SCOPE = {
  rule: "2", // 与刷数脚本 rule = 2 相同，执行推送的账号也必须是该 rule
  statusList: ["1", "3"], // 与刷数脚本 status IN ('1','3') 相同
  pageSize: 100, // 本地规则分页拉取大小
  maxPage: 50, // 翻页上限，防 totalNum 异常导致死循环
  intervalMs: 200 // 条间间隔，与 checkAndUpdateLierenRuleState 的批量同步一致，避免触发 429
};

// 还原 JSON 数组字段为字符串：DB 行里本就是字符串，此函数兼容调用方已把字段解析成数组的场景
// （lierenOfferRuleSyncPlat 内部会对这些字段做 JSON.parse / join）
export const restoreJsonFieldsForSync = rule => {
  const jsonFields = [
    "includeCityNames",
    "excludeCityNames",
    "includeFilmNames",
    "excludeFilmNames",
    "includeHallNames",
    "excludeHallNames"
  ];
  const ruleForSync = { ...rule };
  for (const field of jsonFields) {
    if (Array.isArray(ruleForSync[field])) {
      ruleForSync[field] = JSON.stringify(ruleForSync[field]);
    }
  }
  // film_type 被 setLocalRuleList 拆成数组，需还原为逗号分隔字符串
  if (Array.isArray(ruleForSync.film_type)) {
    ruleForSync.film_type = ruleForSync.film_type.join(",");
  }
  return ruleForSync;
};

// 机器相关方法接口
export default function useLierenOfferRuleSyncFun() {
  const tokens = platTokens();

  // 获取猎人 AK/SK：优先当前 rule，若无配置则回退到字典中第一个可用规则
  const _getLierenAkSk = () => {
    const rule = tokens.userInfo?.rule;
    const raw = dictStore.dictInfo.lierenMainAccountAkSk;
    if (!raw) return [];
    try {
      const map = JSON.parse(raw);
      return map[rule] || map[Object.keys(map)[0]] || [];
    } catch {
      return [];
    }
  };

  // 同步规则到猎人平台（新增/修改）；成功时返回最新 platOfferList，供调用方落库避免覆盖 platRuleId
  // cachedPlatRule: 可选，批量同步场景下由调用方传入已查询的平台旧规则，避免重复调 ruleList 触发限流
  // opts.logMeta: 可选，覆盖成功日志的 trigger_source / change_reason（默认保持原语义），
  //   供存量刷数（pushLierenExtraAmountToPlat）把「一次性重推」与「日常编辑保存」在日志里区分开
  const lierenOfferRuleSyncPlat = async (
    ruleInfo,
    cachedPlatRule = null,
    opts = {}
  ) => {
    const { logMeta = {} } = opts;
    let params;

    try {
      let lierenOffer = ruleInfo.platOfferList.find(
        item => item.platName === "lieren"
      );
      if (!lierenOffer) return;
      let lierenOfferRule = {
        ...ruleInfo,
        offerAmount: lierenOffer.value,
        platRuleId: lierenOffer.platRuleId,
        platOfferList: undefined
      };
      const app_name = ruleInfo.shadowLineName;
      // 包含/排除城市
      let city = lierenOfferRule.includeCityNames;
      if (city) {
        city = JSON.parse(city).join(",").replaceAll("市", "");
      }
      let exclude_city = lierenOfferRule.excludeCityNames;
      if (exclude_city) {
        exclude_city = JSON.parse(exclude_city).join(",").replaceAll("市", "");
      }
      // 包含/排除影院
      let cinema_code = lierenOfferRule.includeCinemaCodes;
      if (cinema_code) {
        cinema_code = cinema_code.split(",");
        cinema_code = formatCinemaCode(cinema_code, app_name);
      }
      let exclude_cinema_code = lierenOfferRule.excludeCinemaCodes;
      if (exclude_cinema_code) {
        exclude_cinema_code = exclude_cinema_code.split(",");
        exclude_cinema_code = formatCinemaCode(exclude_cinema_code, app_name);
      }
      // 院线(包含不存在时必传院线)
      let cinema_group = lierenOfferRule.cinema_group;

      if (!cinema_group) {
        cinema_group = cinemaListObj.getLierenCinemaGroup({ app_name });
      }

      if (!cinema_code && !cinema_group) {
        console.warn("同步规则到猎人平台失败：缺少院线或包含影院信息");
        ElMessage({
          type: "error",
          message:
            "同步规则到猎人平台失败：缺少院线或包含影院信息，请检查该影院设置是否配置猎人院线名称"
        });
        return;
      }
      // 包含/排除影片
      let film = lierenOfferRule.includeFilmNames;
      if (film) {
        film = JSON.parse(film)
          .map(item => getLongestPart(item))
          .filter(item => item)
          .join(",");
      }
      let exclude_film = lierenOfferRule.excludeFilmNames;
      if (exclude_film) {
        exclude_film = JSON.parse(exclude_film)
          .map(item => getLongestPart(item))
          .filter(item => item)
          .join(",");
      }
      // 包含/排除影厅
      let hall = lierenOfferRule.includeHallNames;
      if (hall) {
        hall = JSON.parse(hall).join(",");
      }
      let exclude_hall = lierenOfferRule.excludeHallNames;
      if (exclude_hall) {
        exclude_hall = JSON.parse(exclude_hall).join(",");
      }

      let lierenMainAccountAkSk = _getLierenAkSk();

      params = {
        rule_id: lierenOfferRule.platRuleId,
        name: lierenOfferRule.remark || lierenOfferRule.ruleName, // 规则名称，优先把备注同步过去
        cinema_group: cinema_group || "", // 院线，多个院线可用“,”号分隔；没有传空
        cinema_code: cinema_code || "", // 包含影院专资，多个可用“,”号分隔；没有传空
        exclude_cinema_code: exclude_cinema_code || "", // 排除影院专资，多个可用“,”号分隔；没有传空
        province: lierenOfferRule.province || "", // 包含省份，多个可用“,”号分隔；没有传空
        city: city || "", // 包含城市，多个可用“,”号分隔；没有传空
        exclude_city: exclude_city || "", // 排除城市，多个可用“,”号分隔；没有传空
        film: film || "", // 影片名称，多个可用“,”号分隔；没有传空
        exclude_film: exclude_film || "", // 排除影片名称，多个可用“,”号分隔；没有传空
        hall: hall || "", // 影厅名称，多个可用“,”号分隔；没有传空
        exclude_hall: exclude_hall || "", // 排除影厅名称，多个可用“,”号分隔；没有传空
        min_price: lierenOfferRule.min_price || 10, // 最低价，单位分；没有传默认为0
        max_price: lierenOfferRule.max_price || 500, // 最高价，单位分；没有传默认为500
        sum_mode: lierenOfferRule.offerType == 1 ? 2 : 4, //  2-固定价（价格值为30时，即报价30）》 3-市场价减价（市场35，价格值为5时35-5=30）》 4-会员价加减（需要报价时提交会员价，价格值为3时，会员价+3。价格值为-3时，会员价-3）
        price: Number(lierenOfferRule.offerAmount), // 固定价格或者加减价格
        seats: formatSeats(lierenOfferRule.seatNum), // 座位数，多个可用“,”号分隔；没有传空
        version_type: lierenOfferRule.film_type, // 影片场次版本 2D或3D
        state: ruleInfo.status == "1" ? 1 : 0, // 规则状态，1-启用，0-禁用
        // B钱包附加价：随规则同步到平台（未同步规则由本地报价叠加，已同步规则由平台报价时相加）
        // 折扣模式为折扣值、其余为固定值，单位与 price 一致，故直接透传；
        // 空 / null / 非数字统一发 0（会覆盖平台侧手工值，已确认知悉，见变更文档 §12.8-2）
        extra_amount: Number.isFinite(Number(lierenOfferRule.bWalletMarkup))
          ? Number(lierenOfferRule.bWalletMarkup)
          : 0,
        // attach_price: 0, // 附加价格，会员价折扣模式报价有效
        lieren_ak: lierenMainAccountAkSk?.[0] || "",
        lieren_sk: lierenMainAccountAkSk?.[1] || ""
      };
      console.warn("同步规则到猎人平台参数", params);
      const res = await lierenApi.ruleAdd(params);
      console.warn("同步规则到猎人平台成功", res);
      let oldStatus = null,
        oldSeatNum = null;
      if (lierenOfferRule.platRuleId) {
        // 优先使用调用方传入的缓存平台规则，避免批量同步时重复调 ruleList 触发 429
        if (cachedPlatRule) {
          oldStatus = cachedPlatRule.state;
          oldSeatNum = cachedPlatRule.seats;
        } else {
          try {
            const listRes = await lierenApi.ruleList({
              rule_id: [lierenOfferRule.platRuleId],
              lieren_ak: lierenMainAccountAkSk?.[0] || "",
              lieren_sk: lierenMainAccountAkSk?.[1] || ""
            });
            const oldRes = listRes?.data?.[0];
            if (oldRes) {
              oldStatus = oldRes.state;
              oldSeatNum = oldRes.seats;
            }
          } catch (error) {}
        }
      }
      // 记录同步成功日志
      svApi
        .addRuleOperationLog({
          rule_id: ruleInfo.id,
          rule_name: ruleInfo.ruleName,
          shadow_line_name: ruleInfo.shadowLineName,
          operation_type: "sync_add_update",
          old_status: oldStatus,
          old_seat_num: oldSeatNum,
          new_status: ruleInfo.status,
          new_seat_num: ruleInfo.seatNum,
          plat_name: "lieren",
          // logMeta 由存量刷数（pushLierenExtraAmountToPlat）传入，用于标记一次性重推；
          // 日常编辑保存/新增不传，保持原有日志语义不变
          trigger_source:
            logMeta.trigger_source ??
            (lierenOfferRule.platRuleId ? "rule_edit_save" : "rule_add_save"),
          change_reason:
            logMeta.change_reason ??
            (lierenOfferRule.platRuleId
              ? "更新猎人平台规则"
              : "新增猎人平台规则"),
          success: 1,
          operator: tokens.userInfo?.name || "",
          ext_data: JSON.stringify({
            platRuleId: res?.data?.rule_id || lierenOfferRule.platRuleId,
            // 记录本次同步的 B钱包附加价，便于核对平台 extra_amount 是否与本地一致
            extra_amount: params.extra_amount,
            ...(logMeta.backfill ? { backfill: true } : {})
          })
        })
        .catch(() => {});
      let rule_id = res?.data?.rule_id;
      let platOfferList = ruleInfo.platOfferList || [];
      let finalPlatOfferList = platOfferList.map(item => ({ ...item }));
      // 平台返回的 rule_id 与本地不一致时（新增获得 / 编辑后平台侧新建了规则），
      // 需同步更新本地 platRuleId：否则平台按新规则id报价中标后，本地无法匹配到规则，
      // 导致补写报价记录失败、出票失败
      const needUpdatePlatRuleId =
        rule_id && String(rule_id) !== String(lierenOfferRule.platRuleId || "");
      if (needUpdatePlatRuleId) {
        // 编辑规则增加关联平台规则id
        finalPlatOfferList = platOfferList.map(item => {
          if (item.platName === "lieren") {
            return { ...item, platRuleId: rule_id };
          }
          return item;
        });
        await svApi.updateRuleRecord({
          id: lierenOfferRule.id,
          platOfferList: JSON.stringify(finalPlatOfferList),
          update_time: getCurrentTime(),
          is_sync_plat: finalPlatOfferList.find(
            item => item.isSyncPlat == 1 && item.platName == "lieren"
          )
            ? 1
            : 2
        });
        console.warn(
          lierenOfferRule.platRuleId
            ? `编辑规则-平台规则id已更新(${lierenOfferRule.platRuleId}->${rule_id})`
            : "编辑规则-增加关联平台规则id成功"
        );
      }
      return { platOfferList: finalPlatOfferList };
    } catch (error) {
      console.warn("同步规则到猎人平台异常", error);
      // 记录同步失败日志
      // old_status/old_seat_num 在 ruleAdd 失败时尚未查询，只能为 null
      // new_status/new_seat_num 来自入参 ruleInfo，补充传值便于排查当时想同步成什么状态
      // lierenOfferRule 在 try 块内声明，catch 中访问不到，这里从 ruleInfo 重新查找 platRuleId
      const failedPlatRuleId = ruleInfo.platOfferList?.find(
        item => item.platName === "lieren"
      )?.platRuleId;
      // 猎人响应拦截器 Promise.reject(data) 只抛 {code, message}，丢失了 config/response 上下文，
      // catch 块主动补充请求入参快照到 ext_data，便于排查"操作失败"时的具体请求内容
      // params 在 try 外用 let 声明，catch 可访问；lieren_ak/lieren_sk 需手动脱敏
      let safeParams = null;
      if (params) {
        const { lieren_ak, lieren_sk, ...rest } = params;
        safeParams = rest;
      }
      // 平台响应：error 可能是猎人业务错误对象 {code, message}、AxiosError（含 response）、或普通 Error
      let platformResponse = null;
      if (error) {
        if (error.response) {
          // AxiosError：HTTP 4xx/5xx，带完整 response
          platformResponse = {
            type: "axios_error",
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          };
        } else if (error.code != null && error.message != null && !error.stack) {
          // 猎人业务错误：拦截器 Promise.reject({code, message}) 抛出的普通对象
          platformResponse = {
            type: "lieren_biz_error",
            code: error.code,
            message: error.message
          };
        } else {
          // 其他异常（如 TypeError、网络异常等）
          platformResponse = {
            type: "unknown_error",
            name: error.name,
            message: error.message
          };
        }
      }
      svApi
        .addRuleOperationLog({
          rule_id: ruleInfo.id,
          rule_name: ruleInfo.ruleName,
          shadow_line_name: ruleInfo.shadowLineName,
          operation_type: "sync_add_update",
          new_status: ruleInfo.status,
          new_seat_num:
            ruleInfo.seatNum != null ? String(ruleInfo.seatNum) : null,
          plat_name: "lieren",
          trigger_source: failedPlatRuleId
            ? "rule_edit_save"
            : "rule_add_save",
          change_reason: failedPlatRuleId
            ? "更新猎人平台规则"
            : "新增猎人平台规则",
          success: 0,
          error_msg: formatErrInfo(error),
          operator: tokens.userInfo?.name || "",
          ext_data: JSON.stringify({
            platRuleId: failedPlatRuleId,
            requestParams: safeParams,
            platformResponse
          })
        })
        .catch(() => {});
      ElMessage.error("同步规则到猎人平台失败，请稍后重试");
      return undefined;
    }
  };

  // 同步规则到猎人平台（删除）
  // ruleInfoList: 可选，本地规则信息列表（含 id/ruleName/shadowLineName），用于删除同步日志可追溯
  const lierenOfferRuleDelPlat = async (platRuleIdList, ruleInfoList = []) => {
    const firstRule = ruleInfoList?.[0] || {};
    try {
      let lierenMainAccountAkSk = _getLierenAkSk();
      const params = {
        rule_id: platRuleIdList,
        lieren_ak: lierenMainAccountAkSk?.[0] || "",
        lieren_sk: lierenMainAccountAkSk?.[1] || ""
      };
      console.warn("猎人平台规则删除参数", params);
      const res = await lierenApi.ruleDel(params);
      console.warn("猎人平台规则删除成功", res);
      // 记录删除同步成功日志
      svApi
        .addRuleOperationLog({
          rule_id: firstRule.id ?? null,
          rule_name: firstRule.ruleName,
          shadow_line_name: firstRule.shadowLineName,
          operation_type: "sync_delete",
          plat_name: "lieren",
          trigger_source: "rule_delete",
          change_reason: `批量删除猎人平台规则(${platRuleIdList.length}条)`,
          success: 1,
          operator: tokens.userInfo?.name || "",
          ext_data: JSON.stringify({ platRuleIdList })
        })
        .catch(() => {});
    } catch (error) {
      console.error("猎人平台规则删除异常", error);
      // 记录删除同步失败日志
      svApi
        .addRuleOperationLog({
          rule_id: firstRule.id ?? null,
          rule_name: firstRule.ruleName,
          shadow_line_name: firstRule.shadowLineName,
          operation_type: "sync_delete",
          plat_name: "lieren",
          trigger_source: "rule_delete",
          success: 0,
          error_msg: formatErrInfo(error),
          operator: tokens.userInfo?.name || "",
          ext_data: JSON.stringify({ platRuleIdList })
        })
        .catch(() => {});
      throw error;
    }
  };

  // 同步规则到猎人平台（启用禁用）
  const lierenOfferRuleEditStatusPlat = async ruleInfo => {
    try {
      let lierenMainAccountAkSk = _getLierenAkSk();
      let platList = ruleInfo.platOfferList;

      let lierenOffer = platList.find(item => item.platName === "lieren");
      if (!lierenOffer?.platRuleId) {
        console.warn("猎人平台规则状态修改跳过：无 platRuleId");
        return;
      }
      let lierenOfferRule = {
        ...ruleInfo,
        offerAmount: lierenOffer.value,
        platRuleId: lierenOffer.platRuleId,
        platOfferList: undefined
      };
      console.warn("同步到猎人平台的规则", lierenOfferRule);
      const params = {
        rule_id: [lierenOfferRule.platRuleId],
        state: ruleInfo.status == "1" ? 1 : 0,
        lieren_ak: lierenMainAccountAkSk?.[0] || "",
        lieren_sk: lierenMainAccountAkSk?.[1] || ""
      };
      console.warn("猎人平台规则状态修改参数", params);
      const res = await lierenApi.ruleState(params);
      console.warn("猎人平台规则状态修改成功", res);
      // 记录状态同步成功日志
      svApi
        .addRuleOperationLog({
          rule_id: ruleInfo.id,
          rule_name: ruleInfo.ruleName,
          shadow_line_name: ruleInfo.shadowLineName,
          operation_type: "sync_status",
          new_status: ruleInfo.status,
          plat_name: "lieren",
          trigger_source:
            ruleInfo.status === "5" ? "no_offer_today" : "manual_toggle",
          change_reason:
            ruleInfo.status === "5"
              ? "当日不报，同步禁用"
              : ruleInfo.status === "1"
                ? "用户启用规则，同步启用"
                : "用户禁用规则，同步禁用",
          success: 1,
          operator: tokens.userInfo?.name || "",
          ext_data: JSON.stringify({ platRuleId: lierenOffer.platRuleId })
        })
        .catch(() => {});
    } catch (error) {
      console.warn("猎人平台规则状态修改异常", error);
      // 记录状态同步失败日志
      svApi
        .addRuleOperationLog({
          rule_id: ruleInfo.id,
          rule_name: ruleInfo.ruleName,
          shadow_line_name: ruleInfo.shadowLineName,
          operation_type: "sync_status",
          new_status: ruleInfo.status,
          plat_name: "lieren",
          trigger_source:
            ruleInfo.status === "5" ? "no_offer_today" : "manual_toggle",
          success: 0,
          error_msg: formatErrInfo(error),
          operator: tokens.userInfo?.name || ""
        })
        .catch(() => {});
      ElMessage.error("修改猎人平台规则状态失败");
      // 失败必须抛出：让调用方（editRuleStatusSyncToPlat → editStatus/handleStatusChange）
      // 感知并还原本地状态/阻断落库，否则"本地已改、平台未改"导致平台继续报价、
      // 本地匹配失败（与 8-23 删除不同步事故同类路径）
      throw error;
    }
  };

  // 检查并更新同步到猎人的规则状态（双向：启用该启的、禁用该禁的）
  const checkAndUpdateLierenRuleState = async (ruleList, triggerSource = "login_sync") => {
    console.warn(
      "检查并更新同步到猎人的规则状态（双向：启用该启的、禁用该禁的）"
    );
    try {
      ruleList = JSON.parse(JSON.stringify(ruleList));
      // 筛选：固定报价 + 已同步猎人的规则（去掉 allow_offer_time 限制，全覆盖）
      ruleList = ruleList
        .filter(
          item =>
            item.offerType == 1 &&
            item.platOfferList?.some(
              subItem =>
                subItem.platName === "lieren" &&
                subItem.platRuleId &&
                subItem.isSyncPlat == 1
            )
        )
        .map(item => {
          let lierenOffer = item.platOfferList.find(
            item => item.platName === "lieren"
          );
          return {
            ...item,
            ...lierenOffer
          };
        });
      console.warn("平台选择同步的固定价规则", ruleList);
      const lierenMainAccountAkSk = _getLierenAkSk();
      if (!lierenMainAccountAkSk.length) {
        console.warn("未配置猎人 AK/SK，跳过猎人规则同步检查");
        return;
      }

      const platRuleIdList = ruleList.map(item => item.platRuleId);
      if (!platRuleIdList.length) return;

      const lierenRuleRes = await lierenApi.ruleList({
        lieren_ak: lierenMainAccountAkSk?.[0] || "",
        lieren_sk: lierenMainAccountAkSk?.[1] || ""
      });
      let lierenRuleList = lierenRuleRes?.data || [];
      lierenRuleList = lierenRuleList.filter(item => item.sum_mode == 2);
      console.warn("猎人的固定价规则", lierenRuleList);

      // 建立本地 platRuleId → 本地规则的映射
      const localRuleMap = new Map();
      for (const item of ruleList) {
        localRuleMap.set(String(item.platRuleId), item);
      }
      // 建立猎人 rule_id 集合（用于反向检查本地有、猎人无的规则）
      const platRuleIdSet = new Set(lierenRuleList.map(r => String(r.rule_id)));

      let enableCount = 0;
      let disableCount = 0;
      let deleteCount = 0;
      let seatsFixCount = 0;

      // ── 收集需要标记的孤儿规则 ──
      const platOnlyRules = []; // 猎人平台有、本地无
      const localOnlyRules = []; // 本地同步了、猎人平台无

      for (const platRule of lierenRuleList) {
        const localRule = localRuleMap.get(String(platRule.rule_id));
        if (!localRule) {
          // ⚠ 猎人平台有该规则但本地未同步（可能是手动在平台创建或被删后残留）
          platOnlyRules.push(platRule);
          continue;
        }

        // 计算猎人端应有的状态：
        // - 当日不报生效中（allow_offer_time 未到）→ 禁用(0)
        // - 本地正常(1) → 启用(1)；本地禁用/仅报价(2/3) → 禁用(0)
        const isNoOfferActive =
          localRule.allow_offer_time &&
          +new Date(localRule.allow_offer_time) > +new Date();
        const expectedState = isNoOfferActive
          ? 0
          : localRule.status == "1"
            ? 1
            : 0;

        // 计算猎人端应有的座位数
        const expectedSeats = formatSeats(localRule.seatNum);

        const stateMismatch = platRule.state !== expectedState;
        const seatsMismatch = (platRule.seats || "") !== expectedSeats;

        if (stateMismatch || seatsMismatch) {
          console.warn(
            `猎人规则不一致: platRuleId=${platRule.rule_id}` +
              (stateMismatch
                ? ` 状态 ${platRule.state}→${expectedState}`
                : "") +
              (seatsMismatch
                ? ` 座位 "${platRule.seats || ""}"→"${expectedSeats}"`
                : "")
          );

          // 完整同步（ruleAdd），同时修复状态和座位数
          // localRule 中的 JSON 数组字段已被 setLocalRuleList 解析过，需还原为 JSON 字符串
          // 因为 lierenOfferRuleSyncPlat 内部会对这些字段做 JSON.parse
          const jsonFields = [
            "includeCityNames",
            "excludeCityNames",
            "includeFilmNames",
            "excludeFilmNames",
            "includeHallNames",
            "excludeHallNames"
          ];
          const ruleForSync = { ...localRule };
          for (const field of jsonFields) {
            if (Array.isArray(ruleForSync[field])) {
              ruleForSync[field] = JSON.stringify(ruleForSync[field]);
            }
          }
          // film_type 被 setLocalRuleList 拆成数组，需还原为逗号分隔字符串
          if (Array.isArray(ruleForSync.film_type)) {
            ruleForSync.film_type = ruleForSync.film_type.join(",");
          }
          const syncRes = await lierenOfferRuleSyncPlat(
            ruleForSync,
            platRule
          );
          if (!syncRes) {
            console.warn(
              `完整同步返回空: platRuleId=${platRule.rule_id}，回退到仅同步状态`
            );
            // 回退：至少把状态同步过去
            // 加 try/catch 避免回退失败抛出异常导致整个 checkAndUpdateLierenRuleState 中止，
            // 后续规则无法继续检查
            const params = {
              rule_id: [platRule.rule_id],
              state: expectedState,
              lieren_ak: lierenMainAccountAkSk?.[0] || "",
              lieren_sk: lierenMainAccountAkSk?.[1] || ""
            };
            try {
              await lierenApi.ruleState(params);
            } catch (err) {
              console.warn(
                `回退 ruleState 失败: platRuleId=${platRule.rule_id}`,
                err?.message || err
              );
            }
          }
          // 批量同步时每条规则之间加 200ms 间隔，避免密集请求触发猎人平台 429
          await new Promise(resolve => setTimeout(resolve, 200));

          if (expectedState === 1) {
            enableCount++;
          } else {
            disableCount++;
          }
          if (seatsMismatch) seatsFixCount++;
          // 记录双向同步修复日志
          svApi
            .addRuleOperationLog({
              rule_id: localRule.id,
              rule_name: localRule.ruleName,
              shadow_line_name: localRule.shadowLineName,
              operation_type: "sync_bidirectional",
              old_status: platRule.state === 1 ? "1" : "2",
              new_status: expectedState === 1 ? "1" : "2",
              old_seat_num: platRule.seats || null,
              new_seat_num: expectedSeats || null,
              plat_name: "lieren",
              trigger_source: triggerSource,
              change_reason: stateMismatch
                ? expectedState === 0
                  ? isNoOfferActive
                    ? "当日不报生效中"
                    : `本地status=${localRule.status}`
                  : "本地已启用，同步启用"
                : `座位数不一致(${platRule.seats || ""}→${expectedSeats})`,
              success: syncRes ? 1 : 0,
              operator: tokens.userInfo?.name || "",
              ext_data: JSON.stringify({
                platRuleId: platRule.rule_id,
                expectedState,
                expectedSeats,
                localStatus: localRule.status,
                allowOfferTime: localRule.allow_offer_time
              })
            })
            .catch(() => {});
        } else {
          console.warn("平台和本地状态和座位数完全一致，无需更新");
        }
      }

      // ── 反向检查：本地有、猎人无的规则 ──
      for (const [platRuleId, localRule] of localRuleMap) {
        if (!platRuleIdSet.has(platRuleId)) {
          localOnlyRules.push({ platRuleId, localRule });
        }
      }

      // ── 报告并修复孤儿规则 ──
      // 孤儿规则（平台有、本地无）处理策略：
      // - 平台已禁用(state=0)的孤儿规则 → 直接删除。仅禁用会一直残留，每次检查都重复报不一致无法收敛
      // - 启用中或状态未知的孤儿规则 → 先禁用（防止误删人工在平台手动创建的规则），下次修复时已禁用会被删除
      if (platOnlyRules.length > 0) {
        const platOnlyDelete = platOnlyRules.filter(r => r.state === 0);
        // 启用中或状态未知的孤儿规则都先禁用（可逆、防误删），下次修复时已禁用会被删除
        const platOnlyDisable = platOnlyRules.filter(r => r.state !== 0);
        console.warn(
          `⚠ 猎人平台有但本地未同步的规则（platOnly）: ${platOnlyRules.length} 条，` +
            `其中已禁用 ${platOnlyDelete.length} 条将自动删除` +
            (platOnlyDisable.length > 0
              ? `，其余 ${platOnlyDisable.length} 条先自动禁用（下次修复时删除）`
              : ""),
          platOnlyRules.map(r => ({
            rule_id: r.rule_id,
            name: r.name,
            state: r.state === 1 ? "启用" : "禁用",
            seats: r.seats || "(空)"
          }))
        );
        // 已禁用的孤儿规则：直接删除，避免每次修复都重复发现同样几条不一致
        for (const platRule of platOnlyDelete) {
          try {
            await lierenApi.ruleDel({
              rule_id: [platRule.rule_id],
              lieren_ak: lierenMainAccountAkSk?.[0] || "",
              lieren_sk: lierenMainAccountAkSk?.[1] || ""
            });
            deleteCount++;
            console.warn(
              `  已删除猎人孤儿规则: rule_id=${platRule.rule_id} name="${platRule.name || ""}"`
            );
          } catch (err) {
            console.error(
              `  删除猎人孤儿规则失败: rule_id=${platRule.rule_id}`,
              formatErrInfo(err)
            );
          }
          // 批量删除间隔 200ms，避免触发 429
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        // 启用中的孤儿规则：先禁用（避免不可控的报价行为）
        for (const platRule of platOnlyDisable) {
          try {
            await lierenApi.ruleState({
              rule_id: [platRule.rule_id],
              state: 0,
              lieren_ak: lierenMainAccountAkSk?.[0] || "",
              lieren_sk: lierenMainAccountAkSk?.[1] || ""
            });
            disableCount++;
            console.warn(
              `  已禁用猎人孤儿规则(下次修复将删除): rule_id=${platRule.rule_id} name="${platRule.name || ""}"`
            );
          } catch (err) {
            console.error(
              `  禁用猎人孤儿规则失败: rule_id=${platRule.rule_id}`,
              formatErrInfo(err)
            );
          }
          // 批量禁用间隔 200ms，避免触发 429
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        // 记录平台孤儿规则处理日志（删除用 sync_delete，禁用用 sync_bidirectional）
        svApi
          .batchAddRuleOperationLog({
            logs: [
              ...platOnlyDelete.map(r => ({
                rule_id: null,
                rule_name: r.name,
                shadow_line_name: r.cinema_group || r.cinema_code || "",
                operation_type: "sync_delete",
                old_status: "2",
                new_status: null,
                plat_name: "lieren",
                trigger_source: triggerSource,
                change_reason: "猎人平台孤儿规则（本地未同步，平台已禁用），自动删除",
                success: 1,
                operator: tokens.userInfo?.name || "",
                ext_data: JSON.stringify({ platRuleId: r.rule_id })
              })),
              ...platOnlyDisable.map(r => ({
                rule_id: null,
                rule_name: r.name,
                shadow_line_name: r.cinema_group || r.cinema_code || "",
                operation_type: "sync_bidirectional",
                old_status: r.state === 1 ? "1" : "2",
                new_status: "2",
                plat_name: "lieren",
                trigger_source: triggerSource,
                change_reason: "猎人平台孤儿规则（本地未同步），自动禁用",
                success: 1,
                operator: tokens.userInfo?.name || "",
                ext_data: JSON.stringify({ platRuleId: r.rule_id })
              }))
            ]
          })
          .catch(() => {});
      }

      if (localOnlyRules.length > 0) {
        console.warn(
          `⚠ 本地已同步但猎人平台不存在的规则（localOnly）: ${localOnlyRules.length} 条，需手动检查`,
          localOnlyRules.map(r => ({
            platRuleId: r.platRuleId,
            ruleName: r.localRule.ruleName,
            shadowLine: r.localRule.shadowLineName,
            status: r.localRule.status
          }))
        );
        // 不自动修复（可能需要重新同步或清除本地 platRuleId），只记录警告
      }

      // ── 汇总 ──
      const totalPlatRules = lierenRuleList.length;
      const totalLocalSynced = ruleList.length;
      const totalMatched = totalPlatRules - platOnlyRules.length;
      console.warn(
        `猎人规则同步统计: ` +
          `本地已同步 ${totalLocalSynced} 条, ` +
          `猎人平台固定价 ${totalPlatRules} 条, ` +
          `双向匹配 ${totalMatched} 条` +
          (platOnlyRules.length > 0
            ? `, ⚠猎人孤儿 ${platOnlyRules.length} 条`
            : "") +
          (localOnlyRules.length > 0
            ? `, ⚠本地孤儿 ${localOnlyRules.length} 条`
            : "")
      );

      if (enableCount > 0 || disableCount > 0 || deleteCount > 0 || seatsFixCount > 0) {
        console.warn(
          `猎人规则双向同步完成: 启用 ${enableCount} 条, 禁用 ${disableCount} 条` +
            (deleteCount > 0 ? `, 删除孤儿 ${deleteCount} 条` : "") +
            (seatsFixCount > 0 ? `, 修复座位 ${seatsFixCount} 条` : "")
        );
      }

      // 回传统计结果给调用方（报价规则页的"规则同步修复"用弹窗展示，不再只靠控制台）
      return {
        totalLocalSynced,
        totalPlatRules,
        totalMatched,
        enableCount,
        disableCount,
        deleteCount,
        seatsFixCount,
        platOnlyCount: platOnlyRules.length,
        localOnlyRules: localOnlyRules.map(item => ({
          matchType: "LOCAL_ONLY",
          platRuleId: item.platRuleId,
          ruleName: item.localRule?.ruleName,
          shadowLineName: item.localRule?.shadowLineName,
          localStatus: item.localRule?.status
        }))
      };
    } catch (error) {
      console.warn("检查并更新同步到猎人的规则状态异常", error);
    }
  };

  /**
   * 存量刷数：把本地「已同步猎人平台」固定价规则的 B钱包加价，一次性推到平台 extra_amount
   * 关联：doc/changes/2026-09-30-猎人B钱包加价报价整改说明.md §12.5-a（方案 A）
   *
   * 为什么不复用 checkAndUpdateLierenRuleState：
   *   1. 该函数还承担孤儿规则清理（平台有本地无 → 已禁用直接删除、启用中先禁用），把刷数搭上去会连带删/禁；
   *   2. 它由「平台规则列表 ∩ 本地规则列表」驱动，localOnly 分支只告警，不等于「本地已同步规则全集」；
   *   3. 它的成功日志 change_reason 只覆盖 state/seats 差异，强制重推会被误标成「座位数不一致」。
   * 故这里独立实现：只推字段，不判定状态、不删不禁孤儿、不改本地库（避免 8-18/8-23 那类不一致事故）。
   *
   * 推送范围与 doc/sql/2026-10-10-bwallet-markup-sync-rules.sql 的 WHERE 严格一致：
   *   is_sync_plat = 1 AND offerType = 1 AND rule = 2 AND status IN ('1','3')
   * 返回值 { ruleId, total, pushed, skipped, failed, failedList }：
   *   total 对应刷数脚本 ③ 的 syncedFixedRules、pushed 对应 markupIsOne，用于推送后对账。
   *
   * 用法（控制台，需以 rule=2 账号登录，先进入「报价规则」页面）：
   *   await window.pushLierenExtraAmountToPlat({ dryRun: true })  // 演练：只回报将推送的清单与条数
   *   await window.pushLierenExtraAmountToPlat()                  // 正式推送
   * @param {Object} [opts] - 可选参数
   * @param {boolean} [opts.force=false] - 当前账号不是 rule=2 时是否仍继续（默认中止，防推错集合）
   * @param {boolean} [opts.dryRun=false] - 演练模式：不调用 ruleAdd，只回报将推送的清单/条数
   * @returns {Promise<Object>} 汇总结果（含 dryRun/planned/plan/invalidList/ruleIdChanged）
   */
  const pushLierenExtraAmountToPlat = async (opts = {}) => {
    const { force = false, dryRun = false } = opts;
    const currentRule = String(tokens.userInfo?.rule ?? "");
    const summary = {
      ruleId: currentRule,
      dryRun, // true=演练：只回报将推送的清单，不写平台
      total: 0, // 命中推送范围的本地规则数（应与刷数脚本 ③ 的 syncedFixedRules 相等）
      planned: 0, // 演练模式下"将要推送"的条数
      pushed: 0, // 实际成功重推的条数（应与 markupIsOne 相等）
      skipped: 0, // 命中范围但无法推送（无 platRuleId / 平台侧不存在该规则 / 本地平台价无效）
      failed: 0,
      failedList: [],
      invalidList: [], // 本地 lieren 平台价缺失或非正数（跳过，绝不推上平台）
      ruleIdChanged: [], // 平台返回了不同的 rule_id（可能新建了重复规则），需人工核对
      plan: [] // 演练清单 [{ id, platRuleId, price, extra_amount }]
    };

    // 守卫：推送集合必须与刷数集合一致，账号 rule 不同就直接中止（可用 { force: true } 显式跳过）
    if (currentRule !== BWALLET_BACKFILL_SCOPE.rule && !force) {
      const msg =
        `存量推送要求以 rule=${BWALLET_BACKFILL_SCOPE.rule} 账号执行（与刷数脚本一致），` +
        `当前账号 rule=${currentRule || "(空)"}；确需继续请传 { force: true }`;
      console.warn(`⚠ ${msg}`);
      ElMessage.error(msg);
      return { ...summary, aborted: true };
    }

    try {
      // 1) 拉取当前账号全部规则（分页）：本地 DB 行即含 bWalletMarkup，无需额外查询
      const allRules = [];
      let totalNum = 0;
      let pageNum = 1;
      do {
        const res = await svApi.queryRuleList({
          rule: currentRule,
          page_num: pageNum,
          page_size: BWALLET_BACKFILL_SCOPE.pageSize
        });
        const list = res?.data?.ruleList || [];
        totalNum = res?.data?.totalNum || 0;
        allRules.push(...list);
        pageNum++;
      } while (
        allRules.length < totalNum &&
        pageNum <= BWALLET_BACKFILL_SCOPE.maxPage
      );
      if (allRules.length < totalNum) {
        // 翻页到上限仍没拉完：本次 total 会小于刷数脚本条数，必须显式告警（避免静默漏推）
        console.warn(
          `⚠ 翻页达到上限（maxPage=${BWALLET_BACKFILL_SCOPE.maxPage}）：` +
            `已拉取 ${allRules.length}/${totalNum} 条，本次 total 会小于刷数脚本条数，请核对后再推送`
        );
      }

      // 2) 按与刷数 SQL 完全相同的条件筛出目标规则；
      //    rule 也做一次校验，防止接口返回跨账号数据导致推错集合
      const scopeRules = allRules
        .filter(
          item =>
            String(item.rule) === currentRule &&
            Number(item.is_sync_plat) === 1 &&
            String(item.offerType) === "1" &&
            BWALLET_BACKFILL_SCOPE.statusList.includes(String(item.status))
        )
        .map(item => {
          let platOfferList = [];
          try {
            platOfferList =
              typeof item.platOfferList === "string"
                ? JSON.parse(item.platOfferList || "[]")
                : item.platOfferList || [];
          } catch {
            platOfferList = [];
          }
          return { ...item, platOfferList };
        });
      summary.total = scopeRules.length;

      // 3) 没有 lieren platRuleId 的规则无法定位平台规则 → 计入 skipped
      //    （对应「刷数脚本能刷到、但推不上去」的条目，需人工先做规则同步修复）
      const pushable = [];
      for (const rule of scopeRules) {
        const lierenOffer = rule.platOfferList.find(
          item => item.platName === "lieren" && item.isSyncPlat == 1
        );
        if (!lierenOffer?.platRuleId) {
          summary.skipped++;
          console.warn(
            `⚠ 跳过（本地缺少 lieren platRuleId）: id=${rule.id} ${
              rule.shadowLineName || ""
            }`
          );
          continue;
        }
        // 本地平台价校验：ruleAdd 是"全字段覆盖"，若本地 value 为空/非正数，会把异常价格
        // （0 / NaN）推到平台规则上；这里直接跳过并记入 invalidList，绝不写入
        const price = Number(lierenOffer.value);
        if (!Number.isFinite(price) || price <= 0) {
          summary.skipped++;
          summary.invalidList.push({
            id: rule.id,
            platRuleId: String(lierenOffer.platRuleId),
            value: lierenOffer.value
          });
          console.warn(
            `⚠ 跳过（本地平台价无效，避免把异常价格推上平台）: id=${rule.id} ` +
              `value=${JSON.stringify(lierenOffer.value)} ${rule.shadowLineName || ""}`
          );
          continue;
        }
        pushable.push({
          rule,
          platRuleId: String(lierenOffer.platRuleId),
          price
        });
      }

      if (!pushable.length) {
        console.warn(
          `存量推送：命中 ${summary.total} 条，无可推送规则（skipped=${summary.skipped}）`
        );
        return summary;
      }

      // 4) 平台旧规则只预取一次：既用于判断规则是否还在平台上，又作为 cachedPlatRule 传入，
      //    避免 lierenOfferRuleSyncPlat 内部逐条再调一次 ruleList（N+1 请求 + 429 风险）
      const lierenMainAccountAkSk = _getLierenAkSk();
      if (!lierenMainAccountAkSk?.length) {
        const msg = "未配置猎人 AK/SK，存量推送已中止";
        console.warn(`⚠ ${msg}`);
        ElMessage.error(msg);
        return { ...summary, aborted: true };
      }
      const platRuleRes = await lierenApi.ruleList({
        lieren_ak: lierenMainAccountAkSk[0] || "",
        lieren_sk: lierenMainAccountAkSk[1] || ""
      });
      const platRuleMap = new Map();
      (platRuleRes?.data || [])
        .filter(item => item.sum_mode == 2) // 与同步/检测口径一致：只认固定价规则
        .forEach(item => platRuleMap.set(String(item.rule_id), item));

      // 5) 逐条重推：请求会带上 extra_amount；条间 200ms 间隔；单条失败不中断，便于一把跑完再重试
      console.warn(
        `存量推送开始：账号 rule=${currentRule}，命中 ${summary.total} 条，待推 ${pushable.length} 条`
      );
      for (let index = 0; index < pushable.length; index++) {
        const { rule, platRuleId, price } = pushable[index];
        const platRule = platRuleMap.get(platRuleId);
        if (!platRule) {
          // 平台侧没有这条规则：不发 ruleAdd（避免用旧 rule_id 反写平台），
          // 提示先点「规则同步修复」把平台规则重建出来，再重跑本函数
          summary.skipped++;
          console.warn(
            `[${index + 1}/${pushable.length}] 跳过（平台无此规则，请先执行「规则同步修复」）: ` +
              `platRuleId=${platRuleId} ${rule.shadowLineName || ""}`
          );
          continue;
        }
        const extraAmount = Number.isFinite(Number(rule.bWalletMarkup))
          ? Number(rule.bWalletMarkup)
          : 0;
        if (dryRun) {
          // 演练：只回报"将要推送的内容"，不调用 ruleAdd、也不等待间隔（不写平台就没有限流风险）
          summary.planned++;
          summary.plan.push({
            id: rule.id,
            platRuleId,
            price,
            extra_amount: extraAmount
          });
          console.warn(
            `[${index + 1}/${pushable.length}] [演练-不写入] 将推送 price=${price} ` +
              `extra_amount=${extraAmount} platRuleId=${platRuleId} ${rule.shadowLineName || ""}`
          );
          continue;
        }
        console.warn(
          `[${index + 1}/${pushable.length}] 推送 B钱包加价 extra_amount=${extraAmount} ` +
            `price=${price} platRuleId=${platRuleId} ${rule.shadowLineName || ""}`
        );
        const syncRes = await lierenOfferRuleSyncPlat(
          restoreJsonFieldsForSync(rule),
          { state: platRule.state, seats: platRule.seats },
          {
            logMeta: {
              trigger_source: "manual_backfill",
              change_reason: "B钱包加价存量重推（extra_amount）",
              backfill: true
            }
          }
        );
        if (syncRes) {
          summary.pushed++;
          // 平台返回了不同的 rule_id（历史上出现过「编辑后平台侧新建了规则」）：
          // 说明这次重推在平台上新建了规则，需人工核对是否已产生重复规则
          const newPlatRuleId = syncRes.platOfferList?.find(
            item => item.platName === "lieren"
          )?.platRuleId;
          if (newPlatRuleId && String(newPlatRuleId) !== platRuleId) {
            summary.ruleIdChanged.push({
              id: rule.id,
              platRuleId,
              newPlatRuleId: String(newPlatRuleId)
            });
            console.warn(
              `⚠ 平台返回了新的 rule_id（${platRuleId} → ${newPlatRuleId}）：` +
                "可能已在平台新建规则，请核对是否重复"
            );
          }
        } else {
          // lierenOfferRuleSyncPlat 内部已 ElMessage.error 并返回 undefined，这里只计数并继续
          summary.failed++;
          summary.failedList.push({ id: rule.id, platRuleId });
        }
        await new Promise(resolve =>
          setTimeout(resolve, BWALLET_BACKFILL_SCOPE.intervalMs)
        );
      }

      console.warn(
        `存量推送完成：total=${summary.total} ` +
          (dryRun
            ? `planned=${summary.planned}（演练，未写入平台）`
            : `pushed=${summary.pushed}`) +
          ` skipped=${summary.skipped} failed=${summary.failed}` +
          (summary.invalidList.length
            ? `，⚠本地平台价无效（已跳过）=${JSON.stringify(summary.invalidList)}`
            : "") +
          (summary.failedList.length
            ? `，失败条目=${JSON.stringify(summary.failedList)}`
            : "") +
          (summary.ruleIdChanged.length
            ? `，⚠平台返回了新 rule_id（核对是否重复）=${JSON.stringify(summary.ruleIdChanged)}`
            : "")
      );
      return summary;
    } catch (error) {
      console.warn("存量推送 B钱包加价异常", error);
      ElMessage.error("存量推送 B钱包加价异常，请查看控制台");
      return summary;
    }
  };

  return {
    lierenOfferRuleSyncPlat, // 同步规则到猎人平台（新增/修改）
    lierenOfferRuleDelPlat, // 同步规则到猎人平台（删除）
    lierenOfferRuleEditStatusPlat, // 同步规则到猎人平台（启用禁用）
    checkAndUpdateLierenRuleState, // 检查并更新同步到猎人的规则状态
    pushLierenExtraAmountToPlat // 存量刷数：一次性把 B钱包加价推到平台 extra_amount（§12.5-a）
  };
}
