from pathlib import Path
import contextlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class OfferLoopSetupModesTest(unittest.TestCase):
    def setUp(self):
        self.setup = load_module("offerloop_setup_entry", "scripts/setup_offerloop.py")
        self.mode = load_module(
            "offerloop_install_mode",
            "runtime/offerloop/workspace/scripts/install_mode.py",
        )

    def test_legacy_single_mode_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            with self.assertRaisesRegex(ValueError, "only supports the full"):
                self.setup.setup("codex", "single", environ=environment)
            self.assertFalse((Path(directory) / ".codex").exists())

    def test_full_mode_installs_seven_skills_but_not_retired_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            result = self.setup.setup("codex", "full", environ=environment)
            skills = Path(directory) / ".codex" / "skills"
            self.assertEqual(result["status"], "needs_setup")
            self.assertIn("next_prompt", result)
            self.assertEqual(result["phases"]["local_install"]["status"], "ready")
            self.assertEqual(
                result["phases"]["workspace_prerequisites"]["status"],
                "blocked",
            )
            self.assertEqual(
                result["phases"]["feishu_workspace"]["status"],
                "needs_setup",
            )
            self.assertEqual(
                result["phases"]["sync_automation"]["status"],
                "needs_setup",
            )
            self.assertEqual(
                result["phases"]["daily_checkin"]["status"],
                "needs_decision",
            )
            self.assertEqual(
                result["next_action"], "install_workspace_prerequisites"
            )
            for name in self.setup._load_installer().SKILL_NAMES:
                self.assertTrue((skills / name / "SKILL.md").is_file())
            for name in ("career-profile", "competency-lab"):
                self.assertFalse((skills / name).exists())
            self.assertFalse((skills / "offerloop-workbench").exists())
            config = json.loads(
                self.setup.config_file(environment).read_text(encoding="utf-8")
            )
            self.assertEqual(config["installation"]["mode"], "full")
            self.assertNotIn("workbench_url", config)

    def test_ready_dependencies_advance_to_feishu_initialization(self):
        if os.name == "nt":
            self.skipTest("POSIX executable fixture")
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            skills = home / ".codex" / "skills"
            for name in ("lark-base", "lark-doc", "lark-wiki"):
                target = skills / name
                target.mkdir(parents=True, exist_ok=True)
                (target / "SKILL.md").write_text(
                    f"---\nname: {name}\ndescription: fixture\n---\n",
                    encoding="utf-8",
                )
            binary = home / "bin" / "lark-cli"
            binary.parent.mkdir()
            binary.write_text(
                "#!/bin/sh\nprintf 'lark-cli version 1.0.73\\n'\n",
                encoding="utf-8",
            )
            binary.chmod(0o755)
            environment = {"HOME": directory, "PATH": str(binary.parent)}

            result = self.setup.setup("codex", "full", environ=environment)

            self.assertEqual(
                result["phases"]["workspace_prerequisites"]["status"],
                "ready",
            )
            self.assertEqual(result["next_action"], "start_agent_workspace_setup")
            self.assertEqual(result["status"], "needs_setup")

    def test_missing_dependencies_never_trigger_a_network_installer(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            with mock.patch(
                "subprocess.run",
                side_effect=AssertionError("setup must not run npm, npx, or a downloader"),
            ):
                result = self.setup.setup("codex", "full", environ=environment)

            self.assertEqual(result["next_action"], "install_workspace_prerequisites")
            self.assertTrue(
                (
                    Path(directory)
                    / ".codex"
                    / "skills"
                    / "job-collection"
                    / "SKILL.md"
                ).is_file()
            )

    def test_json_setup_is_progress_free_ascii_and_redacted(self):
        with tempfile.TemporaryDirectory() as directory:
            secret = "DO_NOT_PRINT_LOCAL_SECRET"
            output = io.StringIO()
            with mock.patch.dict(
                self.setup.os.environ,
                {"HOME": directory, "PATH": "", "IMAP_PASSWORD": secret},
                clear=True,
            ), contextlib.redirect_stdout(output):
                exit_code = self.setup.main(
                    ["--agent", "codex", "--mode", "full", "--json"]
                )

            rendered = output.getvalue()
            payload = json.loads(rendered)
            self.assertEqual(exit_code, 0)
            self.assertEqual(payload["status"], "needs_setup")
            self.assertNotIn("OfferLoop ·", rendered)
            self.assertNotIn(directory, rendered)
            self.assertNotIn(secret, rendered)
            self.assertTrue(all(ord(character) < 128 for character in rendered))

    def test_upgrade_migrates_schema_v7_and_keeps_legacy_locators_read_only(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            config_path = self.setup.config_file(environment)
            config_path.parent.mkdir(parents=True)
            config_path.write_text(
                json.dumps(
                    {
                        "schema_version": 6,
                        "user_profile": "legacy-profile-node",
                        "competency_profiles": "legacy-map-node",
                        "competency_training": "legacy-training-node",
                        "artifact_storage": {
                            "folders": {
                                "user_profile": "legacy-profile-node",
                                "competency_training": "legacy-training-node",
                            },
                            "readiness": {
                                "career_profile": True,
                                "competency_lab": True,
                                "mock_lab": False,
                            },
                        },
                    }
                ),
                encoding="utf-8",
            )
            self.setup.setup("codex", "full", environ=environment, upgrade=True)
            migrated = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertEqual(migrated["schema_version"], 7)
            self.assertEqual(migrated["user_profile"], "legacy-profile-node")
            self.assertEqual(migrated["competency_profiles"], "legacy-map-node")
            self.assertEqual(migrated["competency_training"], "legacy-training-node")
            self.assertEqual(
                migrated["artifact_storage"]["readiness"], {"mock_lab": False}
            )

    def test_full_mode_installs_every_business_skill_and_runtime(self):
        installer = self.setup._load_installer()
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            result = self.setup.setup("codex", "full", environ=environment)
            skills = Path(directory) / ".codex" / "skills"
            installed = {
                item.name
                for item in skills.iterdir()
                if (item / "SKILL.md").is_file()
            }
            self.assertEqual(result["status"], "needs_setup")
            self.assertEqual(installed, set(installer.SKILL_NAMES))
            self.assertTrue(
                (skills / ".offerloop-runtime" / "references" / "full-setup.md").is_file()
            )
            self.assertTrue(
                (
                    skills
                    / ".offerloop-runtime"
                    / "assets"
                    / "progress-sync-template"
                    / "template.json"
                ).is_file()
            )

    def test_full_verify_requires_real_workspace_locators(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            self.setup.setup("codex", "full", environ=environment)
            before = self.setup.verify("codex", "full", environ=environment)
            self.assertFalse(before["verified"])
            config_path = self.setup.config_file(environment)
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config.update(
                {
                    "lark_profile": "offerloop",
                    "target_base_url": "https://example.feishu.cn/base/target",
                    "progress_base_url": "https://example.feishu.cn/base/progress",
                    "reminder_base_url": "https://example.feishu.cn/base/reminder",
                    "wiki_space_id": "space_id",
                    "workspace_home_node_token": "home_node",
                    "workspace_core_data_node_token": "core_node",
                    "schema_version": 7,
                }
            )
            self.setup._write_private_json(config_path, config)
            unverified = self.setup.verify("codex", "full", environ=environment)
            self.assertFalse(unverified["verified"])
            self.assertEqual(unverified["workspace"], "needs_online_verification")
            workspace_result = self.setup.record_workspace_verification(
                "codex", environ=environment
            )
            self.assertEqual(workspace_result["status"], "needs_setup")
            workspace_only = self.setup.verify("codex", "full", environ=environment)
            self.assertFalse(workspace_only["verified"])
            self.assertEqual(workspace_only["workspace"], "ready")
            self.assertEqual(workspace_only["sync_automation"], "needs_setup")

            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["progress_sync"] = {
                "app_id": "app_sync",
                "endpoint": "https://example.feishuapp.com/openapi/sync",
                "workflow_id": "wkf_sync",
                "status": "enabled",
            }
            config["daily_checkin"] = {"status": "disabled"}
            self.setup._write_private_json(config_path, config)
            self.setup.record_automation_verification("codex", environ=environment)
            after = self.setup.verify("codex", "full", environ=environment)
            self.assertTrue(after["verified"])
            self.assertEqual(
                after["readiness"],
                {
                    "workspace_ready": True,
                    "sync_ready": True,
                    "daily_checkin_ready": False,
                    "daily_checkin_selected": True,
                },
            )
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["wiki_space_id"] = "changed_space"
            self.setup._write_private_json(config_path, config)
            stale = self.setup.verify("codex", "full", environ=environment)
            self.assertFalse(stale["verified"])
            self.assertEqual(stale["workspace"], "needs_online_verification")

    def test_enabled_daily_checkin_requires_separate_online_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            self.setup.setup("codex", "full", environ=environment)
            path = self.setup.config_file(environment)
            config = json.loads(path.read_text(encoding="utf-8"))
            config.update(
                {
                    "lark_profile": "offerloop",
                    "target_base_url": "https://example.feishu.cn/base/target",
                    "progress_base_url": "https://example.feishu.cn/base/progress",
                    "reminder_base_url": "https://example.feishu.cn/base/reminder",
                    "wiki_space_id": "space_id",
                    "workspace_home_node_token": "home_node",
                    "workspace_core_data_node_token": "core_node",
                    "schema_version": 7,
                    "progress_sync": {
                        "app_id": "app_sync",
                        "endpoint": "https://example.feishuapp.com/openapi/sync",
                        "workflow_id": "wkf_sync",
                        "status": "enabled",
                    },
                    "daily_checkin": {
                        "status": "enabled",
                        "chat_id": "oc_daily",
                        "owner_open_id": "ou_owner",
                        "calendar_id": "cal_owner",
                        "timezone": "Asia/Shanghai",
                        "time": "22:10",
                    },
                }
            )
            self.setup._write_private_json(path, config)
            self.setup.record_workspace_verification("codex", environ=environment)
            before = self.setup.verify("codex", "full", environ=environment)
            self.assertEqual(before["sync_automation"], "needs_online_verification")
            self.assertEqual(before["daily_checkin"], "needs_online_verification")

            self.setup.record_automation_verification("codex", environ=environment)
            ready = self.setup.verify("codex", "full", environ=environment)
            self.assertTrue(ready["verified"])
            self.assertTrue(ready["readiness"]["daily_checkin_ready"])
            config = json.loads(path.read_text(encoding="utf-8"))
            self.assertIn(
                "calendar_scope_isolation_verified",
                config["automation_verification"]["checks"],
            )

            config["daily_checkin"]["chat_id"] = "oc_changed"
            self.setup._write_private_json(path, config)
            stale = self.setup.verify("codex", "full", environ=environment)
            self.assertEqual(stale["sync_automation"], "ready")
            self.assertEqual(stale["daily_checkin"], "needs_online_verification")
            self.assertFalse(stale["verified"])

    def test_dry_run_does_not_write_install_or_mode_config(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            result = self.setup.setup(
                "codex",
                "full",
                environ=environment,
                dry_run=True,
            )
            self.assertTrue(result["dry_run"])
            self.assertFalse((Path(directory) / ".codex").exists())
            self.assertFalse(self.setup.config_file(environment).exists())

    def test_missing_mode_config_requires_full_setup(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.mode.resolve_mode(
                environ={"HOME": directory, "PATH": ""}
            )
            self.assertEqual(result["mode"], "full")
            self.assertEqual(result["source"], "legacy_requires_full_setup")
            self.assertEqual(result["artifact_storage"], "feishu_default")
            self.assertTrue(result["migration_required"])

    def test_legacy_single_config_is_mapped_to_full_migration(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.json"
            config.write_text(
                json.dumps(
                    {
                        "installation": {
                            "mode": "single",
                            "selected_skills": ["talk-review"],
                        }
                    }
                ),
                encoding="utf-8",
            )
            result = self.mode.resolve_mode(path=config)
            self.assertEqual(result["mode"], "full")
            self.assertEqual(result["source"], "legacy_requires_full_setup")
            self.assertTrue(result["migration_required"])

    def test_retirement_snapshot_preview_and_confirmed_rollback_are_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {
                "HOME": directory,
                "XDG_CONFIG_HOME": str(Path(directory) / "config"),
                "XDG_STATE_HOME": str(Path(directory) / "state"),
                "PATH": "",
            }
            self.setup.setup("codex", "full", environ=environment)
            root = Path(directory) / ".codex" / "skills"
            for name in ("career-profile", "competency-lab"):
                retired = root / name
                retired.mkdir()
                (retired / "SKILL.md").write_text(
                    f"legacy {name}\n", encoding="utf-8"
                )
            config = self.setup.config_file(environment)
            config.write_text('{"schema_version": 6, "legacy": true}\n', encoding="utf-8")
            loop = self.setup.loop_state_file(environment)
            loop.parent.mkdir(parents=True, exist_ok=True)
            legacy_loop = (
                '{"ability_observations":{"obs":{"status":"open"}},'
                '"tasks":{"train":{"kind":"training"}}}\n'
            )
            loop.write_text(legacy_loop, encoding="utf-8")
            preference = {
                "base_preference": {
                    "base_url": "https://example.feishu.cn/base/preferences",
                    "table_id": "tbl_preferences",
                    "record_id": "rec_preferences",
                    "fields": {"target_cities": ["上海"]},
                },
                "workspace_directories": {
                    "root_token": "wiki_root",
                    "nodes": [
                        {
                            "token": "profile_node",
                            "title": "02｜用户画像",
                            "parent_token": "wiki_root",
                        },
                        {
                            "token": "resume_node",
                            "title": "03｜定制简历",
                            "parent_token": "wiki_root",
                        },
                    ],
                },
            }
            created = self.setup.create_retirement_snapshot(
                "codex", preference, environ=environment
            )
            snapshot_id = created["snapshot_id"]
            self.assertEqual(created["status"], "snapshot_created")
            self.assertTrue(created["workspace_directory_state_saved"])
            if os.name != "nt":
                snapshot = Path(created["snapshot_path"])
                self.assertEqual(snapshot.stat().st_mode & 0o777, 0o700)
                self.assertEqual(
                    (snapshot / "manifest.json").stat().st_mode & 0o777, 0o600
                )
                self.assertEqual(
                    (snapshot / "workspace-directories.json").stat().st_mode
                    & 0o777,
                    0o600,
                )
                self.assertEqual(
                    (snapshot / "components" / "career-profile").stat().st_mode
                    & 0o777,
                    0o700,
                )
                self.assertEqual(
                    (
                        snapshot
                        / "components"
                        / "career-profile"
                        / "SKILL.md"
                    ).stat().st_mode
                    & 0o777,
                    0o600,
                )

            for name in ("career-profile", "competency-lab"):
                path = root / name
                for child in path.iterdir():
                    child.unlink()
                path.rmdir()
            config.write_text('{"schema_version": 7}\n', encoding="utf-8")
            loop.write_text('{"ability_observations":{},"tasks":{}}\n', encoding="utf-8")

            preview = self.setup.rollback_retirement_snapshot(
                "codex", snapshot_id, environ=environment, dry_run=True
            )
            self.assertEqual(preview["status"], "rollback_preview")
            self.assertEqual(config.read_text(encoding="utf-8"), '{"schema_version": 7}\n')

            original_copy = self.setup._copy_private

            def fail_during_legacy_restore(source, destination):
                if source.name == "career-profile" and "components" in source.parts:
                    raise OSError("simulated restore failure")
                return original_copy(source, destination)

            with mock.patch.object(
                self.setup,
                "_copy_private",
                side_effect=fail_during_legacy_restore,
            ), self.assertRaisesRegex(OSError, "simulated restore failure"):
                self.setup.rollback_retirement_snapshot(
                    "codex", snapshot_id, environ=environment, confirmed=True
                )
            self.assertTrue((root / "mock-lab" / "SKILL.md").is_file())
            self.assertFalse((root / "career-profile").exists())
            self.assertEqual(config.read_text(encoding="utf-8"), '{"schema_version": 7}\n')

            restored = self.setup.rollback_retirement_snapshot(
                "codex", snapshot_id, environ=environment, confirmed=True
            )
            self.assertEqual(restored["status"], "rolled_back")
            self.assertEqual(restored["base_restore_patch"], preference["base_preference"])
            self.assertEqual(
                restored["workspace_directory_restore_state"],
                preference["workspace_directories"],
            )
            self.assertEqual(loop.read_text(encoding="utf-8"), legacy_loop)
            for name in ("career-profile", "competency-lab"):
                self.assertEqual(
                    (root / name / "SKILL.md").read_text(encoding="utf-8"),
                    f"legacy {name}\n",
                )
            repeated = self.setup.rollback_retirement_snapshot(
                "codex", snapshot_id, environ=environment, confirmed=True
            )
            self.assertEqual(repeated["status"], "rolled_back")


if __name__ == "__main__":
    unittest.main()
