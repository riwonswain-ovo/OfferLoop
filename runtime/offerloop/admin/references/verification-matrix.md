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
| 企业字段契约 | user / bot | `base +field-list` | 六张企业表均为相同 13 字段，Select 选项集合一致；缺失记为 `needs_action` |
| 求职进展 schema v6 | user / bot | `base +field-list` 后把 JSON 传给 `scripts/validate_progress_schema.py` | 返回 `status=ready` |
| 求职进展视图契约 | user / bot | `base +view-list`、逐个 `base +view-get-filter` | 已完成节点视图同时按对应 `最近完成节点` 与 schema v6 的完整进行中状态清单筛选，且清单包含 `待测评`；Offer、已结束、状态待确认按各自状态筛选 |
| 求职进展定位 | 本地 | 查看预检报告的 `local.progress_locator` | 已登记核心空间中的求职进展 Base；缺失时为 `needs_action`，不猜测记录 |

推荐命令顺序（将尖括号替换为已配置值，不要在聊天中回显真实 URL）：

```bash
lark-cli base +url-resolve --url '<BASE_URL>' --as user
lark-cli base +base-get --base-token '<BASE_TOKEN>' --as user
lark-cli base +table-list --base-token '<BASE_TOKEN>' --as user
lark-cli base +field-list --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --as user
lark-cli base +view-list --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --as user
lark-cli base +view-get-filter --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --view-id '<VIEW_ID>' --as user
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
| 笔面试中心单表结构 | user / bot | Base 的 `+table-list`、`+view-list`、`+view-get-filter` | 使用 `笔面试安排` 单表；`全部安排` 无筛选，其余受管视图按 `环节` 筛选 |
| Runtime 状态账本 | bot | Base 的 `+field-list` | `OfferLoop运行状态` 字段符合 reminder schema，只保存最小幂等、失败和分页状态 |
| 日历可读取 | user | `calendar +agenda` 或 `calendar +freebusy` | 指定的未来 7 天范围可读取；不创建日程 |
| 环节视图可读取 | user / bot | `base +view-list`、`+view-get-filter` | 测评、笔试、群面、一面、二面、三面、HR 面、其他面试均为同一物理表的受管视图 |
| 每日卡片配置可定位 | 本地 | 离线预检 | daily_checkin 与 notifications 分离；时间为 22:10 Asia/Shanghai，chat、owner 与 calendar 已登记或明确停用 |

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

知识库读取示例：

```bash
lark-cli wiki +node-get --node-token '<NODE_TOKEN>' --as user
lark-cli wiki +node-list --space-id '<SPACE_ID>' --as user
```

不要在验收中移动知识库节点、创建文档或更改成员权限。三张 Base 必须通过已登记 URL 与 Wiki
节点相互核对，不按标题猜测，也不复制记录验证。

## 4. `integration`：求职进展即时联动

| 核验项 | 身份 | 只读操作 | 通过条件 |
| --- | --- | --- | --- |
| 即时桥接定位已配置 | 本地 | 离线预检 | 已登记 profile、两张 Base、同步应用、HTTPS endpoint 与 workflow ID |
| 工作流列表可读取 | bot | 对企业清单与笔面试中心执行 `base +workflow-list` | 两张来源 Base 的 workflow 列表均可读取 |
| 主子表双向工作流 | bot | 对企业清单的 10 条主子表 workflow 执行 `base +workflow-get` | 五张分类子表均有“子表 → 主表”和“主表 → 子表”，全部 enabled、监听投递进度且排除 `automationBatchUpdate` |
| 企业到进展即时工作流 | bot | 对企业清单的跨 Base workflow 执行 `base +workflow-get` | 唯一一条 enabled workflow 监听主表投递进度，并调用已发布同步服务 |
| 笔面试到进展即时工作流 | bot | 对笔面试中心 workflow 执行 `base +workflow-get` | 唯一一条 enabled workflow 监听完成状态，并携带精确 record ID 调用同步服务 |
| 完整 workflow 数量 | 本地 | 将脱敏列表传给 `scripts/automation_contract.py --validate --input -` | 企业清单 11 条 + 笔面试中心 1 条，共 12 条必要 enabled workflow；无同标题重复或额外 enabled workflow |
| 同步服务发布与健康 | user | `apps +release-list/get` 与只读健康检查 | 当前线上 release 为 finished，健康检查返回 ready；不得把本地构建成功当作线上已发布 |
| 应用 Base 读写权限 | bot | 在用户确认的验收前缀合成记录与内部运行状态表上执行最小读取、创建、更新和回读 | 企业清单、求职进展、笔面试中心与运行状态表均可由同步应用读写；403 或只读成功均不得记录 ready |
| 精确记录定位传输 | user | 回读两条 HTTP workflow 的 query、raw body 和触发器 ref | 企业 workflow 使用 `sourceRecordId` query，笔面试 workflow 使用 `recordId` query，二者 raw body 均为 `{}`；禁止把动态 record ID 拼进 raw body |
| 每日卡片选择 | 本地 / user | 配置与 `apps +automation-list/get` | 明确 disabled，或 `offerloop-daily-checkin` 为 enabled、cron=`10 22 * * *`、Asia/Shanghai，且群、owner、指定日历、匿名 HTTPS 回调入口和卡片动作回读均已验证；日历必须是显式配置且应用角色为 owner/writer，不得新建替代日历，writer 模式不得邀请 owner；OAuth 重定向、登录页或 404 均不通过 |
| 自动化运行历史可读取 | bot | `base +workflow-run-history` | 可读取历史状态，不重跑工作流 |
| 应用身份有效 | bot | `lark-cli whoami` | 返回当前 bot 身份，不泄露凭据 |

示例：

```bash
lark-cli whoami --profile '<PROFILE>' --as bot
lark-cli base +workflow-list --base-token '<BASE_TOKEN>' --table-id '<TABLE_ID>' --profile '<PROFILE>' --as bot
```

脱敏快照只包含 title、status、trigger_type、step_types、记录定位传输方式、是否排除自动批量更新、发布/健康状态、Base 读写权限验证布尔值和
每日卡片验证布尔值（含 `callback_route_public_verified`）。不得把 Base token、workflow ID、record ID、OpenAPI key 或 workflow secret
传给校验器或验收报告。

执行运行历史查询前先阅读 `lark-base` Skill 的 `references/lark-base-workflow-run-history.md`，以该参考中的当前参数为准。验收阶段禁止启用、停用、创建或执行工作流。

## 5. 状态解释与交接

- `ready`：已完成所选能力的离线检查，且本次已执行的只读在线检查通过。完整模式还要求
  `workspace_ready=true`、`sync_ready=true`，以及每日卡片已经验证或由用户明确停用。
- `needs_action`：配置、字段、权限或入口缺失，需用户确认后才可修复。
- `blocked`：本机缺少必要工具、运行时或必填配置，无法继续。
- `unverified`：尚未授权或尚未执行在线检查；不是失败，也不应以猜测代替。
- `not_selected`：本次没有选择该能力，不计入失败。

在线验收结束后，仅汇报每个能力的状态、已验证项目、待确认修复项与下一步。任何修复、迁移、创建测试记录或发送邮件，都必须另行取得用户确认。
