from __future__ import annotations

import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


materializer = load_module(
    "offerloop_agent_materializer",
    ROOT / "skills" / "offerloop-agent" / "scripts" / "materialize_agent.py",
)


class OfferLoopAgentTest(unittest.TestCase):
    def test_full_setup_keeps_codex_agent_optional(self):
        status_model = load_module(
            "offerloop_status_model_for_agent_test",
            ROOT
            / "skills"
            / "offerloop-setup"
            / "scripts"
            / "status_model.py",
        )
        self.assertNotIn("agent", status_model.expand_selection("full"))
        self.assertEqual(
            status_model.expand_selection("agent"),
            {"workspace", "workbench", "agent"},
        )

    def test_materializer_adds_agent_to_the_same_workbench_idempotently(self):
        template = (
            ROOT
            / "skills"
            / "offerloop-workbench"
            / "assets"
            / "workbench-template"
        )
        with tempfile.TemporaryDirectory() as directory:
            workbench = Path(directory) / "workbench"
            worker = Path(directory) / "worker"
            shutil.copytree(template, workbench)
            (workbench / ".spark").mkdir()
            (workbench / ".spark" / "meta.json").write_text(
                '{"app_id":"app_test123"}',
                encoding="utf-8",
            )

            preview = materializer.materialize(
                workbench,
                worker,
                expected_app_id="app_test123",
            )
            self.assertFalse(preview["applied"])
            self.assertFalse(preview["creates_second_miaoda_app"])
            self.assertTrue(preview["binding_verified"])
            self.assertNotIn("app_id", preview)
            self.assertTrue(preview["workbench_changes"])
            self.assertTrue(preview["worker_changes"])

            applied = materializer.materialize(
                workbench,
                worker,
                apply=True,
                expected_app_id="app_test123",
            )
            self.assertTrue(applied["applied"])
            self.assertIsNotNone(applied["backup_dir"])
            self.assertTrue(
                (
                    workbench
                    / "server"
                    / "modules"
                    / "agent-chat"
                    / "agent-chat.service.ts"
                ).is_file()
            )
            self.assertIn(
                "AgentLayoutContext",
                (
                    workbench / "client" / "src" / "components" / "Layout.tsx"
                ).read_text(encoding="utf-8"),
            )
            self.assertIn(
                "AgentChatModule",
                (workbench / "server" / "app.module.ts").read_text(
                    encoding="utf-8"
                ),
            )

            repeated = materializer.materialize(
                workbench,
                worker,
                expected_app_id="app_test123",
            )
            self.assertEqual(repeated["workbench_changes"], [])
            self.assertEqual(repeated["worker_changes"], [])

    def test_materializer_rejects_wrong_app_and_modified_layout(self):
        template = (
            ROOT
            / "skills"
            / "offerloop-workbench"
            / "assets"
            / "workbench-template"
        )
        with tempfile.TemporaryDirectory() as directory:
            workbench = Path(directory) / "workbench"
            shutil.copytree(template, workbench)
            (workbench / ".spark").mkdir()
            (workbench / ".spark" / "meta.json").write_text(
                '{"app_id":"app_actual"}',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                materializer.MaterializeError,
                "does not match the expected",
            ):
                materializer.materialize(
                    workbench,
                    expected_app_id="app_other",
                )

            layout = workbench / "client" / "src" / "components" / "Layout.tsx"
            layout.write_text(
                layout.read_text(encoding="utf-8").replace(
                    '<Outlet />',
                    '<main><Outlet /></main>',
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                materializer.MaterializeError,
                "refusing to overwrite modified",
            ):
                materializer.materialize(
                    workbench,
                    expected_app_id="app_actual",
                )

    def test_agent_queue_is_service_role_only_and_owner_bound(self):
        addon = (
            ROOT
            / "skills"
            / "offerloop-agent"
            / "assets"
            / "workbench-addon"
        )
        migrations = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted((addon / "migrations").glob("*.sql"))
        )
        repository = (
            addon
            / "server"
            / "modules"
            / "agent-chat"
            / "agent-chat.repository.ts"
        ).read_text(encoding="utf-8")
        schema = (
            addon
            / "server"
            / "modules"
            / "agent-chat"
            / "agent-chat.schema.ts"
        ).read_text(encoding="utf-8")

        self.assertNotIn("TO authenticated, anon", migrations)
        self.assertNotIn("TO anon", migrations)
        self.assertNotIn("TO authenticated USING (true)", migrations)
        self.assertIn(
            "FOR ALL TO service_role USING (true) WITH CHECK (true)",
            migrations,
        )
        self.assertIn("CREATE POLICY authenticated_owner_policy", migrations)
        self.assertIn("((owner).user_id)::text", migrations)
        self.assertIn("owner: userProfile('owner').notNull()", schema)
        self.assertIn("eq(agentRunTable.owner, owner)", repository)
        self.assertIn("eq(agentWorkerTable.owner, owner)", repository)

    def test_worker_distribution_contains_no_developer_binding(self):
        worker = ROOT / "skills" / "offerloop-agent" / "assets" / "agent-worker"
        combined = "\n".join(
            path.read_text(encoding="utf-8", errors="replace")
            for path in worker.rglob("*")
            if path.is_file()
        )
        self.assertNotIn("/Users/", combined)
        self.assertNotRegex(
            combined,
            r"OFFERLOOP_WORKBENCH_APP_ID=app_[a-zA-Z0-9]{8,}",
        )
        self.assertIn("OFFERLOOP_WORKBENCH_APP_ID", combined)
        self.assertIn("OFFERLOOP_FEISHU_USER_ID", combined)
        self.assertFalse((worker / "src" / "server.mjs").exists())


if __name__ == "__main__":
    unittest.main()
