/**
 * 报价流程的通用工具方法（跨系列复用）
 *
 * ## 边界/约定
 * - **只做报价计算相关的纯逻辑**：不请求接口，不改数据库
 * - **显式传参**：不依赖 `this`，各系列 `offerManage` 直接调用
 * - **系列差异通过参数注入**：如 `groupList`、`noFeePlatList`、`feeRate`
 *
 * ## 为什么要抽
 * SFC/UME/LMA/辰星/凤凰等系列的报价计算“骨架”高度一致：
 * 动态调价 → 利润加价 → 夜间顶价 → 超限处理 → 成本/利润拆分。
 * 抽到这里后，新增/修改规则只需要改一处。
 */
import { calcCount, roundToHalf } from "@/utils/utils";
import { ONE_STEP_PLAT_LIST } from "@/common/constant";

/**
 * 动态调价（跟随本地配置 `adjustPrice`）
 *
 * 规则概述（保持与旧实现一致）：
 * - `adjustPrice` 为空：不调价
 * - 达到“进单/出单”阈值后，对基础报价做 +/- 调整
 *
 * @param {Object} params
 * @param {number} params.basePrice - 基础报价（规则报价）
 * @param {Array} [params.offerList] - 历史报价列表（用于 calcCount）
 * @param {Object} [params.logger] - logger（可选）
 * @returns {number} 调整后的报价
 */
export function applyDynamicPricing({ basePrice, offerList, logger }) {
  const adjustPrice = window.localStorage.getItem("adjustPrice");
  if (!adjustPrice) return basePrice;
  try {
    const adjustConfig = JSON.parse(adjustPrice);
    const lierenMachineOfferList = offerList || [];
    const countRes = calcCount(lierenMachineOfferList);
    const { inCount, outCount, inPrice, outPrice } = adjustConfig;

    if (countRes.inCount && inPrice && countRes.inCount >= inCount) {
      const newPrice = basePrice + Number(inPrice);
      logger?.infoSave?.(`动态调价后的价格-${newPrice}, 增加了-${inPrice}`);
      return newPrice;
    } else if (countRes.outCount && outPrice && countRes.outCount >= outCount) {
      const newPrice = basePrice - Number(outPrice);
      logger?.infoSave?.(`动态调价后的价格-${newPrice}, 降低了-${outPrice}`);
      return newPrice;
    }
  } catch (error) {
    logger?.errorSave?.("动态调价处理异常", error);
  }
  return basePrice;
}

/**
 * 利润加价（节假日/单店加价等，本地配置 `profitAddPrice`）
 *
 * @param {Object} params
 * @param {number} params.price - 当前报价
 * @param {string} params.offerType - 报价类型（"1"=券固定报价，其它一般为会员价加价）
 * @param {string} params.appFlag - 影院标识
 * @param {Array<string>} params.groupList - 分组名单（命中时不做利润加价）
 * @param {Object} [params.logger]
 * @returns {number} 调整后的报价
 */
export function applyProfitAddition({
  price,
  offerType,
  appFlag,
  groupList,
  logger
}) {
  if (offerType !== "1" && !(groupList || []).includes(appFlag)) {
    let profitAddPrice = window.localStorage.getItem("profitAddPrice");
    profitAddPrice = profitAddPrice ? Number(profitAddPrice) : 0;
    const out = price + profitAddPrice;
    if (profitAddPrice) logger?.infoSave?.(`应用利润加价：${profitAddPrice}`);
    return out;
  }
  return price;
}

/**
 * 夜间顶价（本地开关 `isOpenisNightMaxPrice`）
 *
 * 规则：凌晨 1 点到 6 点（含）将报价提升至平台限价（supplier_max_price）
 *
 * @param {Object} params
 * @param {number} params.price
 * @param {number} params.supplier_max_price
 * @param {Object} [params.logger]
 * @returns {number}
 */
export function applyNightMaxPrice({ price, supplier_max_price, logger }) {
  const isNightMaxPriceEnabled =
    localStorage.getItem("isOpenisNightMaxPrice") == 1;
  const currentHour = new Date().getHours();
  if (isNightMaxPriceEnabled && currentHour >= 1 && currentHour <= 6) {
    logger?.infoSave?.("开启夜间顶价");
    return Number(supplier_max_price);
  }
  return price;
}

