# 生产 updateCardDayUse 崩溃修复说明（一键买票异常）

> 日期：2026-08-21
> 状态：已实施（待提交，版本 6.6.43，紧急修复）
> 现象来源：6.6.42 打包上线后生产报错

---

## 一、问题现象（生产）

```
TypeError: Cannot read properties of undefined (reading 'order')
提示：一键买票异常，请及时联系技术
```

## 二、根因分析

6.6.42 提交 `131011b7`（调整 logger.init 都采用解构方式传参）将 4 个系列（chenxing/fenghuang/jinyi/wanda）`buyTicket.js` 中**模块级函数 `updateCardDayUse`** 内的 logger 初始化从显式解构传参改为 `logger.init(this.order)`：

```js
// 模块顶层箭头函数——ESM 严格模式下 this === undefined
const updateCardDayUse = ({ app_name, card_id, plat_name, order_number, add_count }) => {
  ...
  logger.init(this.order);  // ← this 为 undefined，执行到此处必然抛 TypeError
```

`this.order` 读取 undefined 的 `order` 属性 → 抛错 → 被出票主流程"一键买票异常"catch 捕获 → 微信推送。**该函数在每次"用卡购买后更新当天使用量"时执行**（出票成功路径），属高概率触发。

## 三、修复内容（order 传参方案，统一解构 init）

| 文件 | 修改 |
| --- | --- |
| `chenxing/fenghuang/jinyi/wanda/buyTicket.js` × 4 | ① 调用方 `await updateCardDayUse({ order: this.order, app_name: appFlag, card_id, plat_name, order_number, add_count: ticket_num })`——显式传入出票订单；② `updateCardDayUse` 签名增加 `order` 参数；③ 内部 `logger.init(order)` 统一解构 init（order 自带 app_type_code 等全字段，扩展性好——后续 logger 需要新字段无需改调用点） |

其余 17 处 `logger.init(this.order)`（cardQuanManage 13 处 + orderManage 4 处）均在类方法内（this=实例，且 this.order 已过 handleNewOrder 补全 app_type_code），无需改动——已逐处核对。

## 四、验证

- `node --check`：4 个修改文件全部通过
- eslint：4 个文件无新增错误
- jest：v3ModeSync / loggerUpload / rootErrCache 全部通过，exit 0
- 代码审查：全仓 21 处 `logger.init(this.order)` 逐一核对 this 语义（4 处模块级函数已修，17 处类方法安全）

## 五、为什么之前没检查出来（复盘）

1. **语法/风格检查不覆盖运行时语义**：`this.order` 语法完全合法，`node --check` 与 eslint 均无法发现 ESM 模块级函数的 this=undefined；
2. **测试盲区**：jest 套件未覆盖出票完整流程（updateCardDayUse 路径），单元测试无法暴露；
3. **审查盲区**：`131011b7` 提交时仅核对文件清单与 diff stat，未逐行验证 this 绑定语义——本次修复已对全仓同类写法（`logger.init(this.order)`）逐一核查，避免同类遗漏；
4. 后续提交前对"this 使用"类改动应增加语义审查（模块级函数禁用 this / 类方法内可用），并考虑为 updateCardDayUse 补单测。

## 六、回归风险

- **低**：修改仅涉及 4 个 buyTicket.js 的 updateCardDayUse logger 初始化（由崩溃改回正确传参），不影响出票流程其他逻辑；app_type_code 补传与拉单器补全方案一致，日志分级语义不变
