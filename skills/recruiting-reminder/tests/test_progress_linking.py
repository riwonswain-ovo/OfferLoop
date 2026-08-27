from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from event_model import (
    completion_progress_patch,
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
                "raw_stage": "技术笔试",
                "source_mail_id": "mail-exam",
                "company": "示例公司",
                "position": "",
            }
        )

        result = link_progress_records(event, PROGRESS)

        self.assertEqual(result["status"], "linked")
        self.assertEqual(result["record_ids"], ["rec_product", "rec_strategy"])
        self.assertEqual(result["excluded_record_ids"], ["rec_ended"])

    def test_company_level_assessment_does_not_inherit_written_test_exception(self):
        event = route_event({
            "event_type": "测评",
            "raw_stage": "在线测评",
            "source_mail_id": "mail-assessment",
            "company": "示例公司",
            "position": "",
        })
        result = link_progress_records(event, PROGRESS)
        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(result["record_ids"], [])

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

    def test_positioned_written_test_requires_one_unique_match(self):
        event = route_event({
            "event_type": "笔试",
            "raw_stage": "技术笔试",
            "source_mail_id": "mail-positioned-test",
            "company": "示例公司",
            "position": "产品",
        })
        result = link_progress_records(event, PROGRESS)
        self.assertEqual(result["status"], "unmatched")
        self.assertEqual(result["record_ids"], [])

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

    def test_interview_without_position_requires_confirmation_even_if_company_is_unique(self):
        event = route_event({
            "event_type": "面试",
            "raw_stage": "一面",
            "source_mail_id": "mail-missing-position",
            "company": "示例公司",
            "position": "",
        })
        result = link_progress_records(event, PROGRESS[:1])
        self.assertEqual(result["status"], "ambiguous")
        self.assertEqual(result["candidate_ids"], ["rec_product"])

        no_application = link_progress_records(event, [])
        self.assertEqual(no_application["status"], "ambiguous")
        self.assertEqual(no_application["candidate_ids"], [])

    def test_manual_review_status_remains_active_for_unique_linking(self):
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

        self.assertEqual(result["status"], "linked")

    def test_status_advancement_is_monotonic_and_manual_statuses_are_protected(self):
        self.assertEqual(next_progress_status("待反馈", "笔试"), "待笔试")
        self.assertEqual(next_progress_status("待反馈", "测评"), "待测评")
        self.assertEqual(next_progress_status("待测评", "笔试"), "待笔试")
        self.assertEqual(next_progress_status("待二面", "一面"), "待二面")
        self.assertEqual(next_progress_status("Offer", "HR面"), "Offer")
        self.assertEqual(next_progress_status("状态待确认", "一面"), "待一面")
        self.assertEqual(
            next_progress_status("待一面", "面试（轮次待确认）"),
            "待一面",
        )
        self.assertEqual(
            next_progress_status("待反馈", "面试（轮次待确认）"),
            "待反馈",
        )
        self.assertEqual(next_progress_status("待反馈", "面试"), "待面试")

    def test_completion_waits_for_feedback_and_preserves_terminal_or_later_state(self):
        self.assertEqual(
            completion_progress_patch("待二面", "一面完成", "二面"),
            {"latest_completed_node": "二面完成", "status": "待反馈"},
        )
        self.assertEqual(
            completion_progress_patch("Offer", "HR 面完成", "二面"),
            {"latest_completed_node": "HR面完成", "status": "Offer"},
        )
        self.assertEqual(
            completion_progress_patch("岗位关闭", "", "二面"),
            {"latest_completed_node": "", "status": "岗位关闭"},
        )
        self.assertEqual(
            completion_progress_patch("待三面", "三面完成", "一面"),
            {"latest_completed_node": "三面完成", "status": "待反馈"},
        )
        self.assertEqual(
            completion_progress_patch("待面试", "一面完成", "面试（轮次待确认）"),
            {"latest_completed_node": "面试完成", "status": "待反馈"},
        )

if __name__ == "__main__":
    unittest.main()
