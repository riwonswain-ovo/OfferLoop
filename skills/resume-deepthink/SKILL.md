---
name: resume-deepthink
description: 针对用户选定的当前简历版本、具体经历和目标岗位，通过岗位适配的连续追问进行简历深挖，支持产品、运营、PMO、商业分析、数据分析、算法、前端、后端和测试；生成仅包含“项目全景介绍”和“项目细节深挖”两部分的目标岗位专属 Markdown 文档。用户说“深挖这份简历”“帮我梳理项目”“追问我的简历”“准备项目逐字稿”或要求针对另一求职方向重新深挖同一经历时使用；不负责简历排版、导出 PDF 或正式模拟面试。
---

# Resume Deepthink

围绕一段真实经历持续追问，直到信息足以生成结构完整、可直接用于面试准备的项目深挖文档。
不得替用户编造职责、数字、技术细节、决策权、调研来源或业务结果。

运行本 Skill 内任何相对路径前，先从当前 `SKILL.md` 定位 Skill 根目录。

## 前置读取

1. 完整读取 `references/output-schema.md` 和 `references/conversation-workflow.md`。
2. 从本 Skill 根目录定位兄弟 `offerloop-workspace`，完整读取
   `references/artifact-contract.md`。
3. 需要从飞书选择简历或保存产物时，读取 `lark-wiki`、`lark-doc`；需要读取关联 Base 时再
   读取 `lark-base`。
4. 运行共享 `artifact_contract.py` 检查 `current_resumes` 和
   `resume_deepthink` 目录。
5. 目录或 schema v4 未就绪时，路由到 `offerloop-setup` / `offerloop-workspace`。首次创建
   节点前展示目标并取得确认。

用户直接提供本地简历或既有深挖文档时，可以先在本地完成深挖；仅在需要访问或保存飞书时
执行第 3–5 步。

## 确认范围

1. 确认目标岗位、投递方向和本次要深挖的具体经历。目标岗位必须映射到产品、运营、PMO、
   商业分析、数据分析、算法、前端、后端或测试之一。复合岗位确认一个主岗位和至多一个辅助
   岗位。
2. 使用飞书时，列出 `02｜当前简历` 中的版本让用户选择；用户给出版本名时按标题精确匹配。
   零命中或多个同名文档时停止并消歧，不自动取“最新版”。
3. 读取选定简历全文。只有简历版本、具体经历、目标岗位与投递方向均一致，且用户要求续写或
   避免重复追问时，才读取既有深挖文档。不得把另一目标岗位的深挖答案作为当前岗位答案。
4. 可按需读取目标 JD 和用户指定的证明材料；不得扫描历史简历或无关个人材料。

## 渐进加载岗位规则

确认岗位后，只完整读取对应文件，不读取无关岗位文件：

- 产品：完整读取 `references/role-playbooks/product.md` 和
  `references/product-few-shot-synthetic.md`
- 运营：`references/role-playbooks/operations.md`
- PMO：`references/role-playbooks/pmo.md`
- 商业分析：`references/role-playbooks/business-analysis.md`
- 数据分析：`references/role-playbooks/data-analysis.md`
- 算法：`references/role-playbooks/algorithm.md`
- 前端：`references/role-playbooks/frontend.md`
- 后端：`references/role-playbooks/backend.md`
- 测试：`references/role-playbooks/testing.md`

存在辅助岗位时再读取对应的第二份 playbook；最多读取两份。以主岗位决定主要追问和成稿
措辞，辅助岗位只补充交叉能力，不得稀释主岗位。

## 执行对话

严格执行 `references/conversation-workflow.md`，使用岗位 playbook 定义的证据、目标、方案、
结果和六类面试问题重点。先收集完整项目事实，再生成 3 分钟与 1 分钟版本。

## 生成文档

1. 严格套用 `references/output-schema.md`，不得增删一级部分。
2. 最终 Markdown 除文档标题外，只包含：
   - `## 一、项目全景介绍`
   - `## 二、项目细节深挖`
3. 不得加入产物信息、run_id、来源说明、用户原始回答、回答诊断、声明账本、个人贡献矩阵、
   风险清单、安全说法、简历表达、STAR/CAR 素材、候选题或总结建议。
4. 项目全景介绍必须依次呈现 1 分钟版本、3 分钟版本、项目背景、项目目标、项目方案和项目
   结果。
5. 项目细节深挖必须按六类问题组织，每题之后立即给出参考回答；不得保留空问题或空答案。
6. 成稿前检查 1 分钟版、3 分钟版和详细章节中的职责、数字、范围与结果是否一致。

## 保存

用户完成或明确提前结束时：

1. 用共享脚本生成并保留 `run_id`，并用 `build-title` 生成标题；必须同时传入简历版本、
   经历名称和完整目标岗位/投递方向。`run_id` 只用于幂等保存，不写入 Markdown 正文。
2. 通过 `lark-doc` 将严格符合两部分结构的 Markdown 保存到 `03｜简历深挖`。用户对正文
   结构的要求优先，不向正文插入通用产物信息。
3. 保存失败时仍在对话交付完整 Markdown，并沿用原 `run_id` 重试。
4. 本阶段不生成额外候选题清单。
5. 把 `(简历版本, 经历名称, 目标岗位/投递方向)` 视为文档身份。任一项不同都必须新建文档，
   不得覆盖或续写另一目标岗位的文档。

普通暂停不生成正式文档。不直接改写用户简历。
