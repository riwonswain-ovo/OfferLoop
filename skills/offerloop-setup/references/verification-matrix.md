# OfferLoop 只读在线验收矩阵

本文件只用于完成离线预检后的在线核验。它不创建、修改、删除飞书资源，也不读取邮件标题、正文或附件。

## 0. 开始前

1. 先执行 `python3 scripts/preflight.py --capability <collection|reminder|workspace|coaching|workbench|full> --json`。
2. 仅对预检中已经配置、且用户本次明确要求验证的能力执行在线核验。
3. 在线操作前确认当前 `lark-cli` 身份；涉及用户文档、知识库或日历时使用 `--as user`，涉及应用可见性或工作流时使用 `--as bot`。
4. 所有命令输出只保留状态、资源类型、数量和错误类别；不要粘贴 URL 中的 token、邮箱地址、Cookie、授权码或 IMAP 密码。

## 1. `collection`：招聘信息收集

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| 主表可读取 | user / bot | 先用 `base +url-resolve` 解析配置的 Base URL，再用 `base +base-get` | 两种身份中本能力实际使用的一种可读取 |
| 目标表存在 | user / bot | `base +table-list` | 找到已配置的招聘信息表 |
| 企业字段契约 | user / bot | `base +field-list` | 六张企业表均为相同 13 字段，Select 选项集合一致；缺失记为 `needs_action` |
| 求职进展 schema v6 | user / bot | `base +field-list` 后把 JSON 传给 `scripts/validate_progress_schema.py` | 返回 `status=ready` |
| 视图可读取 | user / bot | `base +view-list` | 可读取至少一个视图；不创建、不改筛选 |
| 求职进展定位 | 本地 | 查看预检报告的 `local.progress_locator` | 已登记核心空间中的求职进展 Base；缺失时为 `needs_action`，不猜测记录 |

推荐命令顺序（将尖括号替换为已配置值，不要在聊天中回显真实 URL）：

```bash
lark-cli base +url-resolve --url '<BASE_URL>' --as user
lark-cli base +base-get --base-token '<BASE_TOKEN>' --as user
lark-cli base +table-list --base-token '<BASE_TOKEN>' --as user
lark-cli base +field-list --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --as user
lark-cli base +view-list --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --as user
```

求职进展字段验收不得只看字段数量：

```bash
lark-cli base +field-list --base-token '<PROGRESS_BASE_TOKEN>' --table-id '<PROGRESS_TABLE_ID>' --as user \
  | python3 scripts/validate_progress_schema.py --input -
```

如果这项能力由飞书应用写入，再使用同一组只读命令配合 `--profile '<PROFILE>' --as bot` 核验应用身份；不要为了验证而创建测试记录。

## 2. `reminder`：笔试 / 面试提醒

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| IMAP 连通性 | 本地 | `fetch_mail.py --check-connection` | 可登录并选择配置的邮箱文件夹；不搜索、不拉取邮件 |
| 笔面试中心可读取 | user / bot | Base 的 `+base-get`、`+table-list`、`+field-list` | 已配置目标表可读取，字段可检查 |
| 日历可读取 | user | `calendar +agenda` 或 `calendar +freebusy` | 指定的未来 7 天范围可读取；不创建日程 |
| 面试阶段表可读取 | user / bot | `base +table-list`、`+field-list` | 笔试、群面、一面、二面、三面、HR 面等已配置表可读取 |

IMAP 检查示例：

```bash
python3 skills/recruiting-reminder/scripts/fetch_mail.py --check-connection
```

该命令只会调用登录、选择邮箱文件夹和登出。它不会执行 IMAP `SEARCH`、`FETCH`，不会显示任何邮件内容。

执行日历命令前，先阅读 `lark-calendar` Skill 的 `references/lark-calendar-agenda.md` 或 `references/lark-calendar-freebusy.md`，再按其中当前 CLI 参数传入未来 7 天的开始与结束时间。

