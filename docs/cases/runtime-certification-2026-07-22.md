# OfferLoop 多 Agent 运行时认证（2026-07-22）

本记录只包含脱敏后的本机运行时结论，不记录用户名、绝对路径、身份令牌、App ID 或资源定位信息。

## 已验证

- Codex：在空白临时仓库的新 `read-only`、临时会话中，仅通过自然语言自动加载全局 `offerloop-setup`，并从安装目录执行 `collection` JSON 预检；返回 `schema_version: 1`，且无 `blocked`/`needs_action`。
- Hermes：原生 `skills list` 可发现四个 Skill；修复 `skills.external_dirs` 同名碰撞后，新会话仅通过自然语言调用 `skill_view` 加载 `offerloop-setup`，并从 Hermes 安装目录实际执行 `collection` JSON 预检。验收同时发现 Hermes 终端把 `python3` 解析到 macOS 3.9；预检现会自动切换到 PATH 中可用的 Python 3.10+，复验中 `local.python` 已恢复为 `ready`。该 Hermes 会话可见的 lark-cli profile 集合与宿主交互式终端不同，因此现有跨 Agent 配置的 profile 被准确报告为 `blocked`；这不影响 Skill 加载结论，但使用 Hermes 的用户需在 Hermes 可见环境中选择并登记 profile。
- 四套安装副本：从宿主终端直接执行时，Codex、Claude Code、Hermes、OpenClaw 的 `full` 离线预检结果一致，均为 32 项本地检查 `ready`、0 项 `blocked`/`needs_action`、6 项线上条件 `unverified`；真实 Agent 会话仍以各自可见的命令、HOME 和 profile 为准。
- 安装幂等：Codex、Claude Code、Hermes 再次安装均返回 `already_installed`；OpenClaw 在存在高优先级旧副本时准确返回 `shadowed`。
- Hermes 碰撞保护：默认安装返回 `conflict`，`--upgrade` 会先备份外部旧副本再清理重复来源；新增自动回归测试。

## 尚未认证

- Claude Code：文件安装和离线预检通过，但新的无持久化单轮会话在模型请求阶段返回 HTTP 401 / `No API key available`，尚未进入 Skill 加载；Agent 实际加载保持 `unverified`，该结果不能归因于 Skill 内容。
- OpenClaw：认证主机未安装 `openclaw` 命令，无法执行原生 `skills list --eligible --json`、重启后加载或 sandbox 中 `lark-cli` 可执行性验证。
- 腾讯 WorkBuddy：仍缺真实应用导出的最小 `skill.yml` 与导入包契约，保持 `unsupported`。
- 飞书、邮箱、日历、知识库与工作台：本轮未访问线上资源，身份、scope、租户安装和写入能力继续保持 `unverified`。

## 认证结论

Codex 达到自然语言触发、真实加载和安装目录只读执行门禁；Hermes 达到相同门禁，并暴露了默认 `python3` 版本漂移。Claude Code 与 OpenClaw 仍需要具备可用宿主运行时的复验，不能统一宣称五个 Agent 已全部认证。
