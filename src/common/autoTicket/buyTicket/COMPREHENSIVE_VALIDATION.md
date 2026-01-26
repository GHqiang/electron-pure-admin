# SFC/UME/LMA/H5UME 报价和出票逻辑严格对照检查报告

## 检查时间
2026-01-26

## 检查范围
- **SFC**: `sfcOffer.js` / `sfcAutoTicket.js` vs `sfc/offerManage.js` / `sfc/buyTicket.js`
- **UME**: `umeOffer.js` / `umeAutoTicket.js` vs `ume/offerManage.js` / `ume/buyTicket.js`
- **LMA**: `lmaOffer.js` / `lmaAutoTicket.js` vs `lma/offerManage.js` / `lma/buyTicket.js`
- **H5UME**: `h5umeOffer.js` / `h5umeAutoTicket.js` vs `h5ume/offerManage.js` / `h5ume/buyTicket.js`

---

## 一、报价逻辑严格对照检查

### 1.1 入口与流程

#### SFC

**旧版** (`sfcOffer.js:104-206`):
- `getEndOfferPrice({ order, offerList })` → `logger.init(order)`
- 主流程：`getEndMatchOfferRule` → `getQuanInfo`/会员成本 → `getEndPrice` → `returnResultHandle`
- 返回：`{ err_msg, err_info, endPrice, offerRule }`

**重构后** (`sfc/offerManage.js:444-490`):
- `getEndOfferPrice({ order, offerList })` → 调用 `super.getEndOfferPrice`（基类处理）
- SFC 特殊逻辑：系统异常检测（`isAnomaly` → `getTicketList` → `checkConsecutiveErrors`）
- 返回：补充 `err_msg` 和 `err_info`，确保与旧版结构一致

**结论**: ✅ **通过** - 流程一致，返回结构对齐（已补充 `err_msg`、`err_info`）

#### UME

**旧版** (`umeOffer.js:59-79`):
- `getEndOfferPrice({ order, offerList })` → `logger.init(order)`
- 主流程：`getEndMatchOfferRule` → 若返回 `"wanxiangh5"` 则调旧 `umeOffer`，否则 `getQuanInfo`/会员成本 → `getEndPrice` → `returnResultHandle`

**重构后** (`ume/offerManage.js:175-204`):
- `getEndOfferPrice({ order, offerList })` → 调用基类，wanxiangh5 分支处理
- 主流程：`getEndMatchOfferRule` → `"wanxiangh5"` 时调旧 `umeOffer.getEndOfferPrice`，否则 `getCostPrice` → `calculateFinalPrice` → `buildSuccessResponse`

**结论**: ✅ **通过** - wanxiangh5 分支与主流程一致

#### LMA

**旧版** (`lmaOffer.js:87-146`):
- `getEndOfferPrice({ order, offerList })` → `logger.init(order)`
- 主流程：`getEndMatchOfferRule` → `getQuanInfo`/会员成本 → `getEndPrice` → `returnResultHandle`

**重构后** (`lma/offerManage.js:100-154`):
- `getEndOfferPrice({ order, offerList })` → 调用基类
- 主流程：`getEndMatchOfferRule` → `getCostPrice` → `calculateFinalPrice` → `buildSuccessResponse`

**结论**: ✅ **通过** - 流程一致

#### H5UME

**旧版** (`h5umeOffer.js:62-121`):
- `getEndOfferPrice({ order, offerList })` → `logger.init(order)`
- 主流程：`getEndMatchOfferRule` → `getQuanInfo`/会员成本 → `getEndPrice` → `returnResultHandle`
- 无 wanxiangh5 分支

**重构后** (`h5ume/offerManage.js:200-260`):
- `getEndOfferPrice({ order, offerList })` → 调用基类
- 主流程：`getEndMatchOfferRule` → `getCostPrice` → `calculateFinalPrice` → `buildSuccessResponse`
- 无 wanxiangh5 分支

**结论**: ✅ **通过** - 流程一致，无 wanxiangh5

---

### 1.2 规则匹配（getEndMatchOfferRule / getMinAmountOfferRule）

#### 通用检查点

**所有平台**:
- [x] `offerRuleMatch` 调用和参数一致
- [x] 会员日报价规则优先逻辑（`memberDay && offerType === "3"`）
- [x] 电影信息获取（`getMovieInfo` / `getMovieInfoFromFilmName`）
- [x] 电影格式过滤（`media` / `filmTypeFlag`）
- [x] `getMinAmountOfferRule` 的过滤和排序逻辑
- [x] 失败返回值（`null` vs `undefined`，调用方用 `if (!offerRule)` 判断，行为等价）

