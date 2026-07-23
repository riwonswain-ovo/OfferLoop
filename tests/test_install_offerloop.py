from pathlib import Path
import contextlib
import importlib.util
import io
import json
import shutil
import tempfile
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "install_offerloop.py"


def load_installer():
    spec = importlib.util.spec_from_file_location("offerloop_installer", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class OfferLoopInstallerTest(unittest.TestCase):
    def setUp(self):
        self.installer = load_installer()

    def test_agent_roots_respect_product_specific_homes(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {
                "HOME": directory,
                "CODEX_HOME": str(Path(directory) / "codex-custom"),
                "CLAUDE_CONFIG_DIR": str(Path(directory) / "claude-custom"),
                "HERMES_HOME": str(Path(directory) / "hermes-custom"),
            }
            self.assertEqual(
                self.installer.agent_root("codex", environment),
                Path(directory) / "codex-custom" / "skills",
            )
            self.assertEqual(
                self.installer.agent_root("claude-code", environment),
                Path(directory) / "claude-custom" / "skills",
            )
            self.assertEqual(
                self.installer.agent_root("hermes-agent", environment),
                Path(directory) / "hermes-custom" / "skills",
            )
            self.assertEqual(
                self.installer.agent_root("workbuddy", environment),
                Path(directory) / ".workbuddy" / "skills",
            )
            self.assertEqual(
                self.installer.agent_target_label("codex", environment),
                "$CODEX_HOME/skills",
            )

    def test_install_is_complete_and_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            first = self.installer.install_agent("claude-code", environ=environment)
            root = Path(directory) / ".claude" / "skills"
            manifest_before = (root / self.installer.MANIFEST_NAME).read_text(
                encoding="utf-8"
            )
            with mock.patch.object(
                self.installer.tempfile,
                "TemporaryDirectory",
                side_effect=AssertionError("idempotent install must not stage files"),
            ):
                second = self.installer.install_agent(
                    "claude-code", environ=environment
                )

            self.assertEqual(first["status"], "installed")
            self.assertEqual(second["status"], "already_installed")
            self.assertEqual(
                (root / self.installer.MANIFEST_NAME).read_text(encoding="utf-8"),
                manifest_before,
            )
            for name in self.installer.SKILL_NAMES:
                self.assertTrue((root / name / "SKILL.md").is_file())
                self.assertFalse((root / name / "tests").exists())
            manifest = json.loads(
                (root / self.installer.MANIFEST_NAME).read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["agent"], "claude-code")
            self.assertNotIn(directory, json.dumps(manifest))

    def test_conflict_is_safe_and_upgrade_creates_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            root = Path(directory) / ".hermes" / "skills"
            conflict = root / "offerloop-setup"
            conflict.mkdir(parents=True)
            (conflict / "SKILL.md").write_text("user content\n", encoding="utf-8")

            report = self.installer.install_agent("hermes-agent", environ=environment)
            self.assertEqual(report["status"], "conflict")
            self.assertEqual(
                (conflict / "SKILL.md").read_text(encoding="utf-8"), "user content\n"
            )

            upgraded = self.installer.install_agent(
                "hermes-agent", environ=environment, upgrade=True
            )
            self.assertEqual(upgraded["status"], "upgraded")
            backups = list(
                (root.parent / ".offerloop-backups").glob(
                    "*/offerloop-setup/SKILL.md"
                )
            )
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(encoding="utf-8"), "user content\n")

    def test_hermes_external_skill_collision_is_not_silently_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            external_root = home / ".agents" / "skills"
            duplicate = external_root / "offerloop-setup"
            duplicate.mkdir(parents=True)
            (duplicate / "SKILL.md").write_text("old shared copy\n", encoding="utf-8")
            hermes_home = home / ".hermes"
            hermes_home.mkdir()
            (hermes_home / "config.yaml").write_text(
                "skills:\n  external_dirs:\n" f"  - {external_root}\n",
                encoding="utf-8",
            )
            environment = {"HOME": directory, "PATH": ""}

            report = self.installer.install_agent("hermes-agent", environ=environment)

            self.assertEqual(report["status"], "conflict")
            self.assertIn("skills.external_dirs", report["next_action"])
            self.assertEqual(
                (duplicate / "SKILL.md").read_text(encoding="utf-8"),
                "old shared copy\n",
            )
            self.assertFalse((hermes_home / "skills").exists())

    def test_hermes_upgrade_backs_up_and_removes_external_duplicate(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            external_root = home / ".agents" / "skills"
            duplicate = external_root / "offerloop-setup"
            duplicate.mkdir(parents=True)
            (duplicate / "SKILL.md").write_text("old shared copy\n", encoding="utf-8")
            hermes_home = home / ".hermes"
            hermes_home.mkdir()
            (hermes_home / "config.yaml").write_text(
                "skills:\n" f"  external_dirs: [{external_root}]\n",
                encoding="utf-8",
            )
            environment = {"HOME": directory, "PATH": ""}

            report = self.installer.install_agent(
                "hermes-agent", environ=environment, upgrade=True
            )

            self.assertEqual(report["status"], "upgraded")
            self.assertFalse(duplicate.exists())
            self.assertTrue(
                (hermes_home / "skills" / "offerloop-setup" / "SKILL.md").is_file()
            )
            backups = list(
                (external_root.parent / ".offerloop-backups").glob(
                    "*/hermes-external/*/offerloop-setup/SKILL.md"
                )
            )
            self.assertEqual(len(backups), 1)
            self.assertEqual(
                backups[0].read_text(encoding="utf-8"), "old shared copy\n"
            )
            repeated = self.installer.install_agent(
                "hermes-agent", environ=environment
            )
            self.assertEqual(repeated["status"], "already_installed")

    def test_dry_run_does_not_create_target(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            report = self.installer.install_agent(
                "codex", environ=environment, dry_run=True
            )
            self.assertTrue(report["dry_run"])
            self.assertFalse((Path(directory) / ".codex").exists())

    def test_human_dry_run_output_cannot_be_mistaken_for_installation(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with mock.patch.dict(
                self.installer.os.environ,
                {"HOME": directory, "PATH": ""},
                clear=True,
            ), contextlib.redirect_stdout(output):
                exit_code = self.installer.main(["--agent", "codex", "--dry-run"])

            rendered = output.getvalue()
            self.assertEqual(exit_code, 0)
            self.assertIn("DRY RUN", rendered)
            self.assertIn("未写入任何 Skill 文件", rendered)
            self.assertIn("would install", rendered)
            self.assertNotIn("codex: installed", rendered)
            self.assertFalse((Path(directory) / ".codex").exists())

    def test_human_install_output_explains_session_restart_and_preflight(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with mock.patch.dict(
                self.installer.os.environ,
                {"HOME": directory, "PATH": ""},
                clear=True,
            ), contextlib.redirect_stdout(output):
                exit_code = self.installer.main(["--agent", "codex"])

            rendered = output.getvalue()
            self.assertEqual(exit_code, 0)
            self.assertIn("4 个 Skill 已处理完成", rendered)
            self.assertIn("结束当前 Agent 会话并新开会话", rendered)
            self.assertIn("offerloop-setup 运行只读预检", rendered)

    def test_generated_directories_do_not_affect_digest_or_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "source"
            root.mkdir()
            (root / "SKILL.md").write_text("kept\n", encoding="utf-8")
            digest = self.installer.tree_digest(root)

            for name in ("node_modules", "dist", "build"):
                generated = root / "assets" / name
                generated.mkdir(parents=True)
                (generated / "generated.txt").write_text(
                    f"ignored {name}\n", encoding="utf-8"
                )

            self.assertEqual(self.installer.tree_digest(root), digest)

            destination = Path(directory) / "destination"
            shutil.copytree(root, destination, ignore=self.installer._ignore_copy)
            self.assertTrue((destination / "SKILL.md").is_file())
            for name in ("node_modules", "dist", "build"):
                self.assertFalse((destination / "assets" / name).exists())

    def test_result_status_contract_is_complete(self):
        self.assertEqual(
            set(self.installer.RESULT_STATUSES),
            {
                "installed",
                "already_installed",
                "conflict",
                "upgraded",
                "prepared_for_import",
                "unsupported",
            },
        )

    def test_version_reports_installer_and_offerloop_versions(self):
        self.assertEqual(self.installer.INSTALLER_VERSION, "1.0")
        self.assertEqual(self.installer.offerloop_version(), "0.1.0-alpha.3")

    def test_workbuddy_install_is_complete_and_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            first = self.installer.install_agent("workbuddy", environ=environment)
            second = self.installer.install_agent("workbuddy", environ=environment)

            self.assertEqual(first["status"], "installed")
            self.assertEqual(second["status"], "already_installed")
            root = Path(directory) / ".workbuddy" / "skills"
            for name in self.installer.SKILL_NAMES:
                self.assertTrue((root / name / "SKILL.md").is_file())
            manifest = json.loads(
                (root / self.installer.MANIFEST_NAME).read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["agent"], "workbuddy")
            self.assertNotIn(directory, json.dumps(manifest))

    def test_workbuddy_imported_name_collision_requires_upgrade(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            imported = home / ".workbuddy" / "skills" / "skill_123"
            imported.mkdir(parents=True)
            (imported / "SKILL.md").write_text(
                "---\nname: offerloop-setup\n"
                "description: old imported copy\n---\n",
                encoding="utf-8",
            )
            environment = {"HOME": directory, "PATH": ""}

            conflict = self.installer.install_agent(
                "workbuddy", environ=environment
            )
            self.assertEqual(conflict["status"], "conflict")
            self.assertIn("随机目录", conflict["next_action"])
            self.assertTrue(imported.exists())

            upgraded = self.installer.install_agent(
                "workbuddy", environ=environment, upgrade=True
            )
            self.assertEqual(upgraded["status"], "upgraded")
            self.assertFalse(imported.exists())
            self.assertTrue(
                (
                    home
                    / ".workbuddy"
                    / "skills"
                    / "offerloop-setup"
                    / "SKILL.md"
                ).is_file()
            )
            backups = list(
                (home / ".workbuddy" / ".offerloop-backups").glob(
                    "*/workbuddy-imported/*/skill_123/SKILL.md"
                )
            )
            self.assertEqual(len(backups), 1)

    def test_agent_all_is_limited_to_declared_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            output = io.StringIO()
            with mock.patch.dict(
                self.installer.os.environ,
                {"HOME": directory, "PATH": ""},
                clear=True,
            ), contextlib.redirect_stdout(output):
                exit_code = self.installer.main(
                    ["--agent", "all", "--dry-run", "--json"]
                )
            payload = json.loads(output.getvalue())
            self.assertEqual(exit_code, 0)
            self.assertEqual(
                [result["agent"] for result in payload["results"]],
                list(self.installer.ALL_AGENTS),
            )
            self.assertEqual(payload["results"][-1]["status"], "installed")


if __name__ == "__main__":
    unittest.main()
