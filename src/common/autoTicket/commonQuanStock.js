// 公共券库存更新逻辑
import {
  getCurrentTime,
  couponInfoSpecial,
  getCinemaLoginInfoList,
  formatErrInfo
} from "@/utils/utils";
import svApi from "@/api/sv-api";
// 统一日志类
import Logger from "@/common/logger";
// 本地规则 store 刷新（券库存同步只更新 DB/平台，需同步刷新 store 避免出票匹配用过期快照）
import refreshLocalOfferRuleList from "@/common/ruleStoreRefresh";
// 猎人规则同步相关方法
import useLierenOfferRuleSyncFun, {
  // B4：导入 formatSeats 用于构造 cachedPlatRule，避免 lierenOfferRuleSyncPlat 内部再调 ruleList
  formatSeats
} from "@/mixins/useLierenOfferRuleSyncFun";
const { lierenOfferRuleSyncPlat } = useLierenOfferRuleSyncFun();

import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule, name }
} = platTokens();

// B1：maxQuanStock 变化检测缓存
// key: `${app_name}|${quan_value}`，value: { maxQuanStock, fetchedAt }
// 命中条件：缓存未过期(1小时) 且 maxQuanStock 相同 → 跳过整个同步流程（含 checkQuanInRules DB 查询）
// 失败回滚：同步过程异常时 delete 缓存 key，让下次相同 maxQuanStock 还能重新触发
// 不违反"每次出票后必须同步最新规则"约束：maxQuanStock 不变时规则状态本就不需要变更（isSameState 会短路），
// B1 只是把短路提前到 DB 查询之前；失败时立即回滚，无退避延迟
const _lastMaxStockMap = new Map();
const MAX_STOCK_CACHE_TTL = 60 * 60 * 1000; // 1 小时，与报价前路径的 1 小时窗口对齐

/**
 * 日志用：券类型更新汇总的精简格式
 * 分类日志（手机号—券类型—数量）已展示全量明细，这里只聚焦结果：
 * 每个券类型的最大库存 + 有货的手机号（phone→quan_stock 映射），全 0 类型 stockByPhone 为空对象
 * @param {Array} updateTypeList - 待更新券类型 [{ id, quan_value, quan_flag/quanFlag, quanStockList(数组或JSON串) }]
 */
export function formatQuanTypeSummaryForLog(updateTypeList) {
  return updateTypeList.map(item => {
    let stockList = item.quanStockList;
    if (typeof stockList === "string") {
      try {
        stockList = JSON.parse(stockList) || [];
      } catch (e) {
        stockList = [];
      }
    }
    stockList = stockList || [];
    const stockByPhone = {};
    let maxQuanStock = 0;
    stockList.forEach(s => {
      if (!s?.phone) return;
      const stock = Number(s.quan_stock) || 0;
      if (stock > 0) stockByPhone[s.phone] = stock;
      if (stock > maxQuanStock) maxQuanStock = stock;
    });
    return {
      id: item.id,
      quan_value: item.quan_value,
      quan_flag: item.quan_flag || item.quanFlag,
      maxQuanStock,
      stockByPhone
    };
  });
}
/**
 * 异步更新券库存
 * 使用内部独立 Logger（logType=1），券库存更新日志与报价/出票流程日志隔离，
 * 流程内所有日志（分类明细、批量落库、规则同步）最后统一一次上传，互不干扰
 * @param {Object} params - 参数对象
 * @param {Object} params.order - 订单信息
 * @param {Array} params.quanTypeList - 券类型列表
 * @param {Function} params.getQuanListByPhone - 获取优惠券列表的函数
 * @param {Object} [params.extraParams] - 额外参数，如 city_id, cinema_id 等
 */
