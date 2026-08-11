# 守兔手续费按 needInvoice 分档整改说明

> 日期：2026-08-11
> 状态：**已实施**
> 背景：守兔平台手续费规则变更——由"无手续费"改为按订单 `needInvoice` 字段分档收取：`needInvoice=1`（需发票）手续费 1 个点，`needInvoice=0`（不需发票）手续费 6 个点。`needInvoice` 字段由守兔待报价/待出票接口返回，仅守兔订单有此字段。

---

## 1. 需求与场景界定

| 项 | 内容 |
| --- | --- |
| 生效平台 | 仅守兔（`shoutu`） |
| 字段来源 | 守兔接口返回的订单原始字段 `needInvoice`（驼峰，数字类型，示例值 `0` 或 `1`） |
| 费率规则 | `needInvoice == 1` → 手续费率 1%（0.01）；`needInvoice == 0` → 手续费率 6%（0.06） |
| 字段缺失处理 | 守兔订单 `needInvoice` 缺失/异常时按 `0` 处理（6%，保守，避免少收） |
| 其他平台 | 不受影响（`needInvoice` 字段不存在，按原逻辑：默认 1% 或 `NO_FEE_PLAT_LIST` 免手续费） |
| 生效环节 | 报价计算（`calculateCostProfit`）——影响手续费、真实成本、预计利润、最大卡券成本 |

守兔接口返回的订单原始结构（节选）：

```json
{
  "id": 33876780,
  "orderId": "20260811111408159629518822305412208",
  "orderUUID": "2087014675453652993",
  "needInvoice": 0,
  "orderNum": 1,
  "unitPrice": 32,
  "maxPrice": 31.3,
  ...
}
```

---

## 2. 现状分析

### 2.1 守兔当前是无手续费平台

`src/common/constant.js` L26：

```js
const NO_FEE_PLAT_LIST = ["haha", "shoutu", "mahua"];
```

守兔在免手续费名单内，报价时 `shouxufei = 0`。

### 2.2 手续费计算存在两种模式（历史遗留）

| 模式 | 系列 | 计算方式 |
| --- | --- | --- |
| A 调用工具函数 | `wanda` / `ume` / `sfc` | `calcOfferCostProfitParts(...)`（`common/offerHelper.js`） |
| B 内联计算 | `lma` / `jinyi` / `chenxing` / `fenghuang` / `h5ume` | 各 `offerManage.js` 的 `calculateCostProfit` 内 `let shouxufei = (adjustedPrice*100)/10000` |

**模式A**（`offerHelper.js` L175-226）：已预留 `feeRate` 参数，注释明确"若后续需要支持非 1% 手续费，可通过 feeRate 扩展"。

**模式B**（以 `lma/offerManage.js` L334-338 为例）：

```js
// 手续费
let shouxufei = (adjustedPrice * 100) / 10000;
if (NO_FEE_PLAT_LIST.includes(this.plat_name)) {
  shouxufei = 0;
}
```

两种模式的逻辑等价（默认 1%，`NO_FEE_PLAT_LIST` 命中为 0），但代码重复分布在 8 处。

### 2.3 needInvoice 字段当前未接入

`ShoutuOrderFetcher.js` L44-78 解析订单时未取 `needInvoice`，全局搜索 `needInvoice|need_invoice` 无任何匹配。守兔订单数据流：

```
守兔接口 → ShoutuOrderFetcher.fetchOrders() 解析 → order 对象 → 各系列 offerManage(this.order)
```

`this.order` 在报价环节的 `calculateCostProfit` 上下文可访问：报价实例经 `BaseOfferPrice.getEndOfferPrice({ order })` 入口执行，该入口开头统一执行 `this.order = order`（一处修复 8 个系列，见 8.6 修订记录）。出票链路各模块（cardQuanManage/orderManage/cinemaManage/seatManage/platManage/BaseBuyTicket）构造器均持有 `this.order = order`（全系列 34 处赋值一致）。

---

## 3. 整改内容

### 3.1 新增公共费率函数 `getPlatFeeRate(order)`（`common/offerHelper.js`）

