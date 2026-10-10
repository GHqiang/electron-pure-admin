# 猎人 B 钱包加价同步平台 extra_amount（第三轮实施记录）

> 日期：2026-10-10
> 状态：**已实施（2026-10-10）**，代码已落地，未提交
> 方案来源：[2026-09-30-猎人B钱包加价报价整改说明.md](./2026-09-30-猎人B钱包加价报价整改说明.md) 第 12 节（§12.4 / §12.5-a，方案 A）
> 修订记录：2026-10-10 存量刷数的账号口径由 `rule = 3` 修订为 **`rule = 2`**（SQL 脚本、推送范围常量 `BWALLET_BACKFILL_SCOPE.rule`、账号守卫、单测夹具与文档口径同步调整；接口/字段/推送逻辑均无变化）
> 前置依赖：`rule_record.bWalletMarkup`、`offer_record(.fail).pay_type/b_wallet_markup` 三处 DDL **已执行**（2026-10-10 用户确认）；`rule_record.bWalletMarkup` 列注释需用 §12.12 脚本核对

---

## 1. 背景与目标

第二轮的 B钱包加价只对**未同步猎人平台**的规则生效（本地报价叠加）。本轮补齐**已同步猎人平台**的规则：
本地不参与算价（仍走平台报价），改为把 B钱包加价**同步到平台字段 `extra_amount`**，由平台报价时相加。

存量已同步规则库里没有该字段值，需要一次性刷数 + 一次性推送，推送方式定为**方案 A**：
新增 `window.pushLierenExtraAmountToPlat()` 独立推送函数，**推送范围与刷数 SQL 严格一致**，不复用
`checkAndUpdateLierenRuleState`（避免把孤儿规则删除/禁用与状态判定搭进刷数动作）。

## 2. 修改文件清单

| 文件 | 类型 | 变更内容 |
| --- | --- | --- |
| `src/mixins/useLierenOfferRuleSyncFun.js` | 修改 | ① 同步参数新增 `extra_amount`（`Number.isFinite` 兜底，空/非数字发 `0`）；② `lierenOfferRuleSyncPlat` 增加可选第三参 `opts.logMeta`（覆盖成功日志 `trigger_source`/`change_reason`，`ext_data` 追加 `extra_amount` 与 `backfill` 标记，**缺省语义不变**）；③ 新增 `BWALLET_BACKFILL_SCOPE` 范围常量与 `restoreJsonFieldsForSync` 工具函数；④ 新增 `pushLierenExtraAmountToPlat(opts)` 并从 composable 暴露 |
| `src/views/offerRule/index.vue` | 修改 | 解构出 `pushLierenExtraAmountToPlat` 并挂载 `window.pushLierenExtraAmountToPlat`（控制台人工一次性触发） |
| `src/components/RuleDialog.vue` | 修改 | 「B钱包加价」提示文案改为「未同步规则本地叠加 / 已同步规则随规则同步到平台」（去掉旧文案的「仅对未同步规则生效」歧义）；`formData` 字段注释同步 |
| `src/common/tests/lierenBWalletBackfill.test.js` | 新增 | 15 条用例：推送范围与刷数一致、`extra_amount` 取值、不触发孤儿清理、平台无该规则跳过、`ruleList` 只预取一次、日志标记、账号守卫、同步参数携带 `extra_amount`（含默认日志语义不变）、**`dryRun` 演练不写入**、**本地平台价无效跳过**、**平台新建 `rule_id` 告警**、**翻页上限告警**、**请求字段全集（防少传漏字段）**、**三条路径下发参数完全一致** |
| `doc/sql/2026-10-10-bwallet-markup-sync-rules.sql` | 新增（上一轮） | 存量刷数脚本：⓪ 备份 → ① 预览 → ② 刷数 → ③ 校验 → ④ 回滚 |

> 提交注意：`src/common/tests/` 被 `.gitignore:41` 忽略，新增测试文件需 `git add -f src/common/tests/lierenBWalletBackfill.test.js`。

