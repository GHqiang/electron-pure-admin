# LMA重构后报价出票逻辑严格对比检查结果

## 一、报价逻辑对比

### 1.1 动态调价处理 ✅

- **旧版**：`lmaOffer.js` 第574行 `price = price - Number(outCount);` - **存在bug，应使用 `outPrice`**
- **重构后**：`lma/offerManage.js` 第278行 `basePrice - Number(outPrice);` - **已修复bug**

**结论**：重构后已正确修复动态调价bug，使用 `outPrice` 而不是 `outCount`。

### 1.2 利润加价处理 ✅

- **旧版**：`lmaOffer.js` 的 `getEndPrice` 中**没有利润加价逻辑**（LMA不使用）
- **重构后**：`lma/offerManage.js` 的 `applyProfitAddition` 直接返回 `price`（注释说明LMA不使用）

**结论**：逻辑一致，LMA不使用利润加价。

### 1.3 夜间顶价处理 ✅

- **旧版**：`localStorage.getItem("isOpenisNightMaxPrice") == 1` 且 `currentHour >= 1 && currentHour <= 6` 时 `price = Number(supplier_max_price)`
- **重构后**：`applyNightMaxPrice` 中逻辑一致

**结论**：逻辑一致。

### 1.4 超限检查处理 ✅

- **旧版**：`price > Number(supplier_max_price)` 时检查 `isOverrunOffer !== "1"`，否则调整至限价
- **重构后**：`handleOverrunCheck` → `adjustToMaxPrice`，逻辑一致

**结论**：逻辑一致。

### 1.5 手续费、奖励、利润校验 ✅

- **旧版**：
  - `shouxufei = (price * 100) / 10000`，`NO_FEE_PLAT_LIST` 置0
  - `rewardPrice = (price * 100 * rewards) / 10000`
  - `maxCostPrice = (price*1000 + reward*1000 - shouxufei*1000)/1000`
  - `real_cost_price = (pay_cost_price - rewardPrice).toFixed(2)`，其中 `pay_cost_price = cardQuanCost + shouxufei`
  - `price <= real_cost_price` 且非 `TEST_NEW_PLAT` 则未通过
- **重构后**：`calculateCostProfit` 中公式一致
  - `real_cost_price = (cost_price + shouxufei - rewardPrice).toFixed(2)` - 直接计算，逻辑等价

**结论**：公式完全一致，重构后代码更简洁。

## 二、出票逻辑对比

### 2.1 利润计算 ✅

**用券利润计算**：
- **旧版**：`lmaAutoTicket.js` 950-967行
  ```javascript
  if (offerRule.offer_type !== "1") {
    profit = supplier_end_price - offerRule?.member_price - shouxufei;
    profit = Number(profit) * Number(ticket_num);
  } else {
    profit = Number(supplier_end_price) - offerRule.quan_cost - shouxufei;
    profit = (profit * 100 * ticket_num) / 100;
  }
  if (rewards > 0) {
    rewardPrice = (Number(supplier_end_price) * Number(ticket_num) * 100 * rewards) / 10000;
    profit += rewardPrice;
  }
  profit = profit.toFixed(2);
  ```
- **重构后**：`lma/buyTicket.js` 717-732行，公式完全一致

**结论**：利润计算公式完全一致。

### 2.2 支付金额校验 ✅

- **旧版**：`lmaAutoTicket.js` 933行，校验 `paymentAmount > quan_fee_total`
- **重构后**：`lma/buyTicket.js` 696行，校验逻辑一致

**结论**：逻辑一致。

### 2.3 会员价利润调整 ✅

- **旧版**：`lmaAutoTicket.js` 969-1019行
  ```javascript
  if (paymentAmount > real_member_price) {
    // 发送消息通知
    if (subDecimal(paymentAmount, real_member_price) < profit) {
      profit = subDecimal(profit, subDecimal(paymentAmount, real_member_price));
    } else {
      // 走转单
    }
  } else if (paymentAmount < real_member_price) {
    // 注释掉的代码：不调整利润
  }
  ```
