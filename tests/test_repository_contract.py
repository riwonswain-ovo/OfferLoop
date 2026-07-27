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
            "pmo.md",
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
