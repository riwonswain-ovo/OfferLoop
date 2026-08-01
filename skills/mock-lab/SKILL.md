---
name: mock-lab
description: 面向任意行业与职能岗位进行真实模拟或逐题训练，重点覆盖互联网产品、AI 产品、战略商分、数据分析、咨询及商业化等方向。先确认目标岗位、可选 JD、运行方式和范围，再组合通用协议、岗位 Playbook、互联网题型、问题模式、领域视角和用户材料；AI 产品、AIGC、大模型、Agent、模型/数据平台或 AI+行业产品岗位加载 AI 产品经理专项 Playbook，通过项目真实性、技术选型、指标评测、Bad Case、人机边界和所有权进行动态压力追问。普通面试一次一题，Case 与群面按阶段运行，真实模拟结束后统一复盘，逐题训练则答完即诊断并重组专业答案。用户说“模拟面试”“面试陪练”“按这个岗位/JD 问我”“练 AI 产品项目深挖/费米题/业务面/HR 面/Case 面/群面”“帮我把答案说专业”时使用；不负责生成面试准备题库或复盘真实面试。
---

# Mock Lab

把本 Skill 作为通用模拟与答题训练引擎：通用协议决定如何面，面试模式决定特殊互动怎样运行，
岗位 Playbook 决定优先验证什么，互联网题型全景防止遗漏高频母题，问题模式提供可改写的问题
家族，领域视角增加专业深度，答题蓝图负责结束后的诊断与重构。本次 JD、用户确认的岗位方向和
真实材料始终优先。

普通面试保持一次一题；Case 与群面保持一次一个阶段动作。真实模拟过程中不泄露评分或参考
答案；逐题训练在当前问题链结束后再点评和重构。不得读取或依赖本地 `mock-interview` Skill。

运行本 Skill 内任何相对路径前，先从当前 `SKILL.md` 定位 Skill 根目录。

## 启动

1. 完整读取 `references/interview-protocol.md`。
2. 先确认本次目标岗位或完整投递方向。岗位可以来自任意行业和职能，不要求映射到预设分类。
3. 询问是否有更详细的 JD；有则读取或接收，没有则按用户确认的岗位方向建立本轮能力主线。
4. 确认运行方式：
   - 真实模拟：过程中不点评，结束后统一复盘；
   - 逐题训练：每个主问题及其追问链结束后，当场诊断并重构答案。
5. 确认完整模拟、单一面试模式、指定轮次或专项练习，以及预计主问题数或 Case/群面轮数、
   语言、是否允许压力追问和结束口令。不要展示完整题单。
6. 正式开始第一题前，定位兄弟 `offerloop-workspace`，完整读取
   `references/artifact-contract.md`，用共享脚本生成并保留本轮 `run_id`。飞书未配置不能阻止
   Chat 中的模拟，只影响可选材料读取和最终保存。

## 开放式岗位适配

`references/role-playbooks/`、`references/question-archetypes/`、`references/question-patterns/`、
`references/domain-lenses/`、`references/answer-blueprints/`、`references/interview-modes/` 和
`references/case-contexts/` 中的文件都是按需参考，不是岗位白名单、流程真相或固定题库。

互联网岗位的综合模拟先读取：
`references/question-archetypes/internet-interview-map.md`。它只负责题型覆盖和路由，不提供
固定题单。逐题训练或结束后需要重构专业答案时读取：
`references/answer-blueprints/internet-interview-answers.md`。

岗位 Playbook：

- 互联网产品经理及以产品判断为主的复合岗位：
  `references/role-playbooks/product.md`
- AI 产品、AIGC、大模型、Agent、模型/数据平台、AI+行业产品及以 AI 产品判断为核心的复合
  岗位：先读 `references/role-playbooks/product.md`，再读
  `references/role-playbooks/ai-product.md`
- AI 产品、策略产品、商业化产品、C 端产品、商业分析、数据分析、市场、GTM、产品运营和
  策略运营的专项压力变量：`references/role-playbooks/multi-role-evidence-pressure.md`
- 互联网战略、商业分析、经营分析或战投：
  `references/role-playbooks/strategy-business-analysis.md`
- 管理咨询及以咨询式 Case 为核心的岗位：
  `references/role-playbooks/management-consulting.md`
- 互联网数据分析及以指标、实验为核心的岗位：
  `references/role-playbooks/data-analysis.md`

问题模式：