**特殊平台逻辑**:
- [x] UME 的 wanxiangh5 分支处理（重构后已对齐）

**结论**: ✅ **通过** - 所有平台的规则匹配逻辑与旧版一致

---

### 1.3 成本价获取（getCostPrice / getQuanInfo）

#### 通用检查点

**所有平台**:
- [x] `offerType === "1"` 时的券成本获取（`getQuanInfo`）
- [x] 多种券类型时的成本价计算（`Math.min(...quan_cost)`）
- [x] `offerType !== "1"` 时的会员成本价（`memberCostPrice`）
- [x] 成本价为空时的处理（返回错误响应）
- [x] 成本价赋值到 `offerRule.cost_price`

**结论**: ✅ **通过** - 所有平台的成本价获取逻辑与旧版一致

---

### 1.4 最终报价计算（calculateFinalPrice / getEndPrice）

#### 1.4.1 价格调整步骤

**动态调价**:
- [x] SFC：`applyDynamicPricing` 逻辑与旧版 `adjustPrice` 一致（使用 `offerList`）
- [x] LMA：动态调价 bug 已修复（旧版用 `outCount`，重构后用 `outPrice`）✅
- [x] UME/H5UME：无动态调价

**利润加价**:
- [x] 所有平台：`offerType !== "1"` 且 `!GROUP_LIST.includes(appFlag)` 时 `price += profitAddPrice`
- [x] LMA：不使用利润加价（`applyProfitAddition` 直接返回 `price`）

**夜间顶价**:
- [x] 所有平台：`isOpenisNightMaxPrice == 1` 且 `1 <= hour <= 6` 时 `price = supplier_max_price`

**超限检查**:
- [x] 所有平台：`price > supplier_max_price` 且 `isOverrunOffer !== "1"` 时不报价
- [x] SFC/UME：超限平台 `["mayi", "yangcong"]` 取整，其它 `roundToHalf`
- [x] H5UME：超限仅 `["mayi"]`（无 yangcong）
- [x] LMA：超限平台 `["mayi", "yangcong"]` 取整
- [x] `ONE_STEP_PLAT_LIST` 的 0.1 步长处理

#### 1.4.2 成本利润计算

**所有平台公式一致**:
- [x] 手续费：`shouxufei = (price * 100) / 10000`
- [x] `NO_FEE_PLAT_LIST` 处理（手续费置 0）
- [x] 奖励费用：`rewardPrice = (price * 100 * rewards) / 10000`（rewards > 0）
- [x] 出票成本：`pay_cost_price = cost_price + shouxufei`
- [x] 真实成本：`real_cost_price = (pay_cost_price - rewardPrice).toFixed(2)`
- [x] 最大卡券成本：`maxCostPrice = (price*1000 + reward*1000 - shouxufei*1000)/1000`
- [x] 利润校验：`price <= real_cost_price` 且非 `TEST_NEW_PLAT_LIST` 则不报价
- [x] `quanValue` 过滤：`offerType === "1"` 且多种券时按 `maxCostPrice` 过滤

#### 1.4.3 日志输出

**所有平台**:
- [x] 计算报价相关信息的日志包含：`rule_price`、`profitAddPrice`（单店加价金额）、`supplier_max_price`、`cardQuanCost`、`maxCostPrice`、`price`、`shouxufei`、`cost_price`（出票成本）、`rewardPrice`、`real_cost_price`、`expectProfit`
- [x] 日志字段和格式与旧版一致（已修复 LMA、UME、H5UME 的缺失项）

**结论**: ✅ **通过** - 所有平台的核心计算公式与旧版一致，日志已补全

---

### 1.5 特殊逻辑检查

#### SFC

- [x] 系统异常检测（`isAnomaly` → `getTicketList` → `checkConsecutiveErrors`）✅
- [x] 分组券库存逻辑（`card_num` 分组，取最大组长度）✅

#### UME

- [x] wanxiangh5 分支处理 ✅
- [x] 超限平台列表（mayi、yangcong）✅

#### LMA

- [x] 动态调价 bug 修复（`outPrice` vs `outCount`）✅
- [x] 利润加价不使用（`applyProfitAddition` 直接返回 price）✅

#### H5UME

- [x] 无 wanxiangh5 分支 ✅
- [x] 超限仅 `["mayi"]`（无 yangcong）✅

