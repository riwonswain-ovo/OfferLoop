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
        self.assertEqual(result["candidates"][0]["record_id"], "rec_two")

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

    def test_position_and_stage_narrow_to_one_record(self):
        lookup = load_module()
        result = lookup.resolve_event(
            {
                "query": {
                    "company": "示例科技",
                    "position": "AI产品经理",
                    "stage": "一面",
                },
                "records": [
                    {
                        "record_id": "rec_one",
                        "fields": {
                            "公司": "示例科技",
                            "岗位": "AI产品经理",
                            "环节": "一面",
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
        self.assertEqual(result["candidates"][0]["record_id"], "rec_one")

    def test_partial_position_never_auto_matches_and_stage_aliases_normalize(self):
        lookup = load_module()
        records = [{"record_id": "rec_one", "fields": {"公司": "示例科技", "岗位": "AI产品经理", "环节": "HR面"}}]
        partial = lookup.resolve_event({"query": {"company": "示例科技", "position": "产品经理"}, "records": records})
        aliased = lookup.resolve_event({"query": {"company": "示例科技", "stage": "HR 面"}, "records": records})
        self.assertEqual(partial["match_status"], "missing")
        self.assertEqual(aliased["match_status"], "found")

    def test_invalid_provided_start_time_is_an_error(self):
        lookup = load_module()
        with self.assertRaisesRegex(ValueError, "start_time"):
            lookup.resolve_event({"query": {"company": "示例科技", "start_time": "not-a-time"}, "records": []})

    def test_related_mail_id_resolves_and_cancelled_events_are_excluded(self):
        lookup = load_module()
        records = [
            {
                "record_id": "rec_active",
                "fields": {
                    "公司": "示例科技",
                    "来源邮件ID": "mail-original",
                    "关联邮件ID": '["mail-original","mail-reminder"]',
                    "事件状态": "有效",
                },
            },
            {
                "record_id": "rec_cancelled",
                "fields": {
                    "公司": "示例科技",
                    "来源邮件ID": "mail-cancelled",
                    "事件状态": "已取消",
                },
            },
        ]
        result = lookup.resolve_event({
            "query": {"source_mail_id": "mail-reminder"},
            "records": records,
        })
        self.assertEqual(result["match_status"], "found")
        self.assertEqual(result["candidates"][0]["record_id"], "rec_active")
        cancelled = lookup.resolve_event({
            "query": {"record_id": "rec_cancelled"},
            "records": records,
        })
        self.assertEqual(cancelled["match_status"], "missing")

    def test_missing_exact_mail_id_never_falls_back_to_company(self):
        lookup = load_module()
        result = lookup.resolve_event({
            "query": {"source_mail_id": "mail-wrong", "company": "示例科技"},
            "records": [{
                "record_id": "rec_one",
                "fields": {"公司": "示例科技", "来源邮件ID": "mail-right"},
            }],
        })
        self.assertEqual(result["match_status"], "missing")
        self.assertEqual(result["match_reason"], "source_mail_id")
        self.assertEqual(result["candidates"], [])

    def test_time_matching_normalizes_naive_and_offset_values(self):
        lookup = load_module()
        result = lookup.resolve_event({
            "query": {
                "company": "示例科技",
                "start_time": "2026-08-25T10:00:00",
            },
            "records": [{
                "record_id": "rec_one",
                "fields": {
                    "公司": "示例科技",
                    "开始时间": "2026-08-25T02:00:00Z",
                },
            }],
        })
        self.assertEqual(result["match_status"], "found")

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

    def test_backfill_is_idempotent_and_updates_the_single_record(self):
        lookup = load_module()
        payload = {
            "kind": "prep",
            "run_id": "interview-prep-20260724123045-a1b2c3d4",
            "document_url": "https://example.feishu.cn/wiki/prep",
            "event": {
                "record_id": "rec_reminder",
                "stage": "一面",
            },
            "current": {"value": ""},
        }
        result = lookup.build_backfill_plan(payload)
        self.assertEqual(result["plan_status"], "ready")
        self.assertEqual(
            [item["record_id"] for item in result["operations"]],
            ["rec_reminder"],
        )
        self.assertEqual(
            result["operations"][0]["fields"],
            {"面试准备文档": payload["document_url"]},
        )
        payload["current"] = {"value": payload["document_url"]}
        result = lookup.build_backfill_plan(payload)
        self.assertEqual(result["operations"], [])
        self.assertEqual(
            result["already_synced_record_ids"], ["rec_reminder"]
        )

    def test_backfill_never_overwrites_conflicting_document(self):
        lookup = load_module()
        result = lookup.build_backfill_plan(
            {
                "kind": "review",
                "artifact_status": "completed",
                "run_id": "talk-review-20260724123045-a1b2c3d4",
                "document_url": "https://example.feishu.cn/wiki/new",
                "event": {
                    "record_id": "rec_reminder",
                    "stage": "二面",
                    "event_status": "有效",
                },
                "current": {
                    "value": "https://example.feishu.cn/wiki/old",
                    "completion_status": "待完成",
                },
            }
        )
        self.assertEqual(result["plan_status"], "conflict")
        self.assertEqual(result["conflicts"][0]["record_id"], "rec_reminder")
        self.assertEqual(result["operations"], [])
        self.assertEqual(result["blocked_operations"], [])
        self.assertEqual(result["already_synced_record_ids"], [])

    def test_completed_review_atomically_marks_interview_complete(self):
        lookup = load_module()
        result = lookup.build_backfill_plan(
            {
                "kind": "review",
                "artifact_status": "completed",
                "run_id": "talk-review-20260724123045-a1b2c3d4",
                "document_url": "https://example.feishu.cn/wiki/review",
                "event": {
                    "record_id": "rec_reminder",
                    "stage": "二面",
                    "event_status": "有效",
                },
                "current": {
                    "value": "",
                    "completion_status": "待完成",
                },
            }
        )
        self.assertEqual(result["plan_status"], "ready")
        self.assertTrue(result["progress_reconcile_expected"])
        self.assertEqual(
            result["operations"][0]["fields"],
            {
                "面试复盘文档": "https://example.feishu.cn/wiki/review",
                "完成状态": "已完成",
            },
        )

    def test_incomplete_review_backfills_document_without_advancing_progress(self):
        lookup = load_module()
        result = lookup.build_backfill_plan(
            {
                "kind": "review",
                "artifact_status": "incomplete",
                "run_id": "talk-review-20260724123045-a1b2c3d4",
                "document_url": "https://example.feishu.cn/wiki/review",
                "event": {
                    "record_id": "rec_reminder",
                    "stage": "一面",
                    "event_status": "有效",
                },
                "current": {
                    "value": "",
                    "completion_status": "待完成",
                },
            }
        )
        self.assertFalse(result["progress_reconcile_expected"])
        self.assertEqual(
            result["operations"][0]["fields"],
            {"面试复盘文档": "https://example.feishu.cn/wiki/review"},
        )

    def test_repeated_completed_review_only_finishes_pending_event(self):
        lookup = load_module()
        result = lookup.build_backfill_plan(
            {
                "kind": "review",
                "artifact_status": "completed",
                "run_id": "talk-review-20260724123045-a1b2c3d4",
                "document_url": "https://example.feishu.cn/wiki/review",
                "event": {
                    "record_id": "rec_reminder",
                    "stage": "一面",
                    "event_status": "有效",
                },
                "current": {
                    "value": "https://example.feishu.cn/wiki/review",
                    "completion_status": "待完成",
                },
            }
        )
        self.assertEqual(result["already_synced_record_ids"], ["rec_reminder"])
        self.assertEqual(
            result["operations"][0]["fields"], {"完成状态": "已完成"}
        )
        self.assertTrue(result["progress_reconcile_expected"])

    def test_completed_review_never_overwrites_missed_event(self):
        lookup = load_module()
        result = lookup.build_backfill_plan(
            {
                "kind": "review",
                "artifact_status": "completed",
                "run_id": "talk-review-20260724123045-a1b2c3d4",
                "document_url": "https://example.feishu.cn/wiki/review",
                "event": {
                    "record_id": "rec_reminder",
                    "stage": "一面",
                    "event_status": "有效",
                },
                "current": {
                    "value": "",
                    "completion_status": "已错过",
                },
            }
        )
        self.assertEqual(result["plan_status"], "conflict")
        self.assertEqual(result["operations"], [])
        self.assertEqual(
            result["conflicts"][0]["reason"], "completion_status_conflict"
        )

    def test_completed_review_never_updates_cancelled_event(self):
        lookup = load_module()
        result = lookup.build_backfill_plan(
            {
                "kind": "review",
                "artifact_status": "completed",
                "run_id": "talk-review-20260724123045-a1b2c3d4",
                "document_url": "https://example.feishu.cn/wiki/review",
                "event": {
                    "record_id": "rec_reminder",
                    "stage": "一面",
                    "event_status": "已取消",
                },
                "current": {
                    "value": "",
                    "completion_status": "待完成",
                },
            }
        )
        self.assertEqual(result["plan_status"], "conflict")
        self.assertEqual(result["operations"], [])
        self.assertEqual(result["conflicts"][0]["reason"], "event_not_active")

    def test_completed_review_is_fully_idempotent_after_reconcile(self):
        lookup = load_module()
        result = lookup.build_backfill_plan(
            {
                "kind": "review",
                "artifact_status": "completed",
                "run_id": "talk-review-20260724123045-a1b2c3d4",
                "document_url": "https://example.feishu.cn/wiki/review",
                "event": {
                    "record_id": "rec_reminder",
                    "stage": "一面",
                    "event_status": "有效",
                },
                "current": {
                    "value": "https://example.feishu.cn/wiki/review",
                    "completion_status": "已完成",
                },
            }
        )
        self.assertEqual(result["plan_status"], "ready")
        self.assertEqual(result["operations"], [])
        self.assertFalse(result["progress_reconcile_expected"])
        self.assertEqual(result["already_synced_record_ids"], ["rec_reminder"])

    def test_review_backfill_requires_artifact_status(self):
        lookup = load_module()
        with self.assertRaisesRegex(ValueError, "artifact_status"):
            lookup.build_backfill_plan(
                {
                    "kind": "review",
                    "run_id": "talk-review-20260724123045-a1b2c3d4",
                    "document_url": "https://example.feishu.cn/wiki/review",
                    "event": {
                        "record_id": "rec_reminder",
                        "stage": "一面",
                    },
                    "current": {"value": ""},
                }
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
                        "record_id": "rec_reminder",
                        "stage": "笔试",
                    },
                    "current": {"value": ""},
                }
            )

    def test_generic_fourth_interview_accepts_document_backfill(self):
        lookup = load_module()
        result = lookup.build_backfill_plan(
            {
                "kind": "prep",
                "run_id": "interview-prep-20260724123045-a1b2c3d4",
                "document_url": "https://example.feishu.cn/wiki/prep",
                "event": {
                    "record_id": "recReminder4",
                    "stage": "面试",
                },
                "current": {"value": ""},
            }
        )
        self.assertEqual(result["plan_status"], "ready")
        self.assertEqual(result["operations"][0]["record_id"], "recReminder4")

    def test_backfill_rejects_non_base_record_id(self):
        lookup = load_module()
        with self.assertRaisesRegex(ValueError, "Base record ID"):
            lookup.build_backfill_plan(
                {
                    "kind": "prep",
                    "run_id": "interview-prep-20260724123045-a1b2c3d4",
                    "document_url": "https://example.feishu.cn/wiki/prep",
                    "event": {
                        "record_id": "../../unexpected",
                        "stage": "一面",
                    },
                    "current": {"value": ""},
                }
            )


if __name__ == "__main__":
    unittest.main()
