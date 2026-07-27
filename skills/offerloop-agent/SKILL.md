---
name: offerloop-agent
description: 为已经部署的 OfferLoop 飞书工作台加装、升级、检查或移除本机 Agent 连接。仅当用户明确要求“把 Codex 接入 OfferLoop 工作台”“安装/修复 OfferLoop Agent”“让飞书工作台的新对话同步出现在 Codex”或“保留工作台右侧智能助手”时使用；必须复用现有 offerloop-workbench 妙搭应用，不创建第二个妙搭应用。目前只支持 Codex，未安装本 Skill 不影响知识库、三张 Base 或其他 OfferLoop Skill。
---

# OfferLoop Agent

把本机 Codex 作为可选执行引擎接入已有 OfferLoop 飞书工作台。用户在工作台右侧栏新建对话时，
本机 worker 通过 Codex app-server 创建原生 Codex 任务；后续续聊、停止和归档沿用同一个任务。

运行任何脚本前，先根据当前 `SKILL.md` 的位置解析 Skill 根目录，不假设 Agent 当前工作目录。

## 职责边界

- `offerloop-setup`：初始化必需的知识库、三张 Base、公共定位和身份。
- `offerloop-workbench`：创建、发布和验收可选的飞书妙搭工作台。
- 本 Skill：在同一个工作台应用里加入右侧栏、任务队列和本机 Codex worker。

本 Skill 只能在工作台已经存在时运行。缺少工作台时，停止并路由到
`offerloop-workbench`；禁止为了 Agent 单独新建第二个妙搭应用。用户不安装或停用本 Skill 时，
`job-collection`、`recruiting-reminder`、知识库和全部训练 Skill 继续独立运行。

当前 provider 只有 Codex。Claude Code、OpenCode 或其他 Agent 需要各自的 provider 适配，
不得伪装成已经兼容，也不得把 Codex 专属 worker 塞回 `offerloop-workbench`。

## 安装与升级

先完整阅读 `references/add-on-contract.md`。从 OfferLoop 公共配置读取已经验收的
`workbench_url`，并确认目标本地目录绑定的是同一个妙搭应用。先预览：

```bash
python3 scripts/materialize_agent.py \
  --workbench-dir '<EXISTING_WORKBENCH_PROJECT_DIR>' \
  --worker-dir '<LOCAL_AGENT_WORKER_DIR>' \
  --expected-app-id '<EXISTING_APP_ID>' \
  --json
```

结果中的 `creates_second_miaoda_app` 必须为 `false`。向用户展示会变更的工作台文件与 worker
目录；确认后才执行：

```bash
python3 scripts/materialize_agent.py \
  --workbench-dir '<EXISTING_WORKBENCH_PROJECT_DIR>' \
  --worker-dir '<LOCAL_AGENT_WORKER_DIR>' \
  --expected-app-id '<EXISTING_APP_ID>' \
  --apply \
  --json
```

脚本只铺设 Agent 拥有的源码、SQL migration 和右侧栏接线；不复制 `.spark`、`.env*`、
数据库数据、日志、构建产物或凭证。重复运行应只更新本 Skill 拥有的版本化文件。

## 绑定本机 Worker

在 worker 目录：

1. 将 `.env.example` 复制为仅本机可读的 `.env.local`。
2. 填写现有工作台 URL、同一应用的 `app_xxx`、当前工作台的妙搭用户 ID
   （`req.userContext.userId`，纯数字字符串）、OfferLoop 源码根目录和可选运行缓存目录。
   禁止填写 `ou_` 开头的飞书 `open_id`；Worker 只领取该妙搭用户创建的任务。
3. 在用户确认后，为同一个工作台 App ID 创建只含以下两个路由的 OpenAPI Key：

```text
POST /openapi/agent-worker/poll
POST /openapi/agent-worker/run-update
```

4. macOS 运行 `npm run configure -- --app-id '<EXISTING_APP_ID>'`，密钥只写入钥匙串。
5. 运行 `npm run start:local`。不要在聊天、Git、Skill 目录或公共配置中保存 API Key。

Worker 只主动向工作台发起 HTTPS 轮询，不开放本机端口。Codex 运行在独立临时目录，
OfferLoop 源码和 Skills 只读，业务结果只写入用户已经授权的飞书资源。

## 发布与验收

在原工作台项目运行它自己的类型检查、测试、lint 和构建门禁；全部通过后，提交并发布同一个
妙搭应用。至少验证：

- 工作台仍使用原 URL 和原 App ID，没有新增妙搭应用。
- 右侧栏可打开、关闭，窄屏使用遮罩，宽屏固定在右侧。
- worker 状态由“等待连接”变为“已连接”。
- 工作台新建对话后，Codex 桌面端侧边栏出现一个新的原生任务。
- 第二轮消息续接同一个 Codex task；停止与归档可用。
- Agent 停止时，三张 Base、日历、知识库入口和其他 OfferLoop Skill 不受影响。

只有这些检查完成，才能把 `offerloop-agent` 标为 ready。

## 安全与移除

- 创建 OpenAPI Key、覆盖源码、发布应用、安装 launchd 或删除旧应用前必须单独确认。
- 移除时优先停掉本机 worker，再从同一工作台移除 Agent 拥有的模块和右侧栏接线。
- 不删除工作台应用、知识库、Base 或业务数据。
- 仓库中旧的独立 Agent 妙搭应用不是本 Skill 的依赖；删除远端应用属于单独的破坏性操作。