## 3. `workspace`：必需知识库

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| 知识库节点可读取 | user | `wiki +node-get`、`wiki +node-list` | 配置的根节点与子节点可读取 |
| 使用指南可读取 | user | `wiki +node-get` 或 `docx` 读取 | `00｜OfferLoop 使用指南` 存在 |
| 核心数据目录 | user | `wiki +node-list` | `01｜核心求职数据` 下存在三张既有 Base 节点 |
| Base 入口可读取 | user / bot | 对已配置各 Base 执行 `+url-resolve`、`+base-get` | 三张 Base 入口均指向唯一业务真源 |
| 工作台可选状态 | 本地 | 查看 `workbench_url` | 缺失时为 `not_selected`，不影响 workspace 通过 |

知识库读取示例：

```bash
lark-cli wiki +node-get --node-token '<NODE_TOKEN>' --as user
lark-cli wiki +node-list --space-id '<SPACE_ID>' --as user
```

不要在验收中移动知识库节点、创建文档或更改成员权限。三张 Base 必须通过已登记 URL 与 Wiki
节点相互核对，不按标题猜测，也不复制记录验证。

## 4. `coaching`：求职训练产物

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| schema v4 | 本地 | `artifact_contract.py resolve-folder` | `artifact_storage` 可解析，不输出 token |
| 训练目录 | user | `wiki +node-get` / `wiki +node-list` | 所选 Skill 的必需目录唯一且可读 |
| Markdown 文档 | user | `docx` 只读 | 已有产物包含“产物信息”和 `run_id` |
| 长期主档 | user | `docx` 只读 | 已登记主档可读；未创建时允许为空 |
| 笔面试回填字段 | user / bot | Base `+field-list` | 面试准备/复盘字段与主子表 ID 字段存在 |

只读验收不得创建空主档、训练文档或测试 Base 记录。多个同名目录保持 `needs_action`，等待用户
选择，不能自动取第一条。

## 5. `workbench`：可选飞书工作台

只有用户本次明确选择工作台时执行。完整读取
`../../offerloop-workbench/references/golden-path.md`：

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| 页面可访问 | 浏览器 / HTTP GET | 访问已登记 HTTPS URL | 返回可加载页面外壳 |
| 首屏性能 | 浏览器 / Trace | 查询 `GET /api/workbench` Trace | 每个数据集最多 30 条，不扫描所有视图 |
| 三张 Base | 浏览器 | 切换三个数据集 | 只读加载既有 Base，不创建副本 |
| 日历 OAuth | 浏览器 | 用户亲自授权并刷新一次 | 刷新后仍连接，无 CSRF、会话过长或读取错误 |

未选择或未部署工作台时保持 `not_selected`，不得降低 workspace、collection、reminder 或
coaching 状态。

## 6. `integration`：求职进展即时联动

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| 即时桥接定位已配置 | 本地 | 离线预检 | 已登记 profile、两张 Base、同步应用、HTTPS endpoint 与 workflow ID |
| 工作流列表可读取 | bot | `base +workflow-list` | 可读取目标表工作流列表 |
| 即时工作流已启用 | bot | `base +workflow-get` | 登记的 workflow 状态为 enabled，触发条件监听投递进度的所有变更 |
| 自动化运行历史可读取 | bot | `base +workflow-run-history` | 可读取历史状态，不重跑工作流 |
| 应用身份有效 | bot | `lark-cli whoami` | 返回当前 bot 身份，不泄露凭据 |

示例：

```bash
lark-cli whoami --profile '<PROFILE>' --as bot
lark-cli base +workflow-list --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --profile '<PROFILE>' --as bot
```

执行运行历史查询前先阅读 `lark-base` Skill 的 `references/lark-base-workflow-run-history.md`，以该参考中的当前参数为准。验收阶段禁止启用、停用、创建或执行工作流。

## 7. 状态解释与交接

- `ready`：已完成所选能力的离线检查，且本次已执行的只读在线检查通过。
- `needs_action`：配置、字段、权限或入口缺失，需用户确认后才可修复。
- `blocked`：本机缺少必要工具、运行时或必填配置，无法继续。
- `unverified`：尚未授权或尚未执行在线检查；不是失败，也不应以猜测代替。
- `not_selected`：本次没有选择该能力，不计入失败。

在线验收结束后，仅汇报每个能力的状态、已验证项目、待确认修复项与下一步。任何修复、迁移、创建测试记录或发送邮件，都必须另行取得用户确认。
