# OfferLoop 使用指南

OfferLoop 用三张 Base 保存求职事实，用本知识库保存简历、经历、面试准备和复盘产物。

## 三张核心数据表

- 企业清单：{{target_base_url}}
- 求职进展：{{progress_base_url}}
- 笔面试中心：{{reminder_base_url}}

三个入口均指向原 Base 对象，不复制记录，也不会创建第四张业务 Base。

## 两条闭环

1. 招聘机会：硬条件过滤，岗位偏离候选由用户确认。
2. 求职进展：`进展状态` 表示当前待办或结果；完成确认才推进最近完成节点。
## 7 个长期 Skill

`job-collection`、`recruiting-reminder`、`experience-deepthink`、`resume-tailor`、`interview-prep`、`mock-lab`、`talk-review`。

## 固定目录

```text
00｜OfferLoop 使用指南
01｜核心求职数据
02｜定制简历
03｜经历深挖
04｜面试准备
05｜模拟面试
06｜真实面试复盘 / ASR 待复盘、已完成复盘
```

升级前已有的用户画像与岗位能力训练目录迁入 `99｜历史归档` 并只读保留。每个业务 Skill 只读取
当前任务所需材料；唯一匹配时自动读取，缺失或冲突时才询问。产物保存后会返回知识库路径和 URL。
