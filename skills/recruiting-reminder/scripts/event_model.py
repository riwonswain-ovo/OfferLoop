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
    "子表 record_id",
)
CHILD_TABLES = ("笔试", "群面", "一面", "二面", "三面", "HR面")
ARRANGEMENT_NAME_FORMULA = """IF(
  ISBLANK([岗位]),
  [公司] & "－" & [环节],
  [公司] & "－" & [岗位] & "－" & [环节]
)"""
PROGRESS_STAGE_ORDER = {
    "已投递": 0,
    "笔试": 1,
    "群面": 2,
    "一面": 3,
    "二面": 4,
    "三面": 5,
    "HR面": 6,
}
MANUAL_TERMINAL_STAGES = {"Offer", "已结束"}
COMPLETION_STATUSES = {"待完成", "已完成", "已错过"}


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
    """Normalize an already-extracted mail event and choose its child table."""
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
        "child_table": stage if stage in CHILD_TABLES else None,
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
        if record.get("fields", {}).get("当前阶段") != "已结束"
        and _normalized(record.get("fields", {}).get("公司")) == company_key
    ]


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


def next_progress_stage(current_stage, event_stage):
    """Advance a progress stage monotonically; protect manual terminal states."""
    if current_stage in MANUAL_TERMINAL_STAGES:
        return current_stage
    if event_stage not in PROGRESS_STAGE_ORDER:
        return current_stage
    if current_stage not in PROGRESS_STAGE_ORDER:
        return event_stage
    if PROGRESS_STAGE_ORDER[event_stage] > PROGRESS_STAGE_ORDER[current_stage]:
        return event_stage
    return current_stage


def decide_completion_status_sync(
    main_status,
    child_status,
    *,
    last_synced_status=None,
):
    """Choose a bidirectional status update without silently losing an edit.

    ``last_synced_status`` is the last value verified on both records.  When the
    records diverge, the side that moved away from that baseline is the source
    of the new value.  A missing baseline or two different edits is a conflict,
    because choosing either side would discard a user's change.
    """
    main_valid = main_status in COMPLETION_STATUSES
    child_valid = child_status in COMPLETION_STATUSES
    baseline_valid = last_synced_status in COMPLETION_STATUSES

    if main_valid and child_valid and main_status == child_status:
        return {
            "status": main_status,
            "source": "both",
            "action": "already_synced",
        }
    if main_valid and not child_valid:
        return {"status": main_status, "source": "main", "action": "sync"}
    if child_valid and not main_valid:
        return {"status": child_status, "source": "child", "action": "sync"}

    if main_valid and child_valid and baseline_valid:
        main_changed = main_status != last_synced_status
        child_changed = child_status != last_synced_status
        if main_changed and not child_changed:
            return {"status": main_status, "source": "main", "action": "sync"}
        if child_changed and not main_changed:
            return {"status": child_status, "source": "child", "action": "sync"}

    return {"status": None, "source": None, "action": "conflict"}


def reconciled_completion_status(
    main_status,
    child_status,
    *,
    last_synced_status=None,
):
    """Return the safe target status, or ``None`` when edits conflict."""
    decision = decide_completion_status_sync(
        main_status,
        child_status,
        last_synced_status=last_synced_status,
    )
    return decision["status"]


def build_main_record_fields(event, progress_links):
    """Map one normalized event to writable fields of the unified main table."""
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
        "子表 record_id": "",
    }