export async function syncUpdateQuanStock({
  order,
  quanTypeList,
  getQuanListByPhone,
  extraParams = {}
}) {
  const { app_name, plat_name, order_number, app_type_code } = order;
  // 内部独立日志：券库存更新全流程日志收集后一次上传，不受调用方 logger 上传时机影响
  // （控制台照常打印，便于实时观察；上传独立于报价/出票流程）
  const logger = new Logger({ logType: 1 });
  logger.init({ plat_name, order_number, app_name, app_type_code });
  let targetLoginList = getCinemaLoginInfoList().filter(
    item => item.app_name === app_name && item.mobile && item.session_id
  );
  console.log("targetLoginList", targetLoginList);
  try {
    let needUpdateQuanTypeList = [];
    // 拿着处理过的最大券库存（几个号之间）+对应的更新时间去判断是否要更新（只判断自己号上的）
    let isNeedUpdate = quanTypeList.some(item => {
      let inx = item.quanStockListByPhone.findIndex(
        itemA => itemA.quan_stock === item.quan_stock
      );
      // console.log("inx", inx);
      if (inx != -1) {
        let update_time = item.quanStockListByPhone[inx].update_time;
        // console.log("update_time", update_time);

        return !update_time
          ? true
          : +new Date() - +new Date(update_time) > 1000 * 60 * 60; // 超过1小时未更新
      } else {
        return true;
      }
    });
    // isNeedUpdate = true; // 测试先强制更新
    if (!isNeedUpdate) {
      logger.infoSave("不满足更新条件");
    } else {
      // 只要有一个需要更新，就全部更新，因为会获取该号全部的券
      needUpdateQuanTypeList = quanTypeList;

      let quanTypeListParams = needUpdateQuanTypeList.map(item => {
        return {
          id: item.id,
          quan_flag: item.quan_flag,
          quan_value: item.quan_value,
          black_quans: item.black_quans,
          // 剔除空手机号条目：无登录账号时出票后路径可能写入过 phone:"" 脏数据，
          // 随本次写回自动清理（空号条目按 mobile 匹配永远不会被更新，只会一直保留）
          quanStockList: item.quanStockList
            .filter(itemA => itemA.phone)
            .map(itemA => ({
              phone: itemA.phone,
              quan_stock: itemA.quan_stock || 0,
              real_quan_stock: itemA.real_quan_stock || 0,
              update_time: itemA.update_time
            }))
        };
      });
      // 获取关联用户每个号的优惠券列表
      for (let i = 0; i < targetLoginList.length; i++) {
        const { session_id, mobile } = targetLoginList[i];
        const quanListAll = await getQuanListByPhone({
          session_id,
          ...extraParams,
          order,
          logger
        });

        quanTypeListParams.forEach(item => {
          let targetQuanList = quanListAll.filter(
            itemA =>
              couponInfoSpecial(item.quan_flag) ===
                couponInfoSpecial(itemA.coupon_info) &&
              !item.black_quans?.includes(itemA.coupon_num)
          );
          // 打印该手机号该券类型匹配到的券数量与券号（一眼看清各号各券类型的库存来源）
          logger.infoSave(
            `${mobile}—${item.quan_flag}—${targetQuanList.length}`,
            {
              quan_value: item.quan_value,
              matchedQuanList: targetQuanList.slice(0, 5).map(q => ({
                couponNum: q.coupon_num,
                endDateTime: q.endDateTime
              }))
            }
          );

          // SFC 特有的分组券库存逻辑
          let quanStock = targetQuanList.length;
          if (extraParams.city_id && extraParams.cinema_id) {
            // SFC 逻辑：处理分组券
            const { card_num } = targetQuanList?.[0] || {};
            if (card_num) {
              const groupedCoupons = targetQuanList.reduce((groups, coupon) => {
                const key = coupon.card_num;
                if (!groups[key]) {
                  groups[key] = [];
                }
                groups[key].push(coupon);
                return groups;
              }, {});
              let groupList = Object.values(groupedCoupons);
              // 获取分组后最多出票量当做库存
              let maxLength = groupList[0]?.length || 0;
              for (let i = 1; i < groupList.length; i++) {
                if (groupList[i]?.length > maxLength) {
                  maxLength = groupList[i].length;
                }
              }
              quanStock = maxLength;
            }
          }

          let quanStockList = item.quanStockList;
          let inx = quanStockList.findIndex(itemB => itemB.phone === mobile);
          let endDateTime = targetQuanList.sort(
            (a, b) => new Date(a.endDateTime) - new Date(b.endDateTime)
          )?.[0]?.endDateTime;

          // 券列表返回空时，若旧库存 > 0 则保留旧值（可能是登录超时等异常），若旧库存已为 0 则正常归零
          let isUseOldStock = false;
          if (targetQuanList.length === 0) {
            const oldStock = inx !== -1 ? quanStockList[inx]?.quan_stock : 0;
            if (oldStock > 0) {
              logger.infoSave(
                `跳过更新库存：${mobile} 获取券列表返回空但旧库存为${oldStock}(可能登录超时)，保留旧值`,
                { mobile, quan_value: item.quan_value, oldStock }
              );
              isUseOldStock = true;
            }
            // 旧库存已为0，正常归零
          }
          // 若不使用旧库存，则更新券库存列表
          if (!isUseOldStock) {
            if (inx != -1) {
              quanStockList[inx].quan_stock = quanStock;
              quanStockList[inx].real_quan_stock = targetQuanList.length;
              quanStockList[inx].update_time = getCurrentTime();
              quanStockList[inx].endDateTime = endDateTime;
            } else {
              quanStockList.push({
                phone: mobile,
                quan_stock: quanStock,
                real_quan_stock: targetQuanList.length,
                update_time: getCurrentTime(),
                endDateTime
              });
            }
          }
        });
      }
      // quanStockList 统一序列化为 JSON 字符串（后端直接落库 + 批量规则同步内部 parse）
      let updateTypeList = quanTypeListParams.map(item => ({
        id: item.id,
        quan_value: item.quan_value,
        quan_flag: item.quan_flag, // 仅日志展示用（落库时被 dbList 剥离）
        quanStockList: JSON.stringify(item.quanStockList),
        update_time: getCurrentTime()
      }));
      // 打印最终要更新的券类型汇总信息：每个券类型 → 最大库存 + 有货手机号（直观可读）
      logger.infoSave("最终要更新的券类型列表汇总", {
        updateTypeList: formatQuanTypeSummaryForLog(updateTypeList)
      });
      // 批量更新券库存 + 统一触发一次规则同步（替代循环内逐条 singleUpdateQuanStock）
      await batchUpdateQuanStockWithSync({
        list: updateTypeList,
        app_name,
        logger
      });
    }
  } catch (error) {
    logger.infoSave("异步更新券库存异常", { error: formatErrInfo(error) });
  } finally {
    // 内部 logger：券库存全流程日志统一一次上传
    logger.logUpload();
  }
}

