from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from event_model import (
    ARRANGEMENT_NAME_FORMULA,
    REMINDER_FIELDS,
    REMINDER_TABLE_NAME,
    REMINDER_VIEW_FILTERS,
    assign_default_interview_stage,
    build_reminder_record_fields,
    decide_event_upsert,
    route_event,
)


class FakeEventRepository:
    def __init__(self, records=None):
        self.records = {
            record["fields"]["来源邮件ID"]: record
            for record in (records or [])
        }

    def find_by_source_mail_id(self, source_mail_id):
        return self.records.get(source_mail_id)


class EventRoutingTest(unittest.TestCase):
    def test_unified_base_schema_and_formula_match_the_workspace_contract(self):
        self.assertEqual(
            REMINDER_FIELDS,
            (
                "安排名称",
                "环节",
                "公司",
                "业务线",
                "岗位",
                "关联求职记录",
                "开始时间",
                "结束时间",
                "截止时间",
                "笔试类型",
                "笔试子类型",
                "平台",
                "链接",
                "注意事项",
                "面试准备文档",
                "面试复盘文档",
                "完成状态",
                "求职记录ID",
                "来源邮件ID",
                "日历状态",
                "已建日程ID",
            ),
        )
        self.assertEqual(
            REMINDER_TABLE_NAME,
            "笔面试安排",
        )
        self.assertEqual(REMINDER_VIEW_FILTERS["全部安排"], ())
        self.assertEqual(REMINDER_VIEW_FILTERS["一面"], ("一面",))
        self.assertEqual(
            REMINDER_VIEW_FILTERS["其他面试"],
            ("面试（轮次待确认）",),
        )
        self.assertNotIn("开始时间", ARRANGEMENT_NAME_FORMULA)
        self.assertNotIn("结束时间", ARRANGEMENT_NAME_FORMULA)

    def test_routes_exam_and_each_supported_interview_stage(self):
        cases = [
            ("笔试", "技术笔试", "笔试", "笔试"),
            ("面试", "无领导小组面试", "群面", "群面"),
            ("面试", "第一轮面试", "一面", "一面"),
            ("面试", "二面", "二面", "二面"),
            ("面试", "第三轮", "三面", "三面"),
            ("面试", "HR Interview", "HR面", "HR面"),
        ]

        for event_type, raw_stage, expected_stage, _ in cases:
            with self.subTest(raw_stage=raw_stage):
                event = route_event(
                    {
                        "event_type": event_type,
                        "raw_stage": raw_stage,
                        "source_mail_id": f"mail-{expected_stage}",
                        "company": "示例公司",
                    }
                )
                self.assertEqual(event["stage"], expected_stage)
                self.assertEqual(event["target_table"], "笔面试安排")

    def test_unknown_technical_interview_stays_in_the_single_table(self):
        event = route_event(
            {
                "event_type": "面试",
                "raw_stage": "技术面试",
                "source_mail_id": "mail-technical",
                "company": "示例公司",
            }
        )

        self.assertEqual(event["stage"], "面试（轮次待确认）")
        self.assertEqual(event["target_table"], "笔面试安排")

    def test_generic_interviews_default_to_sequential_rounds_per_application(self):
        event = route_event(
            {
                "event_type": "面试",
                "raw_stage": "技术面试",
                "source_mail_id": "mail-next",
                "company": "示例公司",
            }
        )

        first = assign_default_interview_stage(event, [])
        second = assign_default_interview_stage(
            event,
            [{"fields": {"环节": "一面"}}],
        )
        after_group = assign_default_interview_stage(
            event,
            [{"fields": {"环节": "一面"}}, {"fields": {"环节": "群面"}}],
        )

        self.assertEqual(first["stage"], "一面")
        self.assertEqual(first["target_table"], "笔面试安排")
        self.assertEqual(second["stage"], "二面")
        self.assertEqual(after_group["stage"], "二面")

    def test_fourth_generic_interview_uses_the_schema_compatible_generic_stage(self):
        event = route_event(
            {
                "event_type": "面试",
                "raw_stage": "业务沟通",
                "source_mail_id": "mail-four",
                "company": "示例公司",
            }
        )
        assigned = assign_default_interview_stage(
            event,
            [
                {"fields": {"环节": "一面"}},
                {"fields": {"环节": "二面"}},
                {"fields": {"环节": "三面"}},
            ],
        )
        self.assertEqual(assigned["stage"], "面试")
        self.assertEqual(assigned["target_table"], "笔面试安排")

    def test_source_mail_id_is_the_normal_deduplication_key(self):
        repository = FakeEventRepository(
            [
                {
                    "record_id": "rec_event",
                    "fields": {"来源邮件ID": "mail-existing"},
                }
            ]
        )
        event = route_event(
            {
                "event_type": "面试",
                "raw_stage": "一面",
                "source_mail_id": "mail-existing",
                "company": "示例公司",
            }
        )

        decision = decide_event_upsert(event, repository)

        self.assertEqual(decision["action"], "duplicate")
        self.assertEqual(decision["record_id"], "rec_event")

    def test_reschedule_message_updates_the_original_event(self):
        repository = FakeEventRepository(
            [
                {
                    "record_id": "rec_original",
                    "fields": {"来源邮件ID": "mail-original"},
                }
            ]
        )
        event = route_event(
            {
                "event_type": "面试",
                "raw_stage": "一面",
                "source_mail_id": "mail-reschedule",
                "supersedes_source_mail_id": "mail-original",
                "company": "示例公司",
            }
        )

        decision = decide_event_upsert(event, repository)

        self.assertEqual(decision["action"], "reschedule")
        self.assertEqual(decision["record_id"], "rec_original")
        self.assertEqual(decision["canonical_source_mail_id"], "mail-original")

    def test_reminder_fields_reserve_interview_documents_and_use_json_progress_ids(self):
        event = route_event(
            {
                "event_type": "面试",
                "raw_stage": "二面",
                "source_mail_id": "mail-two",
                "company": "示例公司",
                "business_unit": "AI 产品线",
                "position": "AI 产品经理",
                "start_time": "2026-07-20T10:00:00+08:00",
                "end_time": "2026-07-20T11:00:00+08:00",
            }
        )

        fields = build_reminder_record_fields(
            event,
            {
                "record_ids": ["rec_progress"],
                "names": ["示例公司－AI 产品经理"],
                "status": "linked",
            },
        )

        self.assertNotIn("安排名称", fields)
        self.assertEqual(fields["环节"], "二面")
        self.assertEqual(fields["求职记录ID"], '["rec_progress"]')
        self.assertEqual(fields["关联求职记录"], "示例公司－AI 产品经理")
        self.assertEqual(fields["面试准备文档"], "")
        self.assertEqual(fields["面试复盘文档"], "")
        self.assertNotIn("子表 record_id", fields)


if __name__ == "__main__":
    unittest.main()
