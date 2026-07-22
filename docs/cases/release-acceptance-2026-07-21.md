# OfferLoop 0.1.0-alpha.1 发布前验收

验收日期：2026-07-21。本记录仅声明已实际执行或已配置的验收项，不把目录复制等同于在线权限或真实产品认证。

## 已通过

- 仓库合同与安装器单元测试：92 项通过。
- `job-collection` 脚本测试：19 项通过。
- `recruiting-reminder` 脚本测试：18 项通过。
- 求职进展同步服务测试：20 项通过。
- 四 Agent 隔离 HOME 冷安装：Codex、Claude Code、Hermes、腾讯 WorkBuddy 均安装四个 Skill，重复执行返回 `already_installed`。
- Claude Code：在 CC Switch 当前启用的第三方模型环境中，真实加载发布版 `offerloop-setup` 并从个人安装目录执行 `collection` JSON 预检；本地项全部 `ready`，未发生配置或线上写入。该结论不泛化到其他第三方模型。
- 冲突不覆盖、`--upgrade` 先备份、安装清单脱敏、`--agent all` 只处理已列目标。
- Windows 预检不使用 POSIX `0600` 位作为保密性判断，避免在三系统冷安装中误阻断。
- 四份公共 frontmatter 仅包含单行 `name` 和 `description`，并通过仓库兼容检查。
- 离线预检保持 `schema_version: 1`，且会检查 `lark-cli >= 1.0.73`、profile 列表和 `doctor --offline`。

## CI 发布门禁

CI 已配置 Ubuntu、macOS 和 Windows 的四 Agent 隔离 HOME 冷安装。三系统 GitHub Actions 均已通过；本地验收仍只代表当前 macOS 环境。

## 未解除的外部门禁

- 腾讯 WorkBuddy：真实 5.1.7 运行时已验证 AgentSkills `SKILL.md` 目录加载与四项离线预检；当前 WorkBuddy 可见的 `lark-cli` 低于 1.0.73，升级该依赖并选择 profile 前，涉及飞书的本地 profile 检查仍会保持 `blocked`。
- 飞书、邮箱、日历、知识库和妙搭的在线身份/权限必须依用户和资源单独验收，离线通过不代表已授权。
