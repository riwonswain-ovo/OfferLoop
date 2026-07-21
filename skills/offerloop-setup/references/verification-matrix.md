# OfferLoop 只读在线验收矩阵

本文件只用于完成离线预检后的在线核验。它不创建、修改、删除飞书资源，也不读取邮件标题、正文或附件。

## 0. 开始前

1. 先执行 `python3 scripts/preflight.py --capability <collection|reminder|workspace|full> --json`。
2. 仅对预检中已经配置、且用户本次明确要求验证的能力执行在线核验。
3. 在线操作前确认当前 `lark-cli` 身份；涉及用户文档、知识库或日历时使用 `--as user`，涉及应用可见性或工作流时使用 `--as bot`。
4. 所有命令输出只保留状态、资源类型、数量和错误类别；不要粘贴 URL 中的 token、邮箱地址、Cookie、授权码或 IMAP 密码。

## 1. `collection`：招聘信息收集

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| 主表可读取 | user / bot | 先用 `base +url-resolve` 解析配置的 Base URL，再用 `base +base-get` | 两种身份中本能力实际使用的一种可读取 |
| 目标表存在 | user / bot | `base +table-list` | 找到已配置的招聘信息表 |
| 字段契约 | user / bot | `base +field-list` | 能读取字段列表；缺字段记为 `needs_action`，不自动补建 |
| 视图可读取 | user / bot | `base +view-list` | 可读取至少一个视图；不创建、不改筛选 |
| 增量写入元数据 | 本地 | 查看预检报告的 `local.progress_locator` | 没有同步定位器时标为 `unverified`，不猜测记录 |

推荐命令顺序（将尖括号替换为已配置值，不要在聊天中回显真实 URL）：

```bash
lark-cli base +url-resolve --url '<BASE_URL>' --as user
lark-cli base +base-get --base-token '<BASE_TOKEN>' --as user
lark-cli base +table-list --base-token '<BASE_TOKEN>' --as user
lark-cli base +field-list --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --as user
lark-cli base +view-list --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --as user
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

## 3. `workspace`：知识库与工作台入口

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| 知识库节点可读取 | user | `wiki +node-get`、`wiki +node-list` | 配置的根节点与子节点可读取 |
| 文档入口可读取 | user | `wiki +node-get` 或 `docx` 读取 | 使用指南和入口文档存在 |
| 工作台可访问 | 浏览器 / HTTP GET | 访问 `workbench_url` | 返回可加载的页面外壳；不提交表单、不写入数据 |
| 工作台首屏性能 | 浏览器 / Trace | 首次打开后查询 `GET /api/workbench` Trace | 首屏接口按需读取默认视图，每个数据集最多 30 条，不扫描所有视图记录 |
| 工作台日历 OAuth | 浏览器 | 用户亲自点击“连接飞书日历”并同意授权 | 回到工作台后显示个人日历已连接；token 不进入聊天、Git 或公共配置 |
| Base 入口可读取 | user | 对已配置各 Base 执行 `+url-resolve`、`+base-get` | 入口没有失效 |

知识库读取示例：

```bash
lark-cli wiki +node-get --node-token '<NODE_TOKEN>' --as user
lark-cli wiki +node-list --space-id '<SPACE_ID>' --as user
```

不要在验收中移动知识库节点、创建文档或更改成员权限。OAuth 同意必须由用户本人操作；
验收只观察连接状态和未来 7 天只读结果，不读取或展示 token/Cookie。

## 4. `integration`：求职进展即时联动

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| 即时桥接定位已配置 | 本地 | 离线预检 | 已登记 profile、两张 Base、同步应用、HTTPS endpoint 与 workflow ID |
| 工作流列表可读取 | bot | `base +workflow-list` | 可读取目标表工作流列表 |
| 即时工作流已启用 | bot | `base +workflow-get` | 登记的 workflow 状态为 enabled，触发条件为投递进度变成已投递 |
| 自动化运行历史可读取 | bot | `base +workflow-run-history` | 可读取历史状态，不重跑工作流 |
| 应用身份有效 | bot | `lark-cli whoami` | 返回当前 bot 身份，不泄露凭据 |

示例：

```bash
lark-cli whoami --profile '<PROFILE>' --as bot
lark-cli base +workflow-list --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --profile '<PROFILE>' --as bot
```

执行运行历史查询前先阅读 `lark-base` Skill 的 `references/lark-base-workflow-run-history.md`，以该参考中的当前参数为准。验收阶段禁止启用、停用、创建或执行工作流。

## 5. 状态解释与交接

- `ready`：已完成所选能力的离线检查，且本次已执行的只读在线检查通过。
- `needs_action`：配置、字段、权限或入口缺失，需用户确认后才可修复。
- `blocked`：本机缺少必要工具、运行时或必填配置，无法继续。
- `unverified`：尚未授权或尚未执行在线检查；不是失败，也不应以猜测代替。
- `not_selected`：本次没有选择该能力，不计入失败。

在线验收结束后，仅汇报每个能力的状态、已验证项目、待确认修复项与下一步。任何修复、迁移、创建测试记录或发送邮件，都必须另行取得用户确认。
