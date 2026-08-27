#!/usr/bin/env python3
"""Build a deterministic, redacted scan notification from sanitized event plans."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime


ALLOWED = ("company", "position", "stage", "start_time", "deadline", "action", "warning")
FIELD_LIMITS = {"company": 80, "position": 120, "stage": 24, "start_time": 64, "deadline": 64, "action": 32, "warning": 160}


def _bounded(value, limit):
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or ""))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def build_summary(events, limit=10):
    def deadline(item):
        value = item.get("deadline") or item.get("start_time") or "9999-12-31T23:59:59+00:00"
        try: return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
        except ValueError: return float("inf")
    if not isinstance(events, list):
        raise ValueError("events must be an array")
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    sanitized = [
        {key: _bounded(item.get(key, ""), FIELD_LIMITS[key]) for key in ALLOWED}
        for item in events if isinstance(item, dict)
    ]
    sanitized.sort(key=lambda item: (deadline(item), str(item.get("company", "")), str(item.get("stage", ""))))
    shown = sanitized[:limit]
    return {"count": len(sanitized), "events": shown, "remaining_count": max(0, len(sanitized) - len(shown))}


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    print(json.dumps(build_summary(payload), ensure_ascii=False, separators=(",", ":")))
