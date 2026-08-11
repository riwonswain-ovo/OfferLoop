# OfferLoop 使用指南

OfferLoop 用三张 Base 保存求职事实，用本知识库保存画像、简历、经历、训练和复盘产物。

首次使用时，先通过 Chat 逐步建立 `02｜用户画像`。画像为空或只有占位内容时，其他业务 Skill
会暂停并转入 `career-profile`，一次只问一个问题；保存第一条确认信息后即可继续原任务。

## 三张核心数据表

- 企业清单：{{target_base_url}}
- 求职进展：{{progress_base_url}}
- 笔面试中心：{{reminder_base_url}}

三个入口均指向原 Base 对象，不复制记录，也不会创建第四张业务 Base。

## 三条闭环

1. 招聘机会：硬条件过滤，岗位偏离候选由用户确认。
2. 求职进展：邀请只更新下一环节，完成确认才推进最近完成节点。
3. 能力成长：模拟和复盘产生待验证观察，专项训练后再次模拟验证。

## 9 个长期 Skill

`career-profile`、`job-collection`、`recruiting-reminder`、`experience-deepthink`、`resume-tailor`、`competency-lab`、`interview-prep`、`mock-lab`、`talk-review`。

## 固定目录

```text
00｜OfferLoop 使用指南
01｜核心求职数据
02｜用户画像
03｜定制简历
04｜经历深挖
05｜岗位能力与训练 / 岗位能力画像、专项训练（方法论训练、行业认知训练）、每日三题、周报
06｜面试准备
07｜模拟面试
08｜真实面试复盘 / ASR 待复盘、已完成复盘
```

每个业务 Skill 会先检查用户画像，再说明已读取的任务材料；唯一匹配时自动读取，缺失或冲突时
才询问。产物保存后会返回知识库路径和 URL。

<!-- OFFERLOOP:OPTIONAL:WORKBENCH:START -->
工作台尚未启用。它是可选的结果与待办视图，不影响知识库、Base 或训练产物。
<!-- OFFERLOOP:OPTIONAL:WORKBENCH:END -->

工作台不运行本机 Agent Worker。生成式任务通过原生 Agent 深链接打开并自动带入上下文。
