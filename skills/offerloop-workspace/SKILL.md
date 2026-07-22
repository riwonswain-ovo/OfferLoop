---
name: offerloop-workspace
description: 管理 OfferLoop 的飞书求职知识库、使用指南与资源入口；检查或注册企业清单、求职进展、笔面试中心与知识库定位信息，维护固定目录和工作台入口。用户说“打开/整理/刷新求职空间”“维护飞书求职首页”“把求职表放进知识库”“检查 OfferLoop 工作台”时使用。
---

# OfferLoop Workspace

把分散的求职 Base 和文档组织到固定、私有的飞书知识库入口。只维护知识库结构、首页说明和资源入口，不抓招聘信息、不读邮箱、不生成面试题。

运行本 Skill 内任何脚本前，先根据当前 `SKILL.md` 所在位置解析 Skill 根目录；所有 `scripts/...` 都相对该目录，不假设 Agent 的当前工作目录。

## 职责边界

- `offerloop-setup`：安装、profile、授权和首次定位配置。
- `job-collection`：招聘信息源、企业清单和求职进展补偿对账。
- `recruiting-reminder`：邮件事件、笔面试中心、求职阶段和个人日历。
- 本 Skill：知识库目录、使用指南、工作台入口和完整性检查。

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
- `schema_version`

`workspace_calendar_table_id` 与 `workspace_calendar_view_id` 仅用于兼容旧版首页，不是新建
README 首页的前置条件。

运行 `python3 scripts/workspace.py --check` 只检查这些非敏感定位信息。缺少知识库或首页定位时先报告；只有用户明确要求新建时才创建。不得按名称猜知识库，不得保存 App Secret、邮箱密码或 webhook secret。

## 固定目录

首次创建或整理前，完整读取 `lark-wiki`、`lark-doc` 和 `lark-base` Skill，并使用配置中固定的 profile。

```text
OfferLoop 求职空间（独立、默认私有）
├── 00｜OfferLoop 使用指南（知识库首页）
├── 01｜求职工作台
├── 02｜求职业务
│   ├── 求职企业清单
│   ├── 求职进展
│   └── 笔面试中心
├── 03｜个人材料
├── 04｜面试准备
├── 05｜面试复盘
├── 06｜训练与题库
├── 07｜信息源
└── 99｜归档
```

1. 首页是 README / 使用指南，不是工作台副本；第一操作入口必须是工作台。
2. 三张业务 Base 保持唯一数据源，只在知识库登记入口，不复制记录或迁移 Base 本体。
3. 个人材料、准备、复盘、题库和信息源按固定目录归位；不按公司建立顶级目录。
4. 旧资源只能移动归档，不得删除。
5. 任何创建、移动、分享或权限变更都先列出目标并取得用户确认。

## 首页契约

完整读取 `references/homepage-contract.md`。首页包含使用步骤、核心功能、数据位置、自然语言命令与常见问题；日常数据展示只在工作台和三张 Base 中进行。

## 日常刷新

日常运行不改写首页正文、个人资料或训练占位。`recruiting-reminder` 只写笔面试中心与求职进展；工作台会读取这些真实数据。旧版首页 marker 和日历筛选函数仅为兼容保留，不得用于改写当前首页。

## 日常操作

### 检查工作台

验证知识库、首页节点、工作台入口、三个 Base URL 和目录是否存在。只读检查不修复；先展示差异。

### 注册资源

用户确认后调用 `register_resources()` 合并非敏感定位键。保留已有配置和旧回滚键，不把完整配置值输出到日志。

### 刷新首页

- `job-collection` 不刷新首页，不得把岗位数据复制进首页。
- `recruiting-reminder` 不改写首页；笔面试中心和求职进展会在工作台中自然更新。
- 训练与题库只有未来专用 Skill 才能写；本 Skill 不临时生成题目。

### 修复首页

先读取当前文档并展示拟修改的区块，再经用户确认修复。不得根据其他数据源擅自重写用户个人材料。

## 安全与回滚

- 知识库默认私有；分享、加成员或改变可见性需要单独确认。
- 不删除旧 Base、旧文档或归档节点。
- 不把凭证、邮件正文、简历正文或招聘数据导出写入仓库。
- 新结构不可用时，Base 和既有 Skill 仍可独立使用；本 Skill 不自动清理新资源。