统一费率来源，报价环节与出票环节共用。**直接接收 order 对象**，内部从中取 `plat_name` / `needInvoice` 等字段，`NO_FEE_PLAT_LIST` 在工具类内部 import 引用（不作为参数传递），扩展性好——后续新平台加分档规则只改此函数：

```js
import { ONE_STEP_PLAT_LIST, NO_FEE_PLAT_LIST } from "@/common/constant";

/**
 * 获取平台手续费率（统一费率来源，支持守兔按 needInvoice 分档）
 * @param {Object} order - 订单对象（从中取 plat_name / needInvoice 等字段）
 * @returns {number} 手续费率（0~1）
 */
export function getPlatFeeRate(order) {
  const plat_name = order?.plat_name;
  // 免手续费平台优先
  if (NO_FEE_PLAT_LIST.includes(plat_name)) return 0;
  // 守兔按 needInvoice 分档：1→1%，0/缺失→6%（保守，避免少收）
  if (plat_name === "shoutu") {
    return Number(order?.needInvoice) === 1 ? 0.01 : 0.06;
  }
  // 默认 1%
  return 0.01;
}
```

### 3.2 `calcOfferCostProfitParts` 接入 `getPlatFeeRate(order)`（`common/offerHelper.js`）

用 `order` 参数替换原 `plat_name` / `needInvoice` / `noFeePlatList` 三个参数，内部调 `getPlatFeeRate(order)`，移除原未被使用的 `feeRate` 参数：

```js
export function calcOfferCostProfitParts({
  adjustedPrice,
  cost_price,
  rewards,
  order,                    // 替换 plat_name/needInvoice/noFeePlatList
  logger
}) {
  const feeRate = getPlatFeeRate(order);
  let shouxufei = mulDecimal(Number(adjustedPrice || 0), feeRate);
  // 其余 rewardPrice / pay_cost_price / real_cost_price / expectProfit / maxCostPrice 逻辑不变
}
```

### 3.3 报价环节——模式A调用点改传 `order`（3处）

`wanda/offerManage.js`、`ume/offerManage.js`、`sfc/offerManage.js` 的 `calculateCostProfit`：

```js
const parts = calcOfferCostProfitParts({
  adjustedPrice,
  cost_price,
  rewards,
  order: this.order           // 替换 plat_name/needInvoice/noFeePlatList
});
```

### 3.4 报价环节——模式B内联计算改用 `getPlatFeeRate(order)`（5处）

`lma/offerManage.js`、`jinyi/offerManage.js`、`chenxing/offerManage.js`、`fenghuang/offerManage.js`、`h5ume/offerManage.js`：

```js
// 手续费（统一走 getPlatFeeRate，支持守兔按 needInvoice 分档）
const feeRate = getPlatFeeRate(this.order);
let shouxufei = mulDecimal(Number(adjustedPrice || 0), feeRate);
```

> 注：手续费乘法统一走 `mulDecimal`（基于 decimal.js）避免精度丢失，详见 `2026-08-11-手续费精度丢失整改说明.md`。

### 3.5 出票环节——cardQuanManage 手续费利润复核同步改用 `getPlatFeeRate(order)`（15处）

出票环节用卡/用券时的利润复核也计算手续费，原逻辑与报价环节一致（`NO_FEE_PLAT_LIST` 命中为 0，否则 1%）。若不同步改，会导致报价时算 6%、出票复核时算 0%，利润判断不一致。

改动点分布（每系列2处：用券利润复核 + 用卡利润复核，sfc 含1处单行变体）：

| 文件 | 处数 |
| --- | --- |
| `wanda/cardQuanManage.js` | 2 |
| `ume/cardQuanManage.js` | 2 |
| `sfc/cardQuanManage.js` | 2 |
| `jinyi/cardQuanManage.js` | 2 |
| `chenxing/cardQuanManage.js` | 2 |
| `fenghuang/cardQuanManage.js` | 2 |
| `h5ume/cardQuanManage.js` | 2 |
| `lma/buyTicket.js` | 1 |

统一改为：

