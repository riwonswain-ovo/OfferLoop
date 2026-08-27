#!/usr/bin/env python3
"""Pure rules for routing recruiting mail into OfferLoop event records."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import date, datetime, time, timedelta
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo


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
)
REMINDER_TABLE_NAME = "笔面试安排"
REMINDER_VIEW_FILTERS = {
    "全部安排": (),
    "测评": ("测评",),
    "笔试": ("笔试",),
    "群面": ("群面",),
    "一面": ("一面",),
    "二面": ("二面",),
    "三面": ("三面",),
    "HR 面": ("HR面",),
    "其他面试": ("面试（轮次待确认）", "面试"),
}
ARRANGEMENT_NAME_FORMULA = """IF(
  ISBLANK([岗位]),
  [公司] & "－" & [环节],
  [公司] & "－" & [岗位] & "－" & [环节]
)"""
PROGRESS_STATUS_ORDER = {
    "待反馈": 0,
    "待测评": 1,
    "待笔试": 2,
    "待群面": 3,
    "待一面": 4,
    "待二面": 5,
    "待三面": 6,
    "待面试": 7,
    "待 HR 面": 9,
    "待 OC": 10,
}
EVENT_STAGE_TO_PROGRESS_STATUS = {
    "测评": "待测评",
    "笔试": "待笔试",
    "群面": "待群面",
    "一面": "待一面",
    "二面": "待二面",
    "三面": "待三面",
    "HR面": "待 HR 面",
    "面试": "待面试",
}
MANUAL_PROGRESS_STATUSES = {
    "Offer", "未通过", "主动放弃", "岗位关闭"
}
COMPLETED_NODE_ORDER = {
    "投递完成": 0,
    "测评完成": 1,
    "笔试完成": 2,
    "群面完成": 3,
    "一面完成": 4,
    "二面完成": 5,
    "三面完成": 6,
    "面试完成": 7,
    "HR面完成": 8,
}
EVENT_STAGE_TO_COMPLETED_NODE = {
    "测评": "测评完成",
    "笔试": "笔试完成",
    "群面": "群面完成",
    "一面": "一面完成",
    "二面": "二面完成",
    "三面": "三面完成",
    "面试": "面试完成",
    "面试（轮次待确认）": "面试完成",
    "HR面": "HR面完成",
}
NUMBERED_INTERVIEW_STAGES = {"一面": 1, "二面": 2, "三面": 3}
UNKNOWN_INTERVIEW_STAGES = {"面试", "面试（轮次待确认）"}
MESSAGE_KINDS = {"new", "reminder", "cancellation", "reschedule", "retest"}
EXTRACTED_ALLOWLIST = {
    "source_mail_id", "message_id", "in_reply_to", "references",
    "supersedes_source_mail_id", "message_kind", "event_type", "raw_stage",
    "company", "business_unit", "position", "start_time", "end_time",
    "deadline", "duration_minutes", "estimated_duration", "delivery_mode",
    "deadline_text", "received_at", "planned_by_user",
    "availability_start", "availability_end",
    "exam_subtype", "platform", "link", "notes", "scheduling_action",
    "requires_time_selection", "time_status", "classification",
    "uncertain_fields",
}
SHANGHAI = ZoneInfo("Asia/Shanghai")
WORKDAY_CALENDAR_FILE = Path(__file__).resolve().parent.parent / "references" / "china-workdays.json"


def _normalized(value):
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    return re.sub(r"[\W_]+", "", text, flags=re.UNICODE)


def _stage_from_text(event_type, raw_stage):
    event_kind = _normalized(event_type)
    stage = _normalized(raw_stage)
    combined = f"{event_kind}{stage}"
    written_markers = ("笔试", "技术笔试", "codingtest", "writtentest")
    assessment_markers = ("测评", "性格", "行测", "assessment", "aptitude", "personality")
    event_is_written = any(word in combined for word in written_markers)
    event_is_assessment = any(word in combined for word in assessment_markers)
    if event_is_assessment:
        return "测评"
    if event_is_written:
        return "笔试"
    if any(word in combined for word in ("群面", "无领导小组", "小组面", "groupinterview")):
        return "群面"
    raw = unicodedata.normalize("NFKC", f"{event_type or ''} {raw_stage or ''}").lower()
    if re.search(r"(?:^|[^a-z])hr(?:[^a-z]|$)", raw) or "人力" in combined:
        return "HR面"
    if any(word in combined for word in ("三面", "第三轮", "第3轮", "thirdround", "thirdinterview", "threerounds")):
        return "三面"
    if any(word in combined for word in ("二面", "第二轮", "第2轮", "secondround", "secondinterview")):
        return "二面"
    if any(word in combined for word in ("一面", "第一轮", "第1轮", "初面", "firstround", "firstinterview")):
        return "一面"
    if (
        event_kind == "test"
        or stage == "test"
        or any(word in combined for word in ("exam", "考试", "测验", "onlinetest"))
    ):
        return "测评"
    return "面试（轮次待确认）"


def route_event(extracted):
    """Normalize an extracted mail event for the single reminder table."""
    if not isinstance(extracted, dict):
        raise ValueError("extracted must be an object")
    extracted = {key: value for key, value in extracted.items() if key in EXTRACTED_ALLOWLIST}
    source_mail_id = str(extracted.get("source_mail_id", "")).strip()
    company = _safe_plain_text(extracted.get("company", ""), 120)
    if not source_mail_id:
        raise ValueError("source_mail_id is required")
    if len(source_mail_id) > 1000 or re.search(r"[\x00-\x1f\x7f]", source_mail_id):
        raise ValueError("source_mail_id is invalid")
    kind = str(extracted.get("message_kind", "new") or "new").strip().lower()
    if kind not in MESSAGE_KINDS:
        raise ValueError("message_kind must be new, reminder, cancellation, reschedule, or retest")
    classification_label = _normalized(extracted.get("classification", ""))
    classification = _normalized(" ".join(str(extracted.get(key, "") or "") for key in ("classification", "event_type", "raw_stage")))
    recruiting_markers = (
        "recruit", "招聘", "interview", "面试", "test", "笔试", "测评", "assessment", "exam", "考试",
    )
    if kind == "new" and not classification and not _normalized(extracted.get("raw_stage")):
        return {**extracted, "source_mail_id": source_mail_id, "message_kind": kind,
                "intake_action": "confirm", "skip_reason": "classification_ambiguous"}
    explicit_non_recruiting = {
        "非招聘", "非求职", "不是招聘", "notrecruiting", "notrecruitmentevent",
        "nonrecruiting", "irrelevant", "spam", "newsletter",
    }
    if kind == "new" and classification_label in explicit_non_recruiting:
        return {**extracted, "source_mail_id": source_mail_id, "message_kind": kind,
                "intake_action": "skip_processed", "skip_reason": "not_recruiting_event"}
    if kind == "new" and not any(marker in classification for marker in recruiting_markers):
        ambiguous_markers = {"ambiguous", "uncertain", "unknown", "待确认", "不确定"}
        if classification in ambiguous_markers:
            return {**extracted, "source_mail_id": source_mail_id, "message_kind": kind,
                    "intake_action": "confirm", "skip_reason": "classification_ambiguous"}
        return {**extracted, "source_mail_id": source_mail_id, "message_kind": kind,
                "intake_action": "skip_processed", "skip_reason": "not_recruiting_event"}
    stage = _stage_from_text(
        extracted.get("event_type", ""),
        extracted.get("raw_stage", ""),
    )
    mode = normalize_delivery_mode(extracted.get("delivery_mode", extracted.get("exam_subtype", "")))
    deadline_text = extracted.get("deadline_text", "")
    deadline_value = extracted.get("deadline", "")
    deadline_source = deadline_text if deadline_text not in (None, "") else deadline_value
    if deadline_source not in (None, ""):
        try:
            extracted["deadline"] = normalize_deadline(deadline_source, extracted.get("received_at", ""))
        except ValueError:
            if deadline_value in (None, "") or deadline_value == deadline_source:
                raise
            extracted["deadline"] = normalize_deadline(deadline_value, extracted.get("received_at", ""))
    if stage in {"测评", "笔试"} and not mode:
        if extracted.get("deadline") not in (None, "") and extracted.get("start_time") in (None, ""):
            mode = "异步"
        elif extracted.get("start_time") not in (None, ""):
            mode = "同步"
        if mode:
            extracted["delivery_mode"] = mode
    # An async mail may state when the test becomes available.  That is a
    # recruiter constraint, not the user's chosen calendar start.  Only a
    # callback or an explicit confirmed plan may set planned_by_user=true.
    planned_by_user = extracted.get("planned_by_user") is True or _normalized(extracted.get("planned_by_user")) in {"true", "yes", "1", "confirmed", "用户已选择"}
    if mode == "异步" and not planned_by_user:
        if extracted.get("start_time") not in (None, ""):
            extracted["availability_start"] = extracted.get("availability_start") or extracted["start_time"]
        if extracted.get("end_time") not in (None, ""):
            extracted["availability_end"] = extracted.get("availability_end") or extracted["end_time"]
        extracted["start_time"] = ""
        extracted["end_time"] = ""
    intake_action = (
        "skip_processed"
        if _is_unscheduled_selection_invite(extracted, stage)
        else "process"
    )
    return {
        **extracted,
        "source_mail_id": source_mail_id,
        "company": company,
        "business_unit": _safe_plain_text(extracted.get("business_unit", ""), 120),
        "position": _safe_plain_text(extracted.get("position", ""), 160),
        "platform": _safe_plain_text(extracted.get("platform", ""), 80),
        "message_kind": kind,
        "stage": stage,
        "intake_action": intake_action,
        **({"skip_reason": "preliminary_time_selection"} if intake_action == "skip_processed" else {}),
        "target_table": REMINDER_TABLE_NAME,
    }


def _is_unscheduled_selection_invite(extracted, stage):
    if stage in {"测评", "笔试"}:
        return False
    scheduling_action = _normalized(extracted.get("scheduling_action", ""))
    selection_flag = extracted.get("requires_time_selection")
    requires_selection = (
        selection_flag is True
        or _normalized(selection_flag) in {"true", "yes", "1", "required", "需要", "是"}
        or scheduling_action in {
        "selecttime", "scheduletime", "booktime", "choosetime",
        "选择时间", "预约时间", "确认时间",
        }
    )
    proposed = _normalized(extracted.get("time_status")) in {"proposed", "candidate", "待选择", "候选"}
    return requires_selection and (proposed or extracted.get("start_time") in (None, ""))


def assign_default_interview_stage(event, existing_events):
    """Assign a stable round to a newly created generic interview.

    ``existing_events`` must already be narrowed to the same progress record.
    Call this only after duplicate and reschedule detection, so reminder and
    reschedule messages never consume another round.
    """
    if event.get("stage") not in UNKNOWN_INTERVIEW_STAGES:
        return dict(event)

    highest_round = 0
    ordinary_count = 0
    for existing in existing_events:
        fields = existing.get("fields", existing)
        if str(fields.get("事件状态", "有效")).strip() == "已取消":
            continue
        stage = str(fields.get("环节", fields.get("stage", ""))).strip()
        explicit_round = NUMBERED_INTERVIEW_STAGES.get(stage)
        if explicit_round:
            highest_round = max(highest_round, explicit_round)
            ordinary_count += 1
        elif stage in UNKNOWN_INTERVIEW_STAGES:
            ordinary_count += 1

    next_round = max(highest_round, ordinary_count) + 1
    stage = {1: "一面", 2: "二面", 3: "三面"}.get(next_round, "面试")
    return {
        **event,
        "stage": stage,
        "target_table": REMINDER_TABLE_NAME,
    }


def decide_event_upsert(event, repository):
    """Return a no-write decision based only on stable source-mail linkage."""
    existing_matches = _find_source_matches(repository, event["source_mail_id"])
    if len(existing_matches) > 1:
        return {
            "action": "unresolved_duplicate_source",
            "candidate_ids": [record["record_id"] for record in existing_matches],
        }
    if existing_matches:
        existing = existing_matches[0]
        return {
            "action": "duplicate",
            "record_id": existing["record_id"],
            "canonical_source_mail_id": event["source_mail_id"],
        }

    message_kind = str(event.get("message_kind", "new")).strip()
    original_id = str(event.get("supersedes_source_mail_id", "")).strip()
    if not original_id:
        references = event.get("references") or []
        if isinstance(references, str):
            references = re.findall(r"<[^>]+>|\S+", references)
        chain = [event.get("in_reply_to", ""), *references]
        matches = []
        for identifier in chain:
            identifier = str(identifier).strip()
            if not identifier:
                continue
            found = _find_source_matches(repository, identifier)
            if len(found) > 1:
                return {
                    "action": "unresolved_duplicate_source",
                    "candidate_ids": [record["record_id"] for record in found],
                }
            if found and found[0] not in matches:
                matches.append(found[0])
        if len(matches) == 1:
            original_id = str(matches[0].get("fields", matches[0]).get("来源邮件ID", "")).strip()
        elif len(matches) > 1:
            return {"action": "unresolved_source_chain", "candidate_ids": [r["record_id"] for r in matches]}
    if original_id:
        originals = _find_source_matches(repository, original_id)
        if len(originals) > 1:
            return {
                "action": "unresolved_duplicate_source",
                "candidate_ids": [record["record_id"] for record in originals],
            }
        if not originals:
            return {
                "action": "unresolved_reschedule",
                "canonical_source_mail_id": original_id,
            }
        original = originals[0]
        action = {
            "reminder": "append_reminder",
            "cancellation": "cancel",
            "reschedule": "reschedule",
            "retest": "update_retest",
        }.get(message_kind, "reschedule")
        return {
            "action": action,
            "record_id": original["record_id"],
            "canonical_source_mail_id": original_id,
            "related_source_mail_id": event["source_mail_id"],
        }

    company_key = _normalized(event.get("company"))
    if message_kind == "retest" and any(
        marker in company_key for marker in ("拼多多", "pinduoduo", "pdd")
    ):
        finder = getattr(repository, "find_assessments_by_company", None)
        matches = finder(event["company"]) if finder is not None else []
        if len(matches) == 1:
            return {
                "action": "update_retest",
                "record_id": matches[0]["record_id"],
                "canonical_source_mail_id": str(
                    matches[0].get("fields", matches[0]).get("来源邮件ID", "")
                ).strip(),
                "related_source_mail_id": event["source_mail_id"],
            }
        if len(matches) > 1:
            return {
                "action": "unresolved_retest",
                "candidate_ids": [record["record_id"] for record in matches],
            }
        return {
            "action": "create",
            "canonical_source_mail_id": event["source_mail_id"],
        }

    if message_kind != "new":
        return {
            "action": f"unresolved_{message_kind}",
            "canonical_source_mail_id": event["source_mail_id"],
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
    return status in PROGRESS_STATUS_ORDER or status == "状态待确认"


def _same_company_records(event, progress_records):
    company_key = _normalized(event["company"])
    return [
        record
        for record in progress_records
        if _normalized(record.get("fields", {}).get("公司")) == company_key
    ]


def _position_matches(event_position, candidate_position):
    left = _normalized(event_position)
    right = _normalized(candidate_position)
    return bool(left and right and left == right)


def _progress_name(record):
    fields = record.get("fields", {})
    company = str(fields.get("公司", "")).strip()
    position = str(fields.get("投递岗位", "")).strip()
    return f"{company}－{position}" if position else company


def _linked(records, excluded_records=()):
    return {
        "status": "linked",
        "record_ids": [record["record_id"] for record in records],
        "names": [_progress_name(record) for record in records],
        "excluded_record_ids": [record["record_id"] for record in excluded_records],
        "candidate_ids": [],
    }


def link_progress_records(event, progress_records):
    """Link an event without guessing between multiple same-company applications."""
    candidates = _active_company_candidates(event, progress_records)
    position = str(event.get("position", "")).strip()
    if event["stage"] not in {"测评", "笔试"} and not position:
        return {
            "status": "ambiguous",
            "record_ids": [],
            "names": [],
            "candidate_ids": [record["record_id"] for record in candidates],
        }
    if not candidates:
        return {
            "status": "unmatched",
            "record_ids": [],
            "names": [],
            "candidate_ids": [],
        }

    position_matches = [
        record
        for record in candidates
        if _position_matches(position, record.get("fields", {}).get("投递岗位", ""))
    ]

    if event["stage"] == "笔试":
        if position and len(position_matches) == 1:
            return _linked(position_matches)
        if position and len(position_matches) > 1:
            return {
                "status": "ambiguous",
                "record_ids": [],
                "names": [],
                "candidate_ids": [record["record_id"] for record in position_matches],
            }
        if not position:
            same_company = _same_company_records(event, progress_records)
            terminal = [
                record for record in same_company
                if not _is_active_progress(record.get("fields", {}))
            ]
            return _linked(candidates, terminal)
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


def completion_progress_patch(current_status, current_completed_node, event_stage):
    """Return the exact progress mutation after an event is marked completed.

    Completion closes the current pending action and waits for recruiter feedback;
    it never predicts the next interview invitation. Manual terminal states and a
    later completed node are preserved.
    """
    current_node = str(current_completed_node or "").strip().replace("HR 面完成", "HR面完成")
    if current_status in MANUAL_PROGRESS_STATUSES:
        return {"latest_completed_node": current_node, "status": current_status}
    completed_node = EVENT_STAGE_TO_COMPLETED_NODE.get(str(event_stage).strip(), current_node)
    if (
        current_node in COMPLETED_NODE_ORDER
        and COMPLETED_NODE_ORDER[current_node] > COMPLETED_NODE_ORDER[completed_node]
    ):
        completed_node = current_node
    return {
        "latest_completed_node": completed_node,
        "status": "待反馈",
    }


def plan_completion(payload):
    """Plan the read-write-verify chain for one exact reminder completion."""
    if not isinstance(payload, dict) or not isinstance(payload.get("reminder"), dict):
        raise ValueError("completion plan requires a reminder object")
    reminder = payload["reminder"]
    reminder_id = str(reminder.get("record_id", reminder.get("id", ""))).strip()
    stage = str(reminder.get("环节", reminder.get("stage", ""))).strip()
    if not reminder_id or not stage:
        raise ValueError("completion reminder requires record_id and stage")
    raw_ids = reminder.get("求职记录ID", reminder.get("progress_ids", []))
    if isinstance(raw_ids, str):
        try:
            raw_ids = json.loads(raw_ids)
        except json.JSONDecodeError as exc:
            raise ValueError("completion progress_ids must be a JSON array") from exc
    progress_ids = [str(value).strip() for value in (raw_ids or []) if str(value).strip()]
    records = {}
    for record in payload.get("progress_records", []):
        record_id = str(record.get("record_id", record.get("id", ""))).strip()
        if record_id:
            records[record_id] = record.get("fields", record)
    missing = [record_id for record_id in progress_ids if record_id not in records]
    if missing:
        raise ValueError("completion requires current progress reads for: " + ",".join(missing))

    progress_patches = []
    for record_id in progress_ids:
        fields = records[record_id]
        current_status = str(fields.get("进展状态", fields.get("status", ""))).strip()
        current_node = str(fields.get(
            "最近完成节点",
            fields.get("最新完成节点", fields.get("latest_completed_node", "")),
        )).strip()
        patch = completion_progress_patch(current_status, current_node, stage)
        normalized_current_node = current_node.replace("HR 面完成", "HR面完成")
        if patch["status"] != current_status or patch["latest_completed_node"] != normalized_current_node:
            progress_patches.append({"record_id": record_id, "fields": patch})

    return {
        "action": "complete",
        "reminder_id": reminder_id,
        "required_reads": [
            {"action": "reminder.query_existing", "record_id": reminder_id},
            *({"action": "progress.read_current", "record_id": record_id} for record_id in progress_ids),
        ],
        "ordered_writes": [
            {"action": "reminder.update_completion", "record_id": reminder_id, "completion_status": "已完成"},
            *({
                "action": "progress.update",
                "id": patch["record_id"],
                **patch["fields"],
            } for patch in progress_patches),
        ],
        "ordered_verification": [
            {"action": "reminder.verify", "record_id": reminder_id, "completion_status": "已完成"},
            {"action": "progress.verify", "record_ids": progress_ids},
        ],
        "progress_patches": progress_patches,
    }


def build_reminder_record_fields(event, progress_links):
    """Map one normalized event to writable fields of the single reminder table."""
    record_ids = list(progress_links.get("record_ids", []))
    names = list(progress_links.get("names", []))
    start_time = event.get("start_time", "")
    end_time = event.get("end_time", "")
    if start_time not in (None, "") and end_time in (None, ""):
        end_time = _derive_end_time(start_time, duration_minutes_for_event(event))
    if start_time not in (None, "") and end_time not in (None, ""):
        _validate_time_order(start_time, end_time)
    _validate_optional_timestamp(event.get("deadline", ""), "deadline")
    link = _safe_http_url(event.get("link", ""))
    notes = _safe_notes(event.get("notes", ""))
    mode = normalize_delivery_mode(event.get("delivery_mode", event.get("exam_subtype", "")))
    if not mode and event.get("stage") not in {"测评", "笔试"} and start_time not in (None, ""):
        mode = "同步"
    return {
        "环节": event["stage"],
        "公司": _safe_plain_text(event["company"], 120),
        "业务线": _safe_plain_text(event.get("business_unit", ""), 120),
        "岗位": _safe_plain_text(event.get("position", ""), 160),
        "关联求职记录": _safe_plain_text("、".join(names), 500),
        "开始时间": start_time,
        "结束时间": end_time,
        "截止时间": event.get("deadline", ""),
        "预计时长（分钟）": _compact_number(duration_minutes_for_event(event)),
        "进行方式": mode,
        "平台": _safe_plain_text(event.get("platform", ""), 80),
        "链接": link,
        "注意事项": notes,
        "面试准备文档": "",
        "面试复盘文档": "",
        "完成状态": "待完成",
        "事件状态": "有效",
        "求职记录ID": json.dumps(
            record_ids,
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        "来源邮件ID": event["source_mail_id"],
        "关联邮件ID": json.dumps(
            [event["source_mail_id"]],
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        "日历状态": "待安排",
        "已建日程ID": "",
    }


def normalize_delivery_mode(value):
    """Return the v2 Base option for synchronous/asynchronous delivery."""
    normalized = _normalized(value)
    if normalized in {"同步", "同步笔试", "synchronous", "live"}:
        return "同步"
    if normalized in {"异步", "异步笔试", "asynchronous", "async"}:
        return "异步"
    return ""


def default_duration_minutes(stage):
    """Return the product default used when an end time is not provided."""
    return 90 if str(stage).strip() in {"测评", "笔试"} else 60


def duration_minutes_for_event(event):
    value = event.get("duration_minutes", event.get("estimated_duration", ""))
    if value in (None, ""):
        return default_duration_minutes(event.get("stage", ""))
    if isinstance(value, (int, float)):
        if value <= 0:
            raise ValueError("duration must be positive")
        return float(value)
    text = unicodedata.normalize("NFKC", str(value)).lower()
    numbers = [float(number) for number in re.findall(r"\d+(?:\.\d+)?", text)]
    if not numbers:
        raise ValueError("explicit duration could not be parsed")
    hour_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:小时|hours?|hrs?|hr)", text)
    minute_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:分钟|minutes?|mins?|min)", text)
    if hour_match and minute_match:
        duration = float(hour_match.group(1)) * 60 + float(minute_match.group(1))
    else:
        duration = max(numbers)
        if hour_match:
            duration *= 60
    if duration <= 0:
        raise ValueError("duration must be positive")
    return duration


def _compact_number(value):
    value = float(value)
    return int(value) if value.is_integer() else value


def normalize_deadline(value, received_at=""):
    """Normalize explicit, date-only, hour-relative and China-workday deadlines."""
    if isinstance(value, (int, float)):
        _validate_optional_timestamp(value, "deadline")
        return value
    text = unicodedata.normalize("NFKC", str(value or "")).strip()
    if not text:
        return ""
    relative_hours = re.search(r"([一二两三四五六七八九十百\d]+)\s*(?:个)?小时内", text)
    relative_workdays = re.search(r"([一二两三四五六七八九十百\d]+)\s*(?:个)?工作日内", text)
    if relative_hours or relative_workdays:
        if received_at in (None, ""):
            raise ValueError("relative deadline requires received_at")
        received = _parse_datetime(received_at).astimezone(SHANGHAI)
        amount = _parse_positive_integer((relative_hours or relative_workdays).group(1))
        if relative_hours:
            return (received + timedelta(hours=amount)).isoformat()
        target = _add_china_workdays(received.date(), amount)
        return datetime.combine(target, time(23, 59), tzinfo=SHANGHAI).isoformat()
    # Date-only phrases may include surrounding words such as “请于…日前完成”.
    # Do not collapse a timestamp that actually contains a clock time.
    if not re.search(r"(?:T\d|\d{1,2}:\d{2}|\d{1,2}\s*[时点])", text):
        full_date = re.search(r"(?<!\d)(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?", text)
        if full_date:
            target = date(*(int(part) for part in full_date.groups()))
            return datetime.combine(target, time(23, 59), tzinfo=SHANGHAI).isoformat()
        partial_date = re.search(r"(?<!\d)(\d{1,2})月(\d{1,2})(?:日)?", text)
        if partial_date:
            if received_at in (None, ""):
                raise ValueError("date-only deadline without a year requires received_at")
            received = _parse_datetime(received_at).astimezone(SHANGHAI)
            target = date(received.year, int(partial_date.group(1)), int(partial_date.group(2)))
            if target < received.date():
                target = date(received.year + 1, target.month, target.day)
            return datetime.combine(target, time(23, 59), tzinfo=SHANGHAI).isoformat()
    _validate_optional_timestamp(text, "deadline")
    return text


def _parse_datetime(value):
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / (1000 if value > 10_000_000_000 else 1), tz=SHANGHAI)
    parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    return parsed.replace(tzinfo=SHANGHAI) if parsed.tzinfo is None else parsed


def _parse_positive_integer(text):
    if str(text).isdigit():
        value = int(text)
    else:
        digits = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
        raw = str(text)
        if raw == "十": value = 10
        elif "十" in raw:
            left, right = raw.split("十", 1)
            value = (digits.get(left, 1) * 10) + digits.get(right, 0)
        elif raw == "百": value = 100
        else: value = digits.get(raw, 0)
    if value <= 0:
        raise ValueError("relative deadline must be positive")
    return value


def _load_workday_calendar():
    payload = json.loads(WORKDAY_CALENDAR_FILE.read_text(encoding="utf-8"))
    return {
        "covered_years": {int(year) for year in payload.get("covered_years", [])},
        "holidays": {date.fromisoformat(value) for value in payload.get("holidays", [])},
        "working_weekends": {date.fromisoformat(value) for value in payload.get("working_weekends", [])},
    }


def _add_china_workdays(start_date, amount):
    calendar = _load_workday_calendar()
    cursor = start_date
    counted = 0
    while counted < amount:
        cursor += timedelta(days=1)
        if cursor.year not in calendar["covered_years"]:
            raise ValueError(f"China workday calendar does not cover {cursor.year}")
        if cursor in calendar["working_weekends"] or (
            cursor.weekday() < 5 and cursor not in calendar["holidays"]
        ):
            counted += 1
    return cursor


def _derive_end_time(start_time, duration_minutes):
    if isinstance(start_time, (int, float)):
        scale = 1000 if start_time > 10_000_000_000 else 1
        return start_time + duration_minutes * 60 * scale
    text = str(start_time).strip()
    try:
        start = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("start_time must be an ISO timestamp or Unix time") from exc
    return (start + timedelta(minutes=duration_minutes)).isoformat()


def _parse_timestamp(value):
    if isinstance(value, (int, float)):
        return float(value) / (1000 if value > 10_000_000_000 else 1)
    parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    return parsed.timestamp()


def _validate_time_order(start, end):
    try:
        if _parse_timestamp(end) <= _parse_timestamp(start):
            raise ValueError("end_time must be later than start_time")
    except (TypeError, ValueError) as exc:
        if str(exc) == "end_time must be later than start_time":
            raise
        raise ValueError("start_time and end_time must be valid timestamps") from exc


def _validate_optional_timestamp(value, field_name):
    if value in (None, ""):
        return
    try:
        _parse_timestamp(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a valid timestamp") from exc


def _safe_http_url(value):
    text = str(value or "").strip()
    if not text:
        return ""
    if len(text) > 2000 or re.search(r"[\x00-\x20\x7f]", text):
        raise ValueError("link is invalid or too long")
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("link must be an absolute HTTP(S) URL")
    return text


def _safe_notes(value):
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", str(value or ""))
    text = re.sub(r"(?:Message-ID|In-Reply-To|References)\s*:[^\n]+", "", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()[:1000]


def _safe_plain_text(value, limit):
    text = re.sub(r"[\x00-\x1f\x7f]", " ", str(value or ""))
    return re.sub(r"\s+", " ", text).strip()[:limit]


class _ListRepository:
    def __init__(self, records):
        self.records = records

    def find_by_source_mail_id(self, source_mail_id):
        matches = self.find_all_by_source_mail_id(source_mail_id)
        return matches[0] if len(matches) == 1 else None

    def find_all_by_source_mail_id(self, source_mail_id):
        matches = []
        for record in self.records:
            fields = record.get("fields", record)
            identifiers = {str(fields.get("来源邮件ID", "")).strip()}
            raw_related = fields.get("关联邮件ID", "")
            try:
                related = json.loads(raw_related) if isinstance(raw_related, str) else raw_related
            except json.JSONDecodeError:
                related = []
            if isinstance(related, list):
                identifiers.update(str(value).strip() for value in related)
            if source_mail_id in identifiers:
                matches.append(record)
        return matches

    def find_assessments_by_company(self, company):
        company_key = _normalized(company)
        is_pinduoduo = any(
            marker in company_key for marker in ("拼多多", "pinduoduo", "pdd")
        )
        return [
            record for record in self.records
            if (
                _normalized(record.get("fields", record).get("公司")) == company_key
                or (
                    is_pinduoduo
                    and any(
                        marker in _normalized(record.get("fields", record).get("公司"))
                        for marker in ("拼多多", "pinduoduo", "pdd")
                    )
                )
            )
            and str(record.get("fields", record).get("环节", "")).strip() == "测评"
            and str(record.get("fields", record).get("事件状态", "有效")).strip() != "已取消"
        ]


def plan_event(payload):
    """Return a compact, no-write plan for one extracted candidate."""
    if not isinstance(payload, dict) or not isinstance(payload.get("extracted"), dict):
        raise ValueError("plan input requires an extracted object")
    event = route_event(payload["extracted"])
    if event["intake_action"] == "skip_processed":
        outcome = {
            "preliminary_time_selection": "skipped_preliminary",
            "not_recruiting_event": "not_recruiting",
        }.get(event.get("skip_reason"), "processed")
        return {
            "action": "skip_and_mark_processed", "event": event,
            "mail_outcome": outcome,
            "required_actions": [{
                "action": "mail.mark_processed",
                "source_mail_id": event["source_mail_id"],
                "required_before_completion": True,
            }],
            "completion_condition": {
                "processed_source_mail_id": event["source_mail_id"],
                "then_record_mail_outcome": outcome,
            },
            "forbidden_writes": ["base", "progress", "calendar", "notification"],
        }
    if event["intake_action"] == "confirm":
        return {"action": "confirm", "reason": event.get("skip_reason", "classification_ambiguous"), "event": event}
    existing_events = payload.get("existing_events", [])
    progress_records = payload.get("progress_records", [])
    if not isinstance(existing_events, list) or not isinstance(progress_records, list):
        raise ValueError("existing_events and progress_records must be arrays")
    decision = decide_event_upsert(event, _ListRepository(existing_events))
    if decision["action"] == "unresolved_reschedule":
        outcomes = payload.get("source_outcomes", {})
        if isinstance(outcomes, list):
            outcomes = {str(item.get("source_mail_id", "")): item.get("outcome", "") for item in outcomes if isinstance(item, dict)}
        original_outcome = str(outcomes.get(decision.get("canonical_source_mail_id", ""), "")) if isinstance(outcomes, dict) else ""
        if original_outcome == "skipped_preliminary" and event.get("start_time") not in (None, ""):
            decision = {"action": "create", "canonical_source_mail_id": event["source_mail_id"]}
    if decision["action"] == "create" and not event.get("company"):
        return {"action": "confirm", "reason": "company_required", "event": event, "decision": decision}
    if decision["action"] == "create":
        missing = _required_confirmation_reason(event)
        if missing:
            return {
                "action": "confirm",
                "reason": missing,
                "event": event,
                "decision": decision,
            }
    if decision["action"] != "create":
        if decision["action"].startswith("unresolved_"):
            return {
                "action": "confirm",
                "reason": decision["action"],
                "event": event,
                "decision": decision,
            }
        original = next(
            (record for record in existing_events if record.get("record_id") == decision.get("record_id")),
            None,
        )
        original_fields = original.get("fields", original) if original else {}
        inherited = dict(event)
        inherited["company"] = inherited.get("company") or original_fields.get("公司", "")
        inherited["position"] = inherited.get("position") or original_fields.get("岗位", "")
        inherited["stage"] = original_fields.get("环节", inherited.get("stage", ""))
        result = {"action": decision["action"], "event": inherited, "decision": decision}
        if decision["action"] in {"reschedule", "cancel", "append_reminder", "update_retest"}:
            result["base_plan"] = {
                "action": "update", "record_id": decision.get("record_id", ""),
                "idempotency_key": hashlib.sha256(f'base-update:{decision["action"]}:{event["source_mail_id"]}'.encode()).hexdigest()[:40],
                "preserve_fields": ["来源邮件ID", "求职记录ID", "完成状态"],
            }
        related = event["source_mail_id"]
        if decision["action"] == "reschedule":
            start = event.get("start_time")
            metadata_patch = {
                key: value for key, value in {
                    "平台": _safe_plain_text(event.get("platform", ""), 80),
                    "链接": _safe_http_url(event.get("link", "")),
                    "注意事项": _safe_notes(event.get("notes", "")),
                }.items() if value not in (None, "")
            }
            if start in (None, ""):
                if event.get("deadline") not in (None, "") and normalize_delivery_mode(original_fields.get("进行方式", "")) == "异步":
                    old_end = original_fields.get("结束时间")
                    if old_end not in (None, "") and _parse_timestamp(old_end) > _parse_timestamp(event["deadline"]):
                        return {**result, "action": "confirm", "reason": "existing_plan_after_new_deadline"}
                    result["patch"] = {
                        "截止时间": event["deadline"],
                        **metadata_patch,
                        "关联邮件ID": _append_related_id(original_fields, related),
                    }
                    event_id = str(original_fields.get("已建日程ID", "")).strip()
                    result["calendar_patch"] = (
                        {"action": "update_metadata", "event_id": event_id, "description": _calendar_description({**original_fields, **metadata_patch}, original_fields.get("来源邮件ID", related)), "idempotency_key": _calendar_operation_key("update_metadata", event["source_mail_id"])}
                        if event_id and metadata_patch else {"action": "none", "reason": "deadline_only_update"}
                    )
                    return result
                return {**result, "action": "confirm", "reason": "fixed_start_time_required"}
            duration_event = dict(inherited)
            if event.get("duration_minutes", event.get("estimated_duration", "")) in (None, ""):
                old_start, old_end = original_fields.get("开始时间"), original_fields.get("结束时间")
                if old_start not in (None, "") and old_end not in (None, ""):
                    duration_event["duration_minutes"] = (_parse_timestamp(old_end) - _parse_timestamp(old_start)) / 60
            end = event.get("end_time") or _derive_end_time(start, duration_minutes_for_event(duration_event))
            _validate_time_order(start, end)
            _validate_optional_timestamp(event.get("deadline", ""), "deadline")
            if original_fields.get("开始时间") not in (None, "") and not str(original_fields.get("已建日程ID", "")).strip():
                return {**result, "action": "confirm", "reason": "calendar_event_id_required"}
            result["patch"] = {
                "开始时间": start, "结束时间": end,
                **metadata_patch,
                **({"截止时间": event["deadline"]} if event.get("deadline") not in (None, "") else {}),
                "关联邮件ID": _append_related_id(original_fields, related),
            }
            event_id = str(original_fields.get("已建日程ID", "")).strip()
            result["calendar_patch"] = {
                "action": "update" if event_id else "create",
                **({"event_id": event_id} if event_id else {}),
                "start_time": start, "end_time": end,
                "description": _calendar_description({**original_fields, **metadata_patch}, original_fields.get("来源邮件ID", related)),
                "idempotency_key": _calendar_operation_key("update" if event_id else "create", event["source_mail_id"]),
                **({
                    "success_patch": {"日历状态": "已建日程"},
                    "result_mapping": {"event_id": "已建日程ID"},
                } if not event_id else {}),
            }
            result["execution_graph"] = {
                "ordered_core": ["base.update_original", "calendar.update_original", "base.patch_calendar_result"],
                "canonical_source_mail_id": decision.get("canonical_source_mail_id", ""),
                "forbidden_actions": ["base.create", "calendar.create_duplicate", "base.replace_source_mail_id"],
            }
        elif decision["action"] == "cancel":
            result["patch"] = {"事件状态": "已取消", "关联邮件ID": _append_related_id(original_fields, related)}
            event_id = str(original_fields.get("已建日程ID", "")).strip()
            result["calendar_patch"] = (
                {"event_id": event_id, "action": "cancel", "idempotency_key": _calendar_operation_key("cancel", event["source_mail_id"]), "success_patch": {"日历状态": "已取消"}}
                if event_id else {"action": "none", "success_patch": {"日历状态": "已取消"}}
            )
            result["progress_patch"] = {"action": "no_change"}
        elif decision["action"] == "append_reminder":
            result["patch"] = {"关联邮件ID": _append_related_id(original_fields, related)}
            result["notification"] = {"deduplicated": True, "record_id": decision.get("record_id", "")}
        if decision["action"] == "update_retest":
            _validate_optional_timestamp(event.get("deadline", ""), "deadline")
            result["patch"] = {
                key: value for key, value in {
                    "链接": _safe_http_url(event.get("link", "")),
                    "截止时间": event.get("deadline", ""),
                }.items() if value not in (None, "")
            }
            result["patch"]["关联邮件ID"] = _append_related_id(original_fields, event["source_mail_id"])
        return result
    links = link_progress_records(event, progress_records)
    if links["status"] == "ambiguous":
        return {
            "action": "confirm",
            "reason": "position_or_progress_ambiguous",
            "event": event,
            "links": links,
        }
    linked_ids = set(links.get("record_ids", []))
    same_progress_events = [
        record for record in existing_events
        if linked_ids.intersection(_record_progress_ids(record.get("fields", record)))
    ]
    event = assign_default_interview_stage(event, same_progress_events)
    fields = build_reminder_record_fields(event, links)
    progress_by_id = {record.get("record_id"): record.get("fields", {}) for record in progress_records}
    progress_patches = [
        {
            "record_id": record_id,
            "fields": {"进展状态": next_progress_status(
                str(progress_by_id.get(record_id, {}).get("进展状态", "")),
                event["stage"],
            )},
        }
        for record_id in links.get("record_ids", [])
        if next_progress_status(
            str(progress_by_id.get(record_id, {}).get("进展状态", "")),
            event["stage"],
        ) != str(progress_by_id.get(record_id, {}).get("进展状态", ""))
    ]
    return {
        "action": "create",
        "event": event,
        "links": links,
        "fields": fields,
        "base_plan": {
            "action": "create",
            "idempotency_key": hashlib.sha256(f'base:{event["source_mail_id"]}'.encode()).hexdigest()[:40],
            "client_token": hashlib.sha256(f'base:{event["source_mail_id"]}'.encode()).hexdigest()[:32],
            "lookup_field": "来源邮件ID",
            "lookup_value": event["source_mail_id"],
        },
        "progress_patches": progress_patches,
        "progress_read_plan": [
            {
                "action": "progress.read_current",
                "record_id": patch["record_id"],
                "required_after": "base.write",
                "required_before": "progress.update",
                "recompute_from_fresh_state": True,
            }
            for patch in progress_patches
        ],
        "required_external_reads": [{
            "action": "progress.query",
            "required_before": "base.write",
            "reason": (
                "company_level_written_exam_requires_all_active_record_ids"
                if event["stage"] == "笔试" and not str(event.get("position", "")).strip()
                else "exact_progress_link_requires_current_records"
            ),
            "skip_only_when_progress_sync_is_unconfigured": True,
        }],
        "execution_graph": {
            "ordered_core": ["base.write", "progress.read_current", "progress.update", "calendar.create_or_skip", "base.patch_calendar_result"],
            "verify_after_core": ["reminder.verify", "progress.verify", "calendar.verify_or_result", "base.verify_views"],
            "notification_after_core_verification": True,
            "rollback_on_notification_failure": False,
        },
        "calendar_plan": (
            {
                "action": "create",
                "start_time": fields["开始时间"],
                "end_time": fields["结束时间"],
                "summary": fields.get("安排名称", "") or f'{fields["公司"]}－{fields["岗位"]}－{fields["环节"]}'.replace("－－", "－"),
                "description": _calendar_description(fields, event["source_mail_id"]),
                "idempotency_key": hashlib.sha256(f'calendar:{event["source_mail_id"]}'.encode()).hexdigest()[:40],
                "conflict_policy": "create_at_recruiter_time_and_warn",
                "success_patch": {"日历状态": "已建日程"},
                "result_mapping": {"event_id": "已建日程ID"},
            }
            if fields["开始时间"] not in (None, "") else {"action": "none", "reason": "planned_start_not_selected"}
        ),
    }


def _calendar_description(fields, source_mail_id):
    lines = []
    if fields.get("平台"): lines.append(f'平台：{fields["平台"]}')
    if fields.get("链接"): lines.append(f'参与链接：{fields["链接"]}')
    if fields.get("注意事项"): lines.append(f'提醒：{fields["注意事项"]}')
    marker = hashlib.sha256(f'calendar:{source_mail_id}'.encode()).hexdigest()[:40]
    lines.append(f'OfferLoop idempotency {marker}')
    return "\n".join(lines)


def _calendar_operation_key(action, source_mail_id):
    return hashlib.sha256(f'calendar-{action}:{source_mail_id}'.encode()).hexdigest()[:40]


def _find_source_matches(repository, source_mail_id):
    finder = getattr(repository, "find_all_by_source_mail_id", None)
    if finder is not None:
        return list(finder(source_mail_id) or [])
    match = repository.find_by_source_mail_id(source_mail_id)
    return [match] if match is not None else []


def _required_confirmation_reason(event):
    raw_uncertain = event.get("uncertain_fields") or []
    if isinstance(raw_uncertain, str):
        raw_uncertain = [raw_uncertain]
    uncertain = {str(value).strip() for value in raw_uncertain}
    stage = str(event.get("stage", "")).strip()
    start = event.get("start_time")
    critical_fields = {"company", "classification"}
    if stage not in {"测评", "笔试"}:
        critical_fields.update({"position", "start_time"})
    critical = uncertain.intersection(critical_fields)
    if critical:
        return "critical_fields_uncertain:" + ",".join(sorted(critical))
    if stage not in {"测评", "笔试"}:
        if not str(event.get("position", "")).strip():
            return "interview_position_required"
        if start in (None, ""):
            return "fixed_start_time_required"
        return ""
    mode = normalize_delivery_mode(
        event.get("delivery_mode", event.get("exam_subtype", ""))
    )
    if not mode:
        return "delivery_mode_required"
    if mode == "同步" and start in (None, ""):
        return "fixed_start_time_required"
    if mode == "异步" and event.get("deadline") in (None, ""):
        return "true_deadline_required"
    return ""


def _record_progress_ids(fields):
    raw = fields.get("求职记录ID", "")
    try:
        values = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        values = []
    return {str(value) for value in values or []}


def _append_related_id(fields, source_mail_id):
    raw = fields.get("关联邮件ID", "")
    try:
        values = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        values = []
    values = [str(value) for value in (values or []) if str(value).strip()]
    if source_mail_id not in values:
        values.append(source_mail_id)
    return json.dumps(values, ensure_ascii=False, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "completion-plan"))
    parser.add_argument("--input", default="-", help="JSON file or - for stdin")
    args = parser.parse_args()
    try:
        raw = (
            sys.stdin.read()
            if args.input == "-"
            else Path(args.input).read_text(encoding="utf-8")
        )
        payload = json.loads(raw)
        result = plan_completion(payload) if args.command == "completion-plan" else plan_event(payload)
        print(json.dumps({"status": "ok", "data": result}, ensure_ascii=False, separators=(",", ":")))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
