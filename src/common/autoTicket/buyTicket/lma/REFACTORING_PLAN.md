# LMA系列模块化重构方案

## 一、重构背景

### 1.1 现状问题

**原始架构**：
- `src/common/autoOffer/lmaOffer.js` (1062行) - 报价逻辑
- `src/common/autoTicket/lmaAutoTicket.js` (2643行) - 出票逻辑

**核心问题**：
1. **代码重复**：报价和出票逻辑高度耦合，大量重复代码
2. **维护困难**：逻辑分散在单个大文件中，难以定位和修改
3. **扩展性差**：新增功能需要修改多个地方，容易引入bug
4. **测试困难**：无法对单个模块进行独立测试

### 1.2 重构目标

1. **模块化拆分**：将大文件拆分为职责清晰的模块
2. **代码复用**：提取公共逻辑到基类，减少重复代码
3. **易于维护**：每个模块职责单一，便于定位和修改
4. **易于扩展**：新增功能只需修改对应模块
5. **易于测试**：每个模块可独立测试

## 二、架构设计

### 2.1 目录结构

```
src/common/autoTicket/buyTicket/lma/
├── offerManage.js      # 报价管理（继承BaseOfferPrice）
├── buyTicket.js        # 出票主流程（继承BaseBuyTicket）
├── cardQuanManage.js   # 卡券管理
├── cinemaManage.js     # 影院管理
├── seatManage.js       # 座位管理
└── orderManage.js      # 订单管理
```

### 2.2 基类设计

#### 2.2.1 BaseOfferPrice 基类

位置：`src/common/core/BaseOfferPrice.js`

**职责**：
- 定义报价流程的模板方法
- 提供公共的价格计算逻辑
- 统一错误处理和响应格式

**关键方法**：
- `getEndOfferPrice()` - 模板方法，统一报价流程
- `getEndMatchOfferRule()` - 子类实现，获取匹配的报价规则
- `getCostPrice()` - 子类实现，获取成本价
- `calculateFinalPrice()` - 子类实现，计算最终报价

#### 2.2.2 BaseBuyTicket 基类

位置：`src/common/core/BaseBuyTicket.js`

**职责**：
- 定义出票流程的模板方法
- 提供公共的错误处理逻辑
- 统一日志记录格式

**关键方法**：
- `singleTicket()` - 模板方法，统一出票流程
- `getCinemaLoginInfo()` - 子类实现，获取登录信息
- `getOrderOfferRule()` - 子类实现，获取报价规则
- `oneClickBuyTicket()` - 子类实现，一键买票主流程

### 2.3 模块职责划分

| 模块 | 职责 | 关键方法 |
|------|------|---------|
| **offerManage.js** | 报价逻辑管理 | `getEndMatchOfferRule()`, `getMemberPrice()`, `calculateFinalPrice()` |
| **cardQuanManage.js** | 卡券管理 | `useCardHandle()`, `useQuanHandle()`, `getQuanListByPhone()` |
| **cinemaManage.js** | 影院信息管理 | `getBuyPrevCinemaInfo()`, `getCityCinemaList()`, `getMoviePlayInfo()` |
| **seatManage.js** | 座位管理 | `getSeatLayout()`, `getTargetSeat()`, `lockseatByApp()` |
| **orderManage.js** | 订单管理 | `pripriceCalculation()`, `buyTicket()`, `getQrcodeUploadByPlat()`, `transferOrder()` |
| **buyTicket.js** | 出票流程编排 | `singleTicket()`, `oneClickBuyTicket()`, `getCinemaLoginInfo()` |

## 三、实现细节

### 3.1 报价模块 (offerManage.js)

**继承关系**：`getLmaOfferPrice extends BaseOfferPrice`

**核心逻辑**：
1. **规则匹配**：`getEndMatchOfferRule()` - 匹配报价规则，优先会员日报价规则
2. **会员价获取**：`getMemberPrice()` - LMA特殊逻辑（`real_member_price >= 33` 时使用-5元券）
3. **价格计算**：`calculateFinalPrice()` - 动态调价、夜间顶价、超限检查、成本利润计算

