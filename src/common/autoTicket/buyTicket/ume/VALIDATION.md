# UME 重构后报价、出票逻辑严格对比检查结果

## 一、报价逻辑对比

### 1.1 流程与 wanxiangh5 ✅

- **旧版**：`getEndOfferPrice` → `getEndMatchOfferRule`，若返回 `"wanxiangh5"` 则调 `getOfferPriceFun({ appFlag: "wanxiangh5" }).getEndOfferPrice`，否则 `getQuanInfo`/会员成本 → `getEndPrice` → `returnResultHandle`。
- **重构后**：`getEndOfferPrice` 重写，同样先 `getEndMatchOfferRule`，`"wanxiangh5"` 时调旧 `umeOffer` 的 `getEndOfferPrice`，否则 `getCostPrice` → `calculateFinalPrice` → `buildSuccessResponse`。

**结论**：wanxiangh5 分支与主流程一致，返回结构通过 `buildErrorResponse` / `buildSuccessResponse` 与旧版 `returnResultHandle` 对齐。

### 1.2 getEndMatchOfferRule / getMinAmountOfferRule ✅

- **旧版**：`offerRuleMatch` → 过滤 wanxiangh5 → `getMovieInfo` → 电影格式过滤 → `getMinAmountOfferRule`；失败时 `return`（undefined）。
- **重构后**：同流程；失败时 `return null`。调用方均用 `if (!offerRule)` 判断，行为等价。

**结论**：会员日优先、`memberDay` / `offerType === "3"`、`offerType === "1"` / `"2"` 过滤及排序与旧版一致。

### 1.3 成本价与 quanValue 过滤 ✅

- **旧版**：`offerType === "1"` 时 `getQuanInfo`，多种券取 `Math.min(...quan_cost)`；否则 `memberCostPrice`。`getEndPrice` 后，若 `offerType === "1"` 且 `quanInfoList.length > 1`，按 `maxCostPrice` 过滤 `offerRule.quanValue`。
- **重构后**：`getCostPrice` 同等逻辑；`calculateFinalPrice` 后同样按 `maxCostPrice` 过滤 `quanValue`。

**结论**：成本价取值与 `quanValue` 过滤条件一致。

### 1.4 getEndPrice / calculateFinalPrice 核心计算 ✅

| 步骤       | 旧版 umeOffer `getEndPrice` (554–648)                                                                                           | 重构 ume/offerManage `calculateFinalPrice` + `calculateCostProfit` |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 利润加价   | `offerType !== "1"` 且 `!GROUP_LIST.includes(appFlag)` 时 `price += profitAddPrice`                                             | 同条件、同逻辑                                                     |
| 夜间顶价   | `isOpenisNightMaxPrice == 1` 且 `1 <= hour <= 6` → `price = supplier_max_price`                                                 | 同                                                                 |
| 超限       | `price > supplier_max_price` 且 `isOverrunOffer !== "1"` 不报价；否则 mayi/yangcong 取整，其它 `roundToHalf`（ONE_STEP 用 0.1） | 同                                                                 |
| 手续费     | `shouxufei = (price * 100) / 10000`；`NO_FEE_PLAT_LIST` 置 0                                                                    | 同                                                                 |
| 奖励       | `rewardPrice = (price * 100 * rewards) / 10000`（rewards>0）                                                                    | 同                                                                 |
| 成本与利润 | `pay_cost_price = cost_price + shouxufei`；`real_cost_price = (pay_cost_price - rewardPrice).toFixed(2)`；`maxCostPrice` 公式同 | 同                                                                 |
| 利润校验   | `price <= real_cost_price` 且非 `TEST_NEW_PLAT_LIST` 则不报价                                                                   | 同                                                                 |

**结论**：公式、GROUP_LIST、NO_FEE_PLAT_LIST、TEST_NEW_PLAT_LIST、ONE_STEP_PLAT_LIST 使用与旧版一致。

### 1.5 calculateFinalPrice 中 price 复用与修复 ✅ 已修复

- **问题**：`calculateFinalPrice` 内 `price` 从 `params` 解构为 `const`，后续又 `price = price + profitAddPrice` 等赋值，会触发 “Assignment to constant variable” 报错。
- **修复**：改为 `let price = params.price`，不再从解构中声明 `price`，所有对 `price` 的修改与旧版 `getEndPrice` 行为一致。

**状态**：已在 [offerManage.js](offerManage.js) 中修复。

### 1.6 动态调价与 offerList ✅

