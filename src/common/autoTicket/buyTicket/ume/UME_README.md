# UME 模块说明文档

本文档说明 ume 目录下各文件职责、核心方法、报价/出票测试方式，以及 UME 系列关键逻辑与特殊处理。

## 一、概述

UME 模块将原 `umeOffer.js`（报价）与 `umeAutoTicket.js`（出票）拆分为职责清晰的子模块，继承基类 `BaseOfferPrice`、`BaseBuyTicket`，统一错误处理与日志格式。

**目录结构**：

```text
src/common/autoTicket/buyTicket/ume/
├── offerManage.js      # 报价管理（继承 BaseOfferPrice）
├── buyTicket.js        # 出票主流程（继承 BaseBuyTicket）
├── cardQuanManage.js   # 卡券管理
├── cinemaManage.js     # 影院管理
├── seatManage.js       # 座位管理
├── orderManage.js      # 订单管理
└── UME_README.md       # 本文档
```

**入口**：

- 报价：`commonOfferHandle.js` 对 UME 系列使用 `ume/offerManage` 的 `getUmeOfferPrice`。
- 出票：`buyTicket/index.js` 通过 `STRATEGY_MAP.ume_applet` 使用 `UmeBuyTicket`。

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

// 方式二：直接使用 ume 模块（推荐用于控制台快速测试）
const offerPrice = window.umeOfferObj("mayi", "hsmzyc");
// 订单报价管理校验：
// window.umeOfferObj("mayi", "hsmzyc").validateOfferOrder(orderJson)
// 获取订单最终报价：
// window.umeOfferObj("mayi", "hsmzyc").getEndOfferPrice({ order: orderJson, offerList: [] })
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
import UmeBuyTicket from "@/common/autoTicket/buyTicket/ume/buyTicket.js";
import Logger from "@/common/logger.js";

const logger = new Logger({ logType: 3 });
const buyTicket = new UmeBuyTicket(orderJson, logger, isTestOrder);

// 或使用全局方法（控制台快速测试）
const buyTicket = window.umeTicketObj(orderJson, true);
// 订单出票管理相关方法组装校验：
// window.umeTicketObj(order, true).validateTicketOrder()
// 订单一键出票测试：
// window.umeTicketObj(order, true).singleTicket()
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

## 四、UME 特殊逻辑摘要

### 4.1 wanxiangh5 特殊处理

- **触发条件**：当报价规则匹配结果中包含 `shadowLineName === "wanxiangh5"` 的规则时，`getEndMatchOfferRule()` 返回字符串 `"wanxiangh5"`。
- **处理方式**：在 `getEndOfferPrice()` 中检测到 `offerRule === "wanxiangh5"` 时，会调用旧的 `umeOffer.js` 中的报价逻辑进行处理，确保兼容性。
- **返回结果**：返回结果中包含 `app_name: "wanxiangh5"` 标识。

### 4.2 灵活用券机制（autoUseQuanStatus）

- **触发条件**：报价规则中 `autoUseQuanStatus === "1"` 且 `supplier_end_price > autoUseQuanPrice` 时生效。
- **处理逻辑**：在 `cardQuanManage.useQuanOrCard()` 中，如果满足灵活用券条件，会将报价规则中的 `quan_value` 重置为 `auto_quan_value`，优先使用灵活用券类型。
- **优先级**：灵活用券优先级高于会员卡，当满足条件时会跳过会员卡直接使用灵活用券。

### 4.3 会员日报价规则

- **规则筛选**：在 `getEndMatchOfferRule()` 中，会优先筛选出 `memberDay` 为真且 `offerType === "3"` 的规则。
- **排序逻辑**：会员日报价规则按 `offerAmount` 从小到大排序，优先使用金额最小的规则。
- **匹配策略**：如果存在会员日报价规则，优先使用会员日规则；否则使用普通报价规则。

### 4.4 Yaolai（要来看）特殊处理

- **订单创建**：在 `orderManage.createOrder()` 中，当 `appFlag === "yaolai"` 时，订单参数中会额外包含 `digitalCode: ""` 和 `isManual: "N"` 字段。
- **观影人管理**：`orderManage` 中包含 `findStoreMemberMoviegoersByMemberId()` 和 `updateStoreOrderMoviegoers()` 方法，用于管理 Yaolai 观影人信息。
- **绑券逻辑**：Yaolai 的绑券逻辑与其他 UME 应用不同，在 `buyTicket.js` 中有特殊判断和处理。

### 4.5 座位区域价格处理

- **价格获取**：在 `offerManage.getMostSeatPrice()` 中，根据座位区域获取价格信息。
- **价格计算**：支持按座位区域计算价格，用于成本价和最终报价的计算。

### 4.6 动态调价与超限检查

- **动态调价**：支持通过 `offerList` 参数进行动态调价，在 `calculateFinalPrice()` 中处理。
- **超限检查**：在 `getEndMatchOfferRule()` 中，会检查报价规则是否超过供应商最大价格限制。
- **夜间价格上限**：支持夜间场次价格上限控制，在报价计算中会考虑时间因素。

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
├── UmeCardQuanManage (卡券管理)
├── UmeCinemaManage (影院管理)
└── UmeSeatManage (座位管理)

buyTicket.js
├── BaseBuyTicket (基类)
├── UmeCardQuanManage (卡券管理)
├── UmeCinemaManage (影院管理)
├── UmeSeatManage (座位管理)
└── UmeOrderManage (订单管理)

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

1. **循环依赖处理**：`offerManage.js` 中对于 `wanxiangh5` 特殊处理，直接导入旧的 `umeOffer.js`，避免与 `commonOfferHandle.js` 形成循环依赖。

2. **返回值格式统一**：`cinemaManage.js` 中的 `getCityCinemaList()`、`getMoviePlayInfo()`、`getMoviePlayTime()` 方法统一返回对象格式 `{ listName: actualList, error?: ... }`，调用方需要正确处理。

3. **座位布局参数**：在报价阶段调用 `seatManage.getSeatLayout()` 时，`session_id` 可能为空，需要在调用时传入空字符串。

4. **测试模式**：出票测试模式下（`isTestOrder === true`），会执行到锁座和价格计算，但不会实际购买和上传取票码，便于调试和验证。

5. **错误处理**：所有模块均使用统一的 `Logger` 进行日志记录，错误信息通过 `formatErrInfo` 格式化后保存。

---

## 七、扩展说明

更多实现细节可参考各模块文件中的 JSDoc 注释，测试清单可参考其他模块（如 SFC）的测试文档结构进行补充。