/**
 * 将价格调整为平台限价（含平台差异：蚂蚁/洋葱向下取整，其它按 0.5 或 0.1 向下取整）
 *
 * @param {Object} params
 * @param {number} params.price
 * @param {number} params.supplier_max_price
 * @param {string} params.plat_name
 * @returns {number}
 */
export function adjustToMaxPrice({ price, supplier_max_price, plat_name }) {
  const max = Number(supplier_max_price);
  if (["mayi", "yangcong"].includes(plat_name)) {
    return Math.floor(max);
  }
  return roundToHalf(
    max,
    ONE_STEP_PLAT_LIST.includes(plat_name) ? 0.1 : 0.5,
    "down"
  );
}

/**
 * 超限处理（本地开关 `isOverrunOffer`）
 *
 * @returns {Promise<number|null>} 允许报价则返回调整后的价格；不允许报价返回 null
 */
export async function handleOverrunCheck({
  price,
  supplier_max_price,
  plat_name,
  logger
}) {
  if (price <= Number(supplier_max_price)) return price;
  const isOverrunOfferEnabled =
    window.localStorage.getItem("isOverrunOffer") === "1";
  if (!isOverrunOfferEnabled) {
    logger?.errorSave?.(
      `最终报价${price}超过平台限价${supplier_max_price}，超限报价处于关闭状态不进行报价`
    );
    return null;
  }
  const adjusted = adjustToMaxPrice({ price, supplier_max_price, plat_name });
  logger?.infoSave?.("调整最终报价为平台限价四舍五入去整");
  return adjusted;
}

/**
 * 计算手续费/奖励/真实成本/最大可接受成本等通用数值
 *
 * 说明：
 * - 手续费默认按 1%（旧逻辑：`price * 1%`）
 * - `noFeePlatList` 命中平台：手续费为 0（你提到的 NO_FEE_PLAT_LIST）
 * - 返回的 `maxCostPrice` 用于后续“券类型过滤（成本必须 < maxCostPrice 才有利润）”
 *
 * @param {Object} params
 * @param {number} params.adjustedPrice
 * @param {number} params.cost_price
 * @param {number} params.rewards - 0~100
 * @param {string} params.plat_name
 * @param {number} [params.feeRate=0.01] - 默认 1%
 * @param {Array<string>} [params.noFeePlatList=[]] - 免手续费平台名单
 * @param {Object} [params.logger]
 * @returns {{
 *  shouxufei:number,
 *  rewardPrice:number,
 *  pay_cost_price:number,
 *  real_cost_price:string,
 *  expectProfit:string,
 *  maxCostPrice:number
 * }}
 */
export function calcOfferCostProfitParts({
  adjustedPrice,
  cost_price,
  rewards,
  plat_name,
  feeRate = 0.01,
  noFeePlatList = [],
  logger
}) {
  let shouxufei = (Number(adjustedPrice || 0) * 100) / 10000;
  if ((noFeePlatList || []).includes(plat_name)) shouxufei = 0;
  // 若后续需要支持非 1% 手续费，可通过 feeRate 扩展；当前保持与旧逻辑一致（1%）
  if (feeRate !== 0.01) {
    shouxufei = Number(adjustedPrice || 0) * Number(feeRate || 0);
  }

  const rewardPrice =
    rewards > 0 ? (Number(adjustedPrice || 0) * 100 * rewards) / 10000 : 0;
  const pay_cost_price = Number(cost_price || 0) + Number(shouxufei || 0);
  const real_cost_price = (pay_cost_price - rewardPrice).toFixed(2);
  const expectProfit = (Number(adjustedPrice || 0) - Number(real_cost_price)).toFixed(2);

  const maxCostPrice =
    (Number(adjustedPrice || 0) * 1000 +
      rewardPrice * 1000 -
      Number(shouxufei || 0) * 1000) /
    1000;

  logger?.infoSave?.("calcOfferCostProfitParts", {
    adjustedPrice,
    cost_price,
    rewards,
    plat_name,
    shouxufei,
    rewardPrice,
    pay_cost_price,
    real_cost_price,
    expectProfit,
    maxCostPrice
  });

  return {
    shouxufei,
    rewardPrice,
    pay_cost_price,
    real_cost_price,
    expectProfit,
    maxCostPrice
  };
}

