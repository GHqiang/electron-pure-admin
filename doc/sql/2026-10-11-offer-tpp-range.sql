-- 规则表「原价(tpp_price)报区间」：noOfferTppRule 改名为 offerTppRange（类型/注释一并调整）
-- 关联设计：doc/plans/2026-10-11-原价报区间（tpp_price）详细设计.md
-- 关联计划：doc/plans/2026-10-11-原价报区间（tpp_price）实施计划.md（Task 1）
--
-- 背景：上一版列 noOfferTppRule（原价"不报"条件）已于 2026-10-11 生产执行且从未配置数据；
--   现需求变更为「原价报区间」，该列改名并收敛为单区间字符串：
--     下限-上限（闭区间，含端点）；端点可留空，下限空=0，上限空=正无穷；NULL=未配置（不限制）。
--   旧列无数据，改名等价于新列，无需数据迁移。
--
-- 执行顺序：必须先于客户端发版执行；若客户端先发版，保存规则时会走缺列兜底
--   （剔除该字段重试并提示"数据库尚未升级"，不会导致整条规则保存失败）。

ALTER TABLE rule_record
  CHANGE COLUMN noOfferTppRule offerTppRange VARCHAR(64) NULL DEFAULT NULL
  COMMENT '原价报区间：下限-上限(闭区间，含端点)；端点可留空，下限空=0，上限空=正无穷。未配置=不限制';

-- 校验列已改名
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'rule_record'
  AND COLUMN_NAME = 'offerTppRange';

-- 校验旧列已不存在
SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rule_record'
  AND COLUMN_NAME = 'noOfferTppRule';

-- 校验无历史数据（应返回 0）
SELECT COUNT(*) AS not_null_cnt FROM rule_record WHERE offerTppRange IS NOT NULL;

-- 回滚（如需）
-- ALTER TABLE rule_record
--   CHANGE COLUMN offerTppRange noOfferTppRule VARCHAR(255) NULL DEFAULT NULL
--   COMMENT '原价(tpp_price)不报条件：分号分隔多条，命中任一即不报';
