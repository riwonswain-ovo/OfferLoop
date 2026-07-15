# 从独立仓库迁移到 OfferLoop

新用户直接安装 OfferLoop，不需要阅读本页。

已有 `job-collection` 或 `recruiting-reminder` 用户，建议先备份运行配置，再安装新仓库。不要把凭证内容复制到聊天中。

## 1. 迁移 Recruiting Reminder 本地配置

先确认旧 Skill 的实际安装目录。以 Codex 为例：

```bash
mkdir -p ~/.config/offerloop/recruiting-reminder
mkdir -p ~/.local/state/offerloop/recruiting-reminder

cp ~/.codex/skills/recruiting-reminder/scripts/.env \
  ~/.config/offerloop/recruiting-reminder/.env

cp ~/.codex/skills/recruiting-reminder/base_config.json \
  ~/.config/offerloop/recruiting-reminder/base_config.json

cp ~/.codex/skills/recruiting-reminder/processed_emails.json \
  ~/.local/state/offerloop/recruiting-reminder/processed_emails.json

chmod 600 ~/.config/offerloop/recruiting-reminder/.env
chmod 600 ~/.config/offerloop/recruiting-reminder/base_config.json
chmod 600 ~/.local/state/offerloop/recruiting-reminder/processed_emails.json
```

文件不存在时跳过对应复制。Claude Code 或其他 Agent 用户应替换旧 Skill 路径。

## 2. 安装 OfferLoop

```bash
npx skills add riwonswain-ovo/OfferLoop -g
```

安装后应能发现：

- `offerloop-setup`
- `job-collection`
- `recruiting-reminder`

## 3. 运行检查

告诉 Agent：

```text
请调用 offerloop-setup，检查我从旧版迁移后的配置。不要读取邮件正文或写入飞书，只做本地预检。
```

确认新版本可以读取配置、飞书 profile 正确后，再运行一次小范围邮件扫描或招聘信息同步。

## 4. 旧仓库处理

验证成功前不要删除旧配置备份。两个旧 GitHub 仓库会暂时保留，方便已有链接继续访问，但新功能只在 OfferLoop 中维护。
