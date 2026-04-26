// 公共券库存更新逻辑
import {
  getCurrentTime,
  couponInfoSpecial,
  getCinemaLoginInfoList,
  formatErrInfo,
  logUpload
} from "@/utils/utils";
import svApi from "@/api/sv-api";
// 猎人规则同步相关方法
import useLierenOfferRuleSyncFun from "@/mixins/useLierenOfferRuleSyncFun";
const { lierenOfferRuleSyncPlat } = useLierenOfferRuleSyncFun();

import { platTokens } from "@/store/platTokens";
const {
  userInfo: { rule }
} = platTokens();
/**
 * 异步更新券库存
 * @param {Object} params - 参数对象
 * @param {Object} params.order - 订单信息
 * @param {Array} params.quanTypeList - 券类型列表
 * @param {Function} params.getQuanListByPhone - 获取优惠券列表的函数
 * @param {Object} [params.extraParams] - 额外参数，如 city_id, cinema_id 等
 * @param {Object} [params.logger] - 日志管理类实例
 */
export async function syncUpdateQuanStock({
  order,
  quanTypeList,
  getQuanListByPhone,
  extraParams = {},
  logger
}) {
  const { app_name, plat_name, order_number } = order;
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
    if (!isNeedUpdate) {
      logger.infoSave("不满足更新条件");
    } else {
      // 只要有一个需要更新，就全部更新，因为会获取该号全部的券
      needUpdateQuanTypeList = quanTypeList;
      console.log("needUpdateQuanTypeList", needUpdateQuanTypeList);

      let quanTypeListParams = needUpdateQuanTypeList.map(item => {
        return {
          id: item.id,
          quan_flag: item.quan_flag,
          quan_value: item.quan_value,
          black_quans: item.black_quans,
          quanStockList: item.quanStockList.map(itemA => ({
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
          logger
        });

        quanTypeListParams.forEach(item => {
          let targetQuanList = quanListAll.filter(
            itemA =>
              couponInfoSpecial(item.quan_flag) ===
                couponInfoSpecial(itemA.coupon_info) &&
              !item.black_quans?.includes(itemA.coupon_num)
          );
          console.log(item.quan_flag, "targetQuanList", targetQuanList);

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
          console.log("quanStockList", quanStockList);
          let inx = quanStockList.findIndex(itemB => itemB.phone === mobile);
          let endDateTime = targetQuanList.sort(
            (a, b) => new Date(a.endDateTime) - new Date(b.endDateTime)
          )?.[0]?.endDateTime;
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
        });
      }
      console.log("quanTypeListParams", quanTypeListParams);
      let updateTypeList = quanTypeListParams.map(item => ({
        id: item.id,
        quan_value: item.quan_value,
        quanStockList: item.quanStockList,
        update_time: getCurrentTime()
      }));
      logger.infoSave("最终要更新的券类型列表", { updateTypeList });
      for (let index = 0; index < updateTypeList.length; index++) {
        const item = updateTypeList[index];
        // 单个更新
        await singleUpdateQuanStock({
          id: item.id,
          app_name,
          quan_value: item.quan_value,
          quanStockList: JSON.stringify(item.quanStockList),
          update_time: item.update_time,
          logger
        });
      }
    }
  } catch (error) {
    logger.infoSave("异步更新券库存异常", { error: formatErrInfo(error) });
  } finally {
    logger.logUpload();
  }
}

// 单个更新券库存
export async function singleUpdateQuanStock(obj) {
  const { logger, app_name, quan_value, ...params } = obj;
  try {
    const res = await svApi.updateQuanType(params);
    logger.infoSave("单个更新券库存返回", { res, params });
    // 根据券库存检查猎人固定报价规则更新座位数
    checkLierenFixedRuleByQuanStock(obj);
  } catch (error) {
    logger.infoSave("单个更新券库存异常", {
      error: formatErrInfo(error),
      params
    });
  }
}

// 根据券库存检查猎人固定报价规则更新座位数
async function checkLierenFixedRuleByQuanStock(obj) {
  let { logger, id, app_name, quan_value, quanStockList } = obj;
  try {
    quanStockList = JSON.parse(quanStockList);
    let maxQuanStock = quanStockList.reduce((pre, cur) => {
      return pre.quan_stock > cur.quan_stock ? pre : cur;
    })?.quan_stock;
    logger.infoSave("最大券库存", {
      id,
      quan_value,
      maxQuanStock
    });
    let usedRules = await checkQuanInRules(app_name, quan_value);
    // 一个规则含多个券类型的先不处理，仅过滤一个券类型的规则
    usedRules = usedRules
      .map(item => ({
        ...item,
        platOfferList: JSON.parse(item.platOfferList)
      }))
      .filter(
        item =>
          item.status == 1 &&
          item.quanValue == quan_value &&
          item.platOfferList.find(offer => offer.platName === "lieren")
            ?.isSyncPlat == 1
      );
    if (!usedRules.length) return;
    logger.infoSave("该券类型关联的同步到猎人平台的规则", {
      usedRules
    });
    usedRules.forEach(rule => {
      // 目标座位数，最大券库存超过4时为4，不超过4时为库存数
      let targetSeatNum = maxQuanStock >= 4 ? 4 : maxQuanStock;
      let status = targetSeatNum == 0 ? "2" : "1"; // 券库存为0时规则状态改为关闭
      if (status == 2) {
        targetSeatNum = undefined;
      }
      const lierenRule = {
        ...rule,
        seatNum: rule.seatNum || targetSeatNum,
        status
      };
      logger.infoSave("准备同步到猎人的规则", {
        lierenRule
      });
      lierenOfferRuleSyncPlat(lierenRule);
      const jiqiuRule = {
        ...rule,
        seatNum: rule.seatNum || targetSeatNum,
        status,
        platOfferList: JSON.stringify(rule.platOfferList)
      };
      logger.infoSave("同步修改机器的规则入参", {
        jiqiuRule
      });
      svApi.updateRuleRecord(jiqiuRule);
    });
    // 根据quan_value检查都有哪些规则在使用且同步了平台，更新平台规则的座位数
  } catch (error) {
    logger.infoSave("根据券库存检查猎人固定报价规则更新座位数", {
      error: formatErrInfo(error),
      obj
    });
  }
}

// 检查券是否在报价规则中被使用
async function checkQuanInRules(app_name, quan_value) {
  try {
    const res = await svApi.queryRuleList({
      shadowLineName: app_name,
      rule
    });
    let ruleRecords = res.data.ruleList || [];
    ruleRecords = ruleRecords.filter(item => {
      const quanValueArray = item.quanValue ? item.quanValue.split(",") : [];
      return (
        item.shadowLineName === app_name && quanValueArray.includes(quan_value)
      );
    });
    return ruleRecords;
  } catch (error) {
    console.error("检查券在规则中使用情况异常", error);
    return [];
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
    // 异步更新券库存
    syncUpdateQuanStock({
      order,
      quanTypeList,
      getQuanListByPhone,
      extraParams,
      logger
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
