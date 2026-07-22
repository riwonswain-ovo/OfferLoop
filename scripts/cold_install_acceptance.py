#!/usr/bin/env python3
"""Exercise the documented multi-Agent install path in an isolated home."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


SKILL_NAMES = (
    "offerloop-setup",
    "job-collection",
    "recruiting-reminder",
    "offerloop-workspace",
)
AGENT_ROOTS = {
    "codex": Path(".codex/skills"),
    "claude-code": Path(".claude/skills"),
    "hermes-agent": Path(".hermes/skills"),
    "workbuddy": Path(".workbuddy/skills"),
}
LARK_CLI_RECOVERY = (
    "运行 `npx @larksuite/cli@latest install` 安装 lark-cli；再运行 "
    "Agent 对应的 `npx skills add larksuite/cli -g -a codex -y`、"
    "`-a claude-code` 或 `-a hermes-agent` 安装官方 Lark Skills，"
    "然后新开 Agent 会话。WorkBuddy 请在“专家·技能·连接器”中启用飞书连接器，"
    "再新建任务"
)
WORKSPACE_SKILLS_RECOVERY = (
    "缺少：lark-base、lark-doc、lark-wiki。运行 "
    "Agent 对应的 `npx skills add larksuite/cli -g -a codex -y`、"
    "`-a claude-code` 或 `-a hermes-agent` "
    "安装官方 Lark Skills，然后新开 Agent 会话；WorkBuddy 请在"
    "“专家·技能·连接器”中启用飞书连接器，再新建任务"
)


def run(command, *, cwd, env):
    return subprocess.run(
        command,
        cwd=cwd,
        env=env,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )


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


def assert_installed(home, agent):
    skills_root = home / AGENT_ROOTS[agent]
    for name in SKILL_NAMES:
        skill_file = skills_root / name / "SKILL.md"
        if not skill_file.is_file():
            raise AssertionError(f"{agent}: missing installed Skill: {name}")
        if (skills_root / name / "tests").exists():
            raise AssertionError(f"{agent}: installer copied development tests")
    if not (skills_root / ".offerloop-install.json").is_file():
        raise AssertionError(f"{agent}: missing installation manifest")
    return skills_root


def install_all_agents(source, project, home, env):
    installer = source / "scripts" / "install_offerloop.py"
    command = [sys.executable, str(installer)]
    for agent in AGENT_ROOTS:
        command.extend(("--agent", agent))
    command.append("--json")
    completed = run(command, cwd=project, env=env)
    if "Failed to install" in completed.stdout:
        raise AssertionError("documented installer emitted a contradictory failure")
    report = json.loads(completed.stdout)
    statuses = {item["agent"]: item["status"] for item in report["results"]}
    if statuses != {agent: "installed" for agent in AGENT_ROOTS}:
        raise AssertionError(f"unexpected install statuses: {statuses}")
    roots = {agent: assert_installed(home, agent) for agent in AGENT_ROOTS}

    repeated = run(command, cwd=project, env=env)
    repeated_report = json.loads(repeated.stdout)
    repeated_statuses = {
        item["agent"]: item["status"] for item in repeated_report["results"]
    }
    if repeated_statuses != {agent: "already_installed" for agent in AGENT_ROOTS}:
        raise AssertionError(f"installer is not idempotent: {repeated_statuses}")
    return roots


def assert_collection_preflight(project, skills_root, env):
    setup_scripts = skills_root / "offerloop-setup" / "scripts"
    configure = setup_scripts / "configure.py"
    preflight = setup_scripts / "preflight.py"

    fake_bin = project / "test-bin"
    fake_bin.mkdir()
    fake_program = fake_bin / "fake_lark.py"
    fake_program.write_text(
        "import json, sys\n"
        "args = sys.argv[1:]\n"
        "if args == ['--version']:\n"
        "    print('lark-cli version 1.0.73')\n"
        "elif args == ['profile', 'list']:\n"
        "    print(json.dumps([{'name': 'cold-install-check'}]))\n"
        "elif args[:2] == ['doctor', '--offline']:\n"
        "    print(json.dumps({'ok': True}))\n"
        "else:\n"
        "    raise SystemExit(2)\n",
        encoding="utf-8",
    )
    if os.name == "nt":
        fake_lark = fake_bin / "lark-cli.cmd"
        fake_lark.write_text(
            f'@"{sys.executable}" "%~dp0fake_lark.py" %*\r\n',
            encoding="utf-8",
        )
    else:
        fake_lark = fake_bin / "lark-cli"
        fake_lark.write_text(
            f"#!{sys.executable}\n"
            "import runpy\n"
            "runpy.run_path(__file__.replace('lark-cli', 'fake_lark.py'), run_name='__main__')\n",
            encoding="utf-8",
        )
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
        home.mkdir()
        config_home.mkdir()
        env = dict(os.environ)
        env.update(
            {
                "HOME": str(home),
                "XDG_CONFIG_HOME": str(config_home),
                "IMAP_PASSWORD": "COLD_INSTALL_SECRET_DO_NOT_PRINT",
            }
        )
        roots = install_all_agents(source, project, home, env)
        assert_collection_preflight(project, roots["codex"], env)
        print(
            "cold install accepted: four Agents, four Skills, idempotency, "
            "collection preflight, recovery, and redaction"
        )


if __name__ == "__main__":
    main()
