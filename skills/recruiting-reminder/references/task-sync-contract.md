# v2.0.0 联动契约索引（兼容文件名）

v2 不创建或读取飞书原生任务。本文件仅为旧安装清单兼容保留，不应在普通调用中整体加载：

- 邮件、Base、求职进展、日历、通知与手动失败恢复：`mail-sync-contract.md`。
- 22:10 每日群卡片：`daily-card-contract.md`。
- 字段、状态和视图：`event-schema.md`。

`笔面试安排` 是完成状态唯一真源。用户在笔面试中心修改完成状态后，即时 workflow 必须携带精确
record ID 调用 `/openapi/job-progress-sync/reminder-reconcile`，并校验
`X-OfferLoop-Workflow-Secret`；其他视图立即显示相同值。不得创建 `offerloop-base-reconcile`，
不得在缺少精确记录定位时执行全表对账，也不得运行每 30 分钟检查、定时对账或后台补偿。
