# H5UME 模块说明文档

本文档说明 h5ume 目录下各文件职责、核心方法、报价/出票测试方式，以及 H5UME 系列关键逻辑与特殊处理。

## 一、概述

H5UME 模块将原 `h5umeOffer.js`（报价）与 `h5umeAutoTicket.js`（出票）拆分为职责清晰的子模块，继承基类 `BaseOfferPrice`、`BaseBuyTicket`，统一错误处理与日志格式。

**目录结构**：

```text
src/common/autoTicket/buyTicket/h5ume/
├── offerManage.js      # 报价管理（继承 BaseOfferPrice）
├── buyTicket.js        # 出票主流程（继承 BaseBuyTicket）
├── cardQuanManage.js   # 卡券管理
├── cinemaManage.js     # 影院管理
├── seatManage.js       # 座位管理
├── orderManage.js      # 订单管理
└── H5UME_README.md     # 本文档
```

**入口**：

- 报价：`commonOfferHandle.js` 对 H5UME 系列使用 `h5ume/offerManage` 的 `getH5UmeOfferPrice`。
- 出票：`buyTicket/index.js` 通过 `STRATEGY_MAP.ume_h5` 使用 `H5UmeBuyTicket`。

---

## 二、文件职责与核心方法

| 文件                  | 职责         | 核心方法                                                                                                                                    |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **offerManage.js**    | 报价逻辑管理 | `getEndOfferPrice()`, `getEndMatchOfferRule()`, `getCostPrice()`, `calculateFinalPrice()`, `getMemberPrice()`, `validateOfferOrder()`    |
| **buyTicket.js**      | 出票流程编排 | `singleTicket()`, `oneClickBuyTicket()`, `getCinemaLoginInfo()`, `getOrderOfferRule()`, `checkOfferRuleRes()`, `validateTicketOrder()`    |
| **cardQuanManage.js** | 卡券管理     | `getQuanInfo()`, `getQuanListByPhone()`, `useQuanOrCard()`, `getUsableCardList()`, `getSortedPhones()`, `updateQuanStock()`                |
| **cinemaManage.js**   | 影院与场次   | `getCityCinemaList()`, `getBuyPrevCinemaInfo()`, `getMoviePlayInfo()`, `getMoviePlayDate()`, `getMoviePlayTime()`                          |
| **seatManage.js**     | 座位         | `getSeatLayout()`, `getTargetSeat()`, `lockSeatHandle()`                                                                                    |
| **orderManage.js**    | 订单与支付   | `getOptimalCardQuanCompose()`, `createOrder()`, `buyTicket()`, `getPayResult()`, `lastHandle()`, `transferOrder()`, `cancelOrder()`        |

---

## 三、报价测试与出票测试

### 3.1 报价测试

**获取实例**：

```javascript
// 方式一：通过 commonOfferHandle
import getOfferPriceFun from "@/common/autoOffer/commonOfferHandle";
const offerPrice = getOfferPriceFun({
  appFlag: "hsmzyc",
  plat_name: "mayi"
});

// 方式二：直接使用 h5ume 模块（推荐用于控制台快速测试）
const offerPrice = window.h5UmeOfferObj("mayi", "hsmzyc");
// 订单报价管理校验：
// window.h5UmeOfferObj("mayi", "hsmzyc").validateOfferOrder(orderJson)
// 获取订单最终报价：
// window.h5UmeOfferObj("mayi", "hsmzyc").getEndOfferPrice({ order: orderJson, offerList: [] })
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
import H5UmeBuyTicket from "@/common/autoTicket/buyTicket/h5ume/buyTicket.js";
import Logger from "@/common/logger.js";

const logger = new Logger({ logType: 3 });
const buyTicket = new H5UmeBuyTicket(orderJson, logger, isTestOrder);

// 或使用全局方法（控制台快速测试）
const buyTicket = window.h5UmeTicketObj(orderJson, true);
// 订单出票管理相关方法组装校验：
// window.h5UmeTicketObj(order, true).validateTicketOrder()
// 订单一键出票测试：
// window.h5UmeTicketObj(order, true).singleTicket()
```

**正式出票**：

```javascript
const res = await buyTicket.singleTicket();
// 成功：{ profit, qrcode, submitRes, quan_code, card_id, cardNum, offerRule }
// 失败：undefined 或 { offerRule, transferParams }
```

**测试模式（不购买）**：`isTestOrder === true` 时，会执行到锁座、创建订单、价格计算后：
- 打印完整的购买参数（包含订单信息、价格、卡券信息等）
- 如果有 `orderHeaderId`，调用 `cancelOrder()` 取消订单释放座位
- 如果没有 `orderHeaderId`，记录警告日志
- 不调用购买、上传取票码接口

**校验不锁座/不购买**：

```javascript
const result = await buyTicket.validateTicketOrder();
// { valid, errMsg, steps, cardInfo?, quanInfo? }
```

