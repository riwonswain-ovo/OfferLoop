#!/usr/bin/env python3
"""Pure rules for routing recruiting mail into OfferLoop event records."""

from __future__ import annotations

import json
import re
import unicodedata


REMINDER_FIELDS = (
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
)
REMINDER_TABLE_NAME = "笔面试安排"
REMINDER_VIEW_FILTERS = {
    "全部安排": (),
    "笔试": ("笔试",),
    "群面": ("群面",),
    "一面": ("一面",),
    "二面": ("二面",),
    "三面": ("三面",),
    "HR 面": ("HR面",),
    "其他面试": ("面试（轮次待确认）",),
}
ARRANGEMENT_NAME_FORMULA = """IF(
  ISBLANK([岗位]),
  [公司] & "－" & [环节],
  [公司] & "－" & [岗位] & "－" & [环节]
)"""
PROGRESS_STATUS_ORDER = {
    "待反馈": 0,
    "待笔试": 1,
    "待面试": 1,
    "待群面": 2,
    "待一面": 3,
    "待二面": 4,
    "待三面": 5,
    "待 HR 面": 6,
    "待 OC": 7,
}
EVENT_STAGE_TO_PROGRESS_STATUS = {
    "笔试": "待笔试",
    "群面": "待群面",
    "一面": "待一面",
    "二面": "待二面",
    "三面": "待三面",
    "HR面": "待 HR 面",
}
MANUAL_PROGRESS_STATUSES = {
    "Offer", "未通过", "主动放弃", "岗位关闭"
}
NUMBERED_INTERVIEW_STAGES = {"一面": 1, "二面": 2, "三面": 3}
UNKNOWN_INTERVIEW_STAGES = {"面试", "面试（轮次待确认）"}


def _normalized(value):
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    return re.sub(r"[\W_]+", "", text, flags=re.UNICODE)


def _stage_from_text(event_type, raw_stage):
    event_kind = _normalized(event_type)
    stage = _normalized(raw_stage)
    if "笔试" in event_kind or "测评" in event_kind:
        return "笔试"
    if any(word in stage for word in ("群面", "无领导小组", "小组面", "groupinterview")):
        return "群面"
    if "hr" in stage or "人力" in stage:
        return "HR面"
    if any(word in stage for word in ("三面", "第三轮", "第3轮")):
        return "三面"
    if any(word in stage for word in ("二面", "第二轮", "第2轮")):
        return "二面"
    if any(word in stage for word in ("一面", "第一轮", "第1轮", "初面")):
        return "一面"
    if any(word in stage for word in ("笔试", "测评", "assessment", "codingtest")):
        return "笔试"
    return "面试（轮次待确认）"


def route_event(extracted):
    """Normalize an extracted mail event for the single reminder table."""
    source_mail_id = str(extracted.get("source_mail_id", "")).strip()
    company = str(extracted.get("company", "")).strip()
    if not source_mail_id:
        raise ValueError("source_mail_id is required")
    if not company:
        raise ValueError("company is required")
    stage = _stage_from_text(
        extracted.get("event_type", ""),
        extracted.get("raw_stage", ""),
    )
    return {
        **extracted,
        "source_mail_id": source_mail_id,
        "company": company,
        "stage": stage,
        "target_table": REMINDER_TABLE_NAME,
    }


def assign_default_interview_stage(event, existing_events):
    """Assign a stable round to a newly created generic interview.

    ``existing_events`` must already be narrowed to the same progress record.
    Call this only after duplicate and reschedule detection, so reminder and
    reschedule messages never consume another round.
    """
    if event.get("stage") not in UNKNOWN_INTERVIEW_STAGES:
        return dict(event)

    highest_round = 0
    for existing in existing_events:
        fields = existing.get("fields", existing)
        stage = str(fields.get("环节", fields.get("stage", ""))).strip()
        explicit_round = NUMBERED_INTERVIEW_STAGES.get(stage)
        if explicit_round:
            highest_round = max(highest_round, explicit_round)
        elif stage in UNKNOWN_INTERVIEW_STAGES:
            highest_round += 1

    next_round = highest_round + 1
    stage = {1: "一面", 2: "二面", 3: "三面"}.get(next_round, "面试")
    return {
        **event,
        "stage": stage,
        "target_table": REMINDER_TABLE_NAME,
    }


