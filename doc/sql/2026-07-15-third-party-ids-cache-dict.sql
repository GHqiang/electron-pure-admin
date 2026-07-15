-- 第三方 ID 缓存配置字典数据初始化
-- 关联方案：doc/plans/2026-07-14-报价出票第三方ID缓存复用方案.md 第十四章
-- 表：sys_dict（唯一键 uk_type_value(dict_type, dict_value)）
--
-- 说明：
-- 1. third_party_ids_cache_ttl     - 前端本地进程内 LRU 缓存有效期（毫秒），默认 6 小时
-- 2. third_party_ids_cache_size    - 前端本地进程内 LRU 缓存最大条数，默认 2000
-- 3. offer_record_cache_ttl_days   - 后端查询第三方 ID 缓存的报价记录有效期（天），默认 7 天
--
-- 修改配置后：
-- - 前端两个参数：60 秒内自动生效（字典配置缓存 TTL 60 秒）
-- - 后端有效期：立即生效（每次查询都读字典）
-- - 无需重启服务

INSERT INTO sys_dict (dict_type, dict_label, dict_value, dict_desc, status) VALUES
('third_party_ids_cache_ttl', '第三方ID本地缓存有效期(毫秒)', '21600000', '前端进程内LRU缓存有效期，默认6小时=21600000ms。命中本地缓存直接返回，省掉对后端的HTTP调用', '1'),
('third_party_ids_cache_size', '第三方ID本地缓存最大条数', '2000', '前端进程内LRU缓存最大条数，默认2000。超容量淘汰最近最少访问的条目', '1'),
('offer_record_cache_ttl_days', '报价记录缓存有效期(天)', '7', '后端查询第三方ID缓存时只信任N天内的报价记录，默认7天。配合前端6小时本地缓存使用', '1')
ON DUPLICATE KEY UPDATE
  dict_label = VALUES(dict_label),
  dict_value = VALUES(dict_value),
  dict_desc = VALUES(dict_desc),
  status = VALUES(status);

-- 验证查询
-- SELECT dict_type, dict_label, dict_value, dict_desc, status
-- FROM sys_dict
-- WHERE dict_type IN ('third_party_ids_cache_ttl', 'third_party_ids_cache_size', 'offer_record_cache_ttl_days')
-- ORDER BY dict_type;
