# SFC 重构后报价、出票逻辑严格对比验证

本文档记录 SFC 模块化重构（`sfc/`）与旧版（`sfcOffer.js`、`sfcAutoTicket.js`）的对比结论及已修复差异。

---

## 一、报价逻辑对比

### 1.1 流程与入口

- **旧版**：`sfcOffer.js` → `getEndOfferPrice` → `getEndMatchOfferRule` → `getQuanInfo` / 会员成本 → `getEndPrice` → 异常检测 → `returnResultHandle`
- **重构**：`commonOfferHandle` 使用 `sfc/offerManage` → 继承 `BaseOfferPrice`，重写 `getEndOfferPrice`（含系统异常检查）→ `getEndMatchOfferRule` → `getCostPrice` → `calculateFinalPrice` → 同结构返回

### 1.2 核心计算

| 项 | 旧版 | 重构 | 结论 |
|----|------|------|------|
| 手续费 | `(price * 100) / 10000` | `calculateCostProfit` 内同式 | 一致 |
| 奖励费用 | `(price * 100 * rewards) / 10000` | 同 | 一致 |
| 最大卡券成本 | `(price*1000 + reward*1000 - shouxufei*1000)/1000` | 同 | 一致 |
| 利润校验 | `price <= real_cost_price` 且非 `TEST_NEW_PLAT` 则未通过 | 同 | 一致 |
| 动态调价 | `adjustPrice` + `lierenMachineOfferList`（旧版实际常为空） | `applyDynamicPricing` 用 `offerList` | 重构为可用逻辑，行为有差异 |
| 异常检测 | `isAnomaly` → `getTicketList` → `checkConsecutiveErrors` | 同上，`checkConsecutiveErrors` 修正旧版逻辑 bug | 重构逻辑正确 |

### 1.3 已知差异（保留）

- 旧版 `checkConsecutiveErrors`：`if (orders?.length) return false` 导致有订单时恒不判故障；重构已改为 `!orders?.length \|\| orders.length < 2` 等正确判断。
- 报价流程、成本价、最终报价公式、`maxCostPrice` 过滤、`quanValue` 过滤、异常检测入口与重构版对齐。

---

## 二、利润计算对比

### 2.1 用券（useQuan）

| 项 | 旧版 | 重构 | 结论 |
|----|------|------|------|
| 手续费 | `(supplier_end_price*100)/10000`，`NO_FEE_PLAT_LIST` 置 0 | 同 | 一致 |
| 利润 | `(supplier_end_price - quan_cost - shouxufei) * useQuans.length` | 同 | 一致 |
| 奖励 | `+ (supplier*100 * ticket_num * rewards) / 10000` | 同 | 一致 |
| 负利润 | `profit < 0` 且非 `TEST_NEW_PLAT` 则返回 `{ profit:0, useQuans:[] }` | 同 | 一致 |

### 2.2 用卡（useCard）

| 项 | 旧版 | 重构 | 结论 |
|----|------|------|------|
| 手续费 | `(supplier_end_price*100)/10000`，`NO_FEE_PLAT_LIST` 置 0 | **原缺失** → **已修复** | 一致 |
| 利润 | `(supplier - member - shouxufei) * ticket_num` | 同（修复后） | 一致 |
| 奖励 | `+ (supplier*100 * ticket_num * rewards) / 10000` | **原少乘 100** → **已修复** | 一致 |
| 负利润 | 日志 + 返回 `{ card_id:"", profit:0 }` | **已补日志** | 一致 |

**已修复点**（`cardQuanManage.useCard`）：

1. 手续费：按 `NO_FEE_PLAT_LIST` 置 0，与旧版一致。
2. 奖励公式：使用 `(supplier * 100 * ticket_num * rewards) / 10000`。
3. 负利润时增加 `"使用会员卡计算价格后最终利润为负"` 日志。

---

## 三、价格校验与会员价调整

### 3.1 支付金额 vs 券手续费

- 用券（`offer_type === "1"`）：`pay_money > quan_fee_total` 时走转单；`quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000`。旧版与重构一致。

### 3.2 会员价差异调整

- `real_member_price = Number(offerRule.real_member_price||0) * ticket_num`，仅在用卡时处理。
- `pay_money > real_member_price`：`diff = subDecimal(pay_money, real_member_price)`，若 `diff < profit` 则 `profit = subDecimal(profit, diff)`，否则转单。
- `pay_money < real_member_price`：`profit += (real_member_price - pay_money) * member_discount / 100`，再 `toFixed(2)`。

**已修复**：`pay_money > real_member_price` 且扣减利润时，补上旧版日志 `"用完卡发现支付金额大于会员价*票数，利润需减去差值"`。

---

## 四、卡券使用流程

- 异步绑券：`targetQuanList.length - ticket_num < 10` 且 `is_store == "1"` 时触发，旧版与重构一致。
- 用券列表：`targetQuanList.filter((_, i) => i < ticket_num)`，利润、`useQuans` 逻辑一致。
- 用卡：余额过滤、默认卡优先再按余额排序、非 V3 逐个 `priceCalculation` 尝试，与旧版一致。

---

## 五、错误处理与转单

### 5.1 换号

- 换号前：用**上一号** `session_id` 取消订单或释放座位；换号后恢复 `offerRule.old_quan_value` → `quan_value`。与旧版一致。

### 5.2 转单

- **已修复**：换号失败走转单时，须用**上一号** `session_id` 取消/释放。原 `transferWithUnlock` 统一覆盖为当前号 `session_id`，导致换号转单用错 session。
- 修改点：
  1. `transferWithUnlock`：若 `unlockInfo` 含 `session_id` 则沿用，否则用当前 `session_id`。
  2. `orderManage.transferOrder`：若 `unlockSeatInfo.session_id` 存在则优先使用，再取消/释放。

### 5.3 测试模式

- 旧版：创建订单成功后直接 `return { offerRule }`，不购买、不取消、不释座。
- 重构：创建订单后**不购买**，并**取消订单或释放座位**（对齐 LMA），再 `return { offerRule }`。与旧版行为不同，属刻意对齐 LMA 的改动。

---

## 六、特殊场景

| 场景 | 旧版 | 重构 | 结论 |
|------|------|------|------|
| `NO_FEE_PLAT_LIST` | 用券/用卡手续费置 0 | 用券/用卡同（useCard 已修） | 一致 |
| `TEST_NEW_PLAT_LIST` | 允许负利润、报价利润校验放宽 | 同 | 一致 |
| V3（如 `hbchyxd`） | `is_open_svip`、`getCardAndQuanList`、`member_id`、`pay_type=wallet`、支付密码 | `orderManage` / `cardQuanManage` 同等处理 | 一致 |

---

## 七、修改文件汇总

1. **`sfc/cardQuanManage.js`**  
   - `useCard`：手续费按 `NO_FEE_PLAT_LIST`、奖励公式、负利润日志与旧版对齐。

2. **`sfc/buyTicket.js`**  
   - 会员价调整：补 `"用完卡发现支付金额大于会员价*票数，利润需减去差值"` 日志。  
   - `transferWithUnlock`：保留 `unlockInfo.session_id`，换号转单使用上一号 session。

3. **`sfc/orderManage.js`**  
   - `transferOrder`：优先使用 `unlockSeatInfo.session_id`，再取消/释放。

以上修改均旨在与旧版报价、出票逻辑严格对齐；动态调价、测试模式等有意差异已单独说明。