```js
// 手续费（统一走 getPlatFeeRate，支持守兔按 needInvoice 分档）
const feeRate = getPlatFeeRate(this.order);
let shouxufei = mulDecimal(Number(supplier_end_price || 0), feeRate);
```

`lma/cardQuanManage.js` 原先 import 了 `NO_FEE_PLAT_LIST` 但未使用（悬空 import），一并清理。

### 3.6 守兔两个拉单入口解析 `needInvoice`

守兔报价与出票是**两条独立拉单链路、各自构造订单对象**，两个入口都必须解析：

| 入口 | 接口 | 文件 |
| --- | --- | --- |
| 待报价列表（报价链路） | `queryStayOfferList`（`list-wait-quote-order`） | `platform/queues/ShoutuOfferQueue.js` |
| 中签订单（出票链路） | `stayTicketingList`（`pc-order/page-order`） | `platform/fetchers/ShoutuOrderFetcher.js` |

两个入口解析订单时均取出 `needInvoice` 挂到 order 对象：

```js
const {
  orderUUID: id,
  unitPrice: supplier_end_price,
  // ...原字段
  needInvoice          // 新增：守兔手续费分档依据
} = item;

return {
  id,
  supplier_end_price,
  // ...原字段
  needInvoice,         // 新增
  plat_name: "shoutu"
};
```

> 修订说明（2026-08-11）：初版仅改 `ShoutuOrderFetcher.js`（出票链路），漏改 `ShoutuOfferQueue.js`（报价链路）——报价环节 `getPlatFeeRate(this.order)` 拿不到 `needInvoice` 恒按 6%（`needInvoice=1` 的单手续费多扣 5 个点、报价竞争力被误杀，且 `fee_rate` 落库恒 0.06 与出票实际 1% 不一致）。已补齐两个入口。

### 3.7 `constant.js` 移除守兔

L26：

```js
const NO_FEE_PLAT_LIST = ["haha", "mahua"];   // 移除 "shoutu"
```

### 3.8 各业务文件移除不再使用的 `NO_FEE_PLAT_LIST` import

报价环节 8 个 offerManage + 出票环节 8 个 cardQuanManage/buyTicket，共 16 个文件原先各自 import `NO_FEE_PLAT_LIST`，改造后该常量统一由 `offerHelper.js` 内部引用，业务文件全部移除该 import（保持 `TEST_NEW_PLAT_LIST` 等其他常量不变）。

---

## 4. 整改后数据流

```
守兔接口返回订单(含 needInvoice)
 → ShoutuOrderFetcher.fetchOrders() 解析 needInvoice 挂到 order
 → 守兔订单分发到各系列 offerManage / cardQuanManage (this.order 可访问 needInvoice)
 → 手续费计算
    ├ 报价环节 calculateCostProfit()
    │   ├ 模式A(wanda/ume/sfc): calcOfferCostProfitParts({ order: this.order })
    │   │   → getPlatFeeRate(order)
    │   └ 模式B(lma/jinyi/chenxing/fenghuang/h5ume): getPlatFeeRate(this.order)
    └ 出票环节 cardQuanManage 利润复核(15处)
        getPlatFeeRate(this.order)
        → needInvoice==1 → 0.01 | needInvoice==0/缺失 → 0.06
        → shouxufei = supplier_end_price * feeRate
```

非守兔平台：`order.needInvoice` 为 `undefined`，`getPlatFeeRate` 不进入守兔分支，按原逻辑（默认 1% 或免手续费名单）返回，行为不变。

---

## 5. 边界与降级

| 场景 | 行为 |
| --- | --- |
| 守兔订单 `needInvoice=1` | 手续费 1%（与原"无手续费"相比成本上升，利润下降，需关注报价竞争力） |
| 守兔订单 `needInvoice=0` | 手续费 6%（成本显著上升，原利润为负的规则将触发"低于真实成本"不报价） |
| 守兔订单 `needInvoice` 缺失/异常 | 按 `0` 处理（6%，保守，避免少收） |
| 非守兔平台订单 | `needInvoice` 不存在，`getPlatFeeRate` 走默认分支，行为与现状完全一致 |
| `haha` / `mahua` | 仍在 `NO_FEE_PLAT_LIST`，继续免手续费 |
| 守兔订单 `needInvoice` 类型为字符串 `"1"` | `Number(needInvoice) === 1` 兼容字符串数字 |
| 利润校验 | 现有 `profitDiff <= 0 → return null`（不报价）逻辑不变，6% 手续费可能导致更多规则不报价 |

