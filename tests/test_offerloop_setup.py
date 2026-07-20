from pathlib import Path
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, relative_path):
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


configure = load_module(
    "offerloop_configure", "skills/offerloop-setup/scripts/configure.py"
)
preflight = load_module(
    "offerloop_preflight", "skills/offerloop-setup/scripts/preflight.py"
)
status_model = load_module(
    "offerloop_setup_status_model", "skills/offerloop-setup/scripts/status_model.py"
)
deployment_plan = load_module(
    "offerloop_deployment_plan", "skills/offerloop-setup/scripts/deployment_plan.py"
)
materialize_app_template = load_module(
    "offerloop_materialize_app_template",
    "skills/offerloop-setup/scripts/materialize_app_template.py",
)


class OfferLoopSetupTest(unittest.TestCase):
    def test_not_selected_capability_is_not_failure(self):
        report = status_model.build_report(selected={"collection"}, checks=[])

        self.assertEqual(
            report["capabilities"]["reminder"]["status"], "not_selected"
        )
        self.assertEqual(
            report["capabilities"]["workspace"]["status"], "not_selected"
        )

    def test_blocked_has_highest_precedence(self):
        self.assertEqual(
            status_model.aggregate_status(["ready", "needs_action", "blocked"]),
            "blocked",
        )

    def test_unverified_is_distinct_from_ready(self):
        self.assertEqual(
            status_model.aggregate_status(["ready", "unverified"]), "unverified"
        )

    def test_private_config_is_written_outside_skill(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            configure.write_private_json(path, {"lark_profile": "offerloop"})
            self.assertEqual(path, Path(directory) / "offerloop" / "config.json")
            self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")
            self.assertEqual(json.loads(path.read_text())["lark_profile"], "offerloop")

    def test_preflight_discovers_all_bundled_skills(self):
        with tempfile.TemporaryDirectory() as directory:
            result = preflight.run_checks({"XDG_CONFIG_HOME": directory})
            self.assertTrue(all(result["skills"].values()))
            self.assertEqual(
                set(result["skills"]),
                {
                    "offerloop-setup",
                    "offerloop-workspace",
                    "job-collection",
                    "recruiting-reminder",
                },
            )

    def test_collection_preflight_does_not_require_imap(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            configure.write_private_json(
                path,
                {
                    "lark_profile": "codex",
                    "target_base_url": "https://example.feishu.cn/base/source",
                    "progress_base_url": "https://example.feishu.cn/base/progress",
                },
            )

            result = preflight.run_checks(
                {"XDG_CONFIG_HOME": directory}, capability="collection"
            )

            self.assertEqual(result["capabilities"]["reminder"]["status"], "not_selected")
            self.assertNotIn("imap_config", {check["id"] for check in result["checks"]})

    def test_initialized_imap_template_is_not_ready_before_user_fills_it(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"XDG_CONFIG_HOME": directory}
            destination, created = configure.init_imap(environment)

            self.assertTrue(created)
            self.assertEqual(oct(destination.stat().st_mode & 0o777), "0o600")
            report = preflight.run_checks(environment, capability="reminder")
            checks = {check["id"]: check for check in report["checks"]}
            self.assertEqual(checks["local.imap_config"]["status"], "needs_action")

    def test_imap_preflight_rejects_legacy_placeholders_without_echoing_them(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"XDG_CONFIG_HOME": directory}
            path = configure.config_root(environment) / "recruiting-reminder" / ".env"
            path.parent.mkdir(parents=True)
            path.write_text(
                "IMAP_HOST=imap.example.com\n"
                "IMAP_PORT=993\n"
                "IMAP_LOGIN=you@example.com\n"
                "IMAP_PASSWORD=your-app-specific-password\n"
                "MAILBOX=INBOX\n"
                "TZ=Asia/Shanghai\n",
                encoding="utf-8",
            )
            path.chmod(0o600)

            report = preflight.run_checks(environment, capability="reminder")
            checks = {check["id"]: check for check in report["checks"]}
            self.assertEqual(checks["local.imap_config"]["status"], "needs_action")
            serialized = json.dumps(report)
            self.assertNotIn("you@example.com", serialized)
            self.assertNotIn("your-app-specific-password", serialized)

    def test_imap_preflight_accepts_complete_private_config(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"XDG_CONFIG_HOME": directory}
            path = configure.config_root(environment) / "recruiting-reminder" / ".env"
            path.parent.mkdir(parents=True)
            path.write_text(
                "IMAP_HOST=imap.mail-provider.test\n"
                "IMAP_PORT=993\n"
                "IMAP_LOGIN=person@example.com\n"
                "IMAP_PASSWORD=private-value\n"
                "MAILBOX=INBOX\n"
                "TZ=Asia/Shanghai\n",
                encoding="utf-8",
            )
            path.chmod(0o600)

            report = preflight.run_checks(environment, capability="reminder")
            checks = {check["id"]: check for check in report["checks"]}
            self.assertEqual(checks["local.imap_config"]["status"], "ready")

    def test_workspace_preflight_requires_workbench_without_printing_locator(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            configure.write_private_json(
                path,
                {
                    "lark_profile": "codex",
                    "target_base_url": "https://example.feishu.cn/base/source",
                    "progress_base_url": "https://example.feishu.cn/base/progress",
                    "reminder_base_url": "https://example.feishu.cn/base/reminder",
                    "wiki_space_id": "space_example",
                    "workspace_home_node_token": "wikcnExample",
                },
            )

            result = preflight.run_checks(
                {"XDG_CONFIG_HOME": directory}, capability="workspace"
            )

            checks = {check["id"]: check for check in result["checks"]}
            self.assertEqual(
                checks["local.workspace_locators"]["status"], "needs_action"
            )
            self.assertNotIn("space_example", json.dumps(result))
            self.assertNotIn("wikcnExample", json.dumps(result))

    def test_full_preflight_reports_instant_sync_ready_from_bridge_locators(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            configure.write_private_json(
                path,
                {
                    "lark_profile": "codex",
                    "target_base_url": "https://example.feishu.cn/base/source",
                    "progress_base_url": "https://example.feishu.cn/base/progress",
                    "reminder_base_url": "https://example.feishu.cn/base/reminder",
                    "wiki_space_id": "space_example",
                    "workspace_home_node_token": "wikcnExample",
                    "workbench_url": "https://example.feishuapp.com/app/app_example",
                    "progress_sync": {
                        "app_id": "app_sync",
                        "endpoint": "https://example.feishuapp.com/app/app_sync/openapi/job-progress-sync",
                        "workflow_id": "wkf_example",
                        "status": "enabled",
                    },
                },
            )

            result = preflight.run_checks(
                {"XDG_CONFIG_HOME": directory}, capability="full"
            )

            checks = {check["id"]: check for check in result["checks"]}
            self.assertEqual(checks["local.progress_sync_bridge"]["status"], "ready")
            self.assertNotIn("FEISHU_APP_SECRET", json.dumps(result))

    def test_workspace_locators_extend_existing_config(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            configure.write_private_json(
                path,
                {
                    "lark_profile": "codex",
                    "target_base_url": "https://example.feishu.cn/base/source",
                },
            )

            result = configure.update_locator_config(
                path,
                {
                    "progress_base_url": "https://example.feishu.cn/base/progress",
                    "reminder_base_url": "https://example.feishu.cn/base/reminder",
                    "wiki_space_id": "space_example",
                    "workspace_home_node_token": "wikcnExample",
                    "schema_version": 2,
                },
            )

            self.assertEqual(result["lark_profile"], "codex")
            self.assertEqual(
                result["target_base_url"],
                "https://example.feishu.cn/base/source",
            )
            self.assertEqual(result["schema_version"], 2)
            self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")

    def test_workbench_url_is_saved_and_preserves_progress_sync_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            configure.write_private_json(
                path,
                {
                    "progress_sync": {
                        "endpoint": "https://example.com/sync",
                        "app_id": "app_example",
                        "workflow_id": "workflow_example",
                    },
                },
            )

            result = configure.update_locator_config(
                path,
                {"workbench_url": "https://example.feishuapp.com/app/app_example"},
            )

            self.assertEqual(
                result["workbench_url"], "https://example.feishuapp.com/app/app_example"
            )
            self.assertEqual(result["progress_sync"]["workflow_id"], "workflow_example")

    def test_workbench_url_rejects_unsafe_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            for value in (
                "http://example.com",
                "javascript:alert(1)",
                "https://user:pass@example.com/app",
                "https://example.com/app#fragment",
            ):
                with self.assertRaises(ValueError, msg=value):
                    configure.update_locator_config(path, {"workbench_url": value})

    def test_progress_sync_locators_merge_and_make_full_preflight_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"XDG_CONFIG_HOME": directory}
            path = configure.config_file(environment)
            configure.write_private_json(
                path,
                {
                    "lark_profile": "codex",
                    "target_base_url": "https://example.feishu.cn/base/source",
                    "progress_base_url": "https://example.feishu.cn/base/progress",
                    "reminder_base_url": "https://example.feishu.cn/base/reminder",
                    "wiki_space_id": "space_example",
                    "workspace_home_node_token": "wikcnExample",
                    "workbench_url": "https://example.feishuapp.com/app/workbench",
                    "progress_sync": {"provider": "miaoda"},
                },
            )

            result = configure.update_progress_sync_config(
                path,
                {
                    "app_id": "app_sync",
                    "endpoint": "https://example.feishuapp.com/app/app_sync/openapi/sync",
                    "workflow_id": "wkf_example",
                    "status": "enabled",
                },
            )

            self.assertEqual(result["progress_sync"]["provider"], "miaoda")
            self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")
            report = preflight.run_checks(environment, capability="full")
            checks = {check["id"]: check for check in report["checks"]}
            self.assertEqual(checks["local.progress_sync_bridge"]["status"], "ready")

    def test_progress_sync_rejects_unsafe_or_incomplete_enabled_config(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            for value in (
                "http://example.com/sync",
                "https://user:pass@example.com/sync",
                "https://example.com/sync#secret",
            ):
                with self.assertRaises(ValueError, msg=value):
                    configure.update_progress_sync_config(path, {"endpoint": value})
            with self.assertRaisesRegex(ValueError, "cannot be enabled"):
                configure.update_progress_sync_config(path, {"status": "enabled"})
            with self.assertRaisesRegex(ValueError, "unknown keys"):
                configure.update_progress_sync_config(path, {"app_secret": "nope"})

    def test_configure_cli_can_register_a_complete_progress_sync_bridge(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = dict(os.environ, XDG_CONFIG_HOME=directory)
            subprocess.run(
                [
                    "python3",
                    str(ROOT / "skills/offerloop-setup/scripts/configure.py"),
                    "--profile",
                    "codex",
                    "--target-base-url",
                    "https://example.feishu.cn/base/source",
                    "--progress-base-url",
                    "https://example.feishu.cn/base/progress",
                    "--progress-sync-app-id",
                    "app_sync",
                    "--progress-sync-endpoint",
                    "https://example.feishuapp.com/app/app_sync/openapi/sync",
                    "--progress-sync-workflow-id",
                    "wkf_example",
                    "--progress-sync-status",
                    "enabled",
                ],
                check=True,
                capture_output=True,
                text=True,
                env=environment,
            )

            saved = configure.load_config(configure.config_file(environment))
            self.assertEqual(saved["progress_sync"]["status"], "enabled")
            self.assertEqual(saved["progress_sync"]["workflow_id"], "wkf_example")

    def test_preflight_reports_workspace_locator_readiness_without_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            configure.write_private_json(
                path,
                {
                    "lark_profile": "codex",
                    "target_base_url": "https://example.feishu.cn/base/source",
                    "progress_base_url": "https://example.feishu.cn/base/progress",
                    "reminder_base_url": "https://example.feishu.cn/base/reminder",
                    "wiki_space_id": "space_example",
                    "workspace_home_node_token": "wikcnExample",
                    "schema_version": 2,
                },
            )

            result = preflight.run_checks({"XDG_CONFIG_HOME": directory})

            self.assertEqual(
                result["offerloop_config"]["locators"],
                {
                    "lark_profile": True,
                    "target_base_url": True,
                    "progress_base_url": True,
                    "reminder_base_url": True,
                    "wiki_space_id": True,
                    "workspace_home_node_token": True,
                    "workbench_url": False,
                    "schema_version": True,
                },
            )
            self.assertNotIn("codex", json.dumps(result))

    def test_public_config_rejects_secret_keys(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})

            with self.assertRaisesRegex(ValueError, "secret"):
                configure.update_locator_config(
                    path,
                    {"FEISHU_APP_SECRET": "must-not-be-written"},
                )

    def test_full_deployment_plan_is_redacted_and_requires_all_resources(self):
        plan = deployment_plan.build_plan({}, "full")

        self.assertEqual(plan["capability"], "full")
        self.assertFalse(plan["safety"]["stores_secrets"])
        self.assertFalse(plan["safety"]["creates_resources"])
        self.assertEqual(
            {item["id"] for item in plan["resources"]},
            {
                "enterprise_base",
                "progress_base",
                "reminder_base",
                "wiki_home",
                "workbench",
                "progress_sync",
            },
        )
        statuses = {item["id"]: item["status"] for item in plan["resources"]}
        self.assertTrue(all(status == "pending" for status in statuses.values()))

    def test_bundled_app_templates_have_redacted_manifests(self):
        assets = ROOT / "skills" / "offerloop-setup" / "assets"
        expected = {
            "workbench-template": "offerloop-workbench",
            "progress-sync-template": "offerloop-progress-sync",
        }
        forbidden = {
            ".git", ".spark", ".spark_project", ".env", ".env.local",
            "node_modules", "dist", "logs",
        }
        for directory, template_id in expected.items():
            root = assets / directory
            manifest = json.loads((root / "template.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["template_id"], template_id)
            self.assertTrue(manifest["required_environment"])
            self.assertFalse(any((root / name).exists() for name in forbidden))
            self.assertEqual(
                [path for path in root.rglob("*") if path.is_symlink()], []
            )

    def test_materializer_preserves_new_app_binding_and_private_files(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory)
            (destination / ".spark").mkdir()
            binding = destination / ".spark" / "meta.json"
            binding.write_text('{"app_id":"app_new_user"}\n', encoding="utf-8")
            private_env = destination / ".env.local"
            private_env.write_text("PRIVATE=value\n", encoding="utf-8")

            result = materialize_app_template.materialize(
                "progress-sync", destination
            )

            self.assertEqual(result["template_id"], "offerloop-progress-sync")
            self.assertEqual(binding.read_text(encoding="utf-8"), '{"app_id":"app_new_user"}\n')
            self.assertEqual(private_env.read_text(encoding="utf-8"), "PRIVATE=value\n")
            self.assertTrue((destination / "package.json").is_file())
            self.assertFalse((destination / "template.json").exists())

    def test_materializer_requires_a_real_miaoda_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "not bound"):
                materialize_app_template.materialize(
                    "workbench", Path(directory), dry_run=True
                )

    def test_deployment_checkpoint_is_private_and_does_not_include_locators(self):
        with tempfile.TemporaryDirectory() as directory:
            path = deployment_plan.checkpoint_file({"XDG_STATE_HOME": directory})
            plan = deployment_plan.build_plan(
                {
                    "target_base_url": "https://example.feishu.cn/base/private",
                    "progress_base_url": "https://example.feishu.cn/base/private-progress",
                    "reminder_base_url": "https://example.feishu.cn/base/private-reminder",
                    "wiki_space_id": "space-private",
                    "workspace_home_node_token": "wiki-private",
                    "workbench_url": "https://example.feishuapp.com/app/private",
                    "progress_sync": {
                        "app_id": "app-private",
                        "endpoint": "https://example.feishuapp.com/app/private/openapi/sync",
                        "workflow_id": "workflow-private",
                        "status": "enabled",
                    },
                },
                "full",
            )
            deployment_plan.write_checkpoint(path, plan)

            content = path.read_text(encoding="utf-8")
            self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")
            self.assertNotIn("private", content)
            self.assertNotIn("endpoint", content)


if __name__ == "__main__":
    unittest.main()
