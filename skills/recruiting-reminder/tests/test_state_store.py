from pathlib import Path
import json
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from notification_summary import build_summary
from state_store import (
    begin_operation,
    get_mail_outcome,
    claim_notification,
    get_operation,
    list_open_failures,
    mark_notification,
    mark_processed,
    notification_idempotency_key,
    notification_status,
    record_failure,
    record_mail_outcome,
    record_success,
    release_notification,
    resolve_failure,
)


class StateStoreTest(unittest.TestCase):
    def test_write_intent_and_preliminary_mail_outcome_are_durable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            operations = root / "operations.json"
            intent = {"run_id": "run-1", "source_id": "mail-1", "step": "base", "idempotency_key": "base:mail-1"}
            self.assertTrue(begin_operation(intent, operations)["claimed"])
            self.assertFalse(begin_operation(intent, operations)["claimed"])
            self.assertEqual(get_operation("base:mail-1", operations)["status"], "pending")
            record_success(intent, operations)
            self.assertFalse(begin_operation(intent, operations)["claimed"])
            outcomes = root / "mail-outcomes.json"
            record_mail_outcome({"source_mail_id": "mail-prelim", "outcome": "skipped_preliminary"}, outcomes)
            self.assertEqual(get_mail_outcome("mail-prelim", outcomes)["outcome"], "skipped_preliminary")

    def test_processed_failure_and_notification_state_are_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            processed = root / "processed.json"
            failures = root / "failures.json"
            notifications = root / "notifications.json"
            self.assertEqual(mark_processed(["mail-1", "mail-1"], processed)["source_mail_ids"], ["mail-1"])
            processed.write_text(json.dumps(["legacy-uid"]), encoding="utf-8")
            self.assertEqual(mark_processed(["mail-1"], processed)["source_mail_ids"], ["legacy-uid", "mail-1"])
            entry = {"run_id": "run-1", "source_id": "mail-1", "failed_step": "calendar", "successful_steps": ["base"], "idempotency_key": "run-1:calendar", "error_type": "temporary"}
            record_failure(entry, failures)
            self.assertEqual(len(list_open_failures(failures)), 1)
            resolve_failure("run-1:calendar", failures)
            self.assertEqual(list_open_failures(failures), [])
            self.assertEqual(mark_notification("run-1", notifications)["run-1"]["status"], "sent")

    def test_success_ledger_and_notification_claim_prevent_duplicate_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            operations = root / "operations.json"
            notifications = root / "notifications.json"
            success = {"run_id": "run-1", "source_id": "mail-1", "step": "base", "idempotency_key": "run-1:base", "result_ref": "rec1"}
            record_success(success, operations)
            self.assertEqual(get_operation("run-1:base", operations)["result_ref"], "rec1")
            self.assertTrue(claim_notification("run-1", notifications)["claimed"])
            self.assertFalse(claim_notification("run-1", notifications)["claimed"])
            with self.assertRaisesRegex(ValueError, "verified_absent"):
                release_notification("run-1", notifications)
            release_notification("run-1", notifications, verified_absent=True)
            self.assertTrue(claim_notification("run-1", notifications)["claimed"])
            mark_notification("run-1", notifications)
            self.assertEqual(notification_status("run-1", notifications)["status"], "sent")
            self.assertFalse(claim_notification("run-1", notifications)["claimed"])
            notifications.write_text(json.dumps({"run-uncertain": {"status": "sending", "claimed_at": "2000-01-01T00:00:00+00:00"}}), encoding="utf-8")
            self.assertFalse(claim_notification("run-uncertain", notifications)["claimed"])

    def test_notification_send_key_has_stable_skill_prefix(self):
        self.assertEqual(
            notification_idempotency_key("run-1"),
            "offerloop-recruiting-reminder-run-1",
        )
        with self.assertRaisesRegex(ValueError, "run_id"):
            notification_idempotency_key("")

    def test_notification_summary_is_redacted_sorted_and_bounded(self):
        events = [{"company": f"公司{i}", "stage": "测评", "deadline": f"2026-09-{i + 1:02d}T18:00:00+08:00", "source_mail_id": f"secret-{i}", "body": "private"} for i in range(12)]
        result = build_summary(events)
        self.assertEqual(len(result["events"]), 10)
        self.assertEqual(result["remaining_count"], 2)
        self.assertNotIn("source_mail_id", result["events"][0])
        long = build_summary([{"company": "甲\n" + "x" * 200, "stage": "测评"}])
        self.assertNotIn("\n", long["events"][0]["company"])
        self.assertLessEqual(len(long["events"][0]["company"]), 80)
        warned = build_summary([{"company": "甲", "stage": "一面", "warning": "招聘事件已按原时间创建，请调整原有日程", "body": "secret"}])
        self.assertEqual(warned["events"][0]["warning"], "招聘事件已按原时间创建，请调整原有日程")
        with self.assertRaisesRegex(ValueError, "limit"):
            build_summary(events, limit=0)

    def test_state_rejects_structured_or_control_character_identifiers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, "source_mail_id"):
                mark_processed(["mail\nunsafe"], root / "processed.json")
            with self.assertRaisesRegex(ValueError, "successful_steps"):
                record_failure({"run_id": "run-1", "source_id": "mail-1", "failed_step": "calendar", "successful_steps": "base", "idempotency_key": "run-1:calendar", "error_type": "temporary"}, root / "failures.json")
            with self.assertRaisesRegex(ValueError, "result_ref"):
                record_success({"run_id": "run-1", "source_id": "mail-1", "step": "base", "idempotency_key": "run-1:base", "result_ref": {"secret": "must-not-persist"}}, root / "operations.json")
            with self.assertRaisesRegex(ValueError, "run_id"):
                claim_notification("", root / "notifications.json")


if __name__ == "__main__":
    unittest.main()
