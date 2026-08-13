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
2. 完整读取 `lark-base`、`job-collection/references/field-contract.md`、`job-collection/references/excel-insert.md` 与 `recruiting-reminder/SKILL.md`，创建三张独立 Base。严格按字段、物理子表、视图和 workflow 契约创建；不得创建编号、父记录或旧双 Base。
3. 完整读取 `offerloop-workspace`、`lark-wiki`、`lark-doc`。创建默认私有的 `OfferLoop 求职空间`、
   固定目录和使用指南；将三张既有 Base 作为唯一对象纳入 `01｜核心求职数据`，不得复制记录、
   字段或另建同名 Base。
4. 完整读取 `lark-apps`。即时同步应用使用 setup 的模板。只有用户选择工作台时，才调用
   `offerloop-workbench`、读取其 `references/golden-path.md` 并创建工作台妙搭应用：

   ```bash
   python3 ../offerloop-workbench/scripts/materialize_workbench.py --destination '<WORKBENCH_APP_DIR>' --json
   python3 scripts/materialize_app_template.py --template progress-sync --destination '<SYNC_APP_DIR>' --json
   ```

   模板清单中的 `required_environment` 只列变量名；按新建的三个 Base 和飞书应用填写妙搭环境变量，不把值写入 Skill、本地 Git 或 checkpoint。即时同步应用必须开通飞书任务与任务清单的最小读写权限。使用该应用身份创建或接管固定任务清单 `OfferLoop｜笔面试（Codex）`，把 OfferLoop 所有者设为成员，并把清单 GUID 写入 `REMINDER_TASKLIST_GUID`；不要按标题在运行时搜索。`笔面试中心` 主表必须有 `飞书任务GUID`、`未参加任务GUID` 和 `飞书任务链接` 三个隐藏技术字段。创建 `offerloop-task-reconcile` 定时触发器，每 30 分钟调用一次任务对账；新待完成事件由它幂等创建主任务与“未参加”子任务，随后同步完成、未参加和改期结果。每日群卡片只发送 `open_url` 按钮，直接打开原生任务或固定任务清单，不登记公网回调地址、不订阅 `card.action.trigger`，也不配置 Vercel、Verification Token 或 relay secret。工作台必须设置发布后的 `WORKBENCH_PUBLIC_URL` 和随机生成的 `FEISHU_CALENDAR_COOKIE_SECRET`；后者只进入妙搭环境变量，不回显、不写入 checkpoint。飞书应用需开通 `calendar:calendar:readonly`、`calendar:calendar.event:read` 与 `offline_access`，OAuth URL 也显式请求三项权限，并把 `<WORKBENCH_PUBLIC_URL>/calendar-oauth-callback` 精确登记为安全设置中的重定向 URL，随后发布应用权限版本。回跳先落到专用前端路由，再由页面通过同源请求完成令牌交换，禁止把跨站 OAuth 302 直接指向妙搭 API。主日历必须使用 `POST /calendar/v4/calendars/primary`。禁止把静态 user access token 写入环境变量。铺设脚本必须保留新应用自己的 `.git`、`.spark`、`.spark_project`、`.env*`，再依次安装依赖、运行测试与类型检查、提交、推送和发布。模板不存在、无法访问或无法验证时停止并报告，禁止临时创建功能不完整的替代应用。
5. 创建且只启用一条“企业清单：投递进度变为已投递 → 求职进展” workflow。求职进展必须有
   文本字段 `投递记录 ID`。同步服务把企业主表 record ID 作为可重复父级关联键：父级无进展时
   幂等创建默认行，已有一条或多条岗位进展时逐条刷新来源字段；不得把同企业不同岗位报重，
   也不得覆盖人工填写的岗位、JD、投递日期或更后阶段。
6. 将核心非敏感 locator 写入 `~/.config/offerloop/config.json`：profile、三个 Base URL、知识库
   space/home/core-data、schema version 与 `progress_sync`。工作台 HTTPS URL 只在可选工作台发布
   和浏览器验收成功后登记。询问是否启用飞书通知；用户选择后按目标名称解析唯一 ID，并在 bot
   群聊场景确认同一 App ID 的机器人已入群。不得写入 App Secret、OpenAPI key、Cookie 或
   IMAP 授权码。
7. 仅创建 IMAP 模板。让用户在本机填写后，再获得第二次确认运行 `fetch_mail.py --check-connection`；不得搜索或读取邮件。
8. 选择并发布工作台后，严格执行 `offerloop-workbench/references/golden-path.md` 的浏览器验收。
   未选择工作台时跳过整个阶段并记录 `not_selected`，不得影响核心部署结论。随后完整读取
   `verification-matrix.md` 运行只读验收。即时联动演练需要临时记录时，验证后精确删除企业和
   进展两侧记录。

## 幂等与恢复

- 先读取已有 locator、Base、工作流和知识库节点；存在时接管，不按标题重建第二套资源。
- 已有即时工作流时检查 endpoint 与请求形状；只修复明确错误的单条工作流，避免重复触发。
- 任一阶段失败时保留已完成资源和 checkpoint，报告阶段、错误类别、未完成资源与安全重试步骤。不得删除已创建资源来“重试”。
- 用户选择工作台而其模板未随 `offerloop-workbench` 提供时，工作台状态为 `blocked`，核心空间
  仍可完成。同步服务模板缺失时仅即时联动为 `blocked`。
