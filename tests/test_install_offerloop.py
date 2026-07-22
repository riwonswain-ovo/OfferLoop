from pathlib import Path
import contextlib
import importlib.util
import io
import json
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
            second = self.installer.install_agent("claude-code", environ=environment)

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
        self.assertEqual(self.installer.offerloop_version(), "0.1.0-alpha.1")

    def test_workbuddy_does_not_claim_unverified_installation(self):
        report = self.installer.install_agent("workbuddy", environ={"HOME": "/tmp"})
        self.assertEqual(report["status"], "unsupported")
        self.assertEqual(report["skills"], [])

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
            self.assertEqual(payload["results"][-1]["status"], "unsupported")


if __name__ == "__main__":
    unittest.main()
