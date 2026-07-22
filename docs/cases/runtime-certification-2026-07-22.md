# OfferLoop 多 Agent 运行时认证（2026-07-22）

本记录只包含脱敏后的本机运行时结论，不记录用户名、绝对路径、身份令牌、App ID 或资源定位信息。

## 已验证

- Codex：统一安装器升级四个 Skill 后重复执行均为 `already_installed`；真实 `read-only`、临时会话成功触发并读取 `offerloop-setup`。
- Hermes：原生 `skills list` 可发现四个 Skill；修复 `skills.external_dirs` 同名碰撞后，Hermes 自身的预加载解析器返回 `loaded=['offerloop-setup']`、`missing=[]`，并注入完整 Skill 内容。
- 四套安装副本：Codex、Claude Code、Hermes、OpenClaw 的 `full` 离线预检结果一致，均为 32 项本地检查 `ready`、0 项 `blocked`/`needs_action`、6 项线上条件 `unverified`。
- 安装幂等：Codex、Claude Code、Hermes 再次安装均返回 `already_installed`；OpenClaw 在存在高优先级旧副本时准确返回 `shadowed`。
- Hermes 碰撞保护：默认安装返回 `conflict`，`--upgrade` 会先备份外部旧副本再清理重复来源；新增自动回归测试。

## 尚未认证

- Claude Code：文件安装和离线预检通过，但本机认证代理在无工具、无持久化的单轮会话中无响应，因此 Agent 实际加载保持 `unverified`；该结果不能归因于 Skill 内容。
- OpenClaw：认证主机未安装 `openclaw` 命令，无法执行原生 `skills list --eligible --json`、重启后加载或 sandbox 中 `lark-cli` 可执行性验证。
- 腾讯 WorkBuddy：仍缺真实应用导出的最小 `skill.yml` 与导入包契约，保持 `unsupported`。
- 飞书、邮箱、日历、知识库与工作台：本轮未访问线上资源，身份、scope、租户安装和写入能力继续保持 `unverified`。

## 认证结论

Codex 达到真实 Agent 发现与只读加载门禁；Hermes 达到原生发现和预加载解析门禁，并暴露、修复了共享目录同名碰撞。Claude Code 与 OpenClaw 仍需要具备可用宿主运行时的复验，不能统一宣称五个 Agent 已全部认证。
