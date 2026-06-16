/**
 * 会员卡余额同步模块
 *
 * 职责：将各影院平台返回的实时卡余额同步回 SV 数据库 cardRecord 表
 *
 * 用法：各系列 cardQuanManage.getCardList() 返回前调用
 *
 *   const cardList = await this.getCardList(params);
 *   syncCardBalanceToSv({
 *     appFlag: this.appFlag,
 *     cardList,
 *     logger: this.logger,
 *     getCardId: item => item.cardNo,
 *     getBalance: item => item.balance,
 *     balanceDivisor: 100
 *   }).catch(e => this.logger.warn?.("余额同步异常(不影响主流程)", e));
 *   return cardList;
 */

import svApi from "@/api/sv-api";
import { formatErrInfo } from "@/utils/utils";

/**
 * 将各平台实时卡余额同步到 SV 数据库
 *
 * @param {Object} params
 * @param {string} params.appFlag        - 影院标识（app_name）
 * @param {Array}  params.cardList       - getCardList 返回的实时卡列表
 * @param {Object} [params.logger]       - 可选 logger（需有 infoSave/warn 方法）
 * @param {Function} [params.getCardNum]  - 从平台卡对象中提取 SV card_num，默认 item.cardNo
 * @param {Function} [params.getBalance] - 从平台卡对象中提取余额（原始值），默认 item.cardAmount
 * @param {number}  [params.balanceDivisor] - 余额除数（万达以分为单位传 100），默认 1
 */
export async function syncCardBalanceToSv({
  appFlag,
  cardList,
  logger,
  getCardNum = item => item.cardNo,
  getBalance = item => item.cardAmount,
  balanceDivisor = 1
}) {
  if (!appFlag || !cardList?.length) {
    logger.infoSave("同步多张卡余额参数不足", { appFlag, cardList });
    return;
  }

  // 构建批量更新数据
  const balanceList = [];
  for (const card of cardList) {
    const cardNum = getCardNum(card);
    const rawBalance = getBalance(card);
    if (cardNum == null || rawBalance == null) continue;

    const balance = ((Number(rawBalance) || 0) / balanceDivisor).toFixed(2);
    balanceList.push({
      app_name: appFlag,
      card_num: String(cardNum),
      balance
    });
  }

  if (!balanceList.length) return;

  try {
    await svApi.batchUpdateCardBalance({ balanceList });
    logger?.infoSave?.("会员卡余额批量同步完成", {
      balanceList,
      appFlag,
      syncCount: balanceList.length
    });
  } catch (error) {
    logger?.warn?.("会员卡余额批量同步失败(不影响主流程)", {
      balanceList,
      appFlag,
      count: balanceList.length,
      error: formatErrInfo(error)
    });
  }
}

/**
 * 出票后同步单张卡的余额（用卡支付后更新余额）
 *
 * 用法：各系列 buyTicket 支付成功后调用
 *
 *   syncCardAfterPayment({
 *     appFlag: this.appFlag,
 *     cardId,
 *     cardBalance,      // 卡余额（如 100.00）
 *     paymentAmount,      // 卡支付余额（如 30.00）
 *     logger: this.logger
 *   }).catch(e => this.logger.warn?.("出票后同步余额异常", e));
 *
 * @param {Object} params
 * @param {string} params.appFlag    - 影院标识（app_name）
 * @param {string} params.cardId    - 卡id（对应 SV 库 card_id）
 * @param {number} params.cardBalance - 卡余额
 * @param {number} params.paymentAmount - 卡支付余额
 * @param {Object} [params.logger]   - 可选 logger
 */
export async function syncCardAfterPayment({
  appFlag,
  cardId,
  cardBalance,
  paymentAmount,
  logger
}) {
  if (!appFlag || !cardId || !cardBalance || !paymentAmount) {
    logger?.infoSave?.("出票后同步单张卡余额参数不足", {
      appFlag,
      cardId,
      cardBalance,
      paymentAmount
    });
    return;
  }

  const balance = Math.max(0, cardBalance - paymentAmount).toFixed(2);
  const params = {
    card_id: cardId,
    app_name: appFlag,
    balance: balance
  };
  try {
    const res = await svApi.updateCardBalance(params);
    logger?.infoSave?.("出票后同步单张卡余额返回", {
      res,
      params
    });
  } catch (error) {
    logger?.warn?.("出票后会员卡余额同步失败(不影响主流程)", {
      appFlag,
      cardId,
      balance,
      error: formatErrInfo(error)
    });
  }
}
