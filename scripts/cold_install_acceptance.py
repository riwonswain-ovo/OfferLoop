#!/usr/bin/env python3
"""Exercise the documented OfferLoop install path in an isolated project."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


SKILLS_CLI_VERSION = "1.5.19"
SKILL_NAMES = (
    "offerloop-setup",
    "job-collection",
    "recruiting-reminder",
    "offerloop-workspace",
)
LARK_CLI_RECOVERY = (
    "运行 `npx @larksuite/cli@latest install` 安装 lark-cli；再运行 "
    "`npx skills add larksuite/cli -g -y` 安装官方 Lark Skills，然后新开 Agent 会话"
)
WORKSPACE_SKILLS_RECOVERY = (
    "缺少：lark-base、lark-doc、lark-wiki。运行 "
    "`npx skills add larksuite/cli -g -y` 安装官方 Lark Skills，然后新开 Agent 会话"
)


def run(command, *, cwd, env):
    subprocess.run(command, cwd=cwd, env=env, check=True)


def load_report(command, *, cwd, env):
    completed = subprocess.run(
        command,
        cwd=cwd,
        env=env,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    )
    return json.loads(completed.stdout)


def assert_installed(project):
    skills_root = project / ".agents" / "skills"
    for name in SKILL_NAMES:
        skill_file = skills_root / name / "SKILL.md"
        if not skill_file.is_file():
            raise AssertionError(f"missing installed Skill: {name}")

    setup_assets = skills_root / "offerloop-setup" / "assets"
    for template in ("workbench-template", "progress-sync-template"):
        if not (setup_assets / template / "package.json").is_file():
            raise AssertionError(f"missing installed app template: {template}")
    return skills_root


def assert_collection_preflight(project, skills_root, env):
    setup_scripts = skills_root / "offerloop-setup" / "scripts"
    configure = setup_scripts / "configure.py"
    preflight = setup_scripts / "preflight.py"

    fake_bin = project / "test-bin"
    fake_bin.mkdir()
    fake_lark = fake_bin / "lark-cli"
    fake_lark.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    fake_lark.chmod(0o755)

    ready_env = dict(env)
    ready_env["PATH"] = os.pathsep.join((str(fake_bin), env.get("PATH", "")))
    run(
        [
            sys.executable,
            str(configure),
            "--profile",
            "cold-install-check",
            "--target-base-url",
            "https://example.feishu.cn/base/cold-install-check",
        ],
        cwd=project,
        env=ready_env,
    )
    report = load_report(
        [sys.executable, str(preflight), "--capability", "collection", "--json"],
        cwd=project,
        env=ready_env,
    )
    local_failures = [
        check
        for check in report["checks"]
        if check["status"] in {"blocked", "needs_action"}
    ]
    if local_failures:
        raise AssertionError(f"configured collection preflight failed: {local_failures}")
    checks = {check["id"]: check for check in report["checks"]}
    if checks["local.progress_locator"]["status"] != "unverified":
        raise AssertionError("optional progress locator must remain unverified")
    if checks["online.permissions"]["status"] != "unverified":
        raise AssertionError("offline acceptance must not claim online permissions")

    missing_env = dict(env)
    missing_env["PATH"] = str(project / "empty-bin")
    Path(missing_env["PATH"]).mkdir()
    missing_report = load_report(
        [sys.executable, str(preflight), "--capability", "collection", "--json"],
        cwd=project,
        env=missing_env,
    )
    lark_check = next(
        check
        for check in missing_report["checks"]
        if check["id"] == "local.lark_cli"
    )
    if lark_check["status"] != "blocked":
        raise AssertionError("missing lark-cli must block the selected capability")
    recovery = lark_check["next_action"]
    if recovery != LARK_CLI_RECOVERY:
        raise AssertionError("lark-cli recovery instruction changed")

    workspace_report = load_report(
        [sys.executable, str(preflight), "--capability", "workspace", "--json"],
        cwd=project,
        env=ready_env,
    )
    external_check = next(
        check
        for check in workspace_report["checks"]
        if check["id"] == "local.external_skills"
    )
    if external_check["status"] != "blocked":
        raise AssertionError("missing workspace Lark Skills must block workspace")
    if external_check["next_action"] != WORKSPACE_SKILLS_RECOVERY:
        raise AssertionError("workspace Lark Skills recovery instruction changed")

    serialized = json.dumps(missing_report, ensure_ascii=False)
    for private_value in (
        str(project),
        env["XDG_CONFIG_HOME"],
        "COLD_INSTALL_SECRET_DO_NOT_PRINT",
    ):
        if private_value in serialized:
            raise AssertionError("preflight report exposed local or secret data")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="local OfferLoop checkout used as the Skills CLI source",
    )
    args = parser.parse_args()
    source = args.source.resolve()
    if not (source / "skills" / "offerloop-setup" / "SKILL.md").is_file():
        raise SystemExit(f"not an OfferLoop checkout: {source}")

    with tempfile.TemporaryDirectory(prefix="offerloop-cold-install-") as temporary:
        project = Path(temporary)
        home = project / "home"
        config_home = project / "config"
        npm_cache = project / "npm-cache"
        home.mkdir()
        config_home.mkdir()
        npm_cache.mkdir()
        env = dict(os.environ)
        env.update(
            {
                "HOME": str(home),
                "XDG_CONFIG_HOME": str(config_home),
                "npm_config_cache": str(npm_cache),
                "IMAP_PASSWORD": "COLD_INSTALL_SECRET_DO_NOT_PRINT",
            }
        )
        command = [
            "npx",
            "--yes",
            f"skills@{SKILLS_CLI_VERSION}",
            "add",
            str(source),
            "--agent",
            "codex",
            "--copy",
            "--yes",
        ]
        for name in SKILL_NAMES:
            command.extend(("--skill", name))
        run(command, cwd=project, env=env)
        skills_root = assert_installed(project)
        assert_collection_preflight(project, skills_root, env)
        print(
            "cold install accepted: four Skills, two app templates, "
            "collection preflight, recovery, and redaction"
        )


if __name__ == "__main__":
    main()
