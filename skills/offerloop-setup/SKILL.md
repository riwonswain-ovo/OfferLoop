---
name: offerloop-setup
description: 介绍 OfferLoop 的十一个 Skill，并初始化必需的私有飞书知识库、三张业务 Base、飞书身份和公共配置。适用于“安装/初始化 OfferLoop”“第一次使用”“介绍十一个 Skill”“检查环境或配置”“修复任一 OfferLoop Skill”“搭建完整 OfferLoop”；所有能力共享知识库核心空间，飞书工作台按需部署，Codex Agent 仅在已有工作台后可选加装。
---

# OfferLoop Setup

帮助用户理解并以最少步骤启用 OfferLoop。

## 首次使用欢迎

用户表示刚安装、第一次使用、不了解各 Skill，或明确要求介绍十一个 Skill 时，完整读取
`references/welcome.md`，先展示十一项能力、两个常用闭环和隐私边界，再询问本次要启用哪项能力。
不要在能力介绍前要求目标岗位、读取私人材料或运行线上检查。

非首次使用的配置请求可以直接询问本次要启用哪项能力：

- `collection`：招聘信息收集（`job-collection`）
- `reminder`：笔试、测评和面试提醒（`recruiting-reminder`）
- `workspace`：初始化或检查必需的私有求职知识库（`offerloop-workspace`）
- `coaching`：简历深挖、产品思维、面试准备、模拟面试和真实复盘
- `workbench`：按需部署可选飞书工作台（`offerloop-workbench`）
- `agent`：在已有工作台里加装 Codex 右侧栏（`offerloop-agent`）
- `full`：核心知识库、全部业务与训练能力、工作台和即时求职进展联动；不自动安装 Codex Agent

用户未指定时，不要猜测；请其从以上七项中选择。无论选择哪项，知识库和三张 Base 都属于
核心初始化；工作台只有选择 `workbench`、`agent` 或 `full` 时才部署，`agent` 必须复用已有
工作台应用。

## 安全边界

- 先运行离线预检；预检只读取本机命令、配置键名和文件状态，不访问飞书、工作台或邮箱。
- 不要求用户在聊天中发送 App Secret、邮箱授权码、Cookie、token 或密码。
- 同一个 lark-cli profile 可以承载 bot 和 user 身份，但必须按实际用途分别检查。
- `job-collection` 的长期同步通常使用 `--as bot`；个人日历必须使用 `--as user`，不能静默改用 bot。工作台通过 OAuth 获取并轮换 user token，不要求用户复制 token。
- 配置和运行状态属于用户配置目录，不能写进 Skill 安装目录，避免更新覆盖。
- 任何写入飞书 Base、创建日程、读取邮件标题/正文/附件或启用工作流前，必须说明范围并获得用户确认。
- 本 Skill 只负责首次配置、授权检查、资源定位、部署编排和验收；知识库生命周期交给
  `offerloop-workspace`，可选工作台部署交给 `offerloop-workbench`。

## 1. 离线预检

先根据当前 `SKILL.md` 的所在位置解析本 Skill 根目录，再从该目录运行所选能力的预检：

```bash
python3 scripts/preflight.py --capability '<collection|reminder|workspace|coaching|workbench|agent|full>' --json
```

本 Skill 后续所有 `scripts/...` 和兄弟 Skill 脚本调用都遵循同一解析规则，不假设 Agent 的当前工作目录。

预检输出只使用以下状态：

- `ready`：本地所需条件齐备。
- `needs_action`：缺少配置或资源定位，需要用户补充或确认修复。
- `blocked`：缺少运行时、命令或必填条件，当前无法继续。
- `unverified`：本地无法确认的在线条件，待用户授权后只读核验。
- `not_selected`：本次未选择，不计入失败。

不要把 `not_selected` 或 `unverified` 报为“配置失败”。修复 `blocked` 和 `needs_action` 后，重新运行同一条预检命令。

### 预检边界

这不是完整安装或线上权限验证。预检仅检查本机 Python 版本、`lark-cli` 命令是否存在、所选
能力需要的 OfferLoop Skill 与外部 Lark Skill 文件是否存在，以及本地定位配置、IMAP 配置字段
和文件权限。Skill 会在当前安装目录、`~/.agents/skills`、Codex、Claude Code、Hermes、
WorkBuddy 的默认全局目录和 WorkBuddy 飞书连接器目录，以及 `CODEX_HOME`、
`CLAUDE_CONFIG_DIR`、`HERMES_HOME` 对应的自定义目录中查找；报告不输出本机路径。它不检查 Node/npx（它们只用于
安装依赖），但会用 `lark-cli profile list` 和 `lark-cli doctor --offline` 检查已登记
profile 的本机状态。它不验证在线身份、飞书权限或 token，也不访问飞书、邮箱、浏览器或妙搭。

因此，即使报告为 `ready`，也只能表述为“本机可检查条件已满足”；飞书应用 scope、应用版本发布、
租户安装、Base/知识库共享、IMAP 连通性、个人日历授权、妙搭部署和工作台 OAuth 均须在用户确认后
另行只读核验或配置。不要把 `ready` 表述为“已部署”或“已可用”。

