# 如何运行测试

## 快速开始

### 1. 安装测试依赖

```bash
yarn add -D jest @vue/vue3-jest babel-jest @babel/core @babel/preset-env jest-environment-jsdom
```

### 2. 运行测试

```bash
# 运行所有测试
yarn test

# 监听模式（文件变化时自动运行）
yarn test:watch

# 生成覆盖率报告
yarn test:coverage
```

## 详细说明

### 运行所有测试

```bash
npm run test
```

这会运行 `src/common/tests/` 目录下的所有测试文件。

```bash
yarn test
```

### 运行特定测试文件

```bash
# 运行平台配置测试
yarn test platform-config.test.js

# 运行适配器测试
yarn test BasePlatformAdapter.test.js

# 运行工厂测试
yarn test PlatformFactory.test.js
```

### 运行特定目录的测试

```bash
# 运行所有核心类测试
yarn test core/

# 运行所有工厂测试
yarn test factories/

# 运行所有平台配置测试
yarn test platform/
```

### 监听模式

监听模式会在文件变化时自动重新运行测试：

```bash
yarn test:watch
```

### 覆盖率报告

生成测试覆盖率报告：

```bash
yarn test:coverage
```

报告会生成在 `coverage/` 目录下，可以用浏览器打开 `coverage/lcov-report/index.html` 查看。

### 只运行失败的测试

```bash
yarn test --onlyFailures
```

### 详细输出

```bash
yarn test --verbose
```

## 测试文件位置

测试文件位于：

```
src/common/tests/
├── core/
│   └── BasePlatformAdapter.test.js
├── platform/
│   └── configs/
│       └── platform-config.test.js
└── factories/
    ├── PlatformFactory.test.js
    └── QueueFactory.test.js
```

## 常见问题

### 问题1: 找不到模块

**错误**: `Cannot find module '@/common/...'`

**解决**: 确保 `jest.config.js` 中的 `moduleNameMapper` 配置正确。

### 问题2: ES模块语法错误

**错误**: `SyntaxError: Unexpected token 'export'`

**解决**:

1. 确保已安装 `@babel/preset-env`
2. 检查 `babel.config.js` 是否存在
3. 确保 `jest.config.js` 中配置了正确的transform

### 问题3: window对象未定义

**错误**: `ReferenceError: window is not defined`

**解决**: 测试环境已配置 `jsdom`，如果仍有问题，检查 `tests/setup.js` 是否正确设置了window mock。

### 问题4: localStorage未定义

**错误**: `ReferenceError: localStorage is not defined`

**解决**: `tests/setup.js` 中已配置了localStorage的mock，确保文件存在。

## 调试测试

### 使用VS Code调试

在VS Code中创建 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Jest: 当前文件",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["${relativeFile}"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Jest: 所有测试",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

然后按F5开始调试。

### 使用console.log调试

在测试代码中添加 `console.log`:

```javascript
test("调试测试", () => {
  const result = someFunction();
  console.log("结果:", result);
  expect(result).toBeDefined();
});
```

## 测试最佳实践

1. **测试命名**: 使用描述性的测试名称
2. **独立测试**: 每个测试应该独立，不依赖其他测试
3. **使用Mock**: Mock外部依赖（API、localStorage等）
4. **测试边界**: 测试正常情况、错误情况、边界情况
5. **保持简单**: 每个测试只测试一个功能点

## 下一步

- 查看 `src/common/tests/README.md` 了解更多测试编写指南
- 查看 `MIGRATION_GUIDE.md` 了解如何迁移现有代码
- 查看 `USAGE_EXAMPLES.md` 了解使用示例
