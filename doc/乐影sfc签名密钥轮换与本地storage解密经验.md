# 乐影 SFC 签名密钥轮换与本地 Storage 解密经验

> 日期：2026-09-19
> 状态：**已实施**
> 关联文件：[src/utils/http/sfc-request.js](../../src/utils/http/sfc-request.js)
> 用途：记录乐影（group.leying.com）接口签名因 `key_ver` 轮换导致 `.sig` 失效的排查全过程。核心两条可复现经验：
>
> 1. **如何解包本地缓存的小程序运行时包**（拿到签名函数与兜底盐）
> 2. **如何破解本地 Storage 的 MMKV 加密**（拿到运行时注入的 `secret`）

***

## 一、问题背景

乐影接口请求时，[sfc-request.js](../../src/utils/http/sfc-request.js) 会为每个请求计算 `.sig` 签名。某次抓包发现请求新增了 `key_ver` 字段，且用项目里写死的旧盐 `cf0e5311eaffda07c28253e6916c7cf3` 算出的 `.sig` 与服务端校验不一致，接口被拒。

抓包参数样例（`/city/list`）：

```
cinema_id=
city_id=
client_id=
group=20045
key_ver=202609
pver=7.0
session_id=
source=4
ver=8.5.0
.sig=5cbea4a5a8fc303cafa9e0e638886333
```

核心疑问：多了 `key_ver` 字段后，签名方法该如何调整才能算出与抓包一致的 `.sig`？

***

## 二、签名算法（已确认）

算法未变，仍是 **双重 MD5 + 盐**：

```
sig = hex_md5( hex_md5( 排序拼接参数串 ) + secret )

排序拼接参数串 = key1=value1&key2=value2&...   （key 按字母序升序，末尾去掉最后一个 &）
```

两个关键点：

1. 参数按 `key` 字母序升序排序后再拼接。
2. 内外两层 MD5，中间拼接的盐 `secret` 是**全局固定值，不随** **`group`** **变化**。

`key_ver` 只是"密钥版本号"，本身参与参数拼接（进入被签字符串），但它不是盐。真正的盐来自第三方平台注入的 `ext_json.secret`，平台未下发时兜底旧默认值 `cf0e5311eaffda07c28253e6916c7cf3`。

反编译小程序得到的新版签名函数等价逻辑：

```js
var t = "cf0e5311eaffda07c28253e6916c7cf3";   // 兜底默认盐
if (isUpLoadFromThirdPlatform) t = ext_json.secret || t;   // 第三方平台下发的 secret 优先
sig = hex_md5(hex_md5(排序串) + t);
```

由此确定调查方向：`secret` 是运行时注入的，必须从本地拿到完整 `ext_json`。

***

## 三、重点 1：运行时包缓存 → 解包

### 3.1 小程序代码包缓存在哪

微信 PC 端会把已运行过的小程序代码包缓存到本地。本机有两个位置（分属不同微信数据版本）：

| 目录                                                                                                                  | 说明                         |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `D:\Program Files (x86)\Tencent\WeChat\WeChat Files\Applet\wx7a2d8126634b0e20`                                      | 旧版微信（3.x）缓存目录              |
| `D:\softmove\soft\微信应用数据4.1\61\radium\users\c3589ac50adaad68e2fe35736a22e0c5\applet\packages\wx7a2d8126634b0e20\13` | 新版微信（4.x）缓存目录，`13` 为版本号子目录 |

其中 `wx7a2d8126634b0e20` 是乐影小程序的 `wxid`（AppId）。目录内含 `__APP__.wxapkg`（主包）及若干 `*-sub-*.wxapkg`（分包）。**新版代码包（含** **`key_ver`/`secret`** **逻辑）要在新版缓存目录里找**。

### 3.2 代码包加密格式（V1MMWX）

新版微信的 `wxapkg` 是加密的，明文头部可看到 `V1MMWX` 魔数，其余是密文。加密算法如下：

