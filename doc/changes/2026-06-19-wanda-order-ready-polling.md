# 万达出票：锁座后增加 order_status 轮询 + confirm_order 绑定手机

## 修改文件

| 文件                                                   | 操作                                         |
| ------------------------------------------------------ | -------------------------------------------- |
| `src/common/autoTicket/buyTicket/wanda/orderManage.js` | 新增 `waitForOrderReady()` 方法              |
| `src/common/autoTicket/buyTicket/wanda/buyTicket.js`   | 在 `priceCalculation` 前插入订单就绪等待调用 |

## 核心变更说明

### 问题

锁座（`create_order.api`）成功后，根据返回的 `orderId` 调用 `query_by_userid.api` 查不到订单。

### 根因

对比万达小程序源码，发现当前代码跳过了两个关键步骤：

1. **`order_status.api` 轮询**：小程序在 `create_order.api` 后以 **500ms 间隔轮询 `order_status.api`**，等待 `orderStatus` 从 `10（处理中）` 变为其他值（如 `40=待付款`），之后订单才可查询。当前代码直接跳到 `query_by_userid.api`，订单尚未就绪。

2. **`confirm_order.api` 手机绑定**：小程序在订单就绪后视情况调用 `confirm_order.api` 将订单绑定到目标手机号。当前代码缺少此步骤。

### 修复

**`orderManage.js`** — 新增 `waitForOrderReady()` 方法：

- 轮询 `order_status.api` 最多 30 次（间隔 0.5s，共 15s，小程序 12s 超时）
- 订单就绪后调用 `confirm_order.api` 绑定手机号
- 返回 `boolean` 表示订单是否就绪

**`buyTicket.js`** — 在 `if (!order_num)` 检查之后、`priceCalculation` 之前插入：

```javascript
const orderReady = await this.orderManage.waitForOrderReady({
  orderId: order_num,
  session_id: this.currentSessionId,
  mobilePhone: this.currentPhone
});
if (!orderReady) {
  // 转单或换号处理
}
```

### 使用的 API

- `queryOrderStatus`（`order_status.api`）— 已有定义但之前未调用
- `confirmOrder`（`confirm_order.api`）— 已有定义但之前未调用

## 测试结果

- 语法检查通过（无 ESLint 错误）
- 不影响已有测试 `src/common/tests/retry-helper.test.js`

## 回归风险

| 风险                            | 等级 | 说明                                                           |
| ------------------------------- | ---- | -------------------------------------------------------------- |
| `order_status.api` 响应格式变化 | 低   | 仅读取 `res.data.orderStatus`，失败时返回 `false` 走原转单流程 |
| `confirm_order.api` 异常        | 低   | 异常被 catch 记录日志，不影响主流程（`return true` 仍返回）    |
| 轮询超时（15s）                 | 中   | 如万达后端处理超长，会转单而非无限等待                         |