---

## 6. 变更清单

| 文件 | 类型 | 变更 |
| --- | --- | --- |
| `src/common/autoTicket/buyTicket/common/offerHelper.js` | 修改 | 新增 `getPlatFeeRate(order)`；`calcOfferCostProfitParts` 用 `order` 替换 `plat_name`/`needInvoice`/`noFeePlatList`，移除 `feeRate`；内部 import `NO_FEE_PLAT_LIST` |
| `src/common/constant.js` | 修改 | `NO_FEE_PLAT_LIST` 移除 `"shoutu"` |
| `src/common/platform/fetchers/ShoutuOrderFetcher.js` | 修改 | 解析中签订单时取出 `needInvoice` 挂到 order 对象 |
| `src/common/platform/queues/ShoutuOfferQueue.js` | 修改 | 待报价列表解析同样取出 `needInvoice` 挂到 order 对象 |
| **报价环节（8个 offerManage）** | | |
| `wanda/offerManage.js` | 修改 | `calcOfferCostProfitParts` 改传 `order: this.order`；移除 `NO_FEE_PLAT_LIST` import |
| `ume/offerManage.js` | 修改 | 同上 |
| `sfc/offerManage.js` | 修改 | 同上 |
| `lma/offerManage.js` | 修改 | 内联手续费改 `getPlatFeeRate(this.order)`；补 import；移除 `NO_FEE_PLAT_LIST` import |
| `jinyi/offerManage.js` | 修改 | 同上 |
| `chenxing/offerManage.js` | 修改 | 同上 |
| `fenghuang/offerManage.js` | 修改 | 同上 |
| `h5ume/offerManage.js` | 修改 | 同上 |
| **出票环节（8个 cardQuanManage/buyTicket）** | | |
| `wanda/cardQuanManage.js` | 修改 | 2处手续费改 `getPlatFeeRate(this.order)`；补 import；移除 `NO_FEE_PLAT_LIST` import |
| `ume/cardQuanManage.js` | 修改 | 同上 |
| `sfc/cardQuanManage.js` | 修改 | 同上（含1处单行变体） |
| `jinyi/cardQuanManage.js` | 修改 | 同上 |
| `chenxing/cardQuanManage.js` | 修改 | 同上 |
| `fenghuang/cardQuanManage.js` | 修改 | 同上 |
| `h5ume/cardQuanManage.js` | 修改 | 同上 |
| `lma/buyTicket.js` | 修改 | 1处手续费改 `getPlatFeeRate(this.order)`；补 import；移除 `NO_FEE_PLAT_LIST` import |
| `lma/cardQuanManage.js` | 修改 | 清理悬空的 `NO_FEE_PLAT_LIST` import（原先 import 但未使用） |
| `src/common/platform/adapters/MahuaAdapter.js` | 修改 | `_getProfit` 手续费率统一走 `getPlatFeeRate(order)`（行为等价：mahua→0，守兔分档不涉及） |
| `src/common/platform/adapters/PiaoShengAdapter.js` | 修改 | 同上（piaosheng→1%） |
| `doc/changes/2026-08-11-守兔手续费按needInvoice分档整改说明.md` | 新增 | 本说明 |

共 22 个代码文件 + 1 个文档。

---

## 7. 风险与验证

### 7.1 风险

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| 6% 手续费导致大量规则不报价 | `needInvoice=0` 的单成本上升，原利润薄的规则会触发"低于真实成本"不报价 | 属业务预期变化，需运营关注报价规则调整 |
| 模式B 5处改动遗漏 import | 每处需补 `getPlatFeeRate` 导入 | 改完逐文件 `node --check` 验证 |
| `feeRate` 参数移除影响调用方 | 全代码库无调用方显式传 `feeRate`（grep 确认） | 已验证无影响 |
| `needInvoice` 字段类型不稳 | 守兔接口可能返回数字或字符串 | `Number(needInvoice) === 1` 兼容 |

