from pathlib import Path
import importlib.util
import json
import tempfile
import unittest


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
            "skills/offerloop-workspace/scripts/install_mode.py",
        )

    def test_single_mode_installs_only_selected_skill_and_minimal_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            result = self.setup.setup(
                "codex",
                "single",
                skill="mock-lab",
                environ=environment,
            )
            skills = Path(directory) / ".codex" / "skills"
            self.assertEqual(result["status"], "ready")
            self.assertTrue((skills / "mock-lab" / "SKILL.md").is_file())
            self.assertFalse((skills / "career-profile").exists())
            self.assertFalse((skills / "offerloop-workbench").exists())
            self.assertTrue(
                (
                    skills
                    / ".offerloop-runtime"
                    / "references"
                    / "installation-mode.md"
                ).is_file()
            )
            self.assertTrue(
                (
                    skills
                    / ".offerloop-runtime"
                    / "references"
                    / "full-setup.md"
                ).is_file()
            )
            resolved = self.mode.resolve_mode(environ=environment)
            self.assertEqual(resolved["mode"], "single")
            self.assertEqual(resolved["profile_gate"], "skipped")
            self.assertEqual(resolved["artifact_storage"], "chat_default")
            verified = self.setup.verify(
                "codex",
                "single",
                skill="mock-lab",
                environ=environment,
            )
            self.assertTrue(verified["verified"])

    def test_full_mode_installs_nine_skills_but_not_workbench(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            result = self.setup.setup("codex", "full", environ=environment)
            skills = Path(directory) / ".codex" / "skills"
            self.assertEqual(result["status"], "needs_setup")
            self.assertIn("next_prompt", result)
            for name in self.setup._load_installer().SKILL_NAMES:
                self.assertTrue((skills / name / "SKILL.md").is_file())
            self.assertFalse((skills / "offerloop-workbench").exists())
            config = json.loads(
                self.setup.config_file(environment).read_text(encoding="utf-8")
            )
            self.assertEqual(config["installation"]["mode"], "full")
            self.assertNotIn("workbench_url", config)

    def test_each_business_skill_can_be_installed_standalone(self):
        installer = self.setup._load_installer()
        for name in installer.SKILL_NAMES:
            with self.subTest(skill=name), tempfile.TemporaryDirectory() as directory:
                environment = {"HOME": directory, "PATH": ""}
                result = self.setup.setup(
                    "codex",
                    "single",
                    skill=name,
                    environ=environment,
                )
                skills = Path(directory) / ".codex" / "skills"
                installed = {
                    item.name
                    for item in skills.iterdir()
                    if (item / "SKILL.md").is_file()
                }
                self.assertEqual(result["status"], "ready")
                self.assertEqual(installed, {name})
                self.assertTrue(
                    self.setup.verify(
                        "codex",
                        "single",
                        skill=name,
                        environ=environment,
                    )["verified"]
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
                    "schema_version": 6,
                }
            )
            self.setup._write_private_json(config_path, config)
            unverified = self.setup.verify("codex", "full", environ=environment)
            self.assertFalse(unverified["verified"])
            self.assertEqual(unverified["workspace"], "needs_online_verification")
            self.setup.record_workspace_verification("codex", environ=environment)
            after = self.setup.verify("codex", "full", environ=environment)
            self.assertTrue(after["verified"])
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["wiki_space_id"] = "changed_space"
            self.setup._write_private_json(config_path, config)
            stale = self.setup.verify("codex", "full", environ=environment)
            self.assertFalse(stale["verified"])
            self.assertEqual(stale["workspace"], "needs_online_verification")

    def test_dry_run_does_not_write_install_or_mode_config(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            result = self.setup.setup(
                "codex",
                "single",
                skill="talk-review",
                environ=environment,
                dry_run=True,
            )
            self.assertTrue(result["dry_run"])
            self.assertFalse((Path(directory) / ".codex").exists())
            self.assertFalse(self.setup.config_file(environment).exists())

    def test_missing_mode_config_uses_legacy_full_behavior(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.mode.resolve_mode(
                environ={"HOME": directory, "PATH": ""}
            )
            self.assertEqual(result["mode"], "full")
            self.assertEqual(result["source"], "legacy_fallback")


if __name__ == "__main__":
    unittest.main()