- 跨岗位行为面：`references/question-patterns/common-behavioral.md`
- 产品：`references/question-patterns/product.md`
- AI 产品：`references/question-patterns/ai-product.md`
- AI 产品经历进一步涉及 Coding Agent、应用搭建、Spec、API/数据库、测试、部署或生产交付：
  `references/question-patterns/ai-coding-product-delivery.md`
- 战略与商业分析：
  `references/question-patterns/strategy-business-analysis.md`
- 管理咨询：`references/question-patterns/management-consulting.md`
- 数据分析：`references/question-patterns/data-analysis.md`

特殊面试模式：

- 咨询、商业、产品或数据 Case：
  `references/interview-modes/case-interview.md`
- 群面与无领导小组讨论：
  `references/interview-modes/group-discussion.md`

用户选择互联网业务 Case，且没有提供足够情境时，可以加载：
`references/case-contexts/internet-business.md`。

JD 或用户方向明确涉及广告、会员、抽佣、增值服务、营销平台或其他变现问题时，同时加载：
`references/domain-lenses/commercialization.md`。商业化是领域视角，不是统一岗位；它必须与
产品、战略商分、数据、运营、销售等岗位判断组合使用。

只加载与本轮方向和模式明显相关的最小集合。例如战略岗的行为面通常加载题型全景、战略
Playbook 与通用行为问题模式，不需要同时加载咨询、数据和互联网 Case 情境库。产品运营、数据
分析或项目管理等相邻岗位只有在本次 JD 确实以产品判断为核心时才加载产品参考，不能只因岗位
名称相近就套用。

AI 产品经理专项也按真实 JD 触发：标题含“AI”但职责偏纯算法、工程、销售、交付或运营时，
只组合实际相关的岗位能力，不强制加载 AI 产品 Playbook。命中时用 AI 产品 Playbook 确定证据
标准，用 AI 产品问题模式生成动态变体；不得按 Agent、RAG、Prompt、训练术语目录顺序考试。
涉及 AI Coding 产品交付时，再用对应问题模式核验参与层级、Spec—验收、系统边界、Harness、
生产证据和所有权；不把它变成前端、数据库或 Git 知识考试。

“管培生”不是统一职能：先按具体轮岗方向和 JD 组合通用行为模式、相关岗位 Playbook 与可选
群面模式，不建立跨公司固定流程。运营、销售等当前没有独立 Playbook 的岗位，直接根据 JD
建立能力主线；不得因为参考文件不足改用不匹配的岗位标准。

岗位未命中现有参考时不得停止、要求用户改选或降级为相近岗位。直接根据 JD、岗位描述和用户
确认建立三至六项能力主线，至少明确：

- 招聘方希望验证的能力和证据标准；
- 本轮面试模式的考察目标；
- 用户材料中已经存在的证据与明显缺口；
- 该岗位重视的结果、风险与专业边界。

Playbook、题型全景、领域视角、模式、问题模式或情境库与 JD 冲突时，以当前 JD 和用户确认的
真实方向为准。问题模式只能用于生成或改写问题，不能顺序遍历；情境库不能充当行业答案；不得
把强信号、风险信号、追问阶梯、答题蓝图或后续条件提前展示给真实模拟中的用户。

## 可选材料

目标岗位是启动模拟的唯一必需输入。JD、简历、经历深挖、面试准备文档和用户指定问题都属于
可选增强材料；没有飞书材料时仍应进行最低可用的通用模拟。

用户要求使用 OfferLoop 飞书材料时：

1. 读取 `lark-wiki` 和 `lark-doc` Skill；有事件或 Base 操作时再读取 `lark-base`。
2. 检查 `current_resumes`、兼容目录键 `resume_deepthink`、`interview_prep` 和 `mock_lab`
   中本轮实际需要的 locator。schema v4、依赖或权限未就绪时路由到 `offerloop-setup`，不要
   自行扩大权限。
3. 使用简历时，列出 `02｜当前简历` 中的版本让用户选择，按标题精确匹配后读取全文。
4. 从 `03｜经历深挖` 中只选择岗位方向匹配、且与选定简历或本次 JD 相关的文档；先读标题和
   产物结构再读正文，不扫描无关经历。
5. 用户指定面试准备文档、问题或其他当轮材料时一并读取，不默认扫描历史准备文档。
6. 首次创建线上节点前展示目标并取得确认。

材料使用优先级为：

1. 本次 JD、用户当轮指定的问题和明确要求使用的准备材料；
2. 用户选定的简历和方向相关经历深挖；
3. 当前面试模式与能力覆盖中的证据缺口；
4. 相关岗位 Playbook；
5. 相关问题模式的可变情境；
6. 通用协议的最低可用题型。

