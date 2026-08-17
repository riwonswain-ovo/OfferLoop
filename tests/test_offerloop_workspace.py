from datetime import datetime, timezone
from pathlib import Path
import importlib.util
import json
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = ROOT / "skills" / "offerloop-workspace"
SCRIPT = SKILL_ROOT / "scripts" / "workspace.py"
TEMPLATE = SKILL_ROOT / "assets" / "homepage-template.md"
LEGACY_TEMPLATE = """# Legacy OfferLoop Home
<!-- OFFERLOOP:MANAGED:UPCOMING_EVENTS:START -->
旧事件
<!-- OFFERLOOP:MANAGED:UPCOMING_EVENTS:END -->
<!-- OFFERLOOP:MANAGED:RESUME_DEEP_DIVE:START -->
旧简历题
<!-- OFFERLOOP:MANAGED:RESUME_DEEP_DIVE:END -->
<!-- OFFERLOOP:MANAGED:PRODUCT_SENSE:START -->
旧产品题
<!-- OFFERLOOP:MANAGED:PRODUCT_SENSE:END -->
<!-- OFFERLOOP:PERSONAL:START -->
用户自己的内容
<!-- OFFERLOOP:PERSONAL:END -->
<!-- OFFERLOOP:MANAGED:REFRESH_STATUS:START -->
旧状态
<!-- OFFERLOOP:MANAGED:REFRESH_STATUS:END -->
"""


def load_workspace_module():
    spec = importlib.util.spec_from_file_location("offerloop_workspace", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class OfferLoopWorkspaceTest(unittest.TestCase):
    def test_workspace_config_uses_the_shared_update_safe_file(self):
        workspace = load_workspace_module()
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(
                workspace.config_file({"XDG_CONFIG_HOME": directory}),
                Path(directory) / "offerloop" / "config.json",
            )

    def test_template_is_a_complete_user_guide(self):
        content = TEMPLATE.read_text(encoding="utf-8")
        for expected in (
            "# OfferLoop 使用指南",
            "## 三张核心数据表",
            "## 三条闭环",
            "## 9 个长期 Skill",
            "## 固定目录",
            "不复制记录",
            "`进展状态`",
        ):
            self.assertIn(expected, content)
        self.assertNotIn("OFFERLOOP:MANAGED", content)
        self.assertNotIn("OFFERLOOP:PERSONAL", content)
        self.assertNotIn("请在飞书 UI 中插入", content)

    def test_legacy_refresh_changes_only_named_managed_sections(self):
        workspace = load_workspace_module()
        content = LEGACY_TEMPLATE
        personal = workspace.extract_personal_area(content)

        refreshed = workspace.refresh_managed_sections(
            content,
            {"UPCOMING_EVENTS": "新的未来 7 天事件摘要"},
            refreshed_at=datetime(2026, 7, 17, 20, 0, tzinfo=timezone.utc),
        )

        self.assertIn("新的未来 7 天事件摘要", refreshed)
        self.assertEqual(workspace.extract_personal_area(refreshed), personal)
        self.assertIn("旧简历题", refreshed)
        self.assertIn("旧产品题", refreshed)

    def test_failed_legacy_refresh_preserves_old_modules_and_records_failure_time(self):
        workspace = load_workspace_module()
        content = LEGACY_TEMPLATE

        refreshed = workspace.refresh_managed_sections(
            content,
            {"UPCOMING_EVENTS": "不应写入"},
            refreshed_at=datetime(2026, 7, 17, 20, 0, tzinfo=timezone.utc),
            failure="笔面试中心暂时不可读",
        )

        self.assertNotIn("不应写入", refreshed)
        self.assertIn("2026-07-17T20:00:00+00:00", refreshed)
        self.assertIn("笔面试中心暂时不可读", refreshed)

    def test_initial_homepage_renders_base_links_only(self):
        workspace = load_workspace_module()
        rendered = workspace.render_initial_homepage(
            TEMPLATE.read_text(encoding="utf-8"),
            {
                "workbench_url": "https://example.com/workbench",
                "target_base_url": "https://example.com/enterprise",
                "progress_base_url": "https://example.com/progress",
                "reminder_base_url": "https://example.com/interviews",
            },
        )

        self.assertIn("https://example.com/enterprise", rendered)
        self.assertNotIn("https://example.com/workbench", rendered)
        self.assertNotIn("工作台", rendered)

    def test_initial_homepage_does_not_require_an_optional_app(self):
        workspace = load_workspace_module()
        rendered = workspace.render_initial_homepage(
            TEMPLATE.read_text(encoding="utf-8"),
            {
                "target_base_url": "https://example.com/enterprise",
                "progress_base_url": "https://example.com/progress",
                "reminder_base_url": "https://example.com/interviews",
            },
        )

        self.assertIn("https://example.com/interviews", rendered)
        self.assertNotIn("工作台", rendered)

    def test_resource_registration_preserves_existing_config_and_rejects_secrets(self):
        workspace = load_workspace_module()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text(
                json.dumps({"lark_profile": "codex", "schema_version": 2}),
                encoding="utf-8",
            )

            result = workspace.register_resources(
                path,
                {
                    "wiki_space_id": "space_example",
                    "workspace_home_node_token": "wikcnExample",
                    "workspace_core_data_node_token": "wikcnCore",
                },
            )

            self.assertEqual(result["lark_profile"], "codex")
            self.assertEqual(result["wiki_space_id"], "space_example")
            self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")
            with self.assertRaisesRegex(ValueError, "secret"):
                workspace.register_resources(path, {"WEBHOOK_SECRET": "nope"})

    def test_readiness_ignores_retired_workbench_locator(self):
        workspace = load_workspace_module()
        config = {
            "lark_profile": "codex",
            "target_base_url": "enterprise",
            "progress_base_url": "progress",
            "reminder_base_url": "reminder",
            "wiki_space_id": "space",
            "workspace_home_node_token": "home",
            "workspace_core_data_node_token": "core",
        }
        result = workspace.readiness(config)
        self.assertTrue(result["core_ready"])
        self.assertNotIn("workbench_url", result["optional"])

    def test_future_window_filter_rolls_the_upper_bound_without_document_edits(self):
        workspace = load_workspace_module()
        result = workspace.future_window_filter(
            "fldStart",
            now=datetime(2026, 7, 18, 9, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(
            result,
            {
                "logic": "and",
                "conditions": [
                    ["fldStart", ">", "Today"],
                    ["fldStart", "<", "ExactDate(2026-07-25 00:00)"],
                ],
            },
        )


if __name__ == "__main__":
    unittest.main()
