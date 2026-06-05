# 万达购票相关 API 文档

> 整理�?`applet-source-code/wx6718e4b1e9cce6b2/docs/API.md`，仅包含电影票核心接口和卡券接口�?

---

## 目录

- [1. 基地址说明](#1-基地址说明)
- [2. 公共请求头](#2-公共请求�?
- [3. 电影票核心接口](#3-电影票核心接�?
  - [3.1 电影列表与详情](#31-电影列表与详�?
  - [3.2 影院与排期](#32-影院与排�?
  - [3.3 选座与锁座](#33-选座与锁�?
  - [3.4 订单创建与确认](#34-订单创建与确�?
  - [3.5 订单查询与管理](#35-订单查询与管�?
  - [3.6 支付](#36-支付)
  - [3.7 退款](#37-退�?
- [4. 通用服务接口](#4-通用服务接口)
  - [4.1 城市列表](#41-城市列表)
  - [4.2 城市定位](#42-城市定位)
  - [4.3 地址列表](#43-地址列表)
- [5. 卡券接口](#5-卡券接口)
  - [5.1 会员卡相关](#51-会员卡相�?
  - [5.2 礼品卡相关](#52-礼品卡相�?
  - [5.3 优惠券相关](#53-优惠券相�?
- [6. API 响应格式](#6-api-响应格式)

---

## 1. 基地址说明

项目中涉及购票和卡券的基地址如下�?

| 别名                             | 基地址（PRD�?                              | 用�?                   |
| -------------------------------- | ------------------------------------------ | ---------------------- |
| `cinemaBaseUrl`                  | `https://cinema-api-prd-mx.wandafilm.com`  | 影院与电影数�?         |
| `ticketBaseUrl` / `ticketApiUrl` | `https://ticket-api-prd-mx.wandafilm.com`  | 电影票核心业�?         |
| `miscBaseUrl`                    | `https://misc-api-prd-mx.wandafilm.com`    | 通用服务（座位图标等�? |
| `cardBaseUrl`                    | `https://card-api-prd-mx.wandafilm.com`    | 会员卡服�?             |
| `couponBaseUrl`                  | `https://coupon-api-prd-mx.wandafilm.com`  | 优惠券服�?             |
| `paymentBaseUrl`                 | `https://payment-api-prd-mx.wandafilm.com` | 支付服务               |
| `userBaseUrl`                    | `https://user-api-prd-mx.wandafilm.com`    | 用户认证与信�?         |

---

## 2. 公共请求�?

每个 API 请求需携带以下请求头：

| 请求�?                | �?                                   | 说明                                         |
| --------------------- | ------------------------------------ | -------------------------------------------- |
| `content-type`        | `application/x-www-form-urlencoded`  | 默认编码方式                                 |
| `X-Mtime-Platform-Id` | `3`                                  | 平台 ID（微信小程序�?                        |
| `MX-API`              | `JSON.stringify(mxHead)`             | 签名和请求元数据（含 token、版本、check 等） |
| `X-RY-CHANNEL`        | `XIAOCHENGXUGP`                      | 渠道编码                                     |
| `X-RY-TIMESTAMP`      | `Date.now()`                         | 请求时间�?                                   |
| `X-RY-VERSION`        | `6.5.3`                              | API 版本�?                                   |
| `X-RY-TOKEN`          | `encodeURIComponent(userToken)`      | 用户令牌                                     |
| `X-RY-CHECK`          | WASM 签名�?                          | 请求校验签名                                 |
| `X-RY-USER`           | `encodeURIComponent(userIdentifier)` | 用户标识                                     |
| `Connection`          | `Close`                              | 连接类型                                     |

---

## 3. 电影票核心接�?

### 3.1 电影列表与详�?

#### 3.1.1 正在热映

```
GET /movie/hot_show_v6_4.api
BaseURL: cinemaBaseUrl
```

| 参数     | 类型 | 必填 | 说明                  |
| -------- | ---- | ---- | --------------------- |
| `cityId` | int  | �?   | 城市 ID               |
| `day`    | int  | �?   | 天数（默�?`0`，当天） |

---

#### 3.1.2 即将上映

```
GET /movie/coming_v6_4.api
BaseURL: cinemaBaseUrl
```

| 参数     | 类型 | 必填 | 说明    |
| -------- | ---- | ---- | ------- |
| `cityId` | int  | �?   | 城市 ID |

---

#### 3.1.3 热映+即将上映（首页）

```
GET /movie/hot_coming_show.api
BaseURL: cinemaBaseUrl
```

| 参数     | 类型 | 必填 | 说明         |
| -------- | ---- | ---- | ------------ |
| `cityId` | int  | �?   | 城市 ID      |
| `json`   | bool | �?   | 固定�?`true` |

---

#### 3.1.4 点播电影

```
GET /movie/on_demand_show.api
BaseURL: cinemaBaseUrl
```

| 参数     | 类型 | 必填 | 说明         |
| -------- | ---- | ---- | ------------ |
| `cityId` | int  | �?   | 城市 ID      |
| `json`   | bool | �?   | 固定�?`true` |

---

### 3.2 影院与排�?

#### 3.2.1 影院列表（按城市�?

```
GET /cinema/by_locationid_v6_4.api
BaseURL: cinemaBaseUrl
```

| 参数         | 类型  | 必填 | 说明         |
| ------------ | ----- | ---- | ------------ |
| `locationId` | int   | �?   | 城市/区域 ID |
| `lon`        | float | 否   | 经度         |
| `lat`        | float | 否   | 纬度         |
| `coordType`  | int   | 否   | 坐标系类型   |
| `json`       | bool  | �?   | 固定�?`true` |

> **响应说明**：影院列表返回的每个影院对象使用 `storeId` 作为影院唯一标识�?\*不是\*\* `cinemaId`），传给后续接口时使用该值�?

---

#### 3.2.2 影院详情

```
GET /cinema/by_cinemaid.api
BaseURL: cinemaBaseUrl
```

| 参数       | 类型 | 必填 | 说明                                                         |
| ---------- | ---- | ---- | ------------------------------------------------------------ |
| `cinemaid` | int  | �?   | 影院 ID�?_注意：参数名全小�?_，值为影院列表返回�?`storeId`�? |

---

#### 3.2.3 影院排期列表

```
GET /showtime/by_cinema.api
BaseURL: ticketBaseUrl
```

| 参数       | 类型 | 必填 | 说明                                   |
| ---------- | ---- | ---- | -------------------------------------- |
| `cinemaId` | int  | �?   | 影院 ID（值为影院列表返回�?`storeId`�? |
| `showType` | int  | �?   | 排期类型（`0`�?                        |

---

#### 3.2.4 影片排期（按影院/影片/日期�?

```
GET /showtime/by_cinema_film_date.api
BaseURL: ticketApiUrl
```

| 参数       | 类型   | 必填 | 说明                                   |
| ---------- | ------ | ---- | -------------------------------------- |
| `cinemaId` | int    | �?   | 影院 ID（值为影院列表返回�?`storeId`�? |
| `filmId`   | int    | �?   | 影片 ID                                |
| `date`     | string | �?   | 日期（格�?`YYYY-MM-DD`�?               |
| `json`     | bool   | �?   | 固定�?`true`                           |

---

### 3.3 选座与锁�?

#### 3.3.1 实时座位�?

```
GET /order/real_time_seat.api?dId={showTimeId}
BaseURL: ticketApiUrl
```

| 参数  | 类型 | 必填 | 说明                    |
| ----- | ---- | ---- | ----------------------- |
| `dId` | int  | �?   | 场次 ID（Query String�? |

---

#### 3.3.2 按场次码查询座位

```
GET /order/real_time_seat_by_code.api?showCode={tcId}
BaseURL: ticketApiUrl
```

| 参数       | 类型   | 必填 | 说明                              |
| ---------- | ------ | ---- | --------------------------------- |
| `showCode` | string | �?   | 场次码（tokenCode，Query String�? |

---

#### 3.3.3 自动选座

```
GET /order/auto_seat.api
BaseURL: ticketBaseUrl
```

| 参数    | 类型 | 必填 | 说明         |
| ------- | ---- | ---- | ------------ |
| `dId`   | int  | �?   | 场次 ID      |
| `count` | int  | �?   | 选座数量     |
| `json`  | bool | �?   | 固定�?`true` |

---

#### 3.3.4 获取座位图标列表

```
GET /acm/get_seaticons_list.api
BaseURL: miscBaseUrl
```

| 参数   | 类型 | 必填 | 说明         |
| ------ | ---- | ---- | ------------ |
| `json` | bool | �?   | 固定�?`true` |

---

### 3.4 订单创建与确�?

#### 3.4.1 创建订单（锁座）

```
POST /order/create_order.api
BaseURL: ticketApiUrl
Content-Type: application/x-www-form-urlencoded
```

| 参数           | 类型   | 必填 | 说明                                              |
| -------------- | ------ | ---- | ------------------------------------------------- |
| `dId`          | int    | �?   | 场次 ID                                           |
| `retailerCode` | string | �?   | 固定�?`"MX"`                                      |
| `mobile`       | string | �?   | 手机�?                                            |
| `seatId`       | string | �?   | 座位信息，格式：`"seatId,price,undefined,0\|..."` |
| `imaxChannel`  | string | �?   | IMAX 渠道                                         |
| `imaxUserId`   | string | �?   | IMAX 用户 ID                                      |

---

#### 3.4.2 确认订单（绑定手机）

```
POST /order/confirm_order.api
BaseURL: ticketApiUrl
```

| 参数          | 类型   | 必填 | 说明         |
| ------------- | ------ | ---- | ------------ |
| `orderId`     | string | �?   | 订单 ID      |
| `mobilePhone` | string | �?   | 手机�?       |
| `json`        | bool   | �?   | 固定�?`true` |

---

#### 3.4.3 订单状态轮�?

```
POST /order/order_status.api
BaseURL: ticketApiUrl
```

| 参数      | 类型   | 必填 | 说明    |
| --------- | ------ | ---- | ------- |
| `orderId` | string | �?   | 订单 ID |

---

#### 3.4.4 查询订单信息（确认页�?

```
POST /order/query_by_userid.api
BaseURL: ticketApiUrl
```

| 参数      | 类型   | 必填 | 说明    |
| --------- | ------ | ---- | ------- |
| `orderId` | string | �?   | 订单 ID |

---

#### 3.4.5 查询订单列表

```
POST /order/query_order_list.api
BaseURL: ticketBaseUrl
```

| 参数        | 类型 | 必填 | 说明                   |
| ----------- | ---- | ---- | ---------------------- |
| `pageIndex` | int  | �?   | 页码（默�?`1`�?        |
| `busiType`  | int  | �?   | 业务类型（`1`=电影票） |
| `json`      | bool | �?   | 固定�?`true`           |

---

#### 3.4.6 合并支付

```
POST /order/merge_payment.api
BaseURL: ticketBaseUrl
```

| 参数            | 类型   | 必填 | 说明                                  |
| --------------- | ------ | ---- | ------------------------------------- |
| `orderId`       | string | �?   | 订单 ID                               |
| `mobilePhone`   | string | �?   | 手机�?                                |
| `cinemaId`      | int    | �?   | 影院 ID                               |
| `requestInfo`   | string | �?   | 支付信息（JSON 字符串，含支付方式等�? |
| `cartSnackInfo` | string | �?   | 购物车卖品信息（JSON 字符串）         |

---

#### 3.4.7 取消订单

```
POST /order/cancel.api
BaseURL: ticketBaseUrl
```

| 参数      | 类型   | 必填 | 说明         |
| --------- | ------ | ---- | ------------ |
| `orderId` | string | �?   | 订单 ID      |
| `json`    | bool   | �?   | 固定�?`true` |

---

### 3.5 订单查询与管�?

#### 3.5.1 订单详情

```
POST /order/query_by_userid.api
BaseURL: ticketBaseUrl
```

| 参数        | 类型   | 必填 | 说明            |
| ----------- | ------ | ---- | --------------- |
| `orderId`   | string | �?   | 订单 ID         |
| `pageIndex` | int    | �?   | 页码            |
| `busiType`  | int    | �?   | 业务类型（`1`�? |
| `json`      | bool   | �?   | 固定�?`true`    |

---

#### 3.5.2 查询支付信息（升级版�?

```
POST /order/query_pay_info_upgrade.api
BaseURL: ticketBaseUrl
```

| 参数      | 类型   | 必填 | 说明    |
| --------- | ------ | ---- | ------- |
| `orderId` | string | �?   | 订单 ID |
| `tradeNo` | string | �?   | 交易�?  |

---

#### 3.5.3 查询支付结果

```
POST /order/query_pay_deal_result.api
BaseURL: ticketBaseUrl
```

| 参数      | 类型   | 必填 | 说明    |
| --------- | ------ | ---- | ------- |
| `orderId` | string | �?   | 订单 ID |
| `tradeNo` | string | �?   | 交易�?  |

---

#### 3.5.4 查询退款状�?

```
POST /order/query_order_refund_status.api
BaseURL: ticketBaseUrl
```

| 参数      | 类型   | 必填 | 说明    |
| --------- | ------ | ---- | ------- |
| `orderId` | string | �?   | 订单 ID |

---

#### 3.5.5 查询电影提醒

```
POST /order/query_movie_remind_by_userid.api
BaseURL: ticketBaseUrl
```

| 参数         | 类型   | 必填 | 说明                     |
| ------------ | ------ | ---- | ------------------------ |
| `remindTime` | int    | �?   | 提醒时间（小时，�?`24`�? |
| `json`       | string | �?   | `"true"`                 |

---

#### 3.5.6 支付方式列表

```
GET /order/pay_method_list.api
BaseURL: paymentBaseUrl
```

| 参数          | 类型 | 必填 | 说明                  |
| ------------- | ---- | ---- | --------------------- |
| `cinemaId`    | int  | �?   | 影院 ID               |
| `businessId`  | int  | �?   | 业务 ID（`1`=电影票） |
| `channelType` | int  | �?   | 渠道类型（`2`�?       |

---

#### 3.5.7 创建微信支付

```
POST /order/creat_pay_wx.api
BaseURL: ticketApiUrl
```

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |

---

### 3.6 支付

```
POST /order/merge_payment.api
BaseURL: ticketBaseUrl
```

详见 [3.4.6 合并支付](#346-合并支付)�?

---

### 3.7 退�?

#### 3.7.1 退款详�?

```
POST /order/refund_details.api
BaseURL: ticketBaseUrl
```

| 参数      | 类型   | 必填 | 说明    |
| --------- | ------ | ---- | ------- |
| `orderId` | string | �?   | 订单 ID |

---

#### 3.7.2 查询退款信�?

```
POST /order/query_order_info_for_refund.api
BaseURL: ticketBaseUrl
```

| 参数      | 类型   | 必填 | 说明         |
| --------- | ------ | ---- | ------------ |
| `orderId` | string | �?   | 订单 ID      |
| `json`    | bool   | �?   | 固定�?`true` |

---

#### 3.7.3 执行退�?

```
POST /order/refund_order.api
BaseURL: ticketBaseUrl
```

| 参数      | 类型   | 必填 | 说明    |
| --------- | ------ | ---- | ------- |
| `orderId` | string | �?   | 订单 ID |

---

## 5. 通用服务接口

### 5.1 城市列表

获取万达平台支持的所有城市列表，返回值中�?`id` 即为影院列表接口所需�?`locationId`�?

```
GET /homepage/city.api
BaseURL: commonURI / miscBaseUrl
```

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |

> **请求说明**：无需参数，直�?GET 即可�?
>
> **响应结构**�?
>
> ```json
> {
>   "code": 0,
>   "data": {
>     "city": [
>       {
>         "id": 290,
>         "name": "北京",
>         "count": 1,
>         "pinyinFull": "beijingshi",
>         "pinyinShort": "bjs"
>       },
>       {
>         "id": 37,
>         "name": "大连",
>         "count": 1,
>         "pinyinFull": "dalianshi",
>         "pinyinShort": "dls"
>       }
>     ]
>   }
> }
> ```
>
> | 字段          | 类型   | 说明                                |
> | ------------- | ------ | ----------------------------------- |
> | `id`          | int    | 城市 ID（即影院列表�?`locationId`�? |
> | `name`        | string | 城市名称                            |
> | `pinyinFull`  | string | 全拼                                |
> | `pinyinShort` | string | 拼音首字母缩�?                      |

---

### 5.2 城市定位

根据经纬度获取所在城市信息�?

```
GET /homepage/city_point.api
BaseURL: commonURI / miscBaseUrl
```

| 参数                 | 类型  | 必填 | 说明                   |
| -------------------- | ----- | ---- | ---------------------- |
| `lat`                | float | �?   | 纬度                   |
| `lon`                | float | �?   | 经度                   |
| `type` / `coordType` | int   | �?   | 坐标系类型（默认 `2`�? |

---

### 5.3 地址列表

获取行政区域列表，可用于级联选择�?�?区。不�?`locationId` 返回省级，传父级 `locationId` 返回其下属区域�?

```
GET /location/location_list.api
BaseURL: miscBaseUrl
```

| 参数         | 类型 | 必填 | 说明                        |
| ------------ | ---- | ---- | --------------------------- |
| `locationId` | int  | �?   | 父级区域 ID（不�?顶级省份�? |

> **响应字段**：`govRegions[]`，每项包�?`locationId`, `nameCN`, `namePY`, `parentId`, `parentName`

---

## 5. 卡券接口

### 5.1 会员卡相�?

#### 5.1.1 获取卡详�?

```
GET /card/get_card.api
BaseURL: cardBaseUrl
```

| 参数   | 类型 | 必填 | 说明         |
| ------ | ---- | ---- | ------------ |
| `json` | bool | �?   | 固定�?`true` |

---

#### 5.1.2 卡主题列�?

```
GET /card/theme/list.api
BaseURL: cardBaseUrl
```

| 参数   | 类型 | 必填 | 说明         |
| ------ | ---- | ---- | ------------ |
| `json` | bool | �?   | 固定�?`true` |

---

#### 5.1.3 卡主题详�?

```
GET /card/theme/detail.api
BaseURL: cardBaseUrl
```

| 参数      | 类型 | 必填 | 说明    |
| --------- | ---- | ---- | ------- |
| `themeId` | int  | �?   | 主题 ID |

---

#### 5.1.4 创建卡订�?

```
GET /order/create.api
BaseURL: cardBaseUrl
```

| 参数           | 类型   | 必填 | 说明                |
| -------------- | ------ | ---- | ------------------- |
| `cinemaId`     | int    | �?   | 影院 ID             |
| `coverCode`    | string | �?   | 卡面编码            |
| `salePrice`    | int    | �?   | 售价（分�?          |
| `isGift`       | int    | �?   | 是否礼品（`0`/`1`�? |
| `source`       | string | �?   | 来源                |
| `activityCode` | string | �?   | 活动编码            |

---

#### 5.1.5 创建卡订单详�?

```
GET /card/create_order_detail.api
BaseURL: cardBaseUrl
```

| 参数       | 类型   | 必填 | 说明         |
| ---------- | ------ | ---- | ------------ |
| `json`     | bool   | �?   | 固定�?`true` |
| `order_id` | string | �?   | 订单 ID      |

---

#### 5.1.6 获取影院卡详�?

```
GET /card/cinema_card_detail.api
BaseURL: cardBaseUrl
```

| 参数        | 类型   | 必填 | 说明         |
| ----------- | ------ | ---- | ------------ |
| `json`      | bool   | �?   | 固定�?`true` |
| `coverCode` | string | �?   | 卡面编码     |

---

#### 5.1.7 卡预支付

```
GET /order/prepay.api
BaseURL: cardBaseUrl
```

| 参数        | 类型   | 必填 | 说明         |
| ----------- | ------ | ---- | ------------ |
| `json`      | bool   | �?   | 固定�?`true` |
| `orderId`   | string | �?   | 订单 ID      |
| `payType`   | int    | �?   | 支付类型     |
| `returnUrl` | string | �?   | 回调 URL     |

---

#### 5.1.8 卡支付列�?

```
GET /card/pay/list.api
BaseURL: cardBaseUrl
```

| 参数   | 类型 | 必填 | 说明         |
| ------ | ---- | ---- | ------------ |
| `json` | bool | �?   | 固定�?`true` |

---

#### 5.1.9 绑定会员�?

```
GET /card/bind.api
BaseURL: cardBaseUrl
```

| 参数       | 类型   | 必填 | 说明        |
| ---------- | ------ | ---- | ----------- |
| `cardNo`   | string | �?   | 卡号        |
| `password` | string | �?   | 密码/校验�? |

---

#### 5.1.10 充值列�?

```
GET /card/recharge/list.api
BaseURL: cardBaseUrl
```

| 参数       | 类型 | 必填 | 说明    |
| ---------- | ---- | ---- | ------- |
| `cinemaId` | int  | �?   | 影院 ID |

---

#### 5.1.11 充值订单详�?

```
GET /card/recharge_order_detail.api
BaseURL: cardBaseUrl
```

| 参数      | 类型   | 必填 | 说明    |
| --------- | ------ | ---- | ------- |
| `orderId` | string | �?   | 订单 ID |

---

#### 5.1.12 发送短信（卡相关）

```
POST /card/send_sms.api
BaseURL: cardBaseUrl
```

| 参数     | 类型   | 必填 | 说明   |
| -------- | ------ | ---- | ------ |
| `mobile` | string | �?   | 手机�? |

---

#### 5.1.13 获取卡充值文�?

```
GET /card/get_card_recharge_copywriting.api
BaseURL: userBaseUrl
```

| 参数       | 类型 | 必填 | 说明         |
| ---------- | ---- | ---- | ------------ |
| `cinemaId` | int  | �?   | 影院 ID      |
| `json`     | bool | �?   | 固定�?`true` |

---

### 5.2 礼品卡相�?

#### 5.2.1 礼品卡分享信�?

```
GET /card/share/get.api
BaseURL: cardBaseUrl
```

| 参数      | 类型   | 必填 | 说明    |
| --------- | ------ | ---- | ------- |
| `orderId` | string | �?   | 订单 ID |

---

#### 5.2.2 校验礼品�?

```
GET /card/share/verify_card.api
BaseURL: cardBaseUrl
```

| 参数   | 类型   | 必填 | 说明         |
| ------ | ------ | ---- | ------------ |
| `code` | string | �?   | 礼品卡兑换码 |

---

#### 5.2.3 影院列表（礼品卡�?

```
GET /card/cinemas.api
BaseURL: cardBaseUrl
```

| 参数 | 类型 | 必填 | 说明 |
| ---- | ---- | ---- | ---- |

---

### 5.3 优惠券相�?

#### 5.3.1 优惠券商品列�?

```
GET /coupon/goods/coupon_list.api
BaseURL: couponBaseUrl
```

| 参数   | 类型 | 必填 | 说明         |
| ------ | ---- | ---- | ------------ |
| `json` | bool | �?   | 固定�?`true` |

---

#### 5.3.2 优惠券活动详�?

```
POST /coupon/sale/query_activity_details.api
BaseURL: couponBaseUrl
```

| 参数         | 类型 | 必填 | 说明    |
| ------------ | ---- | ---- | ------- |
| `activityId` | int  | �?   | 活动 ID |

---

#### 5.3.3 优惠券下�?

```
POST /coupon/sale/order.api
BaseURL: couponBaseUrl
```

| 参数             | 类型   | 必填 | 说明                    |
| ---------------- | ------ | ---- | ----------------------- |
| `saleActivityId` | int    | �?   | 销售活�?ID              |
| `productDetail`  | string | �?   | 商品详情（JSON 字符串） |

---

#### 5.3.4 优惠券支�?

```
POST /coupon/sale/payment.api
BaseURL: couponBaseUrl
```

| 参数        | 类型   | 必填 | 说明     |
| ----------- | ------ | ---- | -------- |
| `orderNo`   | string | �?   | 订单�?   |
| `payMethod` | string | �?   | 支付方式 |

---

#### 5.3.5 优惠券订单状�?

```
POST /coupon/sale/order_status.api
BaseURL: couponBaseUrl
```

| 参数      | 类型   | 必填 | 说明   |
| --------- | ------ | ---- | ------ |
| `orderNo` | string | �?   | 订单�? |

---

#### 5.3.6 优惠券支付状�?

```
POST /coupon/sale/payment_status.api
BaseURL: couponBaseUrl
```

| 参数      | 类型   | 必填 | 说明   |
| --------- | ------ | ---- | ------ |
| `orderNo` | string | �?   | 订单�? |

---

#### 5.3.7 优惠券订单详�?

```
POST /coupon/sale/query_coupon_sale_order_detail.api
BaseURL: couponBaseUrl
```

| 参数      | 类型   | 必填 | 说明   |
| --------- | ------ | ---- | ------ |
| `orderNo` | string | �?   | 订单�? |

---

#### 5.3.8 优惠券到期提�?

```
GET /coupon/expireandeffective.api
BaseURL: couponBaseUrl
```

| 参数   | 类型 | 必填 | 说明         |
| ------ | ---- | ---- | ------------ |
| `json` | bool | �?   | 固定�?`true` |

---

#### 5.3.9 领取优惠�?

```
POST /coupon/present/gain.api
BaseURL: couponBaseUrl
```

| 参数   | 类型   | 必填 | 说明         |
| ------ | ------ | ---- | ------------ |
| `code` | string | �?   | 兑换�?       |
| `json` | bool   | �?   | 固定�?`true` |

---

#### 5.3.10 获取优惠券条形码

```
GET /coupon/sale/get_barcode_img.api
BaseURL: couponBaseUrl
```

| 参数   | 类型   | 必填 | 说明 |
| ------ | ------ | ---- | ---- |
| `code` | string | �?   | 券码 |

---

## 6. API 响应格式

### 标准响应结构

```json
{
  "code": 0,
  "data": {
    "bizCode": 0,
    "bizMsg": "success",
    ...业务数据...
  }
}
```

| 字段           | 类型   | 说明                                     |
| -------------- | ------ | ---------------------------------------- |
| `code`         | int    | HTTP 级别状态码（`0` 成功，非 `0` 失败�? |
| `data.bizCode` | int    | 业务状态码（`0` 成功�?                   |
| `data.bizMsg`  | string | 业务消息                                 |

### 常见业务状态码

| bizCode   | 说明             |
| --------- | ---------------- |
| `0`       | 成功             |
| `1001005` | 需要图片验证码   |
| `1001010` | 短信发送频�?     |
| `1000022` | 本日短信使用超限 |
| `1001026` | 其他业务错误     |
| `1016`    | 需要重新登�?     |

### 前端错误码响�?

| HTTP Status | 说明                                       |
| ----------- | ------------------------------------------ |
| `429`       | 请求频率超限，返�?`{code: null, data: {}}` |
