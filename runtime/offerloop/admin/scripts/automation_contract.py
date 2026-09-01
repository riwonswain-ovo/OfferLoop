#!/usr/bin/env python3
"""Build and validate the public OfferLoop automation inventory.

The validator accepts only sanitized workflow and trigger metadata. It never
needs Base tokens, record IDs, app secrets, OpenAPI keys, or workflow secrets.
"""

from __future__ import annotations

import argparse
import json
import sys


ENTERPRISE_CHILD_TABLES = (
    "互联网",
    "金融银行",
    "外企",
    "央国企",
    "其他私企",
)
ENTERPRISE_PROGRESS_TITLE = "OfferLoop｜投递状态双向同步求职进展"
REMINDER_PROGRESS_TITLE = "OfferLoop｜笔面试安排完成状态实时同步"
DAILY_CHECKIN_TRIGGER = "offerloop-daily-checkin"
DAILY_CHECKIN_CRON = "10 22 * * *"
DAILY_CHECKIN_TIMEZONE = "Asia/Shanghai"


def enterprise_workflow_titles() -> tuple[str, ...]:
    titles = [ENTERPRISE_PROGRESS_TITLE]
    for table in ENTERPRISE_CHILD_TABLES:
        titles.extend(
            (
                f"投递进度同步：{table} → 主表",
                f"投递进度同步：主表 → {table}",
            )
        )
    return tuple(titles)


def build_plan(daily_checkin: str) -> dict:
    if daily_checkin not in {"enabled", "disabled"}:
        raise ValueError("daily_checkin must be enabled or disabled")
    return {
        "schema_version": 1,
        "status": "planned",
        "online_writes": False,
        "workflow_count": 12,
        "enterprise_workflows": [
            {
                "title": title,
                "status": "enabled",
                "trigger_type": "SetRecordTrigger",
                "must_exclude": ["automationBatchUpdate"],
                **(
                    {"record_locator_transport": "query"}
                    if title == ENTERPRISE_PROGRESS_TITLE
                    else {}
                ),
            }
            for title in enterprise_workflow_titles()
        ],
        "reminder_workflows": [
            {
                "title": REMINDER_PROGRESS_TITLE,
                "status": "enabled",
                "trigger_type": "SetRecordTrigger",
                "must_exclude": ["automationBatchUpdate"],
                "record_locator_transport": "query",
            }
        ],
        "sync_service": {
            "required": True,
            "release_status": "finished",
            "health_status": "ready",
            "base_read_write_permissions_verified": True,
        },
        "daily_checkin": {
            "selection": daily_checkin,
            "trigger_name": DAILY_CHECKIN_TRIGGER,
            "status": "enabled" if daily_checkin == "enabled" else "disabled",
            "trigger_type": "cron",
            "cron": DAILY_CHECKIN_CRON,
            "timezone": DAILY_CHECKIN_TIMEZONE,
            "requires_card_callback": daily_checkin == "enabled",
            "requires_public_callback_route": daily_checkin == "enabled",
            "requires_group_and_calendar_verification": daily_checkin == "enabled",
        },
    }


def _workflow_errors(
    items: object,
    expected_titles: set[str],
    *,
    http_titles: set[str],
) -> list[str]:
    if not isinstance(items, list):
        return ["workflow inventory must be an array"]
    errors = []
    active = [item for item in items if isinstance(item, dict) and item.get("status") == "enabled"]
    active_titles = [str(item.get("title", "")) for item in active]
    duplicates = sorted({title for title in active_titles if active_titles.count(title) > 1})
    if duplicates:
        errors.append("duplicate enabled workflows: " + ", ".join(duplicates))
    missing = sorted(expected_titles - set(active_titles))
    extra = sorted(set(active_titles) - expected_titles)
    if missing:
        errors.append("missing enabled workflows: " + ", ".join(missing))
    if extra:
        errors.append("unexpected enabled workflows: " + ", ".join(extra))
    for item in active:
        title = str(item.get("title", ""))
        if title not in expected_titles:
            continue
        if item.get("trigger_type") != "SetRecordTrigger":
            errors.append(f"{title}: trigger must be SetRecordTrigger")
        if item.get("excludes_automation_batch_update") is not True:
            errors.append(f"{title}: automationBatchUpdate must be excluded")
        step_types = set(item.get("step_types", []))
        if "SetRecordTrigger" not in step_types:
            errors.append(f"{title}: trigger step is missing")
        expected_action = "HTTPClientAction" if title in http_titles else "SetRecordAction"
        if expected_action not in step_types:
            errors.append(f"{title}: {expected_action} is missing")
        if title in http_titles and item.get("record_locator_transport") != "query":
            errors.append(f"{title}: exact record locator must use query transport")
    return errors


