# OfferLoop 新用户接入

## 1. 渐进启用

| 用户目标 | 必需配置 | 暂时不需要 |
|---|---|---|
| 同步招聘信息 | Python、lark-cli bot、目标 Base、信息源 | IMAP、个人日历 user 授权 |
| 整理笔试和面试 | Python、IMAP、lark-cli user、Base 与日历权限 | 招聘信息源、定时同步 |
| 完整使用 | 上述全部 | 无 |

不要因为用户安装了整个仓库，就要求一次完成所有授权。

## 2. 飞书身份模型

一个 lark-cli profile 对应一个飞书应用；同一应用可以有两种身份：

```text
同一个 profile
├── --as bot   → Base 同步、workflow、无人值守任务
└── --as user  → 用户自己的主日历、忙闲和日程
```

这两种身份共享应用配置，但权限和授权流程不同：

- bot：在开发者后台开通 scope、发布版本并安装到租户；禁止执行 `auth login`。
- user：后台开通 scope 后，还需要用户通过 `auth login` 同意授权。

存在多个 profile 时必须让用户选择。选定后，本轮命令都显式传递 `--profile '<PROFILE>'` 和正确的 `--as`。

## 3. 日历最小权限

`recruiting-reminder` 至少需要：

- `calendar:calendar.free_busy:read`
- `calendar:calendar.event:create`
- `calendar:calendar.event:update`

用户身份缺少权限时，使用 lark-cli 的 split-flow：先以 `--no-wait --json` 获取授权链接和 device code，向用户展示链接与二维码；用户确认完成后，再由 Agent 执行 device-code 完成登录。不得缓存或公开授权材料。

## 4. Base 权限

操作用户自己的 Base 时优先使用用户明确选择的身份。`job-collection` 的长期同步固定使用 bot，因此需要确保：

1. bot 能获取 token；
2. 应用已开通所需 Base 和 workflow scope；
3. 应用版本已发布并安装；
4. 目标 Base 已授予应用编辑权限；
5. 信息源 Base 已授予应用读取权限。

`recruiting-reminder` 若复用由 `job-collection` 创建的 Base，先只读验证目标表与字段，再写入；不要按标题猜 token。

## 5. 邮箱配置

默认位置：

```text
~/.config/offerloop/recruiting-reminder/.env
```

支持 `XDG_CONFIG_HOME`；也可用 `OFFERLOOP_IMAP_ENV` 指向其他文件。配置文件应限制为当前用户可读，并包含：

```dotenv
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_LOGIN=you@example.com
IMAP_PASSWORD=app-password-or-authorization-code
MAILBOX=INBOX
TZ=Asia/Shanghai
```

Skill 安装目录下旧的 `scripts/.env` 只用于兼容迁移。检测到后应建议移动到新位置；确认新位置可用前不要删除旧文件。

## 6. 用户状态目录

| 内容 | 默认位置 |
|---|---|
| OfferLoop 公共定位配置 | `~/.config/offerloop/config.json` |
| IMAP 配置 | `~/.config/offerloop/recruiting-reminder/.env` |
| Reminder Base 定位 | `~/.config/offerloop/recruiting-reminder/base_config.json` |
| 已处理邮件状态 | `~/.local/state/offerloop/recruiting-reminder/processed_emails.json` |

遵循 `XDG_CONFIG_HOME` 和 `XDG_STATE_HOME`。这些文件都不进入 Git，也不应随 Skill 更新覆盖。

## 7. 旧版迁移

检测旧版安装目录中的 `.env`、`base_config.json` 或 `processed_emails.json` 时：

1. 告诉用户发现了哪些旧文件，不显示内容；
2. 创建新的配置和状态目录；
3. 复制文件并设置 `0600`；
4. 验证新位置可读；
5. 保留旧文件作为回滚，除非用户明确要求清理。
