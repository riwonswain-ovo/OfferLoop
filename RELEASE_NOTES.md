# OfferLoop 0.1.0-alpha.11

发布日期：2026-08-13

本版本补齐早期 `job-collection`、`recruiting-reminder` 用户迁移到当前 9 个 Skill 的正式引导，并让 GitHub Release 源码包包含最新迁移文档。运行逻辑与 schema v6 数据契约没有变化。

## 迁移引导

- README 新增旧双 Skill 用户的醒目升级入口。
- 明确先保留旧目录、执行 `--dry-run`，确认后再使用 `--upgrade`。
- 说明 `conflict` 是防覆盖保护，旧 Skill 会备份到 `.offerloop-backups/<时间戳>/`。
- 区分本地 9 个 Skill 安装验证与可选飞书空间接入；`needs_setup` 不代表本地安装失败。
- `MIGRATION.md` 补充旧配置、邮件去重状态、旧双 Base、schema v6、飞书按需接入和回滚步骤。

## 兼容性

- 继续沿用 alpha.10 的 schema v6、9 个 Skill 和三张业务 Base 契约。
- 安装和升级保持幂等，不自动覆盖旧 Skill，不复制已有 Base 或知识库内容。
- 配套飞书知识库仍为可选项，不影响本地完整安装或单 Skill 安装。
- 不要求旧用户删除现有配置、邮件状态或线上资源。

## 发布验证

- README 安装与迁移契约通过。
- Python 全量 168 项测试通过。
- GitHub Actions 将在 Ubuntu、macOS 和 Windows 上执行冷安装检查。
- Python 3.10、3.12 与两个配套模板构建均纳入必需检查。

## 升级建议

早期双 Skill 用户请从 README 的“旧版用户”入口开始；新用户继续选择“完整安装”或“单 Skill 安装”。本版本不要求重新迁移已经通过 alpha.10 验收的 schema v6 Base。
