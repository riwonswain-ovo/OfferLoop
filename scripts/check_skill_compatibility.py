#!/usr/bin/env python3
"""Validate the shared AgentSkills contract before release."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"
INSTALLER = ROOT / "scripts" / "install_offerloop.py"
ABSOLUTE_USER_PATH = re.compile(r"/(?:Users|home)/[^/<>'\s]+/")
AGENT_SPECIFIC_PHRASES = (
    "Codex 执行",
    "对 Codex 说",
    "codex_app",
    "mcp__",
)


def load_installer():
    spec = importlib.util.spec_from_file_location("offerloop_installer", INSTALLER)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def main() -> int:
    errors: list[str] = []
    installer = load_installer()
    try:
        installer.validate_sources()
    except (OSError, ValueError) as exc:
        errors.append(str(exc))

    for path in SKILLS.rglob("*"):
        if not path.is_file() or path.suffix not in {".md", ".py", ".yml", ".yaml"}:
            continue
        if "assets" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        if ABSOLUTE_USER_PATH.search(text):
            errors.append(f"{path.relative_to(ROOT)}: contains a private absolute path")
        for phrase in AGENT_SPECIFIC_PHRASES:
            if phrase in text:
                errors.append(
                    f"{path.relative_to(ROOT)}: contains Agent-specific phrase {phrase!r}"
                )

    if errors:
        print("Shared Skill compatibility check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Shared Skill compatibility check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
