# SFC系列模块化重构方案

## 一、重构背景

### 1.1 现状问题

**原始架构**：

- `src/common/autoOffer/sfcOffer.js` - 报价逻辑
- `src/common/autoTicket/sfcAutoTicket.js` - 出票逻辑

**核心问题**：

1. **代码重复**：报价和出票逻辑高度耦合，大量重复代码
2. **维护困难**：逻辑分散在单个大文件中，难以定位和修改
3. **扩展性差**：新增功能需要修改多个地方，容易引入bug
4. **测试困难**：无法对单个模块进行独立测试

### 1.2 重构目标

1. **模块化拆分**：将大文件拆分为职责清晰的模块
2. **代码复用**：利用 BaseOfferPrice、BaseBuyTicket 基类，减少重复
3. **易于维护**：每个模块职责单一，便于定位和修改
4. **易于扩展**：新增功能只需修改对应模块
5. **易于测试**：每个模块可独立单元测试

## 二、架构设计

### 2.1 目录结构

```
src/common/autoTicket/buyTicket/sfc/
├── offerManage.js      # 报价管理（继承 BaseOfferPrice）
├── buyTicket.js        # 出票主流程（继承 BaseBuyTicket）
├── cardQuanManage.js   # 卡券管理
├── cinemaManage.js     # 影院管理
├── seatManage.js       # 座位管理
├── orderManage.js      # 订单管理
└── __tests__/          # 单元测试
    ├── cinemaManage.test.js
    ├── seatManage.test.js
    ├── offerManage.test.js
    ├── cardQuanManage.test.js
    ├── orderManage.test.js
    └── buyTicket.test.js
```

### 2.2 基类设计

#### 2.2.1 BaseOfferPrice 基类

**职责**：定义报价流程的模板方法，统一错误处理与响应格式。

**关键方法**：

- `getEndOfferPrice()` - 模板方法
- `getEndMatchOfferRule()` - 子类实现，匹配报价规则
- `getCostPrice()` - 子类实现，获取成本价
- `calculateFinalPrice()` - 子类实现，计算最终报价

#### 2.2.2 BaseBuyTicket 基类

**职责**：定义出票流程的模板方法，统一错误处理与日志。

**关键方法**：

- `singleTicket()` - 模板方法
- `getCinemaLoginInfo()` - 子类实现
- `getOrderOfferRule()` - 子类实现
- `checkOfferRuleRes()` - 子类实现
- `oneClickBuyTicket()` - 子类实现，一键买票主流程

### 2.3 模块职责划分

| 模块                  | 职责         | 关键方法                                                                                                                               |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **offerManage.js**    | 报价逻辑管理 | `getEndMatchOfferRule()`, `getCostPrice()`, `calculateFinalPrice()`, `getEndOfferPrice()`                                              |
| **cardQuanManage.js** | 卡券管理     | `getQuanInfo()`, `getQuanListByPhone()`, `useQuanOrCard()`, `getUsableCardList()`, `getSortPhoneByQuanTypeList()`, `updateQuanStock()` |
| **cinemaManage.js**   | 影院信息管理 | `getCityList()`, `getCityCinemaList()`, `getBuyPrevCinemaInfo()`, `getMoviePlayInfo()`, `getMovieInfo()`                               |
| **seatManage.js**     | 座位管理     | `getSeatLayout()`, `getTargetSeat()`, `lockSeatHandle()`                                                                               |
| **orderManage.js**    | 订单管理     | `priceCalculation()`, `createOrder()`, `buyTicket()`, `payOrder()`, `lastHandle()`, `transferOrder()`, `releaseSeat()`                 |
| **buyTicket.js**      | 出票流程编排 | `singleTicket()`, `oneClickBuyTicket()`, `getCinemaLoginInfo()`, `getOrderOfferRule()`, `checkOfferRuleRes()`                          |

## 三、实现要点

### 3.1 报价模块 (offerManage.js)

**继承关系**：`getSfcOfferPrice extends BaseOfferPrice`

**SFC 特殊逻辑**：

- 系统异常检查：`checkConsecutiveErrors` 连续订单创建失败判断
- 座位区域定价：取最高价或最频座位价
- 灵活用券逻辑及卡使用检查（余额、日/月限制）

### 3.2 订单模块 (orderManage.js)

**职责**：价格计算、订单创建、购买、取票码获取与上传、转单、取消、释放座位。

**依赖**：`getCurrentParams` 注入当前登录列表与索引，`seatManage` 用于释放座位时调 `getSeatLayout`、`lockSeatHandle`。

### 3.3 工厂注册

- **报价**：`commonOfferHandle.js` 对 `GET_SFC_APP_LIST().includes(appFlag)` 使用 `sfc/offerManage` 的 `getSfcOfferPrice`。
- **出票**：`buyTicket/index.js` 的 `STRATEGY_MAP` 注册 `sfc_applet`、`sfc` 映射到 `SfcBuyTicket`。

## 四、测试与验证

- 单元测试：`sfc/__tests__` 下各模块测试文件，使用 Jest，Mock 外部依赖。
- 运行：`yarn test` 或 `npx jest "src/common/autoTicket/buyTicket/sfc/__tests__"`。
- 详细步骤见 `TEST_VERIFICATION.md`。
