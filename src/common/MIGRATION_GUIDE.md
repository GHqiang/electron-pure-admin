# 重构迁移指南

## 概述

本文档说明如何从旧架构迁移到新架构，以及如何使用新架构添加新平台。

## 新架构优势

1. **配置驱动**：新增平台只需添加配置，无需编写大量重复代码
2. **代码复用**：公共逻辑集中在基类，减少重复代码约60-70%
3. **易于测试**：每个组件都可以独立测试
4. **易于扩展**：新增平台只需3步：配置 + 适配器 + 队列

## 目录结构

```
src/common/
├── core/                          # 核心抽象层
│   ├── BasePlatformAdapter.js    # 平台适配器基类
│   ├── BaseOfferQueue.js         # 报价队列基类
│   ├── BaseTicketQueue.js        # 出票队列基类
│   └── BaseOrderFetcher.js       # 订单获取基类
├── platform/                      # 平台实现层
│   ├── adapters/                 # 平台适配器
│   │   └── LierenAdapter.js
│   ├── configs/                  # 平台配置
│   │   └── platform-config.js
│   ├── queues/                   # 平台队列实现
│   │   └── LierenOfferQueue.js
│   └── fetchers/                 # 订单获取实现
│       └── LierenOrderFetcher.js
└── factories/                     # 工厂层
    ├── PlatformFactory.js
    └── QueueFactory.js
```

## 如何添加新平台

### 步骤1：添加平台配置

在 `src/common/platform/configs/platform-config.js` 中添加新平台配置：

```javascript
export const PLATFORM_CONFIGS = {
  // ... 现有配置

  // 新平台配置
  newplatform: {
    name: "newplatform",
    displayName: "新平台",
    features: {
      hasTransferFee: false,
      priceStep: 1,
      supportAsyncSubmit: false,
      unlockBeforeTicket: true,
      needConfirmOrder: false
    },
    api: {
      getOrderList: "queryStayOfferList",
      submitOffer: "submitOffer",
      unlockSeat: "unlockSeat",
      submitTicket: "submitTicketCode",
      transferOrder: "transferOrder"
    },
    params: {
      orderIdKey: "id",
      orderNumberKey: "order_number",
      unlockParams: order => ({
        order_id: order.id
      }),
      submitParams: (order, qrcode) => ({
        order_number: order.order_number,
        ticket_code: qrcode
      }),
      transferParams: (order, reason) => ({
        order_number: order.order_number,
        reason: reason || "无法出票"
      }),
      offerParams: (order, price) => ({
        order_number: order.order_number,
        price
      })
    },
    transformOrder: order => ({
      ...order,
      plat_name: "newplatform"
    })
  }
};
```

### 步骤2：创建平台适配器

创建 `src/common/platform/adapters/NewPlatformAdapter.js`：

```javascript
import BasePlatformAdapter from "../../core/BasePlatformAdapter.js";
import newPlatformApi from "@/api/newplatform-api.js";
import Logger from "../../logger.js";

export default class NewPlatformAdapter extends BasePlatformAdapter {
  constructor(logger) {
    super("newplatform", newPlatformApi, logger);
  }

  async fetchOrderList(params = {}) {
    try {
      const res = await this.api.queryStayOfferList(params);
      return res?.data || [];
    } catch (error) {
      this.logger.errorSave("获取待报价订单列表异常", { error });
      return [];
    }
  }

  async submitOffer(params) {
    try {
      this.logger.infoSave("提交报价参数", params);
      const res = await this.api.submitOffer(params);
      this.logger.infoSave("提交报价返回", res);
      return res;
    } catch (error) {
      this.logger.errorSave("提交报价异常", { error, params });
      throw error;
    }
  }
}
```

### 步骤3：创建报价队列

创建 `src/common/platform/queues/NewPlatformOfferQueue.js`：

