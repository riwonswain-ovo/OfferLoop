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
SETUP = ROOT / "scripts" / "setup_offerloop.py"
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
PUBLIC_REPOSITORY = "https://github.com/riwonswain-ovo/OfferLoop.git"
SETUP_SCRIPT = "scripts/setup_offerloop.py"


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
    if not SETUP.is_file():
        raise AssertionError("repository is missing the two-mode setup entrypoint")
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
        f"git clone {PUBLIC_REPOSITORY}",
        f"python3 {SETUP_SCRIPT} --agent codex --mode full --dry-run",
        f"python3 {SETUP_SCRIPT} --agent codex --mode full",
        f"python3 {SETUP_SCRIPT} --agent codex --mode full --verify",
        f"python3 {SETUP_SCRIPT} --agent codex --mode single --skill mock-lab",
        "git sparse-checkout set scripts skills/mock-lab",
        "--record-workspace-verified",
    )
    for command in required_readme_commands:
        if command not in readme:
            raise AssertionError(
                f"README is missing the documented onboarding command: {command}"
            )
    for agent in installer.ALL_AGENTS:
        if f"`{agent}`" not in readme:
            raise AssertionError(f"README is missing installer target: {agent}")
    if SETUP_SCRIPT not in migration or "--verify" not in migration:
        raise AssertionError(
            "MIGRATION.md must use the mode-aware setup and post-install verification"
        )
    if "OfferLoop-development" not in readme or "Pull Request" not in readme:
        raise AssertionError("README must separate development and public release repositories")
    if "工作台" in readme or "offerloop-workbench" in readme:
        raise AssertionError("README must not expose internal application experiments")
    if "OfferLoop-development" in workbench_task:
        raise AssertionError("shipped workbench must not require the private repository")

    print(
        "README install contract accepted: public full download, sparse single-Skill "
        f"download, explicit Agent target, {len(packaged)} Skills, online verification, "
        "and separate development/public release repositories"
    )


if __name__ == "__main__":
    main()