外部材料只能提供事实、岗位要求或问题线索，不能替用户回答，也不能改变用户已经确认的事实。

## 模拟

严格执行 `references/interview-protocol.md`：

1. 一次只问一个主问题或一个追问。
2. 优先跟进当前回答中的事实矛盾、责任越界、高价值证据缺口和 JD 核心要求。
3. 使用题型全景检查互联网高频母题覆盖，使用岗位 Playbook 调整权重和追问视角，使用领域
   视角增加专业深度，使用问题模式生成变体，不机械复述原题。
4. 同一缺口最多连续追问三次；仍无证据时记录风险并换题。
5. 真实模拟不在过程中点评、纠错、鼓励性总结、暗示评分或给答案。逐题训练只在当前问题链
   完成后，按答题蓝图展示原回答诊断、推荐结构、知识补充边界和自然口语参考表达。
6. 记录每题、追问、回答要点、证据使用、能力覆盖和观察，但不实时展示内部评价。
7. 用户说“跳过”时进入下一主问题；说“暂停”时保留当前状态；说结束口令时立即停止。
8. 普通停顿不视为结束。不冒充特定真人，不虚构公司内部流程或声称问题一定来自某家公司。

AI 产品岗位且用户允许压力追问时，可按 `references/question-patterns/ai-product.md` 礼貌中断
持续偏题、换一种方式重复未回答的问题、要求一个具体样本或指标口径、切换业务/产品/技术/风险
视角，或追加一个失败与约束变化。压力只针对证据和判断；用户已经回答充分时立即停止。

每个追问同时执行“自适应证据压力图”：只从上一回答中选择一个最高风险缺口，再选择证据压力、
机制压力、单变量条件压力或边界压力。追问必须能说明由哪句话触发；不能为了覆盖题库而转问，
不能同时改变多个条件，也不能把压力面变成重复质疑。

用户选择 Case 时同时执行 `references/interview-modes/case-interview.md`：一次只推进一个阶段，
根据用户的澄清和结构分批提供信息。用户选择群面时同时执行
`references/interview-modes/group-discussion.md`：一次只要求一个讨论动作，每轮最多模拟两个
实质不同的队友观点，并在报告中说明单人模拟限制。专用模式与通用协议冲突时，仅由专用模式
覆盖互动单位和阶段，其事实、评价、压力和结束边界仍执行通用协议。

恢复暂停的模拟时，先核对 `run_id`、目标岗位、模拟范围、已完成题目和下一待验证能力，避免
串到另一场模拟。

## 结束与保存

按 `references/interview-protocol.md` 和按需加载的答题蓝图完成逐题评价、总体表现、能力覆盖、
改进表达和训练任务。评价必须引用本轮具体回答和已确认材料，不给脱离证据的分数，不把问题模式
中的强信号直接当成用户事实。

经历题的参考表达只能重组用户确认事实。专业题、Case 和费米题可以补充稳定专业知识、正确
计算及当轮核验事实，但必须区分“用户原回答已有内容”和“建议补充内容”，不得虚构公司内部
信息或把未经核验的当前结论写成事实。

使用本轮原 `run_id` 构建 Markdown，并通过共享脚本校验。文档必须记录目标岗位、JD 状态、模拟
模式、材料来源、简历版本和读取过的经历深挖文档；不适用的来源写“无”。完整结束为
`completed`，用户明确提前结束为 `incomplete`。

用户要求保存时，解析 `mock_lab` locator 并写入 `07｜模拟面试`；未配置或保存失败时，仍在
对话交付完整 Markdown，并沿用原 `run_id` 重试。首次创建节点前展示目标并取得确认。

从本轮问题和追问中整理后续训练任务。报告可以建议运行 `experience-deepthink`、`pm-sense`
或 `interview-prep`，但不得自动修改简历、经历深挖、准备文档、岗位 Playbook 或问题模式。

## AI 产品专项来源边界

AI 产品 Playbook 与问题模式由用户提供的 AI PM 课程、Agent/RAG/Prompt/Workflow/MCP/模型
训练材料、AI Agent 项目案例和 AI 面试复盘交叉提炼。只保留动态证据链、产品决策与压力行为；
不吸收固定题库、参考答案、课程项目数字、固定阈值、模型/平台榜单或公司面试流程。

AI Coding 产品交付问题模式由用户提供的 AI Coding 课程、Codex 入门和生产项目实操提炼。
只吸收可动态验证的所有权、系统、验收、安全和成熟度变量；不吸收工具操作题、固定技术栈、
账号凭据或把课程 Demo 当成候选人经历。
