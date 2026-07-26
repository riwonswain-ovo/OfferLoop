# 面试事件查询与文档回填契约

## 边界

`scripts/event_lookup.py` 是离线确定性接口，不直接访问飞书。调用方先使用 `lark-base` 从公共
配置中的 `reminder_base_url` 读取最小字段，再把 JSON 通过 stdin 传给脚本。需要准备材料的
调用方还必须通过关联的求职记录读取 `岗位 JD` 和 `投递简历版本`；笔面试中心同名字段由用户
维护，只作提示和核对，不替代求职进展事实源。脚本统一负责
公司/岗位规范化、候选筛选、主子表 ID 解析和幂等回填计划；其他 Skill 不复制这些规则。

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
      "record_id": "rec_main",
      "fields": {
        "公司": "",
        "岗位": "",
        "环节": "",
        "开始时间": "",
        "来源邮件ID": "",
        "投递简历版本": "",
        "子表 record_id": ""
      }
    }
  ]
}
```

调用：

```text
event_lookup.py resolve --input - --json
```

`record_id` 和 `source_mail_id` 是精确匹配；无精确 ID 时按公司、岗位、环节和时间逐步收窄。
返回 `found`、`ambiguous` 或 `missing`。调用方不得在 `ambiguous` 时取第一条；`found` 也要
展示公司、岗位、环节和时间让用户确认。

## 回填计划

调用方先读取主表和明确子表当前的“面试准备文档”或“面试复盘文档”，再输入：

```json
{
  "kind": "prep",
  "run_id": "interview-prep-20260724123045-a1b2c3d4",
  "document_url": "https://example.feishu.cn/wiki/example",
  "event": {
    "main_record_id": "rec_main",
    "child_record_id": "rec_child",
    "stage": "一面"
  },
  "current": {
    "main": "",
    "child": ""
  }
}
```

调用：

```text
event_lookup.py backfill --input - --json
```

脚本返回最小 patch 操作：

- 当前值等于目标 URL：记录为 `already_synced`，不写。
- 当前为空：返回 patch。
- 当前存在其他 URL：返回 `conflict`，不覆盖。
- 明确面试轮次缺少子表 record ID：返回 `needs_action`，不产生半套写入。
- “面试（轮次待确认）”：只计划主表。
- 笔试：拒绝回填。

Agent 通过 `lark-base` 逐条执行 patch，并重新读取验证。部分失败时保留已成功项，记录失败的
精确 record ID、字段、URL 和 `run_id`，下次用同一 `run_id` 重新生成计划。不得使用
`来源邮件ID` 替代已确认的 record ID 写入。
