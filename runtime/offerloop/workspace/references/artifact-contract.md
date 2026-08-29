# OfferLoop 飞书材料与产物契约

## 职责

`scripts/artifact_contract.py` 只处理确定性本地逻辑：schema v7 迁移、固定目录定位、`run_id`、标题、状态路由和 Markdown 校验。它不访问飞书，也不保存凭证或私人正文。

在线读取和写入由 Agent 按 `lark-wiki`、`lark-doc`、`lark-base` 的规则完成。OfferLoop 私有空间内的唯一匹配材料可自动读取；零匹配、多匹配、冲突或空间外材料才询问用户。

## 安装模式

先执行 `installation-mode.md`。OfferLoop 只支持 `full` 飞书完整模式，使用下述目录、门禁和默认
自动保存规则；没有全局画像门禁，每个 Skill 只收集当前任务需要的最小信息。旧 `single` 配置必须
先完成完整模式迁移，不再作为 Chat-only 交付路径。

## 任务级上下文

全局画像门禁已经退役。Skill 只读取当前任务所需材料；`job-collection` 以 Base「用户偏好」为
完整模式唯一真源，`voice-contract.md` 只使用当前会话或用户主动提供的样本。旧
`profile-gate.md` 仅作无副作用兼容说明。

## 固定目录与 locator

```text
02｜定制简历                         current_resumes（根定位；按岗位路由到 01–08 子目录）
03｜经历深挖                         experience_deepthink（根定位）
03｜经历深挖/细节复原文档             细节复原稿固定子目录
03｜经历深挖/面试逐字文档             面试逐字稿固定子目录
04｜面试准备                         interview_prep
05｜模拟面试                         mock_lab
06｜真实面试复盘/ASR 待复盘           interview_asr
06｜真实面试复盘/已完成复盘           interview_review
99｜历史归档/用户画像                  旧内容，只读
99｜历史归档/岗位能力与训练            旧内容，只读
```

旧 `user_profile`、`competency_profiles`、`competency_training` 与 schema v4 的
`resume_deepthink`、`pm_sense` 等 locator 仅作兼容键保留。升级迁移仅在快照、预演和用户确认后
移动原节点并改名，不删除或复制线上文档。

## 标题标准

- `简历｜<目标岗位>｜<公司或通用>`；用户明确要求另建版本时追加 `｜v<版本>`
- `细节复原稿｜<经历>｜<岗位方向>`
- `面试逐字稿｜<经历>｜<岗位方向>`
- `面试准备｜<公司>｜<岗位>｜<环节>｜<日期>`
- `模拟面试｜<公司或方向>｜<岗位>｜<环节>｜<日期>｜<序号>`
- `面试ASR｜<公司>｜<岗位>｜<环节>｜<日期>`
- `面试复盘｜<公司>｜<岗位>｜<环节>｜<日期>`
- `招聘者评估｜<公司>｜<岗位>｜<环节>｜<日期>`

`run_id` 仅用于会话内幂等、失败补偿和内部元数据，不进入标题。

## 自动读取

每个 Skill 在 `SKILL.md` 中维护“场景—必读材料—缺失处理”表。开始实质工作前简短列出实际读取的材料：

- 唯一匹配：自动读取。
- 零匹配：说明缺失并请求最小补充。
- 多匹配：列出必要候选让用户选择。
- 冲突：展示冲突，不自行选择“最新”。
- 明确必读材料未读取：停止实质工作，不假装完成。

不建立哈希回执、机器可读 `required-context` 清单或复杂 completed 门禁。

## 自动保存

产出型 Skill（`experience-deepthink`、`resume-tailor`、`interview-prep`、`mock-lab`、
`talk-review`）在每次生成、补充或修订内容后默认自动保存到用户私有飞书知识库：

- 正常结束：`completed`。
- 用户暂停、时间到或提前结束：`incomplete`，正文保留已完成内容、缺口和续做清单。
- 唯一同名节点：更新。
- 零命中：创建。
- 多个同名节点：停止并让用户选择。
- 用户明确说“不保存”：本轮不写入飞书。
- 用户明确要求“另建文档记录本次更新”：创建独立版本，不覆盖主文档。
- 响应丢失：先按标题重新查找，再决定是否重试。

每次成功保存后返回“知识库面包屑路径 + 文档 URL”。保存失败时交付完整 Markdown 和原 `run_id`，不得声称已经写入。

## Markdown 最低结构

`experience-deepthink`、`interview-prep`、`mock-lab` 和 `talk-review` 使用各自固定的用户可见内容模板，并通过
`validate-markdown --content-only` 校验。`interview-prep` 正文不显示“产物信息”、生成状态、
生成 Skill、`run_id`、locator 或其他内部运行元数据；`mock-lab` 只移除“产物信息”目录，
其余既有正文目录和顺序保持不变；`talk-review` 的求职者复盘与招聘者评估都不设置“产物信息”
目录。

其余产物至少包含：

```markdown
# <标准标题>

## 产物信息
- 状态：completed / incomplete
- 生成 Skill：
- 来源：
- 目标岗位：

## 正文

## 待续做
```

正式正文不显示 `run_id`。运行时可将其作为文档属性或内部状态保存。
