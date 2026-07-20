# 飞书多维表格安全接入

本 skill 优先使用 `lark-cli` 管理飞书身份和凭证。只有运行环境没有 `lark-cli` 时，才使用飞书自建应用的环境变量直连 OpenAPI。

首次接入、存在多个 profile、接管已有 Base 或创建定时任务时，先读取 `references/lark-onboarding.md` 并完成身份、scope、文档权限、最小写入和 workflow 五项预检。

## 方案 A：lark-cli（推荐）

1. 安装并初始化 `lark-cli`，按其交互流程配置 bot profile；有多个 profile 时必须让用户选择，并在全部命令中显式固定 `--profile`。
2. 通过“添加文档应用”将选定应用加入目标 Base 并授予编辑权限；加入每个飞书来源 Base 并至少授予查看权限。
3. 用只读命令验证目标和来源均可访问：

```bash
lark-cli base +table-list --base-token '<BASE_TOKEN>' --format json --profile '<PROFILE>' --as bot
```

4. 定时任务在 macOS 沙箱中无法读取系统钥匙串时，可由用户在交互式终端执行：

```bash
lark-cli config keychain-downgrade
```

该命令会把 lark-cli 主密钥保存为当前 macOS 用户可读的本地文件。执行前必须向用户说明权衡；不得由公共 skill 静默执行。

## 方案 B：飞书自建应用环境变量

### 创建应用

1. 在飞书开放平台创建企业自建应用。
2. 开通多维表格和云空间所需的最小读写权限。
3. 发布应用版本，使权限生效。
4. 将应用加入用户已有的目标 Base 和来源 Base。

权限名称和审批流程可能随飞书平台调整，以飞书开放平台当前界面为准。

### 配置凭证

不要把 App Secret 粘贴到聊天、Issue、日志或 Markdown。用户应在本机终端或 Agent 产品的密钥管理界面设置：

```bash
export FEISHU_APP_ID='cli_xxx'
export FEISHU_APP_SECRET='replace-me'
```

也可在用户配置目录创建 `~/.config/offerloop/job-collection/.env`（遵循
`XDG_CONFIG_HOME`）：

```dotenv
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=replace-me
```

文件权限设为 `0600`。Skill 根目录旧 `.env` 只作兼容读取，确认新位置可用前不要删除。

### 获取 token

可选 helper 位于 `scripts/get_token.py`。它按以下顺序读取凭证：

1. 当前进程环境变量。
2. `~/.config/offerloop/job-collection/.env`。
3. skill 根目录旧 `.env`（兼容）。

token 缓存在用户缓存目录的 `job-collection/feishu-token.json`，文件权限为 `0600`。默认命令只验证 token 可用，不打印 token：

```bash
python3 scripts/get_token.py
```

确需把 token 传给另一个本地进程时才显式使用：

```bash
python3 scripts/get_token.py --print-token
```

不要在共享终端日志或 CI 中使用 `--print-token`。

## Base 权限模型

- 用户已有 Base：用户必须把机器人或自建应用加入为协作者。
- 机器人新建 Base：机器人通常是资源所有者，仍需把用户加入为可编辑或 full_access 协作者。
- 独立求职进展、笔面试中心和知识库分别验证权限；能写企业 Base 不代表能写其他资源。
- 权限不足时停止操作并返回真实错误；不要通过公开链接或身份切换绕过访问控制。

## 最小权限原则

- 只授予完成 Base 读取、写入和协作者管理所需的权限。
- 不要求通讯录、消息、日历等与本 skill 无关的权限。
- 定期轮换 App Secret；怀疑泄漏时立即在飞书开放平台重置。
- 不把 token、Secret、Base 私有链接写入测试夹具或示例。

## 常见问题

| 现象 | 处理 |
|---|---|
| 目标 Base 不可见 | 检查机器人是否为该 Base 协作者 |
| 能读不能写 | 检查协作者权限和 bitable 写权限 |
| 定时任务提示 keychain 不可用 | 用户在交互式终端评估并执行 `keychain-downgrade` |
| token 请求失败 | 检查 App ID/Secret、应用版本和权限审批 |
| 用户打不开机器人创建的 Base | 给用户添加 full_access 协作者权限 |
