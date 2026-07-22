# OfferLoop 多 Agent 兼容说明

当前版本：`0.1.0-alpha.1`。四份公共 `SKILL.md` 是唯一业务真源，安装器只负责复制、冲突保护、备份和平台发现检查。

## 认证矩阵

| Agent | 文件安装 | Agent 发现 | 离线预检 | 线上只读 | 写入能力 |
|---|---|---|---|---|---|
| Codex | 自动测试通过 | 全局目录契约已验证 | 自动测试通过 | 按飞书身份验收 | 每次依资源授权 |
| Claude Code | 自动测试通过 | 全局目录契约已验证 | 自动测试通过 | 按飞书身份验收 | 每次依资源授权 |
| Hermes | 自动测试通过 | 全局目录契约已验证 | 自动测试通过 | 按飞书身份验收 | 每次依资源授权 |
| OpenClaw | 自动测试通过 | 可检测全局覆盖与 allowlist | 自动测试通过 | 需宿主/sandbox 分别验收 | 每次依资源授权 |
| 腾讯 WorkBuddy | 未认证 | 未认证 | 未认证 | 未认证 | 未认证 |

“文件安装”不等于获得飞书、邮箱或日历权限。在线身份、scope、应用发布、租户安装、资源共享和 token 状态在离线预检中始终是 `unverified`。

## 安装器状态

- `installed`：四个 Skill 已复制。
- `already_installed`：目标内容与当前版本完全一致。
- `conflict`：同名目录内容不同，未覆盖。
- `upgraded`：在 Skills 根目录的上级 `.offerloop-backups/` 保留可恢复备份后已替换，避免备份被递归加载。
- `shadowed`：安装完成，但 OpenClaw 更高优先级目录中存在不同版本。
- `installed_but_hidden`：文件已安装，但 allowlist 或 OpenClaw 发现结果没有暴露全部 Skill。
- `prepared_for_import`：仅在未来生成且验证过 WorkBuddy 导入包时使用。当前版本不返回此状态。
- `unsupported`：目标尚未获得足够的真实产品契约来安全安装。

JSON 结果与安装清单不记录用户名、私有绝对路径、App ID、token、密码或其他凭证。

## OpenClaw 特别说明

默认全局目标是 `~/.openclaw/skills/`；设置 `OPENCLAW_STATE_DIR` 时使用该 state 目录下的 `skills/`。OpenClaw 还可能从默认 workspace、`agents.defaults.workspace`、`agents.list[].workspace`、`OPENCLAW_WORKSPACE_DIR` 和 `~/.agents/skills/` 加载高优先级同名 Skill，并支持最多六层的分组目录。如果这些位置存在不同摘要，安装器返回 `shadowed` 而不声称新版已生效。

安装器以 JSON5 读取 `openclaw.json`，并在允许的配置根内解析 `$include`。如配置了 `agents.defaults.skills`、`agents.list[].skills` allowlist 或 `skills.entries.<name>.enabled=false`，需确保四个 OfferLoop Skill 都可见。安装后重新启动 OpenClaw 或开启下一轮会话，用 `openclaw skills list --eligible --json` 确认实际可见性，并确认 sandbox 中也能执行 `lark-cli`。

## WorkBuddy 发布门禁

当前安装器对 `--agent workbuddy` 返回 `unsupported`。这是有意的安全边界：仅知道存在 `skill.yml` 不足以推断导入 schema、包目录、能力声明或审批机制。

只有以下门禁全部通过后，才可开启 `prepared_for_import` 或自动安装：

1. 在真实腾讯 WorkBuddy 中创建最小自定义 Skill 并导出；
2. 用脱敏样本锁定 `skill.yml` schema、包结构和导入方式；
3. 从四份公共 Skill 自动生成包装层，不复制第五套业务逻辑；
4. 依次验收 `setup → collection → reminder → workspace → full`；
5. 在真实应用中确认飞书、邮箱和其他外部写入前会继续要求人工确认。

真实应用导入是人工发布门禁，CI 不能代替。
