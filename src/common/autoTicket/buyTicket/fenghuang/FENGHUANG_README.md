# 凤凰模块说明文档

本文档说明 fenghuang 目录下各文件职责、核心方法、报价/出票测试方式，以及凤凰系列关键逻辑与特殊处理。

## 一、概述

凤凰模块将原报价与出票逻辑拆分为职责清晰的子模块，继承基类 `BaseOfferPrice`、`BaseBuyTicket`，统一错误处理与日志格式。

**目录结构**：

```
src/common/autoTicket/buyTicket/fenghuang/
├── offerManage.js      # 报价管理（继承 BaseOfferPrice）
├── buyTicket.js        # 出票主流程（继承 BaseBuyTicket）
├── cardQuanManage.js   # 卡券管理
├── cinemaManage.js     # 影院管理
├── seatManage.js       # 座位管理
└── orderManage.js      # 订单管理
```

**入口**：

- 报价：`commonOfferHandle.js` 对凤凰系列使用 `fenghuang/offerManage` 的 `getFenghuangOfferPrice`。
- 出票：`buyTicket/index.js` 通过 `STRATEGY_MAP.fenghuang_applet` 使用 `FenghuangBuyTicket`。

---

## 二、文件职责与核心方法

| 文件                  | 职责         | 核心方法                                                                                                                               |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **offerManage.js**    | 报价逻辑管理 | `getEndOfferPrice()`, `getEndMatchOfferRule()`, `getCostPrice()`, `calculateFinalPrice()`, `getMemberPrice()`, `getSeatPriceByTicket()`, `validateOfferOrder()` |
| **buyTicket.js**      | 出票流程编排 | `singleTicket()`, `oneClickBuyTicket()`, `getCinemaLoginInfo()`, `getOrderOfferRule()`, `checkOfferRuleRes()`, `transferOrChangePhone()` |
| **cardQuanManage.js** | 卡券管理     | `getQuanInfo()`, `getQuanListByPhone()`, `useQuanOrCard()`, `getUsableCardList()`, `getSeatPrice()`, `getSortPhoneByQuanTypeList()`, `syncUpdateQuanStock()`, `updateQuanStock()` |
| **cinemaManage.js**   | 影院与场次   | `getCityCinemaList()`, `getBuyPrevCinemaInfo()`, `getMoviePlayInfo()`, `getMoviePlayTime()`, `getTargetShow()`, `getTargetMovie()`, `cinemaLinkCardHandle()` |
| **seatManage.js**     | 座位         | `getSeatLayout()`, `getTargetSeat()`, `lockSeatHandle()`, `lockseatByApp()`, `retryLockSeat()`, `assistLockSeat()`                    |
| **orderManage.js**    | 订单与支付   | `pripriceCalculation()`, `createOrder()`, `getOrderInfoByOrderList()`, `getQrcodeUploadByPlat()`, `getPayResult()`, `asyncFetchQrcodeSubmit()`, `transferOrder()`, `releaseSeat()`, `cancelOrder()` |

---

## 三、报价测试与出票测试

### 3.1 报价测试

**获取实例**：

```javascript
// 方式一：通过 commonOfferHandle
import getOfferPriceFun from "@/common/autoOffer/commonOfferHandle";
const offerPrice = getOfferPriceFun({
  appFlag: "umexin",
  plat_name: "mayi"
});

// 方式二：直接使用 fenghuang 模块（推荐用于控制台快速测试）
const offerPrice = window.fenghuangOfferObj("mayi", "umexin");
// 订单报价管理校验：
// window.fenghuangOfferObj("mayi", "umexin").validateOfferOrder(orderJson)
// 获取订单最终报价：
// window.fenghuangOfferObj("mayi", "umexin").getEndOfferPrice({ order: orderJson, offerList: [] })
```

**正式报价**：

```javascript
const res = await offerPrice.getEndOfferPrice({
  order: orderJson,
  offerList: [] // 可选，动态调价用
});
// 成功：{ endPrice, offerRule, order_number, err_msg, err_info }
// 失败：{ err_msg, err_info, endPrice: null, offerRule }
```

**校验不报价**：

```javascript
const result = await offerPrice.validateOfferOrder(orderJson);
// { valid, errMsg, steps, offerRule?, movieInfo?, memberPriceRes?, costPrice? }
```

**待报价订单必填字段**：`plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `cinemaLinkId`, `film_name`, `hall_name`, `show_time`, `ticket_num`, `supplier_max_price`。

### 3.2 出票测试

**获取实例**：

```javascript
import FenghuangBuyTicket from "@/common/autoTicket/buyTicket/fenghuang/buyTicket.js";
import Logger from "@/common/logger.js";

