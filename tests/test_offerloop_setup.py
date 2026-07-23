from pathlib import Path
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from unittest import mock


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
    def make_skill_root(self, parent, *external_skills):
        root = Path(parent) / "skills"
        for name in (*preflight.BUNDLED_SKILLS, *external_skills):
            skill = root / name
            skill.mkdir(parents=True, exist_ok=True)
            (skill / "SKILL.md").write_text(f"# {name}\n", encoding="utf-8")
        return root

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

    def test_windows_does_not_apply_posix_mode_bit_policy(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text("{}\n", encoding="utf-8")
            path.chmod(0o666)
            with mock.patch.object(preflight.os, "name", "nt"):
                self.assertFalse(preflight._permissions_too_open(path))

    def test_preflight_json_is_safe_for_windows_legacy_code_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = dict(os.environ)
            environment.update(
                {
                    "XDG_CONFIG_HOME": directory,
                    "PYTHONIOENCODING": "cp1252",
                }
            )
            completed = subprocess.run(
                [
                    os.sys.executable,
                    str(ROOT / "skills/offerloop-setup/scripts/preflight.py"),
                    "--capability",
                    "collection",
                    "--json",
                ],
                env=environment,
                check=True,
                text=True,
                stdout=subprocess.PIPE,
            )
            self.assertIn("checks", json.loads(completed.stdout))

    def test_preflight_recovers_when_agent_python3_is_too_old(self):
        old_python = "/usr/bin/python3"
        supported_python = "/opt/example/python3.11"

        def which(name, path=None):
            if name == "python3.11":
                return supported_python
            if name == "python3":
                return old_python
            return None

        def run(command, *, environ, timeout=5):
            self.assertEqual(command[0], supported_python)
            return subprocess.CompletedProcess(command, 0, "3.11.9\n", "")

        with mock.patch.object(preflight.sys, "version_info", (3, 9, 6)), mock.patch.object(
            preflight.sys, "executable", old_python
        ), mock.patch.object(preflight.shutil, "which", side_effect=which), mock.patch.object(
            preflight, "_run_local_command", side_effect=run
        ), mock.patch.object(preflight.os, "execve") as execve:
            self.assertTrue(
                preflight._reexec_under_supported_python(
                    {"PATH": "/usr/bin:/opt/example"}
                )
            )

        executable, argv, environment = execve.call_args.args
        self.assertEqual(executable, supported_python)
        self.assertEqual(argv[0], supported_python)
        self.assertEqual(argv[1], str(preflight.Path(preflight.__file__).resolve()))
        self.assertEqual(environment[preflight.PYTHON_REEXEC_GUARD], "1")

    def test_preflight_reports_old_python_when_no_supported_runtime_exists(self):
        with mock.patch.object(preflight.sys, "version_info", (3, 9, 6)), mock.patch.object(
            preflight.shutil, "which", return_value=None
        ), mock.patch.object(preflight.os, "execve") as execve:
            self.assertFalse(
                preflight._reexec_under_supported_python({"PATH": "/usr/bin"})
            )
        execve.assert_not_called()

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

    def test_collection_without_progress_locator_marks_it_optional(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"XDG_CONFIG_HOME": directory}
            path = configure.config_file(environment)
            configure.write_private_json(
                path,
                {
                    "lark_profile": "codex",
                    "target_base_url": "https://example.feishu.cn/base/source",
                },
            )
            skill_root = self.make_skill_root(directory)

            with mock.patch.object(
                preflight.shutil, "which", return_value="/usr/local/bin/lark-cli"
            ):
                report = preflight.run_checks(
                    environment,
                    capability="collection",
                    skills_roots=[skill_root],
                )

            checks = {
                (check["capability"], check["id"]): check
                for check in report["checks"]
            }
            progress = checks[("collection", "local.progress_locator")]
            self.assertEqual(progress["status"], "unverified")
            self.assertIn("可选", progress["summary"])
            self.assertNotEqual(
                report["capabilities"]["collection"]["status"], "needs_action"
            )

    def test_progress_locator_remains_required_outside_collection(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"XDG_CONFIG_HOME": directory}
            path = configure.config_file(environment)
            configure.write_private_json(
                path,
                {
                    "lark_profile": "codex",
                    "target_base_url": "https://example.feishu.cn/base/source",
                    "reminder_base_url": "https://example.feishu.cn/base/reminder",
                    "wiki_space_id": "space_example",
                    "workspace_home_node_token": "wikcnExample",
                    "workbench_url": "https://example.feishuapp.com/app/workbench",
                },
            )
            skill_root = self.make_skill_root(
                directory,
                "lark-apps",
                "lark-base",
                "lark-calendar",
                "lark-doc",
                "lark-shared",
                "lark-wiki",
            )

            report = preflight.run_checks(
                environment,
                capability="full",
                skills_roots=[skill_root],
            )
            checks = {
                (check["capability"], check["id"]): check
                for check in report["checks"]
            }
            self.assertEqual(
                checks[("collection", "local.progress_locator")]["status"],
                "unverified",
            )
            self.assertEqual(
                checks[("reminder", "local.progress_locator")]["status"],
                "needs_action",
            )
            self.assertEqual(
                checks[("workspace", "local.workspace_locators")]["status"],
                "needs_action",
            )
            self.assertEqual(
                checks[("integration", "local.progress_sync_bridge")]["status"],
                "needs_action",
            )

    def test_external_lark_skills_are_capability_specific(self):
        cases = {
            "collection": set(),
            "reminder": {"lark-calendar"},
            "workspace": {"lark-base", "lark-doc", "lark-wiki"},
            "full": {
                "lark-apps",
                "lark-base",
                "lark-calendar",
                "lark-doc",
                "lark-shared",
                "lark-wiki",
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            skill_root = self.make_skill_root(directory)
            for capability, expected in cases.items():
                report = preflight.run_checks(
                    {"XDG_CONFIG_HOME": directory},
                    capability=capability,
                    skills_roots=[skill_root],
                )
                missing = set()
                for check in report["checks"]:
                    if (
                        check["id"] == "local.external_skills"
                        and check["status"] == "blocked"
                    ):
                        missing.update(
                            name
                            for name in expected
                            if name in check["summary"]
                        )
                self.assertEqual(missing, expected, capability)

    def test_external_skills_can_be_discovered_across_supported_roots(self):
        with tempfile.TemporaryDirectory() as directory:
            locations = {
                "lark-base": Path(directory) / ".agents" / "skills",
                "lark-doc": Path(directory) / "custom-claude" / "skills",
                "lark-wiki": Path(directory) / "custom-hermes" / "skills",
            }
            for name, root in locations.items():
                skill = root / name
                skill.mkdir(parents=True)
                (skill / "SKILL.md").write_text(f"# {name}\n", encoding="utf-8")

            report = preflight.run_checks(
                {
                    "HOME": directory,
                    "CODEX_HOME": str(Path(directory) / "custom-codex"),
                    "CLAUDE_CONFIG_DIR": str(Path(directory) / "custom-claude"),
                    "HERMES_HOME": str(Path(directory) / "custom-hermes"),
                    "XDG_CONFIG_HOME": directory,
                },
                capability="workspace",
            )

            external = next(
                check
                for check in report["checks"]
                if check["capability"] == "workspace"
                and check["id"] == "local.external_skills"
            )
            self.assertEqual(external["status"], "ready")
            self.assertIn("未验证线上权限", external["summary"])

    def test_workbuddy_connector_skills_are_discovered_by_frontmatter_name(self):
        with tempfile.TemporaryDirectory() as directory:
            connector_root = (
                Path(directory)
                / ".workbuddy"
                / "connectors"
                / "skills"
                / "connector-feishu"
            )
            for name in ("lark-base", "lark-doc", "lark-wiki"):
                skill = connector_root / name
                skill.mkdir(parents=True)
                (skill / "SKILL.md").write_text(
                    f"---\nname: {name}\ndescription: test\n---\n",
                    encoding="utf-8",
                )

            report = preflight.run_checks(
                {"HOME": directory, "XDG_CONFIG_HOME": directory},
                capability="workspace",
            )

            external = next(
                check
                for check in report["checks"]
                if check["capability"] == "workspace"
                and check["id"] == "local.external_skills"
            )
            self.assertEqual(external["status"], "ready")

    def test_enabled_registered_notification_only_requires_lark_im(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"XDG_CONFIG_HOME": directory}
            path = configure.config_file(environment)
            configure.write_private_json(
                path,
                {
                    "lark_profile": "codex",
                    "target_base_url": "https://example.feishu.cn/base/source",
                    "notifications": {
                        "status": "enabled",
                        "target_type": "user",
                        "target_name": "Example User",
                        "target_id": "ou_example",
                        "identity": "bot",
                    },
                },
            )
            skill_root = self.make_skill_root(directory)

            report = preflight.run_checks(
                environment,
                capability="collection",
                skills_roots=[skill_root],
            )
            external = next(
                check
                for check in report["checks"]
                if check["capability"] == "collection"
                and check["id"] == "local.external_skills"
            )
            self.assertEqual(external["status"], "blocked")
            self.assertIn("lark-im", external["summary"])
            self.assertNotIn("lark-contact", external["summary"])

            im_skill = skill_root / "lark-im"
            im_skill.mkdir()
            (im_skill / "SKILL.md").write_text("# lark-im\n", encoding="utf-8")
            ready_report = preflight.run_checks(
                environment,
                capability="collection",
                skills_roots=[skill_root],
            )
            ready_external = next(
                check
                for check in ready_report["checks"]
                if check["capability"] == "collection"
                and check["id"] == "local.external_skills"
            )
            self.assertEqual(ready_external["status"], "ready")

    def test_dependency_recovery_actions_are_executable_and_redacted(self):
        with tempfile.TemporaryDirectory(prefix="offerloop-private-root-") as directory:
            secret_marker = Path(directory).name
            skill_root = self.make_skill_root(directory)
            with mock.patch.object(preflight.shutil, "which", return_value=None):
                report = preflight.run_checks(
                    {"XDG_CONFIG_HOME": directory},
                    capability="workspace",
                    skills_roots=[skill_root],
                )

            lark_cli = next(
                check for check in report["checks"] if check["id"] == "local.lark_cli"
            )
            self.assertIn(
                "npx @larksuite/cli@latest install", lark_cli["next_action"]
            )
            self.assertIn(
                "npx skills add larksuite/cli -g -a codex -y",
                lark_cli["next_action"],
            )
            self.assertIn("新开 Agent 会话", lark_cli["next_action"])

            external = next(
                check
                for check in report["checks"]
                if check["capability"] == "workspace"
                and check["id"] == "local.external_skills"
            )
            for name in ("lark-base", "lark-doc", "lark-wiki"):
                self.assertIn(name, external["summary"])
                self.assertIn(name, external["next_action"])
            serialized = json.dumps(report)
            self.assertNotIn(secret_marker, serialized)
            self.assertNotIn(str(skill_root), serialized)

    def test_lark_cli_probe_validates_version_profile_and_offline_doctor(self):
        def fake_run(command, **_kwargs):
            if command[-1] == "--version":
                return subprocess.CompletedProcess(command, 0, "lark-cli version 1.0.73\n", "")
            if command[-2:] == ["profile", "list"]:
                return subprocess.CompletedProcess(
                    command,
                    0,
                    json.dumps(
                        [{"name": "offerloop", "user": "PRIVATE USER", "appId": "PRIVATE APP"}]
                    ),
                    "",
                )
            return subprocess.CompletedProcess(
                command,
                0,
                json.dumps({"ok": True, "workspace": "/PRIVATE/PATH"}),
                "",
            )

        with mock.patch.object(preflight.shutil, "which", return_value="/bin/lark-cli"), mock.patch.object(
            preflight, "_run_local_command", side_effect=fake_run
        ):
            lark, profile = preflight._probe_lark_cli({}, "offerloop")

        self.assertEqual(lark[0], "ready")
        self.assertEqual(profile[0], "ready")
        serialized = json.dumps((lark, profile))
        self.assertNotIn("PRIVATE USER", serialized)
        self.assertNotIn("PRIVATE APP", serialized)
        self.assertNotIn("/PRIVATE/PATH", serialized)

    def test_lark_cli_probe_rejects_old_version_and_missing_profile(self):
        old_version = subprocess.CompletedProcess(
            ["lark-cli", "--version"], 0, "lark-cli version 1.0.72\n", ""
        )
        with mock.patch.object(preflight.shutil, "which", return_value="/bin/lark-cli"), mock.patch.object(
            preflight, "_run_local_command", return_value=old_version
        ):
            lark, profile = preflight._probe_lark_cli({}, "missing")
        self.assertEqual(lark[0], "needs_action")
        self.assertIsNone(profile)
        self.assertEqual(lark[2], "升级到 lark-cli 1.0.73 或更高版本")

        workbuddy_executable = (
            "/tmp/.workbuddy/binaries/node/"
            "cli-connector-packages/bin/lark-cli"
        )
        with mock.patch.object(
            preflight.shutil, "which", return_value=workbuddy_executable
        ), mock.patch.object(
            preflight, "_run_local_command", return_value=old_version
        ):
            lark, profile = preflight._probe_lark_cli({}, "missing")
        self.assertEqual(lark[0], "needs_action")
        self.assertIsNone(profile)
        self.assertIn("WorkBuddy", lark[2])
        self.assertIn("cli-connector-packages", lark[2])
        self.assertIn("@larksuite/cli@latest", lark[2])
        self.assertNotIn("/tmp", lark[2])

        def missing_profile_run(command, **_kwargs):
            if command[-1] == "--version":
                return subprocess.CompletedProcess(command, 0, "1.0.73\n", "")
            return subprocess.CompletedProcess(
                command, 0, json.dumps([{"name": "another-profile"}]), ""
            )

        with mock.patch.object(preflight.shutil, "which", return_value="/bin/lark-cli"), mock.patch.object(
            preflight, "_run_local_command", side_effect=missing_profile_run
        ):
            lark, profile = preflight._probe_lark_cli({}, "missing")
        self.assertEqual(lark[0], "ready")
        self.assertEqual(profile[0], "blocked")

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

    def test_notification_config_is_optional_and_validated(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"XDG_CONFIG_HOME": directory}
            path = configure.config_file(environment)
            configure.write_private_json(path, {"lark_profile": "codex"})

            result = configure.update_notification_config(
                path,
                {
                    "status": "enabled",
                    "target_type": "user",
                    "target_name": "Example User",
                    "target_id": "ou_example",
                    "identity": "bot",
                },
            )

            self.assertEqual(result["lark_profile"], "codex")
            self.assertEqual(result["notifications"]["status"], "enabled")
            self.assertEqual(result["notifications"]["target_name"], "Example User")
            report = preflight.run_checks(environment, capability="collection")
            checks = {check["id"]: check for check in report["checks"]}
            self.assertEqual(
                checks["local.collection_notification"]["status"], "unverified"
            )
            self.assertNotIn("ou_example", json.dumps(report))

    def test_notification_config_rejects_mismatched_or_incomplete_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            with self.assertRaisesRegex(ValueError, "does not match"):
                configure.update_notification_config(
                    path,
                    {"target_type": "chat", "target_id": "ou_wrong"},
                )
            with self.assertRaisesRegex(ValueError, "cannot be enabled"):
                configure.update_notification_config(path, {"status": "enabled"})
            with self.assertRaisesRegex(ValueError, "unknown keys"):
                configure.update_notification_config(path, {"access_token": "nope"})

    def test_configure_cli_can_enable_notifications(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = dict(os.environ, XDG_CONFIG_HOME=directory)
            subprocess.run(
                [
                    "python3",
                    str(ROOT / "skills/offerloop-setup/scripts/configure.py"),
                    "--notification-target-type",
                    "chat",
                    "--notification-target-name",
                    "秋招进度群",
                    "--notification-target-id",
                    "oc_example",
                    "--notification-identity",
                    "bot",
                    "--notification-status",
                    "enabled",
                ],
                check=True,
                capture_output=True,
                text=True,
                env=environment,
            )

            saved = configure.load_config(configure.config_file(environment))
            self.assertEqual(saved["notifications"]["target_type"], "chat")
            self.assertEqual(saved["notifications"]["target_name"], "秋招进度群")
            self.assertEqual(saved["notifications"]["identity"], "bot")

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

    def test_workbench_template_locks_the_known_good_calendar_contract(self):
        root = (
            ROOT
            / "skills"
            / "offerloop-setup"
            / "assets"
            / "workbench-template"
        )
        manifest = json.loads((root / "template.json").read_text(encoding="utf-8"))
        contract = manifest["deployment_contract"]
        self.assertEqual(contract["workbench_page_size"], 30)
        self.assertEqual(contract["oauth_callback_path"], "/calendar-oauth-callback")
        self.assertEqual(
            contract["oauth_scopes"],
            [
                "calendar:calendar:readonly",
                "calendar:calendar.event:read",
                "offline_access",
            ],
        )
        self.assertEqual(contract["calendar_primary_method"], "POST")
        self.assertEqual(
            contract["token_persistence"],
            "encrypted_refresh_token_cookie_chunks",
        )

        service = (
            root / "server/modules/workbench/workbench-calendar.service.ts"
        ).read_text(encoding="utf-8")
        controller = (
            root / "server/modules/workbench/workbench.controller.ts"
        ).read_text(encoding="utf-8")
        client_api = (root / "client/src/api/index.ts").read_text(encoding="utf-8")
        client_hook = (
            root / "client/src/pages/workbench/useWorkbenchData.ts"
        ).read_text(encoding="utf-8")
        app = (root / "client/src/app.tsx").read_text(encoding="utf-8")

        self.assertIn(
            "calendar:calendar:readonly calendar:calendar.event:read offline_access",
            service,
        )
        self.assertIn("this.httpService.post<FeishuEnvelope<FeishuPrimaryCalendarData>>", service)
        self.assertIn("/calendar/v4/calendars/primary", service)
        self.assertIn("interface CalendarTokenSession", service)
        token_session = service.split("interface CalendarTokenSession", 1)[1].split(
            "interface CalendarTokenBundle", 1
        )[0]
        self.assertIn("refreshToken", token_session)
        self.assertNotIn("accessToken", token_session)
        self.assertIn("@Post('calendar/oauth/complete')", controller)
        self.assertNotIn("@Get('calendar/oauth/callback')", controller)
        self.assertIn("method: 'POST'", client_api)
        self.assertIn("oauthCompletionStartedRef", client_hook)
        self.assertIn("initialLoadStartedRef", client_hook)
        self.assertIn('path="calendar-oauth-callback"', app)

        guide = (
            ROOT
            / "skills/offerloop-setup/references/workbench-golden-path.md"
        ).read_text(encoding="utf-8")
        for required_text in (
            "csrf token not found in header",
            "授权会话过长",
            "POST /open-apis/calendar/v4/calendars/primary",
            "每页固定 30 条",
            "再刷新一次",
        ):
            self.assertIn(required_text, guide)

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

    def test_workbench_materializer_reports_the_deployment_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory)
            (destination / ".spark").mkdir()
            (destination / ".spark" / "meta.json").write_text(
                '{"app_id":"app_new_user"}\n', encoding="utf-8"
            )

            result = materialize_app_template.materialize(
                "workbench", destination, dry_run=True
            )

            self.assertEqual(
                result["deployment_contract"]["calendar_primary_method"], "POST"
            )
            self.assertEqual(
                result["deployment_contract"]["workbench_page_size"], 30
            )

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
