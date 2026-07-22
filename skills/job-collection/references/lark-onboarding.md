# 飞书身份与 lark-cli 新用户接入

首次使用、接管已有 Base、创建定时任务或遇到权限错误时读取本文。先确定稳定的飞书应用身份，再访问业务数据。

## 身份模型

```text
当前 Agent
  → 调用 lark-cli
  → `--profile` 选择本机配置
  → profile 对应一个飞书应用
  → `--as bot` 使用该应用机器人
  → 该应用还需获得具体 Base 的文档权限
```

Agent 名称、profile 名和飞书应用名称可以相同，但不是同一个概念。安装飞书应用、配置 API scope、配置 lark-cli profile、把应用加入 Base 是四个独立步骤。

## 预检决策树

### 检查 lark-cli 与 profiles

1. 检查 `lark-cli` 是否可用；缺失时停止飞书操作并引导安装。
2. 列出 profiles，不切换、不删除现有 profile。
3. 用户明确指定 profile 时优先使用。
4. 只有一个可用 bot profile 时可以采用，但先告知用户应用名称和非敏感 app ID。
5. 有多个可用 profile 时，列出 profile 名和应用名称，让用户选择。不得依据当前 Agent 品牌、默认 profile 或历史任务猜测。
6. 没有 profile 时进入“尚未接入飞书应用”。

选定后用以下形式验证并固定身份：

```bash
lark-cli whoami --profile '<PROFILE>' --as bot
```

后续每条 lark-cli 命令都显式携带同一个 `--profile '<PROFILE>' --as bot`。核对返回的 identity 为 bot，并在本轮保持同一个 app ID。profile 名属于机器本地运行配置，不写入 `用户偏好` 或 `信息源登记`；定时任务应在自己的配置或提示中固定它。

### 已有其他 Agent 配置过的 profile

可以复用，但必须由用户选择，不能自动借用另一个 Agent 的身份。按顺序检查：

1. profile 凭证可用，bot 身份能取得 token。
2. 飞书开放平台已开通所需最小 scope，应用版本已发布并在当前租户安装。
3. 目标 Base 已加入该文档应用并授予编辑权限。
4. 每个飞书来源 Base 已加入该文档应用并至少授予查看权限。
5. bot 可以读取 workflow；初始化或修复结构时还需具备 workflow 管理权限。
6. 执行最小幂等写探测并回读，确认不是“能读不能写”。已有记录时只把某个字段更新为原值；不得为了探测创建垃圾业务记录或改动用户维护字段。

Base 授权应引导用户在目标文档右上角使用：

```text
… / 更多 → 添加文档应用 → 选择已选定的飞书应用
```

不要让用户在普通“添加协作者”中搜索应用。启用高级权限时，还要把应用加入具备相应表、记录和 workflow 权限的角色。

旧机器人和新机器人权限彼此独立，没有“自动转交”。新身份全部探测通过后，用户才可以停用旧机器人；停用前提醒用户确认旧机器人没有承担其他自动化。

### 尚未接入任何飞书应用/profile

先判断用户能否使用企业自建应用：

1. 优先使用管理员提供的专用应用；否则由有权限的人在飞书开放平台创建企业自建应用。
2. 只开通 Base、云空间和 workflow 所需的最小权限，以当前 API 错误返回的缺失 scope 和官方后台为准。
3. 发布应用版本并安装到当前租户；只在后台勾选 scope 不等于已经生效。
4. 按 `lark-shared` 的配置流程创建 lark-cli profile。App Secret 只能通过本机终端 stdin、钥匙串或产品密钥管理配置，禁止粘贴到聊天、Markdown、日志或 Git。
5. 把该应用加入目标 Base 和所有飞书来源 Base，然后重新执行完整预检。

如果用户没有创建/安装应用的权限，应让其联系管理员提供应用或完成审批。在此之前：

- 不创建或写入飞书 Base；
- 不声称初始化或同步成功；
- 不推进任何来源游标；
- 可以在当前会话收集偏好、读取用户已授权的腾讯来源或生成预览，但要明确这些结果尚未持久化。

`--as user` 仍依赖已配置的飞书应用和用户授权，不是“没有应用”的绕过方案。只有用户明确要求一次性使用用户身份时才进入该模式；无人值守任务默认使用 bot。

