# OfferLoop

OfferLoop 是一套与飞书结合使用、围绕求职事实、材料沉淀和面试闭环运行的 Skill 系统。
正式安装包含 7 个长期 Skill、三张飞书业务 Base 和一个用户私有的 OfferLoop 知识库；
飞书工作区是 OfferLoop 的组成部分，不再提供或宣传脱离飞书的单 Skill 安装模式。

## 7 个长期 Skill

| Skill | 职责 |
| --- | --- |
| `job-collection` | 收集岗位、执行硬条件过滤并确认边缘候选 |
| `recruiting-reminder` | 识别招聘通知并维护笔面试事件 |
| `experience-deepthink` | 复原经历、深挖决策与整理证据 |
| `resume-tailor` | 针对岗位生成定制简历 |
| `interview-prep` | 准备真实公司、岗位和面试轮次 |
| `mock-lab` | 模拟面试与逐题训练 |
| `talk-review` | 拆解真实面试 ASR 并形成复盘 |

`offerloop-setup` 和 `offerloop-workspace` 不是用户可见 Skill；必要内容由安装器放进隐藏的
`.offerloop-runtime`。

## 两条闭环

```text
招聘机会：信息源 → 硬条件过滤 → 软匹配 → 用户确认 → 企业清单/求职进展
求职进展：邀请与完成事件 → 状态机 → 受管视图
```

OfferLoop 中，三张 Base 保存企业、投递和笔面试事实；知识库保存简历、经历、面试准备与复盘
文档。轻量级 Loop Runtime 只保存机会、进展工作流实例与幂等记录，不取代业务真源。

## 产品实景

以下界面来自 OfferLoop 与飞书结合使用的工作区，展示内容均为合成数据并已脱敏。截图用于说明
当前产品结构与典型产物，具体字段和流程以对应版本的 Skill 契约为准。

![飞书知识库中的 OfferLoop 使用指南](docs/images/product-ui/usage-guide-anonymized.png)

使用指南截图来自升级工作区，因此保留了 `99｜历史归档`；全新工作区没有历史内容时不会创建该目录。

| 求职企业清单 | 求职进展 |
| --- | --- |
| ![飞书多维表格中的求职企业清单](docs/images/product-ui/company-list-anonymized.png) | ![飞书多维表格中的求职进展](docs/images/product-ui/progress-anonymized.png) |

![飞书多维表格中的笔面试中心](docs/images/product-ui/interview-center-anonymized.png)

![OfferLoop 生成的八章细节复原稿](docs/images/product-ui/experience-detail-anonymized.png)

| 面试准备文档 | 模拟面试文档 |
| --- | --- |
| ![OfferLoop 生成的面试准备文档](docs/images/product-ui/interview-prep-anonymized.png) | ![OfferLoop 生成的模拟面试文档](docs/images/product-ui/mock-interview-anonymized.png) |

| 经历深挖逐字稿 | 定制简历 |
| --- | --- |
| ![OfferLoop 生成的经历深挖逐字稿](docs/images/product-ui/experience-transcript-anonymized.png) | ![OfferLoop 生成的定制简历](docs/images/product-ui/resume-anonymized.png) |

## 安装与升级

### 使用前准备

- Python 3.10 或更高版本；
- Codex、Claude Code、Hermes Agent 或 WorkBuddy 之一；
- 飞书账号，以及创建或编辑知识空间和多维表格的权限；
- 不要把 App Secret、邮箱密码、token 或 cookie 粘贴到 Chat。

稳定版面向用户发布在 `riwonswain-ovo/OfferLoop`。`OfferLoop-development` 仅用于开发、测试和
Pull Request；新用户不需要访问开发仓。

### 安装 OfferLoop

下载稳定版并先预演本地安装：

```bash
git clone https://github.com/riwonswain-ovo/OfferLoop.git
cd OfferLoop
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
```

确认预演结果后安装 7 个 Skill：

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

只有本地安装、飞书配置、三张 Base、知识库目录、schema v7 locator 和权限都通过时，OfferLoop 才会
报告 `ready`。`--record-workspace-verified` 本身不访问飞书，只能由 Agent 在真实线上验收通过后
执行；安装命令不会复制三张 Base，也不会用示例 URL 冒充已经完成线上 setup。

