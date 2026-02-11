# 辰星模块说明文档

本文档说明 chenxing 目录下各文件职责、核心方法、报价/出票测试方式，以及辰星系列关键逻辑与特殊处理。

## 一、概述

辰星模块将原报价与出票逻辑拆分为职责清晰的子模块，继承基类 `BaseOfferPrice`、`BaseBuyTicket`，统一错误处理与日志格式。

**目录结构**：

```
src/common/autoTicket/buyTicket/chenxing/
├── offerManage.js      # 报价管理（继承 BaseOfferPrice）
├── buyTicket.js        # 出票主流程（继承 BaseBuyTicket）
├── cardQuanManage.js   # 卡券管理
├── cinemaManage.js     # 影院管理
├── seatManage.js       # 座位管理
└── orderManage.js      # 订单管理
```

**入口**：

- 报价：`commonOfferHandle.js` 对辰星系列使用 `chenxing/offerManage` 的 `getChenxingOfferPrice`。
- 出票：`buyTicket/index.js` 通过 `STRATEGY_MAP.chenxing_applet` 使用 `ChenxingBuyTicket`。

---

## 二、文件职责与核心方法

| 文件                  | 职责         | 核心方法                                                                                                                                                        |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **offerManage.js**    | 报价逻辑管理 | `getEndOfferPrice()`, `getEndMatchOfferRule()`, `getCostPrice()`, `calculateFinalPrice()`, `getMemberPrice()`, `validateOfferOrder()`                           |
| **buyTicket.js**      | 出票流程编排 | `singleTicket()`, `oneClickBuyTicket()`, `getCinemaLoginInfo()`, `getOrderOfferRule()`, `checkOfferRuleRes()`, `transferOrChangePhone()`                        |
| **cardQuanManage.js** | 卡券管理     | `getQuanInfo()`, `getQuanListByPhone()`, `useQuanOrCard()`, `getUsableCardList()`, `getSortPhoneByQuanTypeList()`, `syncUpdateQuanStock()`, `updateQuanStock()` |
| **cinemaManage.js**   | 影院与场次   | `getCityCinemaList()`, `getBuyPrevCinemaInfo()`, `getMoviePlayInfo()`, `getTargetShow()`, `getTargetMovie()`, `cinemaLinkCardHandle()`                          |
| **seatManage.js**     | 座位         | `getSeatLayout()`, `getTargetSeat()`, `lockSeatHandle()`, `lockseatByApp()`, `retryLockSeat()`, `assistLockSeat()`                                              |
| **orderManage.js**    | 订单与支付   | `pripriceCalculation()`, `createOrder()`, `buyTicket()`, `getQrcodeUploadByPlat()`, `transferOrder()`, `releaseSeat()`, `cancelOrder()`                         |

---

## 三、报价测试与出票测试

### 3.1 报价测试

**获取实例**：

```javascript
// 方式一：通过 commonOfferHandle
import getOfferPriceFun from "@/common/autoOffer/commonOfferHandle";
const offerPrice = getOfferPriceFun({
  appFlag: "xingfulanhai",
  plat_name: "mayi"
});

// 方式二：直接使用 chenxing 模块（推荐用于控制台快速测试）
const offerPrice = window.chenxingOfferObj("mayi", "xingfulanhai");
// 订单报价管理校验：
// window.chenxingOfferObj("mayi", "xingfulanhai").validateOfferOrder(orderJson)
// 获取订单最终报价：
// window.chenxingOfferObj("mayi", "xingfulanhai").getEndOfferPrice({ order: orderJson, offerList: [] })
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

**待报价订单必填字段**：`plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `film_name`, `hall_name`, `show_time`, `ticket_num`, `supplier_max_price`。

### 3.2 出票测试

**获取实例**：

```javascript
import ChenxingBuyTicket from "@/common/autoTicket/buyTicket/chenxing/buyTicket.js";
import Logger from "@/common/logger.js";

const logger = new Logger({ logType: 3 });
const buyTicket = new ChenxingBuyTicket(orderJson, logger, isTestOrder);
```

**正式出票**：

```javascript
const res = await buyTicket.singleTicket();
// 成功：{ profit, qrcode, submitRes, quan_code, card_id, cardNum, offerRule, mobile }
// 失败：undefined 或 { offerRule, transferParams }
```

**测试模式（不购买）**：`isTestOrder === true` 时，会执行到锁座、价格计算后：

- 打印完整的购买参数（包含订单信息、价格、卡券信息等）
- 如果有 `order_num`，调用 `cancelOrder()` 取消订单释放座位
- 如果没有 `order_num`，调用 `releaseSeat()` 释放座位
- 不调用购买、上传取票码接口