## 3. 核心变更说明

### 3.1 同步参数新增 `extra_amount`（§12.4）

`src/mixins/useLierenOfferRuleSyncFun.js:197-206`：

```js
        state: ruleInfo.status == "1" ? 1 : 0, // 规则状态，1-启用，0-禁用
        // B钱包附加价：随规则同步到平台（未同步规则由本地报价叠加，已同步规则由平台报价时相加）
        // 折扣模式为折扣值、其余为固定值，单位与 price 一致，故直接透传；
        // 空 / null / 非数字统一发 0（会覆盖平台侧手工值，已确认知悉，见变更文档 §12.8-2）
        extra_amount: Number.isFinite(Number(lierenOfferRule.bWalletMarkup))
          ? Number(lierenOfferRule.bWalletMarkup)
          : 0,
```

- 取值 = 本地 `bWalletMarkup` 原值（固定价模式与 `price` 同单位，不做换算）；
- 空 / `null` / `""` / 非数字 → `0`（`Number.isFinite` 兜底，与报价侧 `getBWalletMarkup` 口径一致，避免把 `NaN` 发给平台）；
- **空值也发送**：会覆盖平台侧手工设置的 `extra_amount`（§12.8-2 已确认）。

### 3.2 成功日志可区分「一次性重推」（§12.4 附）

`lierenOfferRuleSyncPlat(ruleInfo, cachedPlatRule = null, opts = {})` 增加可选第三参：

- `opts.logMeta.trigger_source` / `opts.logMeta.change_reason` 覆盖成功日志默认值（默认仍是 `rule_edit_save`/`rule_add_save` 与「更新/新增猎人平台规则」）；
- `ext_data` 追加 `extra_amount`（每次同步都记，便于核对平台值）与 `backfill: true`（仅存量推送）；
- **不传时行为与改造前完全一致**，现有 3 处调用方（`offerRule/index.vue`、`checkAndUpdateLierenRuleState`、`commonQuanStock.js`）无需改动。

### 3.3 存量推送函数 `pushLierenExtraAmountToPlat`（§12.5-a）

`src/mixins/useLierenOfferRuleSyncFun.js:841-1113`（函数体自 `:865` 起），职责单一：**读本地已同步固定价规则 → 逐条 `ruleAdd` 重推 → 输出汇总**。

推送范围（**与 `doc/sql/2026-10-10-bwallet-markup-sync-rules.sql` 的 WHERE 严格一致**）：

| 条件 | 取值 | 代码位置 |
| --- | --- | --- |
| `is_sync_plat` | `1` | `:921-940` |
| `offerType` | `1`（固定价，只有它会走同步管线） | 同上 |
| `rule` | `2`（常量 `BWALLET_BACKFILL_SCOPE.rule`，同时校验每条数据的 `rule` 防跨账号） | 同上 + 账号守卫 `:883` |
| `status` | `IN ('1','3')` | 同上 |
| `platOfferList` | 含 `platName=lieren` 且 `isSyncPlat==1` 且 `platRuleId` 存在，否则计入 `skipped` | `:950-960` |

实现要点：