### 7.2 验证

1. 语法检查：所有 19 个改动文件 `node --check` 通过
2. grep 确认：`NO_FEE_PLAT_LIST` 仅保留在 `offerHelper.js` 统一引用，业务代码（offerManage/cardQuanManage/buyTicket）已全部清理
3. 守兔 `needInvoice=1` 单：日志确认 `shouxufei = 报价 * 0.01`
4. 守兔 `needInvoice=0` 单：日志确认 `shouxufei = 报价 * 0.06`
5. 守兔 `needInvoice` 缺失：日志确认 `shouxufei = 报价 * 0.06`（保守）
6. 非守兔平台（如猎人/哈哈/麻花）回归：手续费与现状一致（哈哈/麻花为 0，其他为 1%）
7. 报价环节与出票环节手续费一致：同一守兔订单在 `offerManage` 和 `cardQuanManage` 的 `shouxufei` 值相同

---

## 8. 实施确认

1. **`getPlatFeeRate(order)` 直接接收 order 对象**：从 order 取 plat_name/needInvoice，`NO_FEE_PLAT_LIST` 在工具类内部 import，已按此实施。
2. **`needInvoice` 缺失默认按 0（6%）**：保守处理避免少收，已按此实施。
3. **出票环节 cardQuanManage 同步改造**：15处手续费利润复核改用 `getPlatFeeRate(this.order)`，与报价环节保持一致，已按此实施。
4. **业务文件移除 `NO_FEE_PLAT_LIST` import**：16个业务文件全部移除，该常量统一由 `offerHelper.js` 内部引用，已按此实施。
5. **语法验证**：全部 19 个改动文件 `node --check` 通过。
6. **修订记录——报价环节 `this.order` 缺失修复**（2026-08-11）：初版改造时 `BaseOfferPrice` 构造器仅存 `appFlag`/`plat_name`，`initModules(order)` 只把 order 注入子模块（logger/cardQuanManage 等），报价类本身**未持有订单对象**——初版文档 §2.3"基类构造时 this.order = order"表述与事实不符。导致 8 个 offerManage 的 `getPlatFeeRate(this.order)` 收到 `undefined`、恒返回 0.01，**守兔 `needInvoice=0`（6% 档）在报价环节实际按 1% 计算**（风控失效风险：真实成本偏低、负利润单可能被放行报价）。已修复：`BaseOfferPrice.getEndOfferPrice` 开头统一执行 `this.order = order`（一处修复 8 个系列），§2.3 表述已同步更正。附带影响：h5ume/offerManage 既有代码 `this.order?.need_unsplit_login`（L951/L1043）此前恒为 `!undefined=true`，修复后按真实值参与判断，需回归验证。
7. **修订记录——平台适配器费率统一**（2026-08-11）：`MahuaAdapter` / `PiaoShengAdapter` 的 `_getProfit` 手续费率由 `NO_FEE_PLAT_LIST` 判断改为统一走 `getPlatFeeRate(order)`（行为等价：mahua→0、piaosheng→1%；守兔订单不走这两个适配器，分档不生效），移除两文件 `NO_FEE_PLAT_LIST` import，变更清单已同步补充。
8. **修订记录——报价链路 needInvoice 补漏**（2026-08-11）：守兔报价与出票为两条独立拉单链路（报价走 `ShoutuOfferQueue` 的待报价列表接口 `queryStayOfferList`，出票走 `ShoutuOrderFetcher` 的中签订单接口 `stayTicketingList`），初版仅改了出票链路 fetcher，报价链路 order 缺 `needInvoice`，导致报价环节与 `fee_rate` 落库对 `needInvoice=1` 的单恒按 6%（多扣 5 个点、报价竞争力被误杀）。已补齐 `ShoutuOfferQueue` 解析，报价/落库/出票三处费率一致。
