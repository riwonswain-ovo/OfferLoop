# OfferLoop 旧用户迁移与回滚

本文主要面向早期只安装过 `job-collection` 和/或 `recruiting-reminder` 的用户。迁移目标是安装
当前 9 个长期 Skill，同时保留旧配置、邮件去重状态、已有 Base、知识库文档和回滚入口。

迁移遵循四条边界：

1. 不先删除旧 Skill；
2. 不把密码、App Secret、Cookie、token 或邮箱授权码复制到 Chat；
3. 本地安装与飞书接管分开执行；
4. 未经用户确认，不创建、复制、迁移或删除线上资源。

## 1. 双 Skill 用户的最短迁移路径

把最新公开版本下载到新目录，保留原下载目录：

```bash
git clone https://github.com/riwonswain-ovo/OfferLoop.git OfferLoop-latest
cd OfferLoop-latest
```

以 Codex 为例，先预演：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
```

旧 `job-collection` 或 `recruiting-reminder` 与新版本内容不同时，预演会返回 `conflict`。这是一道
防覆盖保护，不是安装故障。确认同名目录属于旧版 OfferLoop 后，才执行：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --upgrade
python3 scripts/install_offerloop.py --agent codex --verify
```

安装器会先把旧目录移出 Skill 发现范围，保存到 Agent 配置目录下的
`.offerloop-backups/<时间戳>/`，再安装当前版本。安装后应看到以下 9 个长期 Skill：

- `career-profile`
- `job-collection`
- `recruiting-reminder`
- `experience-deepthink`
- `resume-tailor`
- `competency-lab`
- `interview-prep`
- `mock-lab`
- `talk-review`

Windows 将 `python3` 替换为 `py -3`。其他 Agent 将 `--agent codex` 替换为
`claude-code`、`hermes-agent` 或 `workbuddy`。

`scripts/install_offerloop.py --verify` 只核验本地 Skill 与安装清单。完整模式尚未接入飞书时，
`scripts/setup_offerloop.py --mode full --verify` 会显示 `needs_setup`；这不代表本地安装失败。

## 2. 迁移本地配置

安装器会备份整个旧 Skill 目录，但凭证和运行状态应复制到更新安全的位置，以免以后升级 Skill 时
被替换。文件不存在时跳过；确认新位置可读前不要删除旧文件。

```text
旧 job-collection/.env
  → ~/.config/offerloop/job-collection/.env

旧 recruiting-reminder/scripts/.env
  → ~/.config/offerloop/recruiting-reminder/.env

旧 recruiting-reminder/base_config.json
  → ~/.config/offerloop/recruiting-reminder/base_config.json

旧 recruiting-reminder/processed_emails.json
  → ~/.local/state/offerloop/recruiting-reminder/processed_emails.json
```

macOS 和 Linux 上把新配置文件权限设为 `0600`。不要迁移旧 token 缓存；需要时由当前 Skill 重新
获取。不要在终端录屏、Issue、PR 或聊天中展示配置内容。

## 3. 只保留一个 Skill

只想继续使用一个旧 Skill 的用户可以选择单 Skill 模式。例如只升级 `job-collection`：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode single --skill job-collection --dry-run
python3 scripts/setup_offerloop.py --agent codex --mode single --skill job-collection --upgrade
python3 scripts/setup_offerloop.py --agent codex --mode single --skill job-collection --verify
```

单 Skill 模式不会要求创建完整飞书空间。已有 Base 和用户配置仍会保留，只有当前任务确实需要且
用户完成授权时才继续使用。

## 4. 旧双 Base 兼容

旧版 `recruiting-reminder` 可能分别使用笔试 Base 和面试 Base。只要共享配置中尚未设置
`reminder_base_url`，新 Skill 会读取迁移后的 `base_config.json` 继续使用旧入口，不会静默新建
统一 Base，也不会改写旧字段。

旧 UID 去重状态继续兼容；新邮件优先使用 Message-ID。迁移后发现改期邮件时，如果来源链无法定位
原事件，应交给用户确认，不能按公司和轮次猜测。

## 5. 按需接入完整飞书空间

安装 9 个 Skill 不会自动迁移飞书资源。用户选择接入时，Agent 应按以下顺序执行：

1. 只读检查企业清单、旧笔试 Base、旧面试 Base 和现有知识库文档；
2. 展示准备复用、补充或创建的资源计划；
3. 等待用户确认；
4. 对原 Base 建立并验证备份；
5. 原地升级为三张业务 Base，不复制记录或另建同名 Base；
6. 以企业 record ID 和来源邮件 ID 幂等迁移历史记录；
7. 按 schema v6 验证 `进展状态`、`最近完成节点`、`公告链接`，并确认旧状态字段已移除；
8. 小流量验证同公司多岗位、人工字段保护、改期、日历更新和重复事件；
9. 验收通过后才切换日常写入。

完成真实线上只读验收后运行：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --record-workspace-verified
python3 scripts/setup_offerloop.py --agent codex --mode full --verify
```

任何 Base、知识库节点或 locator 变化都会使验收记录失效，必须重新只读核验。历史已投递记录无法
可靠恢复投递日期时保持空白；轮次不明的旧面试不猜测为一面或二面。

## 6. Schema v6 状态模型

- `进展状态` 是当前求职状态唯一真源。
- 已完成迁移的求职进展不再保留旧状态字段；所有客户端、同步服务和视图只读写 schema v6 字段。
- 简历选择不写入业务 Base；旧的空字段可以在确认无有效数据后删除。
- 旧 `resume-deepthink` 更名为 `experience-deepthink`；安装器会备份旧目录，不删除线上文档。
- 旧 `pm-sense` 和 `aptitude-lab` 的训练能力由 `competency-lab` 承接。
- 不再安装的旧 Skill 不会导致其线上文档被删除；用户可自行保留或归档。

旧配置需要升级到 schema v6 时，不要手工修改 `schema_version`。由 Agent 在用户确认后运行共享配置
迁移，再完成真实 Base 结构验证：

```bash
python3 skills/offerloop-workspace/scripts/artifact_contract.py \
  migrate-config \
  --config ~/.config/offerloop/config.json \
  --confirmed
```

该命令只迁移本机非敏感定位配置，不创建、移动或删除飞书节点。

## 7. 回滚

新版本不可用时：

1. 暂停新的跨 Base 自动化；
2. 找到安装命令输出的 `.offerloop-backups/<时间戳>/`；
3. 结束当前 Agent 会话，避免新旧 Skill 同时被发现；
4. 将当前 Skill 目录移出发现范围，再把所需旧目录恢复到原位置；
5. 将共享配置切回旧 URL，或移除尚未验收的 `reminder_base_url`；
6. 继续使用旧 `base_config.json`、旧双 Base 和旧邮件去重状态；
7. 保留新资源供排查，不删除其中数据。

是否清理旧备份由用户以后单独决定，OfferLoop 不自动删除。

## 8. 可直接发给 Agent 的迁移引导

```text
我以前只安装过 job-collection 和 recruiting-reminder，
现在要迁移到 OfferLoop 的 9 个 Skill。

请先只读检查旧 Skill、用户配置和已有飞书 Base，不要读取或输出任何凭证。
告诉我哪些目录会备份、哪些配置和 Base 会复用；先运行完整模式 dry-run。
只有我确认旧目录属于 OfferLoop 后，才能使用 --upgrade。
本地验证通过后，再问我是否接入配套飞书知识库；未经确认不要创建或修改线上资源。
```
