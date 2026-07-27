# OfferLoop 新用户接入

本接入指南采用核心空间优先、业务能力渐进配置。先确认十个 OfferLoop Skill 已安装在同一个
Agent 环境，并在安装后新开会话；再选择 `collection`、`reminder`、`workspace`、`coaching`、
`workbench` 或 `full`。任何选择都先检查必需的私有知识库和三张业务 Base。

首次安装、第一次使用或用户要求理解十个 Skill 时，先完整读取 `welcome.md`，展示十项能力、
自然语言示例、常用闭环和隐私边界，再让用户选择当前能力。不要要求用户先记技术名称，也不要
在介绍阶段询问目标岗位或访问线上资源。

这一步是新用户的最小成功：Skill 能被发现并能开始只读本机引导。它不是飞书、邮箱、妙搭或
工作台已经配置完成的声明。本仓库提供四个核心与业务 Skill、一个可选工作台 Skill 和五个求职
训练 Skill；运行时、飞书身份和外部 Lark Skill 都需要单独准备。

## 1. 能力与最小配置

| 用户目标 | 必需配置 | 本次不需要 |
| --- | --- | --- |
| `workspace`：初始化核心空间 | Python 3.10+、lark-cli、私有知识库、核心数据目录、企业清单/求职进展/笔面试中心 | IMAP、日历、工作台 |
| `collection`：同步招聘信息 | 核心空间、可用 bot profile、至少一个合法信息源 | IMAP、个人日历、工作台 |
| `reminder`：整理笔试和面试 | 核心空间、IMAP、本地提醒配置；建日历时完成 user 日历授权 | 招聘信息源、工作台 |
| `coaching`：训练与面试材料 | 核心空间、schema v4、固定训练目录 | IMAP、日历、工作台 |
| `workbench`：可视化工作台 | 核心空间、妙搭创建/发布/环境配置、OAuth 与租户安装支持 | IMAP、业务写入 |
| `full`：完整闭环 | 上述全部，以及 Base workflow 和 HTTPS 同步端点 | 无 |

安装整个仓库不代表要完成所有授权。未选能力应显示为 `not_selected`，而非失败。

### 运行时和外部 Skill 依赖

