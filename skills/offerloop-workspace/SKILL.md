---
name: offerloop-workspace
description: 管理 OfferLoop 的飞书求职知识库、使用指南、当前简历、训练产物、ASR、双面试题库、知识摘要目录与资源入口；检查或注册企业清单、求职进展、笔面试中心、知识速览 Base 和固定节点，维护目录、材料契约与工作台入口。用户说“打开/整理求职空间”“维护飞书求职首页”“登记当前简历”“检查 OfferLoop 工作台”或其他 OfferLoop Skill 需要定位飞书材料时使用。
---

# OfferLoop Workspace

把分散的求职 Base 和文档组织到固定、私有的飞书知识库入口。只维护知识库结构、首页说明、
当前简历、产物和题库入口，不抓招聘信息、不读邮箱、不生成面试题。

运行本 Skill 内任何脚本前，先根据当前 `SKILL.md` 所在位置解析 Skill 根目录；所有 `scripts/...` 都相对该目录，不假设 Agent 的当前工作目录。

## 职责边界

- `offerloop-setup`：安装、profile、授权和首次定位配置。
- `job-collection`：招聘信息源、企业清单和求职进展补偿对账。
- `recruiting-reminder`：邮件事件、笔面试中心、求职阶段和个人日历。
- `knowledge-digest`：知识库盘点、阅读计划、新闻增量游标、摘要正文和知识速览索引。
- 本 Skill：知识库目录、使用指南、工作台入口、训练产物定位契约和完整性检查。

不要替其他 Skill 读取来源或业务数据。缺权限时转 `offerloop-setup`，不得自行扩大 scope。

## 前置配置

读取 `~/.config/offerloop/config.json`（遵循 `XDG_CONFIG_HOME`）：

- `lark_profile`
- `target_base_url`
- `progress_base_url`
- `reminder_base_url`
- `wiki_space_id`
- `workspace_home_node_token`
- `workbench_url`
- `knowledge_base_url`
- `knowledge_digest_table_id`
- `knowledge_source_table_id`
- `knowledge_wiki_folder_node_token`
- `schema_version`
- schema v4 下的 `artifact_storage`

`workspace_calendar_table_id` 与 `workspace_calendar_view_id` 仅用于兼容旧版首页，不是新建
README 首页的前置条件。

运行 `python3 scripts/workspace.py --check` 只检查这些非敏感定位信息。缺少知识库或首页定位时先报告；只有用户明确要求新建时才创建。不得按名称猜知识库，不得保存 App Secret、邮箱密码或 webhook secret。

## 固定目录

首次创建或整理前，完整读取 `lark-wiki`、`lark-doc` 和 `lark-base` Skill，并使用配置中固定的 profile。

```text
OfferLoop 求职空间（独立、默认私有）
├── 00｜OfferLoop 使用指南（知识库首页）
├── 01｜当前简历
├── 02｜简历深挖
├── 03｜面试准备文档
├── 04｜面试复盘
│   ├── ASR待复盘
│   └── 已完成复盘
├── 05｜产品 Sense
├── 06｜模拟面试
├── 07｜题库
│   ├── 待学习题库
│   └── 已学会题库
└── 08｜新闻与知识摘要
    ├── 新闻摘要
    ├── 知识文章
    └── 多来源专题
```

1. 首页是 README / 使用指南，不是工作台副本；首页中的第一操作入口必须是工作台。
2. 三张求职业务 Base 保持招聘数据的唯一来源；知识速览 Base 单独保存信息源、游标和摘要
   索引。首页只登记入口，不复制 Base 记录。
3. `01｜当前简历` 可保存多个当前使用版本，每份文档标题就是唯一简历版本名；不创建历史
   简历或其他个人材料目录。
4. 简历深挖、面试准备、复盘、产品 Sense、模拟面试和题库按固定目录归位；不按公司建立
   顶级目录。
5. `ASR待复盘` 只保存用户上传的待处理转写；完成产物写入 `已完成复盘`，原始 ASR 不自动
   移动或删除。
6. `08｜新闻与知识摘要` 只保存 `knowledge-digest` 的完整摘要；信息源与摘要索引仍以
   “知识速览” Base 为准。
7. 任何创建、移动、分享或权限变更都先列出目标并取得用户确认。

## 训练产物契约

涉及 `resume-deepthink`、`interview-prep`、`mock-lab`、`talk-review`、
`pm-sense` 或 `interview-question-bank` 时，完整读取
`references/artifact-contract.md`。

`scripts/artifact_contract.py` 不访问飞书，只管理 schema v4、locator、`run_id`、标题、
路由和 Markdown 校验。先使用 `lark-wiki` / `lark-doc` 完成线上操作，确认成功后再登记
locator。不得把飞书 token 或私人正文打印到日志。

## 首页契约

完整读取 `references/homepage-contract.md`。首页包含使用步骤、核心功能、数据位置、自然语言命令与常见问题；日常数据展示只在工作台、三张求职业务 Base 和知识速览 Base 中进行。

## 日常刷新

日常运行不改写首页正文、个人资料或训练占位。`recruiting-reminder` 只写笔面试中心与求职进展；工作台会读取这些真实数据。旧版首页 marker 和日历筛选函数仅为兼容保留，不得用于改写当前首页。

## 日常操作

### 检查工作台

验证知识库、首页节点、工作台入口、三个求职业务 Base、可选知识速览 Base 和目录是否存在。
只读检查不修复；先展示差异。

### 注册资源

用户确认后调用 `register_resources()` 合并非敏感定位键。保留已有配置和旧回滚键，不把完整配置值输出到日志。

### 刷新首页

- `job-collection` 不刷新首页，不得把岗位数据复制进首页。
- `recruiting-reminder` 不改写首页；笔面试中心和求职进展会在工作台中自然更新。
- 训练产物由对应 Skill 写入；双题库只由 `interview-question-bank` 修改。本 Skill 只定位
  节点，不临时生成题目。
- 知识摘要由 `knowledge-digest` 写入；本 Skill 只定位摘要目录和知识速览 Base。

### 修复首页

先读取当前文档并展示拟修改的区块，再经用户确认修复。不得根据其他数据源擅自重写用户个人材料。

## 安全与回滚

- 知识库默认私有；分享、加成员或改变可见性需要单独确认。
- 不删除旧 Base、旧文档或归档节点。
- 不把凭证、邮件正文、简历正文或招聘数据导出写入仓库。
- 新结构不可用时，Base 和既有 Skill 仍可独立使用；本 Skill 不自动清理新资源。
