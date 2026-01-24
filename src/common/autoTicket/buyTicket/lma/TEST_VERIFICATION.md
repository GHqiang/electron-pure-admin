# LMA模块化架构测试验证清单

## 一、代码完整性检查 ✅

### 1.1 文件结构
- [x] `lma/offerManage.js` - 报价管理模块
- [x] `lma/buyTicket.js` - 出票主流程模块
- [x] `lma/cardQuanManage.js` - 卡券管理模块
- [x] `lma/cinemaManage.js` - 影院管理模块
- [x] `lma/seatManage.js` - 座位管理模块
- [x] `lma/orderManage.js` - 订单管理模块

### 1.2 基类继承
- [x] `getLmaOfferPrice` 继承 `BaseOfferPrice`
- [x] `LmaBuyTicket` 继承 `BaseBuyTicket`

### 1.3 工厂注册
- [x] `commonOfferHandle.js` 中对 LMA 使用 `lma/offerManage` 新实现（无开关，直接使用）
- [x] `buyTicket/index.js` 中注册 `LmaBuyTicket`

## 二、功能模块测试

### 2.1 报价功能测试

#### 测试场景1：基础报价流程
```javascript
// 测试步骤：
1. 调用 getOfferPriceFun({ appFlag: "lma", plat_name: "xxx" }) 获取报价实例
   // 注意：LMA 已全面使用新实现，无需开关
2. 传入订单信息调用 getEndOfferPrice({ order, offerList })
3. 验证返回结果包含 endPrice, offerRule, order_number

// 预期结果：
- 成功返回报价结果
- 日志记录完整
- 无异常抛出

// 快速测试入口：
// window.lmaOfferObj("mayi", "lma").getEndOfferPrice({ order: orderJson })
```

#### 测试场景2：会员价获取（LMA特殊逻辑）
```javascript
// 测试步骤：
1. 订单会员价 >= 33 时
2. 验证是否使用 -5元券逻辑
3. 检查 real_member_price 处理

// 预期结果：
- 正确判断是否使用券
- 会员价计算正确
```

#### 测试场景3：成本价计算
```javascript
// 测试步骤：
1. 测试加价规则（offer_type !== "1"）
2. 测试用券规则（offer_type === "1"）
3. 验证成本价计算逻辑

// 预期结果：
- 成本价计算正确
- 不同规则类型处理正确
```

### 2.2 出票功能测试

#### 测试场景1：完整出票流程
```javascript
// 测试步骤：
1. 创建 LmaBuyTicket 实例
2. 调用 singleTicket() 方法
3. 验证完整流程：
   - getCinemaLoginInfo() - 获取登录信息
   - getOrderOfferRule() - 获取报价规则
   - checkOfferRuleRes() - 校验规则
   - oneClickBuyTicket() - 一键买票

// 预期结果：
- 流程完整执行
- 各步骤日志记录完整
- 返回结果包含 profit, qrcode, submitRes 等
```

#### 测试场景2：影院信息获取
```javascript
// 测试步骤：
1. 测试 cinemaManage.getBuyPrevCinemaInfo() - 获取购票前影院信息（内部调用 getCityCinemaList）
2. 测试 cinemaManage.getMoviePlayInfo() - 获取电影放映信息
3. 测试 cinemaManage.getMoviePlayDate() - 获取放映日期
4. 测试 seatManage.getSeatLayout() - 获取座位布局

// 预期结果：
- 各接口调用成功
- 数据解析正确
- 错误处理完善
```

#### 测试场景3：卡券使用
```javascript
// 测试场景：
1. 测试 useCardHandle() - 使用会员卡
2. 测试 useQuanHandle() - 使用优惠券
3. 测试 getNewQuan() - 获取新券
4. 测试 updateQuanStock() - 更新券库存

// 预期结果：
- 卡券使用逻辑正确
- 库存更新及时
- 错误处理完善
```

#### 测试场景4：锁座和订单处理
```javascript
// 测试场景：
1. 测试 seatManage.lockseatByApp() - 锁定座位（锁座即创建订单）
2. 测试 orderManage.pripriceCalculation() - 计算价格（调用 get_order 接口）
3. 测试 orderManage.buyTicket() - 购买票
4. 测试 orderManage.payOrder() - 获取取票码（从 booking_id 字段）
5. 测试 orderManage.getQrcodeUploadByPlat() - 上传取票码

// 预期结果：
- 锁座成功
- 价格计算正确（从 price_str 字段获取支付金额）
- 购买流程完整
- 取票码上传成功
```

#### 测试场景5：换号重试逻辑
```javascript
// 测试场景：
1. 模拟用卡失败场景
2. 模拟用券失败场景
3. 验证 currentParamsInx 递增
4. 验证换号重试逻辑

// 预期结果：
- 自动换号重试
- 重试次数限制正确
- 最终失败时走转单逻辑
```