/**
 * 批量更新券库存 + 统一触发一次猎人规则同步
 * 替代循环内逐条 singleUpdateQuanStock：库存落库一次批量事务完成（后端事务原子性），
 * 规则同步按 app_name 查 1 次关联规则后对涉及规则去重逐条同步，操作日志收集后批量写入
 * @param {Object} params
 * @param {Array} params.list - 待更新券类型 [{ id, quan_value, quanStockList(JSON string), update_time, end_use_time? }]
 * @param {string} params.app_name - 影院标识（规则同步按此查关联报价规则）
 * @param {Object} params.logger - 日志实例
 */
export async function batchUpdateQuanStockWithSync({ list, app_name, logger }) {
  if (!list?.length) {
    logger.infoSave("批量更新券库存跳过：list 为空", { app_name });
    return;
  }
  const batchStartAt = Date.now();
  logger.infoSave("批量更新券库存开始", {
    app_name,
    count: list.length,
    quanValues: list.map(i => i.quan_value)
  });
  try {
    // 1. 批量落库（后端事务原子性，任一 SQL 异常整批回滚）
    // 仅传 DB 字段，剥离 quan_value/app_name/logger/quanFlag/quanDesc 等业务字段（避免后端动态 SET 构造报错）
    const dbList = list.map(
      ({ id, quanStockList, update_time, end_use_time }) => {
        const item = { id, quanStockList, update_time };
        if (end_use_time != null) item.end_use_time = end_use_time;
        return item;
      }
    );
    const res = await svApi.batchUpdateQuanType({ list: dbList });
    logger.infoSave("批量更新券库存返回", {
      affectedRows: res?.data?.affectedRows,
      count: list.length,
      costMs: Date.now() - batchStartAt
    });
    // 2. 统一触发一次猎人规则同步（用完整 list，含 quan_value 供缓存 key 与规则匹配）
    await batchCheckLierenFixedRule({ list, app_name, logger });
  } catch (error) {
    logger.infoSave("批量更新券库存异常", {
      error: formatErrInfo(error),
      app_name,
      count: list.length
    });
  } finally {
    logger.logUpload();
  }
}

