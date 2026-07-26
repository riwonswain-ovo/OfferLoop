# OfferLoop Agent Gateway

该服务把飞书工作台中的对话任务交给本机或服务器上的 Codex，再由 Codex
按触发规则加载 OfferLoop Skills。飞书应用只保存会话 ID 和展示结果，不接触
Codex 登录信息、Skill 文件或本机命令权限。

## 本地启动

1. 复制 `.env.example` 为 `.env.local`。
2. 将 `OFFERLOOP_WORKSPACE` 改为 OfferLoop 仓库的绝对路径。
3. 为 `OFFERLOOP_GATEWAY_TOKEN` 设置至少 16 个字符的随机值。
4. 确认当前用户已经可以运行 `codex --version`。
5. 运行 `npm run start:local`。

服务默认仅监听 `127.0.0.1:4715`。生产环境应放在 HTTPS 反向代理后，仅允许
飞书应用后端访问，并把同一个 Token 通过飞书应用环境变量
`OFFERLOOP_AGENT_GATEWAY_TOKEN` 注入。

## API

- `GET /health`：检查 Gateway 和 Codex 运行时。
- `POST /v1/runs`：创建异步 Agent 任务。
- `GET /v1/runs/:runId`：轮询任务状态和结果。
- `DELETE /v1/runs/:runId`：取消任务。

所有请求都需要 `Authorization: Bearer <token>`。任务接口还需要
`X-OfferLoop-User-Id`，Gateway 会校验任务归属。