**待出票订单必填字段**：`order_number`, `plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `film_name`, `hall_name`, `show_time`, `lockseat`, `ticket_num`, `supplier_end_price`。

---

## 四、辰星特殊逻辑摘要

### 4.1 API 版本区分（3.0C vs C）

辰星系列支持两个 API 版本，影响多个模块的数据处理逻辑：

- **3.0C 版本**：

  - 城市影院列表：从 `res.data` 获取，字段为 `cityInfoDTO.cityName`、`cinemaResultDTOList`
  - 座位布局：需要 `featureAppNo` 参数
  - 会员价获取：从 `discountList` 获取优惠活动价格，优先取有卡优惠活动最低价
  - 卡券使用：必须要有卡，`defaultCardNo` 参数
  - 价格计算：`ticketCouponCode` 参数格式不同

- **C 版本**：
  - 城市影院列表：从 `res.data.resultDOList` 获取，字段为 `cityInfo.chName`、`cinemas`
  - 座位布局：需要 `sessionId` 参数
  - 会员价获取：从 `areaInfoList` 获取区域价格，取最高价
  - 卡券使用：支持无卡场景
  - 价格计算：`activityKey` 参数格式不同

### 4.2 延迟初始化机制

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

### 4.3 测试模式处理

测试模式下（`isTestOrder === true`）的特殊处理：

- **报价阶段**：正常执行报价流程，测试订单会获取会员价用于调试
- **出票阶段**：
  1. 执行到锁座、价格计算
  2. 打印完整的购买参数（包含订单信息、价格、卡券信息等）
  3. 如果有 `order_num`，调用 `cancelOrder()` 取消订单释放座位
  4. 如果没有 `order_num`，调用 `releaseSeat()` 释放座位
  5. 不调用购买、上传取票码接口
  6. 返回 `{ offerRule }`

### 4.4 会员价获取逻辑（版本差异）

会员价获取根据 API 版本采用不同策略：

- **3.0C 版本**：

  1. 从座位布局获取 `discountList`（优惠活动列表）和 `cinemaPlanDto`（影院计划信息）
  2. 优先从有卡优惠活动（`cardLevelCode` 存在）中取最低价：`price - cinemaPayAmount + serviceAddFee`
  3. 如果没有有卡优惠，从无卡优惠活动中取最低价：`price - cinemaPayAmount`
  4. 如果都没有，使用 `cinemaPlanDto.standardPrice`
  5. 加上 `serviceAddFee`（会员服务费）

- **C 版本**：
  1. 从座位布局获取 `areaInfoList`（区域价格列表）
  2. 取最高价：`areaInfoList` 中 `areaPrice` 的最大值
  3. 如果 `memberPriceRule == "2"`，则按最多座位价格计算（根据座位占比）

### 4.5 异步更新券库存

报价时会异步更新券库存，提升后续报价的准确性：

- **触发时机**：在 `validateQuanStock()` 方法中，校验固定报价规则的券库存时
- **更新逻辑**：
  1. 获取所有券类型列表（`getQuanTypeListByApp()`）
  2. 异步调用 `syncUpdateQuanStock()` 更新券库存
  3. 更新过程包括：获取每个手机号的券列表、按券类型分类、更新库存信息
- **日志打印**：
  - 每个手机号获取的总券数
  - 每个券类型分类后的数量
  - 最终要更新的券类型汇总信息
  - 单个更新前后的详细信息

### 4.6 座位锁定机制

支持多种锁座策略：

- **主锁座**：`lockseatByApp()` 直接调用锁座接口
- **重试锁座**：`retryLockSeat()` 在锁座失败时重试
- **辅助锁座**：`assistLockSeat()` 当遇到特定错误（如"座位旁边不要留空"）时触发
- **锁座参数**：根据 API 版本使用不同的参数格式（3.0C 使用 `featureAppNo`，C 使用 `sessionId`）

### 4.7 价格计算特殊处理

- **多券计算**：当使用多个券时，需要逐个调用 `specialCalcPrice()` 进行价格计算
- **试算与正式计算**：支持 `isTrial` 参数区分试算和正式计算
- **会员价调整**：支付金额与会员价差异时的利润调整逻辑

### 4.8 登录信息要求

辰星系列要求登录信息必须包含 `member_pwd`（会员密码）：

```javascript
this.currentParamsList = getCinemaLoginInfoList().filter(
  item =>
    item.app_name === this.appFlag &&
    item.mobile &&
    item.session_id &&
    item.member_pwd // 必须要有会员密码
);
```

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

1. **API 版本判断**：多个模块中需要根据 `api_version` 进行条件判断，确保正确处理不同版本的数据格式。

2. **延迟初始化**：`cinemaManage` 和 `cardQuanManage` 在 `oneClickBuyTicket()` 时才初始化，报价阶段使用 `undefined` 参数初始化。

3. **会员密码**：登录信息必须包含 `member_pwd`，否则无法正常出票。

4. **测试模式**：出票测试模式下会打印购买参数并取消订单或释放座位，便于调试和验证。

5. **错误处理**：所有模块均使用统一的 `Logger` 进行日志记录，错误信息通过 `formatErrInfo` 格式化后保存。

6. **异步更新券库存**：报价时会异步更新券库存，更新过程有详细的日志打印，便于追踪更新状态。

---

## 七、扩展说明

更多实现细节可参考各模块文件中的 JSDoc 注释，测试清单可参考其他模块（如 SFC）的测试文档结构进行补充。
