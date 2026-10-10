-- 存量已同步猎人平台规则：批量刷 B钱包加价（bWalletMarkup = 1）
-- 关联说明：doc/changes/2026-09-30-猎人B钱包加价报价整改说明.md 第 12 节（第三轮，§12.11）
--
-- 背景：
--   非同步猎人平台的规则，B钱包加价由本地报价叠加（现状不变）；
--   已同步猎人平台的规则，本地不参与算价，需把 B钱包加价同步到平台 extra_amount（由平台报价时相加）。
--   本脚本把目标规则 bWalletMarkup 统一刷成 1，
--   之后由客户端控制台一次性执行 window.pushLierenExtraAmountToPlat()（§12.5-a）把该值推到平台 extra_amount。
--
-- 推送范围约束（重要）：
--   该推送函数的过滤条件与下方 WHERE 完全一致（is_sync_plat / offerType / rule / status），
--   执行推送时必须用 rule = 2 的账号登录，否则推送集合会与本次刷数集合不一致。
--
-- 前置条件：
--   rule_record.bWalletMarkup 列已存在（§11.4 / §12.3-c 的 DDL，已执行），
--   列注释如需更新见 2026-10-10-bwallet-markup-column-comment.sql。
--
-- 范围口径（用户指定，2026-10-10 修订：账号 rule 由 3 改为 2）：
--   is_sync_plat = 1     —— 已同步平台（当前仅猎人）
--   offerType    = 1     —— 固定价（只有固定价规则会同步到猎人）
--   rule = 2             —— 指定账号（内部账号 rule=2）
--   status IN ('1','3')  —— 指定有效状态（注意：不再使用 NOT status = '4'）
--
-- 执行顺序：⓪ 备份 → ① 预览 → ② 刷数 → ③ 校验（④ 回滚默认注释，按需使用）

-- ⓪ 备份刷数前的现值（必须）：
--   平台侧 extra_amount 无法用 SQL 回滚，纠偏只能"按备份值再推一次"，
--   故刷数前必须留下 id + 现值，供回退时重新推送覆盖。
--   注：若该备份表已存在（例如曾用 rule=3 的旧口径执行过），说明已有一份备份，
--   请先核对既有备份内容，再决定复用或改用新的表名，不要为了重跑而 DROP 首次备份。
CREATE TABLE rule_record_bwallet_bak_20261010 AS
SELECT id, rule, shadowLineName, offerType, is_sync_plat, status, bWalletMarkup
FROM rule_record
WHERE is_sync_plat = 1 AND offerType = 1 AND rule = 2 AND status IN ('1', '3');

-- ① 执行前预览：核对将命中的规则条数与名单（留意已有非空值会被覆盖）
SELECT id, rule, shadowLineName, offerType, is_sync_plat, bWalletMarkup, status
FROM rule_record
WHERE is_sync_plat = 1
  AND offerType = 1
  AND rule = 2
  AND status IN ('1', '3')
ORDER BY shadowLineName;

-- ② 刷数：命中规则 B钱包加价统一置 1
UPDATE rule_record
SET bWalletMarkup = 1
WHERE is_sync_plat = 1
  AND offerType = 1
  AND rule = 2
  AND status IN ('1', '3');

-- ③ 执行后校验：命中总数与已置 1 的数量应相等
--    记下这两个数，用于与 window.pushLierenExtraAmountToPlat() 返回的 total / pushed 对账
SELECT COUNT(*) AS syncedFixedRules, SUM(bWalletMarkup = 1) AS markupIsOne
FROM rule_record
WHERE is_sync_plat = 1 AND offerType = 1 AND rule = 2 AND status IN ('1', '3');

-- ④ 回滚（把 SQL 侧刷回刷数前的值；平台侧请按 ⓪ 的备份值重新执行一次推送覆盖）
-- UPDATE rule_record SET bWalletMarkup = NULL
-- WHERE is_sync_plat = 1 AND offerType = 1 AND rule = 2 AND status IN ('1', '3');

-- ⑤ 若曾用 rule=3 的旧口径刷过数：那批 rule=3 的行不在本次范围内，需按当时的备份回滚
--    （否则「未同步」的 rule=3 规则会被本地 B钱包加价 1 元；「已同步」的则取决于是否已推送）
-- UPDATE rule_record SET bWalletMarkup = NULL
-- WHERE is_sync_plat = 1 AND offerType = 1 AND rule = 3 AND status IN ('1', '3');
