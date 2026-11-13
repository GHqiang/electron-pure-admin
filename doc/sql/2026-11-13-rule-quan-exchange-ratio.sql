-- 规则表「券兑换比例」：乐影 N 张券抵 1 张票
-- 关联设计：docs/superpowers/specs/2026-10-30-乐影同种券一票多张-design.md
-- 关联说明：doc/changes/2026-10-30-乐影券兑换比例一票多张整改说明.md
--
-- 语义：每张票消耗的券张数。NULL / 1 = 一票一券（默认，等价于本功能上线前）；
--   2 = 2 张券兑 1 张票。仅「乐影(sfc_applet) + 内部角色 + 固定报价 + 单券类型 + 不同步猎人」可配，
--   其余情况客户端保存时会清空为 NULL。
--
-- 执行顺序：必须先于后端发布执行（后端 queryOfferInfo 会 LEFT JOIN 该列，
--   列不存在会导致 Unknown column 并使所有系列的出票查询失败）。
--   若客户端先发版，保存规则时走缺列兜底（剔除字段重试并提示），不会导致整条规则保存失败。

ALTER TABLE rule_record
  ADD COLUMN quanExchangeRatio TINYINT UNSIGNED NULL DEFAULT NULL
  COMMENT '券兑换比例：每票消耗券张数，空/1=一票一券（仅乐影固定报价）'
  AFTER offerTppRange;

-- 校验列已存在且类型正确
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'rule_record'
  AND COLUMN_NAME = 'quanExchangeRatio';

-- 校验存量规则均为未配置（应返回 0）
SELECT COUNT(*) AS configured_cnt FROM rule_record WHERE quanExchangeRatio IS NOT NULL;

-- 回滚（如需）
-- ALTER TABLE rule_record DROP COLUMN quanExchangeRatio;
