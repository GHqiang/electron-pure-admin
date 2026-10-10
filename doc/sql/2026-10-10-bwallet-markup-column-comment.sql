-- 更新 rule_record.bWalletMarkup 字段注释
-- 关联说明：doc/changes/2026-09-30-猎人B钱包加价报价整改说明.md 第 12 节（§12.12）
--
-- 用途：
--   当 rule_record.bWalletMarkup 列已存在、但注释仍是旧文案
--   （「B钱包加价：仅未同步猎人平台的规则生效，一般为正数」）时，用本脚本更新为新注释。
--   若该列尚未创建：直接用本脚本的 COMMENT 建列即可，不必先建后改。
--
-- 新注释口径：
--   未同步猎人平台的规则 —— B钱包加价由本地报价叠加；
--   已同步猎人平台的规则 —— 随规则同步到平台 extra_amount，由平台报价时相加。

-- 更新列注释（列类型保持不变）
ALTER TABLE rule_record
  MODIFY COLUMN bWalletMarkup DECIMAL(10,2) NULL DEFAULT NULL
  COMMENT 'B钱包加价：未同步规则本地叠加；已同步规则随规则同步到平台（折扣模式为折扣值、其余为固定值）';

-- 校验注释
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'rule_record'
  AND COLUMN_NAME = 'bWalletMarkup';