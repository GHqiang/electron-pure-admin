-- 规则表新增「原价(tpp_price)不报」条件列
-- 关联设计：doc/plans/2026-10-11-原价不报（tpp_price）详细设计.md
-- 关联计划：doc/plans/2026-10-11-原价不报实施计划.md（Task 1）
--
-- 用途：
--   报价前按订单原价过滤规则：原价超过阈值、或落在区间内时，该规则不参与报价。
--   条件由客户端解析，分号分隔多条，命中任一即不报：
--     >50 / >=50 / <30 / <=30   比较条件
--     30-80                     区间内（闭区间，含端点）
--     !30-80                    区间外
--   NULL = 未配置（存量规则行为完全不变）。
--
-- 执行顺序：必须先于客户端发版执行；若客户端先发版，保存规则时会走缺列兜底
--   （剔除该字段重试并提示"数据库尚未升级"，不会导致整条规则保存失败）。

ALTER TABLE rule_record
  ADD COLUMN noOfferTppRule VARCHAR(255) NULL DEFAULT NULL
  COMMENT '原价(tpp_price)不报条件：分号分隔多条，命中任一即不报。>50 超过50；>=50 不低于50；<30 低于30；<=30 不高于30；30-80 区间内(闭区间)；!30-80 区间外';

-- 校验列已创建
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'rule_record'
  AND COLUMN_NAME = 'noOfferTppRule';

-- 回滚（如需）
-- ALTER TABLE rule_record DROP COLUMN noOfferTppRule;
