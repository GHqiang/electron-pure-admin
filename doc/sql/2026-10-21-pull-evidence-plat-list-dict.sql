-- 拉单证据（C1/C2）平台白名单字典数据
-- 关联变更：doc/changes/2026-10-21-非猎人平台拉单证据.md
-- 表：sys_dict（key-value 字典表，不需要新增字段）
--
-- 说明：
-- 1. dict_type = pullEvidencePlatList，值为逗号分隔的平台名
-- 2. 代码默认 Top5：lieren,haha,mahua,yinghuasuan,mayi
-- 3. 全部 10 个平台都支持；要开启其它平台，把平台名追加到 dict_value 即可
-- 4. 白名单只控制 C1/C2 拉单证据、登录列表刷新和排查页提示，不控制平台启停、报价、成功记录、A16、A17/B
-- 5. 字典缓存 60 秒，修改后下一轮拉单生效，无需重启

INSERT INTO sys_dict (dict_type, dict_label, dict_value, dict_desc, status) VALUES
(
  'pullEvidencePlatList',
  '拉单证据平台白名单(C1/C2)',
  'lieren,haha,mahua,yinghuasuan,mayi',
  'C1拉单返回/C2拉单摘要的平台白名单，逗号分隔。默认Top5；支持全部10个平台：lieren,haha,mahua,yinghuasuan,mayi,sheng,mangguo,shoutu,yangcong,piaosheng。不影响平台启停、报价、成功记录、A16、A17/B',
  '1'
)
ON DUPLICATE KEY UPDATE
  dict_label = VALUES(dict_label),
  dict_value = VALUES(dict_value),
  dict_desc = VALUES(dict_desc),
  status = VALUES(status);

-- 可选：一次开启全部 10 个平台（注意 C1 文件量会从 Top5 约 1.5 万单/天增加到约 2 万单/天）
-- UPDATE sys_dict
-- SET dict_value = 'lieren,haha,mahua,yinghuasuan,mayi,sheng,mangguo,shoutu,yangcong,piaosheng'
-- WHERE dict_type = 'pullEvidencePlatList';

-- 验证查询
-- SELECT dict_type, dict_label, dict_value, dict_desc, status
-- FROM sys_dict
-- WHERE dict_type = 'pullEvidencePlatList';
