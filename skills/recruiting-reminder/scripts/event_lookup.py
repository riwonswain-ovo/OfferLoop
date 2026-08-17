#!/usr/bin/env python3
"""Resolve interview events and build idempotent document backfill plans.

The script is deliberately offline. The calling Agent reads the minimum Base
records through lark-base, passes sanitized JSON here, then executes returned
operations through lark-base after user confirmation.
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


CONTRACT_VERSION = 2
INTERVIEW_STAGES = {"群面", "一面", "二面", "三面", "HR面"}
UNKNOWN_STAGE = "面试（轮次待确认）"
FIELDS_BY_KIND = {
    "prep": "面试准备文档",
    "review": "面试复盘文档",
}
RUN_ID_RE = re.compile(
    r"^(?:interview-prep|talk-review)-\d{14}-[a-z0-9]{8}$"
)


def normalize_text(value):
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    return re.sub(r"[\W_]+", "", text, flags=re.UNICODE)


def _position_matches(left, right):
    a = normalize_text(left)
    b = normalize_text(right)
    return bool(a and b and (a in b or b in a))


def _parse_time(value):
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        if number > 10_000_000_000:
            number /= 1000
        return datetime.fromtimestamp(number).astimezone()
    text = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _minimal_record(record):
    fields = record.get("fields", {})
    return {
        "record_id": str(record.get("record_id", "")),
        "company": str(fields.get("公司", "") or ""),
        "position": str(fields.get("岗位", "") or ""),
        "stage": str(fields.get("环节", "") or ""),
        "start_time": fields.get("开始时间", ""),
        "source_mail_id": str(fields.get("来源邮件ID", "") or ""),
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
            if str(record.get("fields", {}).get("来源邮件ID", "")).strip()
            == source_mail_id
        ]
        if source_matches:
            return {
                "match_status": (
                    "found" if len(source_matches) == 1 else "ambiguous"
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

    stage = str(query.get("stage", "")).strip()
    if stage:
        matches = [
            record
            for record in matches
            if str(record.get("fields", {}).get("环节", "")).strip() == stage
        ]

    query_time = _parse_time(query.get("start_time"))
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
    if not record_id:
        raise ValueError("record_id is required")
    if stage == "笔试":
        raise ValueError("document fields must remain empty for exam events")
    if stage not in INTERVIEW_STAGES | {UNKNOWN_STAGE}:
        raise ValueError("unsupported interview stage")
    current = payload.get("current", {})
    if not isinstance(current, dict):
        raise ValueError("current must be a JSON object")
    field = FIELDS_BY_KIND[kind]
    targets = [("reminder", record_id, current.get("value", ""))]

    operations = []
    conflicts = []
    already_synced = []
    for target, record_id, value in targets:
        existing = str(value or "").strip()
        if existing == document_url:
            already_synced.append(record_id)
        elif existing:
            conflicts.append(
                {
                    "target": target,
                    "record_id": record_id,
                    "existing_url": existing,
                }
            )
        else:
            operations.append(
                {
                    "target": target,
                    "record_id": record_id,
                    "field": field,
                    "value": document_url,
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
