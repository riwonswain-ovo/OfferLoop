"""Synthetic AI interview lifecycle regressions; no live user data."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from event_model import (route_event, plan_event, assign_default_interview_stage,
                         next_progress_status, completion_progress_patch,
                         REMINDER_VIEW_FILTERS)
from event_lookup import resolve_event
from daily_checkin import reschedule_window
from datetime import datetime


def invitation(**overrides):
    return dict(source_mail_id="mail-synthetic-ai", company="示例企业",
                position="产品经理", classification="招聘面试", event_type="面试",
                raw_stage="AI 面试", delivery_mode="异步",
                deadline="2026-09-10T20:00:00+08:00", **overrides)


class AIInterviewTest(unittest.TestCase):
    def test_explicit_ai_labels_and_platform_win_over_assessment(self):
        for field, label in [("raw_stage", "AI面"), ("raw_stage", "AI Interview"),
                             ("raw_stage", "智能面试"), ("platform", "示例AI面试")]:
            payload = invitation()
            payload.update(event_type="测评", raw_stage="")
            payload[field] = label
            self.assertEqual(route_event(payload)["stage"], "AI面")

    def test_ai_role_and_online_video_are_not_ai_interviews(self):
        payload = invitation()
        payload.update(raw_stage="视频面试", position="AI产品经理", platform="腾讯会议")
        self.assertEqual(route_event(payload)["stage"], "面试（轮次待确认）")

    def test_async_ai_creates_base_without_calendar_and_preserves_deadline(self):
        payload = invitation(start_time="2026-09-09T10:00:00+08:00", requires_time_selection=True)
        plan = plan_event({"extracted": payload, "progress_records": [], "existing_events": []})
        self.assertEqual(plan["action"], "create")
        self.assertEqual(plan["event"]["stage"], "AI面")
        self.assertEqual(plan["event"]["start_time"], "")
        self.assertEqual(plan["calendar_plan"]["action"], "none")
        self.assertEqual(plan["event"]["deadline"], payload["deadline"])

    def test_fixed_and_user_planned_ai_create_calendar(self):
        for mode, planned in [("同步", False), ("异步", True)]:
            payload = invitation(start_time="2026-09-09T19:00:00+08:00", planned_by_user=planned)
            payload["delivery_mode"] = mode
            result = plan_event({"extracted": payload})
            self.assertEqual(result["action"], "create")
            self.assertEqual(result["calendar_plan"]["action"], "create")

    def test_missing_role_or_deadline_requires_confirmation(self):
        for key in ("position", "deadline"):
            payload = invitation()
            payload[key] = ""
            self.assertEqual(plan_event({"extracted": payload})["action"], "confirm")

    def test_deadline_only_ai_infers_async_and_keeps_unplanned(self):
        payload = invitation(requires_time_selection=True)
        del payload["delivery_mode"]
        result = plan_event({"extracted": payload})
        self.assertEqual(result["action"], "create")
        self.assertEqual(result["event"]["delivery_mode"], "异步")
        self.assertEqual(result["fields"]["预计时长（分钟）"], 60)

    def test_ai_reschedule_uses_duration_and_rejects_fixed_or_late_plan(self):
        fields = {"环节": "AI面", "进行方式": "异步", "截止时间": "2026-09-10T20:00:00+08:00"}
        now = datetime.fromisoformat("2026-09-09T10:00:00+08:00")
        start, end = reschedule_window(fields, "2026-09-10", "18:00", now)
        self.assertEqual((end - start).total_seconds(), 3600)
        with self.assertRaises(ValueError):
            reschedule_window(fields, "2026-09-10", "19:30", now)
        fields["进行方式"] = "同步"
        with self.assertRaises(ValueError):
            reschedule_window(fields, "2026-09-10", "18:00", now)

    def test_ai_does_not_consume_human_round(self):
        existing = [{"fields": {"环节": "AI面", "完成状态": "已完成"}}]
        self.assertEqual(assign_default_interview_stage({"stage": "面试"}, existing)["stage"], "一面")
        existing.append({"fields": {"环节": "一面"}})
        self.assertEqual(assign_default_interview_stage({"stage": "面试"}, existing)["stage"], "二面")
        self.assertEqual(REMINDER_VIEW_FILTERS["AI 面"], ("AI面",))

    def test_progress_order_completion_and_terminal_protection(self):
        self.assertEqual(next_progress_status("待笔试", "AI面"), "待 AI 面")
        self.assertEqual(next_progress_status("待 AI 面", "一面"), "待一面")
        self.assertEqual(next_progress_status("待一面", "AI面"), "待一面")
        self.assertEqual(next_progress_status("Offer", "AI面"), "Offer")
        self.assertEqual(completion_progress_patch("待 AI 面", "笔试完成", "AI面"),
                         {"latest_completed_node": "AI面完成", "status": "待反馈"})
        self.assertEqual(completion_progress_patch("待二面", "一面完成", "AI面"),
                         {"latest_completed_node": "一面完成", "status": "待反馈"})

    def test_ai_is_available_for_prep_and_review_lookup(self):
        result = resolve_event({"query": {"company": "示例企业", "stage": "AI 面"},
                                "records": [{"record_id": "recSynthetic", "fields": {
                                    "公司": "示例企业", "岗位": "产品经理", "环节": "AI面", "事件状态": "有效"}}]})
        self.assertEqual(result["match_status"], "found")