def decide_event_upsert(event, repository):
    """Return a no-write decision based only on stable source-mail linkage."""
    existing = repository.find_by_source_mail_id(event["source_mail_id"])
    if existing is not None:
        return {
            "action": "duplicate",
            "record_id": existing["record_id"],
            "canonical_source_mail_id": event["source_mail_id"],
        }

    original_id = str(event.get("supersedes_source_mail_id", "")).strip()
    if original_id:
        original = repository.find_by_source_mail_id(original_id)
        if original is None:
            return {
                "action": "unresolved_reschedule",
                "canonical_source_mail_id": original_id,
            }
        return {
            "action": "reschedule",
            "record_id": original["record_id"],
            "canonical_source_mail_id": original_id,
        }

    return {
        "action": "create",
        "canonical_source_mail_id": event["source_mail_id"],
    }


def _active_company_candidates(event, progress_records):
    company_key = _normalized(event["company"])
    return [
        record
        for record in progress_records
        if _is_active_progress(record.get("fields", {}))
        and _normalized(record.get("fields", {}).get("公司")) == company_key
    ]


def _is_active_progress(fields):
    status = str(fields.get("进展状态", "")).strip()
    if status:
        return status in PROGRESS_STATUS_ORDER
    return fields.get("当前阶段") not in {"Offer", "已结束"}


def _position_matches(event_position, candidate_position):
    left = _normalized(event_position)
    right = _normalized(candidate_position)
    return bool(left and right and (left in right or right in left))


def _progress_name(record):
    fields = record.get("fields", {})
    company = str(fields.get("公司", "")).strip()
    position = str(fields.get("投递岗位", "")).strip()
    return f"{company}－{position}" if position else company


def _linked(records):
    return {
        "status": "linked",
        "record_ids": [record["record_id"] for record in records],
        "names": [_progress_name(record) for record in records],
        "candidate_ids": [],
    }


def link_progress_records(event, progress_records):
    """Link an event without guessing between multiple same-company applications."""
    candidates = _active_company_candidates(event, progress_records)
    if not candidates:
        return {
            "status": "unmatched",
            "record_ids": [],
            "names": [],
            "candidate_ids": [],
        }

    position = str(event.get("position", "")).strip()
    position_matches = [
        record
        for record in candidates
        if _position_matches(position, record.get("fields", {}).get("投递岗位", ""))
    ]

    if event["stage"] == "笔试":
        if position and position_matches:
            return _linked(position_matches)
        if not position:
            return _linked(candidates)
        return {
            "status": "unmatched",
            "record_ids": [],
            "names": [],
            "candidate_ids": [record["record_id"] for record in candidates],
        }

    narrowed = position_matches if position else candidates
    if len(narrowed) == 1:
        return _linked(narrowed)
    return {
        "status": "ambiguous",
        "record_ids": [],
        "names": [],
        "candidate_ids": [record["record_id"] for record in narrowed],
    }


def next_progress_status(current_status, event_stage):
    """Advance the pending action monotonically; protect manual statuses."""
    if current_status in MANUAL_PROGRESS_STATUSES:
        return current_status
    candidate = EVENT_STAGE_TO_PROGRESS_STATUS.get(event_stage)
    if candidate is None:
        return current_status
    if current_status not in PROGRESS_STATUS_ORDER:
        return candidate
    if PROGRESS_STATUS_ORDER[candidate] > PROGRESS_STATUS_ORDER[current_status]:
        return candidate
    return current_status


def build_reminder_record_fields(event, progress_links):
    """Map one normalized event to writable fields of the single reminder table."""
    record_ids = list(progress_links.get("record_ids", []))
    names = list(progress_links.get("names", []))
    return {
        "环节": event["stage"],
        "公司": event["company"],
        "业务线": event.get("business_unit", ""),
        "岗位": event.get("position", ""),
        "关联求职记录": "、".join(names),
        "开始时间": event.get("start_time", ""),
        "结束时间": event.get("end_time", ""),
        "截止时间": event.get("deadline", ""),
        "笔试类型": event.get("exam_type", ""),
        "笔试子类型": event.get("exam_subtype", ""),
        "平台": event.get("platform", ""),
        "链接": event.get("link", ""),
        "注意事项": event.get("notes", ""),
        "面试准备文档": "",
        "面试复盘文档": "",
        "完成状态": "待完成",
        "求职记录ID": json.dumps(
            record_ids,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        "来源邮件ID": event["source_mail_id"],
        "日历状态": "未建日程",
        "已建日程ID": "",
    }
