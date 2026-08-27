---
name: experience-deepthink
description: 面向互联网产品经理求职，接收用户对一段真实经历的自然讲述，通过分阶段的一题一答还原项目背景、目标、动作、结果与认知，生成固定八章的《细节复原稿》，并可基于已确认事实生成固定七题的《面试逐字稿》。适用于产品实习、运营实习、创业、竞赛、校园项目和 AI Coding 等能够体现真实产品能力的单段经历深挖。
---

# Experience Deepthink v2.0.0

## 目标与边界

只服务互联网产品经理岗位。经历来源可以不同，但只能还原真实存在的产品工作和产品判断，不能把非产品
工作包装成产品经历。

按两个单向阶段交付：

1. 通过对话还原事实，形成《细节复原稿》；
2. 仅以已确认的《细节复原稿》为事实来源，按需生成《面试逐字稿》。

不得从岗位常识、示例或面试表达反向补造项目事实。始终区分当时事实、当时依据、现在复盘、重来设想、
未来计划和未知信息。

## 按需读取

运行相对路径前，先从当前 `SKILL.md` 定位 Skill 根目录。

本 Skill 的第一项动作是读取 `../.offerloop-runtime/references/installation-mode.md` 并运行模式检查。
OfferLoop 只支持飞书完整模式，直接使用本轮经历和完整产品经理方向，不执行用户画像门禁。隐藏运行时、
知识库 locator 或权限缺失时先转入完整模式初始化修复，不把 Chat-only 深挖描述成受支持的独立模式。

### 深挖阶段

完整读取：

- `references/conversation-workflow.md`：七阶段方法、阶段完成条件和一题一答规则；
- `references/role-playbooks/product.md`：互联网产品经理的通用产品视角。

经历确实涉及 AI、算法、Agent、RAG、Workflow 或 AI Coding 时，再读取
`references/specialized-reference-routing.md`，只加载命中的最小专项。

### 细节复原稿阶段

准备成稿时再完整读取 `references/detail-reconstruction-schema.md`，按固定八章归位事实、处理动态子项并
执行文风检查。

### 面试逐字稿阶段

只有《细节复原稿》已经完成，或用户明确要求基于现有稿件生成时，才完整读取：

- `references/interview-transcript-generation.md`：固定七题、各题方法和表达规范；
- `../.offerloop-runtime/references/voice-contract.md`：仅在文件存在且运行模式需要时读取。

### 保存阶段

生成、补充或修订产物时读取 `../.offerloop-runtime/references/artifact-contract.md`，并按需使用
`lark-wiki`、`lark-doc` 保存到 OfferLoop 飞书知识库。用户本轮明确说“不保存”时可只在 Chat 中交付；
其他保存失败必须报告并保留完整 Markdown。完整交付写入知识库时使用 `completed`；用户暂停、仍有待补
事实或只保存阶段稿时使用 `incomplete`，不得把未完成稿标成已完成。

## 执行流程

1. 用户尚未讲述时，先邀请其按自己的方式自然表达，不发送问卷或完整题单。
2. 用户开始讲述后，按 `conversation-workflow.md` 依次完成：
   `产品定位 → 项目类型 → 项目背景 → 项目目标 → 项目动作 → 项目结果 → 项目收获`。
3. 项目类型只使用“从无到有 / 从有到好”二分法。
4. 每个阶段先让用户集中表达，再沿其表达方向抽象；只有用户说不上来时才提供候选回忆方向。
5. 集中表达后每轮只问一个最高价值问题。一个问题必须只要求用户完成一个认知任务，不能用一个问号
   同时索取场景、用户、机制、指标等多个信息槽位；不设置固定追问次数。
6. 事实主线稳定后，按 `detail-reconstruction-schema.md` 生成固定八章《细节复原稿》并校验结构。
7. 用户需要面试表达时，按 `interview-transcript-generation.md` 生成固定七题《面试逐字稿》并校验结构。

候选方向只有经用户确认后才能成为事实。用户明确不知道、记不清或未参与时停止追问该点，并按 reference
归入未知信息。用户提前讲到后续事实时先记录；后续事实推翻前序判断时直接修正。

## 成稿校验

生成完整《细节复原稿》后运行：

```bash
python3 scripts/validate_detail_reconstruction.py <markdown-file>
python3 scripts/validate_language.py --kind detail <markdown-file>
```

生成完整《面试逐字稿》后运行：

```bash
python3 scripts/validate_interview_transcript.py <markdown-file>
python3 scripts/validate_language.py --kind interview <markdown-file>
```

结构脚本检查固定章节，语言脚本检查已经确认的防御性归责句和生成过程元话语。真实性、因果、内容归位
和方法选择仍按对应 reference 检查。

## 接续同一经历

同一 `(经历名称, 完整产品经理方向)` 接续同一组产物，不重复盘问已确认事实：

- `细节复原稿｜<经历名称>｜<完整产品经理方向>`；
- `面试逐字稿｜<经历名称>｜<完整产品经理方向>`。

用户暂停时交付已确认内容和待补充问题，并保留未完成状态；恢复后继续原文档。
