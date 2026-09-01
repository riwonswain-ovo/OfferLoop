#!/usr/bin/env python3
"""Exercise the bundled copy installer in isolated Agent homes."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


SKILL_NAMES = (
    "job-collection",
    "recruiting-reminder",
    "experience-deepthink",
    "resume-tailor",
    "interview-prep",
    "mock-lab",
    "talk-review",
)
AGENT_ROOTS = {
    "codex": Path(".codex/skills"),
    "claude-code": Path(".claude/skills"),
    "hermes-agent": Path(".hermes/skills"),
    "workbuddy": Path(".workbuddy/skills"),
}
LARK_CLI_RECOVERY = (
    "运行 `npx @larksuite/cli@latest install` 安装 lark-cli；再运行 "
    "Agent 对应的 `npx skills add larksuite/cli -g -a codex`、"
    "`-a claude-code` 或 `-a hermes-agent` 安装官方 Lark Skills，"
    "然后新开 Agent 会话。WorkBuddy 请在“专家·技能·连接器”中启用飞书连接器，"
    "再新建任务"
)
WORKSPACE_SKILLS_RECOVERY = (
    "缺少：lark-base、lark-doc、lark-wiki。运行 "
    "Agent 对应的 `npx skills add larksuite/cli -g -a codex`、"
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
    setup = source / "scripts" / "setup_offerloop.py"
    installer = source / "scripts" / "install_offerloop.py"
    reports = {}
    for agent in AGENT_ROOTS:
        command = [
            sys.executable,
            str(setup),
            "--agent",
            agent,
            "--mode",
            "full",
            "--json",
        ]
        report = load_report(command, cwd=project, env=env)
        reports[agent] = report
        if report["status"] != "needs_setup":
            raise AssertionError(f"{agent}: unexpected setup status: {report}")
        if report["install"]["status"] != "installed":
            raise AssertionError(f"{agent}: local install did not complete: {report}")
        expected_phases = {
            "local_install": "ready",
            "workspace_prerequisites": "blocked",
            "feishu_workspace": "needs_setup",
            "sync_automation": "needs_setup",
            "daily_checkin": "needs_decision",
        }
        actual_phases = {
            name: value["status"] for name, value in report["phases"].items()
        }
        if actual_phases != expected_phases:
            raise AssertionError(f"{agent}: unexpected setup phases: {actual_phases}")
        if report.get("next_action") != "install_workspace_prerequisites":
            raise AssertionError(f"{agent}: missing dependency recovery action")
        serialized = json.dumps(report, ensure_ascii=False)
        for private_value in (
            str(project),
            env["XDG_CONFIG_HOME"],
            "COLD_INSTALL_SECRET_DO_NOT_PRINT",
        ):
            if private_value in serialized:
                raise AssertionError("setup report exposed local or secret data")
    roots = {agent: assert_installed(home, agent) for agent in AGENT_ROOTS}

    verify_command = [sys.executable, str(installer)]
    for agent in AGENT_ROOTS:
        verify_command.extend(("--agent", agent))
    verify_command.extend(("--verify", "--json"))
    verified_report = json.loads(
        run(verify_command, cwd=project, env=env).stdout
    )
    if not verified_report.get("verified"):
        raise AssertionError(
            f"documented post-install verification failed: {verified_report}"
        )
    if {
        item["agent"]: item["manifest"]
        for item in verified_report["results"]
    } != {agent: "ready" for agent in AGENT_ROOTS}:
        raise AssertionError("post-install manifest verification failed")

    for agent in AGENT_ROOTS:
        repeated_report = load_report(
            [
                sys.executable,
                str(setup),
                "--agent",
                agent,
                "--mode",
                "full",
                "--json",
            ],
            cwd=project,
            env=env,
        )
        if repeated_report["install"]["status"] != "already_installed":
            raise AssertionError(
                f"{agent}: setup entrypoint is not idempotent: {repeated_report}"
            )
    return roots


def assert_conflict_and_upgrade(source, project, env):
    setup = source / "scripts" / "setup_offerloop.py"
    conflict = Path(env["HOME"]) / ".codex" / "skills" / "job-collection"
    shutil.rmtree(conflict)
    conflict.mkdir(parents=True)
    (conflict / "SKILL.md").write_text("user-owned fixture\n", encoding="utf-8")
    command = [
        sys.executable,
        str(setup),
        "--agent",
        "codex",
        "--mode",
        "full",
        "--json",
    ]
    completed = subprocess.run(
        command,
        cwd=project,
        env=env,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
    )
    report = json.loads(completed.stdout)
    if completed.returncode == 0 or report["status"] != "conflict":
        raise AssertionError("conflicting user Skill must stop setup")
    if (conflict / "SKILL.md").read_text(encoding="utf-8") != "user-owned fixture\n":
        raise AssertionError("conflict preview modified user-owned content")

    upgraded = load_report([*command[:-1], "--upgrade", "--json"], cwd=project, env=env)
    if upgraded["install"]["status"] != "upgraded":
        raise AssertionError("--upgrade did not recover the conflicting install")
    backups = list(
        (conflict.parent.parent / ".offerloop-backups").glob(
            "*/job-collection/SKILL.md"
        )
    )
    if len(backups) != 1 or backups[0].read_text(encoding="utf-8") != "user-owned fixture\n":
        raise AssertionError("--upgrade did not preserve the conflicting Skill backup")


def assert_collection_preflight(project, skills_root, env):
    setup_scripts = skills_root / ".offerloop-runtime" / "scripts"
    configure = setup_scripts / "configure.py"
    preflight = setup_scripts / "preflight.py"

    # The core workspace is mandatory for every capability. Simulate the
    # separately installed official Lark Skills in this isolated Agent root.
    for name in ("lark-base", "lark-doc", "lark-wiki"):
        skill_dir = skills_root / name
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(
            f"---\nname: {name}\ndescription: cold-install fixture\n---\n",
            encoding="utf-8",
        )

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
            "--progress-base-url",
            "https://example.feishu.cn/base/cold-progress-check",
            "--reminder-base-url",
            "https://example.feishu.cn/base/cold-reminder-check",
            "--wiki-space-id",
            "cold_space",
            "--workspace-home-node-token",
            "cold_home",
            "--workspace-core-data-node-token",
            "cold_core_data",
            "--schema-version",
            "5",
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
    if checks["local.progress_locator"]["status"] != "ready":
        raise AssertionError("mandatory progress locator must be ready")
    if checks["online.permissions"]["status"] != "unverified":
        raise AssertionError("offline acceptance must not claim online permissions")

    missing_env = dict(env)
    missing_env["PATH"] = str(project / "empty-bin")
    Path(missing_env["PATH"]).mkdir(exist_ok=True)
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

    for name in ("lark-base", "lark-doc", "lark-wiki"):
        shutil.rmtree(skills_root / name)
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
    if not (source / "scripts" / "install_offerloop.py").is_file():
        raise SystemExit(f"not an OfferLoop checkout: {source}")
    if not all((source / "skills" / name / "SKILL.md").is_file() for name in SKILL_NAMES):
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
        empty_bin = project / "empty-bin"
        empty_bin.mkdir()
        env["PATH"] = str(empty_bin)
        nonempty = home / ".claude" / "skills" / "unrelated-user-skill"
        nonempty.mkdir(parents=True)
        (nonempty / "SKILL.md").write_text(
            "---\nname: unrelated-user-skill\ndescription: preserve me\n---\n",
            encoding="utf-8",
        )
        roots = install_all_agents(source, project, home, env)
        if not (nonempty / "SKILL.md").is_file():
            raise AssertionError("setup modified an unrelated non-empty Skill directory")
        assert_conflict_and_upgrade(source, project, env)
        assert_collection_preflight(project, roots["codex"], env)
        print(
            "cold install accepted: README setup entrypoint, four Agents, empty and "
            "non-empty roots, idempotency, conflict recovery, post-install verification, "
            "collection preflight, dependency recovery, and redaction"
        )


if __name__ == "__main__":
    main()