1. **账号守卫**：当前账号 `rule !== "2"` 直接中止并提示（当前账号不同会让推送集合与刷数集合对不上），可用 `{ force: true }` 显式跳过；
2. **取数**：`svApi.queryRuleList` 分页拉全（`pageSize=100`，`maxPage=50` 防死循环），DB 行即含 `bWalletMarkup`；
3. **JSON 字段还原**：`restoreJsonFieldsForSync`（复用 `checkAndUpdateLierenRuleState` 的字段清单与语义）；
4. **平台旧规则只预取一次**（`:998-1009`）：`lierenApi.ruleList` → 过滤 `sum_mode == 2` → 按 `rule_id` 建 Map → 逐条以 `{state, seats}` 作 `cachedPlatRule` 传入，**避免 `lierenOfferRuleSyncPlat` 内部逐条再调 `ruleList`（N+1 + 429）**；
5. **平台侧不存在该规则 → 跳过**：不计入推送、**不发 `ruleAdd`**（避免用旧 `rule_id` 反写平台），提示先做「规则同步修复」重建；
6. **逐条推送 + 200ms 间隔**（`BWALLET_BACKFILL_SCOPE.intervalMs`），单条失败不中断（计入 `failed`/`failedList`）；
7. **汇总可对账**：返回 `{ ruleId, dryRun, total, planned, pushed, skipped, failed, failedList, invalidList, ruleIdChanged, plan }`，其中 `total` 对应刷数脚本 ③ 的 `syncedFixedRules`、`pushed` 对应 `markupIsOne`；
8. **只推不检**：不查平台规则做差异比对、不做孤儿清理、不改本地库、不改规则状态。

#### 3.3.1 上线前加固（同轮补做，均由单测覆盖）

| # | 加固 | 缘由 | 行为 |
| --- | --- | --- | --- |
| 1 | **本地平台价校验**（`:961-976`） | `ruleAdd` 是**全字段覆盖**：若本地 `platOfferList[lieren].value` 为空/非数字，`price` 会变成 `0` 或 `NaN` 被推上平台，可能把平台规则价改成 0（高危） | 命中范围的规则若本地平台价不是「有限正数」→ **跳过并记入 `invalidList`**，绝不写入 |
| 2 | **`dryRun` 演练模式**（`:1027-1042`） | 一次性全量重推平台规则，写之前应先确认条数与清单 | `{ dryRun: true }` 时**不调用 `ruleAdd`**、不等待间隔，返回 `planned`/`plan[{id, platRuleId, price, extra_amount}]`；平台规则是否存在、AK/SK 是否可用等**读取类校验照常执行** |
| 3 | **翻页上限告警**（`:911-917`） | 若规则数超过 `maxPage × pageSize`，静默截断会导致漏推 | 触顶时打印告警，提示本次 `total` 会小于刷数条数 |
| 4 | **平台返回新 `rule_id` 告警**（`:1057-1074`） | 代码里已记录过「编辑后平台侧新建了规则」的历史问题；全量重推若触发该行为会产生**重复平台规则** | 汇总 `ruleIdChanged` 并打印 `旧 id → 新 id`，供事后到平台核对是否重复（不改变既有回写行为） |

> 以上均为**只读校验 + 跳过 + 告警**，不新增写平台的动作；`dryRun` 之外的行为与方案文档 §12.5-a 一致。

#### 3.3.2 请求字段完整性核对（"会不会少传漏字段"，2026-10-10 补充）

结论：**不会少传**。参数全部由同一个 `lierenOfferRuleSyncPlat` 无条件拼装（不按调用来源裁剪），本次唯一新增字段就是 `extra_amount`。三条真实路径逐字段对齐结果：

| 路径 | 入参来源 | 下发字段集合 |
| --- | --- | --- |
| **存量推送**（本次新增） | `queryRuleList` 的 **DB 行**（`platOfferList` 为 JSON 字符串，函数内解析） | 22 个字段全集 |
| 规则同步修复 / 登录检查 | `queryRuleList` 的 **DB 行**（`handleFixLierenRule` 会先解析数组，再由 `restoreJsonFieldsForSync` 还原） | 22 个字段全集（与本行**完全一致**） |
| 规则新增/编辑保存 | 弹框表单对象 | 22 个字段全集（其中 `province`/`min_price`/`max_price` 弹框里没有对应输入项，编辑保存时走的是 `""`/`10`/`500` 默认值，本地库里的真实值反而不下发） |

平台请求字段全集（22 个，`lierenOfferRuleSyncPlat` 内一次性拼装）：