// 查询 app_name 下所有报价规则（批量规则同步用，替代逐 quan_value 查询）
async function queryRulesByApp(app_name, logger) {
  try {
    const res = await svApi.queryRuleList({ shadowLineName: app_name, rule });
    return (res?.data?.ruleList || []).filter(
      item => item.shadowLineName === app_name
    );
  } catch (error) {
    logger?.infoSave?.("查询影院报价规则异常", {
      app_name,
      error: formatErrInfo(error)
    });
    return [];
  }
}

/**
 * 批量根据券库存检查猎人固定报价规则更新座位数/状态
 * 相对单条版的优化：
 *  - B1 缓存判断逐条进行（key: app_name|quan_value）
 *  - 未跳过的 quan_value 合并后只查 1 次 app_name 的规则（替代每条 checkQuanInRules 一次）
 *  - 涉及的规则按 rule.id 去重后逐条同步平台（平台接口无法批量）
 *  - 操作日志收集后一次性 batchAddRuleOperationLog
 * @param {Object} params
 * @param {Array} params.list - 待同步券类型 [{ id, quan_value, quanStockList(JSON string) }]
 * @param {string} params.app_name
 * @param {Object} params.logger
 */
async function batchCheckLierenFixedRule({ list, app_name, logger }) {
  // 收集规则变更日志，最后批量写入
  const pendingLogs = [];
  // 同步失败的 quan_value，回滚其 B1 缓存让下次重新触发
  const syncFailQuanValues = new Set();
  // 提升到 try 外：供 catch 块精准回滚（仅回滚真正进入同步流程的项，不误删 B1 命中跳过的项）
  const needSyncItems = [];
  try {
    // 1. 逐条计算 maxQuanStock + B1 缓存判断，收集需要同步的项
    for (const item of list) {
      const { id, quan_value, quanStockList } = item;
      const cacheKey = `${app_name}|${quan_value}`;
      // 兼容 quanStockList 已是字符串或对象的情况
      let parsedStockList;
      try {
        parsedStockList =
          typeof quanStockList === "string"
            ? JSON.parse(quanStockList)
            : quanStockList || [];
      } catch (e) {
        // 与单条版行为对齐：解析失败按异常处理，回滚 B1 缓存让下次重试，不做任何同步
        // 不能静默当作空库存（会把规则误同步成禁用状态）
        logger.infoSave("券库存序列化解析失败，跳过该券类型的规则同步", {
          id,
          quan_value,
          error: formatErrInfo(e)
        });
        _lastMaxStockMap.delete(cacheKey);
        continue;
      }
      // 剔除空手机号条目：历史脏数据（phone:""）不参与最大券库存计算，
      // 避免其 quan_stock 影响规则座位数/状态同步
      parsedStockList = parsedStockList.filter(item => item.phone);
      let maxQuanStock = 0;
      if (parsedStockList.length > 0) {
        // Number 转换比较：历史脏数据 quan_stock 可能是字符串（如 "10"），
        // 字符串比较 "10" > "6" 会得出错误结果，导致规则座位数误缩小
        maxQuanStock =
          parsedStockList.reduce((pre, cur) =>
            Number(pre.quan_stock) > Number(cur.quan_stock) ? pre : cur
          )?.quan_stock || 0;
      }
      // B1：maxQuanStock 变化检测，命中缓存（未过期且值相同）→ 跳过该条同步
      const now = Date.now();
      const cached = _lastMaxStockMap.get(cacheKey);
      const isCacheValid =
        cached && now - cached.fetchedAt < MAX_STOCK_CACHE_TTL;
      if (isCacheValid && cached.maxQuanStock === maxQuanStock) {
        logger.infoSave(`最大券库存-${quan_value}-${maxQuanStock}-未变化跳过`, {
          cacheAge: Math.floor((now - cached.fetchedAt) / 1000) + "s"
        });
        continue;
      }
      _lastMaxStockMap.set(cacheKey, { maxQuanStock, fetchedAt: now });
      logger.infoSave(`最大券库存-${quan_value}-${maxQuanStock}`, { id });
      needSyncItems.push({
        id,
        quan_value,
        maxQuanStock,
        quanStockList: parsedStockList
      });
    }
    if (!needSyncItems.length) {
      logger.infoSave(
        "批量规则同步：所有券类型 maxQuanStock 未变化，整体跳过",
        {
          app_name
        }
      );
      return;
    }

    // 2. 一次性查询 app_name 下所有规则，过滤出待同步 quan_value 关联且同步猎人的固定报价规则
    // 用 == 宽松匹配 quanValue，与单条版 checkQuanInRules 逻辑保持一致
    // platOfferList 单条容错解析：某条规则数据损坏只跳过该条，不影响其余规则同步
    const allRules = await queryRulesByApp(app_name, logger);
    const matchedRules = allRules
      .map(item => {
        try {
          return { ...item, platOfferList: JSON.parse(item.platOfferList) };
        } catch (e) {
          logger.infoSave("规则 platOfferList 解析失败，跳过该规则", {
            ruleId: item.id,
            ruleName: item.ruleName,
            error: formatErrInfo(e)
          });
          return null;
        }
      })
      .filter(Boolean)
      .filter(
        item =>
          item.offerType == 1 &&
          item.platOfferList.some(
            offer => offer.platName === "lieren" && offer.isSyncPlat == 1
          ) &&
          needSyncItems.some(i => i.quan_value == item.quanValue)
      );
    if (!matchedRules.length) {
      // 无关联规则：回滚这些 quan_value 的 B1 缓存，避免后续新增关联规则时错过首次同步
      needSyncItems.forEach(i =>
        _lastMaxStockMap.delete(`${app_name}|${i.quan_value}`)
      );
      logger.infoSave("批量规则同步：无关联猎人同步规则", {
        app_name,
        pendingQuanValues: needSyncItems.map(i => i.quan_value)
      });
      return;
    }
    logger.infoSave("批量规则同步：命中关联规则", {
      app_name,
      ruleCount: matchedRules.length,
      ruleIds: matchedRules.map(r => r.id)
    });

    // 3. 涉及规则按 rule.id 去重后逐条同步平台（平台接口无法批量）
    const seenRuleIds = new Set();
    for (const rule of matchedRules) {
      if (seenRuleIds.has(rule.id)) continue;
      seenRuleIds.add(rule.id);
      // 找到该规则对应的同步项（按 quan_value 匹配）
      const matchItem = needSyncItems.find(i => i.quan_value == rule.quanValue);
      if (!matchItem) continue;
      const { maxQuanStock, quanStockList, quan_value, id } = matchItem;
      // 目标座位数，最大券库存超过4时为4，不超过4时为库存数
      let targetSeatNum = maxQuanStock >= 4 ? 4 : maxQuanStock;
      let targetStatus = targetSeatNum == 0 ? "2" : "1"; // 券库存为0时规则状态改为关闭
      if (targetStatus == 2) {
        targetSeatNum = undefined;
      }
      // 禁用规则的座位数无业务意义，禁用时只比较状态，不比较座位数
      const isSameState =
        rule.status == targetStatus &&
        (targetStatus == "2" || rule.seatNum == targetSeatNum);
      if (isSameState) {
        logger.infoSave("规则座位数和状态与目标一致，无需更新", {
          ruleId: rule.id,
          currentSeatNum: rule.seatNum,
          currentStatus: rule.status,
          targetSeatNum,
          targetStatus
        });
        continue;
      }
      logger.infoSave("准备更新机器及猎人平台规则的状态或座位数", {
        ruleId: rule.id,
        currentSeatNum: rule.seatNum,
        currentStatus: rule.status,
        targetSeatNum,
        targetStatus
      });
      const lierenRule = {
        ...rule,
        seatNum: targetSeatNum,
        status: targetStatus
      };
      // B4：用本地规则数据构造平台旧规则快照传入，避免 lierenOfferRuleSyncPlat 内部再调 ruleList
      const cachedPlatRule = {
        state: rule.status == "1" ? 1 : 0,
        seats: formatSeats(rule.seatNum)
      };
      const syncRes = await lierenOfferRuleSyncPlat(lierenRule, cachedPlatRule);
      // 同步失败时不更新本地 DB，避免两边不一致
      if (!syncRes) {
        logger.infoSave("猎人平台同步返回空，跳过本地更新", {
          ruleId: rule.id
        });
        // 同步失败的 quan_value 回滚 B1 缓存，让下次相同 maxQuanStock 还能重新触发
        syncFailQuanValues.add(quan_value);
        continue;
      }

      const platOfferListForDb = syncRes.platOfferList || rule.platOfferList;
      const jiqiuRule = {
        ...rule,
        seatNum: targetSeatNum,
        status: targetStatus,
        allow_offer_time: rule.allow_offer_time || null, // 空字符串传到后端会报错，字段类型不匹配，改为null
        last_used_time: rule.last_used_time || null, // 同上，空字符串不能写入 MySQL datetime
        platOfferList: JSON.stringify(platOfferListForDb),
        is_sync_plat: platOfferListForDb.some(
          o => o.platName === "lieren" && o.isSyncPlat == 1
        )
          ? 1
          : 2
      };
      logger.infoSave("同步修改机器的规则入参", { jiqiuRule });
      await svApi.updateRuleRecord(jiqiuRule);
      // 收集规则变更日志（不再逐条 fire-and-forget，统一批量写入）
      pendingLogs.push({
        rule_id: rule.id,
        rule_name: rule.ruleName,
        shadow_line_name: rule.shadowLineName || app_name,
        operation_type: "quan_stock_change",
        old_status: rule.status,
        new_status: targetStatus,
        old_seat_num: rule.seatNum,
        new_seat_num: targetSeatNum != null ? String(targetSeatNum) : null,
        trigger_source:
          targetStatus === "2" ? "quan_stock_zero" : "quan_stock_update",
        change_reason:
          targetStatus === "2"
            ? `券库存归零(maxQuanStock=0, quan_value=${quan_value})，自动禁用`
            : `券库存变化(maxQuanStock=${maxQuanStock})，更新座位数`,
        success: 1,
        operator: name,
        ext_data: JSON.stringify({
          quan_value,
          maxQuanStock,
          id,
          stockByPhone: quanStockList.map(s => ({
            phone: s.phone?.slice(-4),
            stock: s.quan_stock,
            real: s.real_quan_stock
          }))
        })
      });
    }

    // 4. 批量写入规则操作日志
    if (pendingLogs.length) {
      try {
        await svApi.batchAddRuleOperationLog({ logs: pendingLogs });
        logger.infoSave("批量写入规则操作日志成功", {
          count: pendingLogs.length
        });
      } catch (e) {
        logger.infoSave("批量写入规则操作日志失败", {
          error: formatErrInfo(e),
          count: pendingLogs.length
        });
      }
    }
    // 5. 同步失败的 quan_value 回滚 B1 缓存，下次重新触发
    if (syncFailQuanValues.size) {
      syncFailQuanValues.forEach(qv =>
        _lastMaxStockMap.delete(`${app_name}|${qv}`)
      );
      logger.infoSave("批量规则同步：部分同步失败，回滚 B1 缓存", {
        app_name,
        failQuanValues: Array.from(syncFailQuanValues)
      });
    }
    // 6. 规则状态/座位数已更新到 DB 与平台，刷新本地规则 store：
    //    避免后续出票/报价匹配仍使用过期快照（如规则刚被券库存同步重新启用）；
    //    仅规则实际变更（pendingLogs）时刷新，且异步执行不阻塞券库存同步流程
    if (pendingLogs.length) {
      refreshLocalOfferRuleList(logger)
        .then(refreshed => {
          logger.infoSave("批量规则同步后刷新本地规则store", { refreshed });
        })
        .catch(() => {});
    }
  } catch (error) {
    // B1：同步过程异常时回滚缓存，让下次相同 maxQuanStock 还能重新触发同步
    // 仅回滚真正进入同步流程的 needSyncItems，B1 命中跳过的项保持缓存（避免异常路径下缓存命中率下降）
    needSyncItems.forEach(item =>
      _lastMaxStockMap.delete(`${app_name}|${item.quan_value}`)
    );
    logger.infoSave("批量根据券库存检查猎人固定报价规则更新座位数异常", {
      error: formatErrInfo(error),
      app_name,
      needSyncItemsSafe: needSyncItems.map(i => ({
        id: i.id,
        quan_value: i.quan_value
      }))
    });
  }
}