const logger = new Logger({ logType: 3 });
const buyTicket = new FenghuangBuyTicket(orderJson, logger, isTestOrder);
```

**正式出票**：

```javascript
const res = await buyTicket.singleTicket();
// 成功：{ profit, qrcode, submitRes, quan_code, card_id, cardNum, offerRule, mobile }
// 失败：undefined 或 { offerRule, transferParams }
```

**测试模式（不购买）**：`isTestOrder === true` 时，会执行到锁座、价格计算后：
- 打印完整的创建订单参数（包含订单信息、价格、卡券信息、支付信息等）
- **不创建订单**（因为创建订单时已经支付）
- 调用 `releaseSeat()` 释放座位
- 不调用购买、上传取票码接口
- 返回 `{ offerRule }`

**待出票订单必填字段**：`order_number`, `plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `cinemaLinkId`, `film_name`, `hall_name`, `show_time`, `lockseat`, `ticket_num`, `supplier_end_price`。

---

## 四、凤凰特殊逻辑摘要

### 4.1 创建订单即支付机制

凤凰系列的特殊机制：**创建订单时已经完成支付**，这与辰星等其他系列不同：

- **流程差异**：
  - 其他系列：锁座 → 创建订单 → 购买 → 获取取票码
  - 凤凰系列：锁座 → 创建订单（已支付）→ 获取取票码
- **测试模式处理**：
  - 测试模式下不创建订单（因为创建订单时已经支付）
  - 只打印创建订单参数并释放座位
- **订单号获取**：
  - 如果 `createOrder` 返回 `orderId`，直接使用
  - 如果没有，延迟 3 秒后从订单列表获取（`getOrderInfoByOrderList`）

### 4.2 payToken 和 member_pwd 处理

凤凰系列需要会员密码和支付令牌：

- **member_pwd**：登录信息必须包含 `member_pwd`（会员密码）
- **payToken**：通过 `window.getPayToken(member_pwd)` 生成支付令牌
- **使用场景**：在创建订单时，`payments` 参数中需要包含 `payToken`
- **导入方式**：`import "@/utils/fenghuang-payToken"` 引入 `getPayToken` 方法

```javascript
// 获取当前会员密码
this.currentMemberPwd = this.currentParamsList[this.currentParamsInx]?.member_pwd || "";

// 生成支付令牌
payToken: window.getPayToken(this.currentMemberPwd)
```

### 4.3 测试模式处理

测试模式下（`isTestOrder === true`）的特殊处理：

- **报价阶段**：正常执行报价流程，测试订单会获取会员价用于调试
- **出票阶段**：
  1. 执行到锁座、价格计算
  2. 打印完整的创建订单参数（包含订单信息、价格、卡券信息、支付信息等）
  3. **不创建订单**（因为创建订单时已经支付）
  4. 调用 `releaseSeat()` 释放座位
  5. 不调用购买、上传取票码接口
  6. 返回 `{ offerRule }`

### 4.4 会员价获取（按票数获取座位价格）

凤凰系列采用按票数获取座位总价的方式计算会员价：

- **流程**：
  1. 从座位布局获取 `areaInfoList`（区域价格列表）和 `seatData`（座位数据）
  2. 按价格从高到低排序区域列表
  3. 如果 `memberPriceRule == "2"`，则按座位占比从高到低排序
  4. 调用 `getSeatPriceByTicket()` 按票数获取对应座位
  5. 调用 `getSeatPrice()` 获取这些座位的总价格
  6. 总价格除以票数得到单张票的会员价
- **优势**：更准确地反映实际支付价格，因为不同座位可能有不同价格

### 4.5 异步更新券库存

报价时会异步更新券库存，提升后续报价的准确性：

- **触发时机**：在 `validateQuanStock()` 方法中，校验固定报价规则的券库存时
- **更新逻辑**：
  1. 获取所有券类型列表（`getQuanTypeListByApp()`）
  2. 异步调用 `syncUpdateQuanStock()` 更新券库存
  3. 更新过程包括：获取每个手机号的券列表、按券类型分类、更新库存信息
- **日志打印**：
  - 每个手机号获取的总券数及券列表详情
  - 每个券类型分类后的数量及匹配详情
  - 最终要更新的券类型汇总信息（包含每个手机号的库存信息）
  - 单个更新前后的详细信息

### 4.6 座位锁定机制

支持多种锁座策略：

- **主锁座**：`lockseatByApp()` 直接调用锁座接口
- **重试锁座**：`retryLockSeat()` 在锁座失败时重试
- **辅助锁座**：`assistLockSeat()` 当遇到特定错误（如"座位旁边不要留空"）时触发
- **锁座参数**：使用 `cinemaLinkId`、`scheduleId`、`scheduleKey` 等参数

### 4.7 价格计算与订单创建

