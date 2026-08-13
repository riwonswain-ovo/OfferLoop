#!/usr/bin/env python3
"""Choose and prepare an OfferLoop full or single-Skill installation."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile


ROOT = Path(__file__).resolve().parents[1]
INSTALLER_PATH = ROOT / "scripts" / "install_offerloop.py"
FULL_REQUIRED_LOCATORS = (
    "lark_profile",
    "target_base_url",
    "progress_base_url",
    "reminder_base_url",
    "wiki_space_id",
    "workspace_home_node_token",
    "workspace_core_data_node_token",
)


def _load_installer():
    spec = importlib.util.spec_from_file_location("offerloop_installer", INSTALLER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("OfferLoop installer is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _xdg_path(environ, variable: str, fallback: Path, filename: str) -> Path:
    source = dict(os.environ if environ is None else environ)
    home = Path(source.get("HOME", Path.home()))
    root = Path(source.get(variable, home / fallback))
    return root / "offerloop" / filename


def config_file(environ=None) -> Path:
    return _xdg_path(environ, "XDG_CONFIG_HOME", Path(".config"), "config.json")


def state_file(environ=None) -> Path:
    return _xdg_path(
        environ, "XDG_STATE_HOME", Path(".local/state"), "setup-state.json"
    )


def _load_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must contain a JSON object")
    return value


def _write_private_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix="offerloop-", dir=path.parent)
    try:
        if os.name != "nt":
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, path)
        if os.name != "nt":
            os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def workspace_locators_ready(config: dict) -> bool:
    if config.get("schema_version") != 5:
        return False
    if any(config.get(key) in (None, "") for key in FULL_REQUIRED_LOCATORS):
        return False
    return True


def workspace_locator_fingerprint(config: dict) -> str:
    payload = {
        key: config.get(key)
        for key in (*FULL_REQUIRED_LOCATORS, "schema_version")
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def workspace_status(config: dict) -> str:
    if not workspace_locators_ready(config):
        return "needs_setup"
    verification = config.get("workspace_verification")
    if not isinstance(verification, dict):
        return "needs_online_verification"
    if (
        verification.get("status") != "verified"
        or verification.get("schema_version") != 5
        or verification.get("locator_fingerprint")
        != workspace_locator_fingerprint(config)
    ):
        return "needs_online_verification"
    return "ready"


def _next_prompt() -> str:
    return (
        "请完成 OfferLoop 完整模式初始化：先读取已安装的 "
        ".offerloop-runtime/references/full-setup.md，做只读预检并向我展示将采用或创建的"
        "三张飞书 Base、私有知识库和目录计划；得到我确认后再执行线上写入，最后运行只读验收。"
    )


def setup(
    agent: str,
    mode: str,
    *,
    skill: str | None = None,
    environ=None,
    dry_run: bool = False,
    upgrade: bool = False,
) -> dict:
    installer = _load_installer()
    if mode not in {"full", "single"}:
        raise ValueError("mode must be full or single")
    if mode == "single":
        if skill not in installer.SKILL_NAMES:
            raise ValueError("single mode requires one supported --skill")
        selected = (skill,)
    else:
        if skill is not None:
            raise ValueError("--skill is only valid with --mode single")
        selected = installer.SKILL_NAMES

    installer.validate_sources(selected)
    install = installer.install_agent(
        agent,
        environ=environ,
        dry_run=dry_run,
        upgrade=upgrade,
        skill_names=selected,
        install_mode=mode,
    )
    if install["status"] == "conflict":
        return {
            "schema_version": 1,
            "status": "conflict",
            "mode": mode,
            "selected_skills": list(selected),
            "install": install,
            "next_action": install.get("next_action", "resolve the install conflict"),
        }

    config_path = config_file(environ)
    config = _load_json(config_path)
    config["installation"] = {
        "mode": mode,
        "selected_skills": list(selected),
        "offerloop_version": installer.offerloop_version(),
    }
    status = "ready" if mode == "single" else workspace_status(config)
    result = {
        "schema_version": 1,
        "status": status,
        "mode": mode,
        "selected_skills": list(selected),
        "install": install,
        "online_writes": False,
    }
    if mode == "full" and status != "ready":
        result["next_action"] = "start_agent_workspace_setup"
        result["next_prompt"] = _next_prompt()
    elif mode == "full":
        result["next_action"] = "restart_agent_and_run_verify"
    else:
        result["next_action"] = "restart_agent_and_use_selected_skill"

    if dry_run:
        result["dry_run"] = True
        return result

    _write_private_json(config_path, config)
    state = {
        "schema_version": 1,
        "mode": mode,
        "selected_skills": list(selected),
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "completed_phases": ["local_install", "mode_config"],
        "pending_phase": "feishu_workspace" if status == "needs_setup" else None,
    }
    _write_private_json(state_file(environ), state)
    return result


def verify(agent: str, mode: str, *, skill: str | None = None, environ=None) -> dict:
    installer = _load_installer()
    selected = (skill,) if mode == "single" and skill else installer.SKILL_NAMES
    if mode == "single" and skill not in installer.SKILL_NAMES:
        raise ValueError("single mode verification requires one supported --skill")
    install = installer.verify_agent(
        agent,
        environ=environ,
        skill_names=selected,
        install_mode=mode,
    )
    config = _load_json(config_file(environ))
    installation = config.get("installation", {})
    mode_ready = (
        isinstance(installation, dict)
        and installation.get("mode") == mode
        and installation.get("selected_skills") == list(selected)
    )
    workspace = "not_required" if mode == "single" else workspace_status(config)
    verified = install["verified"] and mode_ready and workspace in {"ready", "not_required"}
    result = {
        "schema_version": 1,
        "status": "ready" if verified else "needs_setup",
        "verified": verified,
        "mode": mode,
        "selected_skills": list(selected),
        "local_install": install,
        "mode_config": "ready" if mode_ready else "missing_or_mismatch",
        "workspace": workspace,
    }
    if mode == "full" and workspace != "ready":
        result["next_prompt"] = _next_prompt()
    return result


def record_workspace_verification(agent: str, *, environ=None) -> dict:
    """Record an Agent-completed online audit; this command does no network I/O."""
    installer = _load_installer()
    local = installer.verify_agent(
        agent,
        environ=environ,
        skill_names=installer.SKILL_NAMES,
        install_mode="full",
    )
    if not local["verified"]:
        raise ValueError("local full installation must verify before online completion")
    path = config_file(environ)
    config = _load_json(path)
    installation = config.get("installation")
    if not isinstance(installation, dict) or installation.get("mode") != "full":
        raise ValueError("full mode config must exist before online completion")
    if not workspace_locators_ready(config):
        raise ValueError("all schema v5 workspace locators are required")
    now = datetime.now(timezone.utc).isoformat()
    config["workspace_verification"] = {
        "status": "verified",
        "schema_version": 5,
        "verified_at": now,
        "locator_fingerprint": workspace_locator_fingerprint(config),
        "checks": ["three_bases", "wiki_structure", "locators", "permissions"],
    }
    _write_private_json(path, config)
    state = _load_json(state_file(environ))
    state.update(
        {
            "schema_version": 1,
            "mode": "full",
            "selected_skills": list(installer.SKILL_NAMES),
            "status": "ready",
            "updated_at": now,
            "completed_phases": [
                "local_install",
                "mode_config",
                "feishu_workspace",
                "online_verification",
            ],
            "pending_phase": None,
        }
    )
    _write_private_json(state_file(environ), state)
    return {
        "schema_version": 1,
        "status": "ready",
        "mode": "full",
        "selected_skills": list(installer.SKILL_NAMES),
        "online_writes": False,
        "verification_recorded": True,
    }


def main(argv=None) -> int:
    installer = _load_installer()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", required=True, choices=installer.ALL_AGENTS)
    parser.add_argument("--mode", required=True, choices=("full", "single"))
    parser.add_argument("--skill", choices=installer.SKILL_NAMES)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--upgrade", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--record-workspace-verified", action="store_true")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args(argv)
    if args.mode == "single" and not args.skill:
        parser.error("--mode single requires --skill")
    if args.mode == "full" and args.skill:
        parser.error("--skill is only valid with --mode single")
    if args.record_workspace_verified and args.mode != "full":
        parser.error("--record-workspace-verified requires --mode full")
    if args.record_workspace_verified and (args.verify or args.dry_run or args.upgrade):
        parser.error("--record-workspace-verified cannot be combined with other actions")
    if args.verify and (args.dry_run or args.upgrade):
        parser.error("--verify cannot be combined with --dry-run or --upgrade")

    try:
        result = (
            record_workspace_verification(args.agent)
            if args.record_workspace_verified
            else verify(args.agent, args.mode, skill=args.skill)
            if args.verify
            else setup(
                args.agent,
                args.mode,
                skill=args.skill,
                dry_run=args.dry_run,
                upgrade=args.upgrade,
            )
        )
    except (OSError, ValueError, RuntimeError) as exc:
        result = {"schema_version": 1, "status": "error", "error": type(exc).__name__}
        if args.as_json:
            print(json.dumps(result, indent=2))
        else:
            print(f"OfferLoop setup failed: {exc}")
        return 1

    if args.as_json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"OfferLoop {result['mode']} setup: {result['status']}")
        print("Skills: " + ", ".join(result["selected_skills"]))
        if result.get("next_prompt"):
            print("下一步在新 Agent 会话中发送：")
            print(result["next_prompt"])
    return 0 if result["status"] in {"ready", "needs_setup"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
