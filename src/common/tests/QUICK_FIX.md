# 快速修复测试环境问题

## 问题：缺少 jest-environment-jsdom

### 解决方案1：安装 jsdom 环境（推荐）

```bash
yarn add -D jest-environment-jsdom
```

### 解决方案2：使用 Node 环境（如果不需要DOM）

如果测试不需要浏览器环境（不需要window、document等），可以修改 `jest.config.js`：

```javascript
// 将 testEnvironment 改为 "node"
testEnvironment: "node",
```

## 安装后运行

```bash
yarn test platform-config.test.js
```

## 如果还有问题

### 检查依赖是否安装成功

```bash
yarn list jest-environment-jsdom
```

### 清除缓存重新运行

```bash
yarn test --clearCache
yarn test platform-config.test.js
```
