from pathlib import Path
import importlib.util
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "event_lookup.py"


def load_module():
    spec = importlib.util.spec_from_file_location("event_lookup", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class EventLookupTest(unittest.TestCase):
    def test_explicit_record_id_has_priority(self):
        lookup = load_module()
        result = lookup.resolve_event(
            {
                "query": {
                    "record_id": "rec_two",
                    "company": "不会用于覆盖精确 ID",
                },
                "records": [
                    {"record_id": "rec_one", "fields": {"公司": "甲"}},
                    {"record_id": "rec_two", "fields": {"公司": "乙"}},
                ],
            }
        )
        self.assertEqual(result["match_status"], "found")
        self.assertEqual(result["candidates"][0]["main_record_id"], "rec_two")

    def test_same_company_multiple_positions_stays_ambiguous_without_position(self):
        lookup = load_module()
        result = lookup.resolve_event(
            {
                "query": {"company": "示例 科技"},
                "records": [
                    {
                        "record_id": "rec_one",
                        "fields": {"公司": "示例科技", "岗位": "产品经理"},
                    },
                    {
                        "record_id": "rec_two",
                        "fields": {"公司": "示例科技", "岗位": "算法工程师"},
                    },
                ],
            }
        )
        self.assertEqual(result["match_status"], "ambiguous")
        self.assertEqual(len(result["candidates"]), 2)

    def test_position_and_stage_narrow_to_one_and_expose_child_id(self):
        lookup = load_module()
        result = lookup.resolve_event(
            {
                "query": {
                    "company": "示例科技",
                    "position": "AI产品",
                    "stage": "一面",
                },
                "records": [
                    {
                        "record_id": "rec_one",
                        "fields": {
                            "公司": "示例科技",
                            "岗位": "AI产品经理",
                            "环节": "一面",
                            "子表 record_id": "rec_child",
                        },
                    },
                    {
                        "record_id": "rec_two",
                        "fields": {
                            "公司": "示例科技",
                            "岗位": "AI产品经理",
                            "环节": "二面",
                        },
                    },
                ],
            }
        )
        self.assertEqual(result["match_status"], "found")
        self.assertEqual(
            result["candidates"][0]["child_record_id"], "rec_child"
        )

    def test_position_or_stage_mismatch_never_falls_back_to_company(self):
        lookup = load_module()
        records = [
            {
                "record_id": "rec_one",
                "fields": {
                    "公司": "示例科技",
                    "岗位": "算法工程师",
                    "环节": "二面",
                },
            }
        ]
        for query in (
            {"company": "示例科技", "position": "产品经理"},
            {"company": "示例科技", "stage": "一面"},
        ):
            with self.subTest(query=query):
                result = lookup.resolve_event(
                    {"query": query, "records": records}
                )
                self.assertEqual(result["match_status"], "missing")

    def test_backfill_is_idempotent_and_updates_both_records(self):
        lookup = load_module()
        payload = {
            "kind": "prep",
            "run_id": "interview-prep-20260724123045-a1b2c3d4",
            "document_url": "https://example.feishu.cn/wiki/prep",
            "event": {
                "main_record_id": "rec_main",
                "child_record_id": "rec_child",
                "stage": "一面",
            },
            "current": {"main": "", "child": ""},
        }
        result = lookup.build_backfill_plan(payload)
        self.assertEqual(result["plan_status"], "ready")
        self.assertEqual(
            [item["record_id"] for item in result["operations"]],
            ["rec_main", "rec_child"],
        )
        payload["current"] = {
            "main": payload["document_url"],
            "child": payload["document_url"],
        }
        result = lookup.build_backfill_plan(payload)
        self.assertEqual(result["operations"], [])
        self.assertEqual(
            result["already_synced_record_ids"], ["rec_main", "rec_child"]
        )

    def test_backfill_never_overwrites_conflicting_document(self):
        lookup = load_module()
        result = lookup.build_backfill_plan(
            {
                "kind": "review",
                "run_id": "talk-review-20260724123045-a1b2c3d4",
                "document_url": "https://example.feishu.cn/wiki/new",
                "event": {
                    "main_record_id": "rec_main",
                    "child_record_id": "rec_child",
                    "stage": "二面",
                },
                "current": {
                    "main": "https://example.feishu.cn/wiki/old",
                    "child": "",
                },
            }
        )
        self.assertEqual(result["plan_status"], "conflict")
        self.assertEqual(result["conflicts"][0]["record_id"], "rec_main")
        self.assertEqual(result["operations"], [])
        self.assertEqual(
            result["blocked_operations"][0]["record_id"], "rec_child"
        )

    def test_exam_backfill_is_rejected(self):
        lookup = load_module()
        with self.assertRaisesRegex(ValueError, "exam"):
            lookup.build_backfill_plan(
                {
                    "kind": "prep",
                    "run_id": "interview-prep-20260724123045-a1b2c3d4",
                    "document_url": "https://example.feishu.cn/wiki/prep",
                    "event": {
                        "main_record_id": "rec_main",
                        "child_record_id": "rec_child",
                        "stage": "笔试",
                    },
                    "current": {"main": "", "child": ""},
                }
            )


if __name__ == "__main__":
    unittest.main()
