---
name: offerloop-setup
description: 配置、检查和修复 OfferLoop 的首次使用环境。用于用户说“安装 OfferLoop”“第一次使用”“帮我配置”“检查环境”“为什么 job-collection 或 recruiting-reminder 不能用”时；按用户想启用的功能逐项检查 Python、lark-cli、飞书身份、邮箱配置和 Skill 安装状态，不强迫用户一次配置全部功能。
---

# OfferLoop Setup

帮助用户以最少步骤启用 OfferLoop。只配置用户当前要用的能力，不把初始化做成一次性大表单。

## 原则

- 先问用户本次想启用 `job-collection`、`recruiting-reminder`，还是两者。
- 不要求用户在聊天中发送 App Secret、邮箱授权码、Cookie、token 或密码。
- 同一个 lark-cli profile 可以同时承载 bot 和 user 身份，但两者必须分别检查。
- `job-collection` 默认使用 `--as bot`，便于长期同步和 workflow；`recruiting-reminder` 的个人日历操作必须使用 `--as user`。
- 配置和运行状态放在用户配置目录，不写入 Skill 安装目录，避免更新覆盖。
- 任何写入飞书 Base、创建日程或读取邮箱正文前，都先说明将要访问的范围并取得用户确认。

## 流程

### 1. 运行本地预检

从本 Skill 根目录运行：

```bash
python3 scripts/preflight.py --json
```

预检只检查本机文件和命令，不读取邮箱，不访问飞书业务数据。根据结果只修复失败项。

### 2. 按功能配置

完整读取 `references/onboarding.md`，再进入对应分支：

- 只启用岗位信息同步：配置 lark-cli bot profile、目标 Base 权限和至少一个合法信息源。
- 只启用邮件提醒：配置同一个 profile 的 user 授权、IMAP 授权码和日历权限。
- 两者都启用：优先复用同一个飞书应用/profile，但分别验证 bot 与 user 身份。

### 3. 保存非敏感定位信息

如果用户确认要保存 profile 名或 OfferLoop 目标 Base URL，运行：

```bash
python3 scripts/configure.py --profile '<PROFILE>'
python3 scripts/configure.py --target-base-url '<BASE_URL>'
```

配置写入 `~/.config/offerloop/config.json`（遵循 `XDG_CONFIG_HOME`），权限为 `0600`。不要在这里保存密钥。

### 4. 初始化邮箱配置

用户要启用 `recruiting-reminder` 时，在用户确认后运行：

```bash
python3 scripts/configure.py --init-imap
```

该命令只复制模板，不填凭证。让用户在本机编辑返回的 `.env` 路径，不要让用户把内容发进聊天。

### 5. 验收

按用户启用的功能逐项报告：

- Skill 是否可发现；
- Python 与 lark-cli 是否可用；
- 选定的 lark-cli profile；
- bot 身份是否可用于 Base；
- user 身份是否完成日历授权；
- IMAP 配置文件是否存在；
- 目标 Base 是否已记录；
- 下一条可以直接说的自然语言命令。

未启用的功能标记为“未配置”，不要标记为失败。

## 故障路由

- 找不到 Skill：重新安装 OfferLoop，并确认 `offerloop-setup`、`job-collection`、`recruiting-reminder` 三个目录都存在。
- 找不到 lark-cli：暂停飞书操作，按当前环境的 lark-cli 安装说明处理。
- bot 失败：检查应用 scope、版本发布、租户安装和 Base 文档权限；不要对 bot 执行 `auth login`。
- user 失败：按最小 scope 发起 split-flow 授权；不要静默改用 bot 查询个人日历。
- IMAP 失败：确认已启用 IMAP，使用授权码或应用专用密码，不使用网页登录密码。
- 更新后配置丢失：检查是否仍把 `.env` 或状态放在旧 Skill 目录；按 onboarding 的迁移步骤移动到 OfferLoop 用户目录。
