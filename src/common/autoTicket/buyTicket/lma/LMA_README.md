# LMA 模块说明文档

本文档说明 lma 目录下各文件职责、核心方法、报价/出票测试方式，以及会员价、支付价格等关键数据的获取逻辑与特殊处理。

## 一、概述

LMA 模块将原 `lmaOffer.js`（报价）与 `lmaAutoTicket.js`（出票）拆分为职责清晰的子模块，继承基类 `BaseOfferPrice`、`BaseBuyTicket`，统一错误处理与日志格式。

**目录结构**：

```
src/common/autoTicket/buyTicket/lma/
├── offerManage.js      # 报价管理（继承 BaseOfferPrice）
├── buyTicket.js        # 出票主流程（继承 BaseBuyTicket）
├── cardQuanManage.js   # 卡券管理
├── cinemaManage.js     # 影院管理
├── seatManage.js       # 座位管理
└── orderManage.js      # 订单管理
```

**入口**：
- 报价：`commonOfferHandle.js` 对 `appFlag === "lma"` 使用 `getLmaOfferPriceNew`（lma/offerManage），无开关。
- 出票：`buyTicket/index.js` 通过 `STRATEGY_MAP.lma` 使用 `LmaBuyTicket`。

---

## 二、文件职责与核心方法

| 文件 | 职责 | 核心方法 |
|------|------|----------|
| **offerManage.js** | 报价逻辑管理 | `getEndOfferPrice()`, `getEndMatchOfferRule()`, `getCostPrice()`, `calculateFinalPrice()`, `getMemberPrice()`, `validateOfferOrder()` |
| **buyTicket.js** | 出票流程编排 | `singleTicket()`, `oneClickBuyTicket()`, `getCinemaLoginInfo()`, `getOrderOfferRule()`, `checkOfferRuleRes()`, `validateTicketOrder()`, `getSortPhoneByQuanTypeList()` |
| **cardQuanManage.js** | 卡券管理 | `useCardHandle()`, `useQuanHandle()`, `getQuanListByPhone()`, `getQuanInfo()`, `getUsableCardList()`, `updateQuanStock()`, `updateCardDayUse()`, `updateMonthlyLimit()` |
| **cinemaManage.js** | 影院与场次 | `getBuyPrevCinemaInfo()`, `getCityCinemaList()`, `getMoviePlayInfo()`, `getMoviePlayDate()`, `getMovieInfo()` |
| **seatManage.js** | 座位 | `getSeatLayout()`, `getTargetSeat()`, `lockseatByApp()` |
| **orderManage.js** | 订单与支付 | `pripriceCalculation()`, `buyTicket()`, `payOrder()`, `getQrcodeUploadByPlat()`, `transferOrder()`, `asyncFetchQrcodeSubmit()` |

**简要说明**：
- **offerManage**：规则匹配、会员价、成本价、最终报价；对外 `getEndOfferPrice`、`validateOfferOrder`。
- **buyTicket**：登录信息、报价规则、影院/场次/座位、卡券、锁座、价格、购买、取票码；对外 `singleTicket`、`validateTicketOrder`。
- **cardQuanManage**：用卡、用券、券列表、券库存、卡日/月使用量。
- **cinemaManage**：影院列表、放映信息、放映日期、场次匹配；报价用 `getMovieInfo`，出票用 `getBuyPrevCinemaInfo` + `getMoviePlayInfo` + `getMoviePlayDate`。
- **seatManage**：座位布局、目标座位、锁座（锁座即创建订单）。
- **orderManage**：`pripriceCalculation` 调 `get_order` 取支付价；`buyTicket` 调购买接口；`payOrder` 取取票码 `booking_id`；`getQrcodeUploadByPlat` 上传取票码；`transferOrder` 取消订单 + 平台转单。

---

## 三、报价测试与出票测试

### 3.1 报价测试

**获取实例**：