### 支持的 Agent

将示例中的 `codex` 替换为 `claude-code`、`hermes-agent` 或 `workbuddy`。Windows 使用 `py -3`
代替 `python3`。

### 升级

#### 旧用户迁移到 7 个 Skill

以前只安装过 `job-collection` 和 `recruiting-reminder` 的用户不要先删除旧目录，也不要重新创建
已有 Base。先把最新版下载到新目录并保留原下载目录：

```bash
git clone https://github.com/riwonswain-ovo/OfferLoop.git OfferLoop-latest
cd OfferLoop-latest
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
```

预演显示 `conflict` 是防覆盖保护。确认同名目录属于旧版 OfferLoop 后再执行：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --upgrade
python3 scripts/install_offerloop.py --agent codex --verify
```

安装器会安装 7 个 Skill，并把旧副本（包括退役 Skill）保存到 Agent 配置目录下的
`.offerloop-backups/<时间戳>/`。`needs_setup` 表示飞书工作区尚未完成接入，OfferLoop 还没有达到
可正式使用的 `ready` 状态。
旧配置、邮件去重状态、双 Base 兼容、飞书接管和回滚步骤见 [MIGRATION.md](MIGRATION.md)。

先预演，再升级完整 OfferLoop：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
python3 scripts/setup_offerloop.py --agent codex --mode full --upgrade
```

安装和升级均为幂等操作；同名但内容不同的目录会先报告冲突，只有显式 `--upgrade` 才备份旧版并
替换。飞书接入配置、所选 Skill 和 setup 阶段保存在用户私有的本机配置中，凭证不写入仓库或安装清单。

旧版命令仍保留兼容，但只管理本地 Skill，不代表飞书工作区已经完成：

```bash
python3 scripts/install_offerloop.py --agent codex --setup
python3 scripts/install_offerloop.py --agent codex --verify
python3 scripts/install_offerloop.py --agent codex --upgrade
```

新安装应使用 `setup_offerloop.py`，因为它会记录飞书接入状态并核验线上资源。

## 固定知识库结构

OfferLoop 创建或接管以下结构：

```text
00｜OfferLoop 使用指南
01｜核心求职数据 / 企业清单、求职进展、笔面试中心
02｜定制简历
03｜经历深挖 / 细节复原文档、面试逐字文档
04｜面试准备
05｜模拟面试
06｜真实面试复盘 / ASR 待复盘、已完成复盘
```

升级前已有的用户画像与岗位能力训练目录迁入 `99｜历史归档` 只读保留；活动目录原节点改名为
连续的 `00`–`06`，不复制、不删除文档。新工作区没有历史内容时不创建 `99｜历史归档`。
完成和暂停的产物按统一标题保存；暂停或时间不足时使用 `incomplete`，并保留缺口与续做清单。

## Loop Runtime

OfferLoop 默认把产物沉淀到用户私有飞书知识库，并用三张业务 Base 保存招聘机会、求职进展和
笔面试事实；不执行全局画像门槛，每个 Skill 只收集当前任务所需信息。隐藏运行时会识别旧版
`single` 配置并要求迁移到完整飞书模式，不把旧配置继续解释成独立使用入口。

参考实现位于 `services/job-progress-sync`，包含机会与求职进展两个闭环。每日进展确认
固定为 `22:10 Asia/Shanghai`。成员列表截断、存在多个真人、唯一真人不是所有者或缺少成员读取
权限时，一律暂停，不切换私聊，也不发送替代消息。

## 验证

```bash
python3 -m unittest discover -s tests
cd services/job-progress-sync && npm test
```

所有线上迁移都应先导出快照、原地升级并保留旧数据；无法可靠判断的记录进入“状态待确认”。

## 发布流程

这类安装器、setup、Skill 契约和 README 改动先提交到 `OfferLoop-development` 的功能分支，经冷
安装、7 个 Skill 的完整工作区联动验收、飞书冷启动和升级回归通过后再合并。形成明确版本号和发布说明后，
再同步到公开的 `OfferLoop` 仓库。不要把未经真实飞书冷启动验证的开发提交直接推到公开仓。