- **价格计算**：`pripriceCalculation()` 支持用券计算价格（`priceCalculationByQuan`）
- **订单创建**：`createOrder()` 包含支付信息，创建即支付
- **订单号获取**：支持从订单列表获取订单号（`getOrderInfoByOrderList`）
- **超时处理**：创建订单超时时，会标记 `isTimeout: true`，延迟后从订单列表获取

### 4.8 取票码获取机制

支持同步和异步两种方式获取取票码：

- **同步获取**：`getPayResult()` 直接查询订单详情获取取票码
- **异步轮询**：`asyncFetchQrcodeSubmit()` 异步轮询获取取票码
  - 第一轮：每 20 秒查一次，查 9 次，共 3 分钟
  - 第二轮：如果第一轮失败，每 20 秒查一次，查 21 次，共 7 分钟
- **订单列表兜底**：如果 `orderId` 不存在，从订单列表匹配目标订单

### 4.9 延迟初始化机制

`cinemaManage` 和 `cardQuanManage` 采用延迟初始化策略：

- **原因**：这两个模块需要 `offerRule` 和 `currentParamsList`，而这些信息在 `getOrderOfferRule()` 之后才可用
- **时机**：在 `oneClickBuyTicket()` 方法中首次调用时初始化
- **实现**：在 `buyTicket.js` 的 `oneClickBuyTicket()` 方法中检查并初始化

```javascript
// 延迟初始化 cardQuanManage 和 cinemaManage（首次调用时）
if (!this.cardQuanManage) {
  this.cardQuanManage = new CardQuanManage(this.order, this.logger);
  this.cinemaManage = new CinemaManage(
    this.order,
    this.logger,
    this.offerRule,
    this.currentParamsList
  );
}
```

### 4.10 登录信息要求

凤凰系列要求登录信息必须包含 `member_pwd`（会员密码）：

```javascript
this.currentParamsList = getCinemaLoginInfoList().filter(
  item =>
    item.app_name === this.appFlag &&
    item.mobile &&
    item.session_id &&
    item.member_pwd  // 必须要有会员密码
);
```

### 4.11 城市影院列表获取

`getCityCinemaList()` 方法包含重试机制：

- **重试策略**：最大重试 3 次，每次间隔 1 秒
- **数据校验**：检查 `res.cityCinemas` 是否存在且有数据
- **数据处理**：对 `item.cinemas` 进行安全处理，使用 `(item.cinemas || [])` 避免空值错误
- **错误处理**：`catch` 块中也包含重试逻辑，确保异常情况下也能重试

---

## 五、模块依赖关系

```
offerManage.js
├── BaseOfferPrice (基类)
├── CardQuanManage (卡券管理)
├── CinemaManage (影院管理)
└── SeatManage (座位管理)

buyTicket.js
├── BaseBuyTicket (基类)
├── CardQuanManage (卡券管理，延迟初始化)
├── CinemaManage (影院管理，延迟初始化)
├── SeatManage (座位管理)
├── OrderManage (订单管理)
└── PlatManage (平台管理)

cardQuanManage.js
└── (独立模块，无内部依赖)

cinemaManage.js
└── (独立模块，无内部依赖)

seatManage.js
└── (独立模块，无内部依赖)

orderManage.js
└── (独立模块，无内部依赖)
```

---

## 六、注意事项

1. **创建订单即支付**：凤凰系列创建订单时已经完成支付，测试模式下不创建订单，只释放座位。

2. **payToken 生成**：需要引入 `@/utils/fenghuang-payToken` 模块，使用 `window.getPayToken(member_pwd)` 生成支付令牌。

3. **延迟初始化**：`cinemaManage` 和 `cardQuanManage` 在 `oneClickBuyTicket()` 时才初始化，报价阶段使用 `undefined` 参数初始化。

4. **会员密码**：登录信息必须包含 `member_pwd`，否则无法正常出票和生成支付令牌。

5. **测试模式**：出票测试模式下会打印创建订单参数并释放座位，不创建订单（因为创建订单时已经支付）。

6. **错误处理**：所有模块均使用统一的 `Logger` 进行日志记录，错误信息通过 `formatErrInfo` 格式化后保存。

7. **异步更新券库存**：报价时会异步更新券库存，更新过程有详细的日志打印，包括每个手机号的券总数、分类后的数量、更新前后的详细信息。

8. **订单号获取**：如果创建订单时没有立即返回 `orderId`，会延迟 3 秒后从订单列表获取。

9. **取票码获取**：支持同步和异步两种方式，异步方式会进行多轮轮询，确保能够获取到取票码。

---

## 七、扩展说明

更多实现细节可参考各模块文件中的 JSDoc 注释，测试清单可参考其他模块（如 SFC）的测试文档结构进行补充。
