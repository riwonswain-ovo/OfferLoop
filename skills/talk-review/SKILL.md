---
name: talk-review
description: 从 OfferLoop 飞书知识库的固定 ASR 文件夹读取用户选择的真实面试转写，并读取指定当前简历及该版本的简历深挖文档，还原问题与追问链、逐题评价和总结改进，保存到独立复盘文件夹，并把用户确认的问题交给统一面试题库。用户说“复盘刚才的面试”“分析这份面试转写”“根据 ASR 帮我复盘”时使用。
---

# Talk Review

把真实面试转写转成有证据的复盘。保留 ASR 不确定性，不把修正猜测、面试官意图推断或用户
事后补充当成原始事实。

运行相对路径前先从当前 `SKILL.md` 定位 Skill 根目录。

## 前置读取

1. 完整读取 `references/review-rubric.md`。
2. 定位兄弟 `offerloop-workspace`，完整读取其 `references/artifact-contract.md`。
3. 定位兄弟 `recruiting-reminder`，完整读取其 `references/event-contract.md`。
4. 读取 `lark-wiki`、`lark-doc`、`lark-base` Skill。
5. 检查 `interview_asr`、`current_resumes`、`resume_deepthink` 和
   `interview_review` 目录；首次创建节点前展示目标并取得确认。

schema v4、依赖或权限未就绪时路由到 `offerloop-setup`，不要自行扩大权限。

## 输入与来源

- 用户上传到 `04｜面试复盘/ASR待复盘` 的文档：列出候选并让用户选择，读取后原位保留。
- 列出 `01｜当前简历` 并让用户选择本次面试使用的简历，按标题精确匹配。
- 读取所有 `关联简历版本` 与该版本一致的简历深挖文档。
- 可选读取面试事件、岗位 JD 和本轮面试准备文档。
- 用户直接粘贴 ASR 时可以继续，但最终文档必须标记“来源为对话粘贴，未存入 ASR 文件夹”。

不得把 ASR、简历或私人材料上传外部研究服务。

## 复盘流程

1. 保留原始转写引用，标记说话人不确定、缺失片段和疑似 ASR 错误。
2. 划分主问题、追问和回答边界；无法确定时保留多个解释，不强行修复。
3. 用户给出事件链接或 record ID 时优先使用；否则调用
   `event_lookup.py resolve --json` 获取候选。唯一候选也展示确认，多候选让用户选择，零候选
   作为独立复盘。
4. 对比准备文档，识别命中、遗漏和临场新增题目。
5. 按内容、结构、证据、表达和岗位匹配逐题评价。
6. 改进表达只能使用确认事实；面试官关注点必须标记为推断。
7. 新发现经历事实经用户确认后只列为复盘建议，不自动修改简历或既有简历深挖文档。

## 保存与回填

1. 生成 `run_id` 和 Markdown；完成或明确提前结束都保存到
   `04｜面试复盘/已完成复盘`，用状态区分 `completed` / `incomplete`。
2. 原始上传文档不移动、不改写、不删除。
3. 已确认事件通过 `event_lookup.py backfill --kind review` 回填“面试复盘文档”。面试类事件
   同步主表和明确子表；轮次待确认只写主表；笔试不回填。
4. 部分失败保留已写记录，按精确 record ID 和同一 `run_id` 补偿。
5. 独立复盘只保存知识库文档，不创建 Base 事件。
6. 从真实问题与追问中整理候选题，向用户确认哪些题要加入统一面试题库；只把确认题交给
   `interview-question-bank`。
7. 保存失败时交付完整 Markdown 和原 `run_id`。
