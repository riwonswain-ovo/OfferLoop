# OfferLoop 0.1.0-alpha.5 本地发布前验收

日期：2026-07-24。范围：本地合成对象、离线配置、安装器、应用模板与代码契约。没有访问或
修改真实飞书、邮箱、日历，也没有推送 GitHub。

## 结果

| 验收项 | 结果 |
| --- | --- |
| 主仓库 `unittest` | 118 项通过 |
| `job-collection` tests | 21 项通过 |
| `recruiting-reminder` tests | 30 项通过 |
| `knowledge-digest` tests | 7 项通过 |
| `job-progress-sync` Node tests | 21 项通过 |
| Workbench 模板 | Jest、TypeScript、lint、build 通过 |
| Progress Sync 模板 | Jest、TypeScript、build 通过 |
| 四 Agent 冷安装 | 十一个 Skill 全部安装，重复运行幂等 |
| AgentSkills 兼容性 | 通过 |
| 七个新增 Skill 官方校验 | 全部通过 |
| Python 编译与 diff whitespace | 通过 |

## 核心安全断言

- schema v2 到 v4 保留已有配置，不自动创建线上节点。
- `run_id` 标题去重，多候选不取第一条。
- 文件夹和长期主档 token 分离。
- 长期主档冲突未经确认不得覆盖。
- 面试事件岗位/环节不匹配时不降级猜测。
- 回填冲突时不产生主表或子表 patch；笔试拒绝回填。
- 对话粘贴 ASR 必须标记没有持久化原始转写来源。
- `pm-sense` 不生成小红书发布物，`mock-lab` 不依赖本地 `mock-interview`。
- 首次安装欢迎完整介绍十一个 Skill；重复安装不重复返回欢迎载荷。
- 首次欢迎只说明安装状态和离线下一步，不把飞书、邮箱或工作台误报为已配置。

## 未覆盖的线上验收

以下项目必须在用户目标租户、指定 profile 和真实资源下另行只读/受控验收：

- schema v4 目录的唯一性、可读性和写权限；
- Markdown 到飞书 Docx/Wiki 的格式保真；
- 单表记录的文档链接回填与失败补偿；
- user/bot 身份、scope、应用发布与租户安装；
- 真实 ASR 大文档读取和长期主档字段级合并。

未完成这些线上步骤前，只能表述为“本地发布候选通过”，不能表述为“飞书生产环境已验证”。
