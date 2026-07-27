# OfferLoop Agent Worker

该服务让飞书工作台在不购买域名、不开放本机端口的情况下调用 Codex 和
OfferLoop Skills。

工作台把用户消息保存为任务；本机 Worker 主动连接工作台领取任务，调用本机
Codex，然后把进度和结果回传。整个过程中只有本机主动发起 HTTPS 请求。

## 工作方式

1. 用户在 OfferLoop 工作台右侧发送消息。
2. 工作台将任务写入自身数据库。
3. 本机 Worker 每 3 秒主动领取一个任务。
4. Worker 使用本机 Codex 登录与 OfferLoop Skills 执行任务。
5. 工作台轮询任务状态并展示最终结果。

飞书群里的 `lark-channel-bridge` 不受影响；两者共用本机已经可用的 Codex
运行环境与 Skills，但各自维护独立会话。

## macOS 配置

```bash
npm run configure
npm run start:local
```

`npm run configure` 会创建一个仅能访问两个 Agent Worker 路由的妙搭 OpenAPI
Key，并直接保存在 macOS 钥匙串。原始密钥不会写入仓库或输出到聊天。

当前 Mac 也可以把 `launchd/com.offerloop.agent-worker.plist` 安装到
`~/Library/LaunchAgents/`，让 Worker 在登录后自动启动，并在意外退出后自动恢复。

默认工作台地址已经内置。只有仓库位置变化时，才需要在 `.env.local` 中设置：

```bash
OFFERLOOP_WORKSPACE=/absolute/path/to/OfferLoop
```

## 安全边界

- API Key 只允许领取任务和回传任务状态。
- 工作台仍按当前飞书用户隔离对话任务。
- 写入飞书或读取招聘邮件前，工作台会先要求用户确认。
- Worker 不监听公网端口，也不需要 Cloudflare 或自定义域名。

旧的入站 HTTP Gateway 仍保留为 `npm run start:gateway`，仅用于兼容已有测试和
迁移，不再是 OfferLoop 工作台的默认连接方式。
