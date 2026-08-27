#!/usr/bin/env python3
"""Pure v2 rules for the 22:10 recruiting-event check-in card.

This module has no Feishu client and performs no writes.  The deployed Loop
Runtime may use the returned groups/actions to render Card 2.0 and validate
callbacks before it updates Base or Calendar.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


FIXED_STAGES = {"群面", "一面", "二面", "三面", "面试", "HR面"}
ASYNC_STAGES = {"测评", "笔试"}
SHANGHAI = ZoneInfo("Asia/Shanghai")


def _fields(record):
    return record.get("fields", record)


def _parse_time(value):
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(
            value / 1000 if value > 10**11 else value,
            tz=SHANGHAI,
        )
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=SHANGHAI)
    return parsed.astimezone(SHANGHAI)


def is_valid_pending(record):
    fields = _fields(record)
    return (
        str(fields.get("完成状态", "")).strip() == "待完成"
        and str(fields.get("事件状态", "")).strip() == "有效"
    )


def group_pending_records(records, now):
    """Return mutually exclusive card groups in display priority order."""
    groups = {"today": [], "plan_overdue": [], "deadline_overdue": [], "unplanned": []}
    if now.tzinfo is None:
        now = now.replace(tzinfo=SHANGHAI)
    now = now.astimezone(SHANGHAI)
    today = now.date()
    for record in records:
        if not is_valid_pending(record):
            continue
        fields = _fields(record)
        start = _parse_time(fields.get("开始时间"))
        end = _parse_time(fields.get("结束时间"))
        deadline = _parse_time(fields.get("截止时间"))
        if deadline and deadline < now:
            groups["deadline_overdue"].append(record)
        elif start is None and end is None and str(fields.get("环节", "")).strip() in ASYNC_STAGES and str(fields.get("进行方式", "")).strip() == "异步":
            groups["unplanned"].append(record)
        elif (end and end < now) or (end is None and start and start < now):
            groups["plan_overdue"].append(record)
        elif start and start.date() == today:
            groups["today"].append(record)
    return groups


def actions_for_record(record, group):
    """Return business actions; UI renders adjust only after not-completed."""
    fields = _fields(record)
    stage = str(fields.get("环节", "")).strip()
    mode = str(fields.get("进行方式", "")).strip()
    if group == "unplanned":
        return ("adjust",)
    if group == "deadline_overdue":
        return ("completed", "missed")
    if stage in FIXED_STAGES or mode == "同步":
        return ("completed", "missed")
    if stage in ASYNC_STAGES and mode == "异步":
        return ("completed", "not_completed")
    return ("completed", "not_completed")


def reschedule_window(record, date_value, start_time, now=None):
    """Validate an owner-selected async start and preserve the event duration."""
    fields = _fields(record)
    if str(fields.get("环节", "")).strip() not in ASYNC_STAGES:
        raise ValueError("only assessment or written-test events can be rescheduled")
    if str(fields.get("进行方式", "")).strip() != "异步":
        raise ValueError("fixed-time events cannot be rescheduled")
    deadline = _parse_time(fields.get("截止时间"))
    if deadline is None:
        raise ValueError("async event requires a recruiter deadline")
    timezone = deadline.tzinfo
    start = datetime.fromisoformat(f"{date_value}T{start_time}").replace(tzinfo=timezone)
    current = (now or datetime.now(timezone)).astimezone(timezone)
    if start <= current:
        raise ValueError("planned start must be in the future")
    previous_start = _parse_time(fields.get("开始时间"))
    previous_end = _parse_time(fields.get("结束时间"))
    duration = (
        previous_end - previous_start
        if previous_start and previous_end and previous_end > previous_start
        else timedelta(minutes=_stored_duration_minutes(fields))
    )
    end = start + duration
    if end > deadline:
        raise ValueError("planned end must not exceed the recruiter deadline")
    return start, end


def _stored_duration_minutes(fields):
    raw = fields.get("预计时长（分钟）", 90)
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError("stored duration must be a positive number") from exc
    if value <= 0 or value > 24 * 60:
        raise ValueError("stored duration must be a positive number")
    return value


def callback_is_authorized(operator_id, owner_open_id):
    return bool(owner_open_id) and str(operator_id) == str(owner_open_id)