## 新建 Base 与接管 Base

### 接管用户已有 Base

- 用户把选定应用加入目标 Base，授予编辑权限。
- 飞书来源 Base 只需读取时授予查看权限。
- 先完成结构只读审计，再做幂等写和 workflow 探测。
- 任一权限失败时停止对应操作，保留旧游标。

### bot 新建 Base

- bot 通常是新 Base 的资源所有者。
- 创建后立即把用户加入为可编辑或 full_access 协作者，否则用户可能无法打开。
- 用户协作者添加失败时不得把初始化报告为完成。

## 定时任务身份

创建每日同步前必须再次验证：

1. automation 中固定明确的 profile 和 `--as bot`，不依赖默认 profile。
2. 当前 bot app ID 与首次验收一致；不一致时暂停并让用户确认身份迁移。
3. 目标 Base 可写、飞书来源 Base 可读、workflow 可验收。
4. 无人值守环境能安全读取 lark-cli 凭证。macOS 钥匙串不可用时按 `references/feishu-setup.md` 处理，不静默降级。
5. 停用、删除或取消安装对应飞书应用会使定时任务失效。

复用当前 Agent 已有应用适合快速开始；长期每日同步优先建议独立的 `job-collection` 应用/profile，以最小权限运行，也避免停用某个 Agent 应用时连带中断同步。

## 故障分层

按层级给用户具体修复动作，不笼统说“权限不足”：

| 现象 | 所属层级 | 处理 |
|---|---|---|
| `lark-cli` 不存在 | 本机工具 | 安装并重新预检 |
| 无 profile / 凭证无效 | 本机配置 | 按 `lark-shared` 初始化或修复 profile；不在聊天传 Secret |
| 缺少 scope、token 获取失败 | 飞书应用 | 打开错误返回的官方后台链接，开通权限、发布并安装应用；bot 不执行 `auth login` |
| Base 能读其他资源但读不到目标文档 | 文档权限 | 在该 Base 的“添加文档应用”中加入选定应用 |
| Base 可读但写入返回权限错误 | 文档角色/高级权限 | 给目标 Base 编辑权限，并检查高级权限角色 |
| workflow 无法列出或管理 | workflow 权限 | 开通对应 scope，并检查应用在该 Base 的角色权限 |
| 交互运行成功、定时任务失败 | 运行环境 | 检查 automation 固定的 profile、app ID 和凭证可读性 |

只有 profile 身份、scope、Base 权限、最小写入和 workflow 五项全部通过，才进入来源扫描和业务写入。

## CLI 方言与回读兼容

不同 lark-cli 版本的 shortcut 名称和 token 参数可能变化。每次首次运行或升级后先读取本机帮助：

```bash
lark-cli base --help
lark-cli base +record-get --help
lark-cli base +record-list --help
```

当前受支持方言使用 `+table-list`、`+record-list`、`+record-get`、`+record-search`、
`+record-batch-update` 等带 `+` 的 shortcut，并使用 `--base-token`。所有业务命令仍必须显式带
`--profile <PROFILE> --as bot`。帮助中不存在某个 shortcut 时停止并按本机帮助选择等价命令，
不得直接粘贴旧版无 `+` 命令。

写后回读采用保守兼容路径：一次只传一个 `--record-id`，不传 `--field-id`，读取完整 JSON 后
在本地按 `fields`/`field_id_list` 投影。重复 `--record-id` 或同时投影触发的参数解析错误只说明
CLI 客户端路径失败，不得据此把已成功写入判定为不存在。批量读使用 `+record-list` 或
`+record-search`。

## 网络错误分层

`accounts.feishu.cn` 或 OpenAPI 域名 DNS 失败属于网络层，不是 bot scope 或 Base 文档权限错误：

1. 使用完全相同的 profile、identity 和命令重试一次；宿主有网络沙箱时申请该命令的网络权限。
2. 重试成功后继续，不修改 profile、不切换身份。
3. 重试仍失败时停止依赖飞书的读取和写入，保留所有来源旧游标。
4. 不用自动化记忆、旧 JSON、浏览器历史或临时文件替代实时「信息源登记」与用户偏好。
