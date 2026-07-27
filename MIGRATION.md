# OfferLoop 迁移与回滚

新用户直接从 `offerloop-setup` 开始。已有独立版 `job-collection` 或
`recruiting-reminder` 用户先备份配置和旧 Base，不要把凭证内容复制到聊天。

## 1. 迁移本地配置

将旧 Skill 目录中的文件复制到更新安全的位置：

```text
旧 recruiting-reminder/scripts/.env
  → ~/.config/offerloop/recruiting-reminder/.env

旧 recruiting-reminder/base_config.json
  → ~/.config/offerloop/recruiting-reminder/base_config.json

旧 recruiting-reminder/processed_emails.json
  → ~/.local/state/offerloop/recruiting-reminder/processed_emails.json
```

文件不存在时跳过。新文件权限设置为 `0600`；确认新位置可读前不要删除旧文件。

## 2. 安装九个 Skill

```bash
npx skills add riwonswain-ovo/OfferLoop -g
```

应能发现：

- `offerloop-setup`
- `job-collection`
- `recruiting-reminder`
- `offerloop-workspace`
- `resume-deepthink`
- `interview-prep`
- `mock-lab`
- `talk-review`
- `pm-sense`

先运行本地预检；预检不读邮件正文、不访问业务 Base。

从 `0.1.0-alpha.6` 起不再安装 `interview-question-bank` 和 `knowledge-digest`。升级不会删除
用户飞书中的既有题库、知识摘要文档、知识速览 Base 或旧配置键；这些资源只是不再由当前
OfferLoop 管理，可由用户自行保留或另行归档。

## 3. 旧双 Base 兼容

旧版 `recruiting-reminder` 分别使用笔试 Base 和面试 Base。只要共享配置中尚未设置
`reminder_base_url`，新 Skill 会读取旧 `base_config.json` 按兼容模式继续工作，不会静默
新建统一 Base，也不会改写旧字段。

旧 UID 去重状态继续兼容；新邮件优先使用 Message-ID。迁移后发现改期邮件时，来源链找不到
原事件就交用户确认，不按公司+轮次猜测。

## 4. 完整工作区迁移

完整迁移是显式操作，不随 Skill 安装自动发生：

1. 对企业清单、旧笔试 Base、旧面试 Base 建立并验证备份。
2. 创建独立求职进展、统一笔面试中心和私有 `OfferLoop 求职空间`。
3. 将三个业务 Base URL、知识库 ID 和首页节点写入共享公共配置。
4. 迁移历史记录，以企业 record ID 和来源邮件 ID 幂等去重。
5. 小流量验证即时进展同步、人工字段保护、同公司多岗位、改期和日历更新。
6. 验收通过后才切换日常写入；旧双 Base 和旧配置永久保留为回滚入口。

历史已投递记录无法可靠恢复投递日期时保持空白，不使用迁移日期冒充。轮次不明的旧面试
只进入统一主表，不猜一面或二面。

## 5. 按需启用求职训练

旧用户的 schema v2 配置和既有能力继续有效。只有用户明确要求启用 `coaching` 时，才运行：

```bash
python3 skills/offerloop-setup/scripts/configure.py \
  --enable-coaching --confirm-schema-v4
```

该操作保留全部既有公共配置和兼容 locator，迁移 `artifact_storage` 并升级为 schema v4；
不创建或移动飞书节点。当前简历、训练目录和 ASR 目录在对应 Skill 首次运行时经确认
懒创建或登记。
拒绝升级不影响招聘同步、提醒和原有工作区。

## 6. 回滚

新结构不可用时：

1. 暂停新的跨 Base 自动化；
2. 将共享配置切回旧 URL 或移除 `reminder_base_url`；
3. 继续使用旧 `base_config.json` 和旧 Base；
4. 保留新资源供排查，不删除或覆盖其中数据。

迁移前备份、旧双 Base 和知识库中的 `旧版备份` 节点永久保留，是否清理由用户以后单独
决定，OfferLoop 不自动删除。
