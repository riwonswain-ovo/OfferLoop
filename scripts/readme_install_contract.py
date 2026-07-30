#!/usr/bin/env python3
"""Validate the documented bundled-installer path without network access."""

from __future__ import annotations

import importlib.util
from pathlib import Path
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
INSTALL_SCRIPT = "scripts/install_offerloop.py"


def load_installer():
    spec = importlib.util.spec_from_file_location(
        "offerloop_install_contract",
        INSTALLER,
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def main() -> None:
    installer = load_installer()
    readme = README.read_text(encoding="utf-8")
    migration = MIGRATION.read_text(encoding="utf-8")
    workbench_task = WORKBENCH_TASK.read_text(encoding="utf-8")

    packaged = tuple(installer.SKILL_NAMES)
    tracked_skill_files = subprocess.check_output(
        ["git", "ls-files", "skills/*/SKILL.md"],
        cwd=ROOT,
        text=True,
    ).splitlines()
    discovered = tuple(
        sorted(Path(path).parent.name for path in tracked_skill_files)
    )

    if set(packaged) != set(discovered):
        raise AssertionError(
            "installer must include every packaged OfferLoop Skill exactly once"
        )
    for name in packaged:
        if f"`{name}`" not in readme:
            raise AssertionError(f"README.md is missing Skill: {name}")
        if f"`{name}`" not in migration:
            raise AssertionError(f"MIGRATION.md is missing Skill: {name}")

    required_readme_commands = (
        "gh auth status -h github.com",
        f"gh repo view {DEVELOPMENT_REPOSITORY}",
        f"gh repo clone {DEVELOPMENT_REPOSITORY}",
        f"python3 {INSTALL_SCRIPT} --agent codex --dry-run",
        f"python3 {INSTALL_SCRIPT} --agent codex",
        f"python3 {INSTALL_SCRIPT} --agent codex --verify",
        f"py -3 {INSTALL_SCRIPT} --agent codex --dry-run",
        f"py -3 {INSTALL_SCRIPT} --agent codex",
        f"py -3 {INSTALL_SCRIPT} --agent codex --verify",
    )
    for command in required_readme_commands:
        if command not in readme:
            raise AssertionError(
                f"README is missing the documented onboarding command: {command}"
            )
    for agent in installer.ALL_AGENTS:
        if f"`{agent}`" not in readme:
            raise AssertionError(f"README is missing installer target: {agent}")
    if f"npx skills add {DEVELOPMENT_REPOSITORY}" in readme:
        raise AssertionError(
            "README must not document a second OfferLoop terminal installer"
        )
    if "scripts/install_offerloop.py" not in migration or "--verify" not in migration:
        raise AssertionError(
            "MIGRATION.md must use the bundled installer and post-install verification"
        )
    if "（开发版）" not in readme or "尚未与公开仓库同步" not in readme:
        raise AssertionError("development README must disclose its release status")
    if "OfferLoop-development" in workbench_task:
        raise AssertionError("shipped workbench must not require the private repository")

    print(
        "README install contract accepted: GitHub authentication, explicit Agent "
        f"target, bundled installer, {len(packaged)} Skills, post-install verification, "
        "and no private workbench origin"
    )


if __name__ == "__main__":
    main()
