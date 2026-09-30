// 数据库缺列兜底判定（无依赖，便于单测直接引入）
//
// 背景：新字段（规则表的 bWalletMarkup、报价记录表的 pay_type/b_wallet_markup）需要 DDL 先于
// 客户端发版执行。若客户端先上线，写库会报 "Unknown column 'xxx'"，导致：
// - 规则表：整条规则无法新增/编辑
// - 报价记录表：整条报价记录写不进去（出票流程依赖报价记录，影响更大）
// 识别出该类错误后可剔除新增字段重试一次，DDL 执行后这些分支不再触发。

/**
 * 判断是否为"缺列"类报错，且缺的是给定列之一
 * 兼容后端 failRes 的 msg 字段与 mysql 驱动的 sqlMessage/message 字段
 * @param {Object} error - 接口/驱动抛出的错误对象
 * @param {string[]} columns - 关注的新增列名
 * @returns {boolean}
 */
export const isUnknownColumnError = (error, columns = []) => {
  const msg = String(error?.msg || error?.sqlMessage || error?.message || "");
  if (!/Unknown column/i.test(msg)) return false;
  return columns.some(column => msg.includes(column));
};

// 规则表 rule_record 缺 bWalletMarkup 列
export const isUnknownBWalletMarkupError = error =>
  isUnknownColumnError(error, ["bWalletMarkup"]);

// 报价记录表 offer_record / offer_record_fail 缺钱包字段
export const isUnknownWalletRecordColumnError = error =>
  isUnknownColumnError(error, ["pay_type", "b_wallet_markup"]);
