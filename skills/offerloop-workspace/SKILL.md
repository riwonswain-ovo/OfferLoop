---
name: offerloop-workspace
description: 创建、接管和维护 OfferLoop 必需的私有飞书求职知识库；在知识库中组织企业清单、求职进展、笔面试中心三张 Base，维护使用指南、当前简历、训练 Markdown 产物、ASR 与固定目录。首次初始化 OfferLoop、检查核心空间、登记当前简历，或其他 OfferLoop Skill 需要保存/定位训练产物时使用；不负责搭建可选的飞书工作台。
---

# OfferLoop Workspace

把三张业务 Base、当前简历和每次训练产物组织到一个固定、私有的飞书知识库。该知识库是
OfferLoop 完成线上初始化的必备产物；工作台是可选项，由 `offerloop-workbench` 单独负责。

运行本 Skill 内任何脚本前，先根据当前 `SKILL.md` 所在位置解析 Skill 根目录；所有
`scripts/...` 都相对该目录，不假设 Agent 当前工作目录。

## 职责边界

- `offerloop-setup`：安装、profile、授权、三张 Base 与知识库的首次编排和定位配置。
- `job-collection`：维护企业清单，并对求职进展做幂等补偿对账。
- `recruiting-reminder`：维护笔面试中心、求职阶段和个人日历。
- 本 Skill：知识库目录、三张 Base 节点、使用指南、当前简历、训练产物契约和完整性检查。
- `offerloop-workbench`：按用户选择部署可视化工作台；未部署不影响本 Skill。

不要替其他 Skill 读取来源、邮箱或业务记录。缺权限时转 `offerloop-setup`，不得自行扩大 scope。

## 核心就绪条件

读取 `~/.config/offerloop/config.json`（遵循 `XDG_CONFIG_HOME`）：

- `lark_profile`
- `target_base_url`
- `progress_base_url`
- `reminder_base_url`
- `wiki_space_id`
- `workspace_home_node_token`
- `workspace_core_data_node_token`
- `schema_version`
- schema v4 下的 `artifact_storage`

`workbench_url` 是可选体验配置，不属于知识库就绪条件。运行
`python3 scripts/workspace.py --check` 只检查非敏感 locator；缺少知识库、核心数据目录或任一
业务 Base 时报告 `needs_action`。只有用户确认初始化或修复后才创建、移动或登记节点。

三张 Base 是唯一业务真源。将它们放入知识库时，应移动/接管其 Wiki 节点或建立可解析的入口，
不得复制表结构、复制记录或创建第二套同名 Base。

## 固定目录

首次创建或整理前，完整读取 `lark-wiki`、`lark-doc` 和 `lark-base` Skill，并使用配置中固定的
profile。知识空间和文档节点优先显式使用 user 身份；Base 日常写入仍按业务 Skill 的身份契约。

```text
OfferLoop 求职空间（独立、默认私有）
├── 00｜OfferLoop 使用指南
├── 01｜核心求职数据
│   ├── 企业清单（Base）
│   ├── 求职进展（Base）
│   └── 笔面试中心（Base）
├── 02｜当前简历
├── 03｜简历深挖
├── 04｜面试准备
├── 05｜面试复盘
│   ├── ASR 待复盘
│   └── 已完成复盘
├── 06｜产品 Sense
└── 07｜模拟面试
```

1. 首页是使用指南和导航，不是实时数据副本。
2. 工作台已配置时可展示入口；未配置时显示为可选能力，不视为缺失。
3. `02｜当前简历` 可保存多个当前使用版本，文档标题是唯一简历版本名。
4. 五类训练产物按固定目录归位，每次完整运行或明确提前结束都保存独立 Markdown 飞书文档。
5. `ASR 待复盘` 保存待处理转写；完成产物写入 `已完成复盘`，原始 ASR 不自动移动或删除。
6. 创建、移动、分享、权限变更或把既有 Base 纳入知识库前，列出精确目标并取得确认。

## 初始化与接管

1. 用配置中的 locator 只读解析知识空间、首页和三张 Base。
2. 已登记资源存在时接管，不按标题重复创建。
3. 缺少知识空间时，经确认创建默认私有的 `OfferLoop 求职空间`。
4. 缺少核心数据目录或训练目录时，展示完整目录计划后一次确认创建。
5. 三张 Base 已存在于 Drive 时，按 `lark-wiki` 契约将既有对象纳入知识库；禁止复制数据。
6. 三张 Base 不存在时，分别交给对应初始化流程创建，再登记真实 URL 和节点。
7. 写后重新读取节点类型、父节点和 Base URL，成功后才保存 locator。

旧版知识库目录继续按已登记 locator 使用，不自动重命名或移动；用户要求升级目录时先生成迁移
计划并保留旧入口。

## 训练产物契约

涉及 `resume-deepthink`、`interview-prep`、`mock-lab`、`talk-review` 或 `pm-sense` 时，完整
读取 `references/artifact-contract.md`。

`scripts/artifact_contract.py` 不访问飞书，只管理 schema v4、locator、`run_id`、标题、路由和
Markdown 校验。对应训练 Skill 负责生成正文；本 Skill 负责定位目录、创建或更新 Markdown
飞书文档，并在成功后登记 locator。不得把飞书 token 或私人正文打印到日志。

## 首页与日常维护

完整读取 `references/homepage-contract.md`。首页只维护说明、知识库导航、三张 Base 入口和可选
工作台入口，不复制业务记录。

- `job-collection` 与 `recruiting-reminder` 成功后无需刷新首页正文。
- 工作台未部署时，知识库仍是完整的 OfferLoop 入口。
- 工作台部署成功后，只更新首页的可选入口块。
- 训练产物由对应 Skill 生成，本 Skill 只负责可靠保存和定位。

## 安全与回滚

- 知识库默认私有；分享、加成员或改变可见性需要单独确认。
- 不删除旧 Base、旧文档或归档节点。
- 不把凭证、邮件正文、简历正文或招聘数据导出写入仓库。
- 工作台删除、停用或故障不得影响知识库、Base、日历和训练文档。
