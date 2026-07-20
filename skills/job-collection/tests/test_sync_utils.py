from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.sync_utils import (
    APPLICATION_STATUSES,
    ENTERPRISE_FIELDS,
    normalize_url,
    overlap_start,
    parse_feishu_bitable_url,
    recruitment_fingerprint,
    resolve_profile_field,
)


class SyncUtilsTest(unittest.TestCase):
    def test_enterprise_schema_has_exact_field_order(self):
        self.assertEqual(
            ENTERPRISE_FIELDS,
            (
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
            ),
        )
        self.assertNotIn("编号", ENTERPRISE_FIELDS)

    def test_application_statuses_include_interest_without_remapping(self):
        self.assertEqual(
            APPLICATION_STATUSES,
            ("待确认", "感兴趣", "已投递", "已拒绝"),
        )

    def test_parse_feishu_url_with_arbitrary_query_order(self):
        url = "https://example.feishu.cn/base/bascnExample?view=vewExample&table=tblExample"
        self.assertEqual(parse_feishu_bitable_url(url), ("bascnExample", "tblExample"))

    def test_parse_larksuite_url(self):
        url = "https://example.larksuite.com/base/bascnExample?table=tblExample"
        self.assertEqual(parse_feishu_bitable_url(url), ("bascnExample", "tblExample"))

    def test_reject_non_feishu_url(self):
        with self.assertRaises(ValueError):
            parse_feishu_bitable_url("https://example.com/base/a?table=b")

    def test_overlap_uses_previous_calendar_day(self):
        cursor = datetime(2026, 7, 11, 23, 59, 59, tzinfo=timezone.utc)
        self.assertEqual(
            overlap_start(cursor),
            datetime(2026, 7, 10, 0, 0, 0, tzinfo=timezone.utc),
        )

    def test_normalize_url_removes_tracking_and_fragment(self):
        url = "HTTPS://Example.COM/jobs/42/?utm_source=x&job=pm#details"
        self.assertEqual(normalize_url(url), "https://example.com/jobs/42?job=pm")

    def test_fingerprint_normalizes_width_case_and_punctuation(self):
        left = recruitment_fingerprint("ＡＣＭＥ 科技", "2027届秋招", "产品经理")
        right = recruitment_fingerprint("acme科技", "2027 届-秋招", "产品 经理")
        self.assertEqual(left, right)

    def test_profile_field_prefers_exact_name(self):
        fields = {
            "excluded_recruitment_types": ["暑期实习", "普通实习", "社招"],
            "excluded_recruitment...": ["wrong"],
        }
        self.assertEqual(
            resolve_profile_field(fields, "excluded_recruitment_types"),
            ["暑期实习", "普通实习", "社招"],
        )

    def test_profile_field_restores_unique_truncated_name(self):
        fields = {"excluded_recruitment...": ["暑期实习", "普通实习", "社招"]}
        self.assertEqual(
            resolve_profile_field(fields, "excluded_recruitment_types"),
            ["暑期实习", "普通实习", "社招"],
        )

    def test_profile_field_never_defaults_missing_hard_filter(self):
        with self.assertRaises(KeyError):
            resolve_profile_field({}, "excluded_recruitment_types")


if __name__ == "__main__":
    unittest.main()
