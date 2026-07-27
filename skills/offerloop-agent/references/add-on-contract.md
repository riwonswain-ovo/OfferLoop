# OfferLoop Agent 加装契约

## 固定链路

```text
同一飞书工作台右侧栏
  -> 新建对话：POST /api/agent-chat/conversations
  -> 发送消息：POST /api/agent-chat/runs
  -> 工作台数据库队列
  -> 本机 worker 主动轮询
  -> Codex app-server thread/start 或 turn/start
  -> 原生 Codex task
  -> 进度与结果回传右侧栏
```

用户点击工作台的“新建对话”时必须立即调用 `thread/start`，不得等待第一条消息；返回的
thread ID 作为 session ID 保存。由于 Codex 桌面端不会展示完全空白的 thread，worker 紧接着
执行一条只回复“已连接”的初始化 `turn/start`，并把该控制任务从飞书聊天记录中隐藏；第一条
正式消息继续进入同一 thread。续聊继续使用同一 thread，停止使用 `turn/interrupt`，归档使用
`thread/archive`。不得退回每轮启动 `codex exec` 的临时会话方式。

## 应用边界

- Agent 是 `offerloop-workbench` 的可选 add-on，不是独立工作台。
- 服务端队列、前端右侧栏和 OpenAPI 路由都安装进已有妙搭应用。
- 本机 worker 独立于妙搭源码，但只绑定该现有 App ID。
- `offerloop-workbench` 不依赖具体 Agent provider；Codex 专属代码只属于本 Skill。
- 不读取或修改工作台的 `.spark`、环境文件、发布绑定和 OAuth 凭据。

## 数据边界

Agent 只新增 `agent_run` 和 `agent_worker` 两张内部队列表。后端 `service_role`
可以处理队列；普通登录用户最多访问 owner 为自己的行，匿名用户无权访问。
`agent_worker.owner` 必须绑定当前飞书用户，心跳、在线状态、任务领取和结果回传均按同一个 owner 过滤。
它们不是 OfferLoop 的业务真源。
企业清单、求职进展、笔面试中心、知识库和训练 Markdown 仍由原有 Skill 拥有。卸载或停用
Agent 不得删除或重建这些资源。

## 兼容与升级

铺设脚本先校验 `.spark/meta.json` 的 App ID 与预期工作台一致，再通过
`AgentLayoutContext`、`AgentChatModule` 和目标文件内容判断是否已加装。Agent
拥有的文件可以随版本更新；工作台拥有的接线只有在匹配已知模板时才自动修改。遇到未知本地
改动时停止并报告冲突，不静默覆盖。写入接线前备份原文件，并使用同目录原子替换。
备份放在工作台目录外的同级 `.offerloop-backups/`，不得进入妙搭发布包。

worker 配置必须显式给出 `OFFERLOOP_WORKBENCH_URL`、`OFFERLOOP_WORKBENCH_APP_ID` 和
`OFFERLOOP_MIAODA_USER_ID`、`OFFERLOOP_SOURCE_ROOT`。`OFFERLOOP_MIAODA_USER_ID`
必须是工作台登录态中的 `req.userContext.userId`（纯数字字符串），不得使用飞书 `open_id`
或 `union_id`。发行包不得内置开发者的 URL、App ID、用户 ID、绝对路径或 API Key。
