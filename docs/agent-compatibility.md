# OfferLoop 多 Agent 兼容说明

7 个公共 `SKILL.md` 是长期业务能力真源。安装器负责跨 Agent 安装、冲突保护、可恢复备份、隐藏管理运行时和只读验证。

| Agent | 安装目录 | 离线验证 |
| --- | --- | --- |
| Codex | `~/.codex/skills` | 冷安装、重复安装、升级、manifest |
| Claude Code | `~/.claude/skills` | 冷安装、重复安装、升级、manifest |
| Hermes | `~/.hermes/skills` | 冷安装、重复安装、外部重名检测 |
| WorkBuddy | `~/.workbuddy/skills` | 冷安装、重复安装、随机导入重名检测 |

安装状态：

- `installed`：7 个长期 Skill 和 `.offerloop-runtime` 已写入。
- `already_installed`：内容摘要与 manifest 完全一致。
- `conflict`：发现不同内容或运行时重名；默认不覆盖。
- `upgraded`：旧内容已移到 Skills 根目录外的 `.offerloop-backups`，随后原地升级。

文件安装不等于获得飞书、邮箱、日历或妙搭权限。在线身份、scope、应用发布、租户安装、资源共享和 token 状态在离线预检中必须保持 `unverified`。

本机 Agent Worker 不属于任何 Agent 的兼容路径。工作台的生成式任务统一打开原生 Agent 新任务并预填上下文。
