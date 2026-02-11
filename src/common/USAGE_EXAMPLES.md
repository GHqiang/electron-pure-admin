# 使用示例

## 基本使用

### 1. 使用工厂创建报价队列

```javascript
import { offerQueueFactory } from "@/common/factories/QueueFactory.js";

// 获取报价队列
const lierenQueue = offerQueueFactory.getOfferQueue("lieren");

// 启动队列
lierenQueue.start(false); // false = 非测试模式

// 停止队列
lierenQueue.stop();
```

### 2. 使用工厂创建平台适配器

```javascript
import platformFactory from "@/common/factories/PlatformFactory.js";

// 获取平台适配器
const adapter = platformFactory.get("lieren");

// 获取订单列表
const orders = await adapter.fetchOrderList();

// 提交报价
const result = await adapter.submitOffer({
  order_number: "20240101001",
  price: 50,
  rule_id: 123
});

// 解锁座位
const unlockResult = await adapter.unlockSeat({
  order_number: "20240101001"
});

// 提交取票码
const submitResult = await adapter.submitTicketCode(
  { order_number: "20240101001" },
  "123456|789"
);

// 转单
const transferResult = await adapter.transferOrder(
  { order_number: "20240101001" },
  "价格过低无法出票"
);
```

### 3. 直接使用适配器类

```javascript
import LierenAdapter from "@/common/platform/adapters/LierenAdapter.js";
import Logger from "@/common/logger.js";

const logger = new Logger({ logType: 1 });
const adapter = new LierenAdapter(logger);

// 使用适配器
const orders = await adapter.fetchOrderList();
```

### 4. 直接使用队列类

```javascript
import LierenOfferQueue from "@/common/platform/queues/LierenOfferQueue.js";

const queue = new LierenOfferQueue();
await queue.start(false);
```

## 高级使用

### 自定义适配器

```javascript
import BasePlatformAdapter from "@/common/core/BasePlatformAdapter.js";
import customApi from "@/api/custom-api.js";
import Logger from "@/common/logger.js";

class CustomAdapter extends BasePlatformAdapter {
  constructor(logger) {
    super("custom", customApi, logger);
  }

  // 覆盖基类方法实现自定义逻辑
  async fetchOrderList(params = {}) {
    // 自定义实现
    const res = await this.api.customGetOrders(params);
    return this.processOrders(res);
  }

  processOrders(res) {
    // 自定义处理逻辑
    return res.data.map(item => ({
      ...item,
      custom_field: "custom_value"
    }));
  }
}
```

### 自定义队列

```javascript
import BaseOfferQueue from "@/common/core/BaseOfferQueue.js";
import CustomAdapter from "../adapters/CustomAdapter.js";

class CustomOfferQueue extends BaseOfferQueue {
  constructor() {
    const adapter = new CustomAdapter();
    super(adapter, "custom");
  }

  // 覆盖基类方法
  async getFetchInterval() {
    // 自定义获取间隔逻辑
    return await this.getCustomInterval();
  }

  // 实现必需的方法
  async fetchOrders(fetchDelay) {
    // 自定义获取订单逻辑
  }

  async addOrderHandleRecord(order, offerResult) {
    // 自定义保存记录逻辑
  }
}
```

### 动态注册新平台

```javascript
import platformFactory from "@/common/factories/PlatformFactory.js";
import { offerQueueFactory } from "@/common/factories/QueueFactory.js";
import NewPlatformAdapter from "@/common/platform/adapters/NewPlatformAdapter.js";
import NewPlatformOfferQueue from "@/common/platform/queues/NewPlatformOfferQueue.js";

// 注册适配器
platformFactory.registerAdapter("newplatform", NewPlatformAdapter);

// 注册队列
offerQueueFactory.registerOfferQueue("newplatform", NewPlatformOfferQueue);

// 现在可以使用
const adapter = platformFactory.get("newplatform");
const queue = offerQueueFactory.getOfferQueue("newplatform");
```

## 测试示例

### 测试适配器

```javascript
import LierenAdapter from "@/common/platform/adapters/LierenAdapter.js";
import Logger from "@/common/logger.js";

describe("LierenAdapter", () => {
  let adapter;
  let mockApi;
  let mockLogger;

  beforeEach(() => {
    mockApi = {
      queryStayOfferList: jest.fn().mockResolvedValue({
        data: [{ id: 1, order_number: "test001" }]
      }),
      submitOffer: jest.fn().mockResolvedValue({ code: 1 })
    };

    mockLogger = {
      infoSave: jest.fn(),
      errorSave: jest.fn()
    };

    adapter = new LierenAdapter(mockLogger);
    adapter.api = mockApi; // 注入mock API
  });

  test("应该能够获取订单列表", async () => {
    const orders = await adapter.fetchOrderList();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(1);
  });

  test("应该能够提交报价", async () => {
    const params = { order_number: "test001", price: 50 };
    const result = await adapter.submitOffer(params);
    expect(result.code).toBe(1);
    expect(mockApi.submitOffer).toHaveBeenCalledWith(params);
  });
});
```

### 测试队列

```javascript
import LierenOfferQueue from "@/common/platform/queues/LierenOfferQueue.js";

describe("LierenOfferQueue", () => {
  let queue;

  beforeEach(() => {
    queue = new LierenOfferQueue();
  });

  test("应该能够启动和停止队列", async () => {
    // 启动队列（测试模式）
    const startPromise = queue.start(true);

    // 立即停止
    queue.stop();

    await startPromise;
    expect(queue.isRunning).toBe(false);
  });

  test("应该能够处理新订单", () => {
    const order = {
      order_number: "test001",
      offer_end_time: Date.now() + 10000
    };

    queue.handleNewOrder(order);
    expect(queue.handledOrders.has("test001")).toBe(true);
    expect(queue.queue.length).toBeGreaterThan(0);
  });
});
```

## 集成到现有代码

### 在 queueManage/index.vue 中使用

```javascript
// 旧方式
import lierenOfferQueue from "@/common/autoOffer/useLierenOffer.js";

// 新方式（推荐）
import { offerQueueFactory } from "@/common/factories/QueueFactory.js";
const lierenOfferQueue = offerQueueFactory.getOfferQueue("lieren");

// 使用方式完全相同
lierenOfferQueue.start(false);
lierenOfferQueue.stop();
```

### 逐步迁移策略

1. **第一阶段**：新架构与旧代码并存
2. **第二阶段**：逐个平台迁移，保持兼容
3. **第三阶段**：完全切换到新架构
4. **第四阶段**：清理旧代码

## 最佳实践

1. **使用工厂模式**：始终通过工厂创建实例，不要直接 new
2. **错误处理**：适配器和队列已经包含错误处理，无需重复
3. **日志记录**：使用Logger统一记录日志
4. **配置优先**：尽量将平台差异放在配置中，减少代码
5. **测试覆盖**：为每个新平台编写测试

## 性能优化

1. **实例缓存**：工厂会自动缓存实例，无需担心重复创建
2. **懒加载**：适配器和队列按需创建
3. **批量处理**：队列自动处理订单批量

## 调试技巧

```javascript
// 启用详细日志
const logger = new Logger({ logType: 1, isPrint: true });
const adapter = new LierenAdapter(logger);

// 查看队列状态
console.log(queue.isRunning);
console.log(queue.queue.length);
console.log(queue.handledOrders.size);

// 测试模式
queue.start(true); // true = 测试模式，不会真正提交
```
