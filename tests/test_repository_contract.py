from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"


class RepositoryContractTest(unittest.TestCase):
    def test_expected_skills_are_discoverable(self):
        expected = {
            "offerloop-setup",
            "offerloop-workspace",
            "job-collection",
            "recruiting-reminder",
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
        for name in ("job-collection", "recruiting-reminder"):
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
        self.assertIn("不负责日常首页维护", setup)
        self.assertIn("offerloop-workspace", setup)
        self.assertIn("offerloop-workspace", collection)
        self.assertIn("同步成功", collection)
        self.assertIn("offerloop-workspace", reminder)
        self.assertIn("不抓招聘信息", workspace)
        self.assertIn("不读邮箱", workspace)

    def test_readme_and_migration_describe_the_four_skill_workspace(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        migration = (ROOT / "MIGRATION.md").read_text(encoding="utf-8")
        self.assertNotIn("Skills-3", readme)
        for expected in (
            "offerloop-workspace",
            "OfferLoop 求职空间",
            "求职进展",
            "笔面试中心",
        ):
            self.assertIn(expected, readme)
        self.assertIn("旧双 Base", migration)
        self.assertIn("永久保留", migration)

    def test_readme_has_safe_cross_agent_install_and_upgrade_paths(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("scripts/install_offerloop.py --agent", readme)
        self.assertIn("--agent claude-code", readme)
        self.assertIn("--upgrade", readme)
        self.assertIn(".offerloop-backups/", readme)
        self.assertIn("WorkBuddy", readme)
        self.assertIn("~/.workbuddy/skills/", readme)
        self.assertIn("~/.config/offerloop/", readme)
        self.assertIn("~/.local/state/offerloop/", readme)

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
            self.assertIn("未登记 `progress_base_url`", text)
            self.assertIn("不会因此", text)
            self.assertIn("阻塞企业信息同步", text)
            self.assertIn("lark-shared", text)
            self.assertIn("lark-apps", text)
        for text in (readme, onboarding):
            self.assertIn("npx @larksuite/cli@latest install", text)
            self.assertIn("npx skills add larksuite/cli -g -a", text)
        self.assertIn("目标已登记时运行期只需要", setup)
        self.assertIn("线上条件一律保持 `unverified`", setup)

    def test_no_scaffold_placeholders_remain(self):
        for skill_file in SKILLS.glob("*/SKILL.md"):
            self.assertNotIn("TODO", skill_file.read_text(encoding="utf-8"), skill_file)

    def test_local_deployment_workspaces_and_generated_state_are_ignored(self):
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        for expected in ("/apps/", "/.hermes/", ".spark/", ".spark_project", "*.tsbuildinfo"):
            self.assertIn(expected, ignore)

    def test_workspace_homepage_template_matches_the_readme_contract(self):
        template = (
            SKILLS / "offerloop-workspace" / "assets" / "homepage-template.md"
        ).read_text(encoding="utf-8")
        self.assertIn("# OfferLoop 使用指南", template)
        self.assertIn("{{workbench_url}}", template)
        self.assertNotIn("OFFERLOOP:MANAGED", template)
        self.assertNotIn("请在飞书 UI 中插入", template)

    def test_deployable_templates_do_not_reconfigure_git_hooks(self):
        assets = SKILLS / "offerloop-setup" / "assets"
        for directory in ("workbench-template", "progress-sync-template"):
            package = (assets / directory / "package.json").read_text(encoding="utf-8")
            self.assertNotIn('"prepare"', package)
            self.assertNotIn("core.hooksPath", package)

    def test_templates_do_not_ship_unused_remote_profile_scaffold(self):
        assets = SKILLS / "offerloop-setup" / "assets"
        for directory in ("workbench-template", "progress-sync-template"):
            source = assets / directory / "client" / "src"
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
        workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(
            encoding="utf-8"
        )
        security = (ROOT / "SECURITY.md").read_text(encoding="utf-8")
        for agent in ("codex", "claude-code", "hermes-agent"):
            self.assertIn(f'"{agent}"', acceptance)
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
