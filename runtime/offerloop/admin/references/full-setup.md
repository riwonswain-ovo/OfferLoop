# OfferLoop 完整模式初始化

本流程负责“7 个 Skill + 三张飞书业务 Base + 一个用户私有知识库 + 核心同步自动化”。
旧工作台已经退役。企业主子表、企业清单到求职进展、笔面试中心到求职进展的即时联动是完整模式
必需能力；每日 22:10 群卡片需要用户单独选择，不能静默启用。

## 安全边界

1. 先只读检查当前 Agent、`lark-cli`、所选 profile、飞书应用权限和现有 OfferLoop 资源。
2. 不要求用户在 Chat 中发送 App Secret、邮箱密码、token 或 cookie。
3. 先展示“复用哪些资源、创建哪些资源、会写入哪些 locator”的计划；用户明确确认后才能创建、
   修改或迁移线上资源。
4. 默认创建用户私有空间。若当前身份不能创建知识空间或 Base，停在可恢复状态并给出所缺权限，
   不以空 URL、示例 token 或本地假数据冒充完成。
5. 重试时先按名称、URL 和已保存 locator 查找已有资源，唯一匹配则复用；多匹配时让用户选择，
   不重复创建。
6. 妙搭应用、Base workflow、机器人、群消息和定时触发器都是线上写入。总计划必须分别列出，
   得到用户确认后才创建；每日卡片还要记录明确的 enabled/disabled 选择。

## 执行顺序

1. 完整读取同目录的 `onboarding.md`、`one-click-deploy.md`、`verification-matrix.md`、
   `progress-schema-v6.md` 和 `reminder-schema.md`。只跳过已退役工作台；同步服务与自动化不得跳过。
2. 确认或创建三张独立 Base：`OfferLoop 企业清单`、`OfferLoop 求职进展`、
   `OfferLoop 笔面试中心`。求职进展按 schema v6 创建；笔面试中心按 `reminder-schema.md` 创建
   `笔面试安排` 单表和受管视图，保留已有有效数据。
3. 确认或创建私有知识库，并建立固定目录：

   ```text
   00｜OfferLoop 使用指南
   01｜核心求职数据 / 企业清单、求职进展、笔面试中心
   02｜定制简历
   03｜经历深挖 / 细节复原文档、面试逐字文档
   04｜面试准备
   05｜模拟面试
   06｜真实面试复盘 / ASR 待复盘、已完成复盘
   ```

4. `01｜核心求职数据` 下只创建或复用三张 Base 的快捷入口。升级时先按
   `artifact_contract.py plan-directory-migration` 预演：把旧画像和能力训练目录迁入
   `99｜历史归档`，再原节点改名形成连续的 `02`–`06`；逐项回读，不复制、不删除文档。
5. 使用隐藏运行时的 `scripts/configure.py` 保存非敏感 locator，包括固定 lark profile、三张 Base
   URL、知识空间 ID、首页节点、核心数据节点和 `schema_version=7`。凭证仍由 lark-cli 或系统密钥
   存储管理。
6. 工作区结构回读通过后，运行
   `scripts/setup_offerloop.py --agent <agent> --mode full --record-workspace-verified` 记录本次验收，
   此时只允许 `workspace_ready=true`，不得报告完整 ready。
7. 继续按 `one-click-deploy.md` 发布同步服务并创建 12 条必要 Base workflow；询问用户是否启用
   每日 22:10 群卡片。选择启用时配置群、owner、日历、卡片回调和 cron；选择停用时显式保存
   `daily_checkin.status=disabled`，不能用缺失配置代替用户选择。
8. 按 `verification-matrix.md` 和 `scripts/automation_contract.py --validate --input -` 做只读线上验收。
   真实同步、回读、卡片与回调检查全部通过后，运行
   `scripts/setup_offerloop.py --agent <agent> --mode full --record-automation-verified`，再运行
   `scripts/setup_offerloop.py --agent <agent> --mode full --verify`。没有真实线上检查时不得记录验收或
   报告 `sync_ready=true` / `daily_checkin_ready=true`。

初始化被打断时，保留已经成功的资源和 locator；下一次从第一个未通过的验收项继续，不回滚或
删除用户已有的飞书数据。