```
rule_id, name, cinema_group, cinema_code, exclude_cinema_code,
province, city, exclude_city, film, exclude_film, hall, exclude_hall,
min_price, max_price, sum_mode, price, seats, version_type, state,
extra_amount,            ← 本次新增（唯一变化）
lieren_ak, lieren_sk
```

字段来源核对（防止"某字段没值就被漏掉"）：

| 字段 | 来源 | 值为空时 |
| --- | --- | --- |
| `rule_id` | `platOfferList[lieren].platRuleId` | 无 id 的规则在推送前已被 **跳过**（不会发半截请求） |
| `name` | `remark \|\| ruleName` | 兜底到规则名 |
| `price` | `platOfferList[lieren].value` | 非"有限正数"时**跳过**（§3.3.1-①），不会发 `0/NaN` |
| `seats` / `version_type` / `state` | `seatNum` / `film_type` / `status` | `formatSeats` 与 `status` 均有确定输出 |
| `city/film/hall/...`（6 个 JSON 字段） | 各自 DB 字段经 `JSON.parse(...).join()` | `\|\| ""`（不传即不限制） |
| `min_price` / `max_price` | DB 列 | `\|\| 10` / `\|\| 500` |
| `extra_amount` | `bWalletMarkup` | `Number.isFinite` 兜底为 `0` |
| `lieren_ak` / `lieren_sk` | 字典 `lierenMainAccountAkSk[rule]` | 取不到即中止（不发请求） |

> **注**：`version_type` 是全字段里唯一没有 `|| ""` 兜底的项，DB 列为 `NULL` 时会原样发 `null` —— 与「规则同步修复 / 登录检查」路径**行为完全一致**（该路径已在生产长期运行），不是本次引入的差异。

**验证方式（已落在单测里，共 2 条）**：

1. `存量推送把平台字段全集都发出去，且值取自本地规则` —— 断言 `ruleAdd` 入参的**键集合**等于上面 22 个字段（新增/删除字段都会立刻失败），并逐项断言取值（`name` 取备注、`city/film/hall` 来自 JSON 字段、`sum_mode`/`price`/`seats`/`version_type`/`state`/`extra_amount`/AK-SK 正确）；
2. `同一份规则：存量推送 / 编辑保存 / 规则同步修复 三条路径下发的参数完全一致` —— 同一份规则分别经三条路径调用，断言 `ruleAdd` 入参 **`toEqual` 完全相等**（防"路径之间悄悄少发字段"）。

**变异验证（证明这组测试有效）**：临时把参数里的 `province` 改名（模拟漏传一个字段）→ 上述第 1 条测试立即失败（键集合不匹配）→ 还原后恢复全绿。即：以后任何人漏加/漏传字段都会被拦下。

> 说明：第 1 条防"字段缺失"，第 2 条防"路径间不一致"；两条分工不同，故变异只会触发第 1 条。

### 3.4 人工触发入口（§12.5-b）

`src/views/offerRule/index.vue:487-499` 挂载：

```js
window.pushLierenExtraAmountToPlat = pushLierenExtraAmountToPlat;
```

不新增按钮、不改登录/检测路径（一次性运维动作，避免被误点成「随手全量覆盖平台规则」）。

> 操作提示：该函数随「报价规则」页面初始化挂载，执行前需先进入该页面（登录后停在其它页面时 `window.pushLierenExtraAmountToPlat` 尚未定义）。

### 3.5 与方案文档的两处实施偏差（均不改变语义）

1. **`restoreJsonFieldsForSync` 只在新函数内使用，未回改 `checkAndUpdateLierenRuleState`**：方案原文写「建议抽成小工具函数供两处共用」，落地时按「只改与需求直接相关的行」原则**不动登录/规则页修复/券库存同步共用的那条既有同步路径**，避免把热路径卷进本次改动（两者语义完全一致，后续需要再统一）；
2. **新增独立单测文件 `lierenBWalletBackfill.test.js`**（方案 §12.10 未指定文件名）：用例需桩化 `@/utils/utils`、`@/api/sv-api`、`@/api/lieren-api`、`element-plus`，并桩化 `@/store/cinemaList`、`@/store/specialNameRule`（`cinemaList ←→ constant` 存在循环引用，babel-jest 的 CJS 互操作下 `useCinemaList` 会解析为 `undefined`）。

