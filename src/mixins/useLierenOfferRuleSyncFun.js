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
  const lierenOfferRuleSyncPlat = async (ruleInfo, cachedPlatRule = null) => {
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
          trigger_source: lierenOfferRule.platRuleId
            ? "rule_edit_save"
            : "rule_add_save",
          change_reason: lierenOfferRule.platRuleId
            ? "更新猎人平台规则"
            : "新增猎人平台规则",
          success: 1,
          operator: tokens.userInfo?.name || "",
          ext_data: JSON.stringify({
            platRuleId: res?.data?.rule_id || lierenOfferRule.platRuleId
          })
        })
        .catch(() => {});
      let rule_id = res?.data?.rule_id;
      let platOfferList = ruleInfo.platOfferList || [];
      let finalPlatOfferList = platOfferList.map(item => ({ ...item }));
      if (!lierenOfferRule.platRuleId && rule_id) {
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
        console.warn("编辑规则-增加关联平台规则id成功");
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
  const lierenOfferRuleDelPlat = async platRuleIdList => {
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
          rule_id: null,
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
    } catch (error) {
      console.warn("检查并更新同步到猎人的规则状态异常", error);
    }
  };
  return {
    lierenOfferRuleSyncPlat, // 同步规则到猎人平台（新增/修改）
    lierenOfferRuleDelPlat, // 同步规则到猎人平台（删除）
    lierenOfferRuleEditStatusPlat, // 同步规则到猎人平台（启用禁用）
    checkAndUpdateLierenRuleState // 检查并更新同步到猎人的规则状态
  };
}
