from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from event_model import (
    decide_completion_status_sync,
    link_progress_records,
    next_progress_stage,
    reconciled_completion_status,
    route_event,
)


PROGRESS = [
    {
        "record_id": "rec_product",
        "fields": {
            "公司": "示例公司",
            "投递岗位": "AI 产品经理",
            "当前阶段": "已投递",
        },
    },
    {
        "record_id": "rec_strategy",
        "fields": {
            "公司": "示例公司",
            "投递岗位": "产品战略实习生",
            "当前阶段": "一面",
        },
    },
    {
        "record_id": "rec_ended",
        "fields": {
            "公司": "示例公司",
            "投递岗位": "已结束岗位",
            "当前阶段": "已结束",
        },
    },
]


class ProgressLinkingTest(unittest.TestCase):
    def test_company_level_exam_can_link_multiple_active_applications(self):
        event = route_event(
            {
                "event_type": "笔试",
                "raw_stage": "在线测评",
                "source_mail_id": "mail-exam",
                "company": "示例公司",
                "position": "",
            }
        )

        result = link_progress_records(event, PROGRESS)

        self.assertEqual(result["status"], "linked")
        self.assertEqual(result["record_ids"], ["rec_product", "rec_strategy"])

    def test_interview_uses_position_to_select_one_of_same_company_applications(self):
        event = route_event(
            {
                "event_type": "面试",
                "raw_stage": "一面",
                "source_mail_id": "mail-interview",
                "company": "示例公司",
                "position": "AI产品经理",
            }
        )

        result = link_progress_records(event, PROGRESS)

        self.assertEqual(result["status"], "linked")
        self.assertEqual(result["record_ids"], ["rec_product"])

    def test_interview_without_position_does_not_guess_between_applications(self):
        event = route_event(
            {
                "event_type": "面试",
                "raw_stage": "二面",
                "source_mail_id": "mail-ambiguous",
                "company": "示例公司",
                "position": "",
            }
        )

        result = link_progress_records(event, PROGRESS)

        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(result["record_ids"], [])
        self.assertEqual(result["candidate_ids"], ["rec_product", "rec_strategy"])

    def test_stage_advancement_is_monotonic_and_manual_terminal_stages_are_protected(self):
        self.assertEqual(next_progress_stage("已投递", "笔试"), "笔试")
        self.assertEqual(next_progress_stage("二面", "一面"), "二面")
        self.assertEqual(next_progress_stage("Offer", "HR面"), "Offer")
        self.assertEqual(next_progress_stage("已结束", "一面"), "已结束")
        self.assertEqual(
            next_progress_stage("一面", "面试（轮次待确认）"),
            "一面",
        )

    def test_main_status_change_propagates_to_child(self):
        decision = decide_completion_status_sync(
            "已完成",
            "待完成",
            last_synced_status="待完成",
        )

        self.assertEqual(decision["action"], "sync")
        self.assertEqual(decision["source"], "main")
        self.assertEqual(decision["status"], "已完成")

    def test_child_status_change_propagates_to_main(self):
        decision = decide_completion_status_sync(
            "待完成",
            "已错过",
            last_synced_status="待完成",
        )

        self.assertEqual(decision["action"], "sync")
        self.assertEqual(decision["source"], "child")
        self.assertEqual(decision["status"], "已错过")

    def test_equal_statuses_refresh_the_sync_baseline(self):
        decision = decide_completion_status_sync("已完成", "已完成")

        self.assertEqual(decision["action"], "already_synced")
        self.assertEqual(decision["status"], "已完成")

    def test_mismatch_without_a_baseline_is_not_silently_overwritten(self):
        decision = decide_completion_status_sync("已完成", "待完成")

        self.assertEqual(decision["action"], "conflict")
        self.assertIsNone(decision["status"])
        self.assertIsNone(reconciled_completion_status("已完成", "待完成"))

    def test_two_different_edits_since_last_sync_are_a_conflict(self):
        decision = decide_completion_status_sync(
            "已完成",
            "已错过",
            last_synced_status="待完成",
        )

        self.assertEqual(decision["action"], "conflict")
        self.assertIsNone(decision["status"])

    def test_valid_status_repairs_an_empty_counterpart(self):
        self.assertEqual(
            reconciled_completion_status("已完成", ""),
            "已完成",
        )


if __name__ == "__main__":
    unittest.main()