/**
 * 获取券类型列表并异步更新券库存
 * @param {Object} params - 参数对象
 * @param {Object} params.order - 订单信息
 * @param {Function} params.getQuanListByPhone - 获取优惠券列表的函数
 * @param {Object} [params.extraParams] - 额外参数，如 city_id, cinema_id 等
 * @param {Object} [params.logger] - 日志管理类实例
 * @returns {Array} quanTypeList - 处理后的券类型列表
 */
export async function getQuanTypeListByApp({
  order,
  getQuanListByPhone,
  extraParams = {},
  logger
}) {
  const { app_name } = order;
  let useMobileList = getCinemaLoginInfoList()
    .filter(
      item => item.app_name === app_name && item.mobile && item.session_id
    )
    .map(item => item.mobile);
  const params = {
    app_name,
    isNeedTotalNum: 0,
    queryFields: "id,app_name,quan_value,quan_flag,black_quans,quanStockList"
  };
  try {
    let quanTypeRes = await svApi.queryQuanTypeList(params);
    let quanTypeList = quanTypeRes?.data?.quanTypeList || [];
    quanTypeList.forEach(item => {
      item.quanStockList = item.quanStockList
        ? JSON.parse(item.quanStockList)
        : [];
      // 只拿关联账号的券库存信息进行判断
      const quanStockListByPhone = item.quanStockList.filter(itemA =>
        useMobileList.includes(itemA.phone)
      );
      item.quan_stock = item.quan_stock || 0;
      if (quanStockListByPhone?.length) {
        // 最大数当做券库存
        let maxNum = 0;
        quanStockListByPhone.forEach(itemA => {
          if (+itemA.quan_stock > maxNum) {
            maxNum = +itemA.quan_stock;
          }
        });
        item.quan_stock = maxNum;
      }
      item.quanStockListByPhone = quanStockListByPhone.slice();
    });
    console.log("quanTypeList", quanTypeList);
    // 异步更新券库存（内部独立 logger，不再复用调用方 logger）
    syncUpdateQuanStock({
      order,
      quanTypeList,
      getQuanListByPhone,
      extraParams
    });
    return quanTypeList;
  } catch (error) {
    logger.errorSave("根据影院获取券类型列表返回异常", {
      error: formatErrInfo(error)
    });
  }
}

