# 慢 SQL 优化实施计划（第一批索引 + 第二批代码改造）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过补索引 + 代码改造，消除 `offer_record`/`ticket_record` 的 6 类慢 SQL（日统计全表扫、批量 UPDATE 锁等待、is_deal JOIN、列表单查、卡用量统计、历史遗留扫描）。

**Architecture:** 分两批落地：第一批纯 DDL 索引（零代码风险、收益最大，覆盖 S1/S2/S3/S4/S6 全部 WHERE/JOIN/ORDER BY 路径）；第二批代码改造（S1 去掉 `DATE()` 函数包裹、S2 下线旧 syncDealPrice、S4 去 `SELECT *` + 时间范围兜底、S6 加时间范围）。DDL 由用户低峰期手动执行，代码改造在本仓库完成并测试。

**Tech Stack:** MySQL 8.0.24、Node.js Koa2、Jest + supertest、mysql2。

**重要约束（CLAUDE.md）**：
- 修改文件必须保持原有代码风格（引号、缩进、尾逗号、紧凑写法一律不动）
- 不运行 `npm run lint` / `npm run format` 等格式化命令
- 每轮改动后用 `git diff` 确认无格式化噪音
- 完成每批后产出变更文档到 `doc/changes/`

**环境事实**：
- `auto-ticket-service` 是独立 git 仓库，当前分支 `dev`（ahead 5），所有代码改动在其中进行
- 慢日志已配置轮转（每日 03:30），改造后通过 Rows_examined 观察收益

---

## 第一批：索引 DDL（用户执行，无需改代码）

### Task 1: 生成索引 DDL 脚本

**Files:**
- Create: `auto-ticket-service/scripts/ops/mysql-slow-optimize-indexes.sql`
- Create: `doc/changes/2026-08-18-index-ddl.md`（变更记录）

- [ ] **Step 1: 生成 DDL 脚本**

```sql
-- ============================================================
-- 慢 SQL 优化第一批：补索引（2026-08-18）
-- 执行前：先在面板做一次 autoticket 库备份
-- 建议低峰期执行；MySQL 8 在线 DDL，INPLACE 算法
-- ============================================================
USE autoticket;

-- 1. 查重：唯一索引建立前必须先确认无重复（应返回 0 行）
SELECT user_id, plat_name, order_number, COUNT(*) c
FROM ticket_record GROUP BY user_id, plat_name, order_number HAVING c > 1 LIMIT 10;
-- （如有重复：DELETE 保留最小 id 后再建索引）

-- 2. offer_record / offer_record_fail：列表、单查、批量更新
ALTER TABLE offer_record ADD INDEX idx_user_plat_orderno (user_id, plat_name, order_number);
ALTER TABLE offer_record ADD INDEX idx_isdeal_user_plat (is_deal, user_id, plat_name, order_number);
ALTER TABLE offer_record ADD INDEX idx_processing_time (processing_time);
ALTER TABLE offer_record_fail ADD INDEX idx_processing_time (processing_time);
ALTER TABLE offer_record_fail ADD INDEX idx_user_plat_orderno (user_id, plat_name, order_number);

-- 3. ticket_record：日统计（S1）、卡用量（S6）、列表（S4）、防重
ALTER TABLE ticket_record ADD INDEX idx_app_status_type_time (app_name, order_status, offer_type, processing_time);
ALTER TABLE ticket_record ADD INDEX idx_user_plat_orderno (user_id, plat_name, order_number);
ALTER TABLE ticket_record ADD INDEX idx_card_app (card_id, app_name, order_status, processing_time);
ALTER TABLE ticket_record ADD UNIQUE INDEX uk_user_plat_orderno (user_id, plat_name, order_number);

-- 4. sync_offer_record：最近中标记录查询
ALTER TABLE sync_offer_record ADD INDEX idx_plat_rule_cinema (plat_name, rule, cinema_code, offer_rule_id);

-- 5. opera_record 主表 + 分区表：操作记录按时间排序
ALTER TABLE opera_record ADD INDEX idx_opera_time (opera_time);
ALTER TABLE opera_record_partitioned ADD INDEX idx_opera_time (opera_time);

-- 6. 验证
SHOW INDEX FROM offer_record;
SHOW INDEX FROM ticket_record;
```