```javascript
// 方式一：通过 commonOfferHandle
import getOfferPriceFun from "@/common/autoOffer/commonOfferHandle";
const offerPrice = getOfferPriceFun({ appFlag: "lma", plat_name: "mayi" });

// 方式二：直接使用 lma 模块（推荐用于控制台快速测试）
const offerPrice = window.lmaOfferObj("mayi", "lma");
// 订单报价管理校验：
// window.lmaOfferObj("mayi", "lma").validateOfferOrder(orderJson)
// 获取订单最终报价：
// window.lmaOfferObj("mayi", "lma").getEndOfferPrice({order: orderJson})
```

**正式报价**：

```javascript
const res = await offerPrice.getEndOfferPrice({
  order: orderJson,
  offerList: []  // 可选，动态调价用
});
// 成功：{ endPrice, offerRule, order_number }
// 失败：{ err_msg, err_info, endPrice: null, offerRule }
```

**校验不报价**：

```javascript
const result = await offerPrice.validateOfferOrder(orderJson);
// { valid, errMsg, steps, offerRule, movieInfo?, memberPriceRes?, costPrice? }
```

**待报价订单必填字段**：`plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `film_name`, `hall_name`, `show_time`, `ticket_num`, `supplier_max_price`。详见 [VALIDATION.md](./VALIDATION.md)。

### 3.2 出票测试

**获取实例**：

```javascript
import LmaBuyTicket from "@/common/autoTicket/buyTicket/lma/buyTicket.js";
import Logger from "@/common/logger.js";

const logger = new Logger({ logType: 3 });
const buyTicket = new LmaBuyTicket(orderJson, logger, isTestOrder);

// 或使用全局方法（控制台快速测试）
const buyTicket = window.lmaTicketObj(orderJson, true);
// 订单一键出票测试：
// window.lmaTicketObj(order, true).singleTicket()
```

**正式出票**：

```javascript
const res = await buyTicket.singleTicket();
// 成功：{ profit, qrcode, submitRes, quan_code, card_id, cardNum, offerRule }
// 失败：undefined 或 { offerRule, transferParams }
```

**测试模式（不购买）**：`isTestOrder === true` 时，`oneClickBuyTicket` 会执行到锁座、价格计算，然后：
1. 打印购买参数（`order_num`, `lmaToken`, `orderInfo` 等）；
2. 调用 `cannelOneOrder` 取消订单释放座位；
3. 直接返回 `{ offerRule }`，不调用 `buyTicket`、`getQrcodeUploadByPlat`。

**校验不锁座/不购买**：

```javascript
const result = await buyTicket.validateTicketOrder(orderJson);
// { valid, errMsg, steps, cardInfo?, quanInfo? }
```

**待出票订单必填字段**：`order_number`, `plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `film_name`, `hall_name`, `show_time`, `lockseat`, `ticket_num`, `supplier_end_price`。详见 [VALIDATION.md](./VALIDATION.md)。

---

## 四、会员价获取（字段与特殊逻辑）

### 4.1 数据源与流程

1. **cinemaManage.getMovieInfo(order)**  
   - 影院列表 → `getMoviePlayInfo`（放映信息）→ 匹配影片、日期、场次 → 得到目标场次 `targetShow`，即 `movieInfo`。  
   - 来源：LMA 放映接口（`getMoviePlayInfo`、`getMoviePlayDate` 等）。

2. **movieInfo 字段**：
   - `member_price`：会员价（可能带 `￥`，需 `replace("￥", "")`）。
   - `price`：非会员价（同上）。
   - `cinema_id`：影院 ID。
   - `session_id`：场次 ID，即 `show_id`。

3. **若存在 `show_id`**：  
   - 调用 `seatManage.getSeatLayout({ cinema_id, show_id, lmaToken: "" })`，取 `label_arr`（分区价）。  
   - 取分区最高价 `bigPrice`，`member_price = Math.max(member_price, bigPrice)` 作为会员价基准。

4. **兜底**：
   - `member_price <= 0` 且存在 `price`：用 `price`（非会员价）作为会员价基准。
   - `member_price === 0`：不报价，返回 `null`。

