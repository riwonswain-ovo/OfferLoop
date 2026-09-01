# OfferLoop 0.1.0-alpha.15

候选日期：2026-09-01。此版本先经过开发仓与公开候选 CI；得到发布确认后再创建 prerelease。

本版本同时修复新用户安装过程看似“卡住”和公开安装缺少自动化闭环的问题。由于安装包、资源创建
流程和就绪门禁均发生变化，本候选必须重新执行真实飞书验收，不再沿用 alpha.14 的线上结果。

## 修复

- WorkBuddy 随机导入目录和 Hermes `skills.external_dirs` 的同名 Skill 检查改为每个根目录只遍历一次；扫描最多六层，跳过符号链接、`node_modules`、`tests`、`evals`、`dist` 和 `build`。
- 人类可读安装输出现在会持续显示源校验、目标扫描、暂存、安装、依赖检查和完成阶段；`--json` 仍只输出 JSON。
- 本地 Skill 安装、工作区依赖、飞书工作区、同步自动化和每日卡片改为可独立观察的阶段。缺少 Lark 依赖不再让本地安装显得未完成，也不会由安装器自动运行 `npm` 或 `npx`。
- `phases` 作为兼容字段加入 setup 结果；现有顶层 `status`、`install`、`next_prompt` 和退出码保持兼容。
- 缺少 `lark-cli >= 1.0.73` 或 `lark-base`、`lark-doc`、`lark-wiki` 时，结果会先给出依赖恢复说明；依赖就绪后才引导飞书初始化。
- 完整就绪现在要求企业主表与五张分类子表双向同步、企业清单/笔面试中心到求职进展的即时联动真实验证；每日 22:10 群卡片必须由用户明确启用或停用。
- 启用每日卡片时，匿名 HTTPS 回调入口、签名与上下文校验、真实按钮写入及结果卡回读都必须通过；OAuth 登录重定向或 404 会阻止记录就绪。
- 每日卡片只使用显式配置且已授予 `owner` 或 `writer` 的日历；配置日历不可见或只读时直接阻止执行，不再静默新建替代日历。应用作为 `writer` 使用共享日历时不会把 owner 添加为参与人，避免测试或业务日程进入个人日历。
- `--verify --json` 新增 `workspace_ready`、`sync_ready`、`daily_checkin_ready` 与 `daily_checkin_selected`，避免只创建空 Base 就被记录为完整 ready。

## 下载

- 新增确定性的精简安装包构建器，生成 `OfferLoop-v0.1.0-alpha.15.zip`、文件清单与 SHA-256 文件。
- 安装包包含 7 个 Skill、最小运行时、可部署的妙搭同步服务模板、安装入口、版本和必要用户文档；CI 强制压缩体积不超过 2 MiB，并在解压后的隔离 HOME 中重新执行四 Agent 验收。
- README 将 Release 精简包设为推荐入口，并提供同版本浅克隆备用方式及 Node.js、npm、Lark 依赖说明。

## 验证

- 四类 Agent 均通过 README 的真实 `setup_offerloop.py` 入口，覆盖空白与非空 Skill 目录、重复安装、升级、冲突备份恢复和 JSON 编码。
- 缺少 Lark 依赖时确认本地文件完整、无网络安装、状态清晰且不泄露凭证或本机路径；依赖补齐后阶段状态正确推进。
- 精简包通过白名单、逐文件摘要、确定性、体积、解压后安装、核验和幂等测试。
- 本候选已在隔离测试空间完成 12 条 Base workflow、跨 Base 幂等同步、每日卡片与指定测试日历的真实线上验收；测试资源与既有真实资源保持隔离。

本地候选结果与隔离线上验收记录见
[`docs/cases/release-acceptance-2026-09-01.md`](docs/cases/release-acceptance-2026-09-01.md)。
