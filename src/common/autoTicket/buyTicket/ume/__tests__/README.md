# UME 模块单元测试说明

## 测试文件结构

```
ume/__tests__/
├── cinemaManage.test.js    # 影院管理模块测试
├── seatManage.test.js      # 座位管理模块测试
├── cardQuanManage.test.js  # 卡券管理模块测试
├── orderManage.test.js     # 订单管理模块测试
├── offerManage.test.js     # 报价管理模块测试
└── buyTicket.test.js      # 出票主流程模块测试（待补充）
```

## 运行测试

### 运行所有 UME 测试
```bash
npm test -- --testPathPattern="ume/__tests__"
```

### 运行单个测试文件
```bash
npm test -- --testPathPattern="ume/__tests__/cinemaManage.test.js"
```

### 运行测试并查看覆盖率
```bash
npm test -- --testPathPattern="ume/__tests__" --coverage
```

## 测试覆盖情况

### ✅ cinemaManage.test.js
- `getCityCinemaList()` - 获取城市影院列表
- `getMoviePlayInfo()` - 获取电影放映信息
- `getMoviePlayTime()` - 获取电影放映场次

### ✅ seatManage.test.js
- `getSeatLayout()` - 获取座位布局
- `getTargetSeat()` - 获取目标座位（支持座/号/列格式）
- `lockSeatHandle()` - 锁定座位

### ✅ cardQuanManage.test.js
- `getQuanInfo()` - 获取券类型信息
- `getQuanListByPhone()` - 获取优惠券列表
- `getUsableCardList()` - 获取可用会员卡列表

### ✅ orderManage.test.js
- `getOptimalCardQuanCompose()` - 获取最优卡券组合
- `createOrder()` - 创建订单（含超时重试）
- `cancelOrder()` - 取消订单

### ✅ offerManage.test.js
- `getEndMatchOfferRule()` - 获取最终匹配报价规则（含wanxiangh5特殊处理）
- `getEndOfferPrice()` - 获取最终报价
- `getMostSeatPrice()` - 计算最多座位价格

### ⏳ buyTicket.test.js
- 待补充

## 测试统计

- **测试套件**: 5 个（buyTicket 待补充）
- **测试用例**: 20+ 个
- **通过率**: 目标 100% ✅

## Mock 说明

测试中 Mock 了以下依赖：

1. **API 模块**: `APP_API_OBJ`, `svApi`
2. **工具函数**: `@/utils/utils` 中的各种工具函数
3. **其他模块**: `cardQuanManage`, `cinemaManage`, `seatManage`, `orderManage`, `platManage`
4. **Logger**: 完整的 Logger mock，包括 `getLastErrMsgAndInfo` 等方法
5. **Store**: `platTokens` store
6. **旧模块**: `umeOffer.js`（用于wanxiangh5特殊处理）

## 注意事项

1. 测试使用 Jest 和 jsdom 环境
2. 所有 API 调用都被 Mock，不会发送真实请求
3. 测试数据使用模拟数据，不依赖真实环境
4. 测试覆盖了正常流程和异常处理场景
5. UME 特殊逻辑测试：
   - wanxiangh5 特殊处理
   - 座位名称格式统一（座/号/列）
   - 创建订单超时重试

## 持续集成

这些测试可以在 CI/CD 流程中自动运行，确保代码质量。
