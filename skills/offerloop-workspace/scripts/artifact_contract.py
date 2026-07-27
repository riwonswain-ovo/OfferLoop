#!/usr/bin/env python3
"""Deterministic local contract for OfferLoop coaching artifacts.

This script never calls Feishu. Agents use lark-wiki/lark-doc/lark-base for
online reads and writes, then use this script to validate and register the
resulting non-secret locators.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import re
import secrets
import string
import sys
import tempfile


ARTIFACT_SCHEMA_VERSION = 1
CONFIG_SCHEMA_VERSION = 4
SKILLS = (
    "experience-deepthink",
    "interview-prep",
    "mock-lab",
    "talk-review",
    "pm-sense",
)
LEGACY_SKILLS = ("resume-deepthink",)
SKILL_CONFIG_KEYS = {
    # Keep this schema-v4 key so existing registered Feishu folders remain usable.
    "experience-deepthink": "resume_deepthink",
    "interview-prep": "interview_prep",
    "mock-lab": "mock_lab",
    "talk-review": "talk_review",
    "pm-sense": "pm_sense",
}
FOLDER_KEYS = (
    "current_resumes",
    "resume_deepthink",
    "pm_sense",
    "interview_prep",
    "mock_lab",
    "interview_asr",
    "interview_review",
)
LOCATOR_PATHS = {
    "folders": {
        "current_resumes": ("02｜当前简历",),
        "resume_deepthink": ("03｜经历深挖",),
        "interview_prep": ("04｜面试准备",),
        "interview_review": ("05｜面试复盘", "已完成复盘"),
        "interview_asr": ("05｜面试复盘", "ASR 待复盘"),
        "pm_sense": ("06｜产品 Sense",),
        "mock_lab": ("07｜模拟面试",),
    },
}
ROUTES = {
    "experience-deepthink": {
        "completed": "resume_deepthink",
        "incomplete": "resume_deepthink",
    },
    "interview-prep": {
        "completed": "interview_prep",
        "incomplete": "interview_prep",
    },
    "mock-lab": {
        "completed": "mock_lab",
        "incomplete": "mock_lab",
    },
    "talk-review": {
        "completed": "interview_review",
        "incomplete": "interview_review",
    },
    "pm-sense": {
        "completed": "pm_sense",
        "incomplete": "pm_sense",
    },
}
REQUIRED_LOCATORS = {
    "experience-deepthink": {
        "folders": ("current_resumes", "resume_deepthink"),
    },
    "interview-prep": {
        "folders": ("interview_prep",),
    },
    "mock-lab": {
        "folders": ("current_resumes", "resume_deepthink", "mock_lab"),
    },
    "talk-review": {
        "folders": (
            "current_resumes",
            "resume_deepthink",
            "interview_asr",
            "interview_review",
        ),
    },
    "pm-sense": {"folders": ("pm_sense",)},
}
RUN_ID_RE = re.compile(
    r"^(?P<skill>[a-z0-9-]+)-(?P<timestamp>\d{14})-(?P<suffix>[a-z0-9]{8})$"
)
VALID_STORAGE_STATUSES = {"needs_setup", "partial", "ready"}
VALID_RUN_STATUSES = {"completed", "incomplete"}
ENTITY_PREFIXES = {
    "experience": "exp",
    "fact": "fact",
    "pm": "pm",
    "question": "q",
}


def config_file(environ=None):
    source = dict(os.environ if environ is None else environ)
    root = Path(source.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return root / "offerloop" / "config.json"


def load_config(path):
    target = Path(path)
    if not target.exists():
        return {}
    data = json.loads(target.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("OfferLoop config must be a JSON object")
    return data


def _write_private_json(path, data):
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix="offerloop-artifact-", dir=target.parent)
    try:
        if os.name != "nt":
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, target)
        if os.name != "nt":
            os.chmod(target, 0o600)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def default_artifact_storage():
    return {
        "status": "needs_setup",
        "format": "markdown_docx",
        "save_policy": "auto_on_completion",
        "readiness": {key: False for key in SKILL_CONFIG_KEYS.values()},
        "folders": {key: "" for key in FOLDER_KEYS},
    }


def validate_artifact_storage(storage):
    if not isinstance(storage, dict):
        raise ValueError("artifact_storage must be a JSON object")
    if storage.get("status") not in VALID_STORAGE_STATUSES:
        raise ValueError("artifact_storage.status is invalid")
    if storage.get("format") != "markdown_docx":
        raise ValueError("artifact_storage.format must be markdown_docx")
    if storage.get("save_policy") != "auto_on_completion":
        raise ValueError(
            "artifact_storage.save_policy must be auto_on_completion"
        )
    readiness = storage.get("readiness")
    folders = storage.get("folders")
    if not isinstance(readiness, dict):
        raise ValueError("artifact_storage.readiness must be a JSON object")
    if not isinstance(folders, dict):
        raise ValueError("artifact_storage.folders must be a JSON object")
    if set(readiness) != set(SKILL_CONFIG_KEYS.values()):
        raise ValueError("artifact_storage.readiness keys do not match schema")
    if set(folders) != set(FOLDER_KEYS):
        raise ValueError("artifact_storage.folders keys do not match schema")
    if any(not isinstance(value, bool) for value in readiness.values()):
        raise ValueError("artifact_storage readiness values must be booleans")
    if any(not isinstance(value, str) for value in folders.values()):
        raise ValueError("artifact_storage locators must be strings")
    return True


def _migrate_artifact_storage(existing):
    """Return schema-v4 storage while preserving compatible locators."""
    target = default_artifact_storage()
    if not isinstance(existing, dict):
        return target

    old_folders = existing.get("folders", {})
    if isinstance(old_folders, dict):
        direct = (
            "current_resumes",
            "resume_deepthink",
            "pm_sense",
            "mock_lab",
        )
        for key in direct:
            if isinstance(old_folders.get(key), str):
                target["folders"][key] = old_folders[key]
        target["folders"]["interview_prep"] = str(
            old_folders.get("interview_prep_completed")
            or old_folders.get("interview_prep_pending")
            or ""
        )
        target["folders"]["interview_asr"] = str(
            old_folders.get("interview_review_pending") or ""
        )
        target["folders"]["interview_review"] = str(
            old_folders.get("interview_review_completed") or ""
        )

    _recalculate_readiness(target)
    return target


def migrate_config(config):
    """Return a v4 config while preserving public values and valid locators."""
    if not isinstance(config, dict):
        raise ValueError("OfferLoop config must be a JSON object")
    current = config.get("schema_version", 1)
    if not isinstance(current, int) or current < 1 or current > CONFIG_SCHEMA_VERSION:
        raise ValueError("unsupported OfferLoop schema_version")
    result = dict(config)
    existing = result.get("artifact_storage")
    if existing is None:
        result["artifact_storage"] = default_artifact_storage()
    else:
        try:
            validate_artifact_storage(existing)
        except ValueError:
            result["artifact_storage"] = _migrate_artifact_storage(existing)
    result["schema_version"] = CONFIG_SCHEMA_VERSION
    return result


def _storage(config):
    storage = config.get("artifact_storage")
    validate_artifact_storage(storage)
    return storage


def _recalculate_storage_status(storage):
    values = list(storage["readiness"].values())
    storage["status"] = (
        "ready"
        if values and all(values)
        else "partial"
        if any(values)
        else "needs_setup"
    )


def _recalculate_readiness(storage):
    for skill, required in REQUIRED_LOCATORS.items():
        key = SKILL_CONFIG_KEYS[skill]
        storage["readiness"][key] = all(
            bool(storage["folders"].get(locator))
            for locator in required["folders"]
        )
    _recalculate_storage_status(storage)


def register_folder(path, kind, node_token):
    if kind not in FOLDER_KEYS:
        raise ValueError(f"unknown folder kind: {kind}")
    if not str(node_token).strip():
        raise ValueError("node token must not be empty")
    config = load_config(path)
    storage = _storage(config)
    storage["folders"][kind] = str(node_token).strip()
    _recalculate_readiness(storage)
    _write_private_json(path, config)
    return config


def resolve_locator(config, locator_type, kind):
    storage = _storage(config)
    mapping = storage[locator_type]
    if kind not in mapping:
        raise ValueError(f"unknown {locator_type} kind: {kind}")
    value = mapping[kind]
    return {
        "kind": kind,
        "configured": bool(value),
        "node_token": value,
    }


def describe_layout():
    return {
        "folders": {
            key: list(path)
            for key, path in LOCATOR_PATHS["folders"].items()
        }
    }


def new_run_id(skill, *, now=None, suffix=None):
    if skill not in SKILLS:
        raise ValueError(f"unknown skill: {skill}")
    current = now or datetime.now().astimezone()
    candidate = suffix or "".join(
        secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8)
    )
    if not re.fullmatch(r"[a-z0-9]{8}", candidate):
        raise ValueError("run suffix must contain 8 lowercase letters or digits")
    return f"{skill}-{current.strftime('%Y%m%d%H%M%S')}-{candidate}"


def new_entity_id(kind, *, suffix=None):
    if kind not in ENTITY_PREFIXES:
        raise ValueError(f"unknown entity kind: {kind}")
    candidate = suffix or "".join(
        secrets.choice(string.ascii_lowercase + string.digits) for _ in range(8)
    )
    if not re.fullmatch(r"[a-z0-9]{8}", candidate):
        raise ValueError("entity suffix must contain 8 lowercase letters or digits")
    return f"{ENTITY_PREFIXES[kind]}-{candidate}"


def parse_run_id(run_id, *, expected_skill=None):
    match = RUN_ID_RE.fullmatch(str(run_id))
    if not match or match.group("skill") not in SKILLS + LEGACY_SKILLS:
        raise ValueError("invalid run_id")
    if expected_skill and match.group("skill") != expected_skill:
        raise ValueError("run_id does not belong to the requested skill")
    return match.groupdict()


def _clean_title_part(value, fallback):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    text = text.replace("|", "｜")
    return text[:80] or fallback


def build_title(
    skill,
    run_id,
    *,
    date=None,
    subject="",
    resume_version="",
    target_direction="",
    company="",
    position="",
    stage="",
):
    parsed = parse_run_id(run_id, expected_skill=skill)
    if date:
        try:
            title_date = datetime.strptime(date, "%Y-%m-%d").strftime(
                "%Y-%m-%d"
            )
        except ValueError as exc:
            raise ValueError("title date must use YYYY-MM-DD") from exc
    else:
        title_date = datetime.strptime(
            parsed["timestamp"], "%Y%m%d%H%M%S"
        ).strftime("%Y-%m-%d")
    subject = _clean_title_part(subject, "未命名主题")
    resume_version = _clean_title_part(resume_version, "简历版本待确认")
    target_direction = _clean_title_part(target_direction, "目标岗位待确认")
    company = _clean_title_part(company, "独立任务")
    position = _clean_title_part(position, "岗位待确认")
    stage = _clean_title_part(stage, "环节待确认")
    if skill == "experience-deepthink":
        return f"经历深挖｜{subject}｜{target_direction}"
    if skill == "interview-prep":
        return f"{company}｜{position}｜{stage}准备｜{title_date}｜{run_id}"
    if skill == "mock-lab":
        return f"{subject}｜模拟面试｜{title_date}｜{run_id}"
    if skill == "talk-review":
        return f"{company}｜{position}｜{stage}复盘｜{title_date}｜{run_id}"
    return f"产品思维｜{subject}｜{title_date}｜{run_id}"


def route_folder(skill, status):
    if skill not in ROUTES:
        raise ValueError(f"unknown skill: {skill}")
    if status not in VALID_RUN_STATUSES:
        raise ValueError("run status must be completed or incomplete")
    return ROUTES[skill][status]


def find_by_run(candidates, run_id):
    parse_run_id(run_id)
    if not isinstance(candidates, list):
        raise ValueError("candidates must be a JSON array")
    matches = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            raise ValueError("each candidate must be a JSON object")
        if run_id in str(candidate.get("title", "")):
            matches.append(candidate)
    status = (
        "missing"
        if not matches
        else "found"
        if len(matches) == 1
        else "ambiguous"
    )
    return {"match_status": status, "matches": matches}


def find_by_title(candidates, title):
    if not isinstance(candidates, list):
        raise ValueError("candidates must be a JSON array")
    expected = str(title).strip()
    if not expected:
        raise ValueError("title must not be empty")
    matches = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            raise ValueError("each candidate must be a JSON object")
        if str(candidate.get("title", "")).strip() == expected:
            matches.append(candidate)
    status = (
        "missing"
        if not matches
        else "found"
        if len(matches) == 1
        else "ambiguous"
    )
    return {"match_status": status, "matches": matches}


def validate_markdown(markdown, *, run_id=None, content_only=False):
    text = str(markdown).strip()
    errors = []
    if not text.startswith("# "):
        errors.append("document must start with one level-1 title")
    if len(re.findall(r"^# ", text, flags=re.MULTILINE)) != 1:
        errors.append("document must contain exactly one level-1 title")
    if not content_only and "## 产物信息" not in text:
        errors.append("document must contain a 产物信息 section")
    if run_id:
        parse_run_id(run_id)
        if not content_only and run_id not in text:
            errors.append("document does not contain the requested run_id")
    if re.search(r"<(?:html|body|script)\b", text, flags=re.IGNORECASE):
        errors.append("HTML output is not allowed")
    if "\x00" in text:
        errors.append("document contains a NUL byte")
    return {"valid": not errors, "errors": errors}


def _read_json_source(path):
    text = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    return json.loads(text)


def _read_text_source(path):
    return (
        sys.stdin.read()
        if path == "-"
        else Path(path).read_text(encoding="utf-8")
    )


def _envelope(data):
    return {
        "schema_version": ARTIFACT_SCHEMA_VERSION,
        "status": "ok",
        "data": data,
    }


def _parser():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    new_run = subparsers.add_parser("new-run")
    new_run.add_argument("--skill", required=True, choices=SKILLS)
    new_run.add_argument("--now", help="ISO datetime; deterministic tests only")
    new_run.add_argument("--suffix", help="8 lowercase letters/digits; tests only")
    new_run.add_argument("--json", action="store_true")

    new_entity = subparsers.add_parser("new-entity-id")
    new_entity.add_argument("--kind", required=True, choices=ENTITY_PREFIXES)
    new_entity.add_argument("--suffix", help="8 lowercase letters/digits; tests only")
    new_entity.add_argument("--json", action="store_true")

    migrate = subparsers.add_parser("migrate-config")
    migrate.add_argument("--config")
    migrate.add_argument("--confirmed", action="store_true")
    migrate.add_argument("--json", action="store_true")

    layout = subparsers.add_parser("describe-layout")
    layout.add_argument("--json", action="store_true")

    resolve_folder = subparsers.add_parser("resolve-folder")
    resolve_folder.add_argument("--kind", required=True, choices=FOLDER_KEYS)
    resolve_folder.add_argument("--config")
    resolve_folder.add_argument("--json", action="store_true")

    register_folder_parser = subparsers.add_parser("register-folder")
    register_folder_parser.add_argument("--kind", required=True, choices=FOLDER_KEYS)
    register_folder_parser.add_argument("--node-token", required=True)
    register_folder_parser.add_argument("--config")
    register_folder_parser.add_argument("--json", action="store_true")

    title = subparsers.add_parser("build-title")
    title.add_argument("--skill", required=True, choices=SKILLS)
    title.add_argument("--run-id", required=True)
    title.add_argument("--date")
    title.add_argument("--subject", default="")
    title.add_argument("--resume-version", default="")
    title.add_argument("--target-direction", default="")
    title.add_argument("--company", default="")
    title.add_argument("--position", default="")
    title.add_argument("--stage", default="")
    title.add_argument("--json", action="store_true")

    route = subparsers.add_parser("route-folder")
    route.add_argument("--skill", required=True, choices=SKILLS)
    route.add_argument("--status", required=True, choices=VALID_RUN_STATUSES)
    route.add_argument("--json", action="store_true")

    find = subparsers.add_parser("find-by-run")
    find.add_argument("--candidates", required=True, help="JSON file or - for stdin")
    find.add_argument("--run-id", required=True)
    find.add_argument("--json", action="store_true")

    find_title = subparsers.add_parser("find-by-title")
    find_title.add_argument(
        "--candidates", required=True, help="JSON file or - for stdin"
    )
    find_title.add_argument("--title", required=True)
    find_title.add_argument("--json", action="store_true")

    validate = subparsers.add_parser("validate-markdown")
    validate.add_argument("--file", required=True, help="Markdown file or - for stdin")
    validate.add_argument("--run-id")
    validate.add_argument("--content-only", action="store_true")
    validate.add_argument("--json", action="store_true")
    return parser


def main():
    parser = _parser()
    args = parser.parse_args()
    try:
        path = (
            Path(args.config)
            if getattr(args, "config", None)
            else config_file()
        )
        if args.command == "new-run":
            now = datetime.fromisoformat(args.now) if args.now else None
            data = {"run_id": new_run_id(args.skill, now=now, suffix=args.suffix)}
        elif args.command == "new-entity-id":
            data = {"entity_id": new_entity_id(args.kind, suffix=args.suffix)}
        elif args.command == "migrate-config":
            if not args.confirmed:
                raise ValueError("migrate-config requires explicit --confirmed")
            migrated = migrate_config(load_config(path))
            _write_private_json(path, migrated)
            data = {
                "schema_version": migrated["schema_version"],
                "migrated": True,
            }
        elif args.command == "describe-layout":
            data = describe_layout()
        elif args.command == "resolve-folder":
            data = resolve_locator(load_config(path), "folders", args.kind)
        elif args.command == "register-folder":
            registered = register_folder(path, args.kind, args.node_token)
            data = {
                "kind": args.kind,
                "registered": True,
                "storage_status": registered["artifact_storage"]["status"],
            }
        elif args.command == "build-title":
            data = {
                "title": build_title(
                    args.skill,
                    args.run_id,
                    date=args.date,
                    subject=args.subject,
                    resume_version=args.resume_version,
                    target_direction=args.target_direction,
                    company=args.company,
                    position=args.position,
                    stage=args.stage,
                )
            }
        elif args.command == "route-folder":
            data = {"folder_key": route_folder(args.skill, args.status)}
        elif args.command == "find-by-run":
            data = find_by_run(
                _read_json_source(args.candidates), args.run_id
            )
        elif args.command == "find-by-title":
            data = find_by_title(
                _read_json_source(args.candidates), args.title
            )
        else:
            result = validate_markdown(
                _read_text_source(args.file),
                run_id=args.run_id,
                content_only=args.content_only,
            )
            if not result["valid"]:
                raise ValueError("; ".join(result["errors"]))
            data = result
        print(json.dumps(_envelope(data), ensure_ascii=False))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(
            json.dumps(
                {
                    "schema_version": ARTIFACT_SCHEMA_VERSION,
                    "status": "error",
                    "error": str(exc),
                },
                ensure_ascii=False,
            )
        )
        raise SystemExit(2)


if __name__ == "__main__":
    main()
