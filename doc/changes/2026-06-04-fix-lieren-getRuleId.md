# 变更记录：修复猎人平台 getRuleId 返回 null 问题

## 日期
2026-06-04

## 问题描述
猎人平台订单报价获取规则id时返回的是 null，导致无法正确关联报价规则。

## 根因分析
`LierenOfferQueue.getRuleId()` 方法中判断逻辑不够严谨：
- 原逻辑：只要是固定报价规则（`offerType == "1"`）就不返回规则id
- 问题：未考虑"未设置同步猎人平台"的固定报价规则也需要获取规则id

## 修改文件清单
| 文件路径 | 修改类型 |
|---------|---------|
| `src/common/platform/queues/LierenOfferQueue.js` | 逻辑修复 |

## 核心变更说明

### 修改前
```javascript
async getRuleId(order, logger, offerRule) {
  try {
    // 固定报价规则不返回规则id
    if (offerRule.offerType == "1") {
      return null;
    }
    return await getRuleIdByPlat({...});
  } catch (error) {
    this.logger.errorSave("获取规则ID异常", { error, order });
    return null;
  }
}
```

### 修改后
```javascript
async getRuleId(order, logger, offerRule) {
  try {
    // 固定报价规则且已设置同步猎人平台时不返回规则id
    const isSyncToLieren =
      offerRule.platOfferList?.find(item => item.platName === "lieren")
        ?.isSyncPlat == 1;
    if (offerRule.offerType == "1" && isSyncToLieren) {
      return null;
    }
    return await getRuleIdByPlat({...});
  } catch (error) {
    this.logger.errorSave("获取规则ID异常", { error, order });
    return null;
  }
}
```

### 变更逻辑
1. 新增判断条件：检查 `offerRule.platOfferList` 中猎人平台的 `isSyncPlat` 是否为 1
2. 只有同时满足以下两个条件才返回 null：
   - 固定报价规则（`offerType == "1"`）
   - 已设置同步猎人平台（`isSyncPlat == 1`）
3. 其他情况正常调用 `getRuleIdByPlat()` 获取规则id

## 验证结果
- ✅ ESLint 检查通过（exit code: 0）
- ✅ `platOfferList` 数据结构确认为数组类型（代码中大量使用 `.find()`、`.some()`、`.map()` 等数组方法）

## 回归风险评估
- **风险等级**：低
- **影响范围**：仅影响猎人平台报价队列的规则id获取逻辑
- **潜在影响**：
  - 固定报价且未同步到猎人平台的规则：现在可以正确获取规则id（修复）
  - 固定报价且已同步到猎人平台的规则：行为不变，返回 null
  - 非固定报价规则：行为不变，正常获取规则id
