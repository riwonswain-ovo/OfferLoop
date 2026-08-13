---
name: experience-deepthink
description: 直接在 Chat 中接收用户讲述的一段具体经历和完整目标岗位方向，通过连续一题一答，先还原成结构化、可验证、可追溯的《细节复原稿》，再严格以该事实主档为唯一来源生成《面试逐字稿》。适用于实习、项目、科研、竞赛、学生工作、创业、志愿服务等真实实践，以及产品、运营、商业化、PMO、战略分析、商业分析、数据分析和复合岗位等方向。面试逐字稿固定覆盖项目整体、背景、目标、动作、结果、收获、失败、冲突、核心决策、跨团队协作、重来改进和未来优化 12 类高频问题。不得补造用户职责、规则依据、算法细节、数字、决策权或业务结果。
---

# Experience Deepthink V3.3

## 核心原则

本 Skill 分成两个严格单向的阶段：

1. **细节复原阶段**：Agent 提问 → 用户回答 → 更新《细节复原稿》。
2. **面试表达阶段**：《细节复原稿》作为唯一事实源 → 生成《面试逐字稿》。

禁止从面试逐字稿反向补造细节复原稿中的项目事实。

始终分离两层：

- **Analysis Layer**：供 Agent 使用，包含 Story Recovery、Personal Failure Gate、Experiment
  Attribution Matrix、End-to-End State & Fallback、Rule Trace、Evidence Ledger、Ownership Audit、
  Causality Audit 和事实状态。它们决定要发现什么、如何判断以及是否继续追问。
- **Publication Layer**：交付给用户的《细节复原稿》。它只表达项目事实、证据边界、策略、结果、贡献、
  风险和复盘，不暴露 Agent 的机制名称、状态标签或审计过程。

Internal mechanism determines judgment. Publication layer expresses the conclusion. 深挖机制不能据此扩张
正式目录，也不能以 Gate、Pass、Matrix、Ledger、Audit 或内部状态标签的形式进入最终正文。

运行本 Skill 内任何相对路径前，先从当前 `SKILL.md` 定位 Skill 根目录。

## 用户画像前置门禁

本 Skill 的第一项动作是读取 `../.offerloop-runtime/references/installation-mode.md` 并运行模式
检查。`full` 模式继续完整执行 `profile-gate.md`；画像缺失或为空时转由 `career-profile`。
`single` 模式跳过全局画像门禁，直接从用户本轮讲述和目标岗位开始，默认在 Chat 中交付。

开始深挖时完整读取：

- `references/conversation-workflow.md`
- `references/detail-reconstruction-schema.md`
- `references/thinking-and-answer-logic.md`
- `references/role-routing.md`
- `references/role-decision-evidence-method.md`

## 开工前材料与范围确认

| 场景 | 必须读取 | 缺失时 |
|---|---|---|
| 首次深挖 | 用户本轮直接讲述的经历、完整岗位方向、相关岗位路线 | 先取得经历和岗位，不要求简历或 Base |
| 接续同一经历 | 同名同岗位方向的细节复原稿、上次待续挖清单 | 唯一匹配自动读取；多匹配让用户选择 |
| AI 项目/AI 产品岗位 | AI 产品岗位路线及真实机制对应的最小项目手册 | 无法确认机制时列入待深挖，不按术语猜 |

正式提问前先列出计划深挖的全部主题、优先级和预计耗时。用户给出时间限制时，明确枚举“完整深挖、压缩深挖、延期深挖”的选项，由用户取舍；不得静默删除主题。

AI 项目且目标为 AI 产品岗位时，候选深挖点必须包括：AI 必要性、产品判断与技术路径、模型/工具/人的边界、端到端链路、数据与评测、失败模式、降级方案、方案取舍、个人 ownership 和证据。用户可以选择压缩或延期，但 Agent 不得跳过后声称完整完成。

时间到时自动保存 `incomplete`，正文保留已完成内容、缺口和待续挖清单。

需要生成或更新面试逐字稿时，再完整读取：

