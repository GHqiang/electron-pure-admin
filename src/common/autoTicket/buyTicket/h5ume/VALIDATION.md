# H5UME 重构后报价、出票逻辑严格对比检查结果

## 一、报价逻辑对比

### 1.1 流程 ✅

- **旧版**：`getEndOfferPrice` → `getEndMatchOfferRule` → `getQuanInfo`/会员成本 → `getEndPrice` → `returnResultHandle`；无 wanxiangh5。
- **重构后**：`getEndOfferPrice` → `getEndMatchOfferRule` → `getCostPrice` → `calculateFinalPrice` → `buildSuccessResponse`。

**结论**：主流程一致，返回结构通过 `buildErrorResponse` / `buildSuccessResponse` 与旧版 `returnResultHandle` 对齐。

### 1.2 getEndMatchOfferRule / getMinAmountOfferRule ✅

- **旧版**：`offerRuleMatch` → `getMovieInfo(order, filmTypeFlag, matchRuleList)` → 电影格式过滤 → `getMinAmountOfferRule`；失败时 `return`。
- **重构后**：同流程；失败时 `return null`。`getMovieInfo` 三参数签名一致。

**结论**：会员日优先、`memberDay` / `offerType === "3"`、`offerType === "1"` / `"2"` 过滤及排序与旧版一致。

### 1.3 getEndPrice / calculateFinalPrice 核心计算 ✅

| 步骤                      | 旧版 h5umeOffer `getEndPrice` (501–589)                                                             | 重构 h5ume/offerManage `calculateFinalPrice` (278–372) |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 利润加价                  | `offerType !== "1"` 且 `!GROUP_LIST.includes(appFlag)` 时 `price += profitAddPrice`                 | 同                                                     |
| 夜间顶价                  | `isOpenisNightMaxPrice == 1` 且 `1 <= hour <= 6` → `price = supplier_max_price`                     | 同                                                     |
| 超限                      | `isOverrunOffer !== "1"` 不报价；否则 **仅 `["mayi"]`** 取整，其它 `roundToHalf`（ONE_STEP 用 0.1） | 同；无 yangcong                                        |
| 手续费/奖励/成本/利润校验 | 同 UME：`shouxufei`、`rewardPrice`、`real_cost_price`、`maxCostPrice`、`TEST_NEW_PLAT_LIST`         | 同                                                     |

**结论**：公式、GROUP_LIST、NO_FEE_PLAT_LIST、TEST_NEW_PLAT_LIST、ONE_STEP_PLAT_LIST 与旧版一致。`calculateFinalPrice` 使用 `let { ... price }` 解构，对 `price` 再赋值无 const 问题。日志为 `"umeh5计算报价相关信息"`，与旧版一致。

### 1.4 成本价与 quanValue 过滤 ✅

- 同 UME：`offerType === "1"` 时 `getQuanInfo`，多种券取 `Math.min(...quan_cost)`；否则 `memberCostPrice`。`getEndPrice` 后按 `maxCostPrice` 过滤 `quanValue`。

**结论**：与旧版一致。

---

## 二、出票逻辑对比

### 2.1 singleTicket 与解锁 ✅

- **旧版**：取登录列表、报价规则、校验 → `!isTestOrder && !item.isAgain` 时 `unlockSeatByPlat()`，失败则 `transferOrder(item)` 并 return → `oneClickBuyTicket`。
- **重构后**：`BaseBuyTicket.singleTicket` 统一流程。

**结论**：解锁时机、转单、`isAgain` 处理一致。

### 2.2 利润计算（用券 / 用卡）✅

**用券**（useQuanOrCard 内）：

- 旧版与重构后：`shouxufei = (supplier_end_price * 100) / 10000`，`NO_FEE_PLAT_LIST` 置 0；`profit = (supplier_end_price - quan_cost - shouxufei) * ticket_num`；`rewards > 0` 时 `rewardPrice = (...* 100 * ticket_num * rewards) / 10000`，`profit += rewardPrice`；`!isTestOrder && profit < 0` 且非 `TEST_NEW_PLAT` 时落日志并可能转用卡。**H5UME**：券费卡过滤 `item.balance >= quan_fee * 100 * ticket_num`；取 `cardNumber`，按 `balance` 排序取最大。

**用卡**（useCardHandle）：

- 旧版与重构后：`cardData = cardList.filter(item => item.balance >= member_total_price)`；`profit = (supplier_end_price - member_price - shouxufei) * ticket_num`；奖励同式；`!isTestOrder && profit < 0` 且非 `TEST_NEW_PLAT` 时 `errorSave` 并 return `{ profit: 0, card_id: "" }`；返回 `cardData[0].cardNumber`。

**结论**：公式、`balance` / `cardNumber`、`quan_fee` 卡过滤、`setIsTestOrder` / `this.isTestOrder` 与旧版一致。

### 2.3 支付前校验与会员价调整 ✅

- **用券**：`quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000`；`offer_type == "1"` 且 `useQuan?.length` 且 `payAmount > quan_fee_total` 时转单。**H5UME** 使用 `payAmount`（与 `quan_fee_total` 单位一致）。
- **用卡**：`real_member_total_price = (real_member_price * 1000 * ticket_num) / 1000`；`offer_type !== "1"` 且 `card_id` 时：
  - `payAmount > real_member_total_price`：若 `subDecimal(payAmount, real_member_total_price) < profit` 则 `profit -=` 差值并落日志；否则转单（最后一次）或换号。
  - `payAmount < real_member_total_price`：`profit += (real_member_total_price - payAmount) * member_discount / 100`，再 `toFixed(2)`。