**结论**: ✅ **通过** - 所有平台的特殊逻辑与旧版一致或已修复

---

## 二、出票逻辑严格对照检查

### 2.1 入口与流程（singleTicket）

#### 通用检查点

**所有平台**:
- [x] `singleTicket` 方法签名和参数
- [x] 登录信息获取（`getCinemaLoginInfo` / `getCinemaLoginInfoList`）
- [x] 登录信息排序逻辑（`first` 字段优先，`mobile` 排序）
- [x] 报价规则获取（`getOrderOfferRule` / `queryOfferInfo`）
- [x] 解锁座位逻辑（`!isTestOrder && !item.isAgain` 时 `unlockSeatByPlat`）
- [x] 解锁失败转单逻辑
- [x] `oneClickBuyTicket` 调用

**结论**: ✅ **通过** - 所有平台的 `singleTicket` 流程与旧版一致（继承 `BaseBuyTicket`）

---

### 2.2 一键买票核心流程（oneClickBuyTicket）

#### 2.2.1 参数提取与初始化

**所有平台**:
- [x] 订单参数提取（`order_number`, `city_name`, `cinema_name`, `film_name`, `show_time`, `lockseat`, `ticket_num`, `supplier_end_price` 等）
- [x] `otherParams` 处理（换号出票时复用）
- [x] `currentParamsList` 和 `currentParamsInx` 初始化

**结论**: ✅ **通过** - 参数提取与初始化与旧版一致

#### 2.2.2 影院与场次信息

**所有平台**:
- [x] 影院信息获取（`getBuyPrevCinemaInfo` / `getCityCinemaList`）
- [x] 电影信息获取（`getMoviePlayInfo` / `getMovieInfoFromFilmName`）
- [x] 场次信息获取（`getMoviePlayTime` / `getMoviePlayDate`）
- [x] 场次匹配逻辑（时间、影厅、电影名称）

**结论**: ✅ **通过** - 影院与场次信息获取与旧版一致

#### 2.2.3 座位处理

**所有平台**:
- [x] 座位布局获取（`getSeatLayout`）- **已修复 session_id 条件传入**
- [x] 目标座位解析（`getTargetSeat`）
- [x] 座位格式处理（座/号/列统一）
- [x] 座位价格计算（`areaTotalPrice` / `seat_arr`）

**结论**: ✅ **通过** - 座位处理与旧版一致，session_id 已修复

#### 2.2.4 卡券使用（useQuanOrCard / useCardHandle）

**用券逻辑**（所有平台）:
- [x] 手续费计算：`shouxufei = (supplier_end_price * 100) / 10000`，`NO_FEE_PLAT_LIST` 置 0
- [x] 利润计算：`profit = (supplier_end_price - quan_cost - shouxufei) * ticket_num`
- [x] 奖励计算：`rewardPrice = (supplier_end_price * 100 * ticket_num * rewards) / 10000`，`profit += rewardPrice`
- [x] 负利润处理：`!isTestOrder && profit < 0` 且非 `TEST_NEW_PLAT_LIST` 时日志并可能转用卡
- [x] 券费卡过滤（H5UME：`item.balance >= quan_fee * 100 * ticket_num`）
- [x] 卡选择逻辑（按 `balance` 排序，取最大）

**用卡逻辑**（所有平台）:
- [x] 卡余额过滤（SFC：`item.cardAmount >= ...`，UME/LMA/H5UME：`item.balance >= member_total_price`）
- [x] 利润计算：`profit = (supplier_end_price - member_price - shouxufei) * ticket_num`
- [x] 奖励计算：同用券公式
- [x] 负利润处理：`!isTestOrder && profit < 0` 且非 `TEST_NEW_PLAT_LIST` 时返回 `{ profit: 0, card_id: "" }`
- [x] 卡选择逻辑（按余额排序，取最大）

**灵活用券（autoUseQuan）**（所有平台）:
- [x] 条件判断：`offer_type !== "1"` 且 `autoUseQuanStatus === "1"` 且 `supplier_end_price > autoUseQuanPrice` 且 `auto_quan_value` 存在
- [x] `is_auto_use_quan = true`，`offerRule.quan_value = auto_quan_value`
- [x] 不足或负利润时退用卡

**结论**: ✅ **通过** - 所有平台的卡券使用逻辑与旧版一致

#### 2.2.5 锁座（lockSeatHandle / lockSeat）

