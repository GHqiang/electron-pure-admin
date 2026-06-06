# 2026-06-05-万达ticket-api网关切换及出票文件修复

## 背景

微信小程序中，`ticket-api-prd-mx.wandafilm.com` 的所有接口强制走 `wx.cloud.gateway.call()`，直接 HTTP 请求返回 403 "signature validate failure"。

## 根因

`xhrRequest.js` 第 87 行：

```javascript
U.baseUrl.includes("ticket-api-prd-mx") && "prd" === c.default.env
  ? wx.cloud.gateway.call(...)  // 强制走微信云网关
  : wx.request(U)
```

## 解决方案

通过抓取万达 App 的 HTTPS 包（`doc/请求抓包详情.txt`），发现 App 使用 **`front-gateway-c.wandafilm.com`**（统一网关），不走微信云网关，可以直连。

## 修改文件清单

### 后端

| 文件                                           | 变更                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `auto-ticket-service/middlewares/wandaSign.js` | `ticket` 别名从 `ticket-api-prd-mx` 改为 `front-gateway-c` |

### 前端

| 文件                                                      | 变更                                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/api/wanda-film-api.js`                               | 排期接口路由从 `ticket` 改为 `cinema`；更新顶部注释                                                                     |
| `src/common/autoTicket/buyTicket/wanda/buyTicket.js`      | 修复 `getMovieInfoFromFilmName`→`cinemaManage.getMovieInfo`；移除 8 个未使用导入；移除多余构造参数                      |
| `src/common/autoTicket/buyTicket/wanda/offerManage.js`    | 重写 `calculateFinalPrice` 对齐 SFC 管线；新增 `getMinAmountOfferRule`；添加 `calculateCostProfit`；移除 4 个未使用导入 |
| `src/common/autoTicket/buyTicket/wanda/seatManage.js`     | 修复座位状态字段 `seatStatus`→`status`；修复价格来源从区域取；新增 `findConsecutiveSeats` 连续座位逻辑                  |
| `src/common/autoTicket/buyTicket/wanda/orderManage.js`    | 修复 `transferOrderByPlat`→`orderTransferByPlat`；修复 `releaseSeat` 缺 `session_id`；移除未使用导入                    |
| `src/common/autoTicket/buyTicket/wanda/cinemaManage.js`   | 移除未使用的 `getTargetCinemaCommon` 导入                                                                               |
| `src/common/autoTicket/buyTicket/wanda/cardQuanManage.js` | 移除未使用的 `orderManage` 参数                                                                                         |

## 发现的 Bug 及修复

| 严重程度 | 文件             | Bug                                                                            | 修复                                    |
| :------: | ---------------- | ------------------------------------------------------------------------------ | --------------------------------------- |
|    🔴    | `buyTicket.js`   | `getMovieInfoFromFilmName(film_name)` 签名错误（应传 `{filmName, movieData}`） | 改用 `cinemaManage.getMovieInfo(order)` |
|    🔴    | `seatManage.js`  | `s.seatStatus === 0` — 万达 API 字段是 `status`，值 `1`=可售                   | 改为 `s.status === 1`                   |
|    🔴    | `seatManage.js`  | `salesPrice` 从座位取，实际在 `area.areaPrice`                                 | 选座时注入区域价格                      |
|    🔴    | `offerManage.js` | `applyDynamicPricing` 用 `rewards` 当 `offerList`，类型不对                    | 对齐 SFC 管线，正确传入 `offerList`     |
|    🔴    | `offerManage.js` | 缺失 `getMinAmountOfferRule` 方法                                              | 新增实现                                |
|    🔴    | `offerManage.js` | `calculateFinalPrice` 过于简化，缺利润加价/夜间顶价/超限检查                   | 对齐 SFC 完整管线                       |
|    🔴    | `orderManage.js` | `transferOrderByPlat` 方法名错误（应为 `orderTransferByPlat`）                 | 修正                                    |
|    🔴    | `orderManage.js` | `releaseSeat` 调用 `cancelOrder` 缺 `session_id`                               | 补充参数                                |

## 最终路由方案

| 接口类型              | 域名                |   别名   |
| --------------------- | ------------------- | :------: |
| 排期 (`showtime/*`)   | `cinema-api-prd-mx` | `cinema` |
| 座位/订单 (`order/*`) | `front-gateway-c`   | `ticket` |
| 会员卡                | `card-api-prd-mx`   |  `card`  |
| 优惠券                | `coupon-api-prd-mx` | `coupon` |
| 通用                  | `misc-api-prd-mx`   |  `misc`  |

## 验证

- ✅ TypeScript 类型检查通过
- ✅ `real_time_seat.api` HTTP 200 (gateway)
- ✅ `create_order.api` HTTP 200 (gateway)
- ✅ `by_cinema.api` HTTP 200 (cinema-api)
- ✅ `by_cinema_film_date.api` HTTP 200 (cinema-api)
- ✅ 抓包重放 HTTP 200

## 回归风险

- `ticket-api-prd-mx` 已被完全替换为 `front-gateway-c`，原有的 ticket 接口路径不变
- 签名方式不变（仍使用 WASM 签名）
- 前端 API 调用方式不变
- `offerManage.js` 报价管线已对齐 SFC 标准模式
