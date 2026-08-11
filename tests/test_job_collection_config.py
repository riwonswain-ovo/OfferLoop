from pathlib import Path
import importlib.util
import re
import tempfile
import unittest


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "skills"
    / "job-collection"
    / "scripts"
    / "get_token.py"
)
ROOT = Path(__file__).resolve().parents[1]
FIELD_CONTRACT = ROOT / "skills" / "job-collection" / "references" / "field-contract.md"
EXCEL_INSERT = ROOT / "skills" / "job-collection" / "references" / "excel-insert.md"
JOB_COLLECTION_SKILL = ROOT / "skills" / "job-collection" / "SKILL.md"
TENCENT_SOURCE = (
    ROOT
    / "skills"
    / "job-collection"
    / "references"
    / "tencent-smartsheet-source.md"
)
PREWRITE_CONFIRMATION = (
    ROOT
    / "skills"
    / "job-collection"
    / "references"
    / "prewrite-confirmation.md"
)
INIT_WORKFLOW = (
    ROOT / "skills" / "job-collection" / "references" / "init-workflow.md"
)
CAREER_PROFILE_SKILL = ROOT / "skills" / "career-profile" / "SKILL.md"
CAREER_PROFILE_CONVERSATION = (
    ROOT / "skills" / "career-profile" / "references" / "conversation-guide.md"
)
CAREER_PROFILE_SCHEMA = (
    ROOT / "skills" / "career-profile" / "references" / "profile-schema.md"
)
JOB_PREFERENCE_WORKFLOW = (
    ROOT
    / "skills"
    / "career-profile"
    / "references"
    / "job-preference-workflow.md"
)
EXPECTED_ENTERPRISE_FIELDS = [
    "信息更新时间",
    "投递进度",
    "公司",
    "招聘批次",
    "招聘项目",
    "招聘岗位",
    "公告链接",
    "投递链接",
    "投递截止时间",
    "城市",
    "行业标签",
    "企业性质",
    "子表 record_id",
]
SPEC = importlib.util.spec_from_file_location("get_token", SCRIPT)
get_token = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(get_token)


class JobCollectionConfigTest(unittest.TestCase):
    def test_skill_uses_record_ids_and_documents_progress_reconciliation(self):
        content = JOB_COLLECTION_SKILL.read_text(encoding="utf-8")
        self.assertNotIn("编号", content)
        self.assertIn("`感兴趣`", content)
        self.assertIn("scripts/progress_sync.py", content)
        self.assertIn("企业清单 record_id", content)
        self.assertIn("`投递记录 ID`", content)
        self.assertIn("合法的一对多关系", content)
        self.assertIn("信息更新时间 desc, 公司 asc", content)
        self.assertIn("没有配置 `progress_base_url` 时跳过跨 Base 对账", content)
        self.assertIn("不能因此阻塞", content)
        self.assertIn("`投递简历版本`", content)
        self.assertIn("SingleSelect", content)
        self.assertIn("不读取飞书知识库", content)

    def test_reference_docs_publish_the_exact_enterprise_schema(self):
        for path in (FIELD_CONTRACT, EXCEL_INSERT):
            content = path.read_text(encoding="utf-8")
            match = re.search(
                r"<!-- ENTERPRISE_FIELDS:START -->\n(.*?)\n<!-- ENTERPRISE_FIELDS:END -->",
                content,
                re.DOTALL,
            )
            self.assertIsNotNone(match, path)
            fields = re.findall(r"^\d+\. (.+)$", match.group(1), re.MULTILINE)
            self.assertEqual(fields, EXPECTED_ENTERPRISE_FIELDS, path)

    def test_reference_docs_publish_all_four_application_statuses(self):
        for path in (FIELD_CONTRACT, EXCEL_INSERT):
            content = path.read_text(encoding="utf-8")
            self.assertIn("`待确认`、`感兴趣`、`已投递`、`已拒绝`", content, path)

    def test_prewrite_confirmation_separates_hard_and_soft_preferences(self):
        skill = JOB_COLLECTION_SKILL.read_text(encoding="utf-8")
        contract = PREWRITE_CONFIRMATION.read_text(encoding="utf-8")
        for marker in (
            "`target_cities` 是城市硬条件",
            "`selected_industries` 是目标行业硬条件",
            "`target_job_preferences` 是岗位软偏好",
            "`hard_filtered`",
            "`auto_write`",
            "`prewrite_confirmation`",
            "`awaiting_confirmation`",
            "保留该来源旧游标",
        ):
            self.assertIn(marker, contract)
        self.assertIn("写入前集中请用户确认", skill)
        self.assertIn("不能与 `投递进度=待确认` 混淆", skill)

    def test_career_profile_owns_all_preference_questions_and_job_collection_only_mirrors(self):
        career = CAREER_PROFILE_SKILL.read_text(encoding="utf-8")
        workflow = JOB_PREFERENCE_WORKFLOW.read_text(encoding="utf-8")
        schema = CAREER_PROFILE_SCHEMA.read_text(encoding="utf-8")
        job = JOB_COLLECTION_SKILL.read_text(encoding="utf-8")
        init = INIT_WORKFLOW.read_text(encoding="utf-8")
        questions = (
            "你目前是什么学历、读什么专业，预计哪一年毕业？",
            "你之前实习、兼职或正式工作接触过哪些岗位方向？",
            "哪些你愿意考虑，哪些你不想考虑？",
            "哪些是你确认完全不考虑的？",
            "哪些城市的招聘信息可以直接保留？",
            "你希望保留哪些招聘类型？",
            "行业上你希望怎么筛选？",
            "有没有希望优先关注的公司",
        )

        self.assertIn("固定迁移原 `job-collection` 的偏好提问", career)
        positions = [workflow.index(question) for question in questions]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("# 岗位选择偏好｜<显示名>", schema)
        self.assertIn("岗位选择偏好｜<显示名>", job)
        self.assertIn("不得询问毕业年份、专业、岗位经历", job)
        self.assertIn("不提问任何求职偏好", job)
        self.assertIn("不再负责下面任何字段的提问、解释或确认", init)
        self.assertIn("机器可读运行镜像", init)
        self.assertIn("target_cities 与 city_filter_mode", init)

    def test_default_env_file_is_update_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            path = get_token.default_env_file({"XDG_CONFIG_HOME": directory})
            self.assertEqual(
                path, Path(directory) / "offerloop" / "job-collection" / ".env"
            )

    def test_environment_overrides_offerloop_env_file(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "FEISHU_APP_ID=file\nFEISHU_APP_SECRET=file-secret\n",
                encoding="utf-8",
            )
            credentials = get_token.load_credentials(
                {
                    "FEISHU_APP_ID": "process",
                    "FEISHU_APP_SECRET": "process-secret",
                },
                env_file,
            )
            self.assertEqual(credentials, ("process", "process-secret"))

    def test_tencent_source_prefers_official_mcp_with_complete_pagination(self):
        skill = JOB_COLLECTION_SKILL.read_text(encoding="utf-8")
        source = TENCENT_SOURCE.read_text(encoding="utf-8")
        self.assertIn("官方 MCP", skill)
        self.assertIn("scripts/tencent_mcp.py", skill)
        for marker in (
            "smartsheet.list_records",
            "offset",
            "limit=100",
            "has_more=false",
            "total",
            "record_id",
            "浏览器兜底",
        ):
            self.assertIn(marker, source)


if __name__ == "__main__":
    unittest.main()
