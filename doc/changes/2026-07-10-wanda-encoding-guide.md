# 万达 API 代理编码特殊处理经验文档

## 背景

万达电影 API 通过 `auto-ticket-service` 后端代理转发，自动添加 WASM 签名。不同网关对中文编码的支持不同，且签名计算必须与请求体的编码**字节级一致**，否则签名验证失败。

---

## 一、三种编码函数对比

| 函数                 | 来源               | 中文编码格式   | 示例（"非"） |
| -------------------- | ------------------ | -------------- | ------------ |
| `encodeURIComponent` | JS 标准            | UTF-8 字节     | `%E9%9D%9E`  |
| `urlEncodeUnicode`   | 小程序 MxApiHelper | Unicode 码点   | `%u975E`     |
| `\uXXXX` 转义        | JSON 标准          | ASCII 转义序列 | `\u975e`     |

**关键区别**：

- `encodeURIComponent` 按 UTF-8 字节编码 → 网关友好
- `urlEncodeUnicode` 按 Unicode 码点编码 → 仅特定网关支持
- `\uXXXX` 是 JSON 内部表示，不依赖 HTTP 编码层 → **绕过网关限制的最佳方案**

---

## 二、Wanda 网关兼容矩阵

| 网关                      | 域名                                  | `%uXXXX` | `%E9%9D%9E` | `\uXXXX` | 适用场景                |
| ------------------------- | ------------------------------------- | -------- | ----------- | -------- | ----------------------- |
| `front-gateway-c`         | front-gateway-c.wandafilm.com         | ❌ 500   | ✅          | ✅       | 通用 API、merge_payment |
| `ticket-api-prd-mx`       | ticket-api-prd-mx.wandafilm.com       | ✅       | ✅          | ✅       | 小程序支付（需微信云）  |
| `mkt-activity-api-prd-mx` | mkt-activity-api-prd-mx.wandafilm.com | ✅       | ✅          | ✅       | 活动/券 API             |
| `cinema-api-prd-mx`       | cinema-api-prd-mx.wandafilm.com       | ✅       | ✅          | ✅       | 影院信息                |

**结论**：只有 `front-gateway-c` 不支持 `%uXXXX`，而 merge_payment 恰好经由此网关。

---

## 三、签名机制

### WASM 签名函数

后端使用小程序提取的 `index_bg.wasm`，导出 `signature`/`signatureq` 函数：

```
signature(timestamp, uri, dataString) → check hash
```

- **GET**：`uri = "apiPath?queryString"`, `dataString = ""`
- **POST**：`uri = "apiPath"`, `dataString = "key1=val1&key2=val2..."`

签名结果放入 `X-RY-CHECK` 请求头，Wanda 服务端同样计算后比对。

### 关键约束

1. **签名计算的 dataString 必须 = 实际发出的请求体**（字节级一致）
2. WASM 签名函数通过 `urlEncodeUnicode` 编码的输入经过验证（小程序原生场景）
3. 如果改用 `encodeURIComponent` 编码 → 签名不匹配 → 403

---

## 四、GET 请求的签名陷阱

### 问题

```
签名计算: encodeURIComponent → ?allotseat=%7B%22...%3A...%2C...
axios发出: paramsSerializer   → ?allotseat=%7B%22...:...,...
                                    ↑ 冒号未被编码  ↑ 逗号未被编码
```

axios 的默认 `paramsSerializer` 会反向替换 `%3A`→`:`、`%2C`→`,` 等，导致实际 URL 与签名计算的 query string 不一致。

### 解决方案

```js
// proxyWandaFilmApi.js
const { headers, dataStr } = await wandaSign.buildRequestHeaders({ ... });

// 用签名计算的 dataStr 直接拼 URL，不走 axios params
const querySuffix = methodUpper === 'GET' && dataStr ? '?' + dataStr : '';
const targetUrl = `${baseUrl}${apiPath}${querySuffix}`;

// 不传 params，避免 axios 二次编码
const response = await axios({ url: targetUrl, ... });
```

**原理**：`dataStr` 是签名计算时用的 query string，直接拼入 URL 保证字节一致。

---

## 五、POST 请求的中文编码策略

### 问题链

```
requestInfo 含中文 (ticketName: "非一线")
    ↓
urlEncodeUnicode → %u975E%u4E00%u7EBF
    ↓
front-gateway-c 不支持 %uXXXX → 500
    ↓
尝试切 encodeURIComponent → %E9%9D%9E%E4%B8%80%E7%BA%BF
    ↓
WASM 签名与 encodeURIComponent 不兼容 → 403
```