#### 测试场景6：异步轮询取票码
```javascript
// 测试场景：
1. 模拟 payOrder() 首次返回空
2. 验证 asyncFetchQrcodeSubmit() 启动
3. 验证3分钟和10分钟轮询逻辑
4. 验证取票码最终上传

// 预期结果：
- 异步轮询正常启动
- 轮询间隔正确（20秒）
- 最终成功获取并上传取票码
```

### 2.3 辅助功能测试

#### 测试场景1：卡券库存更新
```javascript
// 测试场景：
1. updateCardDayUse() - 更新卡日使用量
2. updateQuanStock() - 更新券库存
3. updateCardBalance() - 更新卡余额
4. updateMonthlyLimit() - 更新月使用量限制

// 预期结果：
- 各更新方法执行成功
- 数据更新正确
- 日志记录完整
```

## 三、集成测试

### 3.1 新旧实现对比测试
```javascript
// 测试步骤：
1. 使用旧实现执行一次完整流程，记录结果
2. 使用新实现执行相同流程，记录结果
3. 对比结果一致性

// 对比项：
- 报价金额是否一致
- 使用的卡/券是否一致
- 最终利润是否一致
- 取票码是否一致
```

### 3.2 开关切换测试
```javascript
// 注意：LMA 已全面切换新实现，无开关机制
// 此测试场景不适用

// 如需对比新旧实现，可手动切换 commonOfferHandle.js 中的实现
```

## 四、错误处理测试

### 4.1 异常场景测试
```javascript
// 测试场景：
1. 网络请求失败
2. 接口返回错误
3. 数据格式异常
4. 业务逻辑错误

// 预期结果：
- 错误被正确捕获
- 错误日志记录完整
- 错误信息提示清晰
- 转单逻辑正确执行
```

### 4.2 边界条件测试
```javascript
// 测试场景：
1. 空数据/空列表处理
2. 数据格式异常
3. 参数缺失
4. 极端数值

// 预期结果：
- 边界条件处理正确
- 不会导致程序崩溃
- 错误提示清晰
```

## 五、性能测试

### 5.1 执行时间对比
```javascript
// 测试步骤：
1. 记录旧实现执行时间
2. 记录新实现执行时间
3. 对比性能差异

// 预期结果：
- 新实现性能不低于旧实现
- 无明显性能退化
```

### 5.2 内存使用
```javascript
// 测试步骤：
1. 监控内存使用情况
2. 检查是否有内存泄漏
3. 验证模块化后内存使用是否优化

// 预期结果：
- 无内存泄漏
- 内存使用合理
```

## 六、回归测试

### 6.1 功能回归
- [ ] 所有原有功能正常工作
- [ ] 特殊逻辑（如-5元券）正常
- [ ] 转单逻辑正常
- [ ] 换号重试逻辑正常

### 6.2 数据一致性
- [ ] 报价结果一致
- [ ] 出票结果一致
- [ ] 卡券使用记录一致
- [ ] 库存更新一致

## 七、测试执行建议

### 7.1 测试环境
1. 准备测试订单数据
2. 准备测试账号和卡券
3. 准备测试环境配置

### 7.2 测试步骤
1. **单元测试**：逐个模块测试
2. **集成测试**：完整流程测试
3. **对比测试**：新旧实现对比
4. **压力测试**：多订单并发测试

### 7.3 测试工具
- 浏览器控制台
- 日志查看工具
- 网络请求监控
- 性能分析工具

## 八、已知问题和注意事项

### 8.1 已知问题
- 无

### 8.2 注意事项
1. LMA 已全面使用新实现，无需开关设置
2. 测试时注意观察日志输出
3. 对比测试时确保使用相同测试数据
4. 注意检查卡券库存更新是否及时
5. 报价/出票测试入口和详细说明请参考 [LMA模块说明文档](./LMA_README.md)

## 九、测试通过标准

### 9.1 功能标准
- [ ] 所有功能模块正常工作
- [ ] 错误处理完善
- [ ] 日志记录完整
- [ ] 报价/出票测试通过（测试入口见 [LMA模块说明文档](./LMA_README.md)）

### 9.2 质量标准
- [ ] 无语法错误
- [ ] 无运行时错误
- [ ] 代码规范符合要求
- [ ] 性能无明显退化

### 9.3 兼容性标准
- [ ] 不影响其他功能
- [ ] 向后兼容（接口签名保持一致）

## 十、测试报告模板

```
测试日期：YYYY-MM-DD
测试人员：XXX
测试环境：XXX

测试结果：
- 报价功能：✅/❌
- 出票功能：✅/❌
- 卡券管理：✅/❌
- 错误处理：✅/❌
- 性能表现：✅/❌

问题记录：
1. [问题描述]
2. [问题描述]

结论：
[测试结论]
```
