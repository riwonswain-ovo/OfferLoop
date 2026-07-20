#!/usr/bin/env python3
"""Pure helpers for OfferLoop workspace config and managed homepage blocks."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import tempfile


RESOURCE_KEYS = {
    "lark_profile",
    "target_base_url",
    "progress_base_url",
    "reminder_base_url",
    "wiki_space_id",
    "workspace_home_node_token",
    "workbench_url",
    "workspace_calendar_table_id",
    "workspace_calendar_view_id",
    "schema_version",
}
MANAGED_SECTIONS = {
    "UPCOMING_EVENTS",
    "RESUME_DEEP_DIVE",
    "PRODUCT_SENSE",
    "REFRESH_STATUS",
}


def config_file(environ=None):
    source = dict(os.environ if environ is None else environ)
    config_home = Path(source.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return config_home / "offerloop" / "config.json"


def load_config(path):
    path = Path(path)
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _write_private_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix="offerloop-workspace-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def register_resources(path, updates):
    unknown = set(updates) - RESOURCE_KEYS
    if unknown:
        names = ", ".join(sorted(unknown))
        raise ValueError(f"resource config cannot store secret or unknown keys: {names}")
    data = load_config(path)
    data.update({key: value for key, value in updates.items() if value is not None})
    _write_private_json(path, data)
    return data


def readiness(config):
    return {key: config.get(key) not in (None, "") for key in sorted(RESOURCE_KEYS)}


def future_window_filter(start_field_id, *, now=None, days=7):
    """Return the Base filter for today through the next ``days`` calendar days.

    Base accepts ``Today`` as the rolling lower bound but not a relative seven-day
    upper bound.  The daily recruiting-reminder run therefore refreshes the upper
    bound without touching any homepage document content.
    """
    if not start_field_id:
        raise ValueError("start field id is required")
    if days < 1:
        raise ValueError("days must be at least 1")
    current = now or datetime.now().astimezone()
    next_day = current.date() + timedelta(days=days)
    return {
        "logic": "and",
        "conditions": [
            [start_field_id, ">", "Today"],
            [start_field_id, "<", f"ExactDate({next_day.isoformat()} 00:00)"],
        ],
    }


def _markers(section):
    if section not in MANAGED_SECTIONS:
        raise ValueError(f"unknown managed section: {section}")
    return (
        f"<!-- OFFERLOOP:MANAGED:{section}:START -->",
        f"<!-- OFFERLOOP:MANAGED:{section}:END -->",
    )


def replace_managed_section(document, section, replacement):
    start, end = _markers(section)
    pattern = re.compile(
        rf"({re.escape(start)})\n.*?\n({re.escape(end)})",
        re.DOTALL,
    )
    if len(pattern.findall(document)) != 1:
        raise ValueError(f"managed section must appear exactly once: {section}")
    body = str(replacement).strip()
    return pattern.sub(lambda match: f"{match.group(1)}\n{body}\n{match.group(2)}", document)


def extract_personal_area(document):
    start = "<!-- OFFERLOOP:PERSONAL:START -->"
    end = "<!-- OFFERLOOP:PERSONAL:END -->"
    pattern = re.compile(rf"{re.escape(start)}.*?{re.escape(end)}", re.DOTALL)
    matches = pattern.findall(document)
    if len(matches) != 1:
        raise ValueError("personal area must appear exactly once")
    return matches[0]


def refresh_managed_sections(
    document,
    updates,
    *,
    refreshed_at=None,
    failure=None,
):
    """Refresh blocks in a legacy managed homepage without touching personal data."""
    refreshed_at = refreshed_at or datetime.now(timezone.utc)
    timestamp = refreshed_at.isoformat()
    personal_before = extract_personal_area(document)
    result = document
    if failure:
        status = f"最近刷新失败：{timestamp}\n\n原因：{failure}"
    else:
        for section, replacement in updates.items():
            if section == "REFRESH_STATUS":
                continue
            result = replace_managed_section(result, section, replacement)
        status = f"最近刷新成功：{timestamp}"
    result = replace_managed_section(result, "REFRESH_STATUS", status)
    if extract_personal_area(result) != personal_before:
        raise ValueError("personal area changed during managed refresh")
    return result


def render_initial_homepage(template, config):
    result = template
    replacements = {
        "{{workbench_url}}": config.get("workbench_url", "待配置"),
        "{{target_base_url}}": config.get("target_base_url", "待配置"),
        "{{progress_base_url}}": config.get("progress_base_url", "待配置"),
        "{{reminder_base_url}}": config.get("reminder_base_url", "待配置"),
    }
    for placeholder, value in replacements.items():
        result = result.replace(placeholder, str(value))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="print locator readiness")
    parser.add_argument("--template", action="store_true", help="render initial homepage")
    parser.add_argument(
        "--calendar-filter",
        action="store_true",
        help="print the rolling future-window filter for the configured calendar",
    )
    parser.add_argument("--start-field-id", default="fldQX3YSc8")
    parser.add_argument("--days", type=int, default=7)
    args = parser.parse_args()
    path = config_file()
    config = load_config(path)
    if args.check:
        print(json.dumps(readiness(config), ensure_ascii=False, indent=2))
        return
    if args.template:
        template_path = Path(__file__).resolve().parents[1] / "assets" / "homepage-template.md"
        print(render_initial_homepage(template_path.read_text(encoding="utf-8"), config))
        return
    if args.calendar_filter:
        print(
            json.dumps(
                future_window_filter(args.start_field_id, days=args.days),
                ensure_ascii=False,
            )
        )
        return
    parser.print_help()


if __name__ == "__main__":
    main()
