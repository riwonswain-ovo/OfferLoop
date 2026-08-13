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
    def test_layout_names_match_the_confirmed_workspace_tree(self):
        contract = load_module()
        self.assertEqual(
            contract.describe_layout(),
            {
                "folders": {
                    "user_profile": ["02｜用户画像"],
                    "current_resumes": ["03｜定制简历"],
                    "experience_deepthink": ["04｜经历深挖"],
                    "competency_profiles": ["05｜岗位能力与训练", "岗位能力画像"],
                    "competency_training": ["05｜岗位能力与训练", "专项训练"],
                    "interview_prep": ["06｜面试准备"],
                    "mock_lab": ["07｜模拟面试"],
                    "interview_review": ["08｜真实面试复盘", "已完成复盘"],
                    "interview_asr": ["08｜真实面试复盘", "ASR 待复盘"],
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
        self.assertEqual(migrated["schema_version"], 6)
        self.assertEqual(migrated["lark_profile"], "offerloop")
        self.assertEqual(migrated["notifications"], {"status": "disabled"})
        self.assertEqual(
            migrated["artifact_storage"], contract.default_artifact_storage()
        )

    def test_run_id_and_all_titles_are_deterministic(self):
        contract = load_module()
        now = datetime(2026, 7, 24, 12, 30, 45, tzinfo=timezone.utc)
        cases = {
            "experience-deepthink": "经历深挖｜推荐系统实习｜产品经理",
            "interview-prep": "面试准备｜示例公司｜产品经理｜一面｜2026-07-24",
            "mock-lab": "模拟面试｜示例公司｜产品经理｜一面｜2026-07-24｜01",
            "talk-review": "面试复盘｜示例公司｜产品经理｜一面｜2026-07-24",
            "competency-lab": "能力训练｜产品经理｜2026-07-24｜01",
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
                        if skill == "experience-deepthink"
                        else "示例公司产品面"
                        if skill == "mock-lab"
                        else "AI 搜索设计"
                    ),
                    resume_version="互联网产品经理岗 - 简历",
                    target_direction="产品经理",
                    company="示例公司",
                    position="产品经理",
                    stage="一面",
                )
                self.assertTrue(title.startswith(prefix))
                if skill == "experience-deepthink":
                    self.assertEqual(title, prefix)
                    self.assertNotIn(run_id, title)
                self.assertNotIn(run_id, title)

    def test_experience_deepthink_title_is_stable_per_experience_and_direction(self):
        contract = load_module()
        run_id_product = contract.new_run_id(
            "experience-deepthink",
            now=datetime(2026, 7, 24, 12, 30, 45, tzinfo=timezone.utc),
            suffix="a1b2c3d4",
        )
        run_id_operations = contract.new_run_id(
            "experience-deepthink",
            now=datetime(2026, 7, 24, 12, 30, 46, tzinfo=timezone.utc),
            suffix="e5f6g7h8",
        )
        shared = {
            "subject": "推荐系统实习",
            "resume_version": "互联网产品经理岗 - 简历",
        }
        product = contract.build_title(
            "experience-deepthink",
            run_id_product,
            target_direction="产品经理",
            **shared,
        )
        operations = contract.build_title(
            "experience-deepthink",
            run_id_operations,
            target_direction="运营",
            **shared,
        )
        self.assertTrue(product.endswith("｜产品经理"))
        self.assertTrue(operations.endswith("｜运营"))
        self.assertNotEqual(product, operations)

        later_product = contract.build_title(
            "experience-deepthink",
            run_id_operations,
            target_direction="产品经理",
            **shared,
        )
        self.assertEqual(product, later_product)

    def test_experience_deepthink_builds_stable_titles_for_both_artifacts(self):
        contract = load_module()
        run_id = contract.new_run_id(
            "experience-deepthink",
            now=datetime(2026, 7, 24, 12, 30, 45, tzinfo=timezone.utc),
            suffix="a1b2c3d4",
        )
        shared = {
            "subject": "推荐系统实习",
            "target_direction": "产品经理",
        }
        detail_reconstruction = contract.build_title(
            "experience-deepthink",
            run_id,
            artifact_type="detail-reconstruction",
            **shared,
        )
        legacy_restored_prd = contract.build_title(
            "experience-deepthink",
            run_id,
            artifact_type="restored-prd",
            **shared,
        )
        interview_transcript = contract.build_title(
            "experience-deepthink",
            run_id,
            artifact_type="interview-transcript",
            **shared,
        )
        self.assertEqual(
            detail_reconstruction,
            "细节复原稿｜推荐系统实习｜产品经理",
        )
        self.assertEqual(
            legacy_restored_prd,
            "复原 PRD｜推荐系统实习｜产品经理",
        )
        self.assertEqual(
            interview_transcript,
            "面试逐字稿｜推荐系统实习｜产品经理",
        )
        self.assertNotIn(run_id, detail_reconstruction)
        self.assertNotIn(run_id, legacy_restored_prd)
        self.assertNotIn(run_id, interview_transcript)

    def test_career_profile_builds_three_distinct_document_titles(self):
        contract = load_module()
        run_id = contract.new_run_id(
            "career-profile",
            now=datetime(2026, 7, 24, 12, 30, 45, tzinfo=timezone.utc),
            suffix="a1b2c3d4",
        )
        expected = {
            "job-preference": "岗位选择偏好｜小王",
            "personality-exploration": "个人性格探索｜小王",
            "language-habits": "语言表达习惯｜小王",
        }
        for artifact_type, title in expected.items():
            self.assertEqual(
                contract.build_title(
                    "career-profile",
                    run_id,
                    artifact_type=artifact_type,
                    subject="小王",
                ),
                title,
            )
            self.assertEqual(
                contract.route_folder(
                    "career-profile",
                    "incomplete",
                    artifact_type=artifact_type,
                ),
                "user_profile",
            )

    def test_talk_review_builds_distinct_titles_for_all_artifacts(self):
        contract = load_module()
        run_id = contract.new_run_id(
            "talk-review",
            now=datetime(2026, 7, 24, 12, 30, 45, tzinfo=timezone.utc),
            suffix="a1b2c3d4",
        )
        shared = {
            "company": "示例公司",
            "position": "产品经理",
            "stage": "一面",
            "date": "2026-07-24",
        }
        self.assertEqual(
            contract.build_title("talk-review", run_id, **shared),
            "面试复盘｜示例公司｜产品经理｜一面｜2026-07-24",
        )
        self.assertEqual(
            contract.build_title(
                "talk-review",
                run_id,
                artifact_type="recruiter-assessment",
                **shared,
            ),
            "招聘者评估｜示例公司｜产品经理｜一面｜2026-07-24",
        )
        self.assertEqual(
            contract.build_title(
                "talk-review",
                run_id,
                artifact_type="interview-asr",
                **shared,
            ),
            "面试ASR｜示例公司｜产品经理｜一面｜2026-07-24",
        )
        self.assertEqual(
            contract.route_folder(
                "talk-review",
                "completed",
                artifact_type="recruiter-assessment",
            ),
            "interview_review",
        )

    def test_find_by_title_never_chooses_first_ambiguous_candidate(self):
        contract = load_module()
        title = "经历深挖｜推荐系统实习｜产品经理"
        result = contract.find_by_title(
            [
                {"title": title, "node_token": "one"},
                {"title": title, "node_token": "two"},
                {"title": "经历深挖｜其他经历｜产品经理", "node_token": "three"},
            ],
            title,
        )
        self.assertEqual(result["match_status"], "ambiguous")
        self.assertEqual(len(result["matches"]), 2)

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

    def test_folder_tokens_drive_readiness_per_skill(self):
        contract = load_module()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            path.write_text(
                json.dumps(contract.migrate_config({"schema_version": 2})),
                encoding="utf-8",
            )
            contract.register_folder(path, "current_resumes", "wik_folder_a")
            result = contract.register_folder(
                path, "experience_deepthink", "wik_folder_b"
            )
            storage = contract.load_config(path)["artifact_storage"]
            self.assertTrue(storage["readiness"]["experience_deepthink"])
            self.assertEqual(storage["status"], "partial")
            self.assertEqual(
                storage["folders"]["experience_deepthink"], "wik_folder_b"
            )
            self.assertNotIn("documents", storage)
            self.assertEqual(result["schema_version"], 6)

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

        self.assertEqual(migrated["schema_version"], 6)
        self.assertEqual(storage["folders"]["current_resumes"], "resume-folder")
        self.assertEqual(storage["folders"]["interview_prep"], "prep-folder")
        self.assertEqual(storage["folders"]["interview_asr"], "asr-folder")
        self.assertEqual(storage["folders"]["interview_review"], "review-folder")
        self.assertNotIn("historical_resumes", storage["folders"])
        self.assertNotIn("documents", storage)

    def test_find_by_run_never_chooses_first_ambiguous_candidate(self):
        contract = load_module()
        run_id = "mock-lab-20260724123045-a1b2c3d4"
        result = contract.find_by_run(
            [
                {"title": "A", "run_id": run_id, "node_token": "one"},
                {"title": "B", "metadata": {"run_id": run_id}, "node_token": "two"},
            ],
            run_id,
        )
        self.assertEqual(result["match_status"], "ambiguous")
        self.assertEqual(len(result["matches"]), 2)

    def test_markdown_requires_metadata_and_rejects_html(self):
        contract = load_module()
        run_id = "competency-lab-20260724123045-a1b2c3d4"
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

    def test_experience_deepthink_content_only_markdown_omits_metadata(self):
        contract = load_module()
        run_id = "experience-deepthink-20260724123045-a1b2c3d4"
        markdown = (
            "# 经历深挖｜竞赛经历｜财务分析岗\n\n"
            "## 一、经历全景与基础口述稿\n\n内容"
        )
        self.assertFalse(
            contract.validate_markdown(markdown, run_id=run_id)["valid"]
        )
        self.assertTrue(
            contract.validate_markdown(
                markdown,
                run_id=run_id,
                content_only=True,
            )["valid"]
        )

    def test_interview_prep_content_only_markdown_omits_metadata(self):
        contract = load_module()
        run_id = "interview-prep-20260724123045-a1b2c3d4"
        markdown = (
            "# 面试准备｜示例公司｜产品经理｜一面｜2026-07-24\n\n"
            "## 90 秒自我介绍\n\n内容\n\n"
            "## 公司、业务与岗位认知\n\n内容"
        )
        self.assertFalse(
            contract.validate_markdown(markdown, run_id=run_id)["valid"]
        )
        self.assertTrue(
            contract.validate_markdown(
                markdown,
                run_id=run_id,
                content_only=True,
            )["valid"]
        )

    def test_mock_lab_content_only_markdown_omits_metadata_section(self):
        contract = load_module()
        run_id = "mock-lab-20260724123045-a1b2c3d4"
        markdown = (
            "# 模拟面试｜示例公司｜产品经理｜一面｜2026-07-24｜01\n\n"
            "## 模拟设置\n\n内容\n\n"
            "## 材料来源\n\n内容"
        )
        self.assertFalse(
            contract.validate_markdown(markdown, run_id=run_id)["valid"]
        )
        self.assertTrue(
            contract.validate_markdown(
                markdown,
                run_id=run_id,
                content_only=True,
            )["valid"]
        )

    def test_talk_review_content_only_markdown_omits_metadata_section(self):
        contract = load_module()
        run_id = "talk-review-20260724123045-a1b2c3d4"
        markdown = (
            "# 面试复盘｜示例公司｜产品经理｜一面｜2026-07-24\n\n"
            "## 面试概览\n\n内容\n\n"
            "## 原始转写来源与质量\n\n内容"
        )
        self.assertFalse(
            contract.validate_markdown(markdown, run_id=run_id)["valid"]
        )
        self.assertTrue(
            contract.validate_markdown(
                markdown,
                run_id=run_id,
                content_only=True,
            )["valid"]
        )

    def test_storage_schema_rejects_missing_locator_keys(self):
        contract = load_module()
        storage = contract.default_artifact_storage()
        del storage["folders"]["mock_lab"]
        with self.assertRaisesRegex(ValueError, "folders keys"):
            contract.validate_artifact_storage(storage)


if __name__ == "__main__":
    unittest.main()
