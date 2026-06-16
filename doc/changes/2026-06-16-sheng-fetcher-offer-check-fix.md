# 修复省平台换座报价检查导致新订单被过滤

## 修改文件

- `src/common/platform/fetchers/ShengOrderFetcher.js`

## Bug 分析

省平台启用 `supportChangeSeat` 后，在订单获取流程中多了一个**报价记录检查**：

```
无出票记录 → isNewOrder = true
  → 检查报价记录是否存在
    → 有报价记录 → isNewOrder = false ❌（新订单被过滤）
```

**触发场景**：页面刷新后，新订单已有报价记录（来自之前会话的 Offer Queue 处理结果），但出票记录尚未生成。此时报价检查将其标记为"非新订单"，`finalOrders` 为空，新订单消息永远不会发送。

**对比猎人平台**：猎人平台同样的 `supportChangeSeat` 场景下，无出票记录时直接 `isNewOrder = true`，不做报价检查。

## 修复内容

移除无出票记录时的报价记录检查 (`targetOffer`)，改为仅检查 `orderRecord`（本会话内是否已发送过）：

```
无出票记录 → isNewOrder = true
  → 检查是否在 orderRecord 中（本会话已发送过）
    → 已发送过 → isNewOrder = false（防重复）
    → 未发送过 → isNewOrder = true ✔（正常派发）
```

保留了 `orderRecord` 检查作为第二层防重复机制（与 `filterNewOrders` 配合），`offerList` 变量仍保留用于数据转换阶段的 `cinema_group` 查找（第 62 行）。

## 测试结果

- TypeScript 类型检查通过
- 无 ESLint 错误

## 回归风险评估

- **低风险**。与猎人平台行为对齐，移除报价检查不会导致重复派发，因为：
  - `filterNewOrders` 防同会话重复
  - `orderRecord` 检查二次防重
  - 出票队列 `window.__ticketGlobalHandledOrders` 最终去重
  - 换座成功重新出票逻辑不受影响（`order_status == 9` 分支未改动）
