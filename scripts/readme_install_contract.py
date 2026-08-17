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
        "python3 scripts/install_offerloop.py --agent codex --verify",
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
    if "OfferLoop-development" in readme or "开发、验证与发布" in readme:
        raise AssertionError("README must not expose internal development workflow")
    if "配套飞书知识库是**可选的线上配置**" not in readme:
        raise AssertionError("README must make the Feishu knowledge base optional")
    for marker in (
        "以前只安装过 `job-collection` 和 `recruiting-reminder`？",
        ".offerloop-backups/<时间戳>/",
        "`needs_setup` 只表示可选的线上空间尚未接入",
    ):
        if marker not in readme:
            raise AssertionError(f"README is missing legacy two-Skill migration guidance: {marker}")
    for marker in (
        "双 Skill 用户的最短迁移路径",
        "scripts/install_offerloop.py --agent codex --verify",
        "Schema v6 状态模型",
    ):
        if marker not in migration:
            raise AssertionError(f"MIGRATION.md is missing current migration guidance: {marker}")
    if "schema v5" in migration or "--confirm-schema-v5" in migration:
        raise AssertionError("MIGRATION.md must not direct users to the retired schema v5 flow")
    if "工作台" in readme or "offerloop-workbench" in readme:
        raise AssertionError("README must not mention the retired workbench")
    print(
        "README install contract accepted: public full download, sparse single-Skill "
        f"download, explicit Agent target, {len(packaged)} Skills, online verification, "
        "and optional Feishu knowledge base"
    )


if __name__ == "__main__":
    main()