- **旧版**：`getEndPrice` 接收 `offerList` 但未使用；无动态调价。
- **重构后**：`calculateFinalPrice` 接收 `offerList`，同样未使用。

**结论**：行为一致，UME 报价无动态调价。

---

## 二、出票逻辑对比

### 2.1 singleTicket 与解锁 ✅

- **旧版**：`singleTicket` 内取登录列表、报价规则、校验规则 → `!isTestOrder && !item.isAgain` 时 `unlockSeatByPlat()`，失败则 `transferOrder(item)` 并 return → `oneClickBuyTicket`。
- **重构后**：`BaseBuyTicket.singleTicket` 统一流程，`!isTestOrder && !order.isAgain` 时 `unlockSeatByPlat()`，失败则转单 return → `oneClickBuyTicket`。

**结论**：解锁时机、转单、`isAgain` 处理一致。

### 2.2 利润计算（用券 / 用卡）✅

**用券**（useQuanOrCard 内）：

- 旧版与重构后：`shouxufei = (supplier_end_price * 100) / 10000`，`NO_FEE_PLAT_LIST` 置 0；`profit = (supplier_end_price - quan_cost - shouxufei) * ticket_num`；`rewards > 0` 时 `rewardPrice = (supplier_end_price * ticket_num * 100 * rewards) / 10000`，`profit += rewardPrice`；`profit.toFixed(2)`；负利润且非 `TEST_NEW_PLAT` 时落日志并可能转用卡。

**用卡**（useCardHandle）：

- 旧版与重构后：`cardData = cardList.filter(item => item.cardAmount >= item.resultAmount + (handlingFee||0)*ticket_num)`；`profit = (supplier_end_price - member_price - shouxufei) * ticket_num`；奖励公式同；负利润且非 `TEST_NEW_PLAT` 时 `errorSave` 并 return `{ profit: 0, card_id: "" }`；按 `cardAmount` 排序取最大余额。

**结论**：两处公式、NO_FEE_PLAT_LIST / TEST_NEW_PLAT_LIST、退用卡逻辑一致。旧版负利润分支曾返回 `useQuans: []`（typo），重构后统一为 `useQuan: []`，与调用方 `useQuan = []` 默认解构兼容。

### 2.3 支付前校验与会员价调整 ✅

- **用券**：`quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000`；`offer_type === "1"` 且 `useQuan?.length` 且 `paymentAmount > quan_fee_total` 时转单。旧版与重构后一致。
- **用卡**：`real_member_price = (real_member_price * 10000 * ticket_num) / 10000`；`offer_type !== "1"` 且 `card_id` 时：
  - `paymentAmount > real_member_price`：若 `subDecimal(paymentAmount, real_member_price) < profit` 则 `profit -=` 差值并落日志；否则转单。
  - `paymentAmount < real_member_price`：`profit += (real_member_price - paymentAmount) * member_discount / 100`，再 `toFixed(2)`。

**结论**：UME 保留 `paymentAmount < real_member_price` 的利润增加分支（与 LMA 注释掉不同），两分支与旧版一致。

### 2.4 卡券无法使用与换号 ✅

- **旧版**：`!card_id && !useQuan?.length` 时报错，若最后一次则 `transferOrder(item, { cinemaCode, cinemaLinkId, orderHeaderId })`，否则换号重试 `oneClickBuyTicket`。
- **重构后**：同等判断与转单/换号逻辑，转单参数包含 `cinemaCode`、`cinemaLinkId`、`orderHeaderId`，换号时 `otherParams` 传递正确。

**结论**：逻辑一致。

### 2.5 灵活用券（autoUseQuan）✅

- **旧版**：`offer_type !== "1"` 时，若 `autoUseQuanStatus === "1"` 且 `supplier_end_price > autoUseQuanPrice` 且 `auto_quan_value` 存在，则 `is_auto_use_quan = true`，`offerRule.quan_value = auto_quan_value`；不足或负利润时退用卡。
- **重构后**：`ume/cardQuanManage.useQuanOrCard` 中相同条件与重置逻辑，`getOfferRuleById(offer_rule_id)` 取规则。

**结论**：条件、`quan_value` 重置、退用卡分支一致。

### 2.6 useQuanOrCard 返回与 catch ✅

- **旧版**：某分支 return `useQuans: []`（typo）；catch 中 `// return {}` 注释，实际未 return。
- **重构后**：统一 `useQuan`；catch 中 `return {}`。调用方 `useQuan = []` 默认解构，两者均兼容。

