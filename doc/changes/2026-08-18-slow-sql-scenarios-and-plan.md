# 慢 SQL 场景清单与改造方案（2026-08-18）

> 依据：`/www/server/data/mysql-slow.log`（2024-06 至 2026-08 共 145 万+ 行）+ 代码逐行核对（`auto-ticket-service`）
> 背景：MySQL 8.0.24，`offer_record`/`ticket_record` 建表只有主键，全项目无任何业务索引。

---

## 一、慢 SQL 场景全景（按当前危害排序）

### 🔴 S1：出票日统计 —— `getDailyTicketUsed`（每日出票量/券使用量统计）

**代码**：`api/ticketRecord.js:387` → `routes/login_record.js:11`（接口：登录/出票流程查询手机号当日出票券数）

```sql
SELECT mobile, SUM(ticket_num) AS daily_count
FROM ticket_record
WHERE app_name = ? AND mobile IN (...)
  AND order_status = '1' AND offer_type = '1'
  AND DATE(processing_time) = CURDATE()
GROUP BY mobile ORDER BY mobile;
```

**慢日志表现（当前最频繁，2026-07~08 每天大量出现）**：
- 每条 3~6 秒，`Rows_examined = 30.9 万`（**全表扫描**）
- 同一时刻并发跑 10+ 个 app_name（lma/bona/yaolai/wanxiangh5/umexin/zhongyingxin...），高峰期挤占连接池

**根因**：① `ticket_record` 无任何索引；② `DATE(processing_time)` 函数包裹导致即使有索引也无法使用（VARCHAR 字段 + 函数）

### 🔴 S2：中标价批量更新锁等待 —— `syncDealPrice` 旧版 SQL

**代码**：`api/offerRecord.js:423`（`syncDealPrice`）→ `routes/offer_record.js:107`（POST /syncDealPrice）
⚠️ 注意：`syncPrice.js` 各平台的定时任务已改用优化版 `batchUpdateDealPrice`（`offerRecord.js:469`，先查 id 再 `WHERE id IN`），**但 `syncDealPrice` 接口本身仍暴露且是旧 SQL**；`cron/index.js:96` 的 worker 消息名也叫 `syncDealPrice`（实际走 syncPrice.js 的 batchUpdateDealPrice，见 worker 内部）。

```sql
UPDATE offer_record o
SET o.deal_price = CASE WHEN o.order_number = ? AND o.plat_name = ? THEN ? ... END
WHERE o.user_id = ? AND o.order_number IN (50+ 个订单号);
```

**慢日志表现（2026-06-13）**：
- **Query_time 82~101 秒，其中 Lock_time 51~59 秒**（多个并发 UPDATE 互相锁等待）
- 无索引支撑 `user_id + order_number IN` → 全表扫 + 行锁放大

### 🟠 S3：is_deal 定时更新 —— `updateIsDealField`（每 30 分钟）

**代码**：`api/offerRecord.js:627`

```sql
SELECT o.id FROM offer_record o
INNER JOIN ticket_record t ON t.order_number=o.order_number AND t.plat_name=o.plat_name
  AND t.user_id=o.user_id AND t.processing_time > NOW() - INTERVAL 30 MINUTE
WHERE o.is_deal IS NULL AND o.processing_time BETWEEN ... ;
-- 及 LEFT JOIN 版（查未中标）
```

**慢日志表现**：JOIN 连接键（order_number/plat_name/user_id）无索引 → 每次执行扫描数万行，3~15 秒；`updateIsPriceDiffField`（`offerRecord.js:694`）子查询同样问题。

### 🟠 S4：业务高频单查 —— `findRecordData`（offer/ticket 列表）

**代码**：`api/offerRecord.js:150` / `api/ticketRecord.js:129` → 各 routes

```sql
-- 慢日志最常见的形态（每天大量，2025-12 至今）：
SELECT order_number, plat_name, user_id, id FROM offer_record
WHERE is_deal IS NULL AND user_id=? AND order_number=? AND plat_name=? LIMIT 1;
-- 3~15 秒/条，Rows_examined 2~7 万，并发 10+ 条

-- 列表页：
SELECT * FROM offer_record WHERE user_id=? AND plat_name=? AND processing_time BETWEEN ? AND ? ORDER BY processing_time DESC LIMIT ? OFFSET ?;
-- 3~20 秒，全表扫描 + filesort
```

**根因**：`is_deal`、`user_id`、`order_number`、`plat_name`、`processing_time` 全部无索引；`SELECT *` 带出 TEXT 大字段。

### 🟡 S5：历史遗留全表扫描（2024-06 ~ 2025 年，多为已治理或偶发）

| SQL 形态 | 出处 | 表现 | 现状 |
|---|---|---|---|
| `SELECT * FROM offer_record ORDER BY processing_time DESC LIMIT 1000` | 列表页 | 3~54 秒，filesort（曾致 `Out of sort memory`） | 偶发 |
| `SELECT * FROM opera_record WHERE des LIKE '%xx%'` | DBeaver 手工 | 扫描 206 万行，106~135 秒 | 已分区治理，偶发手工查询 |
| `SELECT * FROM ticket_record WHERE processing_time BETWEEN ...` | 月报表导出 | 25~233 秒 | 偶发导出 |
| `WITH DeduplicatedData AS (ROW_NUMBER()...)` | DBeaver 手工 | 全表窗口函数 | 偶发 |
| `DELETE FROM opera_record/offer_record WHERE processing_time <= ...` | DBeaver 手工清数据 | 72~401 秒 | 偶发 |

