# OfferLoop 多 Agent 兼容说明

当前候选版本：`0.1.0-alpha.2`。四份公共 `SKILL.md` 是唯一业务真源，安装器只负责复制、冲突保护、备份和平台发现检查。

## 认证矩阵

| Agent | 文件安装 | Agent 发现 | 离线预检 | 线上只读 | 写入能力 |
|---|---|---|---|---|---|
| Codex | 自动测试通过 | 全局目录契约已验证 | 自动测试通过 | 按飞书身份验收 | 每次依资源授权 |
| Claude Code | 自动测试通过 | 本机 CC Switch 环境通过 | 真实 `collection` 预检通过 | 按飞书身份验收 | 每次依资源授权 |
| Hermes | 自动测试通过 | 全局目录契约已验证 | 自动测试通过 | 按飞书身份验收 | 每次依资源授权 |
| 腾讯 WorkBuddy | 自动测试通过 | 本机 5.1.7 通过 | 真实 `collection` 预检通过 | 按飞书身份验收 | 每次依资源授权 |

“文件安装”不等于获得飞书、邮箱或日历权限。在线身份、scope、应用发布、租户安装、资源共享和 token 状态在离线预检中始终是 `unverified`。

Claude Code 的真实运行时认证使用 CC Switch 当前启用的第三方模型完成：运行时明确调用
`offerloop-setup`，并从个人 Skill 安装目录执行 `collection` JSON 预检。该结论只覆盖本次实际
使用的 Provider 与模型，不自动代表 CC Switch 中的其他第三方模型；不同模型仍需分别确认工具调用兼容性。

## 安装器状态

- `installed`：四个 Skill 已复制。
- `already_installed`：目标内容与当前版本完全一致。
- `conflict`：目标目录内容不同，或 Hermes 的 `skills.external_dirs` 中存在会造成运行时歧义的同名副本；未覆盖。
- `upgraded`：在 Skills 根目录的上级 `.offerloop-backups/` 保留可恢复备份后已替换，避免备份被递归加载。
- `prepared_for_import`：为只能通过界面导入的平台生成待导入包；当前 WorkBuddy 已有稳定用户目录，因此不返回此状态。
- `unsupported`：目标没有足够的真实产品契约，无法安全安装；当前已列 Agent 不返回此状态。

JSON 结果与安装清单不记录用户名、私有绝对路径、App ID、token、密码或其他凭证。

## Hermes 特别说明

Hermes 会同时扫描 `~/.hermes/skills/` 和 `config.yaml` 中登记的 `skills.external_dirs`。同名 Skill
同时存在于两个根时，原生列表可能仍显示该名称，但显式预加载会因候选歧义而失败。安装器会在写入前
检查这些外部根：默认返回 `conflict`；只有用户明确使用 `--upgrade` 时，才将旧外部副本备份到
对应根目录上级的 `.offerloop-backups/` 并清理重复项。备份不放在任何 Skills 根内，避免再次被扫描。

## WorkBuddy 特别说明

腾讯 WorkBuddy 5.1.7 的真实用户目录和[腾讯最新 Skills 文档](https://cloud.tencent.com/document/product/1831/134516)均使用 AgentSkills 结构：
`SKILL.md` 为必需文件，`scripts/`、`references/`、`assets/` 为可选资源。本机用户级目录为
`~/.workbuddy/skills/`，因此安装器直接复制四份公共 Skill，不生成 `skill.yml` 或第五套业务指令。

WorkBuddy 的界面导入可能把 Skill 存在随机 ID 目录中。安装器会按 `SKILL.md` 的 `name` 检查这些
目录：默认遇到同名副本时返回 `conflict`；只有使用 `--upgrade` 才会先备份旧副本，再安装到稳定
名称目录。外部 Lark Skills 通过 WorkBuddy 的飞书连接器提供；预检会检查连接器目录，但不会把
连接器存在等同于线上身份和权限已经可用。

WorkBuddy 的 PATH 会优先使用其管理目录中的 `lark-cli`，因此宿主终端运行 `lark-cli update` 不一定
会升级 WorkBuddy 实际调用的副本。预检若识别到该副本低于 `1.0.73`，会先提示更新飞书连接器；
本机 WorkBuddy 5.1.7 的兼容恢复方式是运行
`npm install -g --prefix "$HOME/.workbuddy/binaries/node/cli-connector-packages" @larksuite/cli@latest`，
再重启 WorkBuddy。不要手工复制可执行文件，也不要在聊天中发送 profile 或应用凭证。

真实应用加载、线上只读和任何写入能力仍须分别认证；CI 不能代替这些门禁。