- `references/interview-transcript-generation.md`
- `../.offerloop-runtime/references/voice-contract.md`

用户画像中的个人语言画像和用户授权的自写/真实口语样本只决定表达方式，不成为项目事实源。
逐字稿仍只能从细节复原稿取得事实；先通过事实检查，再做用户语言改写。

成稿前查漏时按需读取：

- `references/supporting-guides/experience-evidence-radar.md`

AI / Agent / RAG / Workflow / AI Coding 等专项使用 `references/project-playbooks/` 中的现有手册，
只增加专业深度，不改变事实审计和双阶段结构。术语澄清、证据查漏和成稿检查使用
`references/supporting-guides/`，不把辅助指南当岗位路线或项目路线。

## 启动

如果用户尚未提供经历和岗位方向：

> 请直接讲讲你这次想深挖的经历，并告诉我你准备用它投什么岗位。先按你自然的方式讲，不用套模板。

在用户完成上述输入前，不读取简历、飞书资料、关联 Base、历史经历文档或其他个人材料，也不要求
用户先上传简历或给出 JD。用户画像门禁已通过后，其他保存目录未就绪不得中断当前 Chat 深挖。

首次讲述后：

1. 确认经历名称、经历类型、岗位方向；
2. 建立岗位能力主线；
3. 进入细节复原阶段；
4. 每轮只问一个最高价值问题；
5. 不按固定题单顺序盘问。

## 文档身份与岗位路由

产物组唯一身份是 `(经历名称, 完整岗位方向)`。岗位方向不同即维护独立产物组；同一组合跨多次
对话始终接续同一组。经历重名时，先补充组织、时间或主题形成唯一名称，不使用日期、运行时间或
“最新版”区分。

按 `references/role-routing.md` 从完整岗位、可选 JD、能力重点和经历事实确定通用或专项路线。
`references/role-playbooks/` 不是岗位白名单：

- 产品：`references/role-playbooks/product.md`；
- AI 产品：在产品路线基础上加载 `references/role-playbooks/ai-product.md`；
- 策略产品：在产品路线基础上加载 `references/role-playbooks/strategy-product.md`；
- 运营：`references/role-playbooks/operations.md`；
- 商业化：`references/role-playbooks/commercialization.md`；
- PMO：`references/role-playbooks/pmo.md`；
- 战略分析：`references/role-playbooks/strategy-analysis.md`；
- 商业分析：`references/role-playbooks/business-analysis.md`；
- 数据分析：`references/role-playbooks/data-analysis.md`；
- 复合岗位与专项交叉：`references/role-playbooks/multi-role-specializations.md`。

岗位未命中上述参考时不得停止，也不得要求用户改选；直接根据完整岗位名称、用户可选提供的 JD
和希望证明的能力建立三至六项能力主线。财务、HR、法务、市场、销售等方向同样使用通用底座。
复合岗位只加载真正相关的最小集合，JD 与 playbook 冲突时以真实 JD 和用户确认为准。
AI 产品与策略产品同时命中时，以 JD 核心职责和用户希望证明的能力确定主路线，另一条只作为
条件视角；依据不足时先问一个最小澄清问题。

经历涉及 AI/算法真实应用时加载
`references/project-playbooks/ai-technology-application.md`；是否触发由经历内容决定。再按真实机制
最小加载 `references/project-playbooks/ai-agent-skill-products.md`、
`references/project-playbooks/ai-audit-products.md`、
`references/project-playbooks/ai-action-agent-products.md`、
`references/project-playbooks/ai-rag-knowledge-products.md`、
`references/project-playbooks/ai-context-memory-products.md`、
`references/project-playbooks/ai-prompt-workflow-products.md`、
`references/project-playbooks/ai-tool-ecosystem-products.md`、
`references/project-playbooks/ai-model-training-products.md` 或
`references/project-playbooks/ai-coding-product-delivery.md`，不因岗位热词批量读取。只有术语澄清时读取
`references/supporting-guides/ai-concept-glossary.md`；AI 项目主线稳定、准备成稿或核查强主张时才读取
`references/supporting-guides/ai-interview-evidence-pressure.md`；成稿查漏或用户卡壳时按需读取
`references/supporting-guides/experience-evidence-radar.md`。

