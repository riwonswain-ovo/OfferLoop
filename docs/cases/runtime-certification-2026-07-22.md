# OfferLoop 多 Agent 运行时认证（2026-07-22）

本记录只包含脱敏后的本机运行时结论，不记录用户名、绝对路径、身份令牌、App ID 或资源定位信息。

## 已验证

- Codex：在空白临时仓库的新 `read-only`、临时会话中，仅通过自然语言自动加载全局 `offerloop-setup`，并从安装目录执行 `collection` JSON 预检；返回 `schema_version: 1`，且无 `blocked`/`needs_action`。
- Claude Code：将个人安装副本升级到 `v0.1.0-alpha.1` 后，在新会话中通过 CC Switch 当前启用的第三方模型明确调用 `Skill(offerloop-setup)`；运行时报告 `Successfully loaded skill`，并从 Claude Code 个人 Skill 安装目录执行 `collection` JSON 预检。结果返回 `schema_version: 1`、`local.skills: ready`，其余本地项均为 `ready`；线上权限和已登记通知保持 `unverified`。本次未写配置，也未访问飞书、邮箱或网络。该结论只覆盖本次实际 Provider 与模型，不泛化到 CC Switch 中的其他第三方模型或官方 Anthropic 后端。
- Hermes：原生 `skills list` 可发现四个 Skill；修复 `skills.external_dirs` 同名碰撞后，新会话仅通过自然语言调用 `skill_view` 加载 `offerloop-setup`，并从 Hermes 安装目录实际执行 `collection` JSON 预检。验收同时发现 Hermes 终端把 `python3` 解析到 macOS 3.9；预检现会自动切换到 PATH 中可用的 Python 3.10+，复验中 `local.python` 已恢复为 `ready`。该 Hermes 会话可见的 lark-cli profile 集合与宿主交互式终端不同，因此现有跨 Agent 配置的 profile 被准确报告为 `blocked`；这不影响 Skill 加载结论，但使用 Hermes 的用户需在 Hermes 可见环境中选择并登记 profile。
- WorkBuddy：在真实腾讯 WorkBuddy 5.1.7 中，技能管理页发现四个 OfferLoop Skill；新建空白工作区后，运行时实际加载 `offerloop-setup`，解析到 WorkBuddy 用户安装目录，并执行 `collection → reminder → workspace → full` 的只读离线预检。四项均生成 `schema_version: 1` 结果；当前 WorkBuddy 可见的 `lark-cli` 低于 1.0.73，导致 `local.profile_locator` 正确保持 `blocked`，线上权限和已登记通知保持 `unverified`。外部飞书 Skill 已从 WorkBuddy 飞书连接器中发现，未访问飞书、邮箱或浏览器，也未创建或修改业务资源。
- 三套既有安装副本：从宿主终端直接执行时，Codex、Claude Code、Hermes 的 `full` 离线预检结果一致，均为 32 项本地检查 `ready`、0 项 `blocked`/`needs_action`、6 项线上条件 `unverified`；真实 Agent 会话仍以各自可见的命令、HOME 和 profile 为准。
- 安装幂等：Codex、Claude Code、Hermes、WorkBuddy 再次安装均返回 `already_installed`；并修复了内容一致时仍创建 staging 目录的问题，使幂等路径真正零写入。
- Hermes 碰撞保护：默认安装返回 `conflict`，`--upgrade` 会先备份外部旧副本再清理重复来源；新增自动回归测试。

## 尚未认证

- 飞书、邮箱、日历、知识库与工作台：本轮未访问线上资源，身份、scope、租户安装和写入能力继续保持 `unverified`。

## 认证结论

Codex、Claude Code、Hermes 与腾讯 WorkBuddy 均达到真实加载和安装目录只读执行门禁。Claude Code 的认证覆盖 CC Switch 当前启用的第三方模型；WorkBuddy 的真实产品契约是用户目录中的 AgentSkills `SKILL.md`，不需要 `skill.yml` 包装层，其当前业务阻塞来自 WorkBuddy 运行环境可见的旧版 `lark-cli`，不是 Skill 发现或执行失败。所有线上和写入能力继续分别认证。