**所有平台**:
- [x] 锁座参数构建（`city_id`, `cinema_id`, `show_id`, `seat_ids`, `session_id` 等）
- [x] 锁座 API 调用
- [x] 锁座失败重试逻辑（`trial` / `inx` 参数）
- [x] 锁座失败转单逻辑
- [x] `lockOrderId` / `orderHeaderId` 获取
- [x] **session_id 条件传入**（已修复）

**结论**: ✅ **通过** - 锁座逻辑与旧版一致，session_id 已修复

#### 2.2.6 价格计算与订单创建

**所有平台**:
- [x] 最优卡券组合获取（`getOptimalCardQuanCompose`）- **已修复 session_id 条件传入**
- [x] 订单创建（`createOrder`）- **已修复 session_id 条件传入**
- [x] 创建订单失败处理（转单，传 `lockOrderId`）
- [x] 创建订单成功后的处理

**结论**: ✅ **通过** - 价格计算与订单创建逻辑与旧版一致，session_id 已修复

#### 2.2.7 支付前校验与会员价调整

**用券场景**（所有平台）:
- [x] `quan_fee_total = (quan_fee * 1000 * ticket_num) / 1000`
- [x] `offer_type === "1"` 且 `useQuan?.length` 且 `paymentAmount / payAmount > quan_fee_total` 时转单
- [x] SFC/UME 使用 `paymentAmount`，H5UME 使用 `payAmount`

**用卡场景**（所有平台）:
- [x] `real_member_price / real_member_total_price` 计算
- [x] `paymentAmount / payAmount > real_member_price / real_member_total_price` 分支：
  - 差值计算：`subDecimal(paymentAmount, real_member_price)`
  - 利润扣减：`diff < profit` 时 `profit -= diff` 并日志，否则转单/换号
- [x] `paymentAmount / payAmount < real_member_price / real_member_total_price` 分支：
  - 利润增加：`profit += (real_member_price - paymentAmount) * member_discount / 100`
  - `toFixed(2)` 处理
- [x] UME 保留 `paymentAmount < real_member_price` 分支（LMA 注释掉）

**结论**: ✅ **通过** - 支付校验与会员价调整逻辑与旧版一致

#### 2.2.8 购买订单（buyTicket）

**所有平台**:
- [x] 购买参数构建（`orderId`, `pay_money` / `payAmount`, `card_id`, `session_id` 等）
- [x] 购买 API 调用
- [x] 购买超时处理（`timeout`, `"Request failed"`, `"已下单成功"` 当成功处理）
- [x] 购买失败转单逻辑

**结论**: ✅ **通过** - 购买订单逻辑与旧版一致

#### 2.2.9 取票码获取与上传

**所有平台**:
- [x] 取票码获取（`getQrcodeUploadByPlat` / `getOrderList` / `getOrderInfoByOrderList`）
- [x] 取票码上传（`submitQrcode` / `lastHandle`）
- [x] 轮询逻辑和重试次数

**结论**: ✅ **通过** - 取票码获取与上传逻辑与旧版一致

---

### 2.3 错误处理与转单

#### 2.3.1 换号逻辑

**所有平台**:
- [x] 换号触发条件（卡券无法使用、支付失败等）
- [x] 换号前取消/释放（使用**上一号** `session_id`）
- [x] 换号后恢复 `offerRule.quan_value`（从 `old_quan_value`）
- [x] 换号失败转单（`unlockSeatInfo` 含上一号 `session_id`）

**结论**: ✅ **通过** - 换号逻辑与旧版一致

#### 2.3.2 转单逻辑（transferOrder）

**所有平台**:
- [x] 转单触发条件
- [x] `unlockSeatInfo` 参数传递（`cinemaLinkId`, `lockOrderId`, `orderId`, `session_id`）
- [x] **session_id 优先使用 `unlockSeatInfo.session_id`**（换号失败场景）✅ **已修复**
- [x] 释放座位（`releaseSeat`）：`!orderId` 时使用 `lockOrderId`
- [x] 取消订单（`cancelOrder`）：`orderId` 存在时使用 `orderId`
- [x] 平台转单调用（`orderTransferByPlat`）

**已修复项**:
- [x] H5UME `orderManage.transferOrder` 优先使用 `unlockSeatInfo.session_id` ✅

**结论**: ✅ **通过** - 转单逻辑与旧版一致，session_id 优先逻辑已修复

#### 2.3.3 取消订单与释放座位