- **重构后**：`lma/buyTicket.js` 734-779行
  ```javascript
  if (paymentAmount > real_member_price) {
    // 发送消息通知
    if (subDecimal(paymentAmount, real_member_price) < profit) {
      profit = subDecimal(profit, subDecimal(paymentAmount, real_member_price));
    } else {
      // 走转单
    }
  }
  // 注意：重构后没有 else if (paymentAmount < real_member_price) 分支
  ```

**结论**：逻辑一致。旧版的 `paymentAmount < real_member_price` 分支是注释掉的，重构后直接没有，这是正确的。

## 三、卡券使用逻辑对比

### 3.1 用券流程

#### lmaIsUseQuan逻辑 ✅
- **旧版**：`lmaAutoTicket.js` 1331-1336行
  ```javascript
  let lmaIsUseQuanValue = window.localStorage.getItem("lmaIsUseQuan");
  let lmaIsUseQuan = lmaIsUseQuanValue == 1 && real_member_price >= 33;
  if (!lmaIsUseQuan) return;
  quan_value = "lma-5";
  ```
- **重构后**：`lma/cardQuanManage.js` 395-400行，逻辑完全一致

**结论**：逻辑一致。

#### 异步绑券触发条件 ✅
- **旧版**：`lmaAutoTicket.js` 1456行，`targetQuanList?.length - ticket_num < 10 && is_store == "1"`
- **重构后**：`lma/cardQuanManage.js` 516行，条件完全一致

**结论**：逻辑一致。

#### 用券检查顺序差异 ⚠️

- **旧版**：`lmaAutoTicket.js` 1449-1469行
  1. 先检查 `targetQuanList?.length < ticket_num`，如果不足直接返回错误
  2. 然后检查异步绑券条件
  3. 最后 `targetQuanList.slice(0, ticket_num)`
  
- **重构后**：`lma/cardQuanManage.js` 516-539行
  1. 先检查异步绑券条件
  2. 然后检查 `targetQuanList?.length < ticket_num`，如果不足直接返回错误
  3. 最后 `targetQuanList.slice(0, ticket_num)`

**差异分析**：
- 如果券数量刚好等于 `ticket_num`，旧版会先检查不足（不满足），然后检查异步绑券（满足条件会触发异步绑券），最后返回券
- 重构后会先检查异步绑券（满足条件会触发异步绑券），然后检查不足（不满足），最后返回券
- **实际影响**：如果 `targetQuanList.length === ticket_num` 且 `is_store == "1"`，旧版和重构后都会触发异步绑券，但顺序不同。这个差异**不影响最终结果**，因为异步绑券是异步操作，不影响当前出票流程。

**结论**：顺序差异不影响最终结果，但为了完全对齐，建议调整顺序与旧版一致。

### 3.2 用卡流程 ✅

#### member_total_price计算
- **旧版**：`lmaAutoTicket.js` 1203-1206行
  ```javascript
  let member_total_price = (real_member_price * 100 * ticket_num) / 100;
  if (quan_fee && offerRule.offer_type === "1") {
    member_total_price = (quan_fee || 0) * ticket_num;
  }
  ```
- **重构后**：`lma/cardQuanManage.js` 127-130行，逻辑完全一致

**结论**：逻辑一致。

#### 活跃卡优先逻辑 ✅
- 旧版和重构后的逻辑一致，都是优先使用活跃卡，余额不足时换卡。

## 四、错误处理对比

### 4.1 测试模式处理 ⚠️

- **旧版**：`lmaAutoTicket.js` 1024-1026行
  ```javascript
  if (isTestOrder) {
    return { offerRule };
  }
  ```
  - 不购买，不取消订单，不释放座位

