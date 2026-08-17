from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from event_model import (
    link_progress_records,
    next_progress_status,
    route_event,
)


PROGRESS = [
    {
        "record_id": "rec_product",
        "fields": {
            "公司": "示例公司",
            "投递岗位": "AI 产品经理",
            "进展状态": "待反馈",
        },
    },
    {
        "record_id": "rec_strategy",
        "fields": {
            "公司": "示例公司",
            "投递岗位": "产品战略实习生",
            "进展状态": "待一面",
        },
    },
    {
        "record_id": "rec_ended",
        "fields": {
            "公司": "示例公司",
            "投递岗位": "已结束岗位",
            "进展状态": "未通过",
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

    def test_manual_review_status_is_not_auto_linked(self):
        event = route_event(
            {
                "event_type": "面试",
                "raw_stage": "一面",
                "source_mail_id": "mail-review",
                "company": "示例公司",
                "position": "待确认岗位",
            }
        )
        records = [
            {
                "record_id": "rec_review",
                "fields": {
                    "公司": "示例公司",
                    "投递岗位": "待确认岗位",
                    "进展状态": "状态待确认",
                },
            }
        ]

        result = link_progress_records(event, records)

        self.assertEqual(result["status"], "unmatched")

    def test_status_advancement_is_monotonic_and_manual_statuses_are_protected(self):
        self.assertEqual(next_progress_status("待反馈", "笔试"), "待笔试")
        self.assertEqual(next_progress_status("待二面", "一面"), "待二面")
        self.assertEqual(next_progress_status("Offer", "HR面"), "Offer")
        self.assertEqual(next_progress_status("状态待确认", "一面"), "待一面")
        self.assertEqual(
            next_progress_status("待一面", "面试（轮次待确认）"),
            "待一面",
        )

if __name__ == "__main__":
    unittest.main()
