# OfferLoop 飞书材料与产物契约

## 职责边界

`scripts/artifact_contract.py` 只处理本地确定性逻辑：

- schema v3 到 v4 的配置迁移；
- 固定文件夹 locator 的校验、登记与解析；
- `run_id`、标题、状态路由和 Markdown 校验；
- 从 Agent 已读取的候选节点中按 `run_id` 判断唯一、缺失或冲突。

脚本不访问飞书。Agent 必须先读取 `lark-wiki`、`lark-doc` 和按需使用的
`lark-base` Skill，再完成节点查询、文档读写和 Base 回填。线上操作成功后，才登记返回的
locator。不得把飞书 token、简历正文或 ASR 正文打印到日志。

## 固定材料

知识库中的个人材料只保留 `01｜当前简历`。文件夹可包含多个当前仍在使用的简历版本，但不建立
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
01｜当前简历
02｜简历深挖
03｜面试准备文档
04｜面试复盘 / ASR待复盘、已完成复盘
05｜产品 Sense
06｜模拟面试
```

## 固定 locator

schema v4 只登记以下文件夹：

```text
current_resumes
resume_deepthink
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

适用于 `resume-deepthink`、`pm-sense`、`interview-prep`、`mock-lab` 和 `talk-review`：

1. 用 `new-run --skill <name>` 生成 `run_id`，并在会话内保留。
2. 用 `route-folder` 获得目标目录键，再用 `resolve-folder` 获得 locator。
3. 用 `build-title` 生成确定性标题；简历深挖必须传 `--resume-version`，确保标题包含对应简历
   版本。
4. 通过 `lark-wiki` 列出目标目录下候选节点，把最小候选数组交给 `find-by-run`。候选只包含
   `title`、`node_token` 和可选 `url`。
5. `found` 时更新原节点；`missing` 时创建；`ambiguous` 时停止并让用户选择。
6. 将最终 Markdown 交给 `validate-markdown --file - --run-id ...`。
7. 通过 `lark-doc` 写入 Markdown Docx/Wiki 节点。

成功响应丢失时沿用原 `run_id` 重试。成功完成一次运行后，新运行必须生成新 `run_id`。

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

不同 Skill 可将不适用字段留空，但不得省略 `run_id`、来源、关联简历版本和目标方向。明确区分
已确认事实、待确认信息、外部证据和推断。不得输出 HTML、图片发布物或 ZIP。

## 产物读取规则

- `resume-deepthink`：读取用户选定的当前简历；同版本历史深挖文档只在续写或避免重复追问时
  按需读取。
- `pm-sense`：默认不读取简历或其他知识库正文；用户要求延续同一训练时才读取指定训练文档。
- `interview-prep`：先从 `求职进展` 读取 `岗位 JD` 和 `投递简历版本`，再按版本名读取唯一
  简历；不得用其他简历替代。
- `mock-lab`：读取用户选定的简历和所有与该简历版本匹配的简历深挖文档；JD 有则读取，无则按
  用户确认的方向进行。
- `talk-review`：读取用户选定的 ASR、简历和与该简历版本匹配的简历深挖文档。

每个消费方先读节点标题和产物信息，再读取匹配正文；不得默认扫描无关目录。

## 迁移

schema v3 升级到 v4 时：

- 保留当前简历、简历深挖、产品思维和模拟面试 locator。
- 将旧“准备完成/待准备”目录优先映射到 `03｜面试准备文档`。
- 将旧“待复盘”映射为 `04｜面试复盘/ASR待复盘`，将旧“已完成复盘”映射为
  `04｜面试复盘/已完成复盘`。
- 不登记旧经历主档、产品主档、历史简历、其他材料或旧通用题库 locator。
- 不删除或移动任何线上旧节点；需要归档时另行列出并取得用户确认。
