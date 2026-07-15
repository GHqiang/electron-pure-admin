-- ============================================================
-- 第三方 ID 缓存复用方案 - 表结构变更
-- 创建日期: 2026-07-14
-- 关联文档: doc/plans/2026-07-14-报价出票第三方ID缓存复用方案.md
-- 作用: 报价时解析出的第三方 ID（城市/影院/影片/场次）写入 third_party_ids 列，
--       后续同影院同场次的订单直接复用，跳过 3-4 次第三方查询
-- ============================================================

-- 1. offer_record 新增 third_party_ids 列（JSON 类型，存各系列解析出的第三方 ID 集合）
ALTER TABLE offer_record
  ADD COLUMN third_party_ids JSON DEFAULT NULL COMMENT '报价时解析的第三方ID集合（跨订单复用，按系列区分字段）';

-- 2. offer_record 新增 cache_hit 列（TINYINT，标记报价时是否命中第三方ID缓存）
--    0=未命中（走完整查询链），1=本地命中（进程内LRU缓存），2=远端命中（后端offer_record表）
--    用于统计缓存命中率和优化效果评估
ALTER TABLE offer_record
  ADD COLUMN cache_hit TINYINT NOT NULL DEFAULT 0 COMMENT '报价时是否命中第三方ID缓存 0-未命中 1-本地命中 2-远端命中';

-- 3. offer_record_fail 同步加列（失败单也可能已解析出部分 ID，可供复用）
ALTER TABLE offer_record_fail
  ADD COLUMN third_party_ids JSON DEFAULT NULL COMMENT '报价时解析的第三方ID集合（跨订单复用，按系列区分）';

-- 4. offer_record_fail 同步加 cache_hit 列
ALTER TABLE offer_record_fail
  ADD COLUMN cache_hit TINYINT NOT NULL DEFAULT 0 COMMENT '报价时是否命中第三方ID缓存 0-未命中 1-本地命中 2-远端命中';

-- 5. 复用查询索引（app_name + cinema_code + film_name + show_time）
--    查询频率：每单 1 次，日均 3 万+ 次，有索引下 <5ms
ALTER TABLE offer_record
  ADD INDEX idx_cache_lookup (app_name, cinema_code, film_name, show_time(30));

-- 6. offer_record_fail 同步加复用查询索引（失败单也参与缓存复用，UNION ALL 查询需要索引避免全表扫描）
ALTER TABLE offer_record_fail
  ADD INDEX idx_cache_lookup_fail (app_name, cinema_code, film_name, show_time);
