<div align="center">

# OfferLoop

### 把招聘信息、投递进展、笔面试安排和个人求职资料放进一个可持续维护的飞书工作流。

**招聘信息同步 · 求职进展 · 邮件识别 · 笔面试中心 · 招聘工作台 · 私有知识库**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Skills](https://img.shields.io/badge/Skills-4-7C3AED)](#四个-skills)

</div>

> **2026-07 更新**：OfferLoop 从两个独立 Skill 升级为一套四 Skill、三张 Base、一个工作台和一个知识库的求职系统。旧用户请先阅读 [旧用户如何升级](#旧用户如何升级)，不要直接对原有 Base 执行“一键完整部署”。

## 这次更新了什么

- 新增 `offerloop-workspace`：创建并维护私有知识库，把工作台、三张 Base、个人材料和题库入口集中在固定位置。
- 新增独立的「求职进展」Base：当企业清单中的进度变为“已投递”时，可即时创建或更新对应进展；人工填写的岗位、JD 和更后阶段不会被覆盖。
- 新增统一「笔面试中心」Base：主表为“全部安排”，并按笔试、群面、一面、二面、三面、HR 面分表管理；一家公司多个岗位、多轮面试都能独立关联。
- 新增招聘工作台：按需读取飞书 Base，并以 OAuth 连接个人飞书日历展示未来 7 天笔面试；支持各 Base、物理表和子视图按 30 条服务端分页浏览，同时保留完整 Base 入口。
- `job-collection` 的企业清单字段精简为招聘事实字段；`recruiting-reminder` 可将识别到的笔面试事件关联并单调推进求职进展。
- 新增可物化的妙搭模板、模板构建 CI、合成端到端验收用例和脱敏发布前验收记录。

## 你最终会得到什么

```text
飞书招聘信息源 / 腾讯 Smartsheet
              ↓
        job-collection
      求职企业清单（事实源）
              ↓ 已投递
          求职进展
              ↑ 关联并单调推进
IMAP 邮箱 → recruiting-reminder → 笔面试中心 → 飞书个人日历
              ↓
      OfferLoop 招聘工作台
              ↓
       OfferLoop 求职空间（知识库）
```

所有 Skill 都可独立使用：不启用邮箱和日历，不影响招聘信息同步；不安装工作台，不影响三张 Base 的正常使用。

## 案例

### 招聘工作台

工作台读取真实飞书 Base 与个人飞书日历：左侧展示未来 7 天笔试与面试，右侧预留每日训练入口；投递进展数据区可在企业清单、求职进展和笔面试中心间切换。Base 数据按当前物理表和子视图懒加载，每页从服务端读取 30 条；用户仍可翻页浏览全部数据，需要编辑时直接打开完整 Base。个人日历通过页面 OAuth 连接并自动轮换授权，不需要复制 token。

![OfferLoop 招聘工作台：未来 7 天笔面试与训练入口](docs/images/workbench/dashboard-overview.png)

![OfferLoop 招聘工作台：企业清单的多视图与业务数据](docs/images/workbench/business-data.png)

### 固定的知识库入口

知识库不是数据副本，而是使用指南、工作台、三张 Base、简历、面试准备、面试复盘、题库和信息源的固定目录。业务数据仍以对应 Base 为唯一事实源。

![OfferLoop 求职空间：目录](docs/images/workbench/wiki-directory.png)

![OfferLoop 求职空间：使用指南](docs/images/workbench/wiki-guide.png)

> 截图来自真实使用环境。为展示产品能力，企业名称和招聘数量按用户提供的截图保留；请自行确认公开仓库中的截图符合你的信息披露要求。

## 四个 Skills

| Skill | 职责 | 常见触发方式 |
|---|---|---|
| `offerloop-setup` | 检查环境、登记非敏感资源定位、生成部署计划并协助迁移 | “第一次使用 OfferLoop，先检查环境和我想启用的能力” |
| `job-collection` | 从授权的飞书 Base 或腾讯 Smartsheet 增量同步招聘信息，并补偿对账求职进展 | “同步这个招聘表到求职企业清单” |
| `recruiting-reminder` | 从 IMAP 邮箱识别笔试、测评和面试，先确认再写入笔面试中心/日历 | “扫描最近 7 天招聘邮件，先给我识别结果” |
| `offerloop-workspace` | 管理私有知识库首页、固定导航和资源入口 | “检查我的 OfferLoop 求职空间，只读不要修复” |

## 新用户：从这里开始

### 最小成功契约

对新用户而言，**最小成功**是：在同一个 Agent 环境中安装并发现下面四个 OfferLoop Skill，
重新开启一个 Agent 会话，然后让 `offerloop-setup` 对你选定的一项能力做只读本机检查。
这表示安装和本地引导已就绪；它不表示已经拥有飞书权限、已经连通邮箱，或已经部署完整工作台。

- `offerloop-setup`
- `job-collection`
- `recruiting-reminder`
- `offerloop-workspace`

四个 Skill 是本仓库唯一随包提供的 Skill。它们不会替你安装 Node、Python、`lark-cli`，也不会
创建飞书应用、授予权限或安装下文列出的外部 Lark Skill。

### 1. 安装前准备

请先在本机准备以下条件：

- Node.js（包含 `npx`），用于执行安装命令；可用 `node --version` 与 `npx --version` 确认。
- Python 3.10 或更高版本；可用 `python3 --version` 确认。
- 已安装的 `lark-cli`；可用 `lark-cli --help` 确认命令可运行。推荐按 [Lark 官方 CLI 安装说明](https://github.com/larksuite/cli) 执行：

  ```bash
  npx @larksuite/cli@latest install
  npx skills add larksuite/cli -g -y
  ```

  第一条安装命令行工具，第二条安装其配套的 Lark Agent Skills；后续还需要在本机初始化并选择实际可用的 profile。
- 可登录的飞书/Lark 账号，以及对要读取或管理的资源拥有相应权限。飞书应用、租户安装、文档共享和管理员权限不是由 OfferLoop 安装命令提供的。

`node`/`npx` 只用于安装；OfferLoop 的离线预检不会检查它们。请按所用 Agent 与
`lark-cli` 的官方安装说明完成安装，不要在聊天中粘贴 App Secret、密码、Cookie、token 或邮箱授权码。

### 2. 安装四个 OfferLoop Skill

```bash
npx skills add riwonswain-ovo/OfferLoop -g \
  -s offerloop-setup job-collection recruiting-reminder offerloop-workspace -y
```

手动安装时，也必须将仓库 `skills/` 下的上述**四个**目录分别复制到 Agent 的全局 Skills 目录；
不要把仓库根目录作为一个 Skill，也不要合并四份 `SKILL.md`。

**安装后必须结束当前 Agent 会话，并新开一个会话。** Skill 目录通常在会话开始时加载；在
同一会话中继续对话，Agent 可能仍然发现不到刚安装的 Skill。

### 3. 选择能力，并先做只读预检

告诉 Agent：

```text
请调用 offerloop-setup。我第一次使用 OfferLoop，先只读检查环境和我想启用的能力；不要创建或修改飞书资源。
```

预检会区分 `ready`、`needs_action`、`blocked` 和 `unverified`。它仅检查 Python 版本、
`lark-cli` 是否在路径中、四个 OfferLoop Skill 是否存在，以及本地配置/文件权限；它不验证
`lark-cli` profile 是否真实可用，也不访问飞书、邮箱、妙搭或浏览器。`ready` 因而只表示本机
可检查的条件已满足；`unverified` 表示仍需后续只读在线核验，不是错误。

### 4. 按能力补齐人工前置条件

以下前置条件需要你或租户管理员在飞书/邮件/妙搭中完成。它们不会由安装或离线预检自动完成。

| 能力 | 使用前需人工完成 | 该操作依赖的外部 Lark Skill（不随 OfferLoop 打包） |
|---|---|---|
| `collection` | 配置可用的 bot profile；给来源 Base 查看权限、给目标 Base 编辑权限；如需 workflow，再给应用相应管理权限。没有自建应用权限时，请管理员提供或安装已发布应用。 | 核心同步直接使用 `lark-cli`；可选飞书通知需要 `lark-im`，按姓名查找通知对象还需要 `lark-contact`。 |
| `reminder` | 在本机填写 IMAP 配置并使用邮箱服务商的授权码/应用专用密码；配置笔面试中心和求职进展 Base；若要建日历，完成 user 身份的最小日历授权。 | 创建或更新个人日历需要 `lark-calendar`；可选通知需要 `lark-im`。 |
| `workspace` | 对三张 Base、知识库空间和首页有访问权限；登记工作台 HTTPS 地址。若要创建或整理知识库，需有对应的创建/编辑权限。 | 创建或整理空间需要 `lark-base`、`lark-doc` 和 `lark-wiki`。只读本地定位检查不调用它们。 |
| `full` | 完成前三项；为即时同步准备飞书应用、Base workflow 和可访问的 HTTPS 同步端点；如部署工作台，还需要妙搭创建、配置、发布和环境变量管理权限，以及租户管理员对应用/权限版本的发布或安装支持。 | 组合使用上列外部 Skill；如启用消息通知，还会需要 `lark-im`/`lark-contact`。 |

外部 Lark Skill 在本仓库中**没有捆绑**。在要求 Agent 创建 Base、整理知识库、写日历或发送通知前，
请先按所用 Agent 的方式单独安装或启用表中所列 Skill，并再次新开会话让它们加载。缺少某项时，
只能使用不依赖它的能力，或请管理员/具备权限的同事完成对应配置。

> 当前版本限制：`collection` 的预检仍会要求登记“求职进展”Base，即使你尚未启用即时进展联动。
> 因此只配置企业清单的用户会看到 `needs_action`，不能把该项预检报告为 `ready`。不要为了消除
> 这一提示而猜测或伪造 Base 地址；该预检契约将在后续修复中按“仅同步招聘信息”的最小配置调整。

### 5. 确认部署计划后再创建资源

```text
请调用 offerloop-setup，一键部署完整 OfferLoop。先展示部署计划；创建 Base、知识库和工作台前向我确认一次，IMAP 只创建本地模板。
```

完整部署会创建三张 Base、私有知识库、工作台模板和即时同步定位信息。它还依赖上表中的
补充 Lark Skill、`lark-cli`、飞书应用/租户权限及妙搭权限；若这些条件尚未具备，先停在计划或
只读核验阶段，不把“模板已安装”当作部署完成。飞书扫码、邮箱授权码和任何真实在线验证都需要
你亲自完成；不要在聊天中发送密码、token 或 App Secret。

## 旧用户如何升级

本次是结构性升级。旧版的 `job-collection` 和 `recruiting-reminder` 可以继续独立使用，但不会自动拥有新的工作台、知识库、求职进展或统一笔面试中心。

### 升级前须知

- **不要删除旧 Base、旧配置或去重状态。** 新版不会自动删除它们。
- **不要对已有数据直接执行“一键完整部署”。** 先让 `offerloop-setup` 输出只读迁移检查和计划。
- 旧企业清单的字段与新版“求职企业清单”不同；是否新建、迁入或保留旧表，应在迁移计划中逐项确认。
- IMAP 凭证、Base URL 和邮件去重状态仍存于本机私有目录，不应复制进 Skill 目录或 Git 仓库。

### 推荐升级步骤

1. 可选：备份本地配置和状态（不要提交备份）。

   ```bash
   cp -a ~/.config/offerloop ~/.config/offerloop.backup-$(date +%Y%m%d)
   cp -a ~/.local/state/offerloop ~/.local/state/offerloop.backup-$(date +%Y%m%d)
   ```

2. 如果最初通过 `npx skills add` 安装，使用正式更新命令，确保四个 Skill 都更新到 GitHub
   默认分支 `main` 的同一版本：

   ```bash
   npx skills update offerloop-setup job-collection recruiting-reminder offerloop-workspace -g -y
   ```

   如果命令提示 `No installed skills found matching`，说明旧安装没有来源追踪。先把旧 Skill
   目录移动到可恢复备份，再从 GitHub `main` 重新登记安装：

   ```bash
   offerloop_backup="$HOME/.codex/skills/offerloop-backup-$(date +%Y%m%d-%H%M%S)"
   mkdir -p "$offerloop_backup"
   for skill in offerloop-setup job-collection recruiting-reminder offerloop-workspace; do
     if [ -d "$HOME/.codex/skills/$skill" ]; then
       mv "$HOME/.codex/skills/$skill" "$offerloop_backup/"
     fi
   done
   npx skills add riwonswain-ovo/OfferLoop -g -a codex \
     -s offerloop-setup job-collection recruiting-reminder offerloop-workspace -y --copy
   ```

   手动安装的用户也可以按相同方式备份后替换四个 Skill 文件夹。无论哪种方式，都必须
   **保留** `~/.config/offerloop/` 和 `~/.local/state/offerloop/`；这些用户配置和状态不在 Skill
   安装目录中。更新后重新开始一个 Agent 会话，让 Skill 目录重新加载。

3. 先运行只读迁移检查：

   ```text
   请调用 offerloop-setup。我是旧版 OfferLoop 用户，已经升级到四个 Skill。
   请只读检查我的旧配置和现有飞书 Base，给出迁移计划；不要创建、修改或删除任何资源。
   ```

4. 看清迁移计划后，再明确授权创建新的三张 Base、知识库和工作台，或逐项迁入旧数据。迁移完成后，运行：

   ```text
   请调用 offerloop-setup，检查完整 OfferLoop 的配置和资源定位；先只读验证，不要修复。
   ```

更详细的兼容原则见 [迁移指南](MIGRATION.md)。

## 核心数据模型

### 求职企业清单

主表及企业性质子表保留 13 个招聘事实字段，依次为：信息更新时间、投递进度、公司、招聘批次、招聘项目、招聘岗位、公告链接、投递链接、投递截止时间、城市、行业标签、企业性质、子表 `record_id`。

投递进度为：`待确认`、`感兴趣`、`已投递`、`已拒绝`。

### 求职进展

独立可编辑 Base，以企业清单 `record_id` 为唯一键。当一条企业信息进入“已投递”时，创建或更新对应进展记录；公司、公告链接和投递链接与企业清单保持一致，投递岗位和岗位 JD 默认留空，由用户填写。重复同步不会覆盖手填岗位、JD、首次投递日期或更后的面试阶段。

### 笔面试中心

一个 Base，主表为“全部安排”，物理子表为笔试、群面、一面、二面、三面和 HR 面。不同岗位和不同轮次都作为独立事件；公司级笔试可以关联多条求职进展。表中预留“面试准备文档”和“面试复盘文档”字段，等待后续专用 Skill 写入。

## 日常使用

```text
请调用 job-collection，把这个我有权限访问的招聘 Base 增量同步到求职企业清单。
```

```text
请调用 recruiting-reminder，扫描最近 7 天招聘邮件。先让我确认识别和关联结果，再写入笔面试中心并安排日历。
```

```text
请调用 offerloop-workspace，检查三个 Base、工作台和知识库首页是否完整；只读检查，先不要修复。
```

## 配置、安全与边界

| 内容 | 默认位置 |
|---|---|
| 公共资源定位 | `~/.config/offerloop/config.json` |
| Job Collection 私有配置 | `~/.config/offerloop/job-collection/.env` |
| IMAP 凭证 | `~/.config/offerloop/recruiting-reminder/.env` |
| 已处理邮件状态 | `~/.local/state/offerloop/recruiting-reminder/processed_emails.json` |

- 公共配置只保存 profile、Base URL、知识库 ID、首页节点、工作台 HTTPS URL 和可选同步定位，不保存密码或 secret。
- Base 写入、日历创建、知识库结构变更前均应保留人工确认。
- 邮件正文只用于当前招聘事件抽取，不写入知识库首页。
- 当前版本仅为“简历深挖”和“产品 Sense”训练保留工作台位置，尚未包含生成训练题的专用 Skill。

## 开发与发布前验收

```bash
python3 -m unittest discover -s tests -v
python3 -m unittest discover -s skills/job-collection/tests -v
python3 -m unittest discover -s skills/recruiting-reminder/tests -v
npm --prefix services/job-progress-sync test
python3 skills/job-collection/scripts/validate_skill.py
```

GitHub CI 还会在 Node 20 下分别安装、测试、类型检查并构建两份妙搭模板。合成端到端用例见 [验收用例](docs/cases/end-to-end-acceptance.md)，本地脱敏发布记录见 [发布前验收记录](docs/cases/release-acceptance-2026-07-20.md)。

## License

[MIT](LICENSE)
