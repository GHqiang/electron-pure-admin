# 2026-08-18 MySQL 慢日志轮转检查与配置脚本

## 背景

分析慢 SQL 时发现 `/www/server/data/mysql-slow.log` 单文件已累积 **145 万+ 行**（2024-06-11 至今 2 年从未轮转），同目录 MySQL 错误日志 `iZf8zbgem0zig0ll352jsuZ.err` 同样无轮转（8.9 万+ 行）。需确认是否配置了轮转，并补齐。

## 检查结论：未配置任何轮转

| 检查项 | 结果 |
|---|---|
| 宝塔计划任务（13 个） | 1 个 Node 日志分割（autoService）+ 11 个 autoticket 库备份 + 1 个 Node 重启；**无 MySQL 日志轮转** |
| 面板日志分割配置 `/www/server/panel/data/run_log_split.conf` | 仅 `autoService`（30MB 分割）；**无 mysql-slow** |
| 系统 logrotate（/etc/logrotate.d） | 敏感目录不可读，宝塔 MySQL 慢日志默认不归其管 |
| 慢日志轮转副本 | `/www/server/data/` 下仅有 `mysql-slow.log` 本体，无 `.1/.2` 等 |
| 磁盘余量 | 50.5% 已用，暂未爆盘，但慢日志以每 2 年 145 万行的速度增长 |

## 修改文件清单

| 文件 | 说明 |
|---|---|
| `scripts/ops/mysql-slowlog-logrotate.conf` | logrotate 配置：慢日志 + 错误日志，每日轮转、保留 14 天、gzip 压缩、copytruncate（无需重启 MySQL） |
| `scripts/ops/setup-mysql-slowlog-rotation.sh` | 一键安装脚本：写入 /etc/logrotate.d、立即验证、配置每日 03:30 crontab |

## 部署方式（需在服务器上以 root 执行）

```bash
cd auto-ticket-service/scripts/ops
bash setup-mysql-slowlog-rotation.sh
```

脚本幂等，可重复执行；使用 `copytruncate` 不会中断 MySQL 慢日志写入。

## 附加发现（建议后续处理）

1. **binlog 索引残留**：`mysql-bin.index` 列出 800+ 个 binlog，磁盘实际只有 `mysql-bin.000001~000006`；2025-01-28 启动时曾出现大量 `Could not open log file`（binlog 被外部清理但 index 未同步）。建议核实 binlog 清理策略（`expire_logs_days` / 面板 binlog 任务）。
2. 慢日志当前仍每日大量写入（2026-08-16 仍有记录），轮转配置生效后可保持单文件可控，便于后续慢 SQL 分析。

## 测试结果

- 本地校验：logrotate 配置语法经 `logrotate -d`（debug 模式）推演通过。
- **服务器实测（2026-08-18 已部署成功）**：
  - `/etc/logrotate.d/mysql-slow` 写入成功（391 字节，root:root 644）
  - `logrotate -f -v` 强制轮转通过：`mysql-slow.log`（66M）→ `mysql-slow.log-20260818`；`iZf8zbgem0zig0ll352jsuZ.err`（16M）→ `.err-20260818`；原文件 copytruncate 截断为 0，MySQL 继续写入未中断
  - crontab 已写入：`30 3 * * * /usr/sbin/logrotate -f /etc/logrotate.d/mysql-slow >> /var/log/logrotate-mysql-slow.log 2>&1 # mysql-slowlog-rotate`，`crontab -l | grep` 验证通过
  - 说明：`delaycompress` 生效，轮转当天的副本次日 03:30 由 logrotate 自动压缩为 `.gz`

## 回归风险评估

- 仅新增运维脚本与配置，不触碰业务代码与运行中进程；`copytruncate` 为业界标准做法，MySQL 无需重启。
- 风险点：若服务器 logrotate 版本过旧（CentOS 8 自带 logrotate 3.14+ 均支持 `dateformat` 与 `copytruncate`），脚本执行时会显式报错，不会静默损坏日志。
