# 修复 Promise.race 超时导致报价成功被误记录为失败

## 日期

2026-07-14

## 问题描述

`BaseOfferQueue.orderHandle()` 中 `Promise.race` 超时用 `resolve()` 结算，导致：

1. 30s 超时触发 → `resolve()` → `offerResult = undefined` → 写入失败记录
2. 但此时 `submitOffer` 已发出（在超时前通过了 `timeoutFlag` 检查），最终返回"报价成功"
3. 成功结果被丢弃，出票流程查不到报价记录而失败

## 修改文件

- `src/common/core/BaseOfferQueue.js` — `orderHandle()` 超时逻辑 + `singleOffer()` 补写兜底

## 核心变更

### 设计思路

超时后直接结束不再等待（保持原有 `resolve()` 行为），但 `singleOffer` 内部在 `submitOffer` 完成后检查：**如果提交本身成功了，自动补写一条成功报价记录到 `offer_record` 表**。

```
orderHandle:  超时 → resolve() → 写失败记录（保底）
                              ↓
singleOffer:  submitOffer 还在跑...
              ↓
              返回成功 → timeoutFlag 已置位 → 补写成功记录
```

### 改动点

**① `orderHandle` 超时逻辑**（恢复原始简洁版）

```js
// 超时直接 resolve()，不再等待报价结果
// 注释说明：submitOffer 若在超时前发出，singleOffer 内部会自行补写成功记录
offerResult = await Promise.race([
  this.singleOffer({ order, offerList: [], logger, timeoutFlag }),
  new Promise(resolve =>
    setTimeout(() => {
      timeoutFlag.value = true;
      logger.infoSave(`订单报价处理超时，超过${offerHandleTimeout}ms 未完成`);
      resolve();
    }, offerHandleTimeout)
  )
]);
```

**② `singleOffer` 新增超时兜底补写**

```js
const res = await this.platformAdapter.submitOffer(offerParams, {
  logger: log
});
// ...

// 猎人特殊处理：已自动报价视为失败，直接返回（不会走到下方补写）
if (order.plat_name === "lieren" && res?.message === "已自动报价") {
  log.errorSave("猎人已自动报价");
  return { offerRule };
}

// 超时兜底：走到这里说明是真正的提交成功（或 lieren 正常成功）
if (timeoutFlag?.value && res) {
  log.infoSave("提交报价在超时后完成，补写成功报价记录");
  await this.addOrderHandleRecord(order, { res, offerRule }, logger, {
    offer_from: 2
  });
}

return { res, offerRule };
```

## 各场景行为

| 场景                           | orderHandle 记录 |   singleOffer 补写   | 最终结果                             |
| ------------------------------ | :--------------: | :------------------: | ------------------------------------ |
| 正常完成（未超时）             |       成功       |        不触发        | ✅ 一条成功记录                      |
| 超时，submitOffer 未调用       |       失败       |   不触发（无 res）   | 失败（正确）                         |
| 超时，submitOffer 已发出且成功 |       失败       |     **补写成功**     | ✅ 失败+成功各一条，出票查到成功记录 |
| 超时，submitOffer 已发出但失败 |       失败       |  不触发（res 为空）  | 失败（正确）                         |
| 超时，lieren"已自动报价"       |       失败       | 不触发（提前return） | 失败（正确，已自动报价不算成功）     |

> **关键设计**：lieren "已自动报价" 的检查位于补写逻辑**之前**，命中后直接 `return { offerRule }`（无 `res`），自然跳过补写。其余平台（包括 lieren 正常成功）均走补写逻辑。

## 回归风险

- **低风险**：仅在 `singleOffer` 中新增一个条件分支，不改变正常流程
- `addOrderHandleRecord` 自身有 try/catch 保护，补写失败不会影响 `singleOffer` 返回值
- 补写记录的 `offer_duration`/`queue_wait_ms` 字段为 NULL（可接受）
