from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.sync_utils import (
    normalize_url,
    overlap_start,
    parse_feishu_bitable_url,
    recruitment_fingerprint,
)


class SyncUtilsTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