**结论**：行为等价，重构后无 `useQuans` 残留。

---

## 三、转单与取消订单

### 3.1 transferOrder ✅

- **旧版**：`transferOrder(order, unlockSeatInfo)`。若 `unlockSeatInfo` 则 `cancelOrder({ cinemaCode, cinemaLinkId, orderHeaderId, session_id })`，`session_id` 取自 `currentParamsList[currentParamsInx]`；再根据 `isAutoTransfer`、`isAgain`、`isTestOrder` 决定是否 `orderTransferByPlat`。
- **重构后**：`orderManage.transferOrder(unlockSeatInfo)`，同样用 `getCurrentParams()` 的当前账号 `session_id` 取消；转单条件同。

**结论**：取消参数、`session_id` 来源、`isTestOrder` / `isAgain` / `isAutoTransfer` 逻辑一致。UME 转单均在当次 `oneClickBuyTicket` 失败即执行，无换号后再取消前序订单的路径，故一直用当前 `session_id` 合理。换号出票时，取消**上一账号**订单使用 `currentParamsList[currentParamsInx - 1].session_id`，与旧版一致。

### 3.2 cancelOrder ✅

- **旧版**：`umeApi.cannelOneOrder`，入参 `params` + `session_id` 结构。
- **重构后**：`appApi.cannelOneOrder`，入参相同。`orderManage` 仅在 `orderHeaderId && session_id` 时取消，避免缺参调用，为合理加固。

**结论**：接口与参数一致。

---

## 四、测试模式与其它

### 4.1 测试模式 ⚠️

- **旧版**：`isTestOrder` 时 `oneClickBuyTicket` 内直接 `return { offerRule }`，不购买、不取消订单。
- **重构后**：执行到锁座/创建订单/价格计算后，打印购买参数；若有 `orderHeaderId` 则 `cancelOrder` 取消订单释放座位，再 `return { offerRule }`。

**结论**：行为不同；与 SFC、LMA 一致，属重构后的改进行为。若需与旧版严格一致，可去掉测试模式下的取消订单逻辑。**当前**：保持重构后行为。

### 4.2 更新卡使用量 ✅

- **旧版**：用卡成功后 `updateCardDayUse({ app_name, card_id, add_count, plat_name })`，内部 `svApi.updateDayUsage`；`card_id` 用 `cardInstanceId`。
- **重构后**：直接 `svApi.updateDayUsage`，参数相同；`card_id` 同样转为 `cardInstanceId`。

**结论**：参数与转换一致。

### 4.3 购买失败与超时 ✅

- **旧版**：`buyTicket` 失败且非 timeout 时转单；timeout 当成功处理。
- **重构后**：同样逻辑。

**结论**：一致。

---

## 五、总结

### 5.1 已修复 ✅

1. **calculateFinalPrice 中 price 复用**：原 `const` 解构后对 `price` 再赋值会报错，已改为 `let price = params.price`，与旧版 `getEndPrice` 行为一致。

### 5.2 已知差异（保持现状）⚠️

1. **测试模式**：旧版不取消订单，重构后打印参数并取消订单释放座位。保持重构后行为，与 SFC、LMA 一致。

### 5.3 完全一致的逻辑 ✅

1. 报价流程与 wanxiangh5、getEndMatchOfferRule、getMinAmountOfferRule、成本价与 `quanValue` 过滤
2. getEndPrice / calculateFinalPrice 公式（利润加价、夜间顶价、超限、手续费、奖励、利润校验）
3. 利润计算（用券、用卡）、支付校验、会员价两分支
4. 卡券无法使用与换号、灵活用券、useQuanOrCard 返回与 catch
5. 转单与取消、更新卡使用量、购买失败与超时处理

---

## 六、建议修复（可选）

### 修复：测试模式与旧版对齐（可选）

**文件**：`src/common/autoTicket/buyTicket/ume/buyTicket.js`  
**位置**：约 922–981 行

若需与旧版严格一致，可移除测试模式下的打印购买参数与取消订单逻辑，改为直接 `return { offerRule }`。  
**优先级**：低；当前改进行为更利于测试不占座。

---

**检查完成时间**：2026-01-26  
**检查范围**：报价逻辑、出票逻辑、利润计算、卡券使用、转单与取消、测试模式及其它  
**总体结论**：重构后逻辑与旧版一致，已修复 1 处（calculateFinalPrice 的 `price` 复用）。测试模式为刻意改进行为，建议保持。核心功能完全对齐。