### 🟡 S6：卡使用量统计 —— `updateCardDailyUsage`

**代码**：`api/cardRecord.js:319`（出票时更新会员卡用量，**业务关键路径**）

```sql
SELECT SUM(ticket_num) FROM ticket_record
WHERE app_name=? AND order_status='1' AND processing_time>=? AND card_id=?;
```

**影响**：出票流程中同步执行（未 await 时异步），无索引扫描；月内多次出票 → 反复全表扫。

---

## 二、改造方案（分三批落地）

### 第一批：补索引（DDL，收益最大、零代码改动）

```sql
USE autoticket;

-- offer_record / offer_record_fail（两表结构相同，分别执行）
ALTER TABLE offer_record ADD INDEX idx_user_plat_orderno (user_id, plat_name, order_number);
ALTER TABLE offer_record ADD INDEX idx_isdeal_user_plat (is_deal, user_id, plat_name, order_number);
ALTER TABLE offer_record ADD INDEX idx_processing_time (processing_time);
ALTER TABLE offer_record_fail ADD INDEX idx_processing_time (processing_time);
ALTER TABLE offer_record_fail ADD INDEX idx_user_plat_orderno (user_id, plat_name, order_number);

-- ticket_record（S1/S6 统计 + S4 列表 + 防重 INSERT）
ALTER TABLE ticket_record ADD INDEX idx_app_status_type_time (app_name, order_status, offer_type, processing_time);
ALTER TABLE ticket_record ADD INDEX idx_user_plat_orderno (user_id, plat_name, order_number);
ALTER TABLE ticket_record ADD INDEX idx_card_app (card_id, app_name, order_status, processing_time);
ALTER TABLE ticket_record ADD UNIQUE INDEX uk_user_plat_orderno (user_id, plat_name, order_number);

-- sync_offer_record（findDealRecordData 用）
ALTER TABLE sync_offer_record ADD INDEX idx_plat_rule_cinema (plat_name, rule, cinema_code, offer_rule_id);

-- opera_record 主表 + 分区表
ALTER TABLE opera_record ADD INDEX idx_opera_time (opera_time);
ALTER TABLE opera_record_partitioned ADD INDEX idx_opera_time (opera_time);
```

> 执行注意：表已有 30 万+ 行，建议低峰期执行；MySQL 8 在线 DDL 默认 INPLACE，`uk_user_plat_orderno` 唯一索引需先确认无重复数据（`INSERT ... ON DUPLICATE KEY UPDATE id=id` 注释也印证了设计意图）。

### 第二批：代码改造（S1、S2、S4、S6）

| 场景 | 改动 | 文件 |
|---|---|---|
| S1 getDailyTicketUsed | `DATE(processing_time)=CURDATE()` 改为 `processing_time >= ? AND processing_time < ?`（范围谓词走索引） | `api/ticketRecord.js:411` |
| S2 syncDealPrice | 直接复用 `batchUpdateDealPrice` 逻辑（先查 id 再 `WHERE id IN`），或下线旧接口改为只走 worker 路径 | `api/offerRecord.js:423`、`routes/offer_record.js:107` |
| S4 findRecordData | ① `SELECT *` 改白名单字段；② 默认加时间范围限制（如 30 天内）防止裸奔全表；③ 分页改 keyset（`WHERE processing_time < ?`） | `api/offerRecord.js:150`、`api/ticketRecord.js:129` |
| S6 updateCardDailyUsage | 改为按卡维度预聚合（card_record 上维护月用量字段，已有该字段）或加 `card_id` 索引后保持现状 | `api/cardRecord.js:319` |
| S3 updateIsDealField | JOIN 连接键靠第一批索引即可；可再加 `offer_record(processing_time, is_deal)` 复合索引加速 WHERE | `api/offerRecord.js:627` |

### 第三批：治理与长期（运维侧）

1. 慢日志已配轮转 ✅（每日 03:30，保留 14 天），**改造后每周抽查一次**确认 Rows_examined 明显下降
2. DBeaver 手工大查询（opera_record LIKE、全表导出、大 DELETE）建议走只读从库或限制时间段
3. `opera_record` 已有分区方案，继续保持；`offer_record` 数据增长快，中期评估按 `processing_time` 分区或强化归档

---

## 三、预期收益（第一批索引落地后）

| 场景 | 现状 | 预期 |
|---|---|---|
| S1 日统计 | 全表扫 30.9 万行，3~6 秒 ×10 并发 | 走索引 < 50ms |
| S2 批量更新 | 锁等待 51~59 秒 | 走 `idx_user_plat_orderno`，秒级 |
| S3 is_deal 更新 | 数万行扫描 3~15 秒 | 索引 JOIN，毫秒级 |
| S4 单查/列表 | 2~7 万行扫描 3~15 秒 | 索引命中 < 100ms |

**风险**：第一批 DDL 执行期间 InnoDB 在线 DDL 有短暂元数据锁；`uk_user_plat_orderno` 唯一索引建立前需查重。建议先备份（面板已有每日备份任务）。
