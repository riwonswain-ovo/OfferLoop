#!/usr/bin/env python3
"""Install OfferLoop Skills for explicitly selected Agent runtimes."""

from __future__ import annotations

import argparse
import ast
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
SKILLS_SOURCE = ROOT / "skills"
VERSION_FILE = ROOT / "VERSION"
INSTALLER_VERSION = "1.0"
SKILL_NAMES = (
    "offerloop-setup",
    "job-collection",
    "recruiting-reminder",
    "offerloop-workspace",
)
STANDARD_AGENTS = ("codex", "claude-code", "hermes-agent", "openclaw")
ALL_AGENTS = (*STANDARD_AGENTS, "workbuddy")
RESULT_STATUSES = (
    "installed",
    "already_installed",
    "conflict",
    "upgraded",
    "shadowed",
    "installed_but_hidden",
    "prepared_for_import",
    "unsupported",
)
IGNORED_PARTS = {"__pycache__", "tests", ".pytest_cache", ".mypy_cache"}
IGNORED_NAMES = {".DS_Store"}
MANIFEST_NAME = ".offerloop-install.json"


def offerloop_version() -> str:
    return VERSION_FILE.read_text(encoding="utf-8").strip()


def _expand_home_path(value, home: Path) -> Path:
    text = str(value)
    if text == "~":
        return home
    if text.startswith("~/") or text.startswith("~\\"):
        return home / text[2:]
    return Path(text).expanduser()


def _openclaw_state_dir(home: Path, environ=None) -> Path:
    source = dict(os.environ if environ is None else environ)
    return _expand_home_path(
        source.get("OPENCLAW_STATE_DIR", home / ".openclaw"), home
    )


def agent_root(agent: str, environ=None) -> Path | None:
    source = dict(os.environ if environ is None else environ)
    home = Path(source.get("HOME", Path.home())).expanduser()
    if agent == "codex":
        base = _expand_home_path(source.get("CODEX_HOME", home / ".codex"), home)
        return base / "skills"
    if agent == "claude-code":
        base = _expand_home_path(
            source.get("CLAUDE_CONFIG_DIR", home / ".claude"), home
        )
        return base / "skills"
    if agent == "hermes-agent":
        base = _expand_home_path(source.get("HERMES_HOME", home / ".hermes"), home)
        return base / "skills"
    if agent == "openclaw":
        return _openclaw_state_dir(home, source) / "skills"
    if agent == "workbuddy":
        return None
    raise ValueError(f"unsupported Agent: {agent}")


def agent_target_label(agent: str, environ=None) -> str:
    source = dict(os.environ if environ is None else environ)
    if agent == "codex":
        return "$CODEX_HOME/skills" if source.get("CODEX_HOME") else "~/.codex/skills"
    if agent == "claude-code":
        return (
            "$CLAUDE_CONFIG_DIR/skills"
            if source.get("CLAUDE_CONFIG_DIR")
            else "~/.claude/skills"
        )
    if agent == "hermes-agent":
        return "$HERMES_HOME/skills" if source.get("HERMES_HOME") else "~/.hermes/skills"
    if agent == "openclaw":
        return (
            "$OPENCLAW_STATE_DIR/skills"
            if source.get("OPENCLAW_STATE_DIR")
            else "~/.openclaw/skills"
        )
    if agent == "workbuddy":
        return "WorkBuddy import package"
    raise ValueError(f"unsupported Agent: {agent}")


def _frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"{path.parent.name}: SKILL.md must start with YAML frontmatter")
    try:
        header = text.split("---\n", 2)[1]
    except IndexError as exc:
        raise ValueError(f"{path.parent.name}: incomplete YAML frontmatter") from exc
    values: dict[str, str] = {}
    for line in header.splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r"([A-Za-z0-9_-]+):\s*(.+)", line)
        if not match:
            raise ValueError(
                f"{path.parent.name}: frontmatter must use single-line scalar keys"
            )
        values[match.group(1)] = match.group(2).strip().strip('"\'')
    return values


