#!/usr/bin/env python3
"""Repository-level checks for publishing the skill safely."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = {
    "SKILL.md",
    "agents/openai.yaml",
    ".env.example",
    "references/lark-onboarding.md",
    "references/feishu-setup.md",
    "references/personal-excel-source.md",
    "references/tencent-smartsheet-source.md",
    "references/excel-insert.md",
    "references/field-contract.md",
    "references/dedup_judge.md",
}

TEXT_SUFFIXES = {".md", ".py", ".toml", ".yml", ".yaml", ".example"}
PRIVATE_PATTERNS = {
    "personal absolute path": re.compile(r"/(?:Users|home)/[^/<>'\s]+/"),
    "concrete Feishu Base token": re.compile(r"\bbascn(?!Example\b)[A-Za-z0-9_-]{8,}\b"),
    "concrete Feishu table id": re.compile(r"\btbl(?!Example\b)[A-Za-z0-9]{10,}\b"),
    "concrete Feishu view id": re.compile(r"\bvew(?!Example\b)[A-Za-z0-9]{10,}\b"),
    "secret assignment": re.compile(
        r"FEISHU_APP_SECRET=(?!replace-me\b|x{8,}\b)[A-Za-z0-9_-]{20,}"
    ),
}


def text_files() -> list[Path]:
    result = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        if path.name in {"LICENSE", "VERSION", ".gitignore"} or path.suffix in TEXT_SUFFIXES:
            result.append(path)
    return result


def validate_frontmatter(errors: list[str]) -> None:
    skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    if not skill.startswith("---\n") or "\n---\n" not in skill[4:]:
        errors.append("SKILL.md: missing YAML frontmatter")
        return
    frontmatter = skill.split("---", 2)[1]
    if not re.search(r"^name:\s*job-collection\s*$", frontmatter, re.MULTILINE):
        errors.append("SKILL.md: name must be job-collection")
    description = re.search(r"^description:\s*(\S.+)$", frontmatter, re.MULTILINE)
    if not description or description.group(1).strip() in {"|", ">"}:
        errors.append("SKILL.md: description must be a non-empty single-line scalar")
    if len(skill.splitlines()) > 350:
        errors.append("SKILL.md: core instructions exceed 350 lines; move details to references/")


def validate_references(errors: list[str]) -> None:
    pattern = re.compile(r"references/[A-Za-z0-9_./-]+\.md")
    for path in text_files():
        if path == ROOT / "scripts/validate_skill.py":
            continue
        content = path.read_text(encoding="utf-8")
        for reference in pattern.findall(content):
            if not (ROOT / reference).is_file():
                errors.append(f"{path.relative_to(ROOT)}: missing reference {reference}")


def validate_private_data(errors: list[str]) -> None:
    for path in text_files():
        content = path.read_text(encoding="utf-8")
        for label, pattern in PRIVATE_PATTERNS.items():
            for match in pattern.finditer(content):
                line = content.count("\n", 0, match.start()) + 1
                errors.append(f"{path.relative_to(ROOT)}:{line}: {label}")


def validate_scope(errors: list[str]) -> None:
    removed = [
        ROOT / "references/login-platforms.md",
        ROOT / "references/platform-search.md",
        ROOT / "references/extract_jobs.md",
    ]
    for path in removed:
        if path.exists():
            errors.append(f"{path.relative_to(ROOT)}: unsupported platform-search file exists")


def validate_current_contract(errors: list[str]) -> None:
    """Reject legacy instructions that previously overrode the 13-field contract."""
    legacy_patterns = {
        "legacy numbered sort": re.compile(r"信息更新时间\s*desc\s*,\s*编号"),
        "legacy fixed view count": re.compile(r"48\s*个\s*grid|48/48|6/6.*已投递"),
        "legacy 22-column schema": re.compile(r"主表\s*22\s*列|飞书主表\s*22\s*列"),
        "legacy sequence allocation": re.compile(r"当前主表最大编号\s*\+\s*1|下一批起始编号"),
    }
    for path in text_files():
        if path == ROOT / "scripts/validate_skill.py":
            continue
        content = path.read_text(encoding="utf-8")
        for label, pattern in legacy_patterns.items():
            match = pattern.search(content)
            if match:
                line = content.count("\n", 0, match.start()) + 1
                errors.append(f"{path.relative_to(ROOT)}:{line}: {label}")

    required_markers = {
        "references/lark-onboarding.md": ["+record-get", "--base-token", "网络错误分层"],
        "references/tencent-smartsheet-source.md": ["Chrome 扩展恢复 SOP", "每日更新", "tabs.finalize"],
        "references/excel-insert.md": ["no operation produced", "安全短前缀"],
        "references/personal-excel-source.md": ["13 字段契约", "每次只传一个 `--record-id`"],
    }
    for relative, markers in required_markers.items():
        content = (ROOT / relative).read_text(encoding="utf-8")
        for marker in markers:
            if marker not in content:
                errors.append(f"{relative}: missing recovery marker {marker!r}")


def main() -> int:
    errors: list[str] = []
    missing = sorted(path for path in REQUIRED_FILES if not (ROOT / path).is_file())
    errors.extend(f"missing required file: {path}" for path in missing)
    validate_frontmatter(errors)
    validate_references(errors)
    validate_private_data(errors)
    validate_scope(errors)
    validate_current_contract(errors)

    if errors:
        print("Skill validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Skill validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
