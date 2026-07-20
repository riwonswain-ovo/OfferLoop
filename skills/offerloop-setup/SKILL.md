---
name: offerloop-setup
description: 以渐进方式配置、检查和部署 OfferLoop。适用于“安装 OfferLoop”“第一次使用”“帮我配置”“检查环境”“一键部署 OfferLoop”，或 job-collection、recruiting-reminder、offerloop-workspace 不可用的情况；按岗位收集、邮件提醒、知识库工作台或完整流程分别预检、部署与验收，不要求一次配置全部功能。
---

# OfferLoop Setup

帮助用户以最少步骤启用 OfferLoop。先问本次要启用哪项能力：

- `collection`：招聘信息收集（`job-collection`）
- `reminder`：笔试、测评和面试提醒（`recruiting-reminder`）
- `workspace`：知识库和招聘工作台（`offerloop-workspace`）
- `full`：以上全部，以及即时求职进展联动

用户未指定时，不要猜测；请其从以上四项中选择。用户只选一项时，不要求配置其他功能。

## 安全边界

- 先运行离线预检；预检只读取本机命令、配置键名和文件状态，不访问飞书、工作台或邮箱。
- 不要求用户在聊天中发送 App Secret、邮箱授权码、Cookie、token 或密码。
- 同一个 lark-cli profile 可以承载 bot 和 user 身份，但必须按实际用途分别检查。
- `job-collection` 的长期同步通常使用 `--as bot`；个人日历必须使用 `--as user`，不能静默改用 bot。
- 配置和运行状态属于用户配置目录，不能写进 Skill 安装目录，避免更新覆盖。
- 任何写入飞书 Base、创建日程、读取邮件标题/正文/附件或启用工作流前，必须说明范围并获得用户确认。
- 本 Skill 只负责首次配置、授权检查、资源定位、完整部署和验收；不负责日常首页维护，后者交给 `offerloop-workspace`。

## 1. 离线预检

从本 Skill 根目录运行所选能力的预检：

```bash
python3 scripts/preflight.py --capability '<collection|reminder|workspace|full>' --json
```

预检输出只使用以下状态：

- `ready`：本地所需条件齐备。
- `needs_action`：缺少配置或资源定位，需要用户补充或确认修复。
- `blocked`：缺少运行时、命令或必填条件，当前无法继续。
- `unverified`：本地无法确认的在线条件，待用户授权后只读核验。
- `not_selected`：本次未选择，不计入失败。

不要把 `not_selected` 或 `unverified` 报为“配置失败”。修复 `blocked` 和 `needs_action` 后，重新运行同一条预检命令。

## 2. 仅保存非敏感定位信息

完整阅读 `references/onboarding.md`，再按用户选择配置。只有用户确认保存时，才写入这些公开定位信息：

```bash
python3 scripts/configure.py --profile '<PROFILE>'
python3 scripts/configure.py --target-base-url '<BASE_URL>'
python3 scripts/configure.py --progress-base-url '<BASE_URL>'
python3 scripts/configure.py --reminder-base-url '<BASE_URL>'
python3 scripts/configure.py --wiki-space-id '<SPACE_ID>'
python3 scripts/configure.py --workspace-home-node-token '<NODE_TOKEN>'
python3 scripts/configure.py --workbench-url '<HTTPS_WORKBENCH_URL>'
python3 scripts/configure.py --schema-version 2
python3 scripts/configure.py \
  --progress-sync-app-id '<APP_ID>' \
  --progress-sync-endpoint '<HTTPS_ENDPOINT>' \
  --progress-sync-workflow-id '<WORKFLOW_ID>' \
  --progress-sync-status enabled
```

配置文件是 `~/.config/offerloop/config.json`（遵循 `XDG_CONFIG_HOME`），权限为 `0600`。其中不得保存密码、Cookie、App Secret、授权码或访问令牌。`workbench_url` 必须是没有用户名、密码或片段的 HTTPS 地址。

`full` 工作流优先复用公共配置 `progress_sync` 中已登记的同步应用、HTTPS endpoint 和 Base
workflow，使用户手动改为 `已投递` 后立即同步；`job-collection` 的直接幂等对账作为补偿。
只有在线只读核验确认应用、endpoint 和 workflow 均对应目标资源后，才能将状态保存为
`enabled`；核验前使用 `unverified`，不得提前宣称即时同步可用。
发现已有桥接时只检查或修复，不重复创建妙搭应用、OpenAPI Key 或 workflow。

## 一键部署完整空间

用户明确说“部署”“一键部署”或“创建完整 OfferLoop”时，完整阅读
`references/one-click-deploy.md`。先运行：

```bash
python3 scripts/deployment_plan.py --capability full --json
```

展示将创建或接管的资源与两次必要确认。用户确认后才写 checkpoint 并连续执行部署：第一次确认覆盖 Base、知识库、工作台、同步服务和 workflow；第二次确认只用于用户填好 IMAP 后的安全连通性检查。

部署必须幂等：接管已登记资源，禁止按标题重复创建；应用模板缺失时标记 `blocked`，不交付半成品工作台。
工作台与即时同步服务模板位于 `assets/`；只能用 `scripts/materialize_app_template.py`
铺设到已新建并初始化的妙搭应用，保留目标应用自身绑定，禁止复制模板来源应用的
`.spark`、`.env*`、日志、构建产物或凭证。

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

在线验收可以读取：已配置 Base 的结构、工作流列表/历史、用户日历的未来范围、知识库节点、工作台页面可访问性，以及 IMAP 连通状态。它不得创建测试记录、修改字段/视图、移动知识库节点、创建日程、启用工作流或读取邮件内容。

## 5. 汇报与后续操作

按所选能力汇报状态、已验证内容、缺失项和下一步。没有被选择的能力保持 `not_selected`。

需要写入或修复时，先列出精确的目标与影响范围，等待用户确认；将“修复配置”“迁移旧数据”“运行端到端演练”分成独立确认步骤。完成后可提示用户下一条自然语言命令，例如“同步招聘信息”“检查今天有没有笔试或面试通知”“打开求职知识库”。

## 故障路由

- 找不到 Skill：检查 OfferLoop 安装是否同时包含 `offerloop-setup`、`offerloop-workspace`、`job-collection`、`recruiting-reminder`。
- 缺少 Python 或 lark-cli：先处理预检中的 `blocked` 项，暂停后续飞书操作。
- bot 核验失败：检查应用 scope、版本发布、租户安装和目标 Base 权限；不要对 bot 执行 `auth login`。
- user 核验失败：按最小 scope 发起 split-flow 授权；不要把个人日历查询改为 bot。
- IMAP 连通失败：确认 IMAP 已启用，并使用授权码或应用专用密码，不使用网页登录密码。
- 配置在更新后丢失：检查 `.env` 或状态是否误放在旧 Skill 目录，按 onboarding 迁入用户配置目录。
