from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"


class RepositoryContractTest(unittest.TestCase):
    def test_experience_deepthink_uses_optional_playbooks_without_a_role_whitelist(self):
        root = SKILLS / "experience-deepthink"
        expected = {
            "product.md",
            "operations.md",
            "commercialization.md",
            "pmo.md",
            "strategy-analysis.md",
            "business-analysis.md",
            "data-analysis.md",
        }
        discovered = {
            path.name
            for path in (root / "references" / "role-playbooks").glob("*.md")
        }
        self.assertEqual(discovered, expected)
        skill = (root / "SKILL.md").read_text(encoding="utf-8")
        for name in expected:
            self.assertIn(f"references/role-playbooks/{name}", skill)
        self.assertIn("(经历名称, 完整岗位方向)", skill)
        self.assertIn("不是岗位白名单", skill)
        self.assertIn("岗位未命中上述参考时不得停止", skill)
        self.assertIn("财务、HR、法务、市场、销售", skill)
        self.assertNotIn("目标岗位必须映射", skill)
        self.assertIn("在用户完成上述输入前，不读取简历", skill)
        self.assertNotIn("检查 `current_resumes`", skill)

    def test_experience_deepthink_output_keeps_reusable_evidence_and_stories(self):
        schema = (
            SKILLS / "experience-deepthink" / "references" / "output-schema.md"
        ).read_text(encoding="utf-8")
        template = schema.split("```markdown", 1)[1].split("```", 1)[0]
        self.assertEqual(
            re.findall(r"^## .+$", template, re.MULTILINE),
            [
                "## 一、经历全景与基础口述稿",
                "## 二、故事素材",
                "## 三、待补充与建议深挖方向",
            ],
        )
        for heading in (
            "背景 3 分钟口述稿",
            "目标 3 分钟口述稿",
            "方案与行动路径 3 分钟口述稿",
            "结果 3 分钟口述稿",
            "团队成果与个人贡献",
            "数据口径",
            "事实边界",
            "失败故事",
            "冲突故事",
            "决策故事",
            "协作故事",
            "重来一次想改进哪个部分",
        ):
            self.assertIn(heading, template)
        self.assertNotIn("## 产物信息", template)
        self.assertNotIn("## 二、事实、贡献与证据边界", template)
        self.assertNotIn("维护记录", template)
        self.assertIn("相同经历名称和岗位方向只维护一份正式文档", schema)
        self.assertIn("不生成固定题型题库", schema)
        self.assertIn("岗位方向不受预设分类限制", schema)
        self.assertIn("严格按金字塔原理组织", schema)
        for internal_only_field in (
            "信息来源可靠性与交叉验证（如适用）：",
            "可复用方法、适用条件与失效边界：",
            "短期结果、长期影响与护栏指标（如适用）：",
            "投入、回收周期、规模与机会成本（如适用）：",
        ):
            self.assertNotIn(internal_only_field, template)

        workflow = (
            SKILLS
            / "experience-deepthink"
            / "references"
            / "conversation-workflow.md"
        ).read_text(encoding="utf-8")
        radar = (
            SKILLS
            / "experience-deepthink"
            / "references"
            / "experience-evidence-radar.md"
        ).read_text(encoding="utf-8")
        commercialization = (
            SKILLS
            / "experience-deepthink"
            / "references"
            / "role-playbooks"
            / "commercialization.md"
        ).read_text(encoding="utf-8")
        strategy = (
            SKILLS
            / "experience-deepthink"
            / "references"
            / "role-playbooks"
            / "strategy-analysis.md"
        ).read_text(encoding="utf-8")
        thinking = (
            SKILLS
            / "experience-deepthink"
            / "references"
            / "thinking-and-answer-logic.md"
        ).read_text(encoding="utf-8")
        for expected in (
            "证据冲突与交叉验证",
            "方法沉淀与经历查漏",
            "不向用户展示完整雷达",
        ):
            self.assertIn(expected, workflow)
        for expected in (
            "不是面试题库",
            "每次最多选择一个",
            "不诱导补造故事",
        ):
            self.assertIn(expected, radar)
        for expected in (
            "不把单一指标自动当成最终结论",
            "短期收益",
            "长期影响",
            "未经授权的逆向",
        ):
            self.assertIn(expected, commercialization)
        for expected in (
            "战略问题定义",
            "战略选项",
            "决策影响",
            "建议权与决策权边界",
        ):
            self.assertIn(expected, strategy)
        for expected in (
            "从岗位决定深挖重点",
            "从考察意图决定回答角度",
            "先给结论",
            "选择二至四个支撑角度",
            "不新增、删除或重命名最终文档",
        ):
            self.assertIn(expected, thinking)

    def test_mock_lab_routes_optional_playbooks_patterns_modes_and_contexts(self):
        root = SKILLS / "mock-lab"
        skill = (root / "SKILL.md").read_text(encoding="utf-8")
        protocol = (root / "references" / "interview-protocol.md").read_text(
            encoding="utf-8"
        )
        role_playbooks = {
            path.name
            for path in (root / "references" / "role-playbooks").glob("*.md")
        }
        question_patterns = {
            path.name
            for path in (root / "references" / "question-patterns").glob("*.md")
        }
        question_archetypes = {
            path.name
            for path in (root / "references" / "question-archetypes").glob("*.md")
        }
        answer_blueprints = {
            path.name
            for path in (root / "references" / "answer-blueprints").glob("*.md")
        }
        domain_lenses = {
            path.name
            for path in (root / "references" / "domain-lenses").glob("*.md")
        }
        interview_modes = {
            path.name
            for path in (root / "references" / "interview-modes").glob("*.md")
        }
        case_contexts = {
            path.name
            for path in (root / "references" / "case-contexts").glob("*.md")
        }
        self.assertEqual(
            role_playbooks,
            {
                "product.md",
                "strategy-business-analysis.md",
                "management-consulting.md",
                "data-analysis.md",
            },
        )
        self.assertEqual(
            question_patterns,
            {
                "common-behavioral.md",
                "product.md",
                "strategy-business-analysis.md",
                "management-consulting.md",
                "data-analysis.md",
            },
        )
        self.assertEqual(question_archetypes, {"internet-interview-map.md"})
        self.assertEqual(answer_blueprints, {"internet-interview-answers.md"})
        self.assertEqual(domain_lenses, {"commercialization.md"})
        self.assertEqual(
            interview_modes,
            {"case-interview.md", "group-discussion.md"},
        )
        self.assertEqual(case_contexts, {"internet-business.md"})
        for expected in (
            "references/role-playbooks/product.md",
            "references/role-playbooks/strategy-business-analysis.md",
            "references/role-playbooks/management-consulting.md",
            "references/role-playbooks/data-analysis.md",
            "references/question-archetypes/internet-interview-map.md",
            "references/question-patterns/common-behavioral.md",
            "references/question-patterns/product.md",
            "references/question-patterns/strategy-business-analysis.md",
            "references/question-patterns/management-consulting.md",
            "references/question-patterns/data-analysis.md",
            "references/answer-blueprints/internet-interview-answers.md",
            "references/domain-lenses/commercialization.md",
            "references/interview-modes/case-interview.md",
            "references/interview-modes/group-discussion.md",
            "references/case-contexts/internet-business.md",
            "不是岗位",
            "岗位未命中现有参考时不得停止",
            "目标岗位是启动模拟的唯一必需输入",
            "不机械复述原题",
            "“管培生”不是统一职能",
            "真实模拟",
            "逐题训练",
        ):
            self.assertIn(expected, skill)
        for expected in (
            "通用面试协议",
            "用户选择的面试模式",
            "可选岗位 Playbook",
            "可选互联网题型、问题模式与领域视角",
            "JD 与用户真实材料",
            "不顺序遍历文件",
            "不得声称改写后的问题是真实公司原题",
            "interview-modes/case-interview.md",
            "interview-modes/group-discussion.md",
        ):
            self.assertIn(expected, protocol)
        product_role = (
            root / "references" / "role-playbooks" / "product.md"
        ).read_text(encoding="utf-8")
        product_patterns = (
            root / "references" / "question-patterns" / "product.md"
        ).read_text(encoding="utf-8")
        for expected in (
            "用户理解与需求发现",
            "方案设计、优先级与取舍",
            "数据指标、实验与效果归因",
            "项目推进与跨团队协作",
            "商业模式、行业与竞争判断",
        ):
            self.assertIn(expected, product_role)
        for expected in (
            "经历全景与个人贡献",
            "指标设计、异常诊断与效果归因",
            "B 端、平台与数据产品",
            "AI 产品与技术应用",
            "费米估算与 Market Sizing",
            "发散与表达",
        ):
            self.assertIn(expected, product_patterns)
        combined = product_role + product_patterns
        for forbidden in ("建议全文背诵", "把同龄人卷成春饼"):
            self.assertNotIn(forbidden, combined)

        strategy_role = (
            root
            / "references"
            / "role-playbooks"
            / "strategy-business-analysis.md"
        ).read_text(encoding="utf-8")
        consulting_role = (
            root / "references" / "role-playbooks" / "management-consulting.md"
        ).read_text(encoding="utf-8")
        data_role = (
            root / "references" / "role-playbooks" / "data-analysis.md"
        ).read_text(encoding="utf-8")
        common_patterns = (
            root / "references" / "question-patterns" / "common-behavioral.md"
        ).read_text(encoding="utf-8")
        case_mode = (
            root / "references" / "interview-modes" / "case-interview.md"
        ).read_text(encoding="utf-8")
        group_mode = (
            root / "references" / "interview-modes" / "group-discussion.md"
        ).read_text(encoding="utf-8")
        internet_context = (
            root / "references" / "case-contexts" / "internet-business.md"
        ).read_text(encoding="utf-8")
        archetype_map = (
            root
            / "references"
            / "question-archetypes"
            / "internet-interview-map.md"
        ).read_text(encoding="utf-8")
        answer_blueprint = (
            root
            / "references"
            / "answer-blueprints"
            / "internet-interview-answers.md"
        ).read_text(encoding="utf-8")
        commercialization_lens = (
            root / "references" / "domain-lenses" / "commercialization.md"
        ).read_text(encoding="utf-8")
        for expected in (
            "行业、公司与竞争研究",
            "数据、信息源与交叉验证",
            "战略选择、资源取舍和风险",
        ):
            self.assertIn(expected, strategy_role)
        for expected in (
            "假设驱动和证据更新",
            "定量分析、估算和数据解释",
            "综合判断、建议与风险",
        ):
            self.assertIn(expected, consulting_role)
        for expected in (
            "指标体系和统计口径",
            "实验设计、统计推断与因果边界",
            "SQL、Python 和可复现分析",
        ):
            self.assertIn(expected, data_role)
        for expected in (
            "领导力与影响力",
            "冲突与说服",
            "失败、挑战与复盘",
        ):
            self.assertIn(expected, common_patterns)
        for expected in (
            "背景与任务",
            "条件变化或反证",
            "综合建议",
        ):
            self.assertIn(expected, case_mode)
        for expected in (
            "每轮最多引入两个",
            "不按 Leader、Timekeeper、Recorder 等固定角色评分",
            "单人模拟限制",
        ):
            self.assertIn(expected, group_mode)
        for expected in (
            "业务模型",
            "多方角色",
            "可复用冲突",
            "不保存公司题库",
        ):
            self.assertIn(expected, internet_context)
        for expected in (
            "互联网高频母题",
            "费米估算 / Market Sizing",
            "概念辨析与方法论",
            "完整模拟的覆盖规则",
            "至少把费米估算、现场 Case 或其他定量分析放入候选集",
        ):
            self.assertIn(expected, archetype_map)
        for expected in (
            "通用口语结构",
            "费米估算",
            "指标异动与数据分析",
            "商业化与商业模式",
            "概念辨析与方法论",
            "用户原回答已有内容",
            "建议补充内容",
        ):
            self.assertIn(expected, answer_blueprint)
        for expected in (
            "跨岗位领域视角",
            "稳定业务结构",
            "岗位化追问",
            "单位经济",
        ):
            self.assertIn(expected, commercialization_lens)
        for playbook in (product_role, strategy_role, consulting_role, data_role):
            self.assertIn("question-archetypes/internet-interview-map.md", playbook)
            self.assertIn("answer-blueprints/internet-interview-answers.md", playbook)

        distilled = "\n".join(
            path.read_text(encoding="utf-8")
            for directory in (
                "role-playbooks",
                "question-archetypes",
                "question-patterns",
                "answer-blueprints",
                "domain-lenses",
                "interview-modes",
                "case-contexts",
            )
            for path in (root / "references" / directory).glob("*.md")
        )
        for forbidden in (
            "神奇柚子",
            "帝华集团",
            "沃东集团",
            "百度网盘",
            "提取码",
        ):
            self.assertNotIn(forbidden, distilled)

    def test_expected_skills_are_discoverable(self):
        expected = {
            "offerloop-setup",
            "offerloop-workspace",
            "offerloop-workbench",
            "offerloop-agent",
            "job-collection",
            "recruiting-reminder",
            "experience-deepthink",
            "interview-prep",
            "mock-lab",
            "talk-review",
            "pm-sense",
        }
        discovered = {
            path.parent.name for path in SKILLS.glob("*/SKILL.md") if path.is_file()
        }
        self.assertEqual(discovered, expected)

    def test_skill_frontmatter_name_matches_directory(self):
        for skill_file in SKILLS.glob("*/SKILL.md"):
            text = skill_file.read_text(encoding="utf-8")
            frontmatter = text.split("---", 2)[1]
            match = re.search(r"^name:\s*([^\s]+)\s*$", text, re.MULTILINE)
            self.assertIsNotNone(match, skill_file)
            self.assertEqual(match.group(1), skill_file.parent.name)
            description = re.search(
                r"^description:\s*(\S.+)$", frontmatter, re.MULTILINE
            )
            self.assertIsNotNone(description, skill_file)
            self.assertNotIn(description.group(1).strip(), {"|", ">"})
            self.assertLessEqual(len(description.group(1).strip()), 1024)
            self.assertNotIn("<", description.group(1))
            self.assertNotIn(">", description.group(1))

    def test_no_stale_information_collection_dependency(self):
        reminder = (SKILLS / "recruiting-reminder" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("information-collection", reminder)

    def test_business_skills_point_to_offerloop_setup(self):
        for name in (
            "job-collection",
            "recruiting-reminder",
            "experience-deepthink",
            "interview-prep",
            "mock-lab",
            "talk-review",
            "pm-sense",
        ):
            text = (SKILLS / name / "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("offerloop-setup", text, name)

    def test_business_skills_define_opt_in_feishu_notifications(self):
        for name in ("job-collection", "recruiting-reminder"):
            text = (SKILLS / name / "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("## 飞书消息通知", text, name)
            self.assertIn("notifications", text, name)
            self.assertIn("lark-im", text, name)
            self.assertIn("idempotency key", text, name)
            self.assertIn("通知失败", text, name)
            self.assertIn("不回滚", text, name)

    def test_recruiting_status_sync_is_bidirectional_and_conflict_safe(self):
        reminder = (SKILLS / "recruiting-reminder" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("完成状态` 双向对账", reminder)
        self.assertIn("completion_status_sync.json", reminder)
        self.assertIn("主表变更可同步到子表", reminder)
        self.assertIn("子表变更也可同步到主表", reminder)
        self.assertIn("标记 `conflict`，不覆盖任一边", reminder)
        self.assertNotIn("以子表 `完成状态` 为准回写主表", reminder)

    def test_setup_guides_notification_choices_and_bot_installation(self):
        setup = (SKILLS / "offerloop-setup" / "SKILL.md").read_text(encoding="utf-8")
        onboarding = (
            SKILLS / "offerloop-setup" / "references" / "onboarding.md"
        ).read_text(encoding="utf-8")
        for expected in (
            "私聊还是群聊",
            "目标用户姓名或目标群名称",
            "bot 还是 user",
            "im +chat-search",
            "im +chat-members-list",
        ):
            self.assertIn(expected, setup)
        for expected in (
            "启用机器人能力",
            "发布应用版本",
            "安装或更新应用",
            "加入目标群",
            "im:message:send_as_bot",
        ):
            self.assertIn(expected, onboarding)

    def test_setup_first_run_welcome_introduces_all_ten_skills(self):
        setup = (SKILLS / "offerloop-setup" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        metadata = (
            SKILLS / "offerloop-setup" / "agents" / "openai.yaml"
        ).read_text(encoding="utf-8")
        welcome = (
            SKILLS / "offerloop-setup" / "references" / "welcome.md"
        ).read_text(encoding="utf-8")
        self.assertIn("references/welcome.md", setup)
        self.assertIn("all ten OfferLoop skills", metadata)
        self.assertIn("不要在能力介绍前要求目标岗位", setup)
        self.assertIn("安装只添加了 Skill", welcome)
        for name in (
            "offerloop-setup",
            "offerloop-workspace",
            "offerloop-workbench",
            "job-collection",
            "recruiting-reminder",
            "experience-deepthink",
            "pm-sense",
            "interview-prep",
            "mock-lab",
            "talk-review",
        ):
            self.assertIn(f"`{name}`", welcome)

    def test_workspace_collaboration_boundaries_are_documented(self):
        setup = (SKILLS / "offerloop-setup" / "SKILL.md").read_text(encoding="utf-8")
        collection = (SKILLS / "job-collection" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        reminder = (SKILLS / "recruiting-reminder" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        workspace = (SKILLS / "offerloop-workspace" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        self.assertIn("知识库生命周期", setup)
        self.assertIn("offerloop-workspace", setup)
        self.assertIn("offerloop-workspace", collection)
        self.assertIn("工作台错误都不回滚", collection)
        self.assertIn("offerloop-workspace", reminder)
        self.assertIn("不要替其他 Skill 读取来源、邮箱", workspace)
        self.assertIn("不负责搭建可选的飞书工作台", workspace)

    def test_readme_and_migration_describe_the_ten_skill_workspace(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        migration = (ROOT / "MIGRATION.md").read_text(encoding="utf-8")
        self.assertNotIn("Skills-3", readme)
        for expected in (
            "offerloop-workspace",
            "offerloop-workbench",
            "OfferLoop 求职空间",
            "求职进展",
            "笔面试中心",
        ):
            self.assertIn(expected, readme)
        self.assertIn("旧双 Base", migration)
        self.assertIn("永久保留", migration)

    def test_readme_has_safe_agent_neutral_install_and_upgrade_paths(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("npx skills add riwonswain-ovo/OfferLoop -g", readme)
        self.assertIn("npx skills update offerloop-setup", readme)
        self.assertIn("标准 `SKILL.md`", readme)
        self.assertIn("可恢复备份", readme)
        self.assertNotIn("--agent", readme)
        for product_name in ("Claude Code", "Hermes", "WorkBuddy"):
            self.assertNotIn(product_name, readme)
        self.assertIn("当前只支持 Codex", readme)
        self.assertIn("不会新建第二个妙搭应用", readme)
        self.assertIn("~/.config/offerloop/", readme)
        self.assertIn("~/.local/state/offerloop/", readme)

    def test_readme_follows_the_new_user_journey(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        sections = (
            "## 1. 安装前准备",
            "## 2. 如何安装",
            "## 3. 认识十一个 Skill",
            "## 4. 旧用户如何升级",
            "## 5. 其他说明",
        )
        positions = [readme.index(section) for section in sections]
        self.assertEqual(positions, sorted(positions))

        skill_headings = (
            "### `offerloop-setup`",
            "### `job-collection`",
            "### `recruiting-reminder`",
            "### `offerloop-workspace`",
            "### `offerloop-workbench`",
            "### `offerloop-agent`",
            "### `experience-deepthink`",
            "### `pm-sense`",
            "### `interview-prep`",
            "### `mock-lab`",
            "### `talk-review`",
        )
        required_parts = (
            "#### 作用",
            "#### 第一次运行前需要准备",
            "#### 第一次运行流程",
            "#### 第一次运行后的输出",
            "#### 后续每次运行带来的增量",
            "#### 案例",
        )
        start_of_upgrade = readme.index("## 4. 旧用户如何升级")
        for index, heading in enumerate(skill_headings):
            start = readme.index(heading)
            end = (
                readme.index(skill_headings[index + 1])
                if index + 1 < len(skill_headings)
                else start_of_upgrade
            )
            skill_section = readme[start:end]
            for part in required_parts:
                self.assertIn(part, skill_section, heading)

    def test_setup_docs_match_capability_preflight_and_recovery(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        setup = (SKILLS / "offerloop-setup" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        onboarding = (
            SKILLS / "offerloop-setup" / "references" / "onboarding.md"
        ).read_text(encoding="utf-8")
        for text in (readme, onboarding):
            self.assertNotIn("当前版本限制", text)
            self.assertIn("核心空间", text)
            self.assertIn("三张 Base", text)
            self.assertIn("工作台", text)
            self.assertIn("可选", text)
            self.assertIn("lark-shared", text)
            self.assertIn("lark-apps", text)
        for text in (readme, onboarding):
            self.assertIn("npx @larksuite/cli@latest install", text)
        self.assertIn("npx skills add larksuite/cli -g -y", readme)
        self.assertIn("npx skills add larksuite/cli -g -a", onboarding)
        self.assertIn("目标已登记时运行期只需要", setup)
        self.assertIn("线上条件一律保持 `unverified`", setup)

    def test_no_scaffold_placeholders_remain(self):
        for skill_file in SKILLS.glob("*/SKILL.md"):
            self.assertNotIn("TODO", skill_file.read_text(encoding="utf-8"), skill_file)

    def test_coaching_skills_use_feishu_markdown_artifact_contract(self):
        names = (
            "experience-deepthink",
            "interview-prep",
            "mock-lab",
            "talk-review",
            "pm-sense",
        )
        for name in names:
            skill = (SKILLS / name / "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("artifact-contract.md", skill, name)
            self.assertIn("Markdown", skill, name)
            self.assertIn("lark-doc", skill, name)
            self.assertIn("run_id", skill, name)
        product = (SKILLS / "pm-sense" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("不生成小红书", product)
        mock = (SKILLS / "mock-lab" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("不得读取或依赖本地 `mock-interview`", mock)
        for name in names:
            skill = (SKILLS / name / "SKILL.md").read_text(encoding="utf-8")
            self.assertNotIn("interview-question-bank", skill)

    def test_event_consumers_share_recruiting_reminder_contract(self):
        contract = (
            SKILLS
            / "recruiting-reminder"
            / "references"
            / "event-contract.md"
        ).read_text(encoding="utf-8")
        for name in ("interview-prep", "talk-review"):
            skill = (SKILLS / name / "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("event-contract.md", skill)
            self.assertIn("event_lookup.py", skill)
        self.assertIn("不得在 `ambiguous` 时取第一条", contract)
        self.assertIn("笔试：拒绝回填", contract)

    def test_local_deployment_workspaces_and_generated_state_are_ignored(self):
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        for expected in ("/apps/", "/.hermes/", ".spark/", ".spark_project", "*.tsbuildinfo"):
            self.assertIn(expected, ignore)

    def test_workspace_homepage_template_matches_the_readme_contract(self):
        template = (
            SKILLS / "offerloop-workspace" / "assets" / "homepage-template.md"
        ).read_text(encoding="utf-8")
        self.assertIn("# OfferLoop 使用指南", template)
        self.assertIn("OFFERLOOP:OPTIONAL:WORKBENCH", template)
        self.assertIn("## OfferLoop 的 11 个 Skill", template)
        for name in (
            "offerloop-setup",
            "offerloop-workspace",
            "offerloop-workbench",
            "offerloop-agent",
            "job-collection",
            "recruiting-reminder",
            "experience-deepthink",
            "pm-sense",
            "interview-prep",
            "mock-lab",
            "talk-review",
        ):
            self.assertIn(f"`{name}`", template)
        self.assertNotIn("OFFERLOOP:MANAGED", template)
        self.assertNotIn("请在飞书 UI 中插入", template)

    def test_workspace_contract_uses_core_data_and_training_layout(self):
        workspace = (
            SKILLS / "offerloop-workspace" / "SKILL.md"
        ).read_text(encoding="utf-8")
        homepage = (
            SKILLS / "offerloop-workspace" / "references" / "homepage-contract.md"
        ).read_text(encoding="utf-8")
        expected = (
            "01｜核心求职数据",
            "企业清单",
            "求职进展",
            "笔面试中心",
            "02｜当前简历",
            "03｜经历深挖",
            "04｜面试准备",
            "05｜面试复盘",
            "ASR 待复盘",
            "已完成复盘",
            "06｜产品 Sense",
            "07｜模拟面试",
        )
        for text in (workspace, homepage):
            for title in expected:
                self.assertIn(title, text)
            self.assertNotIn("01｜当前简历", text)
            self.assertNotIn("06｜训练与题库", text)
            self.assertNotIn("待学会题库", text)

    def test_workbench_keeps_a_collapsible_ten_skill_map(self):
        page = (
            SKILLS
            / "offerloop-workbench"
            / "assets"
            / "workbench-template"
            / "client"
            / "src"
            / "pages"
            / "workbench"
            / "WorkbenchPage.tsx"
        ).read_text(encoding="utf-8")
        self.assertIn("OfferLoop 能力地图", page)
        self.assertIn("<details", page)
        self.assertIn("SKILL_GROUPS", page)
        for name in (
            "offerloop-setup",
            "offerloop-workspace",
            "offerloop-workbench",
            "offerloop-agent",
            "job-collection",
            "recruiting-reminder",
            "experience-deepthink",
            "pm-sense",
            "interview-prep",
            "mock-lab",
            "talk-review",
        ):
            self.assertIn(f"name: '{name}'", page)

    def test_only_offerloop_skills_are_packaged(self):
        discovered = {
            path.parent.name for path in SKILLS.glob("*/SKILL.md") if path.is_file()
        }
        for external in ("resume-craft", "resume-match", "cover-letter", "job-hunt"):
            self.assertNotIn(external, discovered)

    def test_resume_version_is_user_maintained_in_both_business_bases(self):
        collection = (SKILLS / "job-collection" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        reminder = (SKILLS / "recruiting-reminder" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        for text in (collection, reminder):
            self.assertIn("`投递简历版本`", text)
            self.assertIn("SingleSelect", text)
            self.assertIn("不读取飞书知识库", text)

    def test_deployable_templates_do_not_reconfigure_git_hooks(self):
        templates = (
            SKILLS / "offerloop-workbench" / "assets" / "workbench-template",
            SKILLS / "offerloop-setup" / "assets" / "progress-sync-template",
        )
        for template in templates:
            package = (template / "package.json").read_text(encoding="utf-8")
            self.assertNotIn('"prepare"', package)
            self.assertNotIn("core.hooksPath", package)

    def test_templates_do_not_ship_unused_remote_profile_scaffold(self):
        templates = (
            SKILLS / "offerloop-workbench" / "assets" / "workbench-template",
            SKILLS / "offerloop-setup" / "assets" / "progress-sync-template",
        )
        for template in templates:
            source = template / "client" / "src"
            profile_scaffold = (
                source / "components" / "business-ui" / "user-profile"
            )
            self.assertFalse(any(profile_scaffold.glob("*")))
            source_text = "\n".join(
                path.read_text(encoding="utf-8")
                for path in source.rglob("*.ts*")
            )
            self.assertNotIn("jsAPITicket", source_text)
            self.assertNotIn("redirectURLRef", source_text)

    def test_release_gate_covers_multi_agent_installer_and_residual_risk(self):
        acceptance = (ROOT / "scripts" / "cold_install_acceptance.py").read_text(
            encoding="utf-8"
        )
        end_to_end = (
            ROOT / "docs" / "cases" / "end-to-end-acceptance.md"
        ).read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(
            encoding="utf-8"
        )
        security = (ROOT / "SECURITY.md").read_text(encoding="utf-8")
        for agent in ("codex", "claude-code", "hermes-agent"):
            self.assertIn(f'"{agent}"', acceptance)
        self.assertIn("four Agents, eleven Skills", acceptance)
        self.assertNotIn("four Agents, ten Skills", acceptance)
        self.assertIn("版本升级为 4", end_to_end)
        self.assertNotIn("版本升级为 3", end_to_end)
        self.assertIn("install_offerloop.py", acceptance)
        self.assertIn("already_installed", acceptance)
        self.assertIn("cold_install_acceptance.py", workflow)
        for operating_system in ("ubuntu-latest", "macos-latest", "windows-latest"):
            self.assertIn(operating_system, workflow)
        self.assertIn("untrusted_external", security)
        self.assertIn("residual risk", security)

    def test_repository_declares_only_requested_agent_targets(self):
        installer = (ROOT / "scripts" / "install_offerloop.py").read_text(
            encoding="utf-8"
        )
        self.assertIn("exactly the eleven supported OfferLoop Skills", installer)
        self.assertNotIn("exactly the ten supported OfferLoop Skills", installer)
        for expected in (
            '"codex"',
            '"claude-code"',
            '"hermes-agent"',
            '"workbuddy"',
        ):
            self.assertIn(expected, installer)
        self.assertIn(
            'STANDARD_AGENTS = ("codex", "claude-code", "hermes-agent", "workbuddy")',
            installer,
        )
        self.assertIn("ALL_AGENTS = STANDARD_AGENTS", installer)

    def test_business_instructions_are_not_codex_specific(self):
        for skill_file in SKILLS.glob("*/SKILL.md"):
            text = skill_file.read_text(encoding="utf-8")
            self.assertNotIn("对 Codex 说", text, skill_file)
            self.assertNotIn("Codex 执行", text, skill_file)


if __name__ == "__main__":
    unittest.main()
