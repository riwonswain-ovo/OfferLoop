# Job Collection 飞书通知

从公共配置读取可选的 `notifications`：`status`、`target_type`、`target_name`、`target_id`、
`identity`。只有用户已明确确认接收方、消息模板和发送身份，并将 `status` 设为 `enabled`，才把
该配置视为持续授权。配置缺失或停用时不发送；实际发送前完整读取 `lark-im` Skill。

仅在初始化或增量同步后发送；清单查询、dry-run 和纯结构审计默认不发送。按以下区块生成：

```markdown
## 每日招聘信息增量同步｜YYYY-MM-DD

### 已写入招聘信息（按公司）
- **公司｜招聘批次**：岗位摘要；城市；截止日期或“尽快投递”。[投递入口](URL)

### 写入前待确认
- **[编号] 公司｜招聘批次**：岗位；城市；行业；原因；截止日期。[投递入口](URL)

### 来源统计
- **来源名**：窗口；候选 N / 硬筛通过 N / 直写 N / 待确认 N / 明确不写 N / 新增 N / 补全 N / 失败 N；游标变化。

### 验收
- 主子表写入与回读、既有记录一致性、workflow 和求职进展对账。
```

已写入区只使用本轮最终写入主表的记录。一条新增至少对应一个条目；仅在公司、批次、入口完全
相同时合并岗位。固定写出公司、批次、岗位摘要、城市、截止时间和可点击入口；入口优先使用投递
链接，否则使用公告链接。不得发送硬筛淘汰项、凭证或完整技术错误。

写入前待确认区只列 `prewrite_confirmation`，使用与对话一致的稳定编号和必要判断原因；它们尚未
进入企业清单。没有待确认项时写 `- 无。`。消息超过平台限制时仅在公司条目边界拆分，并用同一
`run_id` 加分片序号生成幂等键，不得删掉候选条目缩短消息。

发送时固定使用配置中的 profile 和 identity：`target_type=user` 传 `--user-id`，
`target_type=chat` 传 `--chat-id`。运行开始时生成一个 `run_id`，以
`offerloop-job-collection-<run_id>` 作为 idempotency key，重试时复用：

```bash
lark-cli im +messages-send \
  <--user-id ou_xxx | --chat-id oc_xxx> \
  --markdown '<本轮同步摘要>' \
  --idempotency-key 'offerloop-job-collection-<run_id>' \
  --profile <profile> \
  --as <bot|user>
```

尖括号内容是运行时占位符，不可原样执行；每组二选一参数只保留配置对应项。通知失败不得回滚
Base 写入、进展对账或已满足推进条件的来源游标；在对话摘要标记失败。无人值守任务只能使用预先
启用的固定目标，不得临时搜索联系人或群聊。