AI Coding 经历必须区分跟做、配置、AI 辅助实现、独立交付和团队生产。AI 强主张使用
“主张—机制—实例—口径/物证—所有权—局限/反事实”链路核查，不能因术语正确就推断真实参与。

## 事实状态

对高价值陈述内部标记：

- `confirmed`：用户明确确认；
- `supported`：有材料/数据/实验支持；
- `explained-not-sourced`：现在能解释，但不知道当时真实依据；
- `unknown`：不知道/记不清；
- `conflict`：与其他口径冲突。

同时记录 ownership：

- `lead`
- `co-own`
- `participate`
- `observe`
- `non-owned`

禁止把“现在解释得通”写成“当时就是这么决定的”。

## 阶段一：细节复原

严格执行 `conversation-workflow.md`。

目标是稳定形成 8 章：

1. 项目概述
2. 项目背景与优化方向
3. 项目目标与数据指标
4. 方案及动作
5. 实验与收益
6. 项目未来的优化方向
7. 在这个项目中的收获
8. 项目中当时未充分了解的细节

只有在事实已确认或明确标记 unknown / 非本人职责后才结束该主题。

阶段一成稿必须严格采用 `references/detail-reconstruction-schema.md` 的固定八章、父子关系和内容归属。
不能只核对章节名称或 Markdown `#` 数量；输出前必须执行其中的 `Content Placement Check` 和
“匿名目录测试”，发现错位时先重排，且重排不得删除已确认事实、Unknown、ownership 或证据边界。

为每个高价值事实内部指定唯一 `Primary Home`，再执行 `Deduplication Pass` 和
`Publication Hygiene Pass`。第四章只写方案机制、设计理由和验证思路；实验样本、对照关系、数字、
显著性、结果和归因的唯一完整事实源是第五章。故事素材只能为因果完整性简短引用必要结果，不能复制
结果分析。最终文档不得出现内部词汇黑名单或“Agent 如何判断”的元话语，具体规则见
`references/detail-reconstruction-schema.md`。

阶段一成稿前强制执行以下门禁，具体方法见 `references/conversation-workflow.md`：

- 失败、冲突、核心决策、跨团队协作任一缺失时，先执行 `Story Recovery Pass`；只有用户明确表示
  确实没有、不记得或事实不足，才允许保留待补充。
- 失败故事先通过 `Personal Failure Gate`，区分“我的错误”与“项目未达预期”，禁止建立虚假因果。
- 对每个重要实验数字维护 `Experiment Attribution Matrix`，绑定 Treatment、Control、人群、周期、
  实验类型和归因边界。
- 多阶段 AI、策略、中台、交易或履约链路执行 `End-to-End State & Fallback Pass`，补齐失败、停止、
  重试、降级、过期、冲突和最终决策权。

## 阶段二：面试逐字稿

面试逐字稿只从细节复原稿中抽取事实。

默认生成 12 个固定问题：

1. 介绍项目整体
2. 介绍项目背景
3. 介绍项目目标
4. 介绍项目动作
5. 介绍项目结果
6. 项目中的收获是什么
7. 讲一个项目中遇到的失败
8. 讲一个项目中遇到的冲突
9. 讲一个项目中做的核心决策
10. 讲一个项目中和其他团队的协作
11. 重来一次最想改进哪个部分
12. 这个项目未来还有哪些优化方向

若细节复原稿不存在某类真实故事，只有在阶段一已完成 `Story Recovery Pass` 且记录用户明确的
“没有 / 不记得 / 事实不足”后，逐字稿才写 `[待补充：当前项目没有足够事实支持该故事]`；否则退回
阶段一继续一次一题地搜索真实事件，不得编造或诱导。

每题生成后必须执行：