**特殊逻辑**：
- LMA系列：当真实会员价 >= 33 时，使用-5元券，成本价 = (真实会员价-5) * 折扣 + 券成本

### 3.2 卡券管理模块 (cardQuanManage.js)

**核心方法**：
1. **useCardHandle()** - 使用会员卡
   - 检查内部限制（日/月使用量）
   - 调用平台API获取卡信息
   - 切换卡并更新余额

2. **useQuanHandle()** - 使用优惠券
   - 获取券类型信息
   - 查询已用券列表
   - 连续获取可用券
   - 绑定券到订单

3. **getQuanListByPhone()** - 获取优惠券列表
   - 连续分页获取券
   - 统一返回格式

### 3.3 影院管理模块 (cinemaManage.js)

**核心方法**：
1. **getBuyPrevCinemaInfo()** - 获取购票前影院信息
   - 获取城市影院列表
   - 根据影院编码匹配目标影院
   - 返回 `{ cinema_id, city_id }`

2. **getMoviePlayInfo()** - 获取电影放映信息
   - 调用平台API获取影片列表
   - 匹配目标影片

3. **getMoviePlayDate()** - 获取电影放映日期
   - 获取指定影片的放映日期列表
   - 匹配目标日期

### 3.4 座位管理模块 (seatManage.js)

**核心方法**：
1. **getSeatLayout()** - 获取座位布局
   - 调用平台API获取座位信息
   - 转换数据格式（`px排py号`）
   - 返回 `{ seatData, label_arr, short_code }`

2. **getTargetSeat()** - 获取目标座位
   - 处理座位名称格式（座/号/列统一）
   - 过滤出目标座位
   - 构建座位数组（包含价格信息）

3. **lockseatByApp()** - 锁座
   - 支持重试机制（inx参数）
   - 完整的错误处理
   - 返回锁座结果

### 3.5 订单管理模块 (orderManage.js)

**核心方法**：
1. **pripriceCalculation()** - 价格计算
   - 调用 `GET /lma/mp/iorder/get_order` 接口（与 `priceCalculation` API 为同一接口）
   - 从返回的 `res.data.price_str` 字段获取支付金额（去掉￥符号）
   - 返回完整订单信息对象 `{ price: res.data }`
   - 注意：此接口在锁座（创建订单）后才能调用，需要 `order_str` 参数

2. **buyTicket()** - 购买订单
   - 调用平台API购买
   - 处理超时情况
   - 返回购买结果

3. **getQrcodeUploadByPlat()** - 上传取票码
   - 轮询获取取票码
   - 上传到平台
   - 返回上传结果

4. **transferOrder()** - 转单逻辑
   - 取消订单释放座位
   - 调用平台转单接口
   - 处理转单失败情况

### 3.6 出票主流程 (buyTicket.js)

**继承关系**：`LmaBuyTicket extends BaseBuyTicket`

**核心流程**：
1. **getCinemaLoginInfo()** - 获取登录信息
   - 排序规则：`first` → `mobile` → `getSortPhoneByQuanTypeList`
   - 设置当前登录参数

2. **oneClickBuyTicket()** - 一键买票主流程
   - 首次出票：获取影院、电影、场次、座位信息
   - 换号出票：复用已有信息
   - 使用卡券：调用 `cardQuanManage.useCardHandle()` 和 `useQuanHandle()`
   - 锁座：调用 `seatManage.lockseatByApp()`
   - 计算价格：调用 `orderManage.pripriceCalculation()`
   - 购买：调用 `orderManage.buyTicket()`
   - 上传取票码：调用 `orderManage.getQrcodeUploadByPlat()`

## 四、迁移过程

### 4.1 代码迁移对照表