5. **卡与折扣**：
   - `svApi.queryCardList` 拉取卡列表，按 `getCinemaLoginInfoList` 的 mobile、日/月限额（`use_limit_day`、`use_limit_month`、`daily_usage`、`month_usage`）、`linkCinemaIds`（指定影院）过滤。
   - 按 `card_discount` 排序，取最小折扣 `discount`。
   - `real_member_price` = 上述会员价基准（数值）。
   - 未用 -5 元券时：`member_price`（成本）= `real_member_price * discount / 100`。

### 4.2 LMA 特殊：-5 元券

- **条件**：`localStorage.lmaIsUseQuan == "1"` 且 `real_member_price >= 33`。
- **逻辑**：
  1. `member_price = real_member_price - 5`；
  2. `member_price = member_price * discount / 100`；
  3. 查询 `getQuanInfo("lma-5", appFlag)` 得到 `quan_cost`（默认 1），`member_price += quan_cost`。
- **成本价**：`(real_member_price - 5) * discount / 100 + 券成本`。

### 4.3 返回值

- **成功**：`{ real_member_price, member_price, discount }`。  
- **获取电影信息失败**：`-1`。  
- **其他失败**：`null`。

---

## 五、出票时支付价格获取（字段与特殊逻辑）

### 5.1 时机与流程

- **时机**：锁座成功得到 `order_str` 后，在购买前调用。
- **调用链**：`buyTicket` → `orderManage.pripriceCalculation({ order_str, lmaToken })` → `appApi.priceCalculation`。

### 5.2 接口与字段

- **接口**：`GET /lma/mp/iorder/get_order`（即 `priceCalculation` / `get_order`）。
- **入参**：`order_str`（锁座返回的订单号）、`lmaToken`（当前登录的 `session_id`）。
- **返回**：`res.data` 作为 `price` 返回；`orderManage` 返回 `{ price: res.data }`。
- **支付金额**：`paymentAmount = Number(priceInfo.price_str?.replace("￥", "") || 0)`，即 **`price_str`** 去掉 `￥` 后的数值。

### 5.3 用途

- 与 `quan_fee * ticket_num` 比较：券单时若 `paymentAmount > quan_fee_total` 则转单。
- 与 `real_member_price * ticket_num` 比较：卡单时用于卡满检测、利润扣减等。
- 参与利润计算、卡满提示等逻辑。

---

## 六、其它特殊逻辑

### 6.1 锁座即创建订单

- LMA 锁座接口调用成功即视作创建订单，返回 `order_str`。
- 后续价格计算、购买、取票码均依赖 `order_str`。

### 6.2 取票码

- **接口**：`payOrder` → `GET /lma/mp/ihistory/ticket_info`。
- **字段**：`res.data?.booking_id` 作为取票码 `qrcode`。
- **上传**：`orderManage.getQrcodeUploadByPlat` 将取票码上传至平台。

### 6.3 测试模式（isTestOrder）

- 执行到锁座、价格计算后**不购买**。
- 打印购买参数（`order_num`, `lmaToken`, `orderInfo` 等）。
- 调用 `cannelOneOrder` 取消订单释放座位。
- 返回 `{ offerRule }`。

### 6.4 验证模式（validateOfferOrder / validateTicketOrder）

- **报价验证**：不写库、不真正报价；可覆盖规则匹配、电影信息、会员价、成本价等。
- **出票验证**：不锁座、不购买、不上传取票码；会执行用卡、用券（实际切换卡、绑定券），有副作用。详见 [VALIDATION.md](./VALIDATION.md)。

### 6.5 转单与取消订单

- **transferOrder(unlockSeatInfo, lmaToken)**：若 `unlockSeatInfo.order_str` 存在则先 `cannelOneOrder` 取消订单释放座位，再根据配置决定是否调用平台转单接口。
- 所有 `transferOrder` 调用处均传入 `(unlockSeatInfo, lmaToken)`，不可颠倒。

---

## 七、参考文档

- [重构方案](./REFACTORING_PLAN.md)
- [测试验证清单](./TEST_VERIFICATION.md)
- [BaseOfferPrice](../../../core/BaseOfferPrice.js)、[BaseBuyTicket](../../../core/BaseBuyTicket.js)
