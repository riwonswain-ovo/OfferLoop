# OfferLoop Loop Runtime

这是 OfferLoop 的平台中立轻量级闭环运行时。三张飞书 Base 与知识库仍是业务真源；本服务只保存工作流实例、节点运行、能力观察、待办、审批与幂等记录。

## 三个 workflow

- `opportunity-loop`：岗位过滤、边缘候选确认与去重写入。
- `application-progress-loop`：邀请、完成事件与不可倒退的求职状态。
- `capability-growth-loop`：能力观察、专项训练待办与复测。

`loop-store.js` 提供原子持久化和合法边校验；`progress-model.js` 以“进展状态 / 最近完成节点”维护求职进展；`daily-checkin.js` 负责每日确认的安全预检和回调幂等。

## 每日进展确认

固定计划为 `21:30 Asia/Shanghai`。发送前必须完整分页读取群成员，并确认群内只有一个真人且该真人是 OfferLoop 所有者。任何条件不满足时返回暂停原因；不自动改为私聊。

卡片按钮使用 `message_id + action_id + event_id` 去重。自由文本只生成变更预览，用户确认前不得写 Base。

## Agent 边界

运行时可以确定性同步 Base、排队能力观察、创建待办和准备上下文。生成训练题、模拟面试、经历深挖、简历、面试准备与复盘时，只生成原生 Agent 深链接，不运行本机 Agent Worker。

## 求职进展双向对账

同步入口同时接受 `application.submitted` 与 `application.status_changed`。状态进入 `已投递` 时幂等创建或更新求职进展；状态离开 `已投递` 时，只删除仍为空白、仍处于默认待反馈状态且 ID 为 `enterprise:<企业记录 ID>:default` 的自动生成行。只要岗位、JD、进展状态或完成节点已经被用户维护或推进，就保留记录并返回 `review_required`，避免误删真实申请历史。

## 环境变量

```text
FEISHU_APP_ID=<value>
FEISHU_APP_SECRET=<value>
PROGRESS_BASE_TOKEN=<value>
PROGRESS_TABLE_ID=<value>
WEBHOOK_SECRET=<value>
REMINDER_BASE_TOKEN=<笔面试中心 Base app token>
REMINDER_TABLE_ID=<笔面试安排 table id>
```

`REMINDER_BASE_TOKEN` 与 `REMINDER_TABLE_ID` 成对配置后，同一鉴权入口接受
`interview.reconcile`。`笔面试安排` 是唯一物理表，`全部安排` 与各环节入口都是筛选视图。
飞书 Base workflow 在单条记录的 `完成状态` 变化时传入 `record_id`，立即推进关联求职进展：

```json
{"event":"interview.reconcile","record_id":"<触发记录 ID>"}
```

`offerloop-base-reconcile` 继续做全量幂等补偿；它的频率不代表正常同步延迟。托管妙搭模板另提供
`/openapi/job-progress-sync/reminder-reconcile` 入口，请求体为
`{"recordId":"<触发记录 ID>"}`。

密钥只能存放在托管平台的加密环境变量中，不能写入 Git、飞书文档、Base 字段或日志。

## 验证

使用 Node.js 20 或更高版本：

```bash
npm test
```

测试全部使用注入的 mock，不访问飞书，也不需要真实凭据。