本仓库包含四个核心与业务 Skill、一个可选工作台 Skill、一个可选 Agent Skill 和五个求职训练 Skill。任一能力都先
选择 `workspace` 核心并需要 `lark-base`、`lark-doc`、`lark-wiki`；`reminder` 另需
`lark-calendar`；`workbench`、`agent` 与即时联动需要 `lark-shared`、`lark-apps`。
只有通知已启用时才检查通知依赖：目标已登记时运行期只需要
`lark-im`，仅在启用的用户目标仍需按姓名解析时才需要 `lark-contact`。这些外部 Skill 不随
OfferLoop 安装；缺失时按预检给出的动作安装或启用，并新开 Agent 会话。WorkBuddy 使用
“专家·技能·连接器”中的飞书连接器，不执行不存在的 `npx skills -a workbuddy` 目标。

OfferLoop 核心初始化要求企业清单、求职进展、笔面试中心、知识空间、首页和核心数据目录全部
可定位。业务 Skill 可以在部分写入失败后独立补偿，但不能把缺少核心空间表述为完整初始化。
无论 Skill 目录是否存在，profile、scope、应用发布、
租户安装和资源共享等线上条件一律保持 `unverified`，等待用户确认后的只读验收。

## 2. 仅保存非敏感定位信息

完整阅读 `references/onboarding.md`，再按用户选择配置。只有用户确认保存时，才写入这些公开定位信息：

```bash
python3 scripts/configure.py --profile '<PROFILE>'
python3 scripts/configure.py --target-base-url '<BASE_URL>'
python3 scripts/configure.py --progress-base-url '<BASE_URL>'
python3 scripts/configure.py --reminder-base-url '<BASE_URL>'
python3 scripts/configure.py --wiki-space-id '<SPACE_ID>'
python3 scripts/configure.py --workspace-home-node-token '<NODE_TOKEN>'
python3 scripts/configure.py --workspace-core-data-node-token '<CORE_DATA_NODE_TOKEN>'
python3 scripts/configure.py --enable-coaching --confirm-schema-v4
python3 scripts/configure.py \
  --progress-sync-app-id '<APP_ID>' \
  --progress-sync-endpoint '<HTTPS_ENDPOINT>' \
  --progress-sync-workflow-id '<WORKFLOW_ID>' \
  --progress-sync-status enabled
python3 scripts/configure.py \
  --notification-target-type '<user|chat>' \
  --notification-target-name '<用户姓名|群名称>' \
  --notification-target-id '<ou_xxx|oc_xxx>' \
  --notification-identity '<bot|user>' \
  --notification-status enabled
```

工作台部署并完成浏览器验收后，`offerloop-workbench` 才登记：

```bash
python3 scripts/configure.py --workbench-url '<HTTPS_WORKBENCH_URL>'
```

配置文件是 `~/.config/offerloop/config.json`（遵循 `XDG_CONFIG_HOME`），权限为 `0600`。其中不得保存密码、Cookie、App Secret、授权码或访问令牌。`workbench_url` 必须是没有用户名、密码或片段的 HTTPS 地址。

`--enable-coaching` 保留既有公共配置和兼容 locator，追加或迁移 `artifact_storage` 并升级为
schema v4。核心初始化已创建训练目录；旧用户缺少目录时由 `offerloop-workspace` 经确认补齐。

飞书消息通知是可选能力。启用前必须让用户明确确认接收人或群、摘要模板和发送身份；保存
`enabled` 即表示对 `job-collection` 与 `recruiting-reminder` 后续运行的一条最终摘要给予持续
授权。目标 ID 只是非敏感定位信息；不得保存消息 token。停用时保留目标定位并把状态改为
`disabled`。首次实际发送仍需按 `lark-im` 检查 scope、机器人入群或私聊关系。

### 通知接入问答

用户选择 `collection`、`reminder` 或 `full` 时，主动询问是否启用飞书结果通知；愿意启用时依次确认：

1. 接收方式是私聊还是群聊；
2. 目标用户姓名或目标群名称；
3. 使用 bot 还是 user 身份发送；
4. 使用两个业务 Skill 中定义的默认最终摘要模板，还是由用户提供自定义模板。

完整读取 `lark-im` 和 `lark-contact`。群聊按名称调用 `im +chat-search`，用户按姓名调用
`contact +search-user`；只接受唯一的精确匹配，零结果时引导检查可见范围，多个结果时展示必要的
脱敏候选让用户选择，不取第一条。将确认后的名称和解析出的 `ou_`/`oc_` ID 一并保存。

使用 bot 给群聊发消息时，还必须核对当前 profile 的 App ID、机器人能力、
`im:chat:read`、`im:chat.members:read`、`im:message:send_as_bot`、应用版本已发布且已安装到租户，
并用 `im +chat-members-list` 确认该 App ID 的机器人已加入目标群。任一条件缺失时保持
`notifications.status=disabled`，逐步引导修复；不得通过发送测试消息代替只读核验。