| 项    | 内容                                                                                             |
| ---- | ---------------------------------------------------------------------------------------------- |
| 密钥派生 | `PBKDF2(password=wxid, salt="saltiest", iterations=1000, keyLen=32, hash=sha1)`，得到 AES-256 key |
| IV   | 固定字符串 `"the iv: 16 bytes"`（16 字节）                                                              |
| 加密方式 | 前 1024 字节用 AES-256-CBC；**剩余字节**逐字节与 `wxid` 倒数第 2 个字符的 charCode 做 XOR                           |

### 3.3 解包脚本（完整可复现）

```js
// decrypt-wxapkg.cjs  —— V1MMWX 加密包解密
const fs = require('fs');
const crypto = require('crypto');

function decryptWxapkg(srcPath, wxid) {
  const buf = fs.readFileSync(srcPath);
  // PBKDF2 派生 AES-256 密钥
  const key = crypto.pbkdf2Sync(wxid, 'saltiest', 1000, 32, 'sha1');
  const iv = Buffer.from('the iv: 16 bytes', 'ascii');

  // 前 1024 字节 AES-256-CBC 解密（用默认 padding，即 setAutoPadding(true)）
  const head = buf.slice(0, 1024);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  // 注：不用 setAutoPadding(false)，否则解密后头部多 padding 字节导致索引区读取错位
  const plainHead = Buffer.concat([decipher.update(head), decipher.final()]);

  // 剩余字节：与 wxid 倒数第 2 个字符 charCode 异或
  const xorKey = wxid.charCodeAt(wxid.length - 2);
  const tail = buf.slice(1024);
  for (let i = 0; i < tail.length; i++) tail[i] ^= xorKey;

  return Buffer.concat([plainHead, tail]);
}

const wxid = 'wx7a2d8126634b0e20';
const plain = decryptWxapkg('D:/.../wx7a2d8126634b0e20/13/__APP__.wxapkg', wxid);
console.log('解密后长度', plain.length); // 明文应以 0xBE 开头
```

> 坑点：解密 `head` 时必须用默认 `setAutoPadding(true)`。第一次尝试用 `setAutoPadding(false)` 导致头部混入 padding 字节，后续按 `readUInt32BE` 读 `fileCount`/`nameLen` 时读到巨大值（offset 越界报错）。改回默认 padding 后头部 0..1024 截取即正确。

### 3.4 明文 wxapkg 结构（索引区定位文件）

解密后的明文是包文件容器，结构如下（大端序）：

| offset               | 长度                | 含义                                                                            |
| -------------------- | ----------------- | ----------------------------------------------------------------------------- |
| 0                    | 1                 | magic `0xBE`                                                                  |
| 5                    | 4                 | `indexInfoLength`（u32 BE，索引区长度）                                               |
| 9                    | 4                 | `bodyInfoLength`（u32 BE）                                                      |
| 13                   | 1                 | `0xED` 分隔标记                                                                   |
| 14                   | 4                 | `fileCount`（u32 BE，文件数）                                                       |
| 18                   | `indexInfoLength` | 索引区，每条 = `nameLen(u32 BE) + name(nameLen 字节) + offset(u32 BE) + size(u32 BE)` |
| 18 + indexInfoLength | —                 | body 区，文件实体依次存放                                                               |

据此可迭代 `fileCount` 次，按 name 找到 `app-service.js`、`app.js` 等文件并 dump 出来。

### 3.5 解包拿到什么

- `app-service.js` → 签名函数 `c`：确认 `sig = md5(md5(排序串) + salt)`，且 `secret` 来自 `getApp().globalData.ext_json.secret`，兜底 `cf0e5311eaffda07c28253e6916c7cf3`。

- `app.js` → `ext.json` 默认值 `{ group:"20008", webview_host:"https://group.leying.com", ... }`（**无 key\_ver/secret**），以及 `onLaunch` 里 `wx.getExtConfigSync()` + `wx.setStorageSync("ext_json", t)` 的落盘逻辑。

