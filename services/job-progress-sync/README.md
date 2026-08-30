# OfferLoop Loop Runtime

这是 OfferLoop 的平台中立轻量级闭环运行时。三张飞书 Base 与知识库仍是业务真源；本服务只保存机会与求职进展的工作流实例、节点运行、审批与幂等记录。历史能力观察和待办字段只读保留，不再新增。

## 两个 workflow

- `opportunity-loop`：岗位过滤、边缘候选确认与去重写入。
- `application-progress-loop`：邀请、完成事件与不可倒退的求职状态。

`loop-store.js` 提供原子持久化和合法边校验；`progress-model.js` 以“进展状态 / 最近完成节点”维护
求职进展。`daily-checkin.js` 只是平台中立的纯规则/契约镜像，用于验证 22:10 分组、owner 校验与异步
改期时长，不发送卡片、不接收飞书回调，也不执行 Base 或日历写入。可部署的每日卡片实现位于
`runtime/offerloop/admin/assets/progress-sync-template`；
笔面试中心仍是完成状态唯一真源，不创建飞书原生任务。

## Agent 边界

运行时可以确定性同步 Base 并维护进展幂等与审批状态。生成模拟面试、经历深挖、简历、面试准备与复盘仍由 Agent Skill 直接完成，本服务不运行本机 Agent Worker。

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

本平台中立服务没有每日卡片发送器或动作回调，因此不读取 `DAILY_CHECKIN_*` 环境变量。每日卡片的
部署变量以妙搭模板自身的配置与文档为准。

`REMINDER_BASE_TOKEN` 与 `REMINDER_TABLE_ID` 成对配置后，同一鉴权入口接受
`interview.reconcile`。`笔面试安排` 是唯一业务表，`全部安排` 与各环节入口都是筛选视图；内部运行状态表不保存招聘业务记录。
飞书 Base workflow 在单条记录的 `完成状态` 变化时传入 `record_id`，立即推进关联求职进展：

```json
{"event":"interview.reconcile","record_id":"<触发记录 ID>"}
```

托管妙搭模板另提供 `/openapi/job-progress-sync/reminder-reconcile` 入口，请求体必须能唯一定位记录，
优先使用 `{"recordId":"<触发记录 ID>"}`。不配置每 30 分钟检查、定时对账或后台补偿；失败只在
当前请求中最多尝试 3 次。之后仅在用户明确要求时按失败记录手动重试，不做全表扫描。

密钥只能存放在托管平台的加密环境变量中，不能写入 Git、飞书文档、Base 字段或日志。

本目录的测试只证明纯规则与共享契约一致，不代表卡片已部署或会在 22:10 自动发送。发送、动作处理、
幂等账本和日历写入由妙搭模板负责。

## 验证

使用 Node.js 20 或更高版本：

```bash
npm test
```

测试全部使用注入的 mock，不访问飞书，也不需要真实凭据。
