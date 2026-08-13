# OfferLoop 0.1.0-alpha.9

发布日期：2026-08-13

本版本把 OfferLoop 的公开安装入口收敛为“完整安装 9 个求职 Skill”与“只安装单个 Skill”两种方式，并支持用户按需接入配套飞书知识库。

## 新增

- 新增统一安装入口 `scripts/setup_offerloop.py`。
- 支持完整模式：一次安装 9 个 Skill，并在用户授权后接入三张业务 Base 和私有知识库。
- 支持单 Skill 模式：只安装指定 Skill，不要求初始化整套飞书空间。
- 新增可恢复的安装模式、工作区配置和真实在线验收状态记录。
- 为 9 个 Skill 补齐完整模式与单 Skill 模式的运行契约。

## 安装

完整安装：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full
```

只安装一个 Skill：

```bash
python3 scripts/setup_offerloop.py \
  --agent codex \
  --mode single \
  --skill resume-tailor
```

完整命令、支持的 Agent、9 个 Skill 清单和飞书初始化边界见 `README.md`。

## 兼容性与迁移

- 旧版 `scripts/install_offerloop.py` 仍可管理本地 Skill，但不再代表飞书工作区已经完成初始化。
- 已有用户升级时保留本地用户文件、三张 Base、知识库内容和非敏感 locator。
- 配套飞书知识库属于可选线上配置，下载和本地安装不会自动创建飞书资源。
- 单 Skill 模式跳过全局画像门禁，默认在 Chat 中完成当前能力的交付。

## 验证

- GitHub Actions 在 Ubuntu、macOS、Windows 上完成冷安装与幂等性检查。
- Python 3.10 和 3.12 测试通过。
- 9 个 Skill 均完成独立安装和验证覆盖。
- Loop Runtime 31 项测试通过，配套模板构建与基线测试通过。

## 验收说明

本次发布没有独立的新飞书账号可用于真实线上冷启动，因此该项由仓库所有者明确豁免，并未标记为“通过”。账号盘点过程中只执行了只读检查，没有创建或修改任何飞书资源。线上首次安装仍应遵循 README 的授权、幂等检查和只读验收流程。
