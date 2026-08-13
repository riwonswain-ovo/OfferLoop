# OfferLoop

OfferLoop 是一套围绕求职事实、材料沉淀和能力成长运行的 Skill 系统。新用户可以选择：

- **完整模式**：9 个长期 Skill + 三张飞书业务 Base + 一个用户私有的 OfferLoop 知识库；
- **单 Skill 模式**：只安装指定 Skill 和最小共享运行时，默认不创建飞书知识库或 Base。

## 9 个长期 Skill

| Skill | 职责 |
| --- | --- |
| `career-profile` | 通过自然对话认识自己，维护岗位迁移边界与个人语言画像 |
| `job-collection` | 收集岗位、执行硬条件过滤并确认边缘候选 |
| `recruiting-reminder` | 识别招聘通知并维护笔面试事件 |
| `experience-deepthink` | 复原经历、深挖决策与整理证据 |
| `resume-tailor` | 针对岗位生成定制简历 |
| `competency-lab` | 抽象岗位能力、诊断差距并生成专项训练 |
| `interview-prep` | 准备真实公司、岗位和面试轮次 |
| `mock-lab` | 模拟面试与逐题训练 |
| `talk-review` | 拆解真实面试 ASR 并形成复盘 |

`offerloop-setup` 和 `offerloop-workspace` 不是用户可见 Skill；必要内容由安装器放进隐藏的
`.offerloop-runtime`。

## 三条闭环

```text
招聘机会：信息源 → 硬条件过滤 → 软匹配 → 用户确认 → 企业清单/求职进展
求职进展：邀请与完成事件 → 状态机 → 受管视图 → 每日确认
能力成长：模拟/复盘 → 能力观察 → 专项训练 → 复测
```

完整模式中，三张 Base 保存企业、投递和笔面试事实；知识库保存用户画像、简历、经历、训练和
复盘文档。轻量级 Loop Runtime 只保存工作流实例、幂等记录、能力观察和待办，不取代业务真源。

## 安装与升级

### 使用前准备

- Python 3.10 或更高版本；
- Codex、Claude Code、Hermes Agent 或 WorkBuddy 之一；
- 只有完整模式需要飞书账号，以及创建或编辑知识空间和多维表格的权限；
- 不要把 App Secret、邮箱密码、token 或 cookie 粘贴到 Chat。

稳定版面向用户发布在 `riwonswain-ovo/OfferLoop`。`OfferLoop-development` 仅用于开发、测试和
Pull Request；新用户不需要访问开发仓。

### 方式 A：完整模式

下载稳定版并先预演本地安装：

```bash
git clone https://github.com/riwonswain-ovo/OfferLoop.git
cd OfferLoop
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
```

确认预演结果后安装 9 个 Skill：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full
```

本地安装完成后，命令会给出一段可直接发到**新 Agent 会话**的初始化提示。Agent 会先做只读预检，
展示准备复用或创建的三张飞书业务 Base、私有知识库和固定目录；只有得到用户明确确认后才执行
线上写入。中途退出不会重复创建资源，下次从第一个未通过的阶段继续。

Agent 完成只读线上验收后记录验收，再核验：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --record-workspace-verified
python3 scripts/setup_offerloop.py --agent codex --mode full --verify
```

只有本地安装、模式配置、三张 Base、知识库目录、schema v6 locator 和权限都通过时，完整模式才会
报告 `ready`。`--record-workspace-verified` 本身不访问飞书，只能由 Agent 在真实线上验收通过后
执行；安装命令不会复制三张 Base，也不会用示例 URL 冒充已经完成线上 setup。

### 方式 B：只下载并安装一个 Skill

下面以 `mock-lab` 为例。Git sparse checkout 只取该 Skill、安装脚本和最小共享运行时，不下载其余
8 个 Skill：

```bash
git clone --filter=blob:none --no-checkout https://github.com/riwonswain-ovo/OfferLoop.git OfferLoop-mock-lab
cd OfferLoop-mock-lab
git sparse-checkout init --cone
git sparse-checkout set scripts skills/mock-lab skills/offerloop-workspace skills/offerloop-setup/scripts skills/offerloop-setup/references
git checkout main
python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab --dry-run
python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab
python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab --verify
```

把三处 `mock-lab` 替换为任一 Skill 名称即可。单 Skill 模式：

- 跳过 OfferLoop 全局用户画像门槛；
- 只询问当前任务真正需要的输入；
- 默认在 Chat 中交付，文件型产物保存到用户选择的本地位置；
- 不自动创建知识库、Base、目录、飞书文档、日历或任务；
- 用户明确要求连接飞书且完成授权后，才启用当前 Skill 所需的飞书读写。

`job-collection` 和 `recruiting-reminder` 的核心能力本身需要相应的信息源、目标 Base、邮箱或日历
连接；这不等于必须安装完整 OfferLoop 工作区。

### 支持的 Agent

将示例中的 `codex` 替换为 `claude-code`、`hermes-agent` 或 `workbuddy`。Windows 使用 `py -3`
代替 `python3`。

### 升级

先预演，再只升级当前选择的模式：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
python3 scripts/setup_offerloop.py --agent codex --mode full --upgrade

python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab --dry-run
python3 scripts/setup_offerloop.py --agent codex --mode single --skill mock-lab --upgrade
```

安装和升级均为幂等操作；同名但内容不同的目录会先报告冲突，只有显式 `--upgrade` 才备份旧版并
替换。模式、所选 Skill 和 setup 阶段保存在用户私有的本机配置中，凭证不写入仓库或安装清单。

旧版命令仍保留兼容，但只管理本地 Skill，不代表飞书工作区已经完成：

```bash
python3 scripts/install_offerloop.py --agent codex --setup
python3 scripts/install_offerloop.py --agent codex --verify
python3 scripts/install_offerloop.py --agent codex --upgrade
```

新安装应优先使用 `setup_offerloop.py`，因为它会明确记录 `full` / `single` 并核验线上状态。

## 固定知识库结构

仅完整模式创建或接管以下结构：

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

setup 不预建空用户画像。`career-profile` 在用户确认第一条真实内容后才创建对应文档。完成和暂停
的产物按统一标题保存；暂停或时间不足时使用 `incomplete`，并保留缺口与续做清单。

## Loop Runtime

完整模式继续执行用户画像门槛并默认把产物沉淀到飞书；单 Skill 模式跳过全局门槛并默认在 Chat
中交付。模式由 `.offerloop-runtime/scripts/install_mode.py` 从本机非敏感配置中解析。旧版配置未
记录模式时按完整模式兼容，避免静默改变既有用户的自动保存行为。

参考实现位于 `services/job-progress-sync`，包含机会、求职进展与能力成长三个闭环。每日进展确认
固定为 `21:30 Asia/Shanghai`。成员列表截断、存在多个真人、唯一真人不是所有者或缺少成员读取
权限时，一律暂停，不切换私聊，也不发送替代消息。

## 验证

```bash
python3 -m unittest discover -s tests
cd services/job-progress-sync && npm test
```

所有线上迁移都应先导出快照、原地升级并保留旧数据；无法可靠判断的记录进入“状态待确认”。

## 发布流程

这类安装器、setup、Skill 契约和 README 改动先提交到 `OfferLoop-development` 的功能分支，经冷
安装、9 个单 Skill 安装、完整模式飞书验收和升级回归通过后再合并。形成明确版本号和发布说明后，
再同步到公开的 `OfferLoop` 仓库。不要把未经真实飞书冷启动验证的开发提交直接推到公开仓。
