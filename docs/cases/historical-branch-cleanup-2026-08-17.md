# OfferLoop 历史分支审计与清理

日期：2026-08-17。基线：`main` 的线上冒烟验收提交 `da5dd62`。审计覆盖清理前全部 30 个
非 `main` 本地分支及 `origin` 的 16 个非 `main` 远端分支。

## 恢复保障

删除前已创建并验证完整 Git bundle：

`work/branch-archives/offerloop-branches-before-cleanup-20260817.bundle`

bundle 大小约 6 MiB，包含清理前全部 31 个本地分支引用及完整历史；`work/` 已由 `.gitignore`
排除，不会进入公开提交。需要恢复时可从 bundle 查看或重新拉取任意已删除分支。

## 审计结论

### 已拓扑合并到 main：删除

| 分支 | 清理前 tip |
| --- | --- |
| `codex/add-resume-tailor` | `12e354f` |
| `codex/backup-before-progress-schema-v6-cutover-20260817` | `90ab495` |
| `codex/backup-before-reminder-sync-20260816` | `901a850` |
| `codex/backup-before-workbench-retirement-20260817` | `87a2670` |
| `codex/fix-workbench-ci` | `2ad103d` |
| `codex/progress-schema-v6-cutover` | `87a2670` |
| `codex/reminder-single-table-main-integration` | `90ab495` |
| `codex/retire-legacy-workbench` | `4e53dd7` |

### 补丁已等价进入 main：删除

这些分支不是 `main` 的拓扑祖先，但 `git cherry main <branch>` 没有返回仍需应用的非合并补丁。

| 分支 | 清理前 tip |
| --- | --- |
| `agent/pm-sense-single-user` | `ebddaa8` |
| `codex/experience-deepthink-redesign` | `65f6740` |
| `codex/interview-prep-knowledge` | `d8ea5d6` |
| `codex/interview-prep-rework` | `a4008f7` |
| `codex/new-user-onboarding` | `4cab563` |
| `codex/onboarding-contract` | `0b0e514` |
| `codex/preflight-dependency-recovery` | `6df52f9` |
| `codex/refactor-mock-lab-product-playbook` | `10a1b10` |
| `codex/release-0.1.0-alpha.9` | `2514855` |
| `codex/resume-deepthink-project-probing` | `1559537` |
| `codex/setup-modes` | `360302d` |
| `codex/sync-job-collection-mcp-dev` | `0faf91e` |

### 已被现行架构覆盖或进入 public/main：删除

| 分支 | 清理前 tip | 结论 |
| --- | --- | --- |
| `agent/offerloop-agent-split` | `40bb000` | 依赖已退役工作台和 OfferLoop Agent add-on |
| `codex/multi-agent-openclaw` | `1af7cd6` | 旧版多 Agent 安装实现，已被当前九 Skill 安装器覆盖 |
| `codex/offerloop` | `1e70f63` | 旧版 Skill/工作台重构，已被当前架构继续演进 |
| `codex/offerloop-agent-split-clean` | `570b1b7` | 依赖已退役工作台 Agent Chat |
| `codex/public-0.1.0-alpha.9` | `7304e01` | 已是 `public/main` 的祖先 |
| `codex/reminder-progress-reconcile-v2` | `653886b` | 功能已进入当前提醒实现；分支仅残留已移除的 schema v5 字段差异 |
| `codex/sync-job-collection-mcp-public` | `078c0ab` | 补丁已等价进入 `public/main` |
| `codex/talk-review-dual-review` | `84e7abc` | 旧 coaching/pm-sense 结构，已被当前五项求职辅导 Skill 覆盖 |
| `codex/yuan'xing` | `7eec455` | 旧私测安装流程，已被当前 full/single 安装合同覆盖 |

### 暂时保留

| 分支 | 清理前 tip | 原因 |
| --- | --- | --- |
| `codex/fix-public-main-ci-20260731` | `991b970` | 仍有 2 个补丁未进入 `public/main`，应在下一次公开仓库同步时单独决策 |

## 清理边界

- 删除上述 29 个本地历史分支。
- 删除 `origin` 上除 `main` 外的 16 个已审计历史分支。
- 保留 `main` 和 `codex/fix-public-main-ci-20260731`。
- 不合并任何旧分支，不改写提交历史，不修改 `public/main`，不创建发布。