def validate_sources() -> None:
    discovered = {
        path.parent.name for path in SKILLS_SOURCE.glob("*/SKILL.md") if path.is_file()
    }
    if discovered != set(SKILL_NAMES):
        raise ValueError("repository must contain exactly the four supported OfferLoop Skills")
    for name in SKILL_NAMES:
        skill_file = SKILLS_SOURCE / name / "SKILL.md"
        metadata = _frontmatter(skill_file)
        if set(metadata) != {"name", "description"}:
            raise ValueError(
                f"{name}: public frontmatter may contain only name and description"
            )
        if metadata.get("name") != name:
            raise ValueError(f"{name}: frontmatter name must match directory")
        if not re.fullmatch(r"[a-z0-9-]{1,64}", metadata.get("name", "")):
            raise ValueError(f"{name}: invalid AgentSkills name")
        description = metadata.get("description", "")
        if not description:
            raise ValueError(f"{name}: frontmatter description is required")
        if len(description) > 1024 or "<" in description or ">" in description:
            raise ValueError(f"{name}: invalid AgentSkills description")
        symlinks = [path for path in skill_file.parent.rglob("*") if path.is_symlink()]
        if symlinks:
            raise ValueError(f"{name}: symbolic links are not allowed in install sources")


def _included_files(root: Path):
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if any(part in IGNORED_PARTS for part in relative.parts):
            continue
        if path.name in IGNORED_NAMES or path.suffix == ".pyc":
            continue
        if path.is_file():
            yield path, relative


def tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for path, relative in _included_files(root):
        digest.update(relative.as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _loose_frontmatter_name(skill_file: Path) -> str | None:
    try:
        text = skill_file.read_text(encoding="utf-8")
    except OSError:
        return None
    match = re.match(r"^---\r?\n(.*?)\r?\n---", text, re.DOTALL)
    if not match:
        return None
    name = re.search(r"^name:\s*['\"]?([a-z0-9-]+)['\"]?\s*$", match.group(1), re.MULTILINE)
    return name.group(1) if name else None


def _skill_directories(root: Path, name: str) -> tuple[Path, ...]:
    """Find direct or OpenClaw-grouped Skills up to six directory levels."""
    found = []
    direct = root / name
    if (direct / "SKILL.md").is_file():
        found.append(direct)
    if root.is_dir():
        for skill_file in root.rglob("SKILL.md"):
            relative = skill_file.relative_to(root)
            if len(relative.parts) - 1 > 6 or skill_file.parent == direct:
                continue
            if _loose_frontmatter_name(skill_file) == name:
                found.append(skill_file.parent)
    return tuple(found)


def _ignore_copy(directory: str, names: list[str]) -> set[str]:
    ignored = set()
    parent = Path(directory)
    for name in names:
        path = parent / name
        if name in IGNORED_NAMES or name in IGNORED_PARTS or path.suffix == ".pyc":
            ignored.add(name)
    return ignored


def _manifest_payload(agent: str, digests: dict[str, str]) -> dict:
    return {
        "schema_version": 1,
        "installer_version": INSTALLER_VERSION,
        "agent": agent,
        "offerloop_version": offerloop_version(),
        "skills": {name: {"sha256": digests[name]} for name in SKILL_NAMES},
        "installed_at": datetime.now(timezone.utc).isoformat(),
    }


def _write_manifest(root: Path, agent: str, digests: dict[str, str]) -> None:
    destination = root / MANIFEST_NAME
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(_manifest_payload(agent, digests), ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )
    os.chmod(temporary, 0o600)
    temporary.replace(destination)


def _json5_data(text: str) -> dict:
    """Parse the conservative JSON5 subset used by OpenClaw config files."""
    uncommented = []
    index = 0
    quote = None
    while index < len(text):
        char = text[index]
        if quote:
            uncommented.append(char)
            if char == "\\" and index + 1 < len(text):
                index += 1
                uncommented.append(text[index])
            elif char == quote:
                quote = None
            index += 1
            continue
        if char in {"'", '"'}:
            quote = char
            uncommented.append(char)
            index += 1
            continue
        if text[index : index + 2] == "//":
            index += 2
            while index < len(text) and text[index] not in "\r\n":
                index += 1
            continue
        if text[index : index + 2] == "/*":
            index += 2
            while index < len(text) and text[index : index + 2] != "*/":
                if text[index] in "\r\n":
                    uncommented.append(text[index])
                index += 1
            if index >= len(text):
                raise ValueError("unterminated JSON5 block comment")
            index += 2
            continue
        uncommented.append(char)
        index += 1

    normalized = []
    text = "".join(uncommented)
    index = 0
    while index < len(text):
        if text[index] != "'":
            normalized.append(text[index])
            index += 1
            continue
        end = index + 1
        while end < len(text):
            if text[end] == "\\":
                end += 2
                continue
            if text[end] == "'":
                break
            end += 1
        if end >= len(text):
            raise ValueError("unterminated JSON5 string")
        value = ast.literal_eval(text[index : end + 1])
        normalized.append(json.dumps(value, ensure_ascii=False))
        index = end + 1

    text = "".join(normalized)
    text = re.sub(
        r"([\{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)",
        r'\1"\2"\3',
        text,
    )
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("OpenClaw config must be an object")
    return data


def _deep_merge(base: dict, override: dict) -> dict:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(merged.get(key), dict) and isinstance(value, dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _inside_allowed_root(path: Path, roots: tuple[Path, ...]) -> bool:
    resolved = path.resolve(strict=False)
    for root in roots:
        try:
            resolved.relative_to(root.resolve(strict=False))
            return True
        except ValueError:
            continue
    return False


def _resolve_json5_includes(
    value,
    *,
    current_file: Path,
    allowed_roots: tuple[Path, ...],
    seen: frozenset[Path],
    depth: int,
):
    if depth > 10:
        raise ValueError("OpenClaw config include depth exceeded")
    if isinstance(value, list):
        return [
            _resolve_json5_includes(
                item,
                current_file=current_file,
                allowed_roots=allowed_roots,
                seen=seen,
                depth=depth,
            )
            for item in value
        ]
    if not isinstance(value, dict):
        return value

    include_value = value.get("$include")
    merged = {}
    if include_value is not None:
        include_names = include_value if isinstance(include_value, list) else [include_value]
        for include_name in include_names:
            if not isinstance(include_name, str) or not include_name or len(include_name) >= 4096:
                raise ValueError("invalid OpenClaw config include")
            include_path = (current_file.parent / include_name).resolve(strict=False)
            if not _inside_allowed_root(include_path, allowed_roots):
                raise ValueError("OpenClaw config include escapes allowed roots")
            if include_path in seen or not include_path.is_file():
                raise ValueError("invalid OpenClaw config include graph")
            if include_path.stat().st_size > 2 * 1024 * 1024:
                raise ValueError("OpenClaw config include is too large")
            included = _json5_data(include_path.read_text(encoding="utf-8"))
            included = _resolve_json5_includes(
                included,
                current_file=include_path,
                allowed_roots=allowed_roots,
                seen=seen | {include_path},
                depth=depth + 1,
            )
            if not isinstance(included, dict):
                raise ValueError("OpenClaw config include must contain an object")
            merged = _deep_merge(merged, included)

    siblings = {
        key: _resolve_json5_includes(
            item,
            current_file=current_file,
            allowed_roots=allowed_roots,
            seen=seen,
            depth=depth,
        )
        for key, item in value.items()
        if key != "$include"
    }
    return _deep_merge(merged, siblings)


def _openclaw_config(home: Path, environ=None) -> dict | None:
    source = dict(os.environ if environ is None else environ)
    state_dir = _openclaw_state_dir(home, source)
    config = _expand_home_path(
        source.get("OPENCLAW_CONFIG_PATH", state_dir / "openclaw.json"), home
    )
    if not config.is_file():
        return {}
    try:
        extra_roots = tuple(
            _expand_home_path(item, home)
            for item in source.get("OPENCLAW_INCLUDE_ROOTS", "").split(os.pathsep)
            if item
        )
        allowed_roots = (config.parent, *extra_roots)
        data = _json5_data(config.read_text(encoding="utf-8"))
        return _resolve_json5_includes(
            data,
            current_file=config,
            allowed_roots=allowed_roots,
            seen=frozenset({config.resolve(strict=False)}),
            depth=0,
        )
    except (OSError, ValueError, json.JSONDecodeError, SyntaxError):
        return None


def _openclaw_workspaces(home: Path, environ=None) -> tuple[Path, ...]:
    source = dict(os.environ if environ is None else environ)
    state_dir = _openclaw_state_dir(home, source)
    data = _openclaw_config(home, source)
    data = data or {}
    agents = data.get("agents", {}) if isinstance(data.get("agents"), dict) else {}
    defaults = agents.get("defaults", {}) if isinstance(agents.get("defaults"), dict) else {}
    configured_default = defaults.get("workspace")
    has_configured_default = isinstance(configured_default, str) and bool(
        configured_default.strip()
    )
    configured = configured_default if has_configured_default else source.get(
        "OPENCLAW_WORKSPACE_DIR"
    )
    if not configured:
        profile = source.get("OPENCLAW_PROFILE", "")
        suffix = f"-{profile}" if profile and profile != "default" else ""
        default_workspace = home / ".openclaw" / f"workspace{suffix}"
    else:
        expanded = re.sub(
            r"\$\{([A-Z_][A-Z0-9_]*)\}",
            lambda match: source.get(match.group(1), match.group(0)),
            configured,
        )
        default_workspace = _expand_home_path(expanded, home)

    workspaces = [default_workspace]
    listed = agents.get("list")
    if isinstance(listed, list):
        listed_dicts = [entry for entry in listed if isinstance(entry, dict)]
        explicit_default_ids = {
            entry.get("id") for entry in listed_dicts if entry.get("default") is True
        }
        default_ids = explicit_default_ids or {"main"}
        for entry in listed_dicts:
            value = entry.get("workspace")
            if isinstance(value, str) and value.strip():
                expanded = re.sub(
                    r"\$\{([A-Z_][A-Z0-9_]*)\}",
                    lambda match: source.get(match.group(1), match.group(0)),
                    value,
                )
                workspace = _expand_home_path(expanded, home)
            elif entry.get("id") in default_ids:
                workspace = default_workspace
            elif isinstance(entry.get("id"), str) and entry["id"]:
                workspace = (
                    default_workspace / entry["id"]
                    if has_configured_default
                    else state_dir / f"workspace-{entry['id']}"
                )
            else:
                continue
            workspaces.append(workspace)

    unique = []
    seen = set()
    for workspace in workspaces:
        identity = workspace.resolve(strict=False)
        if identity not in seen:
            seen.add(identity)
            unique.append(workspace)
    return tuple(unique)


def _openclaw_roots(
    home: Path, *, environ=None, workspace: Path | None = None
) -> tuple[tuple[Path, str], ...]:
    workspaces = (workspace,) if workspace is not None else _openclaw_workspaces(home, environ)
    roots = []
    for position, active_workspace in enumerate(workspaces):
        prefix = "openclaw-default-workspace" if position == 0 else "openclaw-agent-workspace"
        roots.extend(
            (
                (active_workspace / "skills", f"{prefix}/skills"),
                (active_workspace / ".agents" / "skills", f"{prefix}/.agents/skills"),
            )
        )
    roots.extend(
        (
            (home / ".agents" / "skills", "~/.agents/skills"),
            (
                _openclaw_state_dir(home, environ) / "skills",
                "$OPENCLAW_STATE_DIR/skills"
                if dict(os.environ if environ is None else environ).get("OPENCLAW_STATE_DIR")
                else "~/.openclaw/skills",
            ),
        )
    )
    return tuple(roots)


def _openclaw_effective_sources(
    home: Path, workspace: Path | None = None, environ=None
) -> dict[str, str]:
    if workspace is None:
        workspace = _openclaw_workspaces(home, environ)[0]
    roots = _openclaw_roots(home, environ=environ, workspace=workspace)
    effective = {}
    for name in SKILL_NAMES:
        for root, label in roots:
            if _skill_directories(root, name):
                effective[name] = label
                break
    return effective


def _openclaw_shadow_details(
    home: Path,
    source_digests: dict[str, str],
    workspace: Path | None = None,
    environ=None,
) -> dict[str, list[str]]:
    shadowed: dict[str, list[str]] = {}
    higher_priority_roots = tuple(
        (root, label)
        for root, label in _openclaw_roots(
            home, environ=environ, workspace=workspace
        )
        if label not in {"~/.openclaw/skills", "$OPENCLAW_STATE_DIR/skills"}
    )
    for name in SKILL_NAMES:
        for root, label in higher_priority_roots:
            for candidate in _skill_directories(root, name):
                if tree_digest(candidate) != source_digests[name]:
                    labels = shadowed.setdefault(name, [])
                    if label not in labels:
                        labels.append(label)
    return shadowed


def _openclaw_shadowed(
    home: Path,
    source_digests: dict[str, str],
    workspace: Path | None = None,
    environ=None,
) -> list[str]:
    return list(
        _openclaw_shadow_details(
            home,
            source_digests,
            workspace=workspace,
            environ=environ,
        )
    )


def _openclaw_hidden(home: Path, environ=None) -> bool:
    data = _openclaw_config(home, environ)
    if data is None:
        return True
    agents = data.get("agents", {}) if isinstance(data.get("agents"), dict) else {}
    allowlists = []
    defaults = agents.get("defaults", {}).get("skills")
    if isinstance(defaults, list):
        allowlists.append(defaults)
    listed = agents.get("list")
    if isinstance(listed, list):
        for entry in listed:
            if isinstance(entry, dict) and isinstance(entry.get("skills"), list):
                allowlists.append(entry["skills"])
    allowlist_hidden = any(
        not set(SKILL_NAMES).issubset({str(item) for item in allowlist})
        for allowlist in allowlists
    )
    skills = data.get("skills", {}) if isinstance(data.get("skills"), dict) else {}
    entries = skills.get("entries", {}) if isinstance(skills.get("entries"), dict) else {}
    explicitly_disabled = any(
        isinstance(entries.get(name), dict)
        and entries[name].get("enabled") is False
        for name in SKILL_NAMES
    )
    return allowlist_hidden or explicitly_disabled


def _openclaw_discovered(environ=None) -> bool | None:
    source = dict(os.environ if environ is None else environ)
    executable = shutil.which("openclaw", path=source.get("PATH"))
    if not executable:
        return None
    try:
        completed = subprocess.run(
            [executable, "skills", "list", "--eligible", "--json"],
            check=False,
            capture_output=True,
            text=True,
            timeout=8,
            env=source,
        )
        if completed.returncode != 0:
            return None
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            return None
        if isinstance(payload, list):
            entries = payload
        elif isinstance(payload, dict):
            entries = next(
                (
                    payload[key]
                    for key in ("skills", "eligible", "ready")
                    if isinstance(payload.get(key), (list, dict))
                ),
                None,
            )
        else:
            entries = None
        if isinstance(entries, dict):
            names = {str(name) for name in entries}
        elif isinstance(entries, list):
            names = {
                item if isinstance(item, str) else item.get("name")
                for item in entries
                if isinstance(item, (str, dict))
            }
            names.discard(None)
        else:
            return None
        return set(SKILL_NAMES).issubset(names)
    except (OSError, subprocess.SubprocessError, TypeError):
        return None


def install_agent(agent: str, *, environ=None, dry_run=False, upgrade=False) -> dict:
    source = dict(os.environ if environ is None else environ)
    home = Path(source.get("HOME", Path.home())).expanduser()
    if agent == "workbuddy":
        return {
            "agent": agent,
            "target": agent_target_label(agent, source),
            "status": "unsupported",
            "skills": [],
            "next_action": (
                "当前腾讯 WorkBuddy 的可导入 skill.yml 契约尚未完成真实应用验收；"
                "不要把 SKILL.md 目录直接当作已安装"
            ),
        }

    root = agent_root(agent, source)
    assert root is not None
    source_digests = {
        name: tree_digest(SKILLS_SOURCE / name) for name in SKILL_NAMES
    }
    operations = []
    conflicts = []
    for name in SKILL_NAMES:
        destination = root / name
        if not destination.exists():
            operations.append((name, "installed"))
        elif destination.is_dir() and tree_digest(destination) == source_digests[name]:
            operations.append((name, "already_installed"))
        elif upgrade:
            operations.append((name, "upgraded"))
        else:
            operations.append((name, "conflict"))
            conflicts.append(name)

    if conflicts:
        return {
            "agent": agent,
            "target": agent_target_label(agent, source),
            "status": "conflict",
            "skills": [
                {"name": name, "status": status} for name, status in operations
            ],
            "next_action": "检查同名目录；确认属于旧版 OfferLoop 后使用 --upgrade",
        }

    if dry_run:
        statuses = {status for _, status in operations}
        status = "already_installed"
        if "upgraded" in statuses:
            status = "upgraded"
        elif "installed" in statuses:
            status = "installed"
        result = {
            "agent": agent,
            "target": agent_target_label(agent, source),
            "status": status,
            "dry_run": True,
            "skills": [
                {"name": name, "status": item_status}
                for name, item_status in operations
            ],
        }
        if agent == "openclaw":
            result["effective_sources"] = _openclaw_effective_sources(
                home, environ=source
            )
            shadow_details = _openclaw_shadow_details(
                home, source_digests, environ=source
            )
            shadowed = list(shadow_details)
            if shadowed:
                result["status"] = "shadowed"
                result["shadowed_skills"] = shadowed
                result["shadow_sources"] = shadow_details
            elif _openclaw_hidden(home, source):
                result["status"] = "installed_but_hidden"
        return result

    root.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    with tempfile.TemporaryDirectory(prefix=".offerloop-stage-", dir=root) as stage_name:
        stage = Path(stage_name)
        for name, status in operations:
            if status == "already_installed":
                continue
            staged = stage / name
            shutil.copytree(
                SKILLS_SOURCE / name,
                staged,
                symlinks=False,
                ignore=_ignore_copy,
            )
            if tree_digest(staged) != source_digests[name]:
                raise RuntimeError(f"{name}: staged copy failed integrity validation")
            destination = root / name
            backup = None
            if destination.exists():
                # Keep backups outside the Skills discovery root. OpenClaw supports
                # grouped Skills, so an in-root backup could itself become active.
                backup = root.parent / ".offerloop-backups" / timestamp / name
                backup.parent.mkdir(parents=True, exist_ok=True)
                destination.replace(backup)
            try:
                staged.replace(destination)
            except Exception:
                if backup and backup.exists() and not destination.exists():
                    backup.replace(destination)
                raise

    statuses = {status for _, status in operations}
    overall = "already_installed"
    if "upgraded" in statuses:
        overall = "upgraded"
    elif "installed" in statuses:
        overall = "installed"
    if overall != "already_installed" or not (root / MANIFEST_NAME).is_file():
        _write_manifest(root, agent, source_digests)

    result = {
        "agent": agent,
        "target": agent_target_label(agent, source),
        "status": overall,
        "skills": [{"name": name, "status": status} for name, status in operations],
    }
    if agent == "openclaw":
        result["effective_sources"] = _openclaw_effective_sources(
            home, environ=source
        )
        shadow_details = _openclaw_shadow_details(
            home, source_digests, environ=source
        )
        shadowed = list(shadow_details)
        if shadowed:
            result["status"] = "shadowed"
            result["shadowed_skills"] = shadowed
            result["shadow_sources"] = shadow_details
            result["next_action"] = (
                "OpenClaw 的工作区或高优先级个人 Agent Skills 中存在不同版本；"
                "请检查覆盖后再验证生效来源"
            )
        elif _openclaw_hidden(home, source):
            result["status"] = "installed_but_hidden"
            result["next_action"] = (
                "检查 OpenClaw agents.defaults.skills 或 agents.list[].skills allowlist"
            )
        else:
            discovered = _openclaw_discovered(source)
            if discovered is False:
                result["status"] = "installed_but_hidden"
                result["next_action"] = "重新加载 OpenClaw 并检查 Agent Skill allowlist"
            elif discovered is True:
                result["discovered"] = True
    return result


def _expand_agents(values: list[str]) -> list[str]:
    expanded = []
    for value in values:
        choices = ALL_AGENTS if value == "all" else (value,)
        for choice in choices:
            if choice not in expanded:
                expanded.append(choice)
    return expanded


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--agent",
        action="append",
        choices=(*ALL_AGENTS, "all"),
        help="target Agent; repeat to install for more than one Agent",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--upgrade", action="store_true")
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--version", action="store_true")
    args = parser.parse_args(argv)

    if args.version:
        if args.as_json:
            print(
                json.dumps(
                    {
                        "installer_version": INSTALLER_VERSION,
                        "offerloop_version": offerloop_version(),
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
        else:
            print(
                f"offerloop-installer {INSTALLER_VERSION} "
                f"(OfferLoop {offerloop_version()})"
            )
        return 0
    if not args.agent:
        parser.error("at least one --agent is required")

    try:
        validate_sources()
        reports = [
            install_agent(
                agent,
                dry_run=args.dry_run,
                upgrade=args.upgrade,
            )
            for agent in _expand_agents(args.agent)
        ]
    except (OSError, ValueError, RuntimeError) as exc:
        if args.as_json:
            print(json.dumps({"schema_version": 1, "status": "error"}, indent=2))
        else:
            print(f"OfferLoop installation failed: {exc}", file=sys.stderr)
        return 1

    payload = {
        "schema_version": 1,
        "installer_version": INSTALLER_VERSION,
        "offerloop_version": offerloop_version(),
        "results": reports,
    }
    if args.as_json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        for report in reports:
            print(
                f"{report['agent']}: {report['status']} "
                f"(target: {report['target']})"
            )
            if report.get("next_action"):
                print(f"  {report['next_action']}")
    return 1 if any(report["status"] == "conflict" for report in reports) else 0


if __name__ == "__main__":
    raise SystemExit(main())
