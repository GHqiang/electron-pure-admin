# AGENTS.md

项目架构、开发命令与交付约定见 [CLAUDE.md](./CLAUDE.md)。

## 生产问题排查路由（必须遵守）

当用户提到订单号、出票失败、报价失败、锁座失败、拉单无日志、队列停摆等生产问题，并要求排查或分析原因时：

1. 必须调用 `analyze-issue` 技能（完整定义在 `.agents/skills/analyze-issue/SKILL.md`），按其 SOP 执行；
2. 全程只读取证，分析报告落盘到 `reports/analyze-issue/`（两者均为本地文件、不入库）后停止等待用户确认；
3. 未经用户明确确认，禁止修改任何业务代码；
4. 服务器地址、数据库配置等敏感信息不得出现在任何对话、文档或报告中。

## 版本控制约定（必须遵守）

1. 完成代码或文档变更后，**不要代为执行 `git add` / `git commit` / `git push`**，改动留在工作区，由用户自行检查并提交；
2. 仅当用户在当次对话中**明确要求提交**时，才可执行提交类命令；
3. 只读类 git 命令（`git status` / `git diff` / `git log`）不受此限制。

## 跨工具接入说明

本机使用的 AI 编程工具（trae / work buddy / deepseek 桌面版 / zcode / qoder 等）统一约定：

- 支持 Agent Skills 标准的工具直接扫描 `.agents/skills/` 即可发现 analyze-issue；
- 其余工具在其"规则/自定义指令"里加一行指向 `.agents/skills/analyze-issue/SKILL.md` 即可复用同一 SOP；
- 排查取证的 CLI 为 `scripts/prod-query.js`（连接信息由本机配置提供，均不入库）。
