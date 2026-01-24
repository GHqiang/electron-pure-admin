# 影院层架构设计方案

## 一、整体架构概述

### 1.1 三层架构
```
┌─────────────────────────────────────────┐
│         编排层（服务层）                  │
│   TicketingOrchestrator                 │
│   - 平台订单 → 影院购票流程编排          │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         影院层（新架构）                 │
│   BaseCinemaAdapter                     │
│   CinemaPriceService                    │
│   CinemaTicketService                   │
│   - 会员价查询                          │
│   - 排期获取                            │
│   - 锁座/出票                           │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         平台层（现有架构）                │
│   BasePlatformAdapter                   │
│   BaseOrderFetcher                      │
│   BaseOfferQueue / BaseTicketQueue      │
│   - 平台订单获取                        │
│   - 报价处理                            │
│   - 状态同步                            │
└─────────────────────────────────────────┘
```

### 1.2 核心设计原则
1. **职责分离**：平台层只关心平台，影院层只关心影院
2. **统一接口**：所有影院渠道通过统一接口访问
3. **可扩展性**：新增影院渠道只需实现适配器
4. **向后兼容**：保留现有 autoOffer/autoTicket 作为兼容层

## 二、目录结构设计

```
src/common/
├── core/                          # 核心基类（已有+新增）
│   ├── BasePlatformAdapter.js     # 已有
│   ├── BaseOrderFetcher.js        # 已有
│   ├── BaseOfferQueue.js          # 已有
│   ├── BaseTicketQueue.js         # 已有
│   ├── BaseCinemaAdapter.js       # ✅ 新增：影院适配器基类
│   └── BaseCinemaTicketService.js # ✅ 新增：购票服务基类
│
├── platform/                      # 平台层（现有）
│   ├── adapters/                  # 各平台适配器
│   ├── fetchers/                  # 订单获取器
│   └── queues/                    # 报价/出票队列
│
├── cinema/                        # ✅ 新增：影院层
│   ├── adapters/                  # 影院渠道适配器
│   │   ├── MaoyanCinemaAdapter.js
│   │   ├── ChenxingCinemaAdapter.js
│   │   ├── WxTicketCinemaAdapter.js
│   │   ├── LmaCinemaAdapter.js
│   │   ├── SfcCinemaAdapter.js
│   │   └── UmeCinemaAdapter.js
│   │
│   ├── configs/                   # 影院配置
│   │   └── cinema-config.js       # 影院系列配置
│   │
│   ├── services/                   # 影院服务
│   │   ├── CinemaPriceService.js  # 统一获取会员价
│   │   └── CinemaTicketService.js # 统一购票流程
│   │
│   ├── mappers/                    # 映射器
│   │   └── PlatformOrderToCinemaMapper.js
│   │
│   └── factories/                  # 工厂
│       └── CinemaAdapterFactory.js
│
└── services/                       # ✅ 新增：编排层
    └── TicketingOrchestrator.js    # 购票编排服务
```

## 三、核心接口定义

### 3.1 BaseCinemaAdapter（影院适配器基类）

**职责**：抽象出"一个影院渠道能做什么"

**核心能力**：
- 获取影院排期/场次
- 获取某场次的价表（包含会员价）
- 锁座
- 解锁
- 提交订单/出票
- 查询订单状态

### 3.2 BaseCinemaTicketService（购票服务基类）

**职责**：提供统一的购票流程接口

**核心能力**：
- 根据平台订单执行购票流程
- 统一错误处理
- 统一结果格式

### 3.3 CinemaPriceService（价格服务）

**职责**：统一获取会员价

**核心能力**：
- 根据影院配置获取价格列表
- 支持会员价查询
- 统一价格格式

### 3.4 PlatformOrderToCinemaMapper（映射器）

**职责**：平台订单 → 影院购票参数映射

**核心能力**：
- 字段映射
- 数据清洗
- 格式转换

### 3.5 TicketingOrchestrator（编排器）

**职责**：编排平台订单到影院购票流程

**核心能力**：
- 监听平台待出票订单
- 选择影院渠道
- 执行购票流程
- 回调平台API

## 四、数据流设计

### 4.1 报价流程
```
平台订单 → PlatformOrderToCinemaMapper → CinemaPriceService → 
BaseCinemaAdapter.fetchPriceList → 返回会员价 → 报价队列处理
```

### 4.2 出票流程
```
平台待出票订单 → TicketingOrchestrator → PlatformOrderToCinemaMapper → 
CinemaTicketService → BaseCinemaAdapter → 购票成功 → 
回调平台API提交取票码
```

## 五、配置设计

### 5.1 影院配置结构
```javascript
{
  cinemaId: "内部ID",
  cinemaCode: "影院编码",
  thirdCode: "第三方编码",
  channel: "maoyan" | "chenxing" | "wx_ticket" | "lma" | ...,
  features: {
    supportMemberPrice: true,
    supportCardType: ["gold", "normal"],
    needLogin: true,
    // ... 其他特性
  },
  adapter: "MaoyanCinemaAdapter", // 适配器类名
  // ... 其他配置
}
```

## 六、扩展性设计

### 6.1 新增影院渠道
1. 在 `cinema-config.js` 中新增配置
2. 实现 `XXXCinemaAdapter` 继承 `BaseCinemaAdapter`
3. 在 `CinemaAdapterFactory` 中注册

### 6.2 新增平台
1. 按现有流程：platform-config + Adapter + OfferQueue + OrderFetcher
2. 不需要改影院层
3. 只需确保 OrderFetcher 输出统一字段格式

### 6.3 特殊逻辑处理
- 在对应 `XXXCinemaAdapter` 中实现
- 或在 `CinemaPriceService` 中针对特定配置写分支
- 不污染平台代码

## 七、迁移策略

### 7.1 阶段一：基础设施搭建
- 创建目录结构
- 实现基类接口
- 实现配置层

### 7.2 阶段二：迁移一个影院渠道（试点）
- 选择 LMA 作为试点
- 实现 `LmaCinemaAdapter`
- 实现映射和服务
- 验证流程

### 7.3 阶段三：批量迁移
- 迁移其他影院渠道
- 统一接口规范
- 完善错误处理

### 7.4 阶段四：编排层集成
- 实现 `TicketingOrchestrator`
- 与平台层集成
- 完善监控和日志

### 7.5 阶段五：清理和优化
- 保留旧代码作为兼容层
- 逐步切换
- 最终清理

## 八、优势总结

1. **解耦**：平台层与影院层完全解耦
2. **复用**：减少重复代码，统一接口
3. **扩展**：新增渠道只需实现适配器
4. **维护**：职责清晰，易于定位问题
5. **测试**：各层可独立测试
