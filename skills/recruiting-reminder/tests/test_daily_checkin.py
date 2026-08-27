from datetime import datetime
import json
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from daily_checkin import (
    actions_for_record,
    callback_is_authorized,
    group_pending_records,
    reschedule_window,
)


NOW = datetime.fromisoformat("2026-08-24T22:10:00+08:00")


def record(**fields):
    return {"record_id": fields.pop("record_id", "rec1"), "fields": fields}


class DailyCheckinTest(unittest.TestCase):
    def test_shared_contract_fixture(self):
        payload = json.loads((Path(__file__).resolve().parents[1] / "contracts" / "daily-checkin-cases.json").read_text(encoding="utf-8"))
        groups = group_pending_records(payload["records"], datetime.fromisoformat(payload["now"]))
        self.assertEqual({key: [item["record_id"] for item in value] for key, value in groups.items()}, payload["expected_groups"])
        by_id = {item["record_id"]: item for item in payload["records"]}
        self.assertEqual({record_id: list(actions_for_record(by_id[record_id], next(group for group, ids in payload["expected_groups"].items() if record_id in ids))) for record_id in by_id}, payload["expected_actions"])

    def test_groups_are_exclusive_and_ignore_completed_or_cancelled(self):
        records = [
            record(record_id="today", 完成状态="待完成", 事件状态="有效",
                   开始时间="2026-08-24T20:00:00+08:00", 结束时间="2026-08-24T23:00:00+08:00"),
            record(record_id="plan", 完成状态="待完成", 事件状态="有效",
                   开始时间="2026-08-23T20:00:00+08:00", 结束时间="2026-08-23T21:30:00+08:00",
                   截止时间="2026-08-25T23:59:00+08:00"),
            record(record_id="deadline", 完成状态="待完成", 事件状态="有效",
                   开始时间="2026-08-23T20:00:00+08:00", 结束时间="2026-08-23T21:30:00+08:00",
                   截止时间="2026-08-24T21:00:00+08:00"),
            record(record_id="done", 完成状态="已完成", 事件状态="有效",
                   开始时间="2026-08-24T20:00:00+08:00"),
            record(record_id="cancelled", 完成状态="待完成", 事件状态="已取消",
                   开始时间="2026-08-24T20:00:00+08:00"),
            record(record_id="draft", 完成状态="待完成", 事件状态="草稿",
                   开始时间="2026-08-24T20:00:00+08:00"),
            record(record_id="missing-status", 完成状态="待完成",
                   开始时间="2026-08-24T20:00:00+08:00"),
            record(record_id="unplanned", 完成状态="待完成", 事件状态="有效", 环节="测评", 进行方式="异步",
                   截止时间="2026-08-25T21:00:00+08:00"),
        ]
        groups = group_pending_records(records, NOW)
        self.assertEqual([item["record_id"] for item in groups["today"]], ["today"])
        self.assertEqual([item["record_id"] for item in groups["plan_overdue"]], ["plan"])
        self.assertEqual([item["record_id"] for item in groups["deadline_overdue"]], ["deadline"])
        self.assertEqual([item["record_id"] for item in groups["unplanned"]], ["unplanned"])
        self.assertNotIn("draft", [item["record_id"] for values in groups.values() for item in values])
        self.assertNotIn("missing-status", [item["record_id"] for values in groups.values() for item in values])

    def test_today_is_always_evaluated_in_shanghai_timezone(self):
        utc_now = datetime.fromisoformat("2026-08-24T16:30:00+00:00")
        item = record(
            record_id="shanghai-today",
            完成状态="待完成",
            事件状态="有效",
            开始时间="2026-08-25T00:15:00+08:00",
            结束时间="2026-08-25T01:45:00+08:00",
        )
        groups = group_pending_records([item], utc_now)
        self.assertEqual(
            [record["record_id"] for record in groups["today"]],
            ["shanghai-today"],
        )

    def test_card_actions_follow_fixed_and_async_rules(self):
        fixed = record(环节="一面", 进行方式="同步")
        async_exam = record(环节="测评", 进行方式="异步")
        self.assertEqual(actions_for_record(fixed, "today"), ("completed", "missed"))
        self.assertEqual(actions_for_record(fixed, "plan_overdue"), ("completed", "missed"))
        self.assertEqual(actions_for_record(async_exam, "plan_overdue"), ("completed", "not_completed"))
        self.assertEqual(actions_for_record(async_exam, "deadline_overdue"), ("completed", "missed"))

    def test_async_reschedule_uses_90_minutes_and_true_deadline(self):
        item = record(
            环节="笔试", 进行方式="异步", 已建日程ID="evt-1",
            截止时间="2026-08-25T18:00:00+08:00",
        )
        start, end = reschedule_window(item, "2026-08-25", "15:30", now=NOW)
        self.assertEqual(start.isoformat(), "2026-08-25T15:30:00+08:00")
        self.assertEqual(end.isoformat(), "2026-08-25T17:00:00+08:00")
        with self.assertRaisesRegex(ValueError, "deadline"):
            reschedule_window(item, "2026-08-25", "17:00", now=NOW)
        with self.assertRaisesRegex(ValueError, "deadline"):
            reschedule_window(
                record(环节="测评", 进行方式="异步", 已建日程ID="evt-2"),
                "2026-08-25",
                "10:00",
                now=NOW,
            )

    def test_async_reschedule_preserves_explicit_mail_duration(self):
        item = record(
            环节="测评",
            进行方式="异步",
            已建日程ID="evt-45",
            开始时间="2026-08-24T10:00:00+08:00",
            结束时间="2026-08-24T10:45:00+08:00",
            截止时间="2026-08-25T18:00:00+08:00",
        )
        start, end = reschedule_window(item, "2026-08-25", "15:30", now=NOW)
        self.assertEqual(start.isoformat(), "2026-08-25T15:30:00+08:00")
        self.assertEqual(end.isoformat(), "2026-08-25T16:15:00+08:00")

        unplanned = record(**{
            "环节": "测评", "进行方式": "异步", "预计时长（分钟）": 45,
            "截止时间": "2026-08-25T18:00:00+08:00",
        })
        _start, first_end = reschedule_window(unplanned, "2026-08-25", "15:30", now=NOW)
        self.assertEqual(first_end.isoformat(), "2026-08-25T16:15:00+08:00")

    def test_only_configured_owner_may_operate(self):
        self.assertTrue(callback_is_authorized("ou_owner", "ou_owner"))
        self.assertFalse(callback_is_authorized("ou_viewer", "ou_owner"))


if __name__ == "__main__":
    unittest.main()
