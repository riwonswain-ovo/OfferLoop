#!/usr/bin/env python3
"""Prepare the complete OfferLoop installation and Feishu workspace."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import shutil
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
INSTALLER_PATH = ROOT / "scripts" / "install_offerloop.py"
PREFLIGHT_PATH = (
    ROOT / "runtime" / "offerloop" / "admin" / "scripts" / "preflight.py"
)
WORKSPACE_CONFIG_SCHEMA = 7
AUTOMATION_VERIFICATION_SCHEMA = 1
SYNC_AUTOMATION_CHECKS = {
    "sync_service_release",
    "enterprise_main_child_workflows",
    "enterprise_progress_workflow",
    "reminder_progress_workflow",
}
DAILY_CHECKIN_CHECKS = {
    "daily_checkin_trigger",
    "daily_checkin_card_callback",
    "daily_checkin_permissions",
    "calendar_scope_isolation_verified",
}
ACTIVE_ARTIFACT_READINESS = {
    "experience_deepthink",
    "current_resumes",
    "interview_prep",
    "mock_lab",
    "talk_review",
}
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


def _load_preflight():
    spec = importlib.util.spec_from_file_location(
        "offerloop_prerequisite_preflight", PREFLIGHT_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("OfferLoop prerequisite preflight is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _emit_progress(progress, event: str, *, agent: str | None = None) -> None:
    if progress is not None:
        progress(event, agent=agent)


_PROGRESS_LABELS = {
    "source_validation": "校验安装源",
    "hash_sources": "校验本地文件完整性",
    "scan_targets": "扫描目标 Skill 目录（最多六层）",
    "stage_files": "暂存 OfferLoop 文件",
    "commit_files": "安装 OfferLoop 文件",
    "local_complete": "本地 Skill 安装完成",
    "local_conflict": "目标扫描完成，发现同名冲突",
    "dependency_check": "检查工作区依赖",
    "write_config": "记录本地安装状态",
    "complete": "安装流程完成",
}


def _human_progress(event: str, *, agent: str | None = None) -> None:
    label = _PROGRESS_LABELS.get(event, event)
    prefix = f"[{agent}] " if agent else ""
    print(f"OfferLoop · {prefix}{label}…", flush=True)


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


def loop_state_file(environ=None) -> Path:
    source = dict(os.environ if environ is None else environ)
    explicit = source.get("OFFERLOOP_LOOP_STATE")
    if explicit:
        return Path(explicit).expanduser()
    return _xdg_path(
        environ, "XDG_STATE_HOME", Path(".local/state"), "loop-runtime.json"
    )


def retirement_backup_root(environ=None) -> Path:
    source = dict(os.environ if environ is None else environ)
    home = Path(source.get("HOME", Path.home()))
    root = Path(source.get("XDG_STATE_HOME", home / ".local/state"))
    return root / "offerloop" / "retirement-backups"


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


def _file_digest(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def _path_digest(path: Path, installer) -> str:
    return installer.tree_digest(path) if path.is_dir() else _file_digest(path)


def _copy_private(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if source.is_dir():
        shutil.copytree(source, destination)
        if os.name != "nt":
            for path in destination.rglob("*"):
                os.chmod(path, 0o700 if path.is_dir() else 0o600)
            os.chmod(destination, 0o700)
        return
    shutil.copy2(source, destination)
    if os.name != "nt":
        os.chmod(destination, 0o600)


def _path_modes(path: Path) -> dict[str, int]:
    if os.name == "nt":
        return {}
    if path.is_file():
        return {".": path.stat().st_mode & 0o777}
    modes = {".": path.stat().st_mode & 0o777}
    for child in path.rglob("*"):
        modes[child.relative_to(path).as_posix()] = child.stat().st_mode & 0o777
    return modes


def _restore_path_modes(path: Path, modes: dict[str, int]) -> None:
    if os.name == "nt":
        return
    for relative, mode in sorted(modes.items(), key=lambda item: item[0].count("/"), reverse=True):
        target = path if relative == "." else path / relative
        if target.exists():
            os.chmod(target, int(mode))


def _validate_preference_snapshot(payload: dict) -> dict:
    preference = payload.get("base_preference")
    if not isinstance(preference, dict):
        raise ValueError("snapshot input requires a base_preference object")
    required = ("base_url", "table_id", "record_id", "fields")
    if any(preference.get(key) in (None, "") for key in required[:-1]):
        raise ValueError("base_preference requires base_url, table_id, and record_id")
    if not isinstance(preference.get("fields"), dict):
        raise ValueError("base_preference.fields must be an object")
    return preference


def _validate_workspace_directory_snapshot(payload: dict) -> dict | None:
    state = payload.get("workspace_directories")
    if state is None:
        return None
    if not isinstance(state, dict) or not str(state.get("root_token", "")).strip():
        raise ValueError("workspace_directories requires root_token")
    nodes = state.get("nodes")
    if not isinstance(nodes, list):
        raise ValueError("workspace_directories.nodes must be an array")
    for node in nodes:
        if not isinstance(node, dict) or any(
            not str(node.get(key, "")).strip()
            for key in ("token", "title", "parent_token")
        ):
            raise ValueError(
                "each workspace directory requires token, title, and parent_token"
            )
    return state


def create_retirement_snapshot(agent: str, payload: dict, *, environ=None) -> dict:
    installer = _load_installer()
    preference = _validate_preference_snapshot(payload)
    workspace_directories = _validate_workspace_directory_snapshot(payload)
    root = installer.agent_root(agent, environ)
    if root is None:
        raise ValueError(f"unsupported Agent: {agent}")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    snapshot_id = f"{stamp}-{secrets.token_hex(4)}"
    destination = retirement_backup_root(environ) / snapshot_id
    destination.mkdir(parents=True, mode=0o700)
    components = {}
    names = tuple(
        dict.fromkeys(
            (*installer.SKILL_NAMES, "career-profile", "competency-lab", installer.SUPPORT_NAME)
        )
    )
    try:
        for name in names:
            source = root / name
            if not source.exists():
                continue
            modes = _path_modes(source)
            target = destination / "components" / name
            _copy_private(source, target)
            components[name] = {
                "kind": "directory",
                "digest": _path_digest(target, installer),
                "modes": modes,
            }
        manifest_source = root / installer.MANIFEST_NAME
        if manifest_source.exists():
            modes = _path_modes(manifest_source)
            target = destination / "components" / installer.MANIFEST_NAME
            _copy_private(manifest_source, target)
            components[installer.MANIFEST_NAME] = {
                "kind": "file",
                "digest": _path_digest(target, installer),
                "modes": modes,
            }
        local_files = {}
        for label, source in (
            ("config", config_file(environ)),
            ("setup_state", state_file(environ)),
            ("loop_state", loop_state_file(environ)),
        ):
            metadata = {"original_path": str(source), "existed": source.exists()}
            if source.exists():
                metadata["modes"] = _path_modes(source)
                target = destination / "local" / f"{label}.json"
                _copy_private(source, target)
                metadata["digest"] = _file_digest(target)
            local_files[label] = metadata
        _write_private_json(
            destination / "base-preference.json",
            {"base_preference": preference},
        )
        if workspace_directories is not None:
            _write_private_json(
                destination / "workspace-directories.json",
                {"workspace_directories": workspace_directories},
            )
        manifest = {
            "schema_version": 1,
            "snapshot_id": snapshot_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "agent": agent,
            "agent_root": str(root),
            "source_offerloop_version": installer.offerloop_version(),
            "components": components,
            "local_files": local_files,
            "base_preference_digest": _file_digest(destination / "base-preference.json"),
        }
        if workspace_directories is not None:
            manifest["workspace_directories_digest"] = _file_digest(
                destination / "workspace-directories.json"
            )
        _write_private_json(destination / "manifest.json", manifest)
    except Exception:
        shutil.rmtree(destination, ignore_errors=True)
        raise
    return {
        "schema_version": 1,
        "status": "snapshot_created",
        "snapshot_id": snapshot_id,
        "snapshot_path": str(destination),
        "components": sorted(components),
        "online_writes": False,
        "workspace_directory_state_saved": workspace_directories is not None,
    }


def _load_retirement_snapshot(snapshot_id: str, *, environ=None) -> tuple[Path, dict]:
    if not snapshot_id or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_" for char in snapshot_id):
        raise ValueError("invalid retirement snapshot id")
    root = retirement_backup_root(environ) / snapshot_id
    manifest = _load_json(root / "manifest.json")
    if manifest.get("snapshot_id") != snapshot_id or manifest.get("schema_version") != 1:
        raise ValueError("invalid retirement snapshot manifest")
    return root, manifest


def _verify_retirement_snapshot(root: Path, manifest: dict, installer) -> None:
    for name, metadata in manifest.get("components", {}).items():
        target = root / "components" / name
        if not target.exists() or _path_digest(target, installer) != metadata.get("digest"):
            raise ValueError(f"retirement snapshot component failed verification: {name}")
    for label, metadata in manifest.get("local_files", {}).items():
        if not metadata.get("existed"):
            continue
        target = root / "local" / f"{label}.json"
        if not target.is_file() or _file_digest(target) != metadata.get("digest"):
            raise ValueError(f"retirement snapshot local file failed verification: {label}")
    preference = root / "base-preference.json"
    if not preference.is_file() or _file_digest(preference) != manifest.get("base_preference_digest"):
        raise ValueError("retirement snapshot Base preference failed verification")
    workspace_digest = manifest.get("workspace_directories_digest")
    if workspace_digest:
        workspace = root / "workspace-directories.json"
        if not workspace.is_file() or _file_digest(workspace) != workspace_digest:
            raise ValueError("retirement snapshot workspace directories failed verification")


def rollback_retirement_snapshot(
    agent: str,
    snapshot_id: str,
    *,
    environ=None,
    dry_run: bool = False,
    confirmed: bool = False,
) -> dict:
    if not dry_run and not confirmed:
        raise ValueError("rollback requires --confirmed unless --dry-run is used")
    installer = _load_installer()
    snapshot_root, manifest = _load_retirement_snapshot(snapshot_id, environ=environ)
    if manifest.get("agent") != agent:
        raise ValueError("retirement snapshot belongs to a different Agent")
    target_root = installer.agent_root(agent, environ)
    if target_root is None or str(target_root) != manifest.get("agent_root"):
        raise ValueError("retirement snapshot Agent root does not match current environment")
    _verify_retirement_snapshot(snapshot_root, manifest, installer)
    preference = _load_json(snapshot_root / "base-preference.json")["base_preference"]
    workspace_state = None
    if manifest.get("workspace_directories_digest"):
        workspace_state = _load_json(
            snapshot_root / "workspace-directories.json"
        )["workspace_directories"]
    result = {
        "schema_version": 1,
        "status": "rollback_preview" if dry_run else "rolled_back",
        "snapshot_id": snapshot_id,
        "agent": agent,
        "components": sorted(manifest.get("components", {})),
        "local_files": sorted(manifest.get("local_files", {})),
        "base_restore_patch": preference,
        "base_restore_requires_agent_confirmation": True,
        "online_writes": False,
    }
    if workspace_state is not None:
        result["workspace_directory_restore_state"] = workspace_state
        result["workspace_directory_restore_requires_agent_confirmation"] = True
    if dry_run:
        return result

    attempt = snapshot_root / "rollback-attempt"
    if attempt.exists():
        shutil.rmtree(attempt)
    attempt.mkdir(parents=True, mode=0o700)
    moved = []
    local_backups = []
    local_targets = []
    try:
        target_root.mkdir(parents=True, exist_ok=True)
        component_names = set(manifest.get("components", {}))
        component_names.update((*installer.SKILL_NAMES, "career-profile", "competency-lab", installer.SUPPORT_NAME, installer.MANIFEST_NAME))
        for name in sorted(component_names):
            current = target_root / name
            if current.exists():
                backup = attempt / "components" / name
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(current), str(backup))
                moved.append((backup, current))
        for name in sorted(component_names):
            current = target_root / name
            source = snapshot_root / "components" / name
            if source.exists():
                _copy_private(source, current)
                _restore_path_modes(
                    current, manifest["components"][name].get("modes", {})
                )
        for label, metadata in manifest.get("local_files", {}).items():
            current = Path(metadata["original_path"])
            local_targets.append(current)
            if current.exists():
                backup = attempt / "local-current" / f"{label}.json"
                _copy_private(current, backup)
                local_backups.append((backup, current))
            if metadata.get("existed"):
                _copy_private(snapshot_root / "local" / f"{label}.json", current)
                _restore_path_modes(current, metadata.get("modes", {}))
            elif current.exists():
                current.unlink()
        for name, metadata in manifest.get("components", {}).items():
            if _path_digest(target_root / name, installer) != metadata.get("digest"):
                raise RuntimeError(f"restored component failed verification: {name}")
        for label, metadata in manifest.get("local_files", {}).items():
            current = Path(metadata["original_path"])
            if metadata.get("existed"):
                if not current.is_file() or _file_digest(current) != metadata.get("digest"):
                    raise RuntimeError(f"restored local file failed verification: {label}")
            elif current.exists():
                raise RuntimeError(f"restored local file should be absent: {label}")
    except Exception:
        for name in sorted(component_names):
            current = target_root / name
            if current.is_dir():
                shutil.rmtree(current)
            elif current.exists():
                current.unlink()
        for backup, current in reversed(moved):
            current.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(backup), str(current))
        for current in local_targets:
            if current.exists():
                current.unlink()
        for backup, current in reversed(local_backups):
            _copy_private(backup, current)
        shutil.rmtree(attempt, ignore_errors=True)
        raise
    shutil.rmtree(attempt, ignore_errors=True)
    return result


def workspace_locators_ready(config: dict) -> bool:
    if config.get("schema_version") != WORKSPACE_CONFIG_SCHEMA:
        return False
    if any(config.get(key) in (None, "") for key in FULL_REQUIRED_LOCATORS):
        return False
    return True


def migrate_workspace_config(config: dict) -> dict:
    """Upgrade non-secret workspace config while preserving retired locators."""

    migrated = dict(config)
    current = migrated.get("schema_version")
    if isinstance(current, int) and current > WORKSPACE_CONFIG_SCHEMA:
        raise ValueError("OfferLoop config uses a newer unsupported schema")
    migrated["schema_version"] = WORKSPACE_CONFIG_SCHEMA
    storage = migrated.get("artifact_storage")
    if isinstance(storage, dict):
        storage = dict(storage)
        readiness = storage.get("readiness")
        if isinstance(readiness, dict):
            storage["readiness"] = {
                key: value
                for key, value in readiness.items()
                if key in ACTIVE_ARTIFACT_READINESS
            }
        migrated["artifact_storage"] = storage
    return migrated


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
        or verification.get("schema_version") != WORKSPACE_CONFIG_SCHEMA
        or verification.get("locator_fingerprint")
        != workspace_locator_fingerprint(config)
    ):
        return "needs_online_verification"
    return "ready"


def _progress_sync_config_ready(config: dict) -> bool:
    bridge = config.get("progress_sync")
    return bool(
        isinstance(bridge, dict)
        and bridge.get("status") == "enabled"
        and all(
            bridge.get(key) not in (None, "")
            for key in ("app_id", "endpoint", "workflow_id")
        )
    )


def _daily_checkin_config_status(config: dict) -> str:
    daily = config.get("daily_checkin")
    if daily in (None, {}):
        return "needs_decision"
    if not isinstance(daily, dict):
        return "needs_setup"
    if daily.get("status") == "disabled":
        return "disabled"
    if daily.get("status") != "enabled":
        return "needs_decision"
    valid = (
        str(daily.get("chat_id", "")).startswith("oc_")
        and str(daily.get("owner_open_id", "")).startswith("ou_")
        and bool(str(daily.get("calendar_id", "")).strip())
        and daily.get("timezone") == "Asia/Shanghai"
        and daily.get("time") == "22:10"
    )
    return "configured" if valid else "needs_setup"


def _fingerprint(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def sync_automation_fingerprint(config: dict) -> str:
    bridge = config.get("progress_sync")
    public_bridge = (
        {
            key: bridge.get(key)
            for key in ("app_id", "endpoint", "workflow_id", "status")
        }
        if isinstance(bridge, dict)
        else None
    )
    return _fingerprint(
        {
            "schema_version": config.get("schema_version"),
            "lark_profile": config.get("lark_profile"),
            "target_base_url": config.get("target_base_url"),
            "progress_base_url": config.get("progress_base_url"),
            "reminder_base_url": config.get("reminder_base_url"),
            "progress_sync": public_bridge,
        }
    )


def daily_checkin_fingerprint(config: dict) -> str:
    daily = config.get("daily_checkin")
    public_daily = (
        {
            key: daily.get(key)
            for key in (
                "status",
                "chat_id",
                "owner_open_id",
                "calendar_id",
                "timezone",
                "time",
            )
        }
        if isinstance(daily, dict)
        else None
    )
    return _fingerprint(
        {
            "schema_version": config.get("schema_version"),
            "reminder_base_url": config.get("reminder_base_url"),
            "progress_sync_app_id": (
                config.get("progress_sync", {}).get("app_id")
                if isinstance(config.get("progress_sync"), dict)
                else None
            ),
            "daily_checkin": public_daily,
        }
    )


def sync_automation_status(config: dict) -> str:
    if workspace_status(config) != "ready" or not _progress_sync_config_ready(config):
        return "needs_setup"
    verification = config.get("automation_verification")
    if not isinstance(verification, dict):
        return "needs_online_verification"
    checks = set(verification.get("checks", []))
    if (
        verification.get("status") != "verified"
        or verification.get("schema_version") != AUTOMATION_VERIFICATION_SCHEMA
        or verification.get("sync_fingerprint")
        != sync_automation_fingerprint(config)
        or not SYNC_AUTOMATION_CHECKS.issubset(checks)
    ):
        return "needs_online_verification"
    return "ready"


def daily_checkin_status(config: dict) -> str:
    configured = _daily_checkin_config_status(config)
    if configured != "configured":
        return configured
    verification = config.get("automation_verification")
    if not isinstance(verification, dict):
        return "needs_online_verification"
    checks = set(verification.get("checks", []))
    if (
        verification.get("status") != "verified"
        or verification.get("schema_version") != AUTOMATION_VERIFICATION_SCHEMA
        or verification.get("daily_checkin_fingerprint")
        != daily_checkin_fingerprint(config)
        or not DAILY_CHECKIN_CHECKS.issubset(checks)
    ):
        return "needs_online_verification"
    return "ready"


def readiness(config: dict) -> dict:
    workspace = workspace_status(config)
    sync = sync_automation_status(config)
    daily = daily_checkin_status(config)
    return {
        "workspace_ready": workspace == "ready",
        "sync_ready": sync == "ready",
        "daily_checkin_ready": daily == "ready",
        "daily_checkin_selected": _daily_checkin_config_status(config)
        in {"configured", "disabled"},
    }


def complete_system_status(config: dict) -> str:
    if workspace_status(config) != "ready":
        return "needs_setup"
    if sync_automation_status(config) != "ready":
        return "needs_setup"
    if daily_checkin_status(config) not in {"ready", "disabled"}:
        return "needs_setup"
    return "ready"


def _next_prompt() -> str:
    return (
        "请完成 OfferLoop 完整模式初始化：先读取已安装的 "
        ".offerloop-runtime/references/full-setup.md，做只读预检并向我展示将采用或创建的"
        "三张飞书 Base、私有知识库、同步服务、12 条 Base workflow 和每日卡片选择；"
        "得到我确认后再执行线上写入，最后运行完整自动化验收。"
    )


def _automation_prompt() -> str:
    return (
        "请继续完成 OfferLoop 自动化闭环：读取已安装的 "
        ".offerloop-runtime/references/one-click-deploy.md，发布同步服务，创建并启用"
        "企业主子表双向同步、企业清单到求职进展及笔面试中心到求职进展的 12 条 workflow；"
        "再询问我是否启用每日 22:10 群卡片。完成真实回读后记录自动化验收。"
    )


def setup(
    agent: str,
    mode: str,
    *,
    environ=None,
    dry_run: bool = False,
    upgrade: bool = False,
    progress=None,
) -> dict:
    installer = _load_installer()
    if mode != "full":
        raise ValueError("OfferLoop only supports the full Feishu workspace mode")
    selected = installer.SKILL_NAMES

    _emit_progress(progress, "source_validation", agent=agent)
    installer.validate_sources(selected)
    install = installer.install_agent(
        agent,
        environ=environ,
        dry_run=dry_run,
        upgrade=upgrade,
        skill_names=selected,
        install_mode=mode,
        progress=progress,
    )
    _emit_progress(progress, "dependency_check", agent=agent)
    prerequisites = _load_preflight().run_prerequisite_checks(
        environ=environ,
        capability="workspace",
    )
    phases = {
        "local_install": {
            "status": "conflict" if install["status"] == "conflict" else "ready"
        },
        "workspace_prerequisites": {
            "status": prerequisites["status"],
            "checks": prerequisites["checks"],
        },
        "feishu_workspace": {"status": "needs_setup"},
        "sync_automation": {"status": "needs_setup"},
        "daily_checkin": {"status": "needs_decision"},
    }
    if install["status"] == "conflict":
        _emit_progress(progress, "complete", agent=agent)
        return {
            "schema_version": 1,
            "status": "conflict",
            "mode": mode,
            "selected_skills": list(selected),
            "install": install,
            "phases": phases,
            "next_action": install.get("next_action", "resolve the install conflict"),
        }

    config_path = config_file(environ)
    config = migrate_workspace_config(_load_json(config_path))
    config["installation"] = {
        "mode": mode,
        "selected_skills": list(selected),
        "offerloop_version": installer.offerloop_version(),
    }
    workspace = workspace_status(config)
    sync = sync_automation_status(config)
    daily = daily_checkin_status(config)
    status = complete_system_status(config)
    phases["feishu_workspace"]["status"] = workspace
    phases["sync_automation"]["status"] = sync
    phases["daily_checkin"]["status"] = daily
    result = {
        "schema_version": 1,
        "status": status,
        "mode": mode,
        "selected_skills": list(selected),
        "install": install,
        "phases": phases,
        "readiness": readiness(config),
        "online_writes": False,
    }
    if prerequisites["status"] == "blocked":
        result["next_action"] = "install_workspace_prerequisites"
        result["next_prompt"] = (
            "请先补齐 OfferLoop 工作区依赖（安装器不会自动运行 npm 或 npx）："
            + "；".join(prerequisites["next_actions"])
        )
    elif workspace != "ready":
        result["next_action"] = "start_agent_workspace_setup"
        result["next_prompt"] = _next_prompt()
    elif sync != "ready" or daily not in {"ready", "disabled"}:
        result["next_action"] = "start_agent_automation_setup"
        result["next_prompt"] = _automation_prompt()
    else:
        result["next_action"] = "restart_agent_and_run_verify"

    if dry_run:
        result["dry_run"] = True
        _emit_progress(progress, "complete", agent=agent)
        return result

    _emit_progress(progress, "write_config", agent=agent)
    _write_private_json(config_path, config)
    state = {
        "schema_version": 1,
        "mode": mode,
        "selected_skills": list(selected),
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "completed_phases": ["local_install", "mode_config"],
        "pending_phase": (
            "workspace_prerequisites"
            if prerequisites["status"] == "blocked"
            else "feishu_workspace"
            if workspace != "ready"
            else "automation_integrations"
            if status != "ready"
            else None
        ),
    }
    _write_private_json(state_file(environ), state)
    _emit_progress(progress, "complete", agent=agent)
    return result


def verify(agent: str, mode: str, *, environ=None) -> dict:
    installer = _load_installer()
    if mode != "full":
        raise ValueError("OfferLoop only supports the full Feishu workspace mode")
    selected = installer.SKILL_NAMES
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
    workspace = workspace_status(config)
    sync = sync_automation_status(config)
    daily = daily_checkin_status(config)
    verified = (
        install["verified"]
        and mode_ready
        and workspace == "ready"
        and sync == "ready"
        and daily in {"ready", "disabled"}
    )
    result = {
        "schema_version": 1,
        "status": "ready" if verified else "needs_setup",
        "verified": verified,
        "mode": mode,
        "selected_skills": list(selected),
        "local_install": install,
        "mode_config": "ready" if mode_ready else "missing_or_mismatch",
        "workspace": workspace,
        "sync_automation": sync,
        "daily_checkin": daily,
        "readiness": readiness(config),
    }
    if workspace != "ready":
        result["next_prompt"] = _next_prompt()
    elif sync != "ready" or daily not in {"ready", "disabled"}:
        result["next_prompt"] = _automation_prompt()
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
        raise ValueError("all schema v7 workspace locators are required")
    now = datetime.now(timezone.utc).isoformat()
    config["workspace_verification"] = {
        "status": "verified",
        "schema_version": WORKSPACE_CONFIG_SCHEMA,
        "verified_at": now,
        "locator_fingerprint": workspace_locator_fingerprint(config),
        "checks": ["three_bases", "wiki_structure", "locators", "permissions"],
    }
    _write_private_json(path, config)
    state = _load_json(state_file(environ))
    status = complete_system_status(config)
    state.update(
        {
            "schema_version": 1,
            "mode": "full",
            "selected_skills": list(installer.SKILL_NAMES),
            "status": status,
            "updated_at": now,
            "completed_phases": [
                "local_install",
                "mode_config",
                "feishu_workspace",
                "online_verification",
            ],
            "pending_phase": (
                "automation_integrations" if status != "ready" else None
            ),
        }
    )
    _write_private_json(state_file(environ), state)
    result = {
        "schema_version": 1,
        "status": status,
        "mode": "full",
        "selected_skills": list(installer.SKILL_NAMES),
        "online_writes": False,
        "verification_recorded": True,
        "readiness": readiness(config),
    }
    if status != "ready":
        result["next_action"] = "start_agent_automation_setup"
        result["next_prompt"] = _automation_prompt()
    return result


def record_automation_verification(agent: str, *, environ=None) -> dict:
    """Record an Agent-completed online automation audit; no network I/O."""
    installer = _load_installer()
    local = installer.verify_agent(
        agent,
        environ=environ,
        skill_names=installer.SKILL_NAMES,
        install_mode="full",
    )
    if not local["verified"]:
        raise ValueError("local full installation must verify before automation completion")
    path = config_file(environ)
    config = _load_json(path)
    if workspace_status(config) != "ready":
        raise ValueError("workspace must be verified before automation completion")
    if not _progress_sync_config_ready(config):
        raise ValueError("verified progress_sync app, endpoint, and workflow are required")
    daily = _daily_checkin_config_status(config)
    if daily not in {"configured", "disabled"}:
        raise ValueError("daily_checkin must be explicitly enabled or disabled")

    now = datetime.now(timezone.utc).isoformat()
    checks = set(SYNC_AUTOMATION_CHECKS)
    verification = {
        "status": "verified",
        "schema_version": AUTOMATION_VERIFICATION_SCHEMA,
        "verified_at": now,
        "sync_fingerprint": sync_automation_fingerprint(config),
    }
    if daily == "configured":
        checks.update(DAILY_CHECKIN_CHECKS)
        verification["daily_checkin_fingerprint"] = daily_checkin_fingerprint(
            config
        )
    verification["checks"] = sorted(checks)
    config["automation_verification"] = verification
    _write_private_json(path, config)

    if complete_system_status(config) != "ready":
        raise RuntimeError("automation verification did not make the system ready")
    state = _load_json(state_file(environ))
    completed = list(state.get("completed_phases", []))
    for phase in ("automation_integrations", "automation_verification"):
        if phase not in completed:
            completed.append(phase)
    state.update(
        {
            "schema_version": 1,
            "mode": "full",
            "selected_skills": list(installer.SKILL_NAMES),
            "status": "ready",
            "updated_at": now,
            "completed_phases": completed,
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
        "automation_verification_recorded": True,
        "readiness": readiness(config),
    }


def main(argv=None) -> int:
    installer = _load_installer()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", required=True, choices=installer.ALL_AGENTS)
    parser.add_argument("--mode", choices=("full",))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--upgrade", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--record-workspace-verified", action="store_true")
    parser.add_argument("--record-automation-verified", action="store_true")
    parser.add_argument("--create-retirement-snapshot", action="store_true")
    parser.add_argument("--rollback-snapshot")
    parser.add_argument("--input", default="-")
    parser.add_argument("--confirmed", action="store_true")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args(argv)
    retirement_action = args.create_retirement_snapshot or args.rollback_snapshot
    if retirement_action and args.mode:
        parser.error("retirement snapshot actions cannot be combined with --mode")
    if not retirement_action and not args.mode:
        parser.error("--mode is required for setup, verify, and workspace verification")
    if args.create_retirement_snapshot and args.rollback_snapshot:
        parser.error("choose either --create-retirement-snapshot or --rollback-snapshot")
    if retirement_action and (
        args.upgrade
        or args.verify
        or args.record_workspace_verified
        or args.record_automation_verified
    ):
        parser.error("retirement snapshot actions cannot be combined with setup actions")
    if args.create_retirement_snapshot and (args.dry_run or args.confirmed):
        parser.error("snapshot creation does not accept --dry-run or --confirmed")
    if args.rollback_snapshot and not args.dry_run and not args.confirmed:
        parser.error("--rollback-snapshot requires --dry-run or --confirmed")
    if args.record_workspace_verified and args.mode != "full":
        parser.error("--record-workspace-verified requires --mode full")
    if args.record_workspace_verified and (args.verify or args.dry_run or args.upgrade):
        parser.error("--record-workspace-verified cannot be combined with other actions")
    if args.record_automation_verified and args.mode != "full":
        parser.error("--record-automation-verified requires --mode full")
    if args.record_automation_verified and (
        args.verify or args.dry_run or args.upgrade or args.record_workspace_verified
    ):
        parser.error("--record-automation-verified cannot be combined with other actions")
    if args.verify and (args.dry_run or args.upgrade):
        parser.error("--verify cannot be combined with --dry-run or --upgrade")

    try:
        if args.create_retirement_snapshot:
            if args.input != "-":
                parser.error("--create-retirement-snapshot currently requires --input -")
            payload = json.load(sys.stdin)
            if not isinstance(payload, dict):
                raise ValueError("snapshot input must be a JSON object")
            result = create_retirement_snapshot(args.agent, payload)
        elif args.rollback_snapshot:
            result = rollback_retirement_snapshot(
                args.agent,
                args.rollback_snapshot,
                dry_run=args.dry_run,
                confirmed=args.confirmed,
            )
        else:
            result = (
                record_automation_verification(args.agent)
                if args.record_automation_verified
                else record_workspace_verification(args.agent)
                if args.record_workspace_verified
                else verify(args.agent, args.mode)
                if args.verify
                else setup(
                    args.agent,
                    args.mode,
                    dry_run=args.dry_run,
                    upgrade=args.upgrade,
                    progress=None if args.as_json else _human_progress,
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
        print(json.dumps(result, ensure_ascii=True, indent=2))
    elif retirement_action:
        print(f"OfferLoop retirement action: {result['status']}")
        print(f"Snapshot: {result['snapshot_id']}")
    else:
        print(f"OfferLoop {result['mode']} setup: {result['status']}")
        print("Skills: " + ", ".join(result["selected_skills"]))
        phases = result.get("phases", {})
        local_status = phases.get("local_install", {}).get("status")
        prerequisites_status = phases.get("workspace_prerequisites", {}).get(
            "status"
        )
        feishu_status = phases.get("feishu_workspace", {}).get("status")
        sync_status = phases.get("sync_automation", {}).get("status")
        daily_status = phases.get("daily_checkin", {}).get("status")
        if local_status:
            print(f"本地 Skill 安装：{local_status}")
        if prerequisites_status:
            print(f"工作区依赖：{prerequisites_status}")
        if feishu_status:
            print(f"飞书工作区：{feishu_status}")
        if sync_status:
            print(f"同步自动化：{sync_status}")
        if daily_status:
            print(f"每日群卡片：{daily_status}")
        if result.get("status") == "needs_setup":
            print("needs_setup 表示本地安装已完成，飞书初始化仍待进行。")
        if result.get("next_prompt"):
            print("下一步在新 Agent 会话中发送：")
            print(result["next_prompt"])
    successful = {
        "ready",
        "needs_setup",
        "snapshot_created",
        "rollback_preview",
        "rolled_back",
    }
    return 0 if result["status"] in successful else 1


if __name__ == "__main__":
    raise SystemExit(main())
