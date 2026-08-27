# 面试事件查询与文档回填契约

## 边界

`scripts/event_lookup.py` 是离线确定性接口，不直接访问飞书。调用方先使用 `lark-base` 从公共
配置中的 `reminder_base_url` 读取最小字段，再把 JSON 通过 stdin 传给脚本。优先按 record ID
精确读取；否则在 Base 侧先按公司等已知字段过滤，禁止把全表记录送入模型上下文。需要准备材料的
调用方需要岗位上下文时，通过关联的求职记录读取 `岗位 JD`；当前使用哪份简历由用户在本轮
准备或复盘任务中确认，不写入业务 Base。脚本统一负责
公司/岗位规范化、候选筛选、单表记录 ID 解析和幂等回填计划；其他 Skill 不复制这些规则。

## 候选查询

输入：

```json
{
  "query": {
    "record_id": "",
    "source_mail_id": "",
    "company": "",
    "position": "",
    "stage": "",
    "start_time": ""
  },
  "records": [
    {
      "record_id": "rec_reminder",
      "fields": {
        "公司": "",
        "岗位": "",
        "环节": "",
        "开始时间": "",
        "来源邮件ID": "",
        "关联邮件ID": "[]",
        "事件状态": "有效"
      }
    }
  ]
}
```

调用：

```text
event_lookup.py resolve --input - --json
```

`record_id` 和 `source_mail_id` 是精确匹配；邮件 ID 同时查询 canonical `来源邮件ID` 和
`关联邮件ID`。提供精确 ID 但未命中时直接返回 `missing`，不得退回模糊字段。已取消事件不作为
准备/复盘候选。未提供精确 ID 时按公司、岗位、环节和时间逐步收窄，返回 `found`、`ambiguous`
或 `missing`。

- `interview-prep`：`found` 自动关联；`ambiguous` 或 `missing` 时询问用户，不取第一条。
- `talk-review`：`found` 自动关联；`ambiguous` 或 `missing` 时询问用户，不取第一条。

## 回填计划

调用方先读取已确认记录当前的“面试准备文档”；复盘还必须读取 `完成状态`，并携带正式产物的
`artifact_status`。准备文档输入示例：

```json
{
  "kind": "prep",
  "run_id": "interview-prep-20260724123045-a1b2c3d4",
  "document_url": "https://example.feishu.cn/wiki/example",
  "event": {
    "record_id": "rec_reminder",
    "stage": "一面",
    "event_status": "有效"
  },
  "current": {
    "value": ""
  }
}
```

完成复盘输入示例：

```json
{
  "kind": "review",
  "artifact_status": "completed",
  "run_id": "talk-review-20260724123045-a1b2c3d4",
  "document_url": "https://example.feishu.cn/wiki/review",
  "event": {
    "record_id": "rec_reminder",
    "stage": "一面",
    "event_status": "有效"
  },
  "current": {
    "value": "",
    "completion_status": "待完成"
  }
}
```

调用：

```text
event_lookup.py backfill --input - --json
```

脚本返回最小 patch 操作；执行时以操作中的 `fields` 为一次 Base 更新的完整原子 patch：

- 当前值等于目标 URL：记录为 `already_synced`，不重复写文档字段。
- 当前为空：返回 patch。
- 当前存在其他 URL：返回 `conflict`，不覆盖。
- `artifact_status=completed` 的复盘在同一次 patch 中写入复盘 URL 并把 `完成状态` 从 `待完成`
  更新为 `已完成`；即时 workflow 随后把关联求职进展更新为当前环节完成、通常为 `待反馈`。已经
  存在更晚待办环节或人工终态时，进展状态机不得回退。
- `artifact_status=incomplete` 的复盘只回填文档，不更新 `完成状态`，不推进求职进展。
- 当前事件已经 `已错过`、完成状态为空或不是有效事件时，完成复盘返回 `conflict`，不得静默改成
  已完成。
- 历史“面试（轮次待确认）”与明确轮次使用相同的单表回填规则。
- 测评或笔试：拒绝回填。

Agent 通过 `lark-base` 逐条执行原子 patch，并重新读取事件与关联求职进展验证。若返回
`progress_reconcile_expected=true`，必须确认 workflow 已把 `最近完成节点` 更新为对应的“X面完成”；
没有下一轮待办时 `进展状态=待反馈`。部分失败时保留已成功项，记录失败的
精确 record ID、字段、URL 和 `run_id`。不得后台补偿；只有用户明确要求重试时才用同一
`run_id` 只补失败 patch。不得使用 `来源邮件ID` 替代已确认的 record ID 写入。
