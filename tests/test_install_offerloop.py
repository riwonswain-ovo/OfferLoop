from pathlib import Path
import contextlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
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
            self.assertTrue(first["show_welcome"])
            self.assertEqual(second["status"], "already_installed")
            self.assertFalse(second["show_welcome"])
            self.assertEqual(
                (root / self.installer.MANIFEST_NAME).read_text(encoding="utf-8"),
                manifest_before,
            )
            for name in self.installer.SKILL_NAMES:
                self.assertTrue((root / name / "SKILL.md").is_file())
                self.assertFalse((root / name / "tests").exists())
            collection = root / "job-collection"
            self.assertTrue(
                (collection / "references" / "failure-handling.md").is_file()
            )
            self.assertTrue((collection / "scripts" / "sync_pipeline.py").is_file())
            self.assertFalse((collection / "agents" / "openai.yaml").exists())
            runtime = root / self.installer.SUPPORT_NAME
            self.assertTrue((runtime / "references" / "profile-gate.md").is_file())
            self.assertTrue((runtime / "scripts" / "profile_gate.py").is_file())
            manifest = json.loads(
                (root / self.installer.MANIFEST_NAME).read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["agent"], "claude-code")
            self.assertNotIn(directory, json.dumps(manifest))

    def test_install_includes_base_completion_sync_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            self.installer.install_agent("codex", environ=environment)
            reminder = Path(directory) / ".codex" / "skills" / "recruiting-reminder"
            skill = (reminder / "SKILL.md").read_text(encoding="utf-8")
            contract = (
                reminder / "references" / "task-sync-contract.md"
            ).read_text(encoding="utf-8")

            self.assertIn("笔面试中心修改完成状态", skill)
            self.assertNotIn("飞书任务GUID", skill)
            self.assertNotIn("card.action.trigger", contract)
            self.assertNotIn("card-action", skill)
            self.assertIn("不得创建 `offerloop-base-reconcile`", contract)
            self.assertIn("/openapi/job-progress-sync/reminder-reconcile", contract)
            self.assertIn("笔面试安排", contract)
            self.assertIn("X-OfferLoop-Workflow-Secret", contract)
            self.assertIn("其他视图立即显示相同值", contract)
            self.assertIn("不得运行每 30 分钟检查", contract)
            self.assertNotIn("OFFERLOOP_CALLBACK_RELAY_SECRET", contract)

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
                    "*/offerloop-setup-retired/SKILL.md"
                )
            )
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(encoding="utf-8"), "user content\n")

    def test_legacy_resume_deepthink_requires_upgrade_and_is_backed_up(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            root = Path(directory) / ".codex" / "skills"
            legacy = root / "resume-deepthink"
            legacy.mkdir(parents=True)
            (legacy / "SKILL.md").write_text(
                "legacy experience content\n", encoding="utf-8"
            )

            report = self.installer.install_agent("codex", environ=environment)
            self.assertEqual(report["status"], "conflict")
            self.assertTrue(legacy.exists())
            self.assertFalse((root / "experience-deepthink").exists())

            upgraded = self.installer.install_agent(
                "codex", environ=environment, upgrade=True
            )
            self.assertEqual(upgraded["status"], "upgraded")
            self.assertFalse(legacy.exists())
            self.assertTrue((root / "experience-deepthink" / "SKILL.md").is_file())
            backups = list(
                (root.parent / ".offerloop-backups").glob(
                    "*/resume-deepthink-renamed-to-experience-deepthink/SKILL.md"
                )
            )
            self.assertEqual(len(backups), 1)
            self.assertEqual(
                backups[0].read_text(encoding="utf-8"),
                "legacy experience content\n",
            )

    def test_nine_skill_upgrade_retires_profile_and_competency_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            root = Path(directory) / ".codex" / "skills"
            for name in ("career-profile", "competency-lab"):
                legacy = root / name
                legacy.mkdir(parents=True)
                (legacy / "SKILL.md").write_text(
                    f"legacy {name}\n", encoding="utf-8"
                )

            blocked = self.installer.install_agent("codex", environ=environment)
            self.assertEqual(blocked["status"], "conflict")
            upgraded = self.installer.install_agent(
                "codex", environ=environment, upgrade=True
            )
            self.assertEqual(upgraded["status"], "upgraded")
            for name in ("career-profile", "competency-lab"):
                self.assertFalse((root / name).exists())
                backups = list(
                    (root.parent / ".offerloop-backups").glob(
                        f"*/{name}-retired/SKILL.md"
                    )
                )
                self.assertEqual(len(backups), 1)
                self.assertEqual(
                    backups[0].read_text(encoding="utf-8"), f"legacy {name}\n"
                )
            installed = {
                path.parent.name for path in root.glob("*/SKILL.md") if path.is_file()
            }
            self.assertEqual(installed, set(self.installer.SKILL_NAMES))

    def test_hermes_external_skill_collision_is_not_silently_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            external_root = home / ".agents" / "skills"
            duplicate = external_root / "job-collection"
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
            duplicate = external_root / "job-collection"
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
                (hermes_home / "skills" / "job-collection" / "SKILL.md").is_file()
            )
            backups = list(
                (external_root.parent / ".offerloop-backups").glob(
                    "*/hermes-external/*/job-collection/SKILL.md"
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
            self.assertIn("7 个长期 Skill 已处理完成", rendered)
            self.assertIn("欢迎使用 OfferLoop", rendered)
            self.assertIn("求职管理", rendered)
            self.assertIn("求职训练能力", rendered)
            for name in self.installer.SKILL_NAMES:
                self.assertIn(name, rendered)
            self.assertIn("安装只添加本地 Skill", rendered)
            self.assertIn("结束当前 Agent 会话并新开会话", rendered)
            self.assertIn("尚不可正式使用", rendered)
            self.assertIn("飞书工作区初始化", rendered)
            self.assertIn("三张飞书 Base", rendered)

    def test_verify_is_read_only_and_requires_a_complete_install(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            missing_output = io.StringIO()
            with mock.patch.dict(
                self.installer.os.environ,
                environment,
                clear=True,
            ), contextlib.redirect_stdout(missing_output):
                missing_exit = self.installer.main(
                    ["--agent", "codex", "--verify"]
                )

            self.assertEqual(missing_exit, 1)
            self.assertIn("安装核验未通过", missing_output.getvalue())
            self.assertFalse((Path(directory) / ".codex").exists())

            self.installer.install_agent("codex", environ=environment)
            installed_root = Path(directory) / ".codex" / "skills"
            manifest_before = (
                installed_root / self.installer.MANIFEST_NAME
            ).read_text(encoding="utf-8")
            verified_output = io.StringIO()
            with mock.patch.dict(
                self.installer.os.environ,
                environment,
                clear=True,
            ), contextlib.redirect_stdout(verified_output):
                verified_exit = self.installer.main(
                    ["--agent", "codex", "--verify"]
                )

            self.assertEqual(verified_exit, 0)
            self.assertIn("安装核验通过", verified_output.getvalue())
            self.assertEqual(
                (
                    installed_root / self.installer.MANIFEST_NAME
                ).read_text(encoding="utf-8"),
                manifest_before,
            )

    def test_json_verify_reports_manifest_and_skill_integrity(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            self.installer.install_agent("codex", environ=environment)
            output = io.StringIO()
            with mock.patch.dict(
                self.installer.os.environ,
                environment,
                clear=True,
            ), contextlib.redirect_stdout(output):
                exit_code = self.installer.main(
                    ["--agent", "codex", "--verify", "--json"]
                )

            payload = json.loads(output.getvalue())
            self.assertEqual(exit_code, 0)
            self.assertEqual(payload["mode"], "verify")
            self.assertTrue(payload["verified"])
            self.assertTrue(payload["results"][0]["verified"])
            self.assertEqual(payload["results"][0]["manifest"], "ready")
            self.assertNotIn("welcome", payload)

    def test_verify_rejects_a_stale_manifest_without_rewriting_it(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = {"HOME": directory, "PATH": ""}
            self.installer.install_agent("codex", environ=environment)
            manifest = (
                Path(directory)
                / ".codex"
                / "skills"
                / self.installer.MANIFEST_NAME
            )
            payload = json.loads(manifest.read_text(encoding="utf-8"))
            payload["offerloop_version"] = "stale"
            stale = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
            manifest.write_text(stale, encoding="utf-8")

            report = self.installer.verify_agent(
                "codex", environ=environment
            )

            self.assertFalse(report["verified"])
            self.assertEqual(report["manifest"], "mismatch")
            self.assertEqual(manifest.read_text(encoding="utf-8"), stale)

    def test_json_install_returns_structured_welcome_only_on_first_install(self):
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.dict(
                self.installer.os.environ,
                {"HOME": directory, "PATH": ""},
                clear=True,
            ):
                first_output = io.StringIO()
                with contextlib.redirect_stdout(first_output):
                    first_exit = self.installer.main(
                        ["--agent", "codex", "--json"]
                    )
                second_output = io.StringIO()
                with contextlib.redirect_stdout(second_output):
                    second_exit = self.installer.main(
                        ["--agent", "codex", "--json"]
                    )

            first = json.loads(first_output.getvalue())
            second = json.loads(second_output.getvalue())
            self.assertEqual(first_exit, 0)
            self.assertEqual(second_exit, 0)
            self.assertEqual(first["welcome"]["headline"], "欢迎使用 OfferLoop")
            self.assertEqual(
                sum(
                    len(group["skills"])
                    for group in first["welcome"]["groups"]
                ),
                7,
            )
            self.assertNotIn("welcome", second)

    def test_json_install_is_safe_for_windows_legacy_code_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = dict(os.environ)
            environment.update(
                {
                    "HOME": directory,
                    "PATH": "",
                    "PYTHONIOENCODING": "cp1252",
                }
            )
            completed = subprocess.run(
                [
                    os.sys.executable,
                    str(SCRIPT),
                    "--agent",
                    "codex",
                    "--json",
                ],
                env=environment,
                check=True,
                text=True,
                stdout=subprocess.PIPE,
            )

        payload = json.loads(completed.stdout)
        self.assertEqual(payload["results"][0]["status"], "installed")
        self.assertEqual(payload["welcome"]["headline"], "欢迎使用 OfferLoop")

    def test_json_error_is_actionable_without_exposing_exception_text(self):
        private_path = "/private/example/user/secret"
        error = PermissionError(13, "denied", private_path)
        output = io.StringIO()
        with mock.patch.object(
            self.installer, "install_agent", side_effect=error
        ), contextlib.redirect_stdout(output):
            exit_code = self.installer.main(["--agent", "codex", "--json"])

        payload = json.loads(output.getvalue())
        serialized = json.dumps(payload)
        self.assertEqual(exit_code, 1)
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["error"]["phase"], "agent_install")
        self.assertEqual(payload["error"]["agent"], "codex")
        self.assertEqual(payload["error"]["type"], "PermissionError")
        self.assertEqual(payload["error"]["errno"], 13)
        self.assertNotIn(private_path, serialized)
        self.assertNotIn("denied", serialized)

    def test_generated_directories_do_not_affect_digest_or_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "source"
            root.mkdir()
            (root / "SKILL.md").write_text("kept\n", encoding="utf-8")
            digest = self.installer.tree_digest(root)

            for name in ("node_modules", "dist", "build", "evals"):
                generated = root / "assets" / name
                generated.mkdir(parents=True)
                (generated / "generated.txt").write_text(
                    f"ignored {name}\n", encoding="utf-8"
                )

            self.assertEqual(self.installer.tree_digest(root), digest)

            destination = Path(directory) / "destination"
            shutil.copytree(root, destination, ignore=self.installer._ignore_copy)
            self.assertTrue((destination / "SKILL.md").is_file())
            for name in ("node_modules", "dist", "build", "evals"):
                self.assertFalse((destination / "assets" / name).exists())

            (root / "test-prompts.json").write_text("{}\n", encoding="utf-8")
            self.assertEqual(self.installer.tree_digest(root), digest)
            shutil.rmtree(destination)
            shutil.copytree(root, destination, ignore=self.installer._ignore_copy)
            self.assertFalse((destination / "test-prompts.json").exists())

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
        self.assertEqual(self.installer.INSTALLER_VERSION, "3.0")
        self.assertEqual(self.installer.offerloop_version(), "0.1.0-alpha.15")

    def test_skill_index_is_bounded_and_prunes_generated_and_symlinked_trees(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)

            def write_skill(parent, name="job-collection"):
                parent.mkdir(parents=True, exist_ok=True)
                (parent / "SKILL.md").write_text(
                    f"---\nname: {name}\ndescription: fixture\n---\n",
                    encoding="utf-8",
                )

            allowed = root.joinpath(*[f"level-{index}" for index in range(1, 7)])
            too_deep = allowed / "level-7"
            write_skill(allowed)
            write_skill(too_deep)
            for ignored in ("node_modules", "tests", "evals", "dist", "build"):
                write_skill(root / ignored / "generated")
            if hasattr(os, "symlink"):
                try:
                    os.symlink(
                        allowed.parent,
                        root / "linked-root",
                        target_is_directory=True,
                    )
                except OSError:
                    pass

            index = self.installer._skill_directory_index(
                root, ("job-collection",)
            )

            self.assertEqual(index["job-collection"], (allowed,))

    def test_workbuddy_and_hermes_scan_each_root_once(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            workbuddy_root = home / ".workbuddy" / "skills"
            workbuddy_root.mkdir(parents=True)
            with mock.patch.object(
                self.installer,
                "_skill_directory_index",
                wraps=self.installer._skill_directory_index,
            ) as indexed:
                self.installer._workbuddy_import_duplicates(workbuddy_root)
                self.assertEqual(indexed.call_count, 1)

            hermes_root = home / ".hermes" / "skills"
            external_one = home / "external-one"
            external_two = home / "external-two"
            for path in (hermes_root, external_one, external_two):
                path.mkdir(parents=True)
            (hermes_root.parent / "config.yaml").write_text(
                "skills:\n  external_dirs:\n"
                f"    - {external_one}\n"
                f"    - {external_two}\n",
                encoding="utf-8",
            )
            with mock.patch.object(
                self.installer,
                "_skill_directory_index",
                wraps=self.installer._skill_directory_index,
            ) as indexed:
                self.installer._hermes_external_duplicates(
                    home, hermes_root, {"HOME": directory}
                )
                self.assertEqual(indexed.call_count, 2)

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
                "---\nname: job-collection\n"
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
                    / "job-collection"
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
