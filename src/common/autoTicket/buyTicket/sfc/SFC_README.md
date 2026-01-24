# SFC 模块说明文档

本文档说明 sfc 目录下各文件职责、核心方法、报价/出票测试方式，以及 SFC 系列关键逻辑与特殊处理。

## 一、概述

SFC 模块将原 `sfcOffer.js`（报价）与 `sfcAutoTicket.js`（出票）拆分为职责清晰的子模块，继承基类 `BaseOfferPrice`、`BaseBuyTicket`，统一错误处理与日志格式。

**目录结构**：

```
src/common/autoTicket/buyTicket/sfc/
├── offerManage.js      # 报价管理（继承 BaseOfferPrice）
├── buyTicket.js        # 出票主流程（继承 BaseBuyTicket）
├── cardQuanManage.js   # 卡券管理
├── cinemaManage.js     # 影院管理
├── seatManage.js       # 座位管理
├── orderManage.js      # 订单管理
└── __tests__/          # 单元测试
```

**入口**：

- 报价：`commonOfferHandle.js` 对 SFC 系列使用 `sfc/offerManage` 的 `getSfcOfferPrice`。
- 出票：`buyTicket/index.js` 通过 `STRATEGY_MAP.sfc` / `STRATEGY_MAP.sfc_applet` 使用 `SfcBuyTicket`。

---

## 二、文件职责与核心方法

| 文件                  | 职责         | 核心方法                                                                                                                               |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **offerManage.js**    | 报价逻辑管理 | `getEndOfferPrice()`, `getEndMatchOfferRule()`, `getCostPrice()`, `calculateFinalPrice()`, `validateOfferOrder()`                      |
| **buyTicket.js**      | 出票流程编排 | `singleTicket()`, `oneClickBuyTicket()`, `getCinemaLoginInfo()`, `getOrderOfferRule()`, `checkOfferRuleRes()`, `validateTicketOrder()` |
| **cardQuanManage.js** | 卡券管理     | `getQuanInfo()`, `getQuanListByPhone()`, `useQuanOrCard()`, `getUsableCardList()`, `getSortPhoneByQuanTypeList()`, `updateQuanStock()` |
| **cinemaManage.js**   | 影院与场次   | `getCityList()`, `getCityCinemaList()`, `getBuyPrevCinemaInfo()`, `getMoviePlayInfo()`, `getMovieInfo()`                               |
| **seatManage.js**     | 座位         | `getSeatLayout()`, `getTargetSeat()`, `lockSeatHandle()`                                                                               |
| **orderManage.js**    | 订单与支付   | `priceCalculation()`, `createOrder()`, `buyTicket()`, `payOrder()`, `lastHandle()`, `transferOrder()`, `releaseSeat()`                 |

---

## 三、报价测试与出票测试

### 3.1 报价测试

**获取实例**：

```javascript
// 方式一：通过 commonOfferHandle
import getOfferPriceFun from "@/common/autoOffer/commonOfferHandle";
const offerPrice = getOfferPriceFun({
  appFlag: "hbchyxd",
  plat_name: "lieren"
});

// 方式二：直接使用 sfc 模块（推荐用于控制台快速测试）
const offerPrice = window.sfcOfferObj("lieren", "hbchyxd");
// 订单报价管理校验：
// window.sfcOfferObj("lieren", "hbchyxd").validateOfferOrder(orderJson)
// 获取订单最终报价：
// window.sfcOfferObj("lieren", "hbchyxd").getEndOfferPrice({ order: orderJson, offerList: [] })
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
import SfcBuyTicket from "@/common/autoTicket/buyTicket/sfc/buyTicket.js";
import Logger from "@/common/logger.js";

const logger = new Logger({ logType: 3 });
const buyTicket = new SfcBuyTicket(orderJson, logger, isTestOrder);

// 或使用全局方法（控制台快速测试）
const buyTicket = window.sfcTicketObj(orderJson, true);
// 订单出票管理相关方法组装校验：
// window.sfcTicketObj(order, true).validateTicketOrder()
// 订单一键出票测试：
// window.sfcTicketObj(order, true).singleTicket()
```

**正式出票**：

```javascript
const res = await buyTicket.singleTicket();
// 成功：{ profit, qrcode, submitRes, quan_code, card_id, cardNum, offerRule }
// 失败：undefined 或 { offerRule, transferParams }
```

**测试模式（不购买）**：`isTestOrder === true` 时，会执行到锁座、价格计算后取消订单释放座位，不调用购买、上传取票码。

**校验不锁座/不购买**：

```javascript
const result = await buyTicket.validateTicketOrder();
// { valid, errMsg, steps, cardInfo?, quanInfo? }
```

**待出票订单必填字段**：`order_number`, `plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `film_name`, `hall_name`, `show_time`, `lockseat`, `ticket_num`, `supplier_end_price`。

---

## 四、SFC 特殊逻辑摘要

- **系统异常**：`checkConsecutiveErrors` 检测连续订单创建失败（如超时），用于报价/出票策略。
- **座位区域价**：取最高价或最频座位价；部分 app（如 hbchyxd）`member_price` 使用 `normal_price`。
- **卡券**：V3 与普通 app 区分；用卡检查余额、日/月限制；用券检查库存与黑名单。
- **订单**：创建订单、购买、取票码轮询与上传、转单时取消/释放座位，均集中在 `orderManage`。

更多实现细节见 `REFACTORING_PLAN.md`，测试清单见 `TEST_VERIFICATION.md`。