- 安装 OfferLoop 本身只需要 Python 3.10+；Node.js（含 `npx`）只用于安装 `lark-cli` 和外部 Lark Skills，不是离线预检项目。
- 所有业务能力需要 Python 3.10+ 与 `lark-cli >= 1.0.73`。如果 Agent 的默认 `python3` 指向较旧的系统 Python，预检会在当前 PATH 中自动选择可用的 Python 3.10+ 后重新执行；找不到合格解释器时才报告 `blocked`。预检会用 `profile list` 和 `doctor --offline` 确认已登记 profile 的本机状态，但不能证明应用已发布或有在线资源权限。
- 知识库创建/整理需要 `lark-base`、`lark-doc`、`lark-wiki`；个人日历读写需要 `lark-calendar`；完整部署还需要 `lark-shared`、`lark-apps`。只有消息通知已启用时才需要 `lark-im`；首次按用户姓名登记目标时才需要 `lark-contact`，目标 ID 已登记后的运行期不需要它。这些均为外部 Lark Skill，**不随 OfferLoop 打包**，必须在当前 Agent 环境中另行安装/启用并新开会话加载。
- 推荐从 [Lark 官方 CLI](https://github.com/larksuite/cli) 安装命令行工具及其配套 Skill：先运行 `npx @larksuite/cli@latest install`；Codex、Claude Code、Hermes 再按当前 Agent 运行 `npx skills add larksuite/cli -g -a codex -y`、`-a claude-code` 或 `-a hermes-agent`。WorkBuddy 则在“专家·技能·连接器”中启用飞书连接器，不使用未受支持的 `-a workbuddy` 参数。随后仍须由用户或管理员按本指南配置应用、profile 与资源权限。
- 飞书应用 scope、应用版本发布、租户管理员安装、机器人入群、Base/知识库共享、妙搭应用创建/发布和环境变量权限，都需要用户或管理员在飞书/妙搭中手动完成。不能由 Skill 安装、离线预检或 Agent 自动取得。
- App Secret、密码、Cookie、token、邮箱授权码只能在用户本机的安全配置流程中填写，绝不发送到聊天。

核心空间要求三张 Base 和知识库 locator 全部存在。单个业务任务可以在其他业务系统暂时失败时
保留自己的成功结果，但不得把缺少核心空间表述为 OfferLoop 已完成初始化。

## 2. 先做离线预检

先根据当前 `SKILL.md` 所在位置解析 `offerloop-setup` 根目录，再从该目录运行：

```bash
python3 scripts/preflight.py --capability '<collection|reminder|workspace|coaching|workbench|full>' --json
```

它不访问飞书、浏览器、工作台或邮箱。它只检查 Python 版本、`lark-cli` 命令、所选能力需要的
OfferLoop Skill、外部 Lark Skill 目录、本地配置字段及 IMAP 配置文件状态；不验证 Node/npx、
在线身份、飞书权限、IMAP 连通性或妙搭权限。已登记 profile 的本机状态会通过
`lark-cli profile list` 和 `lark-cli doctor --offline` 验证。外部 Skill 会跨当前安装目录、
`~/.agents/skills`、Codex、Claude Code、Hermes 与 WorkBuddy 的全局 Skill 目录、WorkBuddy 飞书连接器目录，以及对应的自定义根目录中查找，但报告不输出本机路径。
报告中的 `blocked` 与 `needs_action` 需要先处理；`unverified` 表示需要后续只读在线核验，不能靠
猜测填充。即使本地项目为 `ready`，也不得宣称完整部署或线上能力已经可用。

## 3. 飞书身份模型

一个 lark-cli profile 对应一个飞书应用，但同一应用有两种使用身份：

```text
同一个 profile
├── --as bot   → Base 同步、workflow、无人值守任务
└── --as user  → 用户自己的日历、知识库和文档
```

- bot：在开发者后台开通 scope、发布版本并安装到租户；禁止执行 `auth login`。
- user：开通 scope 后，需要用户通过 `auth login` 同意个人授权。
- profile 不止一个时，必须让用户选择；所有后续命令显式带上该 profile 和正确的 `--as`。
- Base、知识库和日历的线上读取只能在用户确认只读验收后进行。

## 4. Base 与联动配置

公共配置保存定位信息，不保存业务数据。经用户确认后，将 profile、三张业务 Base、知识库、
首页和核心数据目录保存到 `~/.config/offerloop/config.json`：

```bash
python3 scripts/configure.py --profile '<PROFILE>'
python3 scripts/configure.py --target-base-url '<企业清单_BASE_URL>'
python3 scripts/configure.py --progress-base-url '<求职进展_BASE_URL>'
python3 scripts/configure.py --reminder-base-url '<笔面试中心_BASE_URL>'
python3 scripts/configure.py --wiki-space-id '<SPACE_ID>'
python3 scripts/configure.py --workspace-home-node-token '<HOME_NODE_TOKEN>'
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

只有 `offerloop-workbench` 发布并验收成功后才登记：

```bash
python3 scripts/configure.py --workbench-url '<HTTPS_WORKBENCH_URL>'
```

`collection` 的长期同步通常以 bot 写入企业清单；`reminder` 在确认后写入笔面试中心，
且仅用 user 身份读写个人日历。

`full` 使用企业清单、求职进展和 `progress_sync` 的已登记定位器：用户手动把投递进度改为
`已投递` 时，由 Base workflow 调用同步服务即时创建或更新求职进展；当前 Agent 再做幂等补偿。
定位器必须是非敏感元数据；缺少任何一项时保留为 `unverified`，不得根据标题或 record 猜测
目标，也不得另建一套同步应用。
`enabled` 只能在线核验成功后写入；endpoint 必须是无用户名、密码和片段的绝对 HTTPS URL。

启用 `coaching` 时，`--enable-coaching --confirm-schema-v4` 保留现有配置并追加
`artifact_storage`。新用户的训练目录随核心知识库初始化创建；旧用户缺失时经确认补齐。
每次完整运行或明确提前结束后自动保存独立 Markdown 飞书文档。

飞书消息通知可选。启用前必须确认固定接收方、最终摘要内容和发送身份；`user` 目标使用
`ou_` 开头的 open ID，`chat` 目标使用 `oc_` 开头的 chat ID。该确认可作为后续运行的持续
授权，但只允许每次业务运行发送一条约定摘要。首次发送前按 `lark-im` 验证权限与会话关系；
未启用时两个业务 Skill 正常运行，不把通知缺失视为失败。

### 通知配置对话

不要要求普通用户查找飞书 ID。按顺序询问并记录：

1. 私聊或群聊；
2. 目标用户姓名或目标群名称；
3. bot 或 user 发送身份；
4. 默认最终摘要模板或自定义模板。

群名称使用选定身份执行 `lark-cli im +chat-search --query '<群名称>' --disable-search-by-user`；
用户姓名使用 user 身份执行 `lark-cli contact +search-user --query '<姓名>'`。只在唯一精确匹配或
用户完成消歧后保存名称与 ID。bot 群聊还要用 `im +chat-members-list --member-types bot` 对照
当前 profile App ID；列表中没有该 App ID 时，不得启用通知。

### 安装并入群机器人

当用户选择 bot 而当前 profile 尚不可用时，按以下顺序引导，不把“应用配置完成”误报为
“机器人已装好”：

1. 在飞书开发者后台创建或选择企业自建应用，并启用机器人能力；App Secret 只在本机通过
   `lark-cli config init --new` 配置，不进入聊天。
2. 开通最小权限：业务能力所需 Base 权限，以及通知所需的 `im:chat:read`、
   `im:chat.members:read`、`im:message:send_as_bot`。
3. 创建并发布应用版本，再由租户管理员安装或更新应用；只保存已选 profile，不保存密钥。
4. 让群管理员把该应用机器人加入目标群。机器人能获取 tenant token 不代表已经入群。
5. 用 bot 身份精确搜索目标群，再列出 bot 成员并按 App ID 验证；只读核验通过后才保存
   `notifications.status=enabled`。

私聊通知同样需要机器人与目标用户已建立可发送关系。任何首次真实测试消息仍属于对外发送，
必须再次展示接收方、内容和身份并获得明确确认。

## 5. 邮箱配置与最小验证

默认 IMAP 配置位置是：

```text
~/.config/offerloop/recruiting-reminder/.env
```

支持 `XDG_CONFIG_HOME`，也可以用 `OFFERLOOP_IMAP_ENV` 指向其他文件。用户确认后，用：

```bash
python3 scripts/configure.py --init-imap
```

生成模板后，让用户在自己的电脑上填写：

```dotenv
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_LOGIN=you@example.com
IMAP_PASSWORD=app-password-or-authorization-code
MAILBOX=INBOX
TZ=Asia/Shanghai
```

不要在聊天中要求或记录这些值。用户要求验证凭证时，可运行：

```bash
python3 ../recruiting-reminder/scripts/fetch_mail.py --check-connection
```

它只登录、选择邮箱文件夹和登出，不会搜索、获取或展示任何邮件。

## 6. 日历最小权限与工作台 OAuth

`recruiting-reminder` 至少需要：

- `calendar:calendar.free_busy:read`
- `calendar:calendar.event:create`
- `calendar:calendar.event:update`

user 身份缺权限时，按 lark-cli split-flow 进行最小授权：先用 `--no-wait --json` 取得授权
链接和 device code，向用户展示链接/二维码；用户完成授权后，再执行 device-code 完成登录。
不要缓存或公开授权材料。仅使用 `collection` 或 `workspace` 时不要求这些权限。

工作台读取个人日历使用独立的浏览器 OAuth，不复用或导出 lark-cli token。部署工作台时：

1. 为飞书应用开通 `calendar:calendar:readonly`、`calendar:calendar.event:read` 与
   `offline_access` 并发布权限版本；OAuth 授权 URL 也必须显式包含这三项，应用后台已开通不代表
   旧 user token 自动获得新增权限；
2. 将 `<WORKBENCH_PUBLIC_URL>/calendar-oauth-callback` 精确加入应用安全设置的重定向 URL；飞书先回跳专用前端路由，再由页面通过同源请求完成令牌交换，避免低代码网关拦截跨站 OAuth 回调；
3. 在妙搭线上环境设置 `WORKBENCH_PUBLIC_URL` 与随机的 `FEISHU_CALENDAR_COOKIE_SECRET`，禁止回显或保存后者；
4. 用户打开工作台并点击“连接飞书日历”，亲自同意授权；
5. 工作台只在分片的 HttpOnly 加密 Cookie 中保存 refresh token；每次读取日历时由服务端即时换取 access token，并仅在本次请求的内存中使用，同时轮换 refresh token。Refresh Token 失效后，页面重新显示连接按钮。

工作台部署和验收必须调用 `offerloop-workbench` 并完整阅读其 `references/golden-path.md`；
其中包含这条链路的固定 API
方法、Cookie 迁移方式、首屏性能门禁和失败症状映射。

不得要求用户在聊天中发送 user access token、refresh token 或 Cookie，也不得把静态
`FEISHU_CALENDAR_USER_ACCESS_TOKEN` 写入妙搭环境变量。

## 7. 用户状态目录与迁移

| 内容 | 默认位置 |
| --- | --- |
| OfferLoop 公共定位配置 | `~/.config/offerloop/config.json` |
| IMAP 配置 | `~/.config/offerloop/recruiting-reminder/.env` |
| Job Collection 备用凭证 | `~/.config/offerloop/job-collection/.env` |
| 旧 Reminder 双 Base 定位（兼容） | `~/.config/offerloop/recruiting-reminder/base_config.json` |
| 已处理邮件状态 | `~/.local/state/offerloop/recruiting-reminder/processed_emails.json` |

这些文件遵循 `XDG_CONFIG_HOME` 与 `XDG_STATE_HOME`，权限应为 `0600`，不进入 Git，且不应
随 Skill 更新覆盖。发现旧 Skill 目录中的 `.env`、`base_config.json` 或状态文件时：

1. 仅报告文件名，不显示内容；
2. 创建新的用户配置/状态目录；
3. 复制并设为 `0600`；
4. 验证新位置可读取；
5. 保留旧文件作为回滚，除非用户明确要求清理。

## 8. 知识库与工作台职责边界

`offerloop-setup` 登记 profile、三张业务 Base、知识库空间/首页/核心数据目录、schema version
和可选同步定位器。工作台 URL 只有 `offerloop-workbench` 验收后才登记。

知识库目录、Base 节点、首页和训练产物由 `offerloop-workspace` 负责；招聘信息同步由
`job-collection` 负责；邮件识别、事件写入与日历安排由 `recruiting-reminder` 负责；妙搭、
OAuth、工作台模板、发布和页面验收仅由 `offerloop-workbench` 负责。

## 9. 只读在线验收

用户确认后，完整阅读 `verification-matrix.md` 并按其中的命令核验。验收只检查已配置资源是否
可读取、IMAP 是否可连通，以及工作流是否可见；只有选择工作台时才额外验收页面和 OAuth。
