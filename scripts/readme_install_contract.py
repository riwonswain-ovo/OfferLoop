#!/usr/bin/env python3
"""Validate the documented development install path without network access."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import re
import shlex
import subprocess


ROOT = Path(__file__).resolve().parents[1]
README = ROOT / "README.md"
MIGRATION = ROOT / "MIGRATION.md"
INSTALLER = ROOT / "scripts" / "install_offerloop.py"
WORKBENCH_TASK = (
    ROOT
    / "skills"
    / "offerloop-workbench"
    / "assets"
    / "workbench-template"
    / "client"
    / "src"
    / "lib"
    / "codex-task.ts"
)
DEVELOPMENT_REPOSITORY = "riwonswain-ovo/OfferLoop-development"


def load_installer():
    spec = importlib.util.spec_from_file_location(
        "offerloop_install_contract",
        INSTALLER,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def documented_command(readme: str) -> str:
    matches = re.findall(
        r"```(?:bash|powershell)\n(npx skills add [^\n]+)\n```",
        readme,
    )
    if len(matches) != 1:
        raise AssertionError(
            "README must contain exactly one single-line npx skills add command"
        )
    return matches[0]


def selected_skills(command: str) -> tuple[str, ...]:
    tokens = shlex.split(command)
    if tokens[:3] != ["npx", "skills", "add"]:
        raise AssertionError("README install command must start with npx skills add")
    if tokens[3] != DEVELOPMENT_REPOSITORY:
        raise AssertionError(
            "development README must install from the development repository"
        )
    try:
        start = tokens.index("-s") + 1
    except ValueError as exc:
        raise AssertionError("README install command must select explicit Skills") from exc
    end = next(
        (index for index in range(start, len(tokens)) if tokens[index].startswith("-")),
        len(tokens),
    )
    selected = tuple(tokens[start:end])
    if len(selected) != len(set(selected)):
        raise AssertionError("README install command contains duplicate Skill names")
    return selected


def main() -> None:
    installer = load_installer()
    readme = README.read_text(encoding="utf-8")
    migration = MIGRATION.read_text(encoding="utf-8")
    workbench_task = WORKBENCH_TASK.read_text(encoding="utf-8")

    command = documented_command(readme)
    documented = selected_skills(command)
    packaged = tuple(installer.SKILL_NAMES)
    tracked_skill_files = subprocess.check_output(
        ["git", "ls-files", "skills/*/SKILL.md"],
        cwd=ROOT,
        text=True,
    ).splitlines()
    discovered = tuple(
        sorted(Path(path).parent.name for path in tracked_skill_files)
    )

    if documented != packaged:
        raise AssertionError(
            f"README Skill order differs from installer: {documented!r} != {packaged!r}"
        )
    if set(documented) != set(discovered):
        raise AssertionError(
            "README and installer must include every packaged OfferLoop Skill exactly once"
        )
    for name in documented:
        if f"`{name}`" not in migration:
            raise AssertionError(f"MIGRATION.md is missing Skill: {name}")
    if "（开发版）" not in readme or "尚未与公开仓库同步" not in readme:
        raise AssertionError("development README must disclose its release status")
    if "OfferLoop-development" in workbench_task:
        raise AssertionError("shipped workbench must not require the private repository")

    print(
        "README install contract accepted: development source, "
        f"{len(documented)} Skills, cross-platform command, no private workbench origin"
    )


if __name__ == "__main__":
    main()