/**
 * 在券库存过滤之后，按日出票券数限制再过滤固定报价规则
 * 流程：传入可用手机号，用 quanStockListByPhone 过滤得到真正的可用手机号；
 *       再调接口获取当天各手机号在该影院的已出票券数，
 *       用 日出票券数 - 已出票券数 与订单票数对比，不满足的规则过滤掉
 * @param {Object} params
 * @param {Array} params.fixedAmountRuleList - 经券库存过滤后的固定报价规则列表
 * @param {Array} params.appQuanTypeList - 券类型列表（含 quanStockListByPhone）
 * @param {Array} params.useMobileList - 调用方传入的可用手机号列表（如该影院登录账号手机号）
 * @param {Object} params.order - 订单 { app_name, ticket_num }
 * @param {Object} [params.logger] - 日志
 * @returns {Promise<Array>} 过滤后的固定报价规则列表
 */
export async function filterFixedRulesByDailyTicketCount({
  fixedAmountRuleList,
  appQuanTypeList,
  useMobileList,
  order,
  logger
}) {
  console.log("filterFixedRulesByDailyTicketCount params", {
    fixedAmountRuleList,
    appQuanTypeList,
    useMobileList,
    order
  });
  if (!fixedAmountRuleList?.length) return fixedAmountRuleList;
  const { app_name, ticket_num } = order;
  const loginList = getCinemaLoginInfoList().filter(
    item => item.app_name === app_name && item.mobile && item.session_id
  );
  console.log("filterFixedRulesByDailyTicketCount loginList", loginList);
  // 1. 传入的可用手机号通过 quanStockListByPhone 过滤一遍，得到真正的可用手机号（有对应券且库存>=订单票数）
  let realAvailableMobiles = (useMobileList || []).filter(mobile => {
    return fixedAmountRuleList.some(rule => {
      const quanValues = rule.quanValue?.split(",") || [];
      return appQuanTypeList.some(itemA => {
        if (!quanValues.includes(itemA.quan_value)) return false;
        if (itemA.quan_stock < ticket_num) return false;
        const byPhone = itemA.quanStockListByPhone || [];
        return byPhone.some(
          p => p.phone === mobile && Number(p.quan_stock) >= ticket_num
        );
      });
    });
  });
  console.log("realAvailableMobiles", realAvailableMobiles);

  if (!realAvailableMobiles.length) return fixedAmountRuleList;
  // 2. 用真正的可用手机号列表调接口获取当天各手机号在该影院的已出票券数
  let todayCountMap = {};
  try {
    const usedRes = await svApi.getLoginDailyTicketUsedCount({
      app_name,
      mobile_list: realAvailableMobiles
    });
    let list = usedRes?.data?.list || [];
    // list = [{ mobile: "13073795001", daily_count: 7 }];
    console.log("getLoginDailyTicketUsedCount list", list);
    list.forEach(it => {
      const mobile = it.mobile;
      if (realAvailableMobiles.includes(mobile)) {
        todayCountMap[mobile] = Number(it.daily_count ?? it.count ?? 0) || 0;
      }
    });
  } catch (e) {
    logger?.infoSave?.("获取登录今日出票数失败，日出票券数过滤按不限制处理", {
      error: formatErrInfo(e)
    });
  }
  console.log("todayCountMap", todayCountMap);
  // 3. 日出票券数 - 已出票券数 >= 订单票数 才满足；不满足的固定报价规则过滤掉
  const filtered = fixedAmountRuleList.filter(rule => {
    const quanValues = rule.quanValue?.split(",") || [];
    const matchingQuanTypes = appQuanTypeList.filter(
      itemA =>
        quanValues.includes(itemA.quan_value) && itemA.quan_stock >= ticket_num
    );
    console.log("matchingQuanTypes for rule", rule.id, matchingQuanTypes);
    for (const q of matchingQuanTypes) {
      console.log(
        "checking quanStockListByPhone for quanType",
        q.id,
        q.quanStockListByPhone
      );
      for (const p of q.quanStockListByPhone || []) {
        if (Number(p.quan_stock) < ticket_num) continue;
        const mobile = p.phone;
        const login = loginList.find(l => l.mobile === mobile);
        const limit = login?.daily_ticket_count;
        if (limit == null || limit === "" || Number(limit) <= 0) return true;
        const used = todayCountMap[mobile] ?? 0;
        const remaining = Number(limit) - used;
        if (remaining >= ticket_num) return true;
      }
    }
    return false;
  });
  if (filtered.length < fixedAmountRuleList.length) {
    logger?.infoSave?.("按日出票券数过滤后的固定报价规则列表", {
      before: fixedAmountRuleList.length,
      after: filtered.length,
      todayCountMap,
      realAvailableMobiles
    });
  }
  console.log("filtered", filtered);
  return filtered;
}