## 4. 测试结果

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 新增用例 | `npx jest --runInBand --forceExit src/common/tests/lierenBWalletBackfill.test.js` | ✅ 15/15（RED 阶段先失败于 `pushLierenExtraAmountToPlat is not a function`；加固项 4 条、字段完整性 2 条另经 RED→GREEN 与变异验证） |
| B钱包既有用例（算价不回退） | `npx jest --runInBand --forceExit src/common/tests/lierenBWalletMarkup.test.js` | ✅ 20/20 |
| 缺列兜底用例 | `npx jest --runInBand --forceExit src/common/tests/dbColumnFallback.test.js` | ✅ 12/12 |
| 聚焦三套件合计 | 上述三条命令 | ✅ 47/47 |
| 同步日志既有用例 | `npx jest --runInBand --forceExit src/common/tests/lieren-sync-logging.test.js` | ✅ 20/20 |
| 全量单测 | `npx jest --runInBand --forceExit` | ✅ **566 通过 / 51 失败**（43 套件、6 套件失败）：失败集合与改动前**完全一致**（`service-health-detection`、`getOfferFailType`、后端 `users`、`PlatformFactory`、`BasePlatformAdapter`、`QueueFactory`）；改动前基线 551 通过 / 51 失败（见 §11.5），新增 15 条全绿 |
| SFC 编译检查 | `@vue/compiler-sfc` 的 `parse` + `compileTemplate` + `compileScript` | ✅ `RuleDialog.vue`、`offerRule/index.vue` 均 OK |
| 格式噪音 | `git diff` | ✅ 仅需求相关行；未改引号/缩进/尾逗号，**未运行任何格式化命令** |

## 5. 上线顺序（不可颠倒）

1. 核对列注释：`SHOW FULL COLUMNS FROM rule_record LIKE 'bWalletMarkup'`，旧文案则执行 `doc/sql/2026-10-10-bwallet-markup-column-comment.sql`；
2. **备份 + 刷数**：执行 `doc/sql/2026-10-10-bwallet-markup-sync-rules.sql`（⓪ 备份 → ① 预览 → ② 刷数 → ③ 校验），记下 `syncedFixedRules` / `markupIsOne`；
3. 客户端发版（本次代码）；
4. 以 **rule=2 账号**登录 → 进入「报价规则」页面 → 先点一次「检测」确认 state/seats 无异常（必要时导出平台规则快照）；
5. **演练（不写平台）**：控制台执行 `await window.pushLierenExtraAmountToPlat({ dryRun: true })`，核对：
   - `total` = 第 2 步的 `syncedFixedRules`；`planned` = 第 2 步的 `markupIsOne`；
   - `skipped` / `failed` 应为 0，`invalidList` 应为空；若 `invalidList` 非空，**先处理这些规则的本地平台价**（缺失/非正数）再继续；
6. **正式推送**：`await window.pushLierenExtraAmountToPlat()`；期间**不要刷新或跳转页面**（脚本跑在页面上下文里，刷新会中断；中断可直接重跑，幂等）；
7. **对账**：`total`/`pushed` 应等于第 2 步的两个数；`skipped`/`failed` 为 0；`ruleIdChanged` 应为空；
   - `skipped > 0`：本地缺 `platRuleId` 或平台侧无该规则 → 先点「规则同步修复」重建再重跑；
   - `failed > 0`：按 `failedList` 重跑；
   - `ruleIdChanged` 非空：到平台核对是否产生了**重复规则**（历史上有「编辑后平台侧新建规则」的先例）；
