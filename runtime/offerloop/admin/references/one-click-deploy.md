# 一键部署流程

当用户明确说“部署完整 OfferLoop”“一键部署”或“为新用户创建整套求职空间”时，按此流程执行。“一键”指 Agent 连续执行；飞书扫码授权和本机 IMAP 授权码仍必须由用户亲自完成。

## 启动

先运行：

```bash
python3 scripts/deployment_plan.py --capability full --json
```

它只输出脱敏计划。不要输出配置值、URL token、密钥或邮件地址。用户确认“部署”后，写入可恢复的本地进度：

```bash
python3 scripts/deployment_plan.py --capability full --write-checkpoint --json
```

## 总确认后的连续阶段

1. 完整读取 `lark-shared`，确认选定 profile 的 bot 与 user 身份；缺少 user scope 时走 split-flow 授权，不借用 bot 访问个人资源。需要 bot 时，引导启用机器人能力、开通最小权限、发布版本并安装到租户，不能只配置 App ID/Secret 就宣称机器人已安装。
2. 完整读取 `lark-base`、`job-collection/references/field-contract.md`、`job-collection/references/excel-insert.md`、`recruiting-reminder/SKILL.md` 与 `reminder-schema.md`，创建三张独立 Base。严格按各自的字段、物理表、视图和 workflow 契约创建；不得创建编号、父记录或旧双 Base。
   在企业清单 Base 创建且只启用 10 条主子表同步 workflow：五张分类子表各一条“子表 → 主表”和
   一条“主表 → 子表”。全部使用 `SetRecordTrigger` 只监听 `投递进度`，通过双向
   `子表 record_id` 定位精确对应记录，并使用 `SetRecordAction` 只写 `投递进度`。
   所有触发器必须排除 `automationBatchUpdate`，防止自动写回再次触发形成循环。任何一侧由用户手动
   修改后，另一侧都必须在本轮验收中回读为相同状态；不得把五张物理子表误当成主表视图。
3. 完整读取隐藏运行时中的 `homepage-contract.md`、`artifact-contract.md`，以及 `lark-wiki`、
   `lark-doc`。创建默认私有的 `OfferLoop 求职空间`、
   固定目录和使用指南；将三张既有 Base 作为唯一对象纳入 `01｜核心求职数据`，不得复制记录、
   字段或另建同名 Base。
4. 完整读取 `lark-apps`。即时同步应用只使用 setup 的活动模板。旧 OfferLoop 工作台已经退役，
   不得调用其铺设脚本、创建旧工作台应用或复用旧 OAuth 合同：

   ```bash
   python3 scripts/materialize_app_template.py --template progress-sync --destination '<SYNC_APP_DIR>' --json
   ```

   模板清单中的 `required_environment` 只列变量名；按新建的三个 Base 和飞书应用填写妙搭环境变量，不把值写入 Skill、本地 Git 或 checkpoint。即时同步应用开通读写三个 Base、发送互动卡片及创建/更新用户明确指定日历所需的最小权限；不申请飞书任务或任务清单权限。`DAILY_CHECKIN_CALENDAR_ID` 必须指向该明确授权的日历，应用在日历列表中的角色必须为 `owner` 或 `writer`；不可见或只读时停止，不得另建替代日历。角色为 `writer` 时不得把 owner 添加为事件参与人，避免事件进入个人日历。

   `笔面试中心` 只使用 `笔面试安排` 一张业务表，并按 `reminder-schema.md` 创建受管视图；另建只保存幂等 claim、失败步骤和分页发送账本的内部 `OfferLoop运行状态` 表，并把 table ID 写入 `RUNTIME_STATE_TABLE_ID`。另生成独立的 `REMINDER_RECONCILE_SECRET`，其密钥值只存入妙搭环境变量和 Base workflow 的加密配置，不写入请求体、文档或日志。只创建一条即时 workflow，使用 `SetRecordTrigger` 监听 `笔面试安排.完成状态`；随后用 `HTTPClientAction` POST 到 `/openapi/job-progress-sync/reminder-reconcile`，请求头 `Authorization: Bearer <仅授权该路由的 OpenAPI key>` 与 `X-OfferLoop-Workflow-Secret` 缺一不可。触发记录的精确 `recordId` 必须通过 query 参数传递，raw body 固定为 `{}`；企业清单 workflow 同样使用 `sourceRecordId` query 参数。真实飞书验收已证明，把记录 ID ref 拼进 raw body 可能被解析为空，禁止使用该写法。服务回读该记录的 `last_modified_time` 作为本次状态变更版本，同一版本只允许一个进展联动 owner。无法定位或缺少稳定版本时返回错误，不按标题或邮件 ID 猜测，也不执行全表对账。不得创建 `offerloop-base-reconcile`、每 30 分钟检查、定时对账或后台补偿。另按用户独立授权配置 `offerloop-daily-checkin` 在 22:10 Asia/Shanghai 发送 owner-only 群卡片，并在飞书事件订阅中把 Card 2.0 的 `card.action.trigger` 回调地址配置为应用公开 URL 下的 `/callbacks/feishu/card-action`。启用每日卡片时，除 chat、owner 与 calendar 环境变量外，还必须把飞书回调 Verification Token 写入 `FEISHU_CALLBACK_VERIFICATION_TOKEN`；该值只进入妙搭环境变量，不写入仓库或文档。妙搭应用必须为该回调提供无需登录即可访问的 HTTPS 入口；若平台只能按应用控制匿名访问，则先确认该模板前端不承载用户数据和管理界面，再把应用访问范围设为 public 且关闭登录要求。匿名入口只负责回调，仍必须校验应用、群、操作者、Verification Token 和真实卡片消息 ID；其余跨 Base OpenAPI 继续要求最小权限 key 与 workflow secret。发布后先发送带验收前缀的测试卡片，再以未登录请求验证回调返回 200，OAuth 重定向、登录页或 404 均不得记录 ready。回调先校验应用、群聊、操作者与 token，立即确认请求，再异步完成精确记录写入和结果卡发送。workflow 写入必须排除 `automationBatchUpdate`。失败只在当前请求内最多尝试 3 次，之后仅按用户明确指令补失败步骤。不得创建原生任务；卡片有真实 `已建日程ID` 时更新原日程，没有时先写稳定 pending 键、把同一键传为日历创建 `idempotency_key`，再按该键复用或创建日程并回填，始终保留真实截止。
   在启用跨 Base workflow 或每日卡片前，还必须让同步应用对三张业务 Base 及内部运行状态表具备最小读写权限，并用带验收前缀的合成记录分别完成一次读取、创建、更新和回读。只读 schema 成功不能替代写权限验收；权限不足时停止并向用户展示精确授权目标，不得改用个人凭证或生产 Base 绕过。

   铺设脚本必须保留新同步应用自己的 `.git`、`.spark`、`.spark_project`、`.env*`，再依次安装依赖、运行测试与类型检查、提交、推送和发布。模板不存在、无法访问或无法验证时停止并报告，禁止临时创建功能不完整的替代应用。
