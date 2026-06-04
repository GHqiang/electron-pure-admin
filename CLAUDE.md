# CLAUDE.md

## 项目概述

electron-pure-admin 是一个基于 Electron + Vue 3 的影院票务管理系统，用于多平台电影票报价、出票、锁座、订单管理等业务。基于 [vue-pure-admin](https://github.com/xiaoxian521/pure-admin-thin) 脚手架开发。

## 常用命令

```bash
yarn install          # 安装依赖
yarn dev              # 桌面端开发
yarn browser:dev      # 浏览器端开发
yarn build            # 桌面端打包
yarn build:staging    # staging 打包（自动更新版本号）
yarn test             # 运行测试
yarn test:watch       # 监听模式测试
yarn test:coverage    # 测试覆盖率
yarn typecheck        # 类型检查
yarn lint             # 代码规范检查（eslint + prettier + stylelint）
```

## 核心业务架构

本系统管理多个票务平台的自动化报价和出票流程：

**平台体系**：支持猎人、省APP、芒果、蚂蚁、洋葱、影划算、商展、哈哈、守兔、麻花等平台，每个平台有独立的 API 模块（`src/api/`）、请求实例（`src/utils/http/`）、适配器（`src/common/platform/adapters/`）、报价队列（`src/common/platform/queues/`）和订单获取器（`src/common/platform/fetchers/`）。

**影院体系**：支持 SFC/乐影、UME、卢米埃、辰星、凤凰、金逸等多个影院系列，按 `app_name` 标识。影院配置通过 Pinia store 管理（`src/store/cinemaList.js`），登录信息通过 `localStorage` 存储（`src/store/appUserInfo.js`）。

**核心基类**（`src/common/core/`）：`BasePlatformAdapter`（平台适配器）、`BaseOfferPrice`（报价逻辑）、`BaseOfferQueue`/`BaseTicketQueue`（报价/出票队列）、`BaseOrderFetcher`（订单获取）、`BaseBuyTicket`（出票逻辑）。工厂模式见 `src/common/factories/`。

### 添加新平台

1. 在 `src/common/platform/configs/platform-config.js` 添加平台配置
2. 在 `src/common/platform/adapters/` 创建适配器（继承 `BasePlatformAdapter`）
3. 在 `src/common/platform/queues/` 创建报价队列（继承 `BaseOfferQueue`）
4. 在 `src/common/platform/fetchers/` 创建订单获取器（继承 `BaseOrderFetcher`）
5. 在 `src/api/` 创建 API 模块
6. 在 `src/utils/http/` 创建请求实例

详细步骤参见 `src/common/MIGRATION_GUIDE.md`。

### 测试

- 测试文件位于 `src/common/tests/`，命名：`*.test.js`
- Jest 配置在 `jest.config.cjs`，运行单个测试：`npx jest path/to/test.test.js`

## 工作流约定

执行以下场景时，**先用 Read 工具读取对应的全局 skill 文件**，然后严格遵循其定义的流程：

| 场景 | Skill 文件路径 |
|------|---------------|
| 新功能设计、需求分析 | `C:/Users/24675/.agents/skills/brainstorming/SKILL.md` |
| 编写实现计划 | `C:/Users/24675/.agents/skills/writing-plans/SKILL.md` |
| 按计划执行实现 | `C:/Users/24675/.agents/skills/executing-plans/SKILL.md` |
| 遇到 bug、测试失败、异常行为 | `C:/Users/24675/.agents/skills/systematic-debugging/SKILL.md` |
| 测试驱动开发 | `C:/Users/24675/.agents/skills/test-driven-development/SKILL.md` |
| 代码修改完成后验证 | `C:/Users/24675/.agents/skills/verification-before-completion/SKILL.md` |
| 发起代码评审 | `C:/Users/24675/.agents/skills/requesting-code-review/SKILL.md` |
| 处理代码评审反馈 | `C:/Users/24675/.agents/skills/receiving-code-review/SKILL.md` |

**使用规则**：
- 遇到匹配场景时，主动读取对应 SKILL.md 并按其流程执行，无需用户提醒
- 如果场景同时匹配多个 skill（如新功能开发同时涉及 brainstorming + writing-plans），按顺序依次执行
- 读取 skill 后向用户说明："正在使用 [skill名称] 处理当前任务"

## 交付规范

### 变更记录

每轮代码修改完成后，在 `doc/changes/` 目录下产出变更文档：

- 文件名格式：`YYYY-MM-DD-<简短功能描述>.md`
- 内容包含：修改文件清单、核心变更说明、测试结果、回归风险评估