- **重构后**：`lma/buyTicket.js` 785-837行
  ```javascript
  if (this.isTestOrder) {
    // 打印购买参数
    console.log("========== 测试模式：购买参数 ==========");
    // 取消订单释放座位
    if (order_str) {
      await this.appApi.cannelOneOrder(cancelParams);
    }
    return { offerRule };
  }
  ```
  - 打印购买参数，**取消订单释放座位**

**差异分析**：
- 旧版测试模式不取消订单，可能导致座位被占用
- 重构后测试模式会取消订单释放座位，这是**改进**，但行为与旧版不一致

**建议**：根据业务需求决定是否对齐。如果希望测试模式不占用座位，重构后的行为更合理。

### 4.2 转单逻辑 ✅

- **旧版**：`lmaAutoTicket.js` 272-310行
  - 使用 `cancelOrder` 函数取消订单
  - `cancelOrder` 内部调用 `APP_API_OBJ[appFlag].cannelOneOrder`
  - 获取转单原因，检查自动转单开关，调用平台转单

- **重构后**：`lma/orderManage.js` 143-194行
  - 直接调用 `this.appApi.cannelOneOrder` 取消订单
  - 获取转单原因，检查自动转单开关，调用平台转单

**结论**：逻辑一致。重构后直接调用API，代码更简洁。

### 4.3 换号逻辑 ✅

- 旧版和重构后的换号逻辑一致，都是通过 `currentParamsInx` 递增来切换账号。

## 五、特殊场景验证

### 5.1 NO_FEE_PLAT_LIST处理 ✅

- 旧版和重构后都在手续费计算时检查 `NO_FEE_PLAT_LIST`，逻辑一致。

### 5.2 TEST_NEW_PLAT_LIST处理 ✅

- 旧版和重构后都在利润校验时检查 `TEST_NEW_PLAT_LIST`，允许负利润，逻辑一致。

### 5.3 LMA特殊逻辑 ✅

- **lmaIsUseQuan**：旧版和重构后逻辑一致
- **锁座前用卡用券**：旧版和重构后都在锁座前使用卡券，逻辑一致

## 六、总结

### 6.1 已修复的Bug ✅

1. **动态调价bug修复**：旧版使用 `outCount`，重构后使用 `outPrice` - 这是正确的修复

### 6.2 需要确认的差异 ⚠️

1. **用券检查顺序**：✅ **已修复** - 已调整顺序与旧版一致（先检查不足，然后检查异步绑券）

2. **测试模式行为**：旧版不取消订单，重构后取消订单释放座位。**建议**：根据业务需求决定是否对齐。如果希望测试模式不占用座位，重构后的行为更合理。**当前状态**：保持重构后的行为（更合理）

### 6.3 完全一致的逻辑 ✅

1. 报价逻辑（除动态调价bug修复外）
2. 利润计算公式
3. 支付金额校验
4. 会员价利润调整
5. 用券流程（lmaIsUseQuan、异步绑券触发条件）
6. 用卡流程（member_total_price计算、活跃卡优先）
7. 转单逻辑
8. 换号逻辑
9. 特殊平台处理（NO_FEE_PLAT_LIST、TEST_NEW_PLAT_LIST）

## 七、建议修复

### 修复1：调整用券检查顺序 ✅ 已修复

**文件**：`src/common/autoTicket/buyTicket/lma/cardQuanManage.js`

**位置**：516-537行

**修改**：已将异步绑券检查移到不足检查之后，与旧版顺序一致。

**状态**：✅ 已修复

### 修复2：测试模式行为对齐（可选）

**文件**：`src/common/autoTicket/buyTicket/lma/buyTicket.js`

**位置**：785-837行

**修改**：如果希望与旧版对齐，可以移除测试模式下的取消订单逻辑。

**优先级**：低（重构后的行为更合理）

---

**检查完成时间**：2026-01-26
**检查范围**：报价逻辑、出票逻辑、利润计算、卡券使用、错误处理、特殊场景
**总体结论**：重构后逻辑与旧版基本一致，已修复1个顺序差异（用券检查顺序），剩余1个行为差异（测试模式）为改进行为，建议保持。核心功能完全一致。