**所有平台**:
- [x] `cancelOrder` 参数（`cinemaLinkId`, `orderId`, `session_id`）
- [x] `releaseSeat` 参数（`cinemaLinkId`, `lockOrderId`, `session_id`）
- [x] `session_id` 来源（当前账号 vs 上一账号）

**结论**: ✅ **通过** - 取消订单与释放座位逻辑与旧版一致

---

### 2.4 特殊逻辑检查

#### 2.4.1 测试模式（isTestOrder）

**所有平台**:
- [x] 测试模式下的行为（是否购买、是否取消/释放）
- [x] 测试模式下的日志输出
- [x] 测试模式下的返回值

**已知差异**:
- **SFC/UME/LMA/H5UME**：重构后测试模式下会取消订单/释放座位（与旧版不同，属改进行为）

**结论**: ⚠️ **已知差异** - 测试模式行为与旧版不同，但属重构后的改进行为（与 LMA 对齐）

#### 2.4.2 异步绑券（getNewQuan）

**所有平台**:
- [x] 触发条件：`offerRule.is_store == "1"` 且 `quanStock - ticket_num < 10`
- [x] 绑券参数传递
- [x] 绑券后的库存更新

**结论**: ✅ **通过** - 异步绑券逻辑与旧版一致

#### 2.4.3 其他特殊逻辑

**SFC**:
- [x] 分组券处理 ✅
- [x] 非 V3 版本的卡逐个尝试逻辑 ✅

**UME**:
- [x] `paymentAmount` vs `payAmount` 使用 ✅
- [x] `real_member_price` vs `real_member_total_price` 使用 ✅

**LMA**:
- [x] `short_code` 处理 ✅
- [x] `label_arr` 处理 ✅

**H5UME**:
- [x] `payAmount` vs `paymentAmount` 使用 ✅
- [x] `real_member_total_price` vs `real_member_price` 使用 ✅
- [x] `balance` / `cardNumber` 使用 ✅

**结论**: ✅ **通过** - 所有平台的特殊逻辑与旧版一致

---

## 三、参数传递与接口调用检查

### 3.1 session_id 传递

**已修复项**:
- [x] SFC `seatManage.getSeatLayout`、`lockSeatHandle`、`orderManage.createOrder`、`getOrderInfoByOrderList` ✅
- [x] UME `orderManage.getOptimalCardQuanCompose`、`createOrder` ✅
- [x] H5UME `seatManage.getSeatLayout`、`orderManage.getOptimalCardQuanCompose`、`createOrder` ✅
- [x] LMA `seatManage.getSeatLayout` ✅
- [x] H5UME `orderManage.transferOrder` 优先使用 `unlockSeatInfo.session_id` ✅

**结论**: ✅ **通过** - 所有平台的 session_id 传递已修复（条件传入，避免空字符串）

### 3.2 extraParams 传递

**检查结果**:
- [x] SFC：`getQuanTypeListByApp` 传递 `{ city_id, cinema_id }` ✅
- [x] UME：`getQuanTypeListByApp` 传递 `{ cinemaCode, cinemaLinkId }` ✅
- [x] LMA：`getQuanTypeListByApp` 不传递 `extraParams` ✅
- [x] H5UME：`getQuanTypeListByApp` 不传递 `extraParams` ✅

**结论**: ✅ **通过** - 所有平台的 extraParams 传递与旧版一致

### 3.3 数据结构一致性

**检查结果**:
- [x] `getQuanListByPhone` 返回数据包含 `coupon_info, coupon_num, endDateTime` ✅
- [x] H5UME 已修复 `coupon_info` 和 `coupon_num` 字段映射 ✅
- [x] 所有接口返回数据的字段名和类型一致 ✅

**结论**: ✅ **通过** - 所有平台的数据结构与旧版一致（H5UME 已修复）

---

## 四、已修复问题汇总

### 4.1 报价逻辑修复

1. **UME `calculateFinalPrice` 中 price 的 const 重赋值** ✅
   - 问题：`price` 从 `params` 解构为 `const`，后续又赋值
   - 修复：改为 `let price = params.price`

2. **LMA 动态调价 bug** ✅
   - 问题：旧版使用 `outCount`（错误）
   - 修复：重构后使用 `outPrice`（正确）

3. **计算报价相关信息日志缺失** ✅
   - 问题：LMA、UME 缺少 `profitAddPrice`（单店加价金额）和 `cost_price`（出票成本）
   - 修复：已补全所有平台的日志字段

### 4.2 出票逻辑修复

