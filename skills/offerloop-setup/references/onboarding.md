# OfferLoop 管理能力接入（安装器内部）

OfferLoop 支持完整模式和单 Skill 模式。初始化、升级和验证由仓库中的
`scripts/setup_offerloop.py` 与安装目录中的 `.offerloop-runtime` 承担。系统不再要求用户调用一次性 Skill。
完整模式安装 9 个长期用户 Skill、三张 Base 和私有知识库。

## 安装命令

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full
python3 scripts/setup_offerloop.py --agent codex --mode full --upgrade
python3 scripts/setup_offerloop.py --agent codex --mode full --verify
```

旧版 `python3 scripts/install_offerloop.py --agent codex --setup`、`--upgrade` 和 `--verify` 仍可
管理本地 Skill，但不代表飞书工作区已完成。

重复执行必须幂等：保留原三张 Base 的 token、记录、知识库文档和用户配置，不创建重复节点。

## 用户画像首次使用门禁

完整模式初始化只负责创建或接管 `02｜用户画像` 目录，不用空模板替用户编造画像。初始化完成后，
8 个业务 Skill 先检查画像文档：缺失、空白或只有占位字段时暂停原 Skill，转由
`career-profile` 在 Chat 中一次只问一个问题，并在每条确认信息后自动保存。单 Skill 模式跳过
全局画像门禁，默认只在 Chat 中交付。

## 飞书身份与权限

- Base 的确定性同步通常使用 bot 身份。
- 用户自己的知识库、文档和日历使用 user 身份。
- 密钥、Cookie、token 和邮箱授权码不得进入聊天、Git、飞书文档或 Base。

## 固定知识库

初始化必须创建或接管以下结构，不得复制三张业务 Base：

```text
00｜OfferLoop 使用指南
01｜核心求职数据 / 企业清单、求职进展、笔面试中心
02｜用户画像
03｜定制简历
04｜经历深挖
05｜岗位能力与训练 / 岗位能力画像、专项训练
06｜面试准备
07｜模拟面试
08｜真实面试复盘 / ASR 待复盘、已完成复盘
```

飞书不支持直接把原 Base 移入知识库时，创建指向原对象的知识库快捷节点；不得复制 Base 或记录。

## 三条闭环

- 招聘机会闭环：硬条件过滤，岗位软偏离先确认。
- 求职进展闭环：邀请与完成分离，状态不得因重复或乱序事件倒退。
- 能力成长闭环：面试产出待验证观察，能力训练读取未解决观察并产生复测项。

生成式任务通过原生 Agent 会话进入。
