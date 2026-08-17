# OfferLoop 完整模式初始化

本流程只负责“9 个 Skill + 三张飞书业务 Base + 一个用户私有知识库”。工作台、妙搭应用、
公网服务、定时自动化和消息机器人都不属于必需安装内容，不得在本流程中默认部署。

## 安全边界

1. 先只读检查当前 Agent、`lark-cli`、所选 profile、飞书应用权限和现有 OfferLoop 资源。
2. 不要求用户在 Chat 中发送 App Secret、邮箱密码、token 或 cookie。
3. 先展示“复用哪些资源、创建哪些资源、会写入哪些 locator”的计划；用户明确确认后才能创建、
   修改或迁移线上资源。
4. 默认创建用户私有空间。若当前身份不能创建知识空间或 Base，停在可恢复状态并给出所缺权限，
   不以空 URL、示例 token 或本地假数据冒充完成。
5. 重试时先按名称、URL 和已保存 locator 查找已有资源，唯一匹配则复用；多匹配时让用户选择，
   不重复创建。

## 执行顺序

1. 完整读取同目录的 `onboarding.md`、`one-click-deploy.md`、`verification-matrix.md`、
   `progress-schema-v6.md` 和 `reminder-schema.md`；但跳过其中所有工作台、妙搭、
   公网部署和自动化步骤。
2. 确认或创建三张独立 Base：`OfferLoop 企业清单`、`OfferLoop 求职进展`、
   `OfferLoop 笔面试中心`。求职进展按 schema v6 创建；笔面试中心按 `reminder-schema.md` 创建
   `笔面试安排` 单表和受管视图，保留已有有效数据。
3. 确认或创建私有知识库，并建立固定目录：

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

4. `01｜核心求职数据` 下只创建或复用三张 Base 的快捷入口。不要预建空用户画像文档；首次真实
   对话由 `career-profile` 在用户确认第一条内容后创建。
5. 使用隐藏运行时的 `scripts/configure.py` 保存非敏感 locator，包括固定 lark profile、三张 Base
   URL、知识空间 ID、首页节点、核心数据节点和 `schema_version=6`。凭证仍由 lark-cli 或系统密钥
   存储管理。
6. 按 `verification-matrix.md` 做只读线上验收。确认本地文件、三张 Base、知识库结构、locator 和
   权限全部通过后，运行
   `scripts/setup_offerloop.py --agent <agent> --mode full --record-workspace-verified` 记录本次验收，
   再运行 `scripts/setup_offerloop.py --agent <agent> --mode full --verify`。没有真实线上检查时不得
   记录验收或报告 `ready`。

初始化被打断时，保留已经成功的资源和 locator；下一次从第一个未通过的验收项继续，不回滚或
删除用户已有的飞书数据。
