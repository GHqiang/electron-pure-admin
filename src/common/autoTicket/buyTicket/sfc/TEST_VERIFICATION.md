# SFC 模块化架构测试验证清单

## 一、代码完整性检查

### 1.1 文件结构

- [x] `sfc/offerManage.js` - 报价管理模块
- [x] `sfc/buyTicket.js` - 出票主流程模块
- [x] `sfc/cardQuanManage.js` - 卡券管理模块
- [x] `sfc/cinemaManage.js` - 影院管理模块
- [x] `sfc/seatManage.js` - 座位管理模块
- [x] `sfc/orderManage.js` - 订单管理模块

### 1.2 基类继承

- [x] `getSfcOfferPrice` 继承 `BaseOfferPrice`
- [x] `SfcBuyTicket` 继承 `BaseBuyTicket`

### 1.3 工厂注册

- [x] `commonOfferHandle.js` 中对 SFC 系列使用 `sfc/offerManage` 新实现
- [x] `buyTicket/index.js` 中注册 `SfcBuyTicket`（`sfc`、`sfc_applet`）

---

## 二、报价校验与出票测试（与 LMA 对齐）

### 2.1 报价校验（不写库、不真正报价）

**入口**：`validateOfferOrder(orderJson)`

```javascript
// 获取实例
const offerPrice = window.sfcOfferObj("lieren", "hbchyxd");
// 或：getOfferPriceFun({ appFlag: "hbchyxd", plat_name: "lieren" })

// 校验步骤
const result = await offerPrice.validateOfferOrder(orderJson);
// { valid, errMsg, steps, offerRule?, movieInfo?, memberPriceRes?, costPrice? }
```

**验证步骤**：

1. 订单格式校验：必填字段、`ticket_num` / `supplier_max_price` 类型与范围
2. `getEndMatchOfferRule`：报价规则匹配
3. `cinemaManage.getMovieInfo`：电影放映信息获取
4. 若 `offerType === "2"`：`getMemberPrice` 会员价获取
5. `getCostPrice`：成本价获取

