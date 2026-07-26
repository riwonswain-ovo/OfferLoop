#!/usr/bin/env python3
"""Deterministic identifiers and validation for knowledge-digest artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


REQUIRED_SUMMARY_FIELDS = (
    "title",
    "source_id",
    "source_url",
    "one_line_conclusion",
    "key_points",
    "value",
    "boundary",
)


def canonicalize_url(value: str) -> str:
    parts = urlsplit(value.strip())
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        raise ValueError("source URL must use http or https")
    query = [
        (key, item)
        for key, item in parse_qsl(parts.query, keep_blank_values=True)
        if not key.lower().startswith("utm_")
        and key.lower() not in {"spm", "from", "source"}
    ]
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    if path != "/":
        path = path.rstrip("/")
    return urlunsplit(
        (
            parts.scheme.lower(),
            parts.netloc.lower(),
            path,
            urlencode(sorted(query)),
            "",
        )
    )


def source_id(url: str) -> str:
    canonical = canonicalize_url(url)
    return f"src-{hashlib.sha256(canonical.encode('utf-8')).hexdigest()[:16]}"


def item_id(source: str, url: str) -> str:
    if not re.fullmatch(r"src-[0-9a-f]{16}", source):
        raise ValueError("invalid source_id")
    material = f"{source}\n{canonicalize_url(url)}".encode("utf-8")
    return f"itm-{hashlib.sha256(material).hexdigest()[:20]}"


def normalize_content(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def fingerprint(text: str) -> str:
    normalized = normalize_content(text)
    if not normalized:
        raise ValueError("content is empty")
    return f"sha256:{hashlib.sha256(normalized.encode('utf-8')).hexdigest()}"


def digest_id(source: str, content_fingerprint: str) -> str:
    if not re.fullmatch(r"src-[0-9a-f]{16}", source):
        raise ValueError("invalid source_id")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", content_fingerprint):
        raise ValueError("invalid content fingerprint")
    material = f"{source}\n{content_fingerprint}".encode("utf-8")
    return f"dig-{hashlib.sha256(material).hexdigest()[:20]}"


def reading_plan(total_items: int, items_per_session: int) -> dict[str, int]:
    if total_items < 0:
        raise ValueError("total_items must be at least 0")
    if items_per_session < 1:
        raise ValueError("items_per_session must be at least 1")
    sessions = (
        (total_items + items_per_session - 1) // items_per_session
        if total_items
        else 0
    )
    return {
        "total_items": total_items,
        "items_per_session": items_per_session,
        "sessions": sessions,
    }


def validate_summary(payload: object) -> list[str]:
    if not isinstance(payload, dict):
        return ["summary must be a JSON object"]
    errors = [
        f"missing field: {field}"
        for field in REQUIRED_SUMMARY_FIELDS
        if not payload.get(field)
    ]
    points = payload.get("key_points")
    if not isinstance(points, list) or not 2 <= len(points) <= 4:
        errors.append("key_points must contain 2 to 4 items")
    elif any(not isinstance(point, str) or not point.strip() for point in points):
        errors.append("each key point must be a non-empty string")
    conclusion = payload.get("one_line_conclusion")
    if isinstance(conclusion, str) and len(conclusion) > 120:
        errors.append("one_line_conclusion must be at most 120 characters")
    try:
        canonicalize_url(str(payload.get("source_url", "")))
    except ValueError as exc:
        errors.append(str(exc))
    return errors


def read_text(path: str | None) -> str:
    if path in {None, "-"}:
        return sys.stdin.read()
    return Path(path).read_text(encoding="utf-8")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)

    source = commands.add_parser("source-id")
    source.add_argument("--url", required=True)

    item = commands.add_parser("item-id")
    item.add_argument("--source-id", required=True)
    item.add_argument("--url", required=True)

    fp = commands.add_parser("fingerprint")
    fp.add_argument("--file", default="-")

    digest = commands.add_parser("digest-id")
    digest.add_argument("--source-id", required=True)
    digest.add_argument("--fingerprint", required=True)

    plan = commands.add_parser("plan")
    plan.add_argument("--total-items", required=True, type=int)
    plan.add_argument("--items-per-session", required=True, type=int)

    validate = commands.add_parser("validate")
    validate.add_argument("--file", default="-")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "source-id":
            output = {
                "source_id": source_id(args.url),
                "canonical_url": canonicalize_url(args.url),
            }
        elif args.command == "item-id":
            output = {
                "item_id": item_id(args.source_id, args.url),
                "canonical_url": canonicalize_url(args.url),
            }
        elif args.command == "fingerprint":
            output = {"fingerprint": fingerprint(read_text(args.file))}
        elif args.command == "digest-id":
            output = {
                "digest_id": digest_id(args.source_id, args.fingerprint),
            }
        elif args.command == "plan":
            output = reading_plan(args.total_items, args.items_per_session)
        else:
            payload = json.loads(read_text(args.file))
            errors = validate_summary(payload)
            output = {"valid": not errors, "errors": errors}
            print(json.dumps(output, ensure_ascii=False))
            return 0 if not errors else 1
        print(json.dumps(output, ensure_ascii=False))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
