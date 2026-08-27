#!/usr/bin/env python3
"""Plan the one-time migration from retired profile preferences to Base truth."""

from __future__ import annotations

import argparse
import json
import sys


def _clean(value):
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, list):
        unique = {}
        for item in value:
            cleaned = _clean(item)
            if cleaned in (None, "", []):
                continue
            key = json.dumps(cleaned, ensure_ascii=False, sort_keys=True)
            unique[key] = cleaned
        return [unique[key] for key in sorted(unique)]
    if isinstance(value, dict):
        cleaned = {}
        for key, item in sorted(value.items()):
            normalized = _clean(item)
            if normalized not in (None, "", []):
                cleaned[key] = normalized
        return cleaned
    return value


def _preference(value, label):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object or null")
    cleaned = _clean(value)
    return cleaned or None


def plan_migration(payload):
    if not isinstance(payload, dict):
        raise ValueError("input must be a JSON object")
    base = _preference(payload.get("base_preference"), "base_preference")
    profile = _preference(payload.get("profile_preference"), "profile_preference")
    if base is None and profile is None:
        return {"status": "needs_input", "write_allowed": False, "canonical_source": None}
    if base is not None and profile is None:
        return {"status": "ready", "write_allowed": True, "canonical_source": "base"}
    if base is None:
        return {
            "status": "needs_confirmation",
            "write_allowed": False,
            "canonical_source": "profile_pending_copy",
            "proposed_base_preference": profile,
        }
    if base == profile:
        return {"status": "ready", "write_allowed": True, "canonical_source": "base"}
    keys = sorted(set(base) | set(profile))
    conflicts = [key for key in keys if base.get(key) != profile.get(key)]
    return {
        "status": "conflict",
        "write_allowed": False,
        "canonical_source": None,
        "conflicting_fields": conflicts,
        "base_preference": base,
        "profile_preference": profile,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="-")
    args = parser.parse_args(argv)
    if args.input != "-":
        parser.error("only --input - is supported")
    try:
        payload = json.load(sys.stdin)
        result = plan_migration(payload)
    except (ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "error", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