1. 事实一致性检查；
2. 个人贡献边界检查；
3. 逻辑结构检查；
4. 口语化改写；
5. 长度压缩；
6. `Question Relevance Gate`：逐句删除不直接服务当前问题、但更适合留给其他题或追问的信息。

目标长度：

- 简单题：300–450 个中文字符；
- 复杂项目/故事题：420–580 个中文字符；
- 硬上限：约 600 个中文字符；
- 目标口述时长：90–110 秒；
- 任何题不得为了“完整”超过 2 分钟。

## 写作原则

- 先给结论，再展开；
- 不重复解释面试官已知背景；
- 每题只保留 2–4 个最关键支撑点；
- 数字只保留能支撑核心判断的数字；
- 一句话尽量只承担一个逻辑；
- 多用“所以、因此、但、进一步、最终”等自然因果连接；
- 不写 PRD 腔；
- 不写“首先有以下几个维度”式机械罗列，除非确实能提高口述清晰度；
- 不为了炫耀专业度堆术语；
- 结尾优先形成判断、结果或钩子，不引入新事实。

## 保存与更新

同一 `(经历名称, 岗位方向)` 始终维护：

- `细节复原稿｜<经历名称>｜<完整岗位方向>`
- `面试逐字稿｜<经历名称>｜<完整岗位方向>`

每轮新增事实先进入细节复原稿。
只有相关主题事实稳定后，才同步更新对应逐字稿。

### 保存触发和共享契约

完整结束、用户暂停或时间到时都自动进入保存流程。此时读取同级隐藏目录 `../.offerloop-runtime/references/artifact-contract.md`，脚本使用 `../.offerloop-runtime/scripts/artifact_contract.py`，再按需读取
`lark-wiki` 与 `lark-doc`。先通过内部键 `experience_deepthink` 定位用户侧根目录
`04｜经历深挖`，再按产物类型进入固定子目录：

该根目录位于 OfferLoop 飞书知识库。

- 细节复原稿：`04｜经历深挖/细节复原文档`；
- 面试逐字稿：`04｜经历深挖/面试逐字文档`。

不得把新产物直接保存在 `04｜经历深挖` 根节点。目录或配置未就绪时仍在 Chat 交付完整内容，并报告保存未完成。

完整结束标记为 `completed`；用户暂停、时间到或仍有延期主题时标记为 `incomplete`，并保留缺口和待续挖清单。

1. 每次运行生成新的 `run_id`；它只在会话内用于幂等和失败重试，不写入标题或正文。
2. 用 `build-title --artifact-type detail-reconstruction` 生成细节复原稿标题，用
   `--artifact-type interview-transcript` 生成逐字稿标题。
3. 用 `find-by-title` 分别精确查找需要写入的标题。`found` 更新原节点，`missing` 只创建缺失
   节点，`ambiguous` 停止并让用户选择，绝不默认取第一份。
4. 阶段一只维护细节复原稿；进入阶段二后才创建或更新面试逐字稿。阶段二发现新事实时，必须先
   更新细节复原稿，再更新逐字稿。
5. 两份 Markdown 都使用 `validate-markdown --content-only`；每份只能有一个一级标题，不包含
   “产物信息”或 `run_id`。
6. 只有一份写入成功时，保留成功结果与原 `run_id`，只重试失败的那一份；不得重复创建已成功
   的节点。线上操作成功但响应丢失时，先按标题重新查找再决定是否重试。

### 旧文档迁移

若新标题未命中，再按同一经历名称与完整岗位方向查找旧标题
`复原 PRD｜<经历名称>｜<完整岗位方向>`，以及旧版“经历深挖/简历深挖”单文档候选：

- 唯一匹配时，先展示“将复用并重命名该节点为细节复原稿”的迁移目标，取得用户确认后在原节点
  更新标题和正文，不创建重复主档；
- 多个候选时让用户指定主文档，不自动合并、移动或删除；
- 不把旧文档中未经确认的口述表达自动升级为事实；事实进入细节复原稿后，才可生成逐字稿。
