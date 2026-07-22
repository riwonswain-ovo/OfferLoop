# OfferLoop 多 Agent 兼容说明

当前版本：`0.1.0-alpha.1`。四份公共 `SKILL.md` 是唯一业务真源，安装器只负责复制、冲突保护、备份和平台发现检查。

## 认证矩阵

| Agent | 文件安装 | Agent 发现 | 离线预检 | 线上只读 | 写入能力 |
|---|---|---|---|---|---|
| Codex | 自动测试通过 | 全局目录契约已验证 | 自动测试通过 | 按飞书身份验收 | 每次依资源授权 |
| Claude Code | 自动测试通过 | 全局目录契约已验证 | 自动测试通过 | 按飞书身份验收 | 每次依资源授权 |
| Hermes | 自动测试通过 | 全局目录契约已验证 | 自动测试通过 | 按飞书身份验收 | 每次依资源授权 |
| 腾讯 WorkBuddy | 未认证 | 未认证 | 未认证 | 未认证 | 未认证 |

“文件安装”不等于获得飞书、邮箱或日历权限。在线身份、scope、应用发布、租户安装、资源共享和 token 状态在离线预检中始终是 `unverified`。

## 安装器状态

- `installed`：四个 Skill 已复制。
- `already_installed`：目标内容与当前版本完全一致。
- `conflict`：目标目录内容不同，或 Hermes 的 `skills.external_dirs` 中存在会造成运行时歧义的同名副本；未覆盖。
- `upgraded`：在 Skills 根目录的上级 `.offerloop-backups/` 保留可恢复备份后已替换，避免备份被递归加载。
- `prepared_for_import`：仅在未来生成且验证过 WorkBuddy 导入包时使用。当前版本不返回此状态。
- `unsupported`：目标尚未获得足够的真实产品契约来安全安装。

JSON 结果与安装清单不记录用户名、私有绝对路径、App ID、token、密码或其他凭证。

## Hermes 特别说明

Hermes 会同时扫描 `~/.hermes/skills/` 和 `config.yaml` 中登记的 `skills.external_dirs`。同名 Skill
同时存在于两个根时，原生列表可能仍显示该名称，但显式预加载会因候选歧义而失败。安装器会在写入前
检查这些外部根：默认返回 `conflict`；只有用户明确使用 `--upgrade` 时，才将旧外部副本备份到
对应根目录上级的 `.offerloop-backups/` 并清理重复项。备份不放在任何 Skills 根内，避免再次被扫描。

## WorkBuddy 发布门禁

当前安装器对 `--agent workbuddy` 返回 `unsupported`。这是有意的安全边界：仅知道存在 `skill.yml` 不足以推断导入 schema、包目录、能力声明或审批机制。

只有以下门禁全部通过后，才可开启 `prepared_for_import` 或自动安装：

1. 在真实腾讯 WorkBuddy 中创建最小自定义 Skill 并导出；
2. 用脱敏样本锁定 `skill.yml` schema、包结构和导入方式；
3. 从四份公共 Skill 自动生成包装层，不复制第五套业务逻辑；
4. 依次验收 `setup → collection → reminder → workspace → full`；
5. 在真实应用中确认飞书、邮箱和其他外部写入前会继续要求人工确认。

真实应用导入是人工发布门禁，CI 不能代替。
