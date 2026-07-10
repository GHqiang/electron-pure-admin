# 万达用券支付功能实现总结

## 概述

为万达影院系列新增**用券（兑换券）支付**能力，对标小程序和 iOS App 的完整用券流程。涉及前端购票逻辑、API 定义、后端代理签名与编码三个层面的修改。

---

## 修改文件清单

| 文件                                                      | 修改类型    | 说明                                                            |
| --------------------------------------------------------- | ----------- | --------------------------------------------------------------- |
| `src/api/wanda-film-api.js`                               | 新增 API    | 添加 selectCoupon、encryptionToPay、conponUse 三个接口          |
| `src/common/autoTicket/buyTicket/wanda/buyTicket.js`      | 修改        | discountPrice 封顶、voucher 使用 allotseat、storedCard 只用首卡 |
| `src/common/autoTicket/buyTicket/wanda/cardQuanManage.js` | 新增 + 修改 | selectCoupon 两步流程、conponuse 确认、price 封顶               |
| `src/common/core/BaseBuyTicket.js`                        | 修改        | 测试 OfferRule 改为用券模式                                     |
| `src/common/autoTicket/commonQuanStock.js`                | 修改        | last_used_time 空值修复                                         |
| `auto-ticket-service/middlewares/wandaSign.js`            | 修改        | buildRequestHeaders 返回 dataStr                                |
| `auto-ticket-service/middlewares/proxyWandaFilmApi.js`    | 重构        | GET 直拼 URL、voucher 中文 \uXXXX 转义                          |

---

## 核心技术问题与解决方案

### 问题 1：`selectcoupon.api` 可通但 `conponuse.api` 返回 403

**根因**：GET 请求的签名数据和 axios 实际发出的 query string 编码不一致。

- 签名计算：`encodeURIComponent` → `%3A`（冒号）、`%2C`（逗号）
- axios 发出：默认 paramsSerializer 会反向替换 `%3A`→`:`、`%2C`→`,`
- 简单参数（纯数字字母）不受影响，但 `allotseat` 是 JSON 含大量 `:` `,`，导致签名不匹配

**修复**：

- `wandaSign.js`：`buildRequestHeaders` 返回值增加 `dataStr`（签名用的完整 query string）
- `proxyWandaFilmApi.js`：GET 请求直接拼 `baseUrl + apiPath + '?' + dataStr`，不再走 axios `params`（避免二次编码）

### 问题 2：`merge_payment` 返回 93330020（支付失败）

**根因 A**：`discountPrice` 超过订单总价。

- conponuse 对兑换券返回 `price: 0`（全抵扣无需补差）
- fallback 使用 `salePrice: 3700`（券面值 37 元）
- 但订单总价仅 3300（33 元），3700 > 3300 → Wanda 拒绝

**修复**：在 `cardQuanManage.js` 和 `buyTicket.js` 双重封顶 `discountPrice`：

```js
// cardQuanManage.js
const maxDiscountFen = Math.round(seatPayTotalPrice * 100);
const finalPrice = Math.min(rawPrice, maxDiscountFen);

// buyTicket.js
const maxDiscount = Math.round(orderPrice * 100);
const discountPrice = Math.min(rawDiscount, maxDiscount);
```

**根因 B**：`sanitize()` 递归清除 voucher 中的中文，损坏 allotseat JSON 导致 Wanda 无法匹配券。

**修复**：voucher 内的中文改用 JSON 标准 `\uXXXX` 转义（纯 ASCII），不直接删除：

```
非一线 → \u975e\u4e00\u7ebf
```

Wanda 服务端 `JSON.parse` 自动还原为中文。

### 问题 3：`merge_payment` 返回 500（front-gateway-c 拒绝 %uXXXX 编码）

**根因**：`urlEncodeUnicode` 对中文编码为 `%uXXXX` 格式（Unicode 码点），而 `front-gateway-c` 只接受标准 UTF-8 编码 `%E9%9D%9E`。

**尝试方案**：切换为 `encodeURIComponent` — 导致签名 403（WASM 签名函数与 `encodeURIComponent` 不兼容）。

**最终方案**：保持 `urlEncodeUnicode`，但在进入编码前将 voucher 中的中文预先转为 `\uXXXX` ASCII 转义序列。`\` 被 `urlEncodeUnicode` 编码为 `%5C`，全程不出现 `%uXXXX`。

---

## 完整用券流程（对照小程序）

```
小程序:                              本系统:
ncoupons.api (获取券列表)     →     getPayQuanList (ncoupons.api)
selectcoupon.api (预选)       →     selectCoupon (selectcoupon.api)
conponuse.api (确认+获取价格)  →     selectCoupon 内第二步 (conponuse.api)
convertDataStructure (构建参数) →     buyTicket.js 构建 requestInfo
merge_payment.api (支付)      →     orderManage.createOrder (merge_payment.api)
```

**注意**：`conponuse.api` 对兑换券返回 `price: 0` 是正常行为（表示全额兑换无需补差价），本系统已通过 `salePrice` fallback + 封顶正确处理。

---

## 用卡场景兼容性验证

纯卡支付场景的代码路径不受本次修改影响：

| 验证点                                       | 结果                                         |
| -------------------------------------------- | -------------------------------------------- |
| `storedCardPayments` ticketTypeName 中文处理 | 回退为 ticketType（逻辑不变）                |
| 卡号、金额等 ASCII 字段                      | 完全保留（`urlEncodeUnicode` 对 ASCII 不变） |
| `voucher` 特殊处理                           | 纯卡场景无此字段，跳过                       |
| 签名计算                                     | `urlEncodeUnicode` 与原来一致                |
| POST body 编码                               | `buildPostData` 与原来一致                   |

---

## 附录：相关文件中的关键常量

**conponuse.api 行为差异**：

- 小程序/App：直接调用，返回 `price`（实际抵扣金额）
- 兑换券（detailtype='T'）：`price: 0`（全抵扣），`able: true`
- 代金券（detailtype='L'）：`price` 为实际金额
- 本系统：`price: 0` 时 fallback 到 `salePrice`（allotseat JSON 面值），再封顶到订单总价

**Wanda 网关差异**：

- `front-gateway-c`：不支持 `%uXXXX` → 需要 voucher 中文转 `\uXXXX`
- `ticket-api-prd-mx`：需微信云网关 → 不可从服务端直连
- `mkt-activity-api-prd-mx`：活动/券接口 → GET 请求正常
