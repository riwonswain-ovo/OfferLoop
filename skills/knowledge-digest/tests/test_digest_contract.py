import importlib.util
import json
from pathlib import Path
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "digest_contract.py"
SPEC = importlib.util.spec_from_file_location("digest_contract", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class DigestContractTest(unittest.TestCase):
    def test_source_id_ignores_tracking_parameters(self):
        left = MODULE.source_id("https://Example.com/news/1?utm_source=x&a=1")
        right = MODULE.source_id("https://example.com/news/1?a=1")
        self.assertEqual(left, right)

    def test_digest_id_is_stable_for_normalized_content(self):
        source = MODULE.source_id("https://example.com/feed")
        first = MODULE.fingerprint("同一篇   文章\n正文")
        second = MODULE.fingerprint("同一篇 文章 正文")
        self.assertEqual(first, second)
        self.assertEqual(
            MODULE.digest_id(source, first),
            MODULE.digest_id(source, second),
        )

    def test_item_id_is_stable_for_article_url(self):
        source = MODULE.source_id("https://example.com/library")
        left = MODULE.item_id(
            source,
            "https://example.com/article/1?utm_source=feed",
        )
        right = MODULE.item_id(source, "https://example.com/article/1")
        self.assertEqual(left, right)
        self.assertTrue(left.startswith("itm-"))

    def test_reading_plan_covers_every_item(self):
        plan = MODULE.reading_plan(total_items=11, items_per_session=3)
        self.assertEqual(plan["sessions"], 4)
        self.assertGreaterEqual(
            plan["sessions"] * plan["items_per_session"],
            plan["total_items"],
        )

    def test_reading_plan_rejects_zero_batch_size(self):
        with self.assertRaisesRegex(ValueError, "items_per_session"):
            MODULE.reading_plan(total_items=10, items_per_session=0)

    def test_summary_requires_two_to_four_points(self):
        payload = {
            "title": "测试文章",
            "source_id": MODULE.source_id("https://example.com/feed"),
            "source_url": "https://example.com/article",
            "one_line_conclusion": "核心结论",
            "key_points": ["只有一点"],
            "value": "与用户相关",
            "boundary": "样本有限",
        }
        self.assertIn(
            "key_points must contain 2 to 4 items",
            MODULE.validate_summary(payload),
        )

    def test_valid_summary_passes(self):
        payload = json.loads(
            json.dumps(
                {
                    "title": "测试文章",
                    "source_id": MODULE.source_id("https://example.com/feed"),
                    "source_url": "https://example.com/article",
                    "one_line_conclusion": "核心结论",
                    "key_points": ["第一点", "第二点"],
                    "value": "与用户相关",
                    "boundary": "样本有限",
                },
                ensure_ascii=False,
            )
        )
        self.assertEqual(MODULE.validate_summary(payload), [])


if __name__ == "__main__":
    unittest.main()