- [ ] **Step 2: 写变更记录**（文件名 `doc/changes/2026-08-18-index-ddl.md`，内容：背景、DDL 清单、执行步骤、预期收益、风险）

- [ ] **Step 3: 交付用户**：告知用户在宝塔面板 → 数据库 → SQL 执行（或 SSH 执行 `mysql -uroot -p autoticket < scripts/ops/mysql-slow-optimize-indexes.sql`），低峰期操作，执行前先备份。

---

## 第二批：代码改造（本仓库实现）

### Task 2: S1 日统计去掉 DATE() 函数包裹

**Files:**
- Modify: `auto-ticket-service/api/ticketRecord.js:386-426`（getDailyTicketUsed）
- Test: `auto-ticket-service/__tests__/api/ticketRecord.test.js`

**背景**：`DATE(processing_time) = CURDATE()` 导致索引失效（函数包裹），全表扫 30.9 万行。改为范围谓词 `processing_time >= ? AND processing_time < ?`（走 idx_app_status_type_time）。

- [ ] **Step 1: 写失败测试**（在 `__tests__/api/ticketRecord.test.js` 的 getDailyTicketUsed describe 中新增）

```js
test('S1：使用范围谓词而非 DATE() 函数（保证索引可用）', async () => {
    baseService.query.mockResolvedValue([{ mobile: '13800138000', daily_count: 5 }]);
    await ticketRecordServices.getDailyTicketUsed({
        app_name: 'lma',
        mobile_list: '13800138000,13800138001',
    });
    const sql = baseService.query.mock.calls[0][0];
    // 不应包含 DATE( 函数包裹
    expect(sql).not.toMatch(/DATE\(\s*processing_time\s*\)/);
    // 应包含时间范围谓词
    expect(sql).toMatch(/processing_time\s*>=\s*\?/);
    expect(sql).toMatch(/processing_time\s*<\s*\?/);
    // 参数应为 [app_name, ...mobiles, todayStart, tomorrowStart]
    const params = baseService.query.mock.calls[0][1];
    expect(params[0]).toBe('lma');
    expect(params[params.length - 2]).toMatch(/^\d{4}-\d{2}-\d{2} 00:00:00$/);
    expect(params[params.length - 1]).toMatch(/^\d{4}-\d{2}-\d{2} 00:00:00$/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest __tests__/api/ticketRecord.test.js -t "S1"` → Expected: FAIL（当前 SQL 含 DATE()，断言不通过）

- [ ] **Step 3: 实现改造**（`api/ticketRecord.js:386-426`）

```js
    // 查询各手机号当天出票券数（按 app_name、mobile_list 筛选，只统计当天）
    getDailyTicketUsed: async ({ app_name, mobile_list }) => {
        try {
            if (!app_name) {
                return failRes(null, "缺少参数 app_name");
            }
            let mobiles = [];
            if (Array.isArray(mobile_list)) {
                mobiles = mobile_list.map(String).filter(Boolean);
            } else if (typeof mobile_list === "string") {
                mobiles = mobile_list.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
            }
            if (!mobiles.length) {
                return failRes(null, "缺少参数 mobile_list 或为空");
            }
            // 当天时间范围 [00:00:00, 次日 00:00:00)，范围谓词可走索引（避免 DATE() 函数包裹导致索引失效）
            const todayStr = utils.getCurrentDay();
            const tomorrow = new Date(new Date(todayStr).getTime() + 24 * 60 * 60 * 1000);
            const startOfDay = `${todayStr} 00:00:00`;
            const startOfTomorrow = utils.formatTimeOfTime(tomorrow);
            const placeholders = mobiles.map(() => "?").join(", ");
            const _sql = `
                SELECT 
                    mobile,
                    SUM(ticket_num) AS daily_count
                FROM ticket_record
                WHERE app_name = ?
                  AND mobile IN (${placeholders})
                  AND order_status = '1'
                  AND offer_type = '1'
                  AND processing_time >= ?
                  AND processing_time < ?
                GROUP BY mobile
                ORDER BY mobile
            `;
            const params = [app_name, ...mobiles, startOfDay, startOfTomorrow];
            const rows = await baseService.query(_sql, params);
            const list = (rows || []).map((item) => ({
                mobile: item.mobile,
                daily_count: item.daily_count,
            }));
            return successRes({ list });
        } catch (error) {
            console.warn("查询各手机号当天出票券数异常", error);
            return failRes(null, error?.sqlMessage || error.message);
        }
    },
```

