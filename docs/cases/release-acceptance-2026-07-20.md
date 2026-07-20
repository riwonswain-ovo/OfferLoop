# OfferLoop 发布前验收记录（2026-07-20）

## 结论

本次本地、脱敏的发布前验收通过，可以作为 GitHub 发布候选版本。验收没有连接真实飞书、
IMAP 邮箱、日历或用户工作台，因此不能替代真实账号的在线验收。

## 边界与环境

- 执行方式：本地合成配置、临时目录和离线构建。
- 数据边界：没有使用真实 Base URL、邮件正文、密码、token、cookie 或 webhook secret。
- 运行时：Python 3.12、Node.js 24、npm 11；GitHub CI 固定使用 Python 3.10/3.12 和 Node.js 20。

## 已验证项目

| 范围 | 结果 | 验证证据 |
|---|---|---|
| 首次配置与预检 | 通过 | 空配置及未填写 IMAP 模板均返回 `needs_action`；完整合成配置返回 `ready`；私有配置权限为 `0600`，重复运行保持幂等。 |
| 企业清单到求职进展 | 通过 | 测试覆盖状态触发、手工字段保护、阶段单调推进和同步定位器配置。 |
| 邮件到笔面试中心 | 通过 | 测试覆盖轮次路由、同公司不同岗位、重复邮件、改期通知和忽略规则。 |
| 知识库入口 | 通过 | 首页模板为使用指南与导航，工作台为第一入口；首页不复制业务数据。 |
| 两份妙搭模板 | 通过 | 临时物化两次均保留绑定与私有文件；两份模板均完成 `npm ci --offline`、单测、类型检查和构建。 |
| 隐私与仓库边界 | 通过 | 已忽略本地应用产物与运行时目录；发布内容不包含用户配置或凭据。 |

## 自动化检查结果

| 命令或检查 | 结果 |
|---|---|
| `python3 -m unittest discover -s tests -v` | 56 passed |
| `python3 -m unittest discover -s skills/job-collection/tests -v` | 19 passed |
| `python3 -m unittest discover -s skills/recruiting-reminder/tests -v` | 16 passed |
| `npm --prefix services/job-progress-sync test` | 20 passed |
| `python3 skills/job-collection/scripts/validate_skill.py` | passed |
| 两份模板的安装、测试、类型检查与构建 | passed |
| `git diff --check` | passed |

## 仍待在线验收

以下项目刻意未在本次本地验收中执行，状态为 `unverified`，须由拥有相应权限的用户在执行前确认：

1. 真实飞书 Base 的 schema、记录读写和进展同步工作流；
2. 工作台 HTTPS 地址、妙搭运行时与即时同步 endpoint；
3. IMAP 连接、邮件读取和去重 checkpoint；
4. 个人日历 user 授权、忙闲查询和日程创建；
5. 知识库、工作台和三个 Base 的真实访问权限。

在线验收应从 [合成端到端验收用例](end-to-end-acceptance.md) 逐项开始：先 dry-run 或只读，
再分别确认 Base 写入与日历写入。任何失败都应记录补偿方案，不应通过重新初始化或删除已有数据
来处理。