8. 去猎人平台抽 2–3 条核对：`extra_amount` = 本地 `bWalletMarkup`，B 价 = `price + extra_amount`，且规则**总数没有变多**（排除重复新建）；
9. 确认 `extra_amount` **只影响 B 钱包**：抽一条 A 钱包订单核对报价未变化（若平台把附加价也加到 A 钱包，需立即停用该字段）；
10. 观察：未同步规则的 B 钱包报价与改造前一致（本地叠加），`pay_type=0` 订单不受影响。

> 平台侧纠偏只能「按备份值再推一次」：SQL 回滚本地值**不会**自动改回平台 `extra_amount`。

## 6. 回归风险评估

| 影响面 | 风险 | 等级 | 规避 |
| --- | --- | --- | --- |
| 本地报价（未同步规则） | 无改动 | 低 | 算价代码未动；`lierenBWalletMarkup` 20 条用例全绿 |
| 平台侧规则 | `extra_amount` 从无到有，覆盖平台手工值（空值发 0） | 中 | §12.8-2 已确认；推送范围与刷数一致，且刷数前备份现值 |
| 存量推送 | `ruleAdd` 全字段覆盖（price/seats/state/名称/影院范围…） | 中 | 推送前点「检测」+ 导出平台快照；**新增本地平台价校验**（无效即跳过并记入 `invalidList`）；支持 `dryRun` 演练先看清单 |
| 存量推送 | 平台若返回新的 `rule_id`（新建规则）会产生重复平台规则 | 中 | 汇总 `ruleIdChanged` 并逐个告警；上线核对步骤增加「平台规则总数未变多」检查 |
| 存量推送 | 逐条请求可能触发 429 | 低 | 200ms 间隔 + 平台旧规则一次性预取（避免 N+1）；可分批 |
| 存量推送 | 运行期间刷新/跳转页面会中断，出现部分推送 | 低 | 运行手册明确「不要刷新」；函数幂等，可直接重跑，并用 `total`/`pushed` 对账 |
| 日常同步日志 | `ext_data` 新增 `extra_amount` 字段 | 低 | 仅追加字段（全仓无 `ext_data` 消费方），不改既有键；单测断言默认 `trigger_source`/`change_reason` 不变 |
| 其它同步路径 | 券库存自动同步/编辑保存会顺带携带 `extra_amount` | 低 | 与同步落点唯一的既有设计一致（§12.5-c），仅 `offerType==1 && isSyncPlat==1` 规则受影响 |
| 检测 | 不检测 `extra_amount`（`rule/list` 不回值，2026-10-10 用户确认） | 低 | 已确认接受；靠平台报价与线上抽样核对 |
| 测试基建 | 新增用例需桩化多个模块 | 低 | 已在用例内注释说明原因（同 §10.2-② 的既有解析问题） |

## 7. 仍待闭合的前置（不阻塞本次落地，但影响「加价是否真的生效」）

见方案文档 §12.13：

1. **平台契约取证**：`rule/list` **不返回 `extra_amount`** 已由用户 2026-10-10 确认；但 `rule/add` 是否接受该字段仍需**第一次同步成功**来证明 —— 建议上线后先推一条（或用 `dryRun` 之外的首次正式推送观察 `failed` 是否为 0），若平台对未知字段严格校验，`failed` 会立刻暴露且只影响已推的少数规则；
2. **已同步规则 + 时段外（约 23:00–09:00）**：该时段平台是否报价尚无取证，若平台不报价则本地算价且守卫保留 → B 价 = A 价，需与平台/业务确认；
3. 刷数范围外的已同步规则（其它账号 / status 非 1、3）`bWalletMarkup` 仍为 `NULL`，平台侧 `extra_amount` 会被推成 `0`（A=B）；
4. 刷数范围含 `status='3'`（仅报价）的规则：推送会按既有口径把平台 `state` 置 0（禁用），与「登录检查/规则同步修复」的既有行为一致 —— 若这些规则在平台上当前是启用状态，需确认禁用符合预期。
