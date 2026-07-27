# OfferLoop 飞书材料与产物契约

## 职责边界

`scripts/artifact_contract.py` 只处理本地确定性逻辑：

- schema v3 到 v4 的配置迁移；
- 固定文件夹 locator 的校验、登记与解析；
- `run_id`、标题、状态路由和 Markdown 校验；
- 从 Agent 已读取的候选节点中按 `run_id` 判断唯一、缺失或冲突。

脚本不访问飞书。Agent 必须先读取 `lark-wiki`、`lark-doc`；只有对应业务流程明确要求或用户
另行要求 Base 操作时才读取 `lark-base`。完成节点查询和文档读写后，按各 Skill 的明确规则
决定是否回填 Base。线上操作成功后，才登记返回的 locator。不得把飞书 token、简历正文或
ASR 正文打印到日志。

## 固定材料

知识库中的个人材料只保留 `02｜当前简历`。文件夹可包含多个当前仍在使用的简历版本，但不建立
历史简历或其他个人材料目录。

每份简历的飞书文档标题就是唯一“简历版本名”，例如：

```text
互联网产品经理岗 - 简历
AI 产品经理岗 - 简历
```

`求职进展` 和 `笔面试中心` 的 `投递简历版本` SingleSelect 选项必须使用完全相同的名称。用户
维护这些选项和记录值；`job-collection`、`recruiting-reminder` 不读取知识库，也不自动同步
选项。消费方按标题精确匹配：

- 唯一命中：读取该简历。
- 零命中：报告缺失并让用户修正选项或简历标题。
- 多个同名节点：停止并让用户选择；不得取“最新”或第一份。

旧简历需要退出当前使用范围时，必须由用户明确指定保留位置或确认删除；OfferLoop 不创建历史
简历或归档目录，也不让退出使用范围的简历参与任何 Skill 的默认读取。

## 固定线上目录

```text
02｜当前简历
03｜经历深挖
04｜面试准备
05｜面试复盘 / ASR 待复盘、已完成复盘
06｜产品 Sense
07｜模拟面试
```

## 固定 locator

schema v4 只登记以下文件夹：

```text
current_resumes
resume_deepthink  # 兼容既有 schema v4 的内部键，对应“03｜经历深挖”
pm_sense
interview_prep
mock_lab
interview_asr
interview_review
```

线上创建或确认唯一节点后，分别使用：

```text
python3 scripts/artifact_contract.py describe-layout --json

python3 scripts/artifact_contract.py register-folder \
  --kind current_resumes --node-token '<NODE_TOKEN>'

```

`describe-layout` 是目录名称与 locator 的唯一机器可读映射；线上查找时必须使用该映射，不得从
旧目录名称推断。不得在日志或最终回复中重复 node token。发现多个同名节点时让用户选择，不
登记猜测结果。

## 每次产物

适用于 `experience-deepthink`、`pm-sense`、`interview-prep`、`mock-lab` 和 `talk-review`。
`interview-prep` 先在聊天中交付完整初稿；只有用户明确确认当前版本并要求保存后，才进入以下
正式产物流程：

1. 用 `new-run --skill <name>` 生成 `run_id`，并在会话内保留。
2. 用 `route-folder` 获得目标目录键，再用 `resolve-folder` 获得 locator。
3. 用 `build-title` 生成确定性标题。`experience-deepthink` 必须传经历名称和完整岗位方向，
   标题固定为 `经历深挖｜<经历名称>｜<完整岗位方向>`，不包含日期或 `run_id`。
4. `experience-deepthink` 通过 `lark-wiki` 列出目标目录下候选节点，把最小候选数组交给
   `find-by-title`；其他 Skill 继续使用 `find-by-run`。候选只包含 `title`、`node_token`
   和可选 `url`。
5. `found` 时更新原节点；`missing` 时创建；`ambiguous` 时停止并让用户选择。
6. 将最终 Markdown 交给 `validate-markdown --file - --run-id ...`；
   `experience-deepthink` 改用 `validate-markdown --file - --run-id ... --content-only`。
7. 通过 `lark-doc` 写入 Markdown Docx/Wiki 节点。

成功响应丢失时沿用原 `run_id` 重试。成功完成一次运行后，新运行必须生成新 `run_id`。
`experience-deepthink` 的新 `run_id` 只在会话内用于幂等和失败重试，不写入正文、不改变标题，
也不创建第二份正式文档。

## Markdown 最低结构

```markdown
# <确定性标题>

## 产物信息

- 产物类型：
- 状态：completed / incomplete
- 生成时间：
- run_id：
- 生成 Skill：
- 来源及读取时间：
- 关联简历版本：
- 目标投递方向：
- 关联求职记录：
- 关联面试事件：

## 正文
```

不同 Skill 可将不适用字段留空，但不得省略 `run_id`、来源和目标方向。经历未从简历读取时，
`关联简历版本` 写“无”。明确区分已确认事实、待确认信息、外部证据和推断。不得输出 HTML、
图片发布物或 ZIP。

`experience-deepthink` 是 content-only 例外：正文严格使用其 `output-schema.md`，不包含
“产物信息”或 `run_id`；运行元数据只保留在会话执行上下文中。

## 产物读取规则

- `experience-deepthink`：必须先接收用户在 Chat 中直接输入的经历和目标岗位方向，不主动读取
  当前简历。首次输入完成后，经历名称和完整岗位方向一致时，读取并更新同一份经历深挖文档；
  岗位方向不同才创建独立文档。发现旧版“简历深挖”候选时可以迁移唯一匹配文档；多个候选时
  让用户选择，不自动合并或删除。
- `pm-sense`：默认不读取简历或其他知识库正文；用户要求延续同一训练时才读取指定训练文档。
- `interview-prep`：以用户本次明确提供的公司、岗位、JD 和轮次为目标事实源。个人材料使用
  用户手动指定的 `experience-deepthink` 产物（飞书候选须先列出并让用户选择）或用户上传的
  简历；上一轮准备文档只在用户手动指定后读取。聊天交付不要求任何 locator；用户确认保存时
  只要求 `interview_prep` locator，若用户选择从飞书读取经历深挖则另需
  `resume_deepthink` locator。
- `mock-lab`：读取用户选定的简历，并按本次岗位方向和简历中可见经历选择相关经历深挖文档；
  JD 有则读取，无则按用户确认的方向进行。
- `talk-review`：读取用户选定的 ASR、简历，并按实际面试岗位方向和转写中涉及的经历选择相关
  经历深挖文档。

每个消费方先读节点标题和产物信息，再读取匹配正文；`experience-deepthink` 没有产物信息，
只按稳定标题和正文结构判断。不得默认扫描无关目录。

## 迁移

schema v3 升级到 v4 时：

- 保留当前简历、旧简历深挖目录、产品思维和模拟面试 locator；内部兼容键
  `resume_deepthink` 继续指向原节点，不自动移动或重命名线上目录。
- 将旧“准备完成/待准备”目录优先映射到 `04｜面试准备`。
- 将旧“待复盘”映射为 `05｜面试复盘/ASR 待复盘`，将旧“已完成复盘”映射为
  `05｜面试复盘/已完成复盘`。
- 已登记的旧目录 locator 继续有效，不自动移动或重命名线上节点。
- 不登记旧经历主档、产品主档、历史简历、其他材料或旧通用题库 locator。
- 不删除或移动任何线上旧节点；需要归档时另行列出并取得用户确认。