5. 创建且只启用一条“企业清单：投递进度变更 ↔ 求职进展” workflow，监听 `投递进度` 的所有变更。求职进展必须有
   文本字段 `投递记录 ID`、`公告链接`、SingleSelect 字段 `进展状态` 和 `最近完成节点`，字段与
   选项以 `progress-schema-v6.md` 为准。同步服务把企业主表 record ID 作为可重复父级关联键：父级无进展时
   幂等创建默认行，已有一条或多条岗位进展时逐条刷新来源字段；不得把同企业不同岗位报重，
   也不得覆盖人工填写的岗位、JD、投递日期或更后阶段。
   状态离开 `已投递` 时只删除仍为空白且处于默认待反馈状态的自动默认行；已推进或人工维护的
   记录保留并返回 `review_required`。
   加上第 2 步的 10 条主子表 workflow 和第 4 步的 1 条笔面试 workflow，完整模式总计必须有
   12 条已启用 Base workflow。飞书自动生成的空白 disabled 占位不计入数量；不得存在同标题重复或
   额外 enabled workflow。先运行
   `python3 scripts/automation_contract.py --plan --daily-checkin <enabled|disabled> --json` 获取脱敏清单，
   在线回读后再把脱敏快照传给 `--validate --input -`；校验未返回 `ready` 时不得记录自动化验收。
6. 将核心非敏感 locator 写入 `~/.config/offerloop/config.json`：profile、三个 Base URL、知识库
   space/home/core-data、schema version 与 `progress_sync`。历史配置中的 `workbench_url` 只为兼容
   旧安装保留，不创建、不更新，也不计入就绪状态。询问是否启用飞书通知；用户选择后按目标名称解析唯一 ID，并在 bot
   群聊场景确认同一 App ID 的机器人已入群。不得写入 App Secret、OpenAPI key、Cookie 或
   IMAP 授权码。
7. 仅创建 IMAP 模板。让用户在本机填写后，再获得第二次确认运行 `fetch_mail.py --check-connection`；不得搜索或读取邮件。
8. 完整读取 `verification-matrix.md` 运行只读验收。旧工作台不参与验收，也不得影响核心部署结论。
   即时联动演练需要临时记录时，验证后精确删除企业和
   进展两侧记录。
9. 只有同步服务已发布、12 条 workflow 全部 enabled、主子表与两个跨 Base 链路真实回读通过，且
   每日卡片已按用户选择验证或明确停用；启用时还必须完成匿名回调入口、卡片动作、群权限、日历权限及“只写指定日历且不邀请 owner”的隔离验证，才运行
   `scripts/setup_offerloop.py --agent <agent> --mode full --record-automation-verified`。

## 幂等与恢复

- 先读取已有 locator、Base、工作流和知识库节点；存在时接管，不按标题重建第二套资源。
- 已有即时工作流时检查 endpoint 与请求形状；只修复明确错误的单条工作流，避免重复触发。
- 任一阶段失败时保留已完成资源和 checkpoint，报告阶段、错误类别、未完成资源与安全重试步骤。不得删除已创建资源来“重试”。
- 同步服务模板缺失时仅即时联动为 `blocked`；不得用已退役工作台模板替代。
