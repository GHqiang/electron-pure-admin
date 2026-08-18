# 2026-08-18 慢 SQL 代码改造（第二批）

## 背景

在第一批索引 DDL（`scripts/ops/mysql-slow-optimize-indexes.sql`，待用户低峰期执行）基础上，对 3 个高频慢 SQL 场景做代码改造，消除"即使有索引也无法命中"的写法。

## 修改文件清单

| 文件 | 变更 |
|---|---|
| `api/ticketRecord.js` | ① `getDailyTicketUsed`：`DATE(processing_time)=CURDATE()` → `processing_time >= ? AND processing_time < ?`（范围谓词，走 `idx_app_status_type_time`）；② `findRecordData`：未传时间时默认追加最近 30 天限制 |
| `api/offerRecord.js` | ① `syncDealPrice`：旧 `CASE WHEN order_number IN` 全表扫 → 先 SELECT id 再按主键 `WHERE id IN` 批量更新；② `findRecordData`：未传时间时默认追加最近 30 天限制 |
| `__tests__/api/ticketRecord.test.js` | 新增 S1/S4 断言测试；utils mock 支持 Date→字符串 |
| `__tests__/api/offerRecord.test.js` | 更新 syncDealPrice 用例（两次 query mock）+ 新增 S2/S4 断言测试；utils mock 支持 Date→字符串 |
| `__tests__/api/cardRecord.test.js` | 新增 S6 卡用量 SQL 形态断言测试 |

## 核心变更说明

### S1 日统计（`getDailyTicketUsed`）
- **改前**：`AND DATE(processing_time) = CURDATE()` —— 函数包裹 VARCHAR 时间字段，索引失效，全表扫 30.9 万行，3~6 秒 × 10 并发
- **改后**：`AND processing_time >= ? AND processing_time < ?`，参数 `[app_name, ...mobiles, 当天00:00:00, 次日00:00:00]`，命中 `idx_app_status_type_time`

### S2 中标价批量更新（`syncDealPrice`）
- **改前**：`UPDATE offer_record o SET o.deal_price = CASE WHEN o.order_number=? AND o.plat_name=? ... WHERE o.user_id=? AND o.order_number IN (...)` —— order_number 无索引，全表扫 + 行锁放大，曾出现 Lock_time 51~59 秒
- **改后**：先 `SELECT id, order_number ... WHERE user_id=? AND order_number IN (...)`（命中第一批 `idx_user_plat_orderno`），再 `UPDATE offer_record SET deal_price = CASE id ... WHERE id IN (...)`（主键定位，锁最小化）
- 语义不变：仅更新 deal_price，不动 is_deal（与旧实现一致）

### S4 列表查询（`findRecordData`，offer + ticket 两处）
- **改前**：未传时间范围时全表扫描 + filesort（`SELECT * ... ORDER BY processing_time DESC`）
- **改后**：未传 `start_time`/`end_time` 时自动追加 `processing_time >= 30天前`，配合 `idx_processing_time` 收敛扫描范围；显式传时间的行为不变

### S6 卡用量统计（`updateCardDailyUsage`）
- 无代码逻辑改动；补回归测试锁定 SQL 形态（`processing_time >= ?` + `card_id = ?`），确保后续不退化、配合 `idx_card_app` 生效

## 测试结果

- 全量回归：`npm test -- --runInBand --forceExit` → **17 套件 / 297 用例全部通过**
- 新增断言：S1（范围谓词）、S2（先查 id 再按 id IN 更新）、S4（默认 30 天兜底 ×2 表）、S6（卡用量 SQL 形态）共 7 个用例
- `git diff` 已确认无格式化噪音（引号/缩进/空白保持原风格）

## 回归风险评估

- 改动集中在 3 个 api 文件 + 对应测试；所有既有用例回归通过（含 syncDealPrice 3 个旧用例、findRecordData 各场景、updateCardDailyUsage 3 个旧用例）
- **行为变化点**（需业务知悉）：
  1. `findRecordData` 未传时间时默认只看 30 天 —— 若前端有"查全部历史"的诉求需显式传大时间范围
  2. `syncDealPrice` 空 `syncOrders` 现在直接返回失败（旧实现抛 SQL 语法错误），行为一致但路径不同
- 第一批索引 DDL 未执行前，S1/S2 仍会慢（代码改造依赖索引生效）；建议尽快在低峰期执行 DDL