1. **H5UME `transferOrder` 的 session_id 优先逻辑** ✅
   - 问题：换号失败后转单时，未使用 `unlockSeatInfo.session_id`，导致用错 session
   - 修复：优先使用 `unlockSeatInfo.session_id`，否则再用当前账号 session

2. **所有平台 session_id 空字符串传入接口** ✅
   - 问题：报价时 `session_id: ""` 仍传给接口，导致座位价格不对
   - 修复：使用条件展开 `...(session_id && { session_id })`，仅在存在时传入

### 4.3 数据结构修复

1. **H5UME `getQuanListByPhone` 缺少字段** ✅
   - 问题：返回数据缺少 `coupon_info` 和 `coupon_num`，导致异步更新券库存报错
   - 修复：添加字段映射 `coupon_info: item.name, coupon_num: item.couponCode`

---

## 五、已知差异（保留的改进）

### 5.1 测试模式行为

**差异**：
- **旧版**：测试模式下直接 `return { offerRule }`，不购买、不取消、不释放
- **重构后**：测试模式下打印购买参数，并取消订单/释放座位，再 `return { offerRule }`

**原因**：与 LMA 对齐，属重构后的改进行为

**建议**：保持重构后行为（更利于测试不占座）

---

## 六、检查总结

### 6.1 完全一致的逻辑

✅ **报价逻辑**：
- 入口与流程
- 规则匹配（会员日优先、电影格式过滤）
- 成本价获取（用券/用卡）
- 最终报价计算（动态调价、利润加价、夜间顶价、超限、成本利润）
- 特殊逻辑（SFC 异常检测、UME wanxiangh5、LMA 动态调价修复、H5UME 超限仅 mayi）

✅ **出票逻辑**：
- 入口与流程（singleTicket）
- 一键买票核心流程（参数提取、影院场次、座位、卡券使用）
- 锁座与订单创建
- 支付校验与会员价调整
- 购买订单与取票码
- 错误处理与转单（换号、转单、取消/释放）
- 特殊逻辑（异步绑券、灵活用券、平台特殊逻辑）

✅ **参数传递**：
- session_id 条件传入（已修复）
- extraParams 传递（与旧版一致）
- 数据结构一致性（已修复 H5UME）

### 6.2 已修复的问题

1. ✅ UME `calculateFinalPrice` 中 price 的 const 重赋值
2. ✅ LMA 动态调价 bug（outPrice vs outCount）
3. ✅ LMA、UME 计算报价相关信息日志缺失（profitAddPrice、cost_price）
4. ✅ H5UME `transferOrder` 的 session_id 优先逻辑
5. ✅ 所有平台 session_id 空字符串传入接口问题
6. ✅ H5UME `getQuanListByPhone` 缺少 coupon_info 和 coupon_num 字段

### 6.3 已知差异（保持现状）

1. ⚠️ 测试模式行为：重构后会取消订单/释放座位（与旧版不同，属改进行为）

---

## 七、验证建议

为确保不再出现类似问题，建议：

1. **代码审查检查清单**：
   - [ ] 所有 `getQuanListByPhone` 返回数据必须包含 `coupon_info, coupon_num, endDateTime`
   - [ ] 所有接口调用中 `session_id` 必须条件传入（避免空字符串）
   - [ ] 所有计算公式必须与旧版逐项对比
   - [ ] 所有错误处理和转单逻辑必须与旧版一致

2. **测试验证**：
   - [ ] 报价时调用 `getQuanTypeListByApp` 不应报错
   - [ ] 异步更新券库存时 `syncUpdateQuanStock` 能正常处理数据
   - [ ] 换号出票时 session_id 使用正确
   - [ ] 转单时 session_id 优先使用 `unlockSeatInfo.session_id`

3. **对比检查方法**：
   - 逐行对比关键方法
   - 流程对比完整调用链
   - 特殊场景对比（换号、转单、测试模式）

---

## 八、结论

✅ **所有平台的报价和出票逻辑严格对照检查已完成**

- **报价逻辑**：所有平台的核心计算、流程、特殊逻辑与旧版完全一致
- **出票逻辑**：所有平台的核心流程、卡券使用、错误处理与旧版完全一致
- **参数传递**：所有平台的 session_id、extraParams、数据结构与旧版一致（已修复相关问题）
- **已修复问题**：6 项关键问题已全部修复
- **已知差异**：1 项（测试模式行为，属改进行为）

**总体评价**：重构后的代码与旧版逻辑高度一致，已修复所有发现的偏差，可以放心使用。
