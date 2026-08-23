<div align="center">

# OfferLoop

### 把零散的求职信息、真实经历和面试反馈，变成一套会持续成长的求职系统。

**招聘机会 · 求职进展 · 笔面试提醒 · 经历深挖 · 定制简历 · 能力训练 · 面试准备与复盘**

[![Release](https://img.shields.io/badge/Release-v0.1.0--alpha.12-7C3AED)](https://github.com/riwonswain-ovo/OfferLoop/releases/tag/v0.1.0-alpha.12)
[![Skills](https://img.shields.io/badge/Skills-9-2563EB)](#-认识-9-个-skill)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Agents](https://img.shields.io/badge/Agents-4-0F766E)](#支持的-agent)
[![License](https://img.shields.io/badge/License-MIT-16A34A)](LICENSE)

让 Agent 不只在一次对话里帮你完成任务，而是理解你的方向、记住经过确认的事实，并把每次投递、训练和面试连接起来。

[快速安装](#-安装-offerloop) · [认识 9 个 Skill](#-认识-9-个-skill) · [飞书知识库（可选）](#-配套飞书知识库可选) · [升级](#-升级与迁移) · [安全边界](#-数据与安全边界)

</div>

---

## ✨ OfferLoop 是什么

OfferLoop 是一套由 9 个标准 Agent Skill 组成的求职系统。它既可以整体安装，也可以只取其中一个 Skill。每个 Skill 都能独立完成明确任务，组合使用时则会形成三条长期闭环：

```text
招聘机会：信息源 → 偏好筛选 → 用户确认 → 企业清单 → 求职进展
求职进展：招聘通知 → 笔面试安排 → 阶段推进 → 准备 → 真实复盘
能力成长：经历证据 → 模拟/复盘 → 能力观察 → 专项训练 → 再次验证
```

| 你现在最需要什么 | 从这里开始 | 你会得到什么 |
|---|---|---|
| 先认识自己，确定投递边界 | `career-profile` | 岗位偏好、性格探索和个人表达习惯 |
| 整理招聘信息 | `job-collection` | 去重、筛选后的求职企业清单 |
| 管理笔试和面试通知 | `recruiting-reminder` | 笔面试中心与经确认的日历安排 |
| 把一段经历讲清楚 | `experience-deepthink` | 细节复原稿与面试逐字稿 |
| 针对岗位制作简历 | `resume-tailor` | 一页 A4 定制简历 PDF |
| 训练岗位能力 | `competency-lab` | 能力地图、专项训练和复测计划 |
| 准备一场真实面试 | `interview-prep` | 当前公司、岗位和轮次的准备文档 |
| 做一次模拟面试 | `mock-lab` | 真实节奏问答与逐题诊断 |
| 复盘刚结束的面试 | `talk-review` | 求职者复盘与招聘者视角评估 |

### 两种安装方式

| | 完整模式 | 单 Skill 模式 |
|---|---|---|
| 适合谁 | 想建立完整求职流程的用户 | 只想先解决一个具体问题的用户 |
| 下载内容 | 9 个长期 Skill + 共享运行时 | 指定 Skill + 最小共享运行时 |
| 用户画像 | 首次使用时逐步建立 | 跳过全局画像门槛 |
| 默认交付 | Chat；用户选择后可沉淀到飞书 | Chat 或用户选择的本地位置 |
| 飞书资源 | 可选，确认后才接入或创建 | 默认不创建 |
| 后续切换 | 可随时继续配置飞书 | 可重新安装完整模式 |

> [!IMPORTANT]
> 配套飞书知识库是**可选的线上配置**，不是下载或安装 Skill 的前置条件。下载仓库不会创建 Base、知识库、文档、日历或任务；只有用户明确选择接入飞书并确认资源计划后，Agent 才会执行线上写入。

---

## 🚀 安装 OfferLoop

### 安装前准备

| 检查项 | 要求 | 说明 |
|---|---|---|
| Python | 3.10 或更高版本 | Windows 可使用 `py -3` 代替 `python3` |
| Agent | Codex、Claude Code、Hermes Agent 或 WorkBuddy | Agent 需要支持标准 `SKILL.md` 目录 |
| GitHub | 能访问公开仓库 | 也可以从 Release 下载源码包 |
| 飞书账号 | 可选 | 仅在用户选择配套飞书知识库时需要 |

安装 Skill 文件不需要 App Secret、邮箱密码、Cookie、token 或授权码。不要把任何凭证粘贴到 Chat。

### 方式 A：完整安装 9 个 Skill

先下载稳定版并预演安装：

```bash
git clone https://github.com/riwonswain-ovo/OfferLoop.git
cd OfferLoop
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
```

确认目标目录和冲突检查无误后安装：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full
```

安装完成后重新开启 Agent 会话，并把安装命令输出的首次使用提示发给 Agent。你也可以直接发送：

```text
我刚安装 OfferLoop 完整模式。请先介绍 9 个 Skill，做只读检查，
然后问我想从哪件事开始。未经我确认，不要创建或修改线上资源。
```

如果你选择继续配置飞书，Agent 会先展示准备复用或创建的三张飞书业务 Base、私有知识库和固定目录。确认计划之后才会写入；中途退出时会保留可恢复进度，不会把示例 URL 或空资源当成完成。

Agent 完成真实线上只读验收后，才可以记录并核验飞书配置：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --record-workspace-verified
python3 scripts/setup_offerloop.py --agent codex --mode full --verify
```

如果暂时不配置飞书，本地 9 个 Skill 仍然已经安装完成；需要飞书长期沉淀的流程会在实际使用时先询问你的选择。

只有本地安装、模式配置、三张 Base、知识库目录、schema v6 locator 和权限都通过时，完整模式才会
报告 `ready`。`--record-workspace-verified` 本身不访问飞书，只能由 Agent 在真实线上验收通过后
执行；安装命令不会复制三张 Base，也不会用示例 URL 冒充已经完成线上 setup。

### 方式 B：只下载一个 Skill

下面以 `mock-lab` 为例。Sparse checkout 只下载安装脚本、指定 Skill 和最小共享运行时：

```bash
git clone --filter=blob:none --no-checkout https://github.com/riwonswain-ovo/OfferLoop.git OfferLoop-mock-lab
cd OfferLoop-mock-lab
git sparse-checkout init --cone
git sparse-checkout set scripts skills/mock-lab
git sparse-checkout add skills/offerloop-workspace skills/offerloop-setup/scripts skills/offerloop-setup/references
git checkout main

python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab --dry-run
python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab
python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab --verify
```

把命令中的 `mock-lab` 替换成下面任意一个 Skill 名称即可：

```text
career-profile       job-collection       recruiting-reminder
experience-deepthink resume-tailor        competency-lab
interview-prep       mock-lab             talk-review
```

单 Skill 模式默认在 Chat 中交付，不创建整套飞书空间。`job-collection` 与 `recruiting-reminder` 在执行核心功能时仍需要用户提供相应信息源、目标 Base、邮箱或日历授权；Agent 会只申请当前任务所需的最小范围。

### 支持的 Agent

将示例命令中的 `codex` 替换为以下任一目标：

| Agent | `--agent` 参数 |
|---|---|
| OpenAI Codex | `codex` |
| Claude Code | `claude-code` |
| Hermes Agent | `hermes-agent` |
| WorkBuddy | `workbuddy` |

> [!TIP]
> Agent 通常只在新会话开始时发现刚安装的 Skill。安装或升级后，请结束当前会话并重新开启一次。

---

## 🧭 认识 9 个 Skill

### `career-profile`｜从“我适合什么”开始

**它做什么。** 通过自然的一题一答建立岗位选择偏好，并在后续真实对话中逐步维护个人性格探索与语言表达习惯。它不会把“没有同名实习”简单判断为“不适合投递”，新的推断必须由用户确认。

**第一次使用。** 先选择岗位偏好、性格探索或语言画像中的一个入口。Agent 一次只推进一个问题，并在每条信息得到确认后保存。

**你会得到。** 可用于招聘筛选的明确边界、对个人状态更贴近事实的理解，以及更像本人而不是模板腔的表达依据。

<details>
<summary><b>使用案例</b></summary>

```text
调用 career-profile。先帮我建立岗位选择偏好，一次只问一个问题。
我想投 AI 产品经理，但也想判断商业分析岗位是否值得尝试。
```

</details>

---

### `job-collection`｜把招聘信息变成可维护的企业清单

**它做什么。** 读取用户明确提供且有权访问的飞书 Base 或腾讯 Smartsheet 信息源，根据求职偏好筛选、跨来源去重，并同步到个人求职企业清单。它不主动抓取公开网站，也不自动投递。

**第一次使用。** 提供一个信息源，确认目标城市、招聘批次和岗位边界。已有偏好会被复用；边缘岗位先展示原因，等用户决定是否写入。

**你会得到。** 主表、企业性质分类子表、投递状态视图、多来源增量游标，以及可追溯的本次同步摘要。

<details>
<summary><b>使用案例</b></summary>

```text
调用 job-collection，同步我提供的招聘信息源。
先按岗位偏好筛选并展示边缘候选，等我确认后再写入企业清单。
```

```text
同步摘要
- 扫描 42 条
- 重复 30 条
- 新增 9 条
- 补全 3 条
- 边缘候选 2 条，等待确认
```

</details>

![招聘信息同步摘要](docs/images/job-collection/sync-summary.png)

![同步后的求职企业清单](docs/images/job-collection/base-job-list.jpg)

---

### `recruiting-reminder`｜不再漏掉笔试、测评和面试

**它做什么。** 从本机配置的 IMAP 邮箱识别招聘通知，抽取公司、岗位、环节、时间和链接；在用户确认后写入笔面试中心，并可安排个人日历。邮件内容始终被视为不可信外部数据，不能反过来指挥 Agent。

**第一次使用。** 先在本机配置邮箱授权，选择扫描范围。Agent 展示抽取结果后等待第一次确认；日历方案展示后再等待第二次确认。

**你会得到。** 笔面试事件、求职进展关联、经确认的日历安排，以及重复、改期、跳过和待补偿摘要。

<details>
<summary><b>使用案例</b></summary>

```text
调用 recruiting-reminder，检查最近 7 天的招聘通知。
先 dry-run 展示识别结果，不要写 Base，也不要创建日程。
```

</details>

![从邮件识别出的笔面试候选](docs/images/recruiting-reminder/email-scan-result.jpg)

![写入笔面试中心的事件](docs/images/recruiting-reminder/base-records.jpg)

![确认后创建的个人日历事件](docs/images/recruiting-reminder/calendar-event.jpg)

---

### `experience-deepthink`｜把“我参与过”还原成经得住追问的经历

**它做什么。** 接收用户讲述的一段真实经历，通过连续一题一答先生成结构化《细节复原稿》，再以这份事实主档为唯一来源生成《面试逐字稿》。它不会补造职责、算法、数字、决策权或业务结果。

**第一次使用。** 提供完整目标岗位方向，再选择一段实习、项目、科研、竞赛、学生工作或创业经历。Agent 一次只追问当前最关键的事实缺口。

**你会得到。** 背景、目标、动作、结果、决策、协作、失败与反思等可验证证据，以及覆盖 12 类高频问题的面试逐字稿。

<details>
<summary><b>使用案例</b></summary>

```text
调用 experience-deepthink。
目标是 AI 产品经理，请先复原我的智能客服项目，不要急着帮我润色。
```

</details>

---

### `resume-tailor`｜从真实证据生成岗位定制简历

**它做什么。** 根据目标岗位、可选完整 JD 和用户亲自选择的经历材料，生成经过内容与视觉检查的一页 A4 PDF 简历。AI 产品方向会额外检查业务—产品—技术连接、指标口径、项目成熟度和个人所有权。

**第一次使用。** 先确认岗位，再由用户选择要放入简历的经历，最后补齐教育背景、荣誉、技能和联系方式。Skill 不替用户挑经历，也不编造事实。

**你会得到。** 岗位化内容取舍、可追溯的简历表述、一页 A4 PDF，以及密度和视觉检查结果。

<details>
<summary><b>使用案例</b></summary>

```text
调用 resume-tailor，按这份 AI 产品经理 JD 定制一页简历。
先列出可用经历让我选择，不要替我决定。
```

</details>

---

### `competency-lab`｜把一次失误变成可复测的训练计划

**它做什么。** 为任意行业与职能岗位建立能力模型，诊断证据和差距，并通过每日三题或专项训练进行刻意练习。一次回答不好只会形成“待验证观察”，不会被永久贴成能力缺陷。

**第一次使用。** 提供目标岗位，或让 Skill 读取面试准备、模拟面试和真实复盘中尚未解决的能力观察，再选择每日训练或专项训练。

**你会得到。** 岗位能力地图、证据强弱、待验证缺口、训练题、二次作答与复测计划。

<details>
<summary><b>使用案例</b></summary>

```text
调用 competency-lab，读取我最近两次模拟面试的未解决观察。
今天只练三道商业化判断题，先让我独立回答。
```

</details>

---

### `interview-prep`｜为当前公司、岗位和轮次做准备

**它做什么。** 围绕明确的公司、岗位、完整 JD 和面试轮次，结合用户指定的经历或简历，研究公司业务与高相关面经，生成一轮一份的准备文档。

**第一次使用。** 确认公司、岗位、JD 和轮次，再指定真实个人材料。外部资料只用于理解业务场景和可能问题，不会替用户补造答案。

**你会得到。** 90 秒自我介绍、公司与岗位认知、专业知识补齐、15 道高相关正式题与参考答案、追问和面试前检查清单。

<details>
<summary><b>使用案例</b></summary>

```text
调用 interview-prep，为明天的 AI 产品经理一面做准备。
使用我指定的经历复原稿，先确认 JD 和轮次再开始研究。
```

</details>

---

### `mock-lab`｜在真实节奏里练会回答

**它做什么。** 面向产品、AI 产品、战略商分、数据分析、咨询、商业化等方向进行真实模拟或逐题训练。普通模拟一次只问一题，完整模拟结束后统一复盘；逐题训练则答完立即诊断。

**第一次使用。** 提供目标公司、岗位、可选 JD、轮次和个人材料，再选择完整模拟、专项练习、Case、群面或压力追问模式。

**你会得到。** 问题与追问链、逐题诊断、岗位能力覆盖、证据风险、改进表达和下一轮训练建议。

<details>
<summary><b>使用案例</b></summary>

```text
调用 mock-lab，用这份 JD 做一次 8 题业务面模拟。
过程中不要点评，结束后再统一复盘。
```

</details>

---

### `talk-review`｜把真实面试变成下一轮的优势

**它做什么。** 接收真实面试 ASR，忠实拆分面试官与候选人原话，先确认不确定片段，再生成求职者复盘和招聘者视角评估。AI 产品方向会额外诊断技术术语、指标口径、项目成熟度和个人所有权。

**第一次使用。** 上传或粘贴 ASR，说明本次关联的简历和经历材料。Skill 会保留转写的不确定性，不把猜测或事后补充当成原始事实。

**你会得到。** 问答链、逐题评价、准备命中分析、改进回答、招聘者视角结论，以及精确回流到其他 Skill 的行动建议。

<details>
<summary><b>使用案例</b></summary>

```text
调用 talk-review，分析这份真实面试 ASR。
先标记说话人和转写不确定的地方，再对照我的准备文档逐题复盘。
```

</details>

---

## 🗂️ 配套飞书知识库（可选）

OfferLoop 可以完全从 Chat 和本地文件开始使用。希望长期积累材料时，再选择把三张业务 Base 与个人文档接入一个默认私有的飞书知识库。

### 它什么时候会创建

- `git clone`、下载 Release 和安装 Skill 时：**不会创建**；
- 单 Skill 模式：默认不创建；
- 完整模式本地安装后：先询问用户是否接入飞书；
- 用户选择接入后：先只读检查已有资源并展示计划；
- 用户明确确认后：才创建缺失资源或登记已有资源。

### 推荐目录

```text
00｜OfferLoop 使用指南
01｜核心求职数据 / 企业清单、求职进展、笔面试中心
02｜用户画像
03｜定制简历
04｜经历深挖 / 细节复原文档、面试逐字文档
05｜岗位能力与训练 / 岗位能力画像、专项训练、每日三题、周报
06｜面试准备
07｜模拟面试
08｜真实面试复盘 / ASR 待复盘、已完成复盘
```

三张飞书业务 Base 保存企业、投递与笔面试事实；知识库保存用户确认后的画像、简历、经历、训练与复盘文档。初始化不会用空模板替用户编造画像，也不会复制三张 Base 的业务记录。

> [!NOTE]
> 暂时不使用飞书不会影响单 Skill 模式。以后想长期沉淀时，可以重新运行完整模式 setup 并从只读检查开始。

---

## 🔄 升级与迁移

### 以前只安装过 `job-collection` 和 `recruiting-reminder`？

早期版本只公开提供这两个 Skill。旧用户可以直接迁移到现在的 9 个 Skill，不需要删除旧目录，
也不需要重新创建已有 Base。

> [!IMPORTANT]
> 不要先卸载旧 Skill。新版安装器会先识别同名目录；只有用户确认它们属于旧版 OfferLoop 并显式
> 使用 `--upgrade` 后，才会把旧目录移动到可恢复备份，再安装新版本。

先把最新版下载到一个新目录，保留原来的下载目录作为额外回滚入口：

```bash
git clone https://github.com/riwonswain-ovo/OfferLoop.git OfferLoop-latest
cd OfferLoop-latest
```

迁移前检查以下旧文件；存在时复制到新的用户配置目录，不存在就跳过。不要把文件内容或凭证粘贴
到 Chat：

| 旧文件 | 新位置 |
|---|---|
| `job-collection/.env` | `~/.config/offerloop/job-collection/.env` |
| `recruiting-reminder/scripts/.env` | `~/.config/offerloop/recruiting-reminder/.env` |
| `recruiting-reminder/base_config.json` | `~/.config/offerloop/recruiting-reminder/base_config.json` |
| `recruiting-reminder/processed_emails.json` | `~/.local/state/offerloop/recruiting-reminder/processed_emails.json` |

然后只做预演：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
```

预演发现旧版同名目录并显示 `conflict` 是预期行为，表示安装器没有直接覆盖。确认这些目录确实属于
旧版 OfferLoop 后再执行：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --upgrade
python3 scripts/install_offerloop.py --agent codex --verify
```

升级会安装 9 个 Skill，并把旧副本保存在 Agent 配置目录下的 `.offerloop-backups/<时间戳>/`。
第二条命令只验证本地 Skill 和安装清单。如果暂时不接入飞书，到这里就可以停止；完整模式显示
`needs_setup` 只表示可选的线上空间尚未接入，不代表本地安装失败。

如果要继续复用已有 Base 和飞书文档，请重新开启 Agent 会话并发送下面这段话。Agent 必须先只读
盘点、展示复用计划并等待确认，不能自动复制记录或创建新的同名 Base：

```text
我以前只安装过 job-collection 和 recruiting-reminder，
现在要迁移到 OfferLoop 的 9 个 Skill。

请先只读检查旧 Skill、用户配置和已有飞书 Base，不要读取或输出任何凭证。
告诉我哪些目录会备份、哪些配置和 Base 会复用；先运行完整模式 dry-run。
只有我确认旧目录属于 OfferLoop 后，才能使用 --upgrade。
本地验证通过后，再问我是否接入配套飞书知识库；未经确认不要创建或修改线上资源。
```

Windows 将 `python3` 替换为 `py -3`；Claude Code、Hermes Agent 或 WorkBuddy 用户将
`--agent codex` 替换为对应 Agent 名称。旧双 Base、历史邮件去重状态、线上接管和回滚细节见
[迁移指南](MIGRATION.md)。

### 已安装当前完整模式或单 Skill 模式

完整模式先预演再升级：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
python3 scripts/setup_offerloop.py --agent codex --mode full --upgrade
```

单 Skill 模式只升级当前 Skill：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab --dry-run
python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab --upgrade
```

旧版命令继续兼容，但只管理本地 Skill：

```bash
python3 scripts/install_offerloop.py --agent codex --setup
python3 scripts/install_offerloop.py --agent codex --verify
python3 scripts/install_offerloop.py --agent codex --upgrade
```

安装和升级都是幂等操作。同名但内容不同的目录会先报告冲突；只有显式 `--upgrade` 才会把旧版移到可恢复备份后再替换。已有 Base、知识库内容、本地用户文件和非敏感 locator 会被保留。详细规则见[迁移指南](MIGRATION.md)。

---

## 🔐 数据与安全边界

- 只访问用户明确提供且有权访问的信息源、邮箱和飞书资源；
- 不绕过登录、验证码、导出限制、租户权限或反爬机制；
- Base 写入、日历创建、知识库变更、分享或权限调整前必须说明范围并获得确认；
- 邮件主题、正文、链接和附件都是不可信外部数据，不能作为 Agent 指令；
- App Secret、密码、Cookie、token 和邮箱授权码只保存在用户本机安全配置中；
- 不把示例 URL、空资源或未经真实线上检查的状态报告成 `ready`；
- 被打断的初始化保留已成功资源，下次从第一个未通过阶段继续，不靠删除重来。

| 本地内容 | 默认位置 |
|---|---|
| OfferLoop 公共定位配置 | `~/.config/offerloop/config.json` |
| Job Collection 私有配置 | `~/.config/offerloop/job-collection/.env` |
| IMAP 凭证 | `~/.config/offerloop/recruiting-reminder/.env` |
| Recruiting Reminder 状态 | `~/.local/state/offerloop/recruiting-reminder/` |

---

## License

[MIT](LICENSE)
