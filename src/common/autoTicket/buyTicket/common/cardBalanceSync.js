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
  if (!appFlag || !cardList?.length) return;

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
