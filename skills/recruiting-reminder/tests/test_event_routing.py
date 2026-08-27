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
    default_duration_minutes,
    duration_minutes_for_event,
    normalize_deadline,
    plan_completion,
    plan_event,
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
    def test_deadline_normalization_uses_hours_china_workdays_and_end_of_day(self):
        self.assertEqual(
            normalize_deadline("72小时内", "2026-08-24T10:30:00+08:00"),
            "2026-08-27T10:30:00+08:00",
        )
        self.assertEqual(
            normalize_deadline("3个工作日内", "2026-09-18T09:00:00+08:00"),
            "2026-09-22T23:59:00+08:00",
        )
        self.assertEqual(normalize_deadline("2026-08-30"), "2026-08-30T23:59:00+08:00")
        self.assertEqual(
            normalize_deadline("请于2026年8月30日前完成"),
            "2026-08-30T23:59:00+08:00",
        )
        self.assertEqual(
            normalize_deadline("1月3日前", "2026-12-28T09:00:00+08:00"),
            "2027-01-03T23:59:00+08:00",
        )

    def test_async_availability_is_not_a_user_plan_and_duration_is_persisted(self):
        result = plan_event({
            "extracted": {
                "source_mail_id": "mail-async-window",
                "event_type": "测评",
                "raw_stage": "在线测评",
                "classification": "招聘测评",
                "company": "示例公司",
                "delivery_mode": "异步",
                "start_time": "2026-08-25T08:00:00+08:00",
                "deadline": "2026-08-30",
                "estimated_duration": "30～45分钟",
            },
            "existing_events": [],
            "progress_records": [],
        })
        self.assertEqual(result["action"], "create")
        self.assertEqual(result["fields"]["开始时间"], "")
        self.assertEqual(result["fields"]["结束时间"], "")
        self.assertEqual(result["fields"]["预计时长（分钟）"], 45)
        self.assertEqual(result["fields"]["截止时间"], "2026-08-30T23:59:00+08:00")
        self.assertEqual(result["calendar_plan"]["action"], "none")

        confirmed = route_event({
            "source_mail_id": "mail-user-plan", "event_type": "测评", "raw_stage": "在线测评",
            "classification": "招聘测评", "company": "示例公司", "delivery_mode": "异步",
            "planned_by_user": True, "start_time": "2026-08-25T15:30:00+08:00",
        })
        self.assertEqual(confirmed["start_time"], "2026-08-25T15:30:00+08:00")

    def test_deadline_only_test_defaults_to_independent_async_assessment(self):
        result = plan_event({
            "extracted": {
                "source_mail_id": "mail-generic-test",
                "event_type": "test",
                "raw_stage": "在线测试",
                "classification": "招聘考试",
                "company": "示例公司",
                "deadline": "2026-08-30T18:00:00+08:00",
                "uncertain_fields": ["exam_type", "position", "planned_start_time"],
            },
            "existing_events": [],
            "progress_records": [],
        })
        self.assertEqual(result["action"], "create")
        self.assertEqual(result["event"]["stage"], "测评")
        self.assertEqual(result["event"]["delivery_mode"], "异步")
        self.assertEqual(result["fields"]["岗位"], "")
        self.assertEqual(result["calendar_plan"], {"action": "none", "reason": "planned_start_not_selected"})

    def test_duplicate_source_rows_are_ambiguous_instead_of_taking_first(self):
        duplicate = {
            "extracted": {"source_mail_id": "mail-dup", "event_type": "面试", "raw_stage": "一面", "classification": "招聘面试", "company": "甲", "position": "产品", "start_time": "2026-08-25T10:00:00+08:00"},
            "existing_events": [
                {"record_id": "rec1", "fields": {"来源邮件ID": "mail-dup"}},
                {"record_id": "rec2", "fields": {"来源邮件ID": "mail-dup"}},
            ],
            "progress_records": [],
        }
        result = plan_event(duplicate)
        self.assertEqual(result["action"], "confirm")
        self.assertEqual(result["reason"], "unresolved_duplicate_source")
        self.assertEqual(result["decision"]["candidate_ids"], ["rec1", "rec2"])

    def test_unlinked_reminder_never_creates_a_second_event(self):
        result = plan_event({
            "extracted": {"source_mail_id": "mail-reminder", "message_kind": "reminder", "event_type": "测评", "raw_stage": "在线测评", "classification": "招聘测评", "company": "甲", "delivery_mode": "异步", "deadline": "2026-08-30"},
            "existing_events": [], "progress_records": [],
        })
        self.assertEqual(result["action"], "confirm")
        self.assertEqual(result["reason"], "unresolved_reminder")

    def test_async_deadline_only_reschedule_preserves_plan(self):
        existing = [{"record_id": "recAsync", "fields": {
            "来源邮件ID": "mail-original", "关联邮件ID": '["mail-original"]', "公司": "甲",
            "岗位": "产品", "环节": "测评", "进行方式": "异步",
            "开始时间": "2026-08-25T10:00:00+08:00", "结束时间": "2026-08-25T10:45:00+08:00",
            "已建日程ID": "evt1",
        }}]
        result = plan_event({
            "extracted": {"source_mail_id": "mail-extension", "supersedes_source_mail_id": "mail-original", "message_kind": "reschedule", "event_type": "测评", "raw_stage": "在线测评", "classification": "招聘测评", "company": "甲", "delivery_mode": "异步", "deadline": "2026-08-27"},
            "existing_events": existing,
            "progress_records": [],
        })
        self.assertEqual(result["patch"]["截止时间"], "2026-08-27T23:59:00+08:00")
        self.assertNotIn("开始时间", result["patch"])
        self.assertEqual(result["calendar_patch"]["action"], "none")

    def test_unique_reschedule_creates_calendar_when_original_was_unplanned(self):
        result = plan_event({
            "extracted": {
                "source_mail_id": "mail-fixed", "supersedes_source_mail_id": "mail-original",
                "message_kind": "reschedule", "event_type": "面试", "raw_stage": "一面",
                "classification": "招聘面试", "company": "甲", "position": "产品",
                "start_time": "2026-08-25T10:00:00+08:00",
            },
            "existing_events": [{"record_id": "rec1", "fields": {
                "来源邮件ID": "mail-original", "公司": "甲", "岗位": "产品", "环节": "一面",
                "开始时间": "", "结束时间": "", "已建日程ID": "",
            }}],
            "progress_records": [],
        })
        self.assertEqual(result["action"], "reschedule")
        self.assertEqual(result["calendar_patch"]["action"], "create")
        self.assertNotIn("event_id", result["calendar_patch"])
        self.assertEqual(result["calendar_patch"]["success_patch"]["日历状态"], "已建日程")
        self.assertEqual(result["calendar_patch"]["result_mapping"], {"event_id": "已建日程ID"})

    def test_formal_interview_after_skipped_preliminary_is_created(self):
        result = plan_event({
            "extracted": {"source_mail_id": "mail-formal", "supersedes_source_mail_id": "mail-prelim", "message_kind": "reschedule", "event_type": "面试", "raw_stage": "一面", "classification": "招聘面试", "company": "甲", "position": "产品", "start_time": "2026-08-25T10:00:00+08:00"},
            "existing_events": [],
            "source_outcomes": {"mail-prelim": "skipped_preliminary"},
            "progress_records": [{"record_id": "recProgress", "fields": {"公司": "甲", "投递岗位": "产品", "进展状态": "待反馈"}}],
        })
        self.assertEqual(result["action"], "create")
        self.assertEqual(result["fields"]["来源邮件ID"], "mail-formal")
        self.assertRegex(result["base_plan"]["client_token"], r"^[0-9a-f]{32}$")
        self.assertRegex(result["calendar_plan"]["idempotency_key"], r"^[0-9a-f]{40}$")
        self.assertEqual(result["calendar_plan"]["success_patch"], {"日历状态": "已建日程"})
        self.assertEqual(result["calendar_plan"]["result_mapping"], {"event_id": "已建日程ID"})

    def test_string_false_does_not_skip_a_fixed_interview_without_time(self):
        result = plan_event({
            "extracted": {
                "source_mail_id": "mail-no-time", "event_type": "面试", "raw_stage": "一面",
                "classification": "招聘面试", "company": "甲", "position": "产品",
                "requires_time_selection": "false",
            },
            "existing_events": [], "progress_records": [],
        })
        self.assertEqual(result["action"], "confirm")
        self.assertEqual(result["reason"], "fixed_start_time_required")

    def test_explicit_non_recruiting_label_wins_over_recruit_keyword(self):
        result = plan_event({
            "extracted": {
                "source_mail_id": "mail-newsletter",
                "classification": "非招聘",
            },
            "existing_events": [], "progress_records": [],
        })
        self.assertEqual(result["action"], "skip_and_mark_processed")
        self.assertEqual(result["mail_outcome"], "not_recruiting")

    def test_normalized_deadline_is_used_when_original_text_contains_a_clock(self):
        routed = route_event({
            "source_mail_id": "mail-deadline", "event_type": "测评", "raw_stage": "在线测评",
            "classification": "招聘测评", "company": "甲", "delivery_mode": "异步",
            "deadline_text": "请在8月30日18:00前完成",
            "deadline": "2026-08-30T18:00:00+08:00",
        })
        self.assertEqual(routed["deadline"], "2026-08-30T18:00:00+08:00")

    def test_interview_stage_can_come_from_event_type(self):
        hr = route_event({
            "source_mail_id": "mail-hr", "event_type": "HR面", "classification": "招聘面试",
            "company": "甲", "position": "产品", "start_time": "2026-08-30T18:00:00+08:00",
        })
        group = route_event({
            "source_mail_id": "mail-group", "event_type": "群面", "classification": "招聘面试",
            "company": "甲", "position": "产品", "start_time": "2026-08-30T18:00:00+08:00",
        })
        self.assertEqual(hr["stage"], "HR面")
        self.assertEqual(group["stage"], "群面")

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
                "预计时长（分钟）",
                "进行方式",
                "平台",
                "链接",
                "注意事项",
                "面试准备文档",
                "面试复盘文档",
                "完成状态",
                "事件状态",
                "求职记录ID",
                "来源邮件ID",
                "关联邮件ID",
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
        self.assertEqual(REMINDER_VIEW_FILTERS["测评"], ("测评",))
        self.assertEqual(
            REMINDER_VIEW_FILTERS["其他面试"],
            ("面试（轮次待确认）", "面试"),
        )
        self.assertNotIn("开始时间", ARRANGEMENT_NAME_FORMULA)
        self.assertNotIn("结束时间", ARRANGEMENT_NAME_FORMULA)

    def test_routes_exam_and_each_supported_interview_stage(self):
        cases = [
            ("笔试", "技术笔试", "笔试", "笔试"),
            ("测评", "在线测评", "测评", "测评"),
            ("测评/笔试", "在线环节", "测评", "测评"),
            ("test", "", "测评", "测评"),
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
        self.assertIn(assigned["stage"], REMINDER_VIEW_FILTERS["其他面试"])

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

    def test_source_chain_updates_inherit_original_fields_and_preserve_duration(self):
        existing = [{"record_id": "rec_original", "fields": {"来源邮件ID": "<original>", "关联邮件ID": '["<original>"]', "公司": "示例公司", "岗位": "AI产品经理", "环节": "二面", "开始时间": "2026-08-25T10:00:00+08:00", "结束时间": "2026-08-25T10:45:00+08:00", "已建日程ID": "evt1"}}]
        rescheduled = plan_event({"extracted": {"source_mail_id": "<changed>", "in_reply_to": "<original>", "message_kind": "reschedule", "start_time": "2026-08-26T15:00:00+08:00"}, "existing_events": existing, "progress_records": []})
        cancelled = plan_event({"extracted": {"source_mail_id": "<cancelled>", "references": ["<original>"], "message_kind": "cancellation"}, "existing_events": existing, "progress_records": []})
        self.assertEqual(rescheduled["action"], "reschedule")
        self.assertEqual(rescheduled["event"]["position"], "AI产品经理")
        self.assertEqual(rescheduled["patch"]["结束时间"], "2026-08-26T15:45:00+08:00")
        self.assertEqual(rescheduled["calendar_patch"]["event_id"], "evt1")
        self.assertEqual(rescheduled["base_plan"]["preserve_fields"], ["来源邮件ID", "求职记录ID", "完成状态"])
        self.assertEqual(
            rescheduled["execution_graph"]["ordered_core"],
            ["base.update_original", "calendar.update_original", "base.patch_calendar_result"],
        )
        self.assertEqual(rescheduled["execution_graph"]["canonical_source_mail_id"], "<original>")
        self.assertEqual(cancelled["progress_patch"], {"action": "no_change"})

        missing_calendar_id = [{"record_id": "rec_missing", "fields": {"来源邮件ID": "<missing>", "公司": "示例公司", "岗位": "AI产品经理", "环节": "一面", "开始时间": "2026-08-25T10:00:00+08:00", "结束时间": "2026-08-25T11:00:00+08:00", "已建日程ID": ""}}]
        unresolved = plan_event({"extracted": {"source_mail_id": "<changed-missing>", "in_reply_to": "<missing>", "message_kind": "reschedule", "start_time": "2026-08-26T15:00:00+08:00"}, "existing_events": missing_calendar_id, "progress_records": []})
        self.assertEqual(unresolved["action"], "confirm")
        self.assertEqual(unresolved["reason"], "calendar_event_id_required")

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
        self.assertEqual(fields["事件状态"], "有效")
        self.assertEqual(fields["日历状态"], "待安排")
        self.assertEqual(fields["关联邮件ID"], '["mail-two"]')
        self.assertNotIn("子表 record_id", fields)

    def test_untrusted_plain_text_fields_are_normalized_and_bounded(self):
        event = route_event({
            "event_type": "面试",
            "raw_stage": "一面",
            "source_mail_id": "mail-bounded-text",
            "company": "示例\n公司" + "甲" * 200,
            "business_unit": "AI\x00产品线" + "乙" * 200,
            "position": "产品\n经理" + "丙" * 200,
            "platform": "飞书\t会议" + "丁" * 100,
        })
        fields = build_reminder_record_fields(event, {"record_ids": [], "names": []})
        self.assertNotIn("\n", fields["公司"])
        self.assertNotIn("\x00", fields["业务线"])
        self.assertLessEqual(len(fields["公司"]), 120)
        self.assertLessEqual(len(fields["岗位"]), 160)
        self.assertLessEqual(len(fields["平台"]), 80)

    def test_assessment_and_written_test_have_independent_defaults(self):
        assessment = route_event({
            "event_type": "",
            "raw_stage": "在线测评",
            "source_mail_id": "mail-assessment",
            "company": "示例公司",
        })
        written = route_event({
            "event_type": "",
            "raw_stage": "技术笔试",
            "source_mail_id": "mail-written",
            "company": "示例公司",
        })
        self.assertEqual(assessment["stage"], "测评")
        self.assertEqual(written["stage"], "笔试")
        self.assertEqual(default_duration_minutes("测评"), 90)
        self.assertEqual(default_duration_minutes("笔试"), 90)
        self.assertEqual(default_duration_minutes("一面"), 60)

    def test_ambiguous_exam_defaults_to_assessment_and_assessment_marker_wins(self):
        generic = route_event({
            "event_type": "exam",
            "raw_stage": "online test",
            "source_mail_id": "mail-generic-exam",
            "company": "示例公司",
        })
        mixed = route_event({
            "event_type": "笔试通知",
            "raw_stage": "在线测评",
            "source_mail_id": "mail-mixed-exam",
            "company": "示例公司",
        })
        self.assertEqual(generic["stage"], "测评")
        self.assertEqual(mixed["stage"], "测评")

    def test_record_builder_applies_default_end_times(self):
        interview = route_event({
            "event_type": "面试",
            "raw_stage": "一面",
            "source_mail_id": "mail-duration-interview",
            "company": "示例公司",
            "start_time": "2026-08-25T10:00:00+08:00",
        })
        assessment = route_event({
            "event_type": "测评",
            "raw_stage": "在线测评",
            "source_mail_id": "mail-duration-assessment",
            "company": "示例公司",
            "start_time": 1_777_086_000_000,
        })
        empty_links = {"record_ids": [], "names": []}
        self.assertEqual(
            build_reminder_record_fields(interview, empty_links)["结束时间"],
            "2026-08-25T11:00:00+08:00",
        )
        self.assertEqual(
            build_reminder_record_fields(assessment, empty_links)["结束时间"],
            1_777_091_400_000,
        )

    def test_explicit_exam_duration_wins_and_ranges_use_the_upper_bound(self):
        self.assertEqual(
            duration_minutes_for_event({"stage": "测评", "estimated_duration": "30～45 分钟"}),
            45,
        )
        self.assertEqual(
            duration_minutes_for_event({"stage": "笔试", "estimated_duration": "1-1.5 hours"}),
            90,
        )
        event = route_event({
            "event_type": "测评",
            "raw_stage": "在线测评",
            "source_mail_id": "mail-duration-explicit",
            "company": "示例公司",
            "start_time": "2026-08-25T10:00:00+08:00",
            "estimated_duration": "30-45分钟",
        })
        fields = build_reminder_record_fields(event, {"record_ids": [], "names": []})
        self.assertEqual(fields["结束时间"], "2026-08-25T10:45:00+08:00")

    def test_compound_duration_and_english_rounds_are_parsed_without_hr_substrings(self):
        self.assertEqual(duration_minutes_for_event({"stage": "面试", "estimated_duration": "1小时30分钟"}), 90)
        self.assertEqual(route_event({"event_type": "interview", "raw_stage": "three rounds", "source_mail_id": "m3", "company": "甲"})["stage"], "三面")
        self.assertEqual(route_event({"event_type": "interview", "raw_stage": "third interview", "source_mail_id": "m4", "company": "甲"})["stage"], "三面")

    def test_unknown_message_kind_and_invalid_times_or_links_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "message_kind"):
            route_event({"event_type": "面试", "raw_stage": "一面", "source_mail_id": "bad-kind", "company": "甲", "message_kind": "cancelled"})
        event = route_event({"event_type": "面试", "raw_stage": "一面", "source_mail_id": "bad-time", "company": "甲", "start_time": "2026-08-25T12:00:00+08:00", "end_time": "2026-08-25T11:00:00+08:00"})
        with self.assertRaisesRegex(ValueError, "later"):
            build_reminder_record_fields(event, {"record_ids": [], "names": []})
        event["end_time"] = "2026-08-25T13:00:00+08:00"
        event["link"] = "javascript:alert(1)"
        with self.assertRaisesRegex(ValueError, "HTTP"):
            build_reminder_record_fields(event, {"record_ids": [], "names": []})
        event["link"] = ""
        event["deadline"] = "not-a-timestamp"
        with self.assertRaisesRegex(ValueError, "deadline"):
            build_reminder_record_fields(event, {"record_ids": [], "names": []})
        with self.assertRaisesRegex(ValueError, "source_mail_id"):
            route_event({"event_type": "面试", "raw_stage": "一面", "source_mail_id": "bad\nmail", "company": "甲"})

    def test_proposed_slots_skip_and_ambiguous_classification_confirms(self):
        proposed = plan_event({"extracted": {"event_type": "面试", "raw_stage": "一面", "source_mail_id": "proposed", "company": "甲", "requires_time_selection": True, "time_status": "proposed", "start_time": "2026-08-25T10:00:00+08:00"}})
        ambiguous = plan_event({"extracted": {"classification": "ambiguous", "source_mail_id": "ambiguous"}})
        self.assertEqual(proposed["action"], "skip_and_mark_processed")
        self.assertEqual(ambiguous["action"], "confirm")

    def test_recruiting_classification_uncertainty_is_not_exam_type_uncertainty(self):
        result = plan_event({
            "extracted": {
                "classification": "uncertain",
                "uncertain_fields": ["classification"],
                "event_type": "测评",
                "raw_stage": "在线测评",
                "source_mail_id": "mail-uncertain-classification",
                "company": "示例公司",
                "delivery_mode": "异步",
                "deadline": "2026-08-30T18:00:00+08:00",
            },
            "progress_records": [],
            "existing_events": [],
        })
        self.assertEqual(result["action"], "confirm")
        self.assertEqual(result["reason"], "critical_fields_uncertain:classification")

    def test_pinduoduo_retest_updates_one_assessment_or_creates_when_missing(self):
        existing = [{
            "record_id": "rec_assessment",
            "fields": {
                "公司": "拼多多集团",
                "环节": "测评",
                "事件状态": "有效",
                "来源邮件ID": "mail-original",
                "关联邮件ID": '["mail-original"]',
            },
        }]
        update = plan_event({
            "extracted": {
                "event_type": "测评",
                "raw_stage": "补测",
                "message_kind": "retest",
                "source_mail_id": "mail-retest",
                "company": "拼多多",
                "link": "https://example.com/retest",
                "deadline": "2026-08-30T18:00:00+08:00",
            },
            "progress_records": [],
            "existing_events": existing,
        })
        create = plan_event({
            "extracted": {
                "event_type": "测评",
                "raw_stage": "补测",
                "message_kind": "retest",
                "source_mail_id": "mail-retest-new",
                "company": "拼多多",
                "delivery_mode": "异步",
                "deadline": "2026-08-30T18:00:00+08:00",
            },
            "progress_records": [],
            "existing_events": [],
        })
        self.assertEqual(update["action"], "update_retest")
        self.assertEqual(update["decision"]["record_id"], "rec_assessment")
        self.assertEqual(update["patch"], {
            "链接": "https://example.com/retest",
            "截止时间": "2026-08-30T18:00:00+08:00",
            "关联邮件ID": '["mail-original","mail-retest"]',
        })
        self.assertEqual(create["action"], "create")
        with self.assertRaisesRegex(ValueError, "HTTP"):
            plan_event({
                "extracted": {**update["event"], "source_mail_id": "mail-retest-unsafe", "message_kind": "retest", "link": "javascript:alert(1)"},
                "progress_records": [],
                "existing_events": existing,
            })

    def test_unscheduled_time_selection_invite_is_skipped_but_fixed_confirmation_is_processed(self):
        preliminary = route_event({
            "event_type": "面试",
            "raw_stage": "一面",
            "source_mail_id": "mail-select-time",
            "company": "示例公司",
            "requires_time_selection": True,
            "start_time": "",
        })
        fixed = route_event({
            "event_type": "面试",
            "raw_stage": "一面",
            "source_mail_id": "mail-confirm-attendance",
            "company": "示例公司",
            "scheduling_action": "confirm_attendance",
            "start_time": "2026-08-25T10:00:00+08:00",
        })
        self.assertEqual(preliminary["intake_action"], "skip_processed")
        self.assertEqual(fixed["intake_action"], "process")

    def test_one_shot_plan_returns_only_the_required_action(self):
        skipped = plan_event({
            "extracted": {
                "event_type": "面试",
                "raw_stage": "一面",
                "source_mail_id": "mail-select-time",
                "company": "示例公司",
                "requires_time_selection": True,
            },
            "progress_records": [],
            "existing_events": [],
        })
        self.assertEqual(skipped["action"], "skip_and_mark_processed")
        self.assertEqual(skipped["mail_outcome"], "skipped_preliminary")
        self.assertEqual(skipped["required_actions"], [{
            "action": "mail.mark_processed",
            "source_mail_id": "mail-select-time",
            "required_before_completion": True,
        }])
        self.assertEqual(
            skipped["completion_condition"]["processed_source_mail_id"],
            "mail-select-time",
        )
        self.assertEqual(
            skipped["forbidden_writes"],
            ["base", "progress", "calendar", "notification"],
        )

        class MockMailRuntime:
            def __init__(self):
                self.processed = set()

            def execute(self, action):
                if action.get("action") != "mail.mark_processed":
                    raise AssertionError("unexpected mail action")
                self.processed.add(action["source_mail_id"])
                return {"status": "ok"}

        mailbox = MockMailRuntime()
        for required_action in skipped["required_actions"]:
            mailbox.execute(required_action)
        self.assertIn(
            skipped["completion_condition"]["processed_source_mail_id"],
            mailbox.processed,
        )

        planned = plan_event({
            "extracted": {
                "event_type": "笔试",
                "raw_stage": "技术笔试",
                "source_mail_id": "mail-written",
                "company": "示例公司",
                "start_time": "2026-08-25T10:00:00+08:00",
                "delivery_mode": "同步",
            },
            "progress_records": [],
            "existing_events": [],
        })
        self.assertEqual(planned["action"], "create")
        self.assertEqual(planned["fields"]["结束时间"], "2026-08-25T11:30:00+08:00")
        self.assertEqual(planned["calendar_plan"]["action"], "create")

    def test_new_event_plan_enforces_base_progress_calendar_then_notification(self):
        plan = plan_event({
            "extracted": {
                "event_type": "面试",
                "raw_stage": "一面",
                "source_mail_id": "mail-notify-fail",
                "company": "匿名公司",
                "position": "产品经理",
                "start_time": "2026-08-27T14:00:00+08:00",
                "estimated_duration": "45分钟",
            },
            "progress_records": [{
                "record_id": "progress-a",
                "fields": {"公司": "匿名公司", "投递岗位": "产品经理", "进展状态": "待反馈"},
            }],
            "existing_events": [],
        })

        self.assertEqual(
            plan["execution_graph"]["ordered_core"],
            ["base.write", "progress.read_current", "progress.update", "calendar.create_or_skip", "base.patch_calendar_result"],
        )
        self.assertEqual(plan["progress_read_plan"], [{
            "action": "progress.read_current", "record_id": "progress-a",
            "required_after": "base.write", "required_before": "progress.update",
            "recompute_from_fresh_state": True,
        }])
        self.assertIn("base.verify_views", plan["execution_graph"]["verify_after_core"])
        self.assertTrue(plan["execution_graph"]["notification_after_core_verification"])
        self.assertFalse(plan["execution_graph"]["rollback_on_notification_failure"])
        self.assertEqual(plan["fields"]["完成状态"], "待完成")
        self.assertEqual(plan["fields"]["日历状态"], "待安排")
        self.assertEqual(plan["progress_patches"], [{
            "record_id": "progress-a", "fields": {"进展状态": "待一面"},
        }])
        self.assertEqual(plan["fields"]["预计时长（分钟）"], 45)
        self.assertEqual(plan["calendar_plan"]["success_patch"], {"日历状态": "已建日程"})

        # Simulate the actual adapter chain, including a persistent notification
        # failure. Core state must already be complete and must not be rolled back.
        reminder = dict(plan["fields"])
        progress = {"progress-a": {"进展状态": "待反馈"}}
        calls = []
        calls.append("base.write")
        for patch in plan["progress_patches"]:
            calls.append("progress.read_current")
            progress[patch["record_id"]].update(patch["fields"])
            calls.append("progress.update")
        calls.append("calendar.create")
        reminder.update(plan["calendar_plan"]["success_patch"])
        reminder["已建日程ID"] = "calendar-eval-1"
        calls.append("base.update")
        calls.extend(["reminder.verify", "progress.verify"])
        calls.extend(["notification.send"] * 3)
        calls.append("failure.record")

        self.assertEqual(calls[:5], ["base.write", "progress.read_current", "progress.update", "calendar.create", "base.update"])
        self.assertEqual(reminder["完成状态"], "待完成")
        self.assertEqual(reminder["日历状态"], "已建日程")
        self.assertEqual(reminder["已建日程ID"], "calendar-eval-1")
        self.assertEqual(progress["progress-a"]["进展状态"], "待一面")

    def test_company_level_exam_requires_query_and_exact_active_ids(self):
        plan = plan_event({
            "extracted": {
                "event_type": "笔试", "raw_stage": "统一在线笔试",
                "source_mail_id": "mail-company-exam", "company": "匿名公司",
                "delivery_mode": "异步", "deadline": "2026-08-28T20:00:00+08:00",
            },
            "progress_records": [
                {"record_id": "progress-a", "fields": {"公司": "匿名公司", "投递岗位": "产品经理", "进展状态": "待反馈"}},
                {"record_id": "progress-b", "fields": {"公司": "匿名公司", "投递岗位": "数据分析", "进展状态": "待一面"}},
                {"record_id": "progress-closed", "fields": {"公司": "匿名公司", "投递岗位": "运营", "进展状态": "岗位关闭"}},
                {"record_id": "progress-offer", "fields": {"公司": "匿名公司", "投递岗位": "研发", "进展状态": "Offer"}},
            ],
            "existing_events": [],
        })

        self.assertEqual(plan["required_external_reads"][0]["action"], "progress.query")
        self.assertEqual(plan["links"]["record_ids"], ["progress-a", "progress-b"])
        self.assertEqual(plan["links"]["excluded_record_ids"], ["progress-closed", "progress-offer"])
        self.assertEqual(plan["fields"]["求职记录ID"], '["progress-a","progress-b"]')

    def test_completion_plan_reads_then_writes_waiting_feedback_then_verifies(self):
        plan = plan_completion({
            "reminder": {
                "record_id": "event-second", "环节": "二面",
                "求职记录ID": '["progress-a","progress-terminal"]',
            },
            "progress_records": [
                {"record_id": "progress-a", "fields": {"进展状态": "待二面", "最近完成节点": "一面完成"}},
                {"record_id": "progress-terminal", "fields": {"进展状态": "Offer", "最近完成节点": "HR 面完成"}},
            ],
        })

        self.assertEqual(
            [step["action"] for step in plan["required_reads"]],
            ["reminder.query_existing", "progress.read_current", "progress.read_current"],
        )
        self.assertEqual(plan["progress_patches"], [{
            "record_id": "progress-a",
            "fields": {"latest_completed_node": "二面完成", "status": "待反馈"},
        }])
        self.assertEqual(
            [step["action"] for step in plan["ordered_writes"]],
            ["reminder.update_completion", "progress.update"],
        )
        self.assertEqual(plan["ordered_writes"][1], {
            "action": "progress.update", "id": "progress-a",
            "latest_completed_node": "二面完成", "status": "待反馈",
        })
        self.assertEqual(
            [step["action"] for step in plan["ordered_verification"]],
            ["reminder.verify", "progress.verify"],
        )

        reminder = {"completion_status": "待完成"}
        progress = {
            "progress-a": {"status": "待二面", "latest_completed_node": "一面完成"},
            "progress-terminal": {"status": "Offer", "latest_completed_node": "HR 面完成"},
        }
        reminder["completion_status"] = "已完成"
        for patch in plan["progress_patches"]:
            progress[patch["record_id"]].update(patch["fields"])
        self.assertEqual(reminder["completion_status"], "已完成")
        self.assertEqual(progress["progress-a"], {"status": "待反馈", "latest_completed_node": "二面完成"})
        self.assertEqual(progress["progress-terminal"], {"status": "Offer", "latest_completed_node": "HR 面完成"})

    def test_one_shot_plan_stops_for_missing_interview_time_but_infers_async_exam(self):
        interview = plan_event({
            "extracted": {
                "event_type": "面试",
                "raw_stage": "一面",
                "source_mail_id": "mail-no-time",
                "company": "示例公司",
                "position": "产品经理",
            },
            "progress_records": [],
            "existing_events": [],
        })
        exam = plan_event({
            "extracted": {
                "event_type": "测评",
                "raw_stage": "在线测评",
                "source_mail_id": "mail-no-mode",
                "company": "示例公司",
                "deadline": "2026-08-30T18:00:00+08:00",
            },
            "progress_records": [],
            "existing_events": [],
        })
        self.assertEqual(interview["reason"], "fixed_start_time_required")
        self.assertEqual(exam["action"], "create")
        self.assertEqual(exam["event"]["delivery_mode"], "异步")

    def test_source_link_distinguishes_reminder_cancellation_and_reschedule(self):
        repository = FakeEventRepository([{
            "record_id": "rec_original",
            "fields": {"来源邮件ID": "mail-original"},
        }])
        for message_kind, expected in (
            ("reminder", "append_reminder"),
            ("cancellation", "cancel"),
            ("reschedule", "reschedule"),
        ):
            with self.subTest(message_kind=message_kind):
                decision = decide_event_upsert({
                    "source_mail_id": f"mail-{message_kind}",
                    "supersedes_source_mail_id": "mail-original",
                    "message_kind": message_kind,
                }, repository)
                self.assertEqual(decision["action"], expected)
                self.assertEqual(decision["related_source_mail_id"], f"mail-{message_kind}")


if __name__ == "__main__":
    unittest.main()