| 原始文件 | 原始方法 | 目标模块 | 目标方法 |
|---------|---------|---------|---------|
| `lmaOffer.js` | `getLmaOfferPrice` | `offerManage.js` | `getLmaOfferPrice` |
| `lmaOffer.js` | `getMemberPrice` | `offerManage.js` | `getMemberPrice` |
| `lmaOffer.js` | `getEndMatchOfferRule` | `offerManage.js` | `getEndMatchOfferRule` |
| `lmaAutoTicket.js` | `useCardHandle` | `cardQuanManage.js` | `useCardHandle` |
| `lmaAutoTicket.js` | `useQuanHandle` | `cardQuanManage.js` | `useQuanHandle` |
| `lmaAutoTicket.js` | `getCityCinemaList` | `cinemaManage.js` | `getCityCinemaList` |
| `lmaAutoTicket.js` | `getMoviePlayInfo` | `cinemaManage.js` | `getMoviePlayInfo` |
| `lmaAutoTicket.js` | `getSeatLayout` | `seatManage.js` | `getSeatLayout` |
| `lmaAutoTicket.js` | `lockSeatHandle` | `seatManage.js` | `lockseatByApp` |
| `lmaAutoTicket.js` | `oneClickBuyTicket` | `buyTicket.js` | `oneClickBuyTicket` |

### 4.2 关键改进点

1. **消除重复代码**
   - 删除了 `buyTicket.js` 中重复的 `lockSeatHandle`、`getCityCinemaList` 等方法
   - 统一使用模块化方法

2. **统一错误处理**
   - 所有模块使用统一的错误返回格式
   - 详细的日志记录

3. **参数传递优化**
   - 修复了所有 `transferOrder` 调用，传递正确的 `lmaToken` 参数
   - 统一了方法签名

4. **模块间解耦**
   - 每个模块职责单一，依赖关系清晰
   - 通过接口调用，降低耦合度

## 五、测试验证

### 5.1 功能验证

✅ **报价功能**
- 规则匹配正常
- 会员价获取正常（包括-5元券特殊逻辑）
- 价格计算正确

✅ **出票功能**
- 登录信息获取和排序正常
- 影院信息获取正常
- 座位选择和锁座正常
- 卡券使用正常
- 价格计算正常
- 订单购买正常
- 取票码上传正常

✅ **错误处理**
- 转单逻辑正常
- 错误信息记录完整
- 异常情况处理正确

### 5.2 代码质量

✅ **无TODO标记**：所有待实现方法已完成
✅ **无Linter错误**：所有文件通过Linter检查
✅ **方法完整性**：所有必需方法都已实现
✅ **功能一致性**：与原始代码逻辑保持一致

## 六、总结

### 6.1 重构成果

1. **代码结构优化**
   - 从2个大文件（3705行）拆分为6个模块文件
   - 每个模块职责清晰，平均代码行数约200-300行
   - 代码可读性和可维护性大幅提升

2. **代码复用提升**
   - 提取公共逻辑到基类（`BaseOfferPrice`、`BaseBuyTicket`）
   - 消除重复代码，减少代码冗余

3. **扩展性增强**
   - 新增功能只需修改对应模块
   - 模块间依赖关系清晰，易于扩展

4. **测试友好**
   - 每个模块可独立测试
   - Mock依赖模块，提高测试覆盖率

### 6.2 后续计划

1. **其他系列迁移**
   - SFC系列（5-7天）
   - UME系列（5-7天）
   - H5UME系列（3-5天）

2. **进一步优化**
   - 提取更多公共逻辑到基类
   - 统一接口规范
   - 完善文档和注释

3. **性能优化**
   - 检查性能瓶颈
   - 优化重复的API调用
   - 考虑缓存机制

## 七、参考文档

- [LMA模块说明文档](./LMA_README.md) - 文件职责、核心方法、报价/出票测试、会员价与支付价说明
- [测试验证清单](./TEST_VERIFICATION.md) - 测试场景与检查项
- [验证功能说明](./VALIDATION.md) - 订单验证功能使用说明
- [基类设计文档](../../../core/BaseOfferPrice.js) - 报价基类
- [基类设计文档](../../../core/BaseBuyTicket.js) - 出票基类
