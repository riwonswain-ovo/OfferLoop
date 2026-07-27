# OfferLoop Agent Worker

该服务让飞书工作台在不购买域名、不开放本机端口的情况下调用 Codex 和
OfferLoop Skills。

工作台把用户消息保存为任务；本机 Worker 主动连接工作台领取任务，调用本机
Codex，然后把进度和结果回传。整个过程中只有本机主动发起 HTTPS 请求。

## 工作方式

1. 用户在 OfferLoop 工作台右侧发送消息。
2. 工作台将任务写入自身数据库。
3. 本机 Worker 最多约 1 秒内领取任务。
4. Worker 通过常驻的 Codex app-server 创建或续接原生 Codex 任务。
5. 工作台持续展示生成中的回复；停止和归档直接调用 Codex 原生能力。

飞书群里的 `lark-channel-bridge` 不受影响；两者共用本机已经可用的 Codex
运行环境与 Skills。工作台中新建的对话会作为原生任务出现在 Codex 侧边栏。

## macOS 配置

先把 `.env.example` 复制为本机专用的 `.env.local`，填写已有工作台 URL、
已有工作台 App ID、当前工作台的妙搭用户 ID（`req.userContext.userId`，纯数字字符串）
和 OfferLoop 源码目录。不要填写 `ou_` 开头的飞书 `open_id`。然后运行：

```bash
npm run configure -- --app-id app_xxx
npm run start:local
```

`npm run configure` 会创建一个仅能访问两个 Agent Worker 路由的妙搭 OpenAPI
Key，并直接保存在 macOS 钥匙串。原始密钥不会写入仓库或输出到聊天。

当前 Mac 也可以基于 `launchd/com.offerloop.agent-worker.plist.example` 生成
只属于本机的 plist，再安装到
`~/Library/LaunchAgents/`，让 Worker 在登录后自动启动，并在意外退出后自动恢复。

Worker 不内置任何开发者工作台地址，也不会创建妙搭应用。它只连接
`.env.local` 中明确登记的现有 OfferLoop 工作台。

## 安全边界

- API Key 只允许领取任务和回传任务状态。
- Worker 绑定一个明确的妙搭用户 ID，只领取该用户创建的任务；共享同一工作台
  的其他用户需要各自配置 Worker。
- Agent 在独立临时目录中运行；OfferLoop 源代码、Skills 和本机业务文件只读。
- Agent 的命令网络仅放行飞书、Lark 和飞书文件资源域名。
- 业务结果只允许写入用户已授权的飞书知识库、文档、Base 或日历。
- 写入飞书或读取招聘邮件前，工作台会先要求用户确认。
- Worker 不监听公网端口，也不需要 Cloudflare 或自定义域名。
