# 面试题库契约

## 文档结构

`待学习题库` 与 `已学会题库` 都使用 Markdown。每份文档只保留一个一级标题，每道题使用一个
二级标题，并携带稳定 ID：

```markdown
# 待学习题库

## q-a1b2c3d4｜如何判断一个功能是否值得做？

- 状态：pending
- 题型：product
- 适用方向：互联网产品经理
- 适用环节：一面、二面
- 关联简历版本：互联网产品经理岗 - 简历
- 来源 Skill：pm-sense
- 来源 run_id：pm-sense-20260725123045-a1b2c3d4
- 来源文档：
- 加入时间：
- 掌握时间：

### 题目

如何判断一个功能是否值得做？

### 追问与考察点

### 用户答案与备注
```

## 字段

每道题至少包含：

```yaml
question_id: q-<8位小写字母数字>
question: ""
status: pending | mastered
category: resume | motivation | competency | product | case | pressure | follow_up | hr | other
applicable_directions: []
applicable_stages: []
resume_version: ""
company: ""
position: ""
source_skill: ""
source_run_id: ""
source_document: ""
created_at: ""
mastered_at: ""
follow_ups: []
evaluation_points: []
answer_notes: ""
```

允许未知字段为空。不得为了补全字段编造岗位、轮次、答案或掌握状态。

## 候选题提交契约

产出型 Skill 在自身文档完成后：

1. 列出本轮值得进入题库的候选题及原因。
2. 让用户逐题或批量选择；沉默不视为同意。
3. 只把用户选择的题目及最小来源上下文交给 `interview-question-bank`。
4. 题库写入失败不回滚已完成的训练、准备、模拟或复盘文档。

生产者不得直接修改两份题库。

## 去重

依次检查：

1. `question_id` 相同；
2. Unicode 规范化、去除空白和标点后的题干相同；
3. 核心问法相同但限定条件或面试环节不同。

前两项可视为同题；第三项必须让用户判断。合并只能追加不冲突的来源、方向、环节和追问，
不得静默覆盖用户答案或备注。

## 迁移

题目状态迁移采用“先写目标、验证、再删来源、再次验证”。任何中间失败都保留已有数据并报告
精确状态。不得使用整份旧文档覆盖线上新版本。
