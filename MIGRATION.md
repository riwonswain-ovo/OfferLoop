# OfferLoop 7-Skill 迁移与回滚

本次升级将 OfferLoop 从 9 个业务 Skill 收敛为 7 个。`career-profile` 与 `competency-lab` 停止
安装、发现、调用和新数据写入；历史画像、岗位能力文档、`ability_observations` 与相关任务不删除，
只作为遗留数据保留。

## 1. 升级前创建定向快照

先由 Agent 只读获取 Base「用户偏好」的唯一记录，以及知识库根目录、现有活动目录和两个退役
目录的 token、标题、父节点。把以下 JSON 通过 stdin 传给 setup。不要把凭证写入 JSON：

```bash
python3 scripts/setup_offerloop.py --agent codex \
  --create-retirement-snapshot --input -
```

```json
{
  "base_preference": {
    "base_url": "https://example.feishu.cn/base/…",
    "table_id": "tbl…",
    "record_id": "rec…",
    "fields": {"目标岗位": ["产品经理"]}
  },
  "workspace_directories": {
    "root_token": "wik…",
    "nodes": [
      {"token": "wik-profile", "title": "02｜用户画像", "parent_token": "wik…"},
      {"token": "wik-resume", "title": "03｜定制简历", "parent_token": "wik…"}
    ]
  }
}
```

快照保存到 `${XDG_STATE_HOME:-~/.local/state}/offerloop/retirement-backups/<snapshot-id>/`，目录权限
`0700`、文件权限 `0600`，包含已安装 Skill、共享运行时、安装清单、本地配置、Loop 状态及 Base
偏好记录和知识库目录状态，不进入 Git。输出中的 `snapshot_id` 是后续回滚凭据。输入中的
`nodes` 必须覆盖本次将移动或改名的全部目录，不能只提供示例里的两个节点。

## 2. 升级到 7 个 Skill

先预演，再升级：

```bash
python3 scripts/setup_offerloop.py --agent codex --mode full --dry-run
python3 scripts/setup_offerloop.py --agent codex --mode full --upgrade
python3 scripts/setup_offerloop.py --agent codex --mode full --verify
```

安装后长期 Skill 为：

- `job-collection`
- `recruiting-reminder`
- `experience-deepthink`
- `resume-tailor`
- `interview-prep`
- `mock-lab`
- `talk-review`

安装器还会把两个退役 Skill 移到 Agent Skill 根目录下的 `.offerloop-backups/<时间戳>/`。这一步
只处理本地 Skill，不会直接修改飞书。

新工作区创建连续的活动目录 `00`–`06`，没有历史内容时不创建归档目录。升级工作区先用快照中
同一份目录元数据生成只读迁移计划：

```bash
python3 runtime/offerloop/workspace/scripts/artifact_contract.py \
  plan-directory-migration --nodes workspace-directories.json --json
```

计划的顺序固定为：创建 `99｜历史归档`（已有则复用）→ 把旧 `02｜用户画像`、
`05｜岗位能力与训练` 原节点移入归档并去掉编号 → 把其余原节点改名为连续的 `02`–`06`。规划器
本身永不写飞书；`conflict` 或 `needs_action` 时停止。只有 `needs_migration` 且用户确认后，Agent
才能按返回顺序逐项写入，每项都回读 token、标题和父节点。文档不复制、不删除。

## 3. 岗位偏好迁移

完整模式以 Base「用户偏好」为唯一真源。Agent 使用
`skills/job-collection/scripts/preference_migration.py --input -` 比较旧画像偏好和 Base 记录：

- 双方一致：直接确认 Base；
- Base 有值、画像为空：保留 Base；
- Base 为空、画像有值：展示拟迁入值，用户确认后写入并回读；
- 双方冲突：暂停，展示冲突字段并让用户选择，禁止静默覆盖；
- 双方都缺失：只询问本次筛选必需条件。

旧版 `single` 安装不再作为受支持的运行模式。升级时安装全部 7 个 Skill，并完成三张 Base、私有
知识库、schema v7 locator 与权限验收；历史单 Skill 配置只用于识别迁移来源，不继续提供独立入口。
语言表达不再形成长期画像；自我评价从用户选定的简历、经历和本轮确认生成。

## 4. 配置与历史数据

本地工作区配置升级到 schema v7。`user_profile`、`competency_profiles`、
`competency_training` 仅作为兼容键保留，不参与 readiness。三张业务 Base 的求职进展字段仍使用
schema v6，两者不要混淆。

Loop Runtime 不再创建 `AbilityObservation`、训练任务或能力成长 workflow。旧 Loop 状态中的
`ability_observations` 与相关 `tasks` 原样保留，载入和持久化不得改变其字节语义。面试准备、简历
与复盘文档继续正常产生；表达与承压练习统一由 `mock-lab` 承接。

## 5. 回滚

先只读预演并校验摘要：

```bash
python3 scripts/setup_offerloop.py --agent codex \
  --rollback-snapshot <snapshot-id> --dry-run
```

确认恢复范围后执行本地原子恢复：

```bash
python3 scripts/setup_offerloop.py --agent codex \
  --rollback-snapshot <snapshot-id> --confirmed
```

confirmed 会恢复快照中的 9-Skill 组件组合、旧共享运行时、本地配置和 Loop 状态，并输出
`base_restore_patch` 与 `workspace_directory_restore_state`。两者都不会自动写入飞书；必须由 Agent
再次征得用户确认，分别恢复 Base 偏好和知识库目录后回读验证。若本地恢复中任一步失败，setup
会恢复执行回滚前的 7-Skill 组合，禁止留下新旧混装状态。线上目录迁移中途失败时也必须停止，
以快照目录状态生成反向操作，经用户确认后恢复，不得继续执行剩余改名。

重复回滚是幂等的。回滚不会删除下线后产生的简历、面试准备或复盘文档，也不会删除任何历史
画像、能力文档或观察记录。目录回滚只恢复原父节点和标题；`99｜历史归档` 若还包含其他内容则
保留。是否清理本地快照与普通 `.offerloop-backups` 由用户以后单独决定。

## 6. 旧双 Skill 用户

早期只安装 `job-collection`、`recruiting-reminder` 的用户同样使用上述升级命令。旧配置、邮件去重
状态、三张 Base 与知识库文档均原地保留；`scripts/install_offerloop.py --agent codex --verify`
只验证本地安装，完整模式还需真实线上只读验收。Windows 将 `python3` 替换为 `py -3`，其他 Agent
将 `codex` 替换为 `claude-code`、`hermes-agent` 或 `workbuddy`。

求职进展继续遵循 Schema v6 状态模型：`进展状态` 是当前状态唯一真源，`最近完成节点` 只记录
已经可靠完成的最晚节点。线上 Base 迁移始终先备份、经确认写入并回读，不可靠的旧记录进入
“状态待确认”。
