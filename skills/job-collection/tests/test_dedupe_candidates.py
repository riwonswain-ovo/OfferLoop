from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.dedupe_candidates import (
    company_search_keywords,
    extract_target_records,
    partition_candidates,
)
from scripts.sync_utils import (
    normalize_company_name,
    normalize_recruitment_batch,
    normalize_url,
)


def candidate(**overrides):
    result = {
        "source_id": "SRC",
        "source_record_id": "1",
        "stable_key": "SRC:1",
        "company_name": "示例公司",
        "recruitment_batch": "秋招专场",
        "project_name": "示例公司 秋招专场",
        "job_positions": "产品经理",
        "source_url": "https://example.com/notice?a=1&amp;b=2",
        "official_url": "https://example.com/#/jobs",
        "route": "auto_write",
    }
    result.update(overrides)
    return result


class DedupeCandidateTests(unittest.TestCase):
    def test_company_and_batch_wording_are_normalized(self):
        self.assertEqual(normalize_company_name("水滴公司"), "水滴")
        self.assertEqual(normalize_company_name("水滴"), "水滴")
        self.assertEqual(normalize_recruitment_batch("2027届秋招专场"), "秋招")
        self.assertEqual(normalize_recruitment_batch("秋季校园招聘"), "秋招")
        self.assertEqual(normalize_recruitment_batch("秋招提前批"), "秋招提前批")

    def test_company_search_uses_raw_and_suffix_free_names(self):
        self.assertEqual(
            company_search_keywords("示例科技股份有限公司"),
            ("示例科技", "示例科技股份有限公司"),
        )

    def test_normalize_url_unwraps_markdown_and_html_entities(self):
        self.assertEqual(
            normalize_url("[入口](https://example.com/path?a=1&amp;b=2)"),
            "https://example.com/path?a=1&b=2",
        )

    def test_tabular_response_is_parsed(self):
        rows = extract_target_records({
            "data": {
                "fields": ["投递进度", "公司"],
                "data": [["已投递", "携程集团"]],
                "record_id_list": ["rec1"],
            }
        })
        self.assertEqual(rows[0]["公司"], "携程集团")
        self.assertEqual(rows[0]["_record_id"], "rec1")

    def test_exact_announcement_link_removes_candidate_from_write_and_pending(self):
        item = candidate(company_name="携程集团")
        records = [{
            "_record_id": "rec1",
            "投递进度": ["已投递"],
            "公司": "携程集团",
            "招聘批次": ["秋招专场"],
            "公告链接": "https://example.com/notice?a=1&b=2",
            "投递链接": "[入口](https://example.com/#/jobs)",
        }]
        result = partition_candidates([item], records)
        self.assertEqual(result["summary"]["duplicate"], 1)
        self.assertEqual(result["write_candidates"], [])
        self.assertEqual(result["pending_candidates"], [])
        self.assertEqual(result["decisions"][0]["target_statuses"], ["已投递"])

    def test_same_company_batch_and_jobs_is_duplicate_without_url_match(self):
        item = candidate(source_url="https://new.example/notice", official_url="")
        records = [{
            "_record_id": "rec2",
            "投递进度": "待确认",
            "公司": "示例公司",
            "招聘批次": "秋招专场",
            "招聘岗位": "产品经理",
            "公告链接": "https://old.example/notice",
        }]
        result = partition_candidates([item], records)
        self.assertEqual(result["summary"]["duplicate"], 1)

    def test_same_company_and_batch_with_different_details_needs_confirmation(self):
        item = candidate(source_url="https://new.example/notice", official_url="")
        records = [{
            "_record_id": "rec3",
            "公司": "示例公司",
            "招聘批次": "秋招专场",
            "招聘项目": "另一项目",
            "招聘岗位": "研发工程师",
        }]
        result = partition_candidates([item], records)
        self.assertEqual(result["summary"]["pending"], 1)
        self.assertEqual(result["write_candidates"], [])

    def test_terminal_status_same_normalized_company_and_batch_is_duplicate(self):
        item = candidate(
            company_name="水滴",
            recruitment_batch="秋招",
            project_name="水滴 2027届秋招启动",
            job_positions="",
            source_url="",
            official_url="https://www.waterdrop-inc.com/",
            route="awaiting_write_confirmation",
        )
        records = [{
            "_record_id": "rec-water",
            "投递进度": ["已投递"],
            "公司": "水滴公司",
            "招聘批次": ["秋招专场"],
            "招聘岗位": "产品类、运营类",
            "投递链接": "https://wdh.jobs.feishu.cn/345030",
        }]
        result = partition_candidates([item], records)
        self.assertEqual(result["summary"]["duplicate"], 1)
        self.assertEqual(result["pending_candidates"], [])
        self.assertEqual(result["decisions"][0]["target_statuses"], ["已投递"])

    def test_terminal_status_in_different_true_batch_is_not_duplicate(self):
        item = candidate(
            company_name="虎牙",
            recruitment_batch="秋招",
            source_url="",
            official_url="https://example.com/new",
        )
        records = [{
            "_record_id": "rec-huya",
            "投递进度": ["已投递"],
            "公司": "虎牙公司",
            "招聘批次": ["秋招提前批"],
            "投递链接": "https://example.com/old",
        }]
        result = partition_candidates([item], records)
        self.assertEqual(result["summary"]["duplicate"], 0)
        self.assertEqual(result["summary"]["write"], 1)


if __name__ == "__main__":
    unittest.main()