### 最终方案：`\uXXXX` JSON 转义

在进入 HTTP 编码层**之前**，将中文转为 JSON 标准的 `\uXXXX` 转义：

```js
// proxyWandaFilmApi.js — merge_payment 特殊处理
const escapeNonAscii = s =>
  s.replace(
    /[^\x00-\x7F]/g,
    ch => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0")
  );

// voucher 内 JSON 含中文时
if (key === "voucher" && hasNonAscii(obj[key])) {
  const vObj = JSON.parse(obj[key]);
  const vClean = JSON.stringify(vObj);
  obj[key] = hasNonAscii(vClean) ? escapeNonAscii(vClean) : vClean;
}
```

**编码链路**：

```
原始中文:  非一线
    ↓ escapeNonAscii
JSON转义:  \u975e\u4e00\u7ebf  (纯ASCII)
    ↓ urlEncodeUnicode (\ → %5C)
HTTP传输:  %5Cu975e%5Cu4e00%5Cu7ebf
    ↓ Wanda 端 URL 解码
还原转义:  \u975e\u4e00\u7ebf
    ↓ JSON.parse
最终中文:  非一线
```

**优势**：

- 不改变 `urlEncodeUnicode` 编码函数（签名兼容 ✅）
- 全程不出现 `%uXXXX`（front-gateway-c 兼容 ✅）
- JSON 标准 `\uXXXX` 可被任意 JSON 解析器还原

---

## 六、merge_payment 请求处理完整流程

```
前端发送 POST /wanda-film/ticket/order/merge_payment.api
    ↓
前端拦截器 (wanda-film-request.js)
    ├─ 提取 wanda_token → session_id header
    ├─ 添加 user-token, user-identifier header
    └─ URL 改写: /svpi/wanda-film-ser/ticket/order/merge_payment.api
    ↓
Vite 代理: /svpi → 剥离前缀
    ↓
后端 proxyWandaFilmApi.js
    ├─ 解析路径: baseAlias=ticket, apiPath=/order/merge_payment.api
    ├─ 解析请求体: { orderId, mobilePhone, cinemaId, requestInfo }
    ├─ 添加 json=true, cartSnackInfo
    ├─ merge_payment 特殊处理:
    │   ├─ 解析 requestInfo JSON
    │   ├─ ticketTypeName 中文 → 回退 ticketType
    │   ├─ voucher 中文 → \uXXXX 转义
    │   └─ 其他字段中文 → 删除
    ├─ buildRequestHeaders:
    │   ├─ POST: dataStr = key1=urlEncodeUnicode(val1)&...
    │   ├─ wasmUri = apiPath
    │   ├─ wasmData = dataStr
    │   └─ check = wasmSignature(ts, wasmUri, wasmData)
    ├─ 构建 MX-API, X-RY-CHECK 等请求头
    ├─ buildPostData: 发送体 = key1=urlEncodeUnicode(val1)&...
    └─ axios POST → front-gateway-c.wandafilm.com
    ↓
Wanda API
    ├─ 验签: 根据请求体重新计算签名，与 X-RY-CHECK 比对
    ├─ 处理 merge_payment 业务逻辑
    └─ 返回 { bizCode, tradeNo, ... }
```

---

## 七、编码问题排查清单

| 症状                             | 可能原因                          | 排查方向                                          |
| -------------------------------- | --------------------------------- | ------------------------------------------------- |
| 403 "signature validate failure" | 签名与请求体不一致                | 对比 dataStr 与实际发出的 body/URL                |
| 403 (GET)                        | axios paramsSerializer 改了编码   | 改用 dataStr 直拼 URL                             |
| 403 (POST)                       | 编码函数与 WASM 不兼容            | 确认使用 urlEncodeUnicode                         |
| 500 (front-gateway-c)            | 出现 %uXXXX 编码                  | 检查是否有多字节字符未预处理                      |
| 93330020 支付失败                | discountPrice 超限或 voucher 损坏 | 检查 discountPrice ≤ orderPrice，voucher 数据完整 |

---

## 八、设计原则总结

1. **签名与请求体必须字节一致**：不要在签名计算和实际发送之间做任何编码变换
2. **中文预处理优于编码层切换**：在数据进入 HTTP 编码前转为 ASCII，避免依赖特定编码函数
3. **`\uXXXX` 是最安全的 ASCII 化方案**：JSON 原生支持，不依赖 HTTP 层，双向可逆
4. **GET 用 dataStr 直拼 URL**：不信任任何 HTTP 库的参数序列化器
5. **POST 保持 urlEncodeUnicode**：与 WASM 签名函数匹配，不随意切换