> 注：需确认 `utils` 已导入 `getCurrentDay`/`formatTimeOfTime`（文件顶部 `const utils = require("../controllers/utils")`，查导出）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest __tests__/api/ticketRecord.test.js` → Expected: PASS（含原有用例回归）

- [ ] **Step 5: git diff 检查无格式化噪音 + Commit**

```bash
cd auto-ticket-service && git diff --stat
git add api/ticketRecord.js __tests__/api/ticketRecord.test.js
git commit -m "perf: getDailyTicketUsed 用时间范围谓词替代 DATE() 函数，使日统计走索引"
```

### Task 3: S2 下线旧 syncDealPrice，统一走 batchUpdateDealPrice

**Files:**
- Modify: `auto-ticket-service/routes/offer_record.js:107`（syncDealPrice 路由）
- Modify: `auto-ticket-service/api/offerRecord.js:423-466`（syncDealPrice 方法）
- Test: `auto-ticket-service/__tests__/api/offerRecord.test.js:316-350`

**背景**：慢日志 2026-06-13 的 51 秒锁等待 SQL（`CASE WHEN order_number IN` + 无索引 WHERE）正是 `syncDealPrice` 的旧实现。各平台定时任务已走 `batchUpdateDealPrice`（先查 id 再 `WHERE id IN`），但 POST /syncDealPrice 路由仍暴露旧方法。

- [ ] **Step 1: 写失败测试**（在 `__tests__/api/offerRecord.test.js` syncDealPrice describe 中新增）

```js
test('S2：syncDealPrice 改为按 id 批量更新（不再用 order_number IN 全表扫）', async () => {
    const baseQuery = require('../../controllers/mysqlConfig').query;
    baseQuery.mockReset();
    // 第一次调用（SELECT id）返回订单 id
    baseQuery.mockResolvedValueOnce([
        { id: 1, order_number: 'A1' },
        { id: 2, order_number: 'A2' },
    ]);
    // 第二次调用（UPDATE）返回影响行数
    baseQuery.mockResolvedValueOnce({ affectedRows: 2 });
    await offerRecordServices.syncDealPrice({
        user_id: 9,
        syncOrders: [
            { order_number: 'A1', supplier_end_price: 30, plat_name: 'lieren' },
            { order_number: 'A2', supplier_end_price: 32, plat_name: 'lieren' },
        ],
    });
    const selectSql = baseQuery.mock.calls[0][0];
    const updateSql = baseQuery.mock.calls[1][0];
    // 先 SELECT id
    expect(selectSql).toMatch(/SELECT\s+id/);
    expect(selectSql).toMatch(/WHERE\s+user_id\s*=\s*\?\s+AND\s+order_number\s+IN/);
    // UPDATE 走主键 id IN，不出现 order_number CASE
    expect(updateSql).toMatch(/WHERE\s+id\s+IN/);
    expect(updateSql).not.toMatch(/WHEN\s+o\.order_number/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest __tests__/api/offerRecord.test.js -t "S2"` → Expected: FAIL（当前 syncDealPrice 无 SELECT 阶段，UPDATE 含 order_number CASE）

- [ ] **Step 3: 实现改造** —— 将 `api/offerRecord.js:423-466` 的 syncDealPrice 实现替换为调用 batchUpdateDealPrice（保持方法签名与返回结构）：

```js
    // 同步中标价
    // 优化：统一走 batchUpdateDealPrice（先查 id 再按主键批量 UPDATE），
    //      避免 order_number 无索引导致的 `CASE WHEN order_number IN` 全表扫描与长锁等待
    syncDealPrice: async(obj) => {
        try {
            const { user_id, syncOrders } = obj;
            if (!syncOrders || !syncOrders.length) {
                return successRes(null, "同步中标价成功");
            }
            const orders = syncOrders.map(({ order_number, supplier_end_price, plat_name }) => ({
                order_number,
                deal_price: supplier_end_price,
                // 旧逻辑仅同步价格；is_deal 由定时任务 updateIsDealField 单独维护
                is_deal: null,
                plat_name,
            }));
            const res = await offerRecordServices.batchUpdateDealPrice({ user_id, orders });
            if (res?.code === 1) {
                return successRes(null, res.msg || "同步中标价成功");
            }
            return failRes(null, res?.msg || "同步中标价失败");
        } catch (error) {
            console.warn("同步中标价异常", error);
            return failRes(null, error?.sqlMessage);
        }
    },
```

> 注：batchUpdateDealPrice 会过滤 `is_deal: null`（其 rowsToUpdate 只 push 有 id 的），若需兼容旧语义（只更新价格不动 is_deal），确认 batchUpdateDealPrice 的 `CASE id ... is_deal` 分支对 null 的处理 —— 需在实现时确认该函数对 `is_deal: null` 的 SQL 生成是否安全，若不安全则在 syncDealPrice 内仅传 deal_price 字段并单独构造 UPDATE（本 Task 的测试只约束"先 SELECT id 再按 id IN 更新"这个核心模式）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest __tests__/api/offerRecord.test.js` → Expected: PASS（含 syncDealPrice 原有 3 个用例回归，若旧用例断言旧 SQL 形态则同步更新断言）

- [ ] **Step 5: git diff 检查无格式化噪音 + Commit**

```bash
git add api/offerRecord.js routes/offer_record.js __tests__/api/offerRecord.test.js
git commit -m "perf: syncDealPrice 统一走按 id 批量更新，消除 51s 锁等待"
```

### Task 4: S4 列表查询默认时间范围兜底 + 去 SELECT *

**Files:**
- Modify: `auto-ticket-service/api/offerRecord.js:150-215`（findRecordData）
- Modify: `auto-ticket-service/api/ticketRecord.js:129-180`（findRecordData）
- Test: `auto-ticket-service/__tests__/api/offerRecord.test.js`、`__tests__/api/ticketRecord.test.js`

**背景**：慢日志大量 `SELECT * FROM offer_record WHERE user_id=? AND plat_name=? ... ORDER BY processing_time DESC LIMIT ? OFFSET ?` 3~20 秒全表扫 + filesort；`SELECT *` 拉出 TEXT 大字段（cinema_addr）。

- [ ] **Step 1: 写失败测试**（offerRecord findRecordData）

```js
test('S4：未传时间范围时默认只查最近 30 天（防全表扫描）', async () => {
    const baseQuery = require('../../controllers/mysqlConfig').query;
    baseQuery.mockReset();
    baseQuery.mockResolvedValue([]);
    await offerRecordServices.findRecordData({ rule: 1, page_num: 1, page_size: 20 });
    const sql = baseQuery.mock.calls[0][0];
    expect(sql).toMatch(/processing_time\s*>=\s*\?/);
    const params = baseQuery.mock.calls[0][1];
    // 30 天前的时间
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const expected = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth()+1).padStart(2,'0')}-${String(thirtyDaysAgo.getDate()).padStart(2,'0')}`;
    expect(params.some(p => String(p).startsWith(expected))).toBe(true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest __tests__/api/offerRecord.test.js -t "S4"` → Expected: FAIL

- [ ] **Step 3: 实现改造（offerRecord.js findRecordData）**

在 `buildWhereConditions(obj, rule, tableName)` 返回 conditions 后，若 `conditions` 不含 `processing_time` 且 `obj.start_time`/`obj.end_time` 均未传，追加默认范围：

```js
            // 构建完整 SQL
            const { conditions, params } = buildWhereConditions(obj, rule, tableName);
            let finalConditions = conditions;
            let finalParams = params;
            // 未传时间范围时默认只查最近 30 天，避免无索引全表扫描（S4 优化）
            if (!obj.start_time && !obj.end_time) {
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                const defaultStart = utils.formatTimeOfTime(thirtyDaysAgo);
                finalConditions = conditions
                    ? `${conditions} AND ${tableName}.processing_time >= ?`
                    : `${tableName}.processing_time >= ?`;
                finalParams = [...params, defaultStart];
            }
```

（ticketRecord.js findRecordData 同样处理；两处 `SELECT *` 默认字段白名单如改动面过大可暂缓，仅先加时间兜底 —— 在计划中标注为可选步骤）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest __tests__/api/offerRecord.test.js __tests__/api/ticketRecord.test.js` → Expected: PASS

- [ ] **Step 5: git diff 检查无格式化噪音 + Commit**

```bash
git add api/offerRecord.js api/ticketRecord.js __tests__/api/offerRecord.test.js __tests__/api/ticketRecord.test.js
git commit -m "perf: 列表查询未传时间时默认加 30 天范围兜底，防全表扫描"
```

### Task 5: S6 卡用量统计加时间范围（配合索引）

**Files:**
- Modify: `auto-ticket-service/api/cardRecord.js:319-377`（updateCardDailyUsage）
- Test: 已有或新增 `__tests__/api/cardRecord.test.js`

**背景**：`SELECT SUM(ticket_num) FROM ticket_record WHERE app_name=? AND order_status='1' AND processing_time>=? AND card_id=?` 在出票关键路径执行；第一批已加 `idx_card_app`。代码侧把 `processing_time >= ?`（月首）改为保留即可 —— 本任务主要是**验证**索引生效，若 cardRecord 无测试则补一个断言 SQL 形态的测试。

- [ ] **Step 1: 补测试**（断言 SQL 含 processing_time 范围且参数为月首日期）

```js
test('S6：卡用量统计按时间范围查询（可走 idx_card_app）', async () => {
    const baseQuery = require('../../controllers/mysqlConfig').query;
    baseQuery.mockReset();
    baseQuery.mockResolvedValueOnce([{ card_id: 1, app_name: 'lma' }]);      // SELECT card_record
    baseQuery.mockResolvedValueOnce([{ total_ticket_num: 10 }]);             // SELECT SUM
    baseQuery.mockResolvedValueOnce({ affectedRows: 1 });                    // UPDATE
    await cardRecordServices.updateCardDailyUsage({
        card_id: 1, app_name: 'lma', add_count: 2,
    });
    const sumSql = baseQuery.mock.calls[1][0];
    expect(sumSql).toMatch(/processing_time\s*>=\s*\?/);
    expect(sumSql).toMatch(/card_id\s*=\s*\?/);
});
```

- [ ] **Step 2: 运行测试**

Run: `npx jest __tests__/api/cardRecord.test.js` → 若文件不存在则新建，Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add api/cardRecord.js __tests__/api/cardRecord.test.js
git commit -m "test: 卡用量统计 SQL 形态回归测试（配合 idx_card_app）"
```

### Task 6: 全量回归 + 变更记录

**Files:**
- Create: `doc/changes/2026-08-18-slow-sql-code-fix.md`

- [ ] **Step 1: 全量测试**

Run: `cd auto-ticket-service && npm test` → Expected: ALL PASS

- [ ] **Step 2: git diff 全量检查无格式化噪音**

```bash
git -C auto-ticket-service diff --stat
```

- [ ] **Step 3: 写变更记录**（`doc/changes/2026-08-18-slow-sql-code-fix.md`：修改文件清单、核心变更、测试结果、回归风险）

- [ ] **Step 4: Commit 文档**

```bash
git add doc/changes/2026-08-18-slow-sql-code-fix.md
git commit -m "docs: 慢 SQL 代码改造变更记录"
```

---

## 验收标准

1. `npm test` 全绿（含新增 S1/S2/S4/S6 回归测试）
2. `git diff` 无格式化噪音（引号/缩进/尾逗号保持原样）
3. 第一批 DDL 由用户在低峰期执行后，慢日志 Rows_examined 明显下降（S1 从 30.9 万 → 千级）
4. 变更文档齐全：`doc/changes/2026-08-18-index-ddl.md`、`doc/changes/2026-08-18-slow-sql-code-fix.md`

## 风险与回滚

- **DDL**：先备份再执行；`uk_user_plat_orderno` 唯一索引前必须查重；InnoDB 在线 DDL 有短暂元数据锁，低峰执行
- **代码**：改动集中在 3 个 api 文件 + 2 个路由引用；syncDealPrice 语义变化（is_deal 不再由该接口维护）需与业务确认 —— 若旧客户端依赖该接口写 is_deal，则改为仅加索引不动语义（Task 3 降级方案）
- **回滚**：代码 git revert 即可；DDL 用 `ALTER TABLE ... DROP INDEX` 回滚
