from datetime import datetime, timezone
from pathlib import Path
import importlib.util
import json
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (
    ROOT
    / "skills"
    / "offerloop-workspace"
    / "scripts"
    / "artifact_contract.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location("artifact_contract", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ArtifactContractTest(unittest.TestCase):
    def test_layout_names_match_the_confirmed_knowledge_base_tree(self):
        contract = load_module()
        self.assertEqual(
            contract.describe_layout(),
            {
                "folders": {
                    "current_resumes": ["01｜当前简历"],
                    "resume_deepthink": ["02｜简历深挖"],
                    "interview_prep": ["03｜面试准备文档"],
                    "interview_review": ["04｜面试复盘", "已完成复盘"],
                    "interview_asr": ["04｜面试复盘", "ASR待复盘"],
                    "pm_sense": ["05｜产品 Sense"],
                    "mock_lab": ["06｜模拟面试"],
                },
                "documents": {
                    "question_bank_pending": ["07｜题库", "待学习题库"],
                    "question_bank_mastered": ["07｜题库", "已学会题库"],
                },
            },
        )

    def test_migration_preserves_v2_values_and_initializes_empty_storage(self):
        contract = load_module()
        migrated = contract.migrate_config(
            {
                "schema_version": 2,
                "lark_profile": "offerloop",
                "notifications": {"status": "disabled"},
            }
        )
        self.assertEqual(migrated["schema_version"], 4)
        self.assertEqual(migrated["lark_profile"], "offerloop")
        self.assertEqual(migrated["notifications"], {"status": "disabled"})
        self.assertEqual(
            migrated["artifact_storage"], contract.default_artifact_storage()
        )

    def test_run_id_and_all_titles_are_deterministic(self):
        contract = load_module()
        now = datetime(2026, 7, 24, 12, 30, 45, tzinfo=timezone.utc)
        cases = {
            "resume-deepthink": "简历深挖｜互联网产品经理岗 - 简历｜推荐系统实习｜2026-07-24｜",
            "interview-prep": "示例公司｜产品经理｜一面准备｜2026-07-24｜",
            "mock-lab": "示例公司产品面｜模拟面试｜2026-07-24｜",
            "talk-review": "示例公司｜产品经理｜一面复盘｜2026-07-24｜",
            "pm-sense": "产品思维｜AI 搜索设计｜2026-07-24｜",
        }
        for skill, prefix in cases.items():
            with self.subTest(skill=skill):
                run_id = contract.new_run_id(
                    skill, now=now, suffix="a1b2c3d4"
                )
                title = contract.build_title(
                    skill,
                    run_id,
                    subject=(
                        "推荐系统实习"
                        if skill == "resume-deepthink"
                        else "示例公司产品面"
                        if skill == "mock-lab"
                        else "AI 搜索设计"
                    ),
                    resume_version="互联网产品经理岗 - 简历",
                    company="示例公司",
                    position="产品经理",
                    stage="一面",
                )
                self.assertTrue(title.startswith(prefix))
                self.assertTrue(title.endswith(run_id))

    def test_entity_ids_use_stable_schema_prefixes(self):
        contract = load_module()
        self.assertEqual(
            contract.new_entity_id("experience", suffix="a1b2c3d4"),
            "exp-a1b2c3d4",
        )
        self.assertEqual(
            contract.new_entity_id("fact", suffix="a1b2c3d4"),
            "fact-a1b2c3d4",
        )

    def test_folder_and_document_tokens_are_separate_and_readiness_is_per_skill(self):
        contract = load_module()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text(
                json.dumps(contract.migrate_config({"schema_version": 2})),
                encoding="utf-8",
            )
            contract.register_folder(path, "current_resumes", "wik_folder_a")
            result = contract.register_folder(
                path, "resume_deepthink", "wik_folder_b"
            )
            contract.register_document(
                path, "question_bank_pending", "wik_doc_c"
            )
            storage = contract.load_config(path)["artifact_storage"]
            self.assertTrue(storage["readiness"]["resume_deepthink"])
            self.assertEqual(storage["status"], "partial")
            self.assertEqual(
                storage["folders"]["resume_deepthink"], "wik_folder_b"
            )
            self.assertEqual(
                storage["documents"]["question_bank_pending"], "wik_doc_c"
            )
            self.assertNotEqual(
                storage["folders"]["resume_deepthink"],
                storage["documents"]["question_bank_pending"],
            )
            self.assertEqual(result["schema_version"], 4)

    def test_v3_storage_migrates_to_current_resume_and_fixed_output_folders(self):
        contract = load_module()
        old = {
            "schema_version": 3,
            "artifact_storage": {
                "folders": {
                    "current_resumes": "resume-folder",
                    "resume_deepthink": "deepthink-folder",
                    "pm_sense": "pm-folder",
                    "mock_lab": "mock-folder",
                    "interview_prep_completed": "prep-folder",
                    "interview_review_pending": "asr-folder",
                    "interview_review_completed": "review-folder",
                    "historical_resumes": "legacy-history",
                },
                "documents": {"experience_master": "legacy-master"},
            },
        }

        migrated = contract.migrate_config(old)
        storage = migrated["artifact_storage"]

        self.assertEqual(migrated["schema_version"], 4)
        self.assertEqual(storage["folders"]["current_resumes"], "resume-folder")
        self.assertEqual(storage["folders"]["interview_prep"], "prep-folder")
        self.assertEqual(storage["folders"]["interview_asr"], "asr-folder")
        self.assertEqual(storage["folders"]["interview_review"], "review-folder")
        self.assertNotIn("historical_resumes", storage["folders"])
        self.assertNotIn("experience_master", storage["documents"])

    def test_find_by_run_never_chooses_first_ambiguous_candidate(self):
        contract = load_module()
        run_id = "mock-lab-20260724123045-a1b2c3d4"
        result = contract.find_by_run(
            [
                {"title": f"A｜{run_id}", "node_token": "one"},
                {"title": f"B｜{run_id}", "node_token": "two"},
            ],
            run_id,
        )
        self.assertEqual(result["match_status"], "ambiguous")
        self.assertEqual(len(result["matches"]), 2)

    def test_markdown_requires_metadata_and_rejects_html(self):
        contract = load_module()
        run_id = "pm-sense-20260724123045-a1b2c3d4"
        valid = contract.validate_markdown(
            f"# 标题\n\n## 产物信息\n\n- run_id：{run_id}\n\n## 正文\n\n内容",
            run_id=run_id,
        )
        self.assertTrue(valid["valid"])
        invalid = contract.validate_markdown(
            f"# 标题\n\n## 产物信息\n\n{run_id}\n<script>alert(1)</script>",
            run_id=run_id,
        )
        self.assertFalse(invalid["valid"])

    def test_storage_schema_rejects_missing_locator_keys(self):
        contract = load_module()
        storage = contract.default_artifact_storage()
        del storage["folders"]["mock_lab"]
        with self.assertRaisesRegex(ValueError, "folders keys"):
            contract.validate_artifact_storage(storage)


if __name__ == "__main__":
    unittest.main()