**待报价订单必填字段**：`plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `film_name`, `hall_name`, `show_time`, `ticket_num`, `supplier_max_price`。

### 2.2 出票测试（不锁座、不购买、不上传取票码）

**入口**：`validateTicketOrder()`

```javascript
const buyTicket = window.sfcTicketObj(orderJson, true);
const result = await buyTicket.validateTicketOrder();
// { valid, errMsg, steps, cardInfo?, quanInfo? }
```

**验证步骤**：

1. 订单格式校验：必填字段、`ticket_num` / `supplier_end_price` 类型与范围
2. `getCinemaLoginInfo`：登录信息获取
3. `getOrderOfferRule`、`checkOfferRuleRes`：报价规则获取与校验
4. `getCityList` → `getCityCinemaList` → `getTargetCinemaCommon`：城市/影院信息
5. `getUsableCardList` / `getSortPhoneByQuanTypeList`：按卡券排序登录信息（如适用）
6. `getMoviePlayInfo` → `getMovieInfoFromFilmName` → 匹配场次：电影/场次信息
7. `getSeatLayout` → 解析目标座位：座位信息
8. `useQuanOrCard`：用卡/用券流程（会产生绑定券等副作用）

**不执行**：锁座、创建订单、价格计算、购买、上传取票码、转单。

**待出票订单必填字段**：`order_number`, `plat_name`, `app_name`, `city_name`, `cinema_name`, `cinema_code`, `film_name`, `hall_name`, `show_time`, `lockseat`, `ticket_num`, `supplier_end_price`。

---

## 三、功能模块测试（手动）

### 3.1 报价功能

1. 通过 `getOfferPriceFun({ appFlag: "<sfc_app>", plat_name: "lieren" })` 或 `window.sfcOfferObj("lieren", "<sfc_app>")` 获取报价实例。
2. **校验不报价**：`validateOfferOrder(orderJson)`，检查 `valid`、`steps`、`offerRule`、`costPrice`。
3. **正式报价**：`getEndOfferPrice({ order, offerList })`，校验返回含 `endPrice`、`offerRule`、`order_number`、`err_msg`、`err_info` 或错误信息。

### 3.2 出票功能

1. 创建 `SfcBuyTicket(order, logger, isTestOrder)` 或 `window.sfcTicketObj(order, true)` 实例。
2. **校验不锁座/不购买**：`validateTicketOrder()`，检查 `valid`、`steps`、`cardInfo`、`quanInfo`。
3. **正式出票**：`singleTicket()`，验证流程：`getCinemaLoginInfo` → `getOrderOfferRule` → `checkOfferRuleRes` → `oneClickBuyTicket`。
4. 校验登录信息、报价规则、卡券、锁座、创单、购买、取票码上传等环节无未捕获异常。

### 3.3 订单与转单

1. 校验 `orderManage.priceCalculation`、`createOrder`、`buyTicket`、`payOrder`、`lastHandle` 的入参与返回。
2. 转单场景：校验 `transferOrder` 中取消订单 / 释放座位的调用，以及平台转单接口。

---

## 四、核心方法与功能对照（重构 vs 原始）

| 环节      | 原始（sfcOffer / sfcAutoTicket）                                                                       | 模块化（sfc/）                                           | 对照要点                                                |
| --------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------- |
| 报价入口  | `getEndOfferPrice({ order, offerList })`                                                               | `offerManage.getEndOfferPrice`                           | 返回 `err_msg`、`err_info`、`endPrice`、`offerRule`     |
| 规则匹配  | `getEndMatchOfferRule`、`getMinAmountOfferRule`                                                        | `offerManage` 同名                                       | 规则匹配、电影格式、会员日等一致                        |
| 成本价    | `getQuanInfo`、`getCostPrice`、券/会员价                                                               | `cardQuanManage.getQuanInfo`、`offerManage.getCostPrice` | 多券取最小成本、`maxCostPrice` 过滤一致                 |
| 会员价    | `getMemberPrice`                                                                                       | `offerManage.getMemberPrice`                             | 加价规则、`movieData` 来源一致                          |
| 城市/影院 | `getCityList`、`getCityCinemaList`                                                                     | `cinemaManage` 同名                                      | 返回 `cityList`/`cinemaList`、`movieData` 结构一致      |
| 影片/场次 | `getMoviePlayInfo`、`getMovieInfoFromFilmName`、`isNextDay`、`getPreviousDay`                          | 同上 + `cinemaManage.getMoviePlayInfo`                   | `start_day`、`start_time`、`show_id` 一致               |
| 座位      | `getSeatLayout`、`lockSeatHandle`、`trial` 重试                                                        | `seatManage` 同名，`buyTicket` 内 `trial`                | 入参、重试配置一致                                      |
| 卡券      | `useQuanOrCard`、`getUsableCardList`、`getSortPhoneByQuanTypeList`、`getNewQuan`、`useQuan`、`useCard` | `cardQuanManage` 同名                                    | 灵活用券、入库券、异步绑券等一致                        |
| 订单      | `priceCalculation`、`createOrder`、`buyTicket`、`lastHandle`、`transferOrder`、`releaseSeat`           | `orderManage` 同名                                       | `getCurrentParams`、`updateQuanBlackInfo`、超时重试一致 |

---

## 五、文档与规范

- [x] `REFACTORING_PLAN.md` - 重构方案与架构说明
- [x] `SFC_README.md` - 模块职责、报价/出票测试、校验入口与 SFC 特殊逻辑
- [x] `TEST_VERIFICATION.md` - 本测试验证清单

报价/出票测试入口和详细说明请参考 [SFC 模块说明文档](./SFC_README.md)。完成以上检查且报价校验、出票测试通过后，可认为 SFC 模块化重构与验证完成。