**关键结论**：代码包里只有旧默认盐，`secret` 是第三方平台经 `ext.json` 运行时注入并 `wx.setStorageSync("ext_json")` 落到本地 Storage。全包搜 32 位 hex 常量只有 `cf0e5311eaffda07c28253e6916c7cf3`（出现 2 次）——证明 `secret` 不在包里，必须下一层攻 Storage。

***

## 四、重点 2：本地 Storage 破解

### 4.1 Storage 数据在哪

小程序 `wx.setStorage` 的数据落在本地 MMKV 文件，位于（微信 4.x）：

```
...\radium\users\<user_hash>\applet\local\wx7a2d8126634b0e20\
  ├─ usrmmkvstorage0\wx7a2d8126634b0e20       （4096B，加密主数据）
  │                 \wx7a2d8126634b0e20.crc   （元数据，存 IV）
  ├─ usrmmkvstorage1\...                       （同上，预留）
  └─ mmkvadapterstorage\...                    （适配层数据）
```

### 4.2 文件格式（MMKV 加密）

| 文件     | 结构                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------- |
| 主文件    | `offset 0: u32 actualSize`（有效密文长度，小端）；`offset 4: byte[actualSize]` 为 AES 加密 payload；后全为 0x00 填充 |
| `.crc` | `offset 12: byte[16] IV`（关键，AES-CFB 初始向量）；另有 CRC32/version/sequence 等                           |

加密模式为 **AES-128-CFB128**，密钥经零填充到 16 字节。

### 4.3 密钥推导规律（核心，免 attach 进程）

MMKV 的 `cryptKey` 并不真正"随机"，实测满足：

```
cryptKey = "w" + wxid[2::2]
```

即去掉 `wx` 前缀，取剩余 16 个十六进制字符中**下标为偶数**（0、2、4…）的字符，前面加 `"w"`，得到 9 字节 ASCII 串，零填充到 16 字节作为 AES key。

例：`wx7a2d8126634b0e20` → 去掉 `wx` 得 `7a2d8126634b0e20`，取偶数位 → `72826402` → `cryptKey = "w72826402"`。

### 4.4 破解脚本（完整可复现）

```js
// decrypt-storage.cjs  —— 微信小程序 Storage（MMKV）解密
const fs = require('fs');
const crypto = require('crypto');

const wxid = 'wx7a2d8126634b0e20';
const base = 'D:/.../applet/local/wx7a2d8126634b0e20';

// 1) 密钥推导：cryptKey = "w" + wxid[2::2]，零填充到 16 字节
const body = wxid.slice(2);
const evenIdx = body.split('').filter((_, i) => i % 2 === 0).join('');
const cryptKey = 'w' + evenIdx;                 // "w72826402"
const key16 = Buffer.alloc(16);
Buffer.from(cryptKey, 'ascii').copy(key16, 0);

for (const sub of ['usrmmkvstorage0', 'usrmmkvstorage1', 'mmkvadapterstorage']) {
  const mainPath = base + '\\' + sub + '\\' + wxid;
  const crcPath = mainPath + '.crc';
  if (!fs.existsSync(mainPath)) continue;

  const main = fs.readFileSync(mainPath);
  const crc = fs.readFileSync(crcPath);

  const actualSize = main.readUInt32LE(0);       // 有效密文长度（小端）
  const iv = crc.slice(12, 28);                  // .crc offset 12 起 16 字节
  const ct = main.slice(4, 4 + actualSize);      // 有效密文

  const d = crypto.createDecipheriv('aes-128-cfb', key16, iv);
  const pt = Buffer.concat([d.update(ct), d.final()]);

  console.log('===' + sub + '===', pt.toString('utf8'));
}
```

### 4.5 破解结果

