# 测试说明

## 运行测试

### 安装依赖

首先确保安装了测试相关的依赖：

```bash
yarn install
```

如果缺少依赖，需要安装：

```bash
yarn add -D jest @vue/vue3-jest babel-jest @babel/core @babel/preset-env jest-environment-jsdom
```

### 运行所有测试

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

### 运行测试并查看覆盖率

```bash
yarn test --coverage
```

### 监听模式（自动运行测试）

```bash
yarn test --watch
```

### 运行特定目录的测试

```bash
# 运行所有核心类测试
yarn test core/

# 运行所有工厂测试
yarn test factories/
```

## 测试文件结构

```
src/common/tests/
├── core/                    # 核心类测试
│   └── BasePlatformAdapter.test.js
├── platform/                # 平台相关测试
│   └── configs/
│       └── platform-config.test.js
└── factories/               # 工厂类测试
    ├── PlatformFactory.test.js
    └── QueueFactory.test.js
```

## 编写新测试

### 测试文件命名

测试文件应该以 `.test.js` 结尾，例如：

- `LierenAdapter.test.js`
- `LierenOfferQueue.test.js`

### 基本测试结构

```javascript
// 导入要测试的模块
import LierenAdapter from "../../platform/adapters/LierenAdapter.js";

describe("LierenAdapter", () => {
  let adapter;
  let mockApi;
  let mockLogger;

  // 每个测试前执行
  beforeEach(() => {
    // 创建mock对象
    mockApi = {
      queryStayOfferList: jest.fn().mockResolvedValue({
        data: [{ id: 1 }]
      })
    };

    mockLogger = {
      infoSave: jest.fn(),
      errorSave: jest.fn()
    };

    // 创建测试实例
    adapter = new LierenAdapter(mockLogger);
    adapter.api = mockApi; // 注入mock
  });

  // 每个测试后执行
  afterEach(() => {
    jest.clearAllMocks();
  });

  // 测试用例
  test("应该能够获取订单列表", async () => {
    const orders = await adapter.fetchOrderList();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(1);
  });
});
```

## Mock示例

### Mock API

```javascript
const mockApi = {
  queryStayOfferList: jest.fn().mockResolvedValue({
    data: [{ id: 1, order_number: "test001" }]
  }),
  submitOffer: jest.fn().mockResolvedValue({ code: 1, msg: "success" }),
  unlockSeat: jest.fn().mockResolvedValue({ msg: "success" })
};
```

### Mock Logger

```javascript
const mockLogger = {
  infoSave: jest.fn(),
  errorSave: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};
```

### Mock localStorage

```javascript
// 在setup.js中已配置，可以直接使用
window.localStorage.setItem("testKey", "testValue");
const value = window.localStorage.getItem("testKey");
```

### Mock window事件

```javascript
// 监听事件
const handler = jest.fn();
window.addEventListener("testEvent", handler);

// 触发事件
const event = new CustomEvent("testEvent", { detail: { test: "data" } });
window.dispatchEvent(event);

// 验证
expect(handler).toHaveBeenCalledWith(event);
```

## 常见问题

### Q: 测试报错 "Cannot find module"

A: 检查导入路径是否正确，确保使用了正确的别名（@/）或相对路径。

### Q: 测试报错 "SyntaxError: Unexpected token import"

A: 确保已安装并配置了Babel，检查 `babel.config.js` 文件是否存在。

### Q: 如何测试异步函数？

A: 使用 `async/await` 或返回Promise：

```javascript
test("异步测试", async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

### Q: 如何跳过某些测试？

A: 使用 `test.skip()` 或 `describe.skip()`：

```javascript
test.skip("跳过这个测试", () => {
  // 测试代码
});
```

### Q: 如何只运行失败的测试？

A: 使用 `--onlyFailures` 标志：

```bash
yarn test --onlyFailures
```

## 测试最佳实践

1. **测试独立性**：每个测试应该独立，不依赖其他测试的状态
2. **使用Mock**：Mock外部依赖（API、localStorage等）
3. **测试边界情况**：测试正常情况、错误情况、边界情况
4. **描述性命名**：测试名称应该清楚描述测试内容
5. **保持简单**：每个测试只测试一个功能点

## 持续集成

如果使用CI/CD，可以在配置文件中添加：

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: npm run test -- --coverage
```

## 更多资源

- [Jest文档](https://jestjs.io/docs/getting-started)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
