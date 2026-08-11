# OfferLoop

OfferLoop 是一套围绕求职事实、材料沉淀和能力成长运行的闭环系统。它由 9 个长期 Skill、三张飞书业务 Base、一个私有知识库，以及轻量级 Loop Runtime 组成。

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

`offerloop-setup`、`offerloop-workspace` 和 `offerloop-workbench` 已迁入安装器和隐藏运行时，不再作为用户可见 Skill。旧 `pm-sense` 的方法被保留为 `competency-lab` 的产品经理岗位模板。

## 三条闭环

```text
招聘机会：信息源 → 硬条件过滤 → 软匹配 → 用户确认 → 企业清单/求职进展
求职进展：邀请与完成事件 → 状态机 → 受管视图 → 每日确认
能力成长：模拟/复盘 → 能力观察 → 专项训练 → 复测
```

三张 Base 保存企业、投递和笔面试事实；知识库保存用户画像、简历、经历、训练和复盘文档。Loop Runtime 只保存工作流实例、幂等记录、能力观察和待办，不取代业务真源。

## 安装与升级

```bash
python3 scripts/install_offerloop.py --agent codex --setup
python3 scripts/install_offerloop.py --agent codex --upgrade
python3 scripts/install_offerloop.py --agent codex --verify
python3 scripts/install_offerloop.py --deploy-workbench /path/to/miaoda-project
```

安装与升级均为幂等操作：不会复制三张 Base、知识库节点或已有文档。安装器会安装 9 个用户 Skill，并把管理脚本放入隐藏的 `.offerloop-runtime`。

首次使用其他 OfferLoop 业务 Skill 前，系统会检查 `02｜用户画像`。画像文档缺失、为空或只有
模板占位内容时，原任务会暂停并转入 `career-profile`：AI 在 Chat 中一次只问一个问题，每条
确认信息立即自动保存。写入至少一条有效信息后即可继续原任务，画像可以在以后逐步补全。

## 固定知识库结构

```text
00｜OfferLoop 使用指南
01｜核心求职数据 / 企业清单、求职进展、笔面试中心
02｜用户画像
03｜定制简历
04｜经历深挖
05｜岗位能力与训练 / 岗位能力画像、专项训练
06｜面试准备
07｜模拟面试
08｜真实面试复盘 / ASR 待复盘、已完成复盘
```

完成和暂停的生成产物都会按统一标题保存。暂停或时间不足时使用 `incomplete` 状态，并保留缺口与续做清单。保存后必须返回知识库面包屑路径和可点击 URL。

## Loop Runtime

参考实现位于 `services/job-progress-sync`，包含：

- `opportunity-loop`
- `application-progress-loop`
- `capability-growth-loop`
- 持久化状态与合法边校验
- `AbilityObservation` 与训练待办
- 交互卡片回调幂等
- 自由文本变更预览（确认前不写 Base）
- 群成员分页完整性与唯一所有者安全检查

每日进展确认固定为 `21:30 Asia/Shanghai`。成员列表截断、存在多个真人、唯一真人不是所有者或缺少成员读取权限时，一律暂停，不切换私聊，也不发送替代消息。

## 工作台边界

工作台只展示事实、待办、触发原因、下一步和暂停原因。生成式任务通过原生 Agent 深链接打开并自动带齐上下文。OfferLoop 不恢复本机 Agent Worker，也不提供 Agent Chat、后台轮询或 Worker 队列。

## 验证

```bash
python3 -m unittest discover -s tests
cd services/job-progress-sync && npm test
```

所有线上迁移都应先导出快照、原地升级并保留旧数据；无法可靠回填的记录进入“迁移复核”视图。