**待出票订单必填字段**：`order_number`, `plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `film_name`, `hall_name`, `show_time`, `lockseat`, `ticket_num`, `supplier_end_price`。

---

## 四、H5UME 特殊逻辑摘要

### 4.1 会员价计算逻辑

- **价格计算**：在 `offerManage.getMemberPrice()` 中，使用 `divDecimal` 进行精确的除法计算，避免浮点数精度问题。
- **会员总价计算**：`member_total_price = Math.max(displayPrice * ticket_num, maxSeatPrice) / 100`，取会员价总价和座位最高价中的较大值。
- **成本价计算**：`member_cost_price = (member_total_price * 100 * discount) / 10000 / ticket_num`，根据卡折扣计算会员成本价。

### 4.2 单店加价机制（profitAddPrice）

- **触发条件**：报价类型不是用券（`offerType !== "1"`）且不在 `GROUP_LIST` 中的影院。
- **处理逻辑**：从 `localStorage.getItem("profitAddPrice")` 获取单店加价金额，加到基础报价上。
- **应用场景**：用于特定影院的报价调整。

### 4.3 夜间顶价控制

- **触发条件**：`localStorage.getItem("isOpenisNightMaxPrice") == 1` 且当前时间在 1:00-6:00 之间。
- **处理逻辑**：在 `calculateFinalPrice()` 中，如果开启夜间顶价，直接将报价设置为平台最高限价。
- **目的**：控制夜间场次的报价上限。

### 4.4 超限报价处理

- **超限检测**：在 `calculateFinalPrice()` 中，如果最终报价超过平台限价，会检查 `localStorage.getItem("isOverrunOffer")`。
- **处理方式**：
  - 如果超限报价关闭（`isOverrunOffer !== "1"`），直接返回 `null`，不进行报价。
  - 如果超限报价开启，将报价调整为平台限价：
    - 蚂蚁平台：向下取整 `Math.floor(supplier_max_price)`
    - 其他平台：向下取 0.5 或 0.1 的倍数（根据平台配置）

### 4.5 特殊券处理

- **特殊券识别**：在 `buyTicket.js` 中，有特殊券的处理逻辑。
- **处理方式**：根据券的类型和规则进行特殊处理。

### 4.6 动态调价与超限检查

- **动态调价**：支持通过 `offerList` 参数进行动态调价，在 `calculateFinalPrice()` 中处理。
- **超限检查**：在 `getEndMatchOfferRule()` 中，会检查报价规则是否超过供应商最大价格限制。

### 4.7 登录信息排序

- **排序策略**：在 `buyTicket.getCinemaLoginInfo()` 中，根据多个优先级对登录信息进行排序：
  - `first="1"` 的登录信息优先
  - 当前用户手机号对应的登录信息优先
  - 有可用卡券的登录信息优先
- **换号出票**：支持在出票失败时切换到其他登录账号重试。

### 4.8 订单创建超时重试

- **超时检测**：在 `orderManage.createOrder()` 中，检测到接口返回超时错误时，会延迟 1 秒后重试。
- **重试机制**：通过 `isTimeoutRetry` 参数控制重试次数，避免无限重试。

### 4.9 异步取票码获取

- **轮询机制**：在 `orderManage.asyncFetchQrcodeSubmit()` 中，支持异步获取取票码，通过轮询方式等待取票码生成。
- **超时处理**：设置合理的轮询超时时间，避免长时间等待。

### 4.10 卡券使用限制

- **用卡限制**：在 `cardQuanManage.useCardHandle()` 中，检查会员卡的日/月使用限制。
- **用券限制**：在 `cardQuanManage.useQuanOrCard()` 中，检查优惠券的库存和黑名单限制。
- **已用券过滤**：在 `cardQuanManage.queryUsedQuanList()` 中，查询并过滤已使用的优惠券。

---

## 五、模块依赖关系

```text
offerManage.js
├── BaseOfferPrice (基类)
├── H5UmeCardQuanManage (卡券管理)
├── H5UmeCinemaManage (影院管理)
└── H5UmeSeatManage (座位管理)

buyTicket.js
├── BaseBuyTicket (基类)
├── H5UmeCardQuanManage (卡券管理)
├── H5UmeCinemaManage (影院管理)
├── H5UmeSeatManage (座位管理)
└── H5UmeOrderManage (订单管理)

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

1. **返回值格式统一**：`cinemaManage.js` 中的 `getCityCinemaList()`、`getMoviePlayInfo()`、`getMoviePlayTime()` 方法统一返回对象格式 `{ listName: actualList, error?: ... }`，调用方需要正确处理。

2. **座位布局参数**：在报价阶段调用 `seatManage.getSeatLayout()` 时，`session_id` 可能为空，需要在调用时传入空字符串。

3. **测试模式**：出票测试模式下（`isTestOrder === true`），会执行到锁座和价格计算，但不会实际购买和上传取票码，便于调试和验证。

4. **错误处理**：所有模块均使用统一的 `Logger` 进行日志记录，错误信息通过 `formatErrInfo` 格式化后保存。

5. **价格计算精度**：H5UME 使用 `divDecimal` 进行除法计算，确保价格计算的精度，避免浮点数误差。

6. **localStorage 配置**：部分功能依赖 `localStorage` 中的配置项：
   - `profitAddPrice`：单店加价金额
   - `isOpenisNightMaxPrice`：是否开启夜间顶价
   - `isOverrunOffer`：是否开启超限报价

---

## 七、扩展说明

更多实现细节可参考各模块文件中的 JSDoc 注释，测试清单可参考其他模块（如 UME、SFC）的测试文档结构进行补充。
