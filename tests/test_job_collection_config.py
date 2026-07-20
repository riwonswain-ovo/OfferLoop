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
        self.assertIn("信息更新时间 desc, 公司 asc", content)

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


if __name__ == "__main__":
    unittest.main()