`full` 工作流优先复用公共配置 `progress_sync` 中已登记的同步应用、HTTPS endpoint 和 Base
workflow，使用户手动改为 `已投递` 后立即同步；`job-collection` 的直接幂等对账作为补偿。
只有在线只读核验确认应用、endpoint 和 workflow 均对应目标资源后，才能将状态保存为
`enabled`；核验前使用 `unverified`，不得提前宣称即时同步可用。
发现已有桥接时只检查或修复，不重复创建妙搭应用、OpenAPI Key 或 workflow。

## 一键部署完整空间

用户明确说“部署”“一键部署”或“创建完整 OfferLoop”时，完整阅读
`references/one-click-deploy.md`。只要用户选择工作台，还必须调用 `offerloop-workbench` 并完整
读取其 `references/golden-path.md`，把发布前门禁和发布后浏览器验收作为完成条件，不能把
“代码已推送”“页面能打开”或“用户点过授权”当作部署成功。先运行：

```bash
python3 scripts/deployment_plan.py --capability full --json
```

展示将创建或接管的资源与必要确认。核心确认覆盖三张 Base、知识库、同步服务和 workflow；
工作台采用单独的可选确认；IMAP 连通性检查仍需用户填好本机配置后确认。

部署必须幂等：接管已登记资源，禁止按标题重复创建。即时同步模板由本 Skill 管理；工作台模板、
妙搭应用和发布流程全部由 `offerloop-workbench` 管理。两者都必须保留目标应用自身绑定，禁止
复制来源应用的 `.spark`、`.env*`、日志、构建产物或凭证。

## 3. 邮箱仅做连通性检查

只有用户选择 `reminder` 或 `full`，并确认创建本地模板时才运行：

```bash
python3 scripts/configure.py --init-imap
```

该命令只复制模板，不填入凭据。让用户在本机编辑返回的 `.env` 路径，不要让用户把内容发进聊天。

用户明确要求验证邮箱授权后，才可以运行：

```bash
python3 ../recruiting-reminder/scripts/fetch_mail.py --check-connection
```

它只登录、选择配置的邮箱文件夹并登出；不得执行邮件搜索或拉取，不显示邮件标题、正文或附件。

## 4. 在线只读验收

离线预检通过后、且用户确认要核验线上资源时，必须完整阅读 `references/verification-matrix.md`，并严格按其中的身份边界和只读命令执行。

在线验收可以读取：已配置 Base 的结构、工作流列表/历史、用户日历的未来范围、知识库节点，
以及 IMAP 连通状态。只有选择工作台时才由 `offerloop-workbench` 验收页面与 OAuth。验收不得
创建测试记录、修改字段/视图、移动知识库节点、创建日程、启用工作流或读取邮件内容。

## 5. 汇报与后续操作

按所选能力汇报状态、已验证内容、缺失项和下一步。没有被选择的能力保持 `not_selected`。

需要写入或修复时，先列出精确的目标与影响范围，等待用户确认；将“修复配置”“迁移旧数据”“运行端到端演练”分成独立确认步骤。完成后可提示用户下一条自然语言命令，例如“同步招聘信息”“检查今天有没有笔试或面试通知”“打开求职知识库”。

## 故障路由

- 找不到 Skill：按所选能力检查对应 Skill；工作台未选择时不要求 `offerloop-workbench` 可用。
- 缺少 Python 或 lark-cli：先处理预检中的 `blocked` 项，暂停后续飞书操作。
- bot 核验失败：检查应用 scope、版本发布、租户安装和目标 Base 权限；不要对 bot 执行 `auth login`。
- user 核验失败：按最小 scope 发起 split-flow 授权；不要把个人日历查询改为 bot。
- 工作台问题统一路由到 `offerloop-workbench`。回调出现 `csrf token not found in header`：
  回调地址错误地直指了 API；改为专用前端
  `/calendar-oauth-callback`，再由页面通过妙搭请求客户端同源 POST 到令牌交换接口。不要关闭 CSRF。
- 工作台授权后显示空白、400/503 或“授权会话过长”：按 `offerloop-workbench` 的
  `references/golden-path.md` 核对 Cookie
  契约；浏览器只持久化分片加密的 refresh token，access token 只能在服务端单次请求内使用。
- 工作台显示已连接但日历读取失败：先确认 OAuth 同时请求 `calendar:calendar:readonly`、
  `calendar:calendar.event:read`、`offline_access`，再确认主日历调用是 `POST
  /calendar/v4/calendars/primary`，不能使用 GET。
- 工作台首屏超过 10 秒：检查是否在首屏扫描全部 Base、全部视图或全部记录；恢复为元数据先行、
  当前 Base/当前视图按需读取，每页固定 30 条，并用线上 Trace 验证后再交付。
- IMAP 连通失败：确认 IMAP 已启用，并使用授权码或应用专用密码，不使用网页登录密码。
- 配置在更新后丢失：检查 `.env` 或状态是否误放在旧 Skill 目录，按 onboarding 迁入用户配置目录。