```javascript
import BaseOfferQueue from "../../core/BaseOfferQueue.js";
import NewPlatformAdapter from "../adapters/NewPlatformAdapter.js";
import { getCinemaFlag, getCinemaLoginInfoList } from "@/utils/utils.js";
import { GET_APP_INFO } from "@/common/constant.js";
import svApi from "@/api/sv-api.js";
import { platTokens } from "@/store/platTokens.js";

const tokens = platTokens();

export default class NewPlatformOfferQueue extends BaseOfferQueue {
  constructor() {
    const adapter = new NewPlatformAdapter();
    super(adapter, "newplatform");
    this.isTestOrder = false;
  }

  async getFetchInterval() {
    // 从localStorage获取配置
    const platQueueRule = window.localStorage.getItem("platQueueRule");
    if (!platQueueRule) return 5;
    const rules = JSON.parse(platQueueRule);
    const rule = rules.find(item => item.platName === "newplatform");
    return rule?.getInterval || 5;
  }

  async fetchOrders(fetchDelay) {
    try {
      await mockDelay(fetchDelay);
      const stayList = await this.getStayOfferList();
      if (!stayList?.length) return;

      // 过滤和转换订单
      const processedList = stayList
        .filter(item => {
          const appFlag = getCinemaFlag(item);
          const appLoginInfo = getCinemaLoginInfoList().find(
            loginItem =>
              loginItem.app_name === appFlag &&
              loginItem.mobile &&
              loginItem.session_id
          );
          return appLoginInfo && appFlag;
        })
        .map(item => {
          const app_name = getCinemaFlag(item);
          return {
            ...item,
            plat_name: "newplatform",
            app_name,
            appName: app_name,
            app_type_code: GET_APP_INFO(app_name)?.app_type_code,
            offer_end_time: item.sytime * 1000
          };
        });

      const newOrders = processedList.filter(
        item => !this.handledOrders.has(item.order_number)
      );

      newOrders.forEach(item => {
        this.handleNewOrder(item);
      });
    } catch (error) {
      this.logger.errorSave("获取待报价订单异常", { error });
    }
  }

  async getStayOfferList() {
    try {
      const params = {};
      const res = await this.platformAdapter.fetchOrderList(params);
      return res || [];
    } catch (error) {
      this.logger.errorSave("获取待报价列表异常", { error });
      return [];
    }
  }

  async addOrderHandleRecord(order, offerResult) {
    try {
      const serOrderInfo = {
        plat_name: "newplatform",
        app_name:
          order.app_name || offerResult?.offerRule?.shadowLineName || "",
        order_id: order.id,
        order_number: order.order_number,
        // ... 其他字段
        order_status: offerResult?.res ? "1" : "2",
        processing_time: getCurrentTime()
        // ...
      };

      if (!this.isTestOrder) {
        await svApi.addOfferRecord(serOrderInfo);
      }
    } catch (error) {
      this.logger.errorSave("添加订单处理记录异常", { error });
    }
  }
}
```

### 步骤4：在工厂中注册

在 `src/common/factories/PlatformFactory.js` 中注册适配器：

```javascript
import NewPlatformAdapter from "../platform/adapters/NewPlatformAdapter.js";

class PlatformFactory {
  constructor() {
    // ...
    this.registerAdapter("newplatform", NewPlatformAdapter);
  }
}
```

在 `src/common/factories/QueueFactory.js` 中注册队列：

```javascript
import NewPlatformOfferQueue from "../platform/queues/NewPlatformOfferQueue.js";

class OfferQueueFactory {
  constructor() {
    // ...
    this.registerOfferQueue("newplatform", NewPlatformOfferQueue);
  }
}
```

## 使用新架构

### 创建报价队列

```javascript
import { offerQueueFactory } from "@/common/factories/QueueFactory.js";

// 创建报价队列
const queue = offerQueueFactory.getOfferQueue("lieren");

// 启动队列
await queue.start(false); // false表示非测试模式

// 停止队列
queue.stop();
```

### 创建平台适配器

```javascript
import platformFactory from "@/common/factories/PlatformFactory.js";

// 创建适配器
const adapter = platformFactory.get("lieren");

// 使用适配器
const orderList = await adapter.fetchOrderList();
await adapter.submitOffer({ order_number: "xxx", price: 100 });
```

## 迁移现有平台

### 迁移步骤

1. **分析现有代码**：查看 `useXXXOffer.js` 和 `XXXFetchOrder.js`
2. **提取配置**：将平台特性提取到 `platform-config.js`
3. **创建适配器**：继承 `BasePlatformAdapter`，实现平台特定逻辑
4. **创建队列**：继承 `BaseOfferQueue`，实现平台特定逻辑
5. **注册到工厂**：在工厂中注册新组件
6. **测试验证**：确保功能对等
7. **逐步替换**：在 `queueManage/index.vue` 中替换旧实现

### 兼容性

新架构提供了兼容层，可以逐步迁移：

- 旧代码继续工作
- 新代码使用新架构
- 可以同时存在，逐步替换

## 测试

### 运行测试

```bash
# 运行所有测试
npm run test

# 运行特定测试文件
npm run test platform-config.test.js
```

### 编写测试

参考 `src/common/tests/` 目录下的测试文件。

## 常见问题

### Q: 如何保持原有接口兼容？

A: 创建兼容层文件，导出相同接口：

```javascript
// useLierenOffer.new.js
import LierenOfferQueue from "../platform/queues/LierenOfferQueue.js";
const offerQueue = new LierenOfferQueue();
export default offerQueue;
```

### Q: 如何处理平台特定的复杂逻辑？

A: 在适配器或队列中覆盖基类方法，实现特定逻辑。

### Q: 如何测试新架构？

A: 使用提供的测试文件作为模板，为每个组件编写单元测试。

## 下一步

1. 完成猎人平台的完整迁移和测试
2. 迁移其他平台（逐个迁移，保证稳定性）
3. 清理旧代码
4. 完善文档