**结论**：`payAmount` 来源（含用券时 `payAmount = (+quan_fee * 1000 * ticket_num) / 10` 等）、`quan_fee_total`、`real_member_total_price`、两分支及 `member_discount`、换号时 `otherParams` 与旧版一致。

### 2.4 转单与取消 / 释放座位 ✅ 已修复

- **旧版**：`transferOrder(order, unlockSeatInfo)`。若 `unlockSeatInfo`：`!orderId` → `releaseSeat({ cinemaLinkId, lockOrderId, session_id })`；`orderId` → `cancelOrder({ cinemaLinkId, orderId, session_id })`；`session_id` 取自 `currentParamsList[currentParamsInx]`。
- **重构后**：`orderManage.transferOrder(unlockSeatInfo)`，同样 `!orderId` 时 `releaseSeat`、`orderId` 时 `cancelOrder`。

**问题**：换号时，`buyTicket` 先 `cancelOrder` / `releaseSeat`（传上一账号 `session_id`）；若失败再 `transferOrder(unlockSeatInfo)`，`unlockSeatInfo` 含上一账号 `session_id`。原 `orderManage.transferOrder` 仅用 `getCurrentParams()...session_id`，未用 `unlockSeatInfo.session_id`，换号失败后再次取消/释放会用错 session。

**修复**：`transferOrder` 内 **优先使用 `unlockSeatInfo.session_id`**（若存在），否则再用 `getCurrentParams()...session_id`。已落实于 [orderManage.js](orderManage.js)。

**结论**：取消/释放参数、`lockOrderId` / `orderId` 传参与旧版一致；`session_id` 逻辑已修复。

### 2.5 转单调用处与参数 ✅

- **旧版**：锁座失败等传 `{ cinemaLinkId, lockOrderId }`；支付/用卡转单等传 `{ cinemaLinkId, orderId }`。创建订单失败时仅 `lockOrderId` 无 `orderId`，走 `releaseSeat`。
- **重构后**：`transferOrder(null)`、`transferOrder({ cinemaLinkId, lockOrderId })`、`transferOrder({ cinemaLinkId, orderId })` 等与旧版对应场景一致。

**结论**：与旧版一致。

### 2.6 灵活用券、异步绑券 ✅

- **autoUseQuan**：`offer_type !== "1"` 时，`autoUseQuanStatus === "1"` 且 `supplier_end_price > autoUseQuanPrice` 且 `auto_quan_value` 存在则 `is_auto_use_quan = true`，`offerRule.quan_value = auto_quan_value`；不足或负利润时退用卡。与旧版一致。
- **异步绑券**：`offerRule.is_store == "1"` 且 `quanStock - ticket_num < 10` 时 `getNewQuan`。与旧版一致。

**结论**：与旧版一致。

### 2.7 测试模式 ⚠️

- **旧版**：`isTestOrder` 时 `oneClickBuyTicket` 内直接 `return { offerRule }`，不购买、不取消。
- **重构后**：执行到锁座/创建订单/价格计算后，打印购买参数；若有 `orderId` 则 `cancelOrder`，若仅 `lockOrderId` 则 `releaseSeat`，再 `return { offerRule }`。

**结论**：行为不同；与 SFC、UME、LMA 对齐，属重构后的改进行为。若需与旧版严格一致，可去掉测试模式下的取消/释放逻辑。**当前**：保持重构后行为。

### 2.8 其它 ✅

- **updateCardDayUse**：用卡成功后 `svApi.updateDayUsage`，参数与 `cardInstanceId` 等与旧版一致。
- **购买失败与超时**：失败转单；`timeout` / `"Request failed"` / `"已下单成功"` 等当成功处理的判断与旧版一致。

**结论**：与旧版一致。

---

## 三、总结

### 3.1 已修复 ✅

1. **transferOrder 的 session_id**：原仅用 `getCurrentParams()...session_id`，换号失败后再次取消/释放会用错 session。已改为优先 `unlockSeatInfo.session_id`，否则再用当前账号 session。

### 3.2 已知差异（保持现状）⚠️

1. **测试模式**：旧版不取消/不释放，重构后打印参数并 `cancelOrder` / `releaseSeat`。保持重构后行为，与 SFC、UME、LMA 一致。

### 3.3 完全一致的逻辑 ✅

1. 报价流程、getEndMatchOfferRule、getMinAmountOfferRule、成本价与 `quanValue` 过滤
2. getEndPrice / calculateFinalPrice 公式（利润加价、夜间顶价、超限仅 mayi、手续费、奖励、利润校验）
3. 利润计算（用券、用卡）、`balance` / `cardNumber`、`quan_fee` 卡过滤、`isTestOrder`
4. 支付校验、`quan_fee_total`、`real_member_total_price`、会员价两分支、换号 `otherParams`
5. 转单调用处与参数（`lockOrderId` / `orderId`）；释放座位与取消订单两条路径
6. 灵活用券、异步绑券、updateCardDayUse、购买失败与超时处理

---

## 四、建议修复（可选）

### 修复：测试模式与旧版对齐（可选）

**文件**：`src/common/autoTicket/buyTicket/h5ume/buyTicket.js`  
**位置**：约 848–924 行

若需与旧版严格一致，可移除测试模式下的打印购买参数及 `cancelOrder` / `releaseSeat` 逻辑，改为直接 `return { offerRule }`。  
**优先级**：低；当前改进行为更利于测试不占座。

---

**检查完成时间**：2026-01-26  
**检查范围**：报价逻辑、出票逻辑、利润计算、卡券使用、转单与取消/释放、测试模式及其它  
**总体结论**：重构后逻辑与旧版一致，已修复 1 处（`transferOrder` 的 `session_id` 优先 `unlockSeatInfo`）。测试模式为刻意改进行为，建议保持。核心功能完全对齐。