def validate_snapshot(snapshot: dict) -> dict:
    if not isinstance(snapshot, dict):
        raise ValueError("automation snapshot must be a JSON object")
    enterprise_titles = set(enterprise_workflow_titles())
    errors = _workflow_errors(
        snapshot.get("enterprise_workflows"),
        enterprise_titles,
        http_titles={ENTERPRISE_PROGRESS_TITLE},
    )
    errors.extend(
        _workflow_errors(
            snapshot.get("reminder_workflows"),
            {REMINDER_PROGRESS_TITLE},
            http_titles={REMINDER_PROGRESS_TITLE},
        )
    )

    service = snapshot.get("sync_service")
    if not isinstance(service, dict):
        errors.append("sync service metadata is missing")
    else:
        if service.get("release_status") != "finished":
            errors.append("sync service release is not finished")
        if service.get("health_status") != "ready":
            errors.append("sync service health check is not ready")
        if service.get("base_read_write_permissions_verified") is not True:
            errors.append("sync service Base read/write permissions are not verified")

    daily = snapshot.get("daily_checkin")
    if not isinstance(daily, dict):
        errors.append("daily_checkin decision is missing")
        daily_selection = "missing"
    else:
        daily_selection = daily.get("selection")
        if daily_selection not in {"enabled", "disabled"}:
            errors.append("daily_checkin must be explicitly enabled or disabled")
        elif daily_selection == "enabled":
            expected = {
                "name": DAILY_CHECKIN_TRIGGER,
                "status": "enabled",
                "trigger_type": "cron",
                "cron": DAILY_CHECKIN_CRON,
                "timezone": DAILY_CHECKIN_TIMEZONE,
            }
            for key, value in expected.items():
                if daily.get(key) != value:
                    errors.append(f"daily_checkin {key} must be {value}")
            for key in (
                "card_callback_verified",
                "callback_route_public_verified",
                "group_permission_verified",
                "calendar_permission_verified",
                "calendar_scope_isolation_verified",
            ):
                if daily.get(key) is not True:
                    errors.append(f"daily_checkin {key} must be verified")
        elif daily.get("status") == "enabled":
            errors.append("daily_checkin is disabled by choice but trigger is enabled")

    return {
        "schema_version": 1,
        "status": "ready" if not errors else "blocked",
        "errors": errors,
        "workflow_counts": {
            "enterprise_expected": len(enterprise_titles),
            "reminder_expected": 1,
            "total_expected": len(enterprise_titles) + 1,
        },
        "daily_checkin_selection": daily_selection,
        "secrets_processed": False,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--plan", action="store_true")
    action.add_argument("--validate", action="store_true")
    parser.add_argument(
        "--daily-checkin",
        choices=("enabled", "disabled"),
        help="required for --plan; records the user's explicit choice",
    )
    parser.add_argument("--input", default="-")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.plan:
            if args.daily_checkin is None:
                parser.error("--plan requires --daily-checkin enabled|disabled")
            result = build_plan(args.daily_checkin)
        else:
            if args.input != "-":
                parser.error("--validate currently requires --input -")
            result = validate_snapshot(json.load(sys.stdin))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        result = {
            "schema_version": 1,
            "status": "error",
            "error": type(error).__name__,
        }
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0 if result["status"] in {"planned", "ready"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
