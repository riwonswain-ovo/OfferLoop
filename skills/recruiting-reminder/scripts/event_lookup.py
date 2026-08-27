#!/usr/bin/env python3
"""Resolve interview events and build idempotent document backfill plans.

The script is deliberately offline. The calling Agent reads the minimum Base
records through lark-base, passes sanitized JSON here, then executes returned
operations through lark-base according to the consumer-specific confirmation
rule in references/event-contract.md.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import urlparse
from zoneinfo import ZoneInfo


CONTRACT_VERSION = 4
INTERVIEW_STAGES = {"群面", "一面", "二面", "三面", "HR面", "面试"}
UNKNOWN_STAGE = "面试（轮次待确认）"
FIELDS_BY_KIND = {
    "prep": "面试准备文档",
    "review": "面试复盘文档",
}
RUN_ID_RE = re.compile(
    r"^(?:interview-prep|talk-review)-\d{14}-[a-z0-9]{8}$"
)
RECORD_ID_RE = re.compile(r"^rec[A-Za-z0-9_-]+$")
SHANGHAI = ZoneInfo("Asia/Shanghai")


def normalize_text(value):
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    return re.sub(r"[\W_]+", "", text, flags=re.UNICODE)


def _position_matches(left, right):
    a = normalize_text(left)
    b = normalize_text(right)
    return bool(a and b and a == b)


STAGE_ALIASES = {
    "hr面": "HR面", "hrinterview": "HR面", "第一轮": "一面", "第一轮面试": "一面",
    "第1轮": "一面", "第二轮": "二面", "第二轮面试": "二面", "第2轮": "二面",
    "第三轮": "三面", "第三轮面试": "三面", "第3轮": "三面", "无领导小组": "群面",
}


def normalize_stage(value):
    raw = str(value or "").strip()
    return STAGE_ALIASES.get(normalize_text(raw), raw)


def _parse_time(value):
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        if number > 10_000_000_000:
            number /= 1000
        return datetime.fromtimestamp(number, tz=SHANGHAI)
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=SHANGHAI)
        return parsed.astimezone(SHANGHAI)
    except ValueError:
        return None


def _source_mail_ids(fields):
    values = [str(fields.get("来源邮件ID", "") or "").strip()]
    raw = fields.get("关联邮件ID", "")
    try:
        related = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        related = []
    if isinstance(related, list):
        values.extend(str(value).strip() for value in related)
    return {value for value in values if value}


def _minimal_record(record):
    fields = record.get("fields", {})
    return {
        "record_id": str(record.get("record_id", "")),
        "company": str(fields.get("公司", "") or ""),
        "position": str(fields.get("岗位", "") or ""),
        "stage": str(fields.get("环节", "") or ""),
        "start_time": fields.get("开始时间", ""),
        "source_mail_id": str(fields.get("来源邮件ID", "") or ""),
        "event_status": str(fields.get("事件状态", "有效") or "有效"),
    }


def _valid_records(records):
    if not isinstance(records, list):
        raise ValueError("records must be a JSON array")
    result = []
    for record in records:
        if not isinstance(record, dict):
            raise ValueError("each record must be a JSON object")
        if not str(record.get("record_id", "")).strip():
            raise ValueError("each record requires record_id")
        if not isinstance(record.get("fields", {}), dict):
            raise ValueError("record fields must be a JSON object")
        fields = record.get("fields", {})
        if (str(fields.get("事件状态", "有效")).strip() != "已取消"
                and normalize_stage(fields.get("环节")) not in {"测评", "笔试"}):
            result.append(record)
    return result


def resolve_event(payload):
    if not isinstance(payload, dict):
        raise ValueError("resolve input must be a JSON object")
    query = payload.get("query", {})
    if not isinstance(query, dict):
        raise ValueError("query must be a JSON object")
    records = _valid_records(payload.get("records", []))

    explicit_id = str(query.get("record_id", "")).strip()
    if explicit_id:
        matches = [
            record for record in records if record["record_id"] == explicit_id
        ]
        status = "found" if len(matches) == 1 else "missing"
        return {
            "match_status": status,
            "match_reason": "explicit_record_id",
            "candidates": [_minimal_record(record) for record in matches],
        }

    source_mail_id = str(query.get("source_mail_id", "")).strip()
    if source_mail_id:
        source_matches = [
            record
            for record in records
            if source_mail_id in _source_mail_ids(record.get("fields", {}))
        ]
        return {
            "match_status": (
                "missing" if not source_matches
                else "found" if len(source_matches) == 1 else "ambiguous"
            ),
            "match_reason": "source_mail_id",
            "candidates": [
                _minimal_record(record) for record in source_matches
            ],
        }

    company = normalize_text(query.get("company"))
    if not company:
        return {
            "match_status": "missing",
            "match_reason": "company_required",
            "candidates": [],
        }
    matches = [
        record
        for record in records
        if normalize_text(record.get("fields", {}).get("公司")) == company
    ]

    position = str(query.get("position", "")).strip()
    if position:
        matches = [
            record
            for record in matches
            if _position_matches(
                position, record.get("fields", {}).get("岗位", "")
            )
        ]

    stage = normalize_stage(query.get("stage", ""))
    if stage:
        matches = [
            record
            for record in matches
            if normalize_stage(record.get("fields", {}).get("环节", "")) == stage
        ]

    raw_query_time = query.get("start_time")
    query_time = _parse_time(raw_query_time)
    if raw_query_time not in (None, "") and query_time is None:
        raise ValueError("start_time must be a valid ISO timestamp or Unix time")
    if query_time:
        timed = []
        for record in matches:
            candidate_time = _parse_time(
                record.get("fields", {}).get("开始时间")
            )
            if candidate_time and abs(
                (candidate_time - query_time).total_seconds()
            ) <= 36 * 60 * 60:
                timed.append(record)
        matches = timed

    return {
        "match_status": (
            "missing" if not matches else "found" if len(matches) == 1 else "ambiguous"
        ),
        "match_reason": "normalized_fields",
        "candidates": [_minimal_record(record) for record in matches],
    }


def build_backfill_plan(payload):
    if not isinstance(payload, dict):
        raise ValueError("backfill input must be a JSON object")
    kind = payload.get("kind")
    if kind not in FIELDS_BY_KIND:
        raise ValueError("kind must be prep or review")
    run_id = str(payload.get("run_id", ""))
    if not RUN_ID_RE.fullmatch(run_id):
        raise ValueError("run_id does not match the requested artifact kind")
    if kind == "prep" and not run_id.startswith("interview-prep-"):
        raise ValueError("prep backfill requires an interview-prep run_id")
    if kind == "review" and not run_id.startswith("talk-review-"):
        raise ValueError("review backfill requires a talk-review run_id")
    artifact_status = str(payload.get("artifact_status", "")).strip()
    if kind == "review" and artifact_status not in {"completed", "incomplete"}:
        raise ValueError(
            "review backfill requires artifact_status completed or incomplete"
        )
    document_url = str(payload.get("document_url", "")).strip()
    parsed_url = urlparse(document_url)
    if (
        parsed_url.scheme != "https"
        or not parsed_url.netloc
        or parsed_url.username
        or parsed_url.password
    ):
        raise ValueError("document_url must be an absolute HTTPS URL")

    event = payload.get("event")
    if not isinstance(event, dict):
        raise ValueError("event must be a JSON object")
    record_id = str(event.get("record_id", "")).strip()
    stage = str(event.get("stage", "")).strip()
    if not RECORD_ID_RE.fullmatch(record_id):
        raise ValueError("record_id must be a Feishu Base record ID")
    if stage in {"测评", "笔试"}:
        raise ValueError("document fields must remain empty for exam events")
    if stage not in INTERVIEW_STAGES | {UNKNOWN_STAGE}:
        raise ValueError("unsupported interview stage")
    current = payload.get("current", {})
    if not isinstance(current, dict):
        raise ValueError("current must be a JSON object")
    field = FIELDS_BY_KIND[kind]
    operations = []
    conflicts = []
    already_synced = []
    existing = str(current.get("value", "") or "").strip()
    if existing and existing != document_url:
        conflicts.append(
            {
                "target": "reminder",
                "record_id": record_id,
                "field": field,
                "reason": "document_url_conflict",
                "existing_url": existing,
            }
        )

    patch = {}
    if not existing:
        patch[field] = document_url
    elif existing == document_url:
        already_synced.append(record_id)

    progress_reconcile_expected = False
    if kind == "review" and artifact_status == "completed":
        event_status = str(event.get("event_status", "") or "").strip()
        completion_status = str(current.get("completion_status", "") or "").strip()
        if event_status != "有效":
            conflicts.append(
                {
                    "target": "reminder",
                    "record_id": record_id,
                    "field": "事件状态",
                    "reason": "event_not_active",
                    "existing_value": event_status,
                }
            )
        elif completion_status == "待完成":
            patch["完成状态"] = "已完成"
            progress_reconcile_expected = True
        elif completion_status != "已完成":
            conflicts.append(
                {
                    "target": "reminder",
                    "record_id": record_id,
                    "field": "完成状态",
                    "reason": "completion_status_conflict",
                    "existing_value": completion_status,
                }
            )

    if patch and not conflicts:
        operations.append(
            {
                "target": "reminder",
                "record_id": record_id,
                "field": field,
                "value": document_url,
                "fields": patch,
                "run_id": run_id,
            }
        )
    return {
        "plan_status": "conflict" if conflicts else "ready",
        "field": field,
        "operations": [] if conflicts else operations,
        "blocked_operations": operations if conflicts else [],
        "already_synced_record_ids": already_synced,
        "conflicts": conflicts,
        "progress_reconcile_expected": (
            progress_reconcile_expected and not conflicts
        ),
    }


def _read_payload(path):
    text = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    return json.loads(text)


def _parser():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    resolve = subparsers.add_parser("resolve")
    resolve.add_argument("--input", default="-", help="JSON file or - for stdin")
    resolve.add_argument("--json", action="store_true")
    backfill = subparsers.add_parser("backfill")
    backfill.add_argument("--input", default="-", help="JSON file or - for stdin")
    backfill.add_argument("--json", action="store_true")
    return parser


def main():
    args = _parser().parse_args()
    try:
        payload = _read_payload(args.input)
        data = (
            resolve_event(payload)
            if args.command == "resolve"
            else build_backfill_plan(payload)
        )
        print(
            json.dumps(
                {
                    "schema_version": CONTRACT_VERSION,
                    "status": "ok",
                    "data": data,
                },
                ensure_ascii=False,
            )
        )
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(
            json.dumps(
                {
                    "schema_version": CONTRACT_VERSION,
                    "status": "error",
                    "error": str(exc),
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(2)


if __name__ == "__main__":
    main()