解密 `usrmmkvstorage0` 后，明文是 append-only 日志（MMKV 各自 key 追加记录，含微信 JSON 包装）。搜 `ext_json` 命中，二次 JSON 解析得到完整配置：

```json
{
  "app_id": "wx7a2d8126634b0e20",
  "group": 20039,
  "key_ver": "202609",
  "secret": "Y6UfFbZyfhbTPNNWwEje8S84BmPEDhiJ",
  "webview_host": "https://group2.leying365.com",
  "main_body_name": "南宁民族影业文化娱乐有限责任公司",
  "...": "..."
}
```

> 敏感提示：`secret` 属签名密钥，本机破解结果与代码改动不在本文重复扩散，仅记录值与算法；具体值见 [sfc-request.js](../../src/utils/http/sfc-request.js) 第 98 行硬编码。

***

## 五、验证

用破解得到的 `secret` 分别计算两组不同 `group` 的抓包签名，均精确命中：

| 抓包 | group | ver   | 计算得到 sig                           | 与抓包比对 |
| -- | ----- | ----- | ---------------------------------- | ----- |
| A  | 20039 | 8.4.8 | `ff2de47fe6018362e0f9b604a364449f` | ✅ 一致  |
| B  | 20045 | 8.5.0 | `5cbea4a5a8fc303cafa9e0e638886333` | ✅ 一致  |

同时用旧默认盐 `cf0e5311eaffda07c28253e6916c7cf3` 计算两组均不匹配，确认盐已轮换。两组 `group` 不同但 `secret` 相同 → `secret` 是**全局盐，不随 group 变化**。

***

## 六、代码改动

[sfc-request.js](../../src/utils/http/sfc-request.js) 第 98 行，签名函数 `d` 的盐由旧默认值替换为破解得到的新 `secret`：

```js
// 修改前
(r = md5.hex_md5(md5.hex_md5(r) + "cf0e5311eaffda07c28253e6916c7cf3"))
// 修改后
(r = md5.hex_md5(md5.hex_md5(r) + "Y6UfFbZyfhbTPNNWwEje8S84BmPEDhiJ"))
```

`key_ver` 与 `ver` 原本已在代码里维护为 `202609` / `8.5.0`，无需额外改动。

***

## 七、复盘与后续建议

1. **`secret`** **现为硬编码**：一旦乐影再次轮换 `key_ver`，需重新解一次 Storage 拿新 secret。若要避免改代码发版，可将 `secret` 与 `group`、`api_v` 一样纳入影线配置表维护，轮换时改库即可。
2. **密钥推导规律可能随微信版本变化**：`cryptKey = "w" + wxid[2::2]` 是实测规律，若某次解密后读不出任何 key，说明规律失效，需回退到运行时捕获密钥（LLDB attach MMKV `mmkvWithID` 入口）的方式。
3. **解包与解密均为本地离线操作**：全程只需本机磁盘文件，无需 attach 微信进程、无需联网，纯本地取证。
4. **兜底盐与真实盐的区分**：判断"是否需要重新解 secret"的最快方式，是先用代码里当前写死的盐对着新抓包参数算一遍 `.sig`，匹配则无需动，不匹配才进入解包 → Storage 解密流程，避免无谓逆向。

***

## 附：可复现的验签脚本（Node）

```js
const c = require('crypto');
const md5 = s => c.createHash('md5').update(s, 'utf8').digest('hex');
const secret = '<当前 secret>'; // 见 sfc-request.js 第 98 行

function sig(o) {
  const keys = Object.keys(o).sort();
  let s = '';
  for (const k of keys) s += k + '=' + o[k] + '&';
  s = s.slice(0, -1);
  return md5(md5(s) + secret);
}

const params = { cinema_id:'', city_id:'', client_id:'', group:'20045',
  key_ver:'202609', pver:'7.0', session_id:'', source:'4', ver:'8.5.0' };
console.log(sig(params)); // 应等于抓包的 .sig
```

