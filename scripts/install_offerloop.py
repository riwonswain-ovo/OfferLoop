#!/usr/bin/env python3
"""Install OfferLoop Skills for explicitly selected Agent runtimes."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
SKILLS_SOURCE = ROOT / "skills"
VERSION_FILE = ROOT / "VERSION"
INSTALLER_VERSION = "1.1"
SKILL_NAMES = (
    "offerloop-setup",
    "job-collection",
    "recruiting-reminder",
    "offerloop-workspace",
    "resume-deepthink",
    "interview-prep",
    "mock-lab",
    "talk-review",
    "pm-sense",
)
STANDARD_AGENTS = ("codex", "claude-code", "hermes-agent", "workbuddy")
ALL_AGENTS = STANDARD_AGENTS
RESULT_STATUSES = (
    "installed",
    "already_installed",
    "conflict",
    "upgraded",
    "prepared_for_import",
    "unsupported",
)
IGNORED_PARTS = {
    "__pycache__",
    "tests",
    ".pytest_cache",
    ".mypy_cache",
    "node_modules",
    "dist",
    "build",
}
IGNORED_NAMES = {".DS_Store"}
MANIFEST_NAME = ".offerloop-install.json"
WELCOME = {
    "headline": "欢迎使用 OfferLoop",
    "summary": (
        "OfferLoop 包含 9 个可以独立或组合使用的 Skill。"
        "用户不需要记住名称，只需描述当前想解决的问题。"
    ),
    "groups": [
        {
            "name": "求职基础能力",
            "skills": [
                {
                    "name": "offerloop-setup",
                    "title": "安装与配置",
                    "purpose": "首次配置、环境检查、飞书授权和完整部署",
                    "example": "检查一下 OfferLoop 是否配置完整。",
                },
                {
                    "name": "offerloop-workspace",
                    "title": "求职空间",
                    "purpose": "管理飞书知识库、招聘工作台和材料目录",
                    "example": "检查我的 OfferLoop 求职空间是否完整。",
                },
                {
                    "name": "job-collection",
                    "title": "招聘信息同步",
                    "purpose": "从用户指定的信息源收集岗位并整理到企业清单",
                    "example": "同步我的招聘信息源。",
                },
                {
                    "name": "recruiting-reminder",
                    "title": "笔试面试提醒",
                    "purpose": "从招聘邮件识别安排，并在确认后同步笔面试中心和日历",
                    "example": "检查最近 7 天的笔试面试邮件，先不要写入。",
                },
            ],
        },
        {
            "name": "求职训练能力",
            "skills": [
                {
                    "name": "resume-deepthink",
                    "title": "简历深挖",
                    "purpose": "连续追问真实经历，生成简历表达和面试素材",
                    "example": "追问深挖我简历中的一段实习经历。",
                },
                {
                    "name": "pm-sense",
                    "title": "产品思维训练",
                    "purpose": "训练产品与场景题，完善口语回答并沉淀素材",
                    "example": "让我先回答一道产品场景题，再帮我完善。",
                },
                {
                    "name": "interview-prep",
                    "title": "面试准备",
                    "purpose": "结合 JD、投递简历和素材生成针对性准备文档",
                    "example": "根据下一场面试和实际投递简历帮我准备。",
                },
                {
                    "name": "mock-lab",
                    "title": "模拟面试",
                    "purpose": "按真实节奏一题一答，结束后统一点评",
                    "example": "用刚才的准备文档模拟面试。",
                },
                {
                    "name": "talk-review",
                    "title": "真实面试复盘",
                    "purpose": "根据 ASR 或转写还原问答并生成改进方案",
                    "example": "根据这份 ASR 复盘刚结束的面试。",
                },
            ],
        },
    ],
    "workflows": [
        "招聘信息同步 → 真实投递 → 邮件识别 → 笔试面试安排",
        "简历深挖 / 产品思维 → 面试准备 → 模拟面试 → 真实面试复盘",
    ],
    "next_prompt": (
        "我刚安装 OfferLoop。请先介绍 9 个 Skill，"
        "再做只读检查并带我完成第一次使用。"
    ),
    "privacy_notice": (
        "安装只添加 Skill；尚未读取飞书、邮箱或简历，也没有创建或修改线上数据。"
    ),
}


def offerloop_version() -> str:
    return VERSION_FILE.read_text(encoding="utf-8").strip()


def _expand_home_path(value, home: Path) -> Path:
    text = str(value)
    if text == "~":
        return home
    if text.startswith("~/") or text.startswith("~\\"):
        return home / text[2:]
    return Path(text).expanduser()


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
    if agent == "workbuddy":
        return home / ".workbuddy" / "skills"
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
    if agent == "workbuddy":
        return "~/.workbuddy/skills"
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


def _is_ignored(path: Path) -> bool:
    return (
        path.name in IGNORED_NAMES
        or path.name in IGNORED_PARTS
        or path.suffix == ".pyc"
    )


def _source_symlinks(root: Path) -> list[Path]:
    """Find source symlinks without descending into generated directories."""
    found = []
    for directory, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
        parent = Path(directory)
        kept_directories = []
        for name in sorted(dirnames):
            path = parent / name
            if _is_ignored(path):
                continue
            if path.is_symlink():
                found.append(path)
            else:
                kept_directories.append(name)
        dirnames[:] = kept_directories
        for name in sorted(filenames):
            path = parent / name
            if not _is_ignored(path) and path.is_symlink():
                found.append(path)
    return found


def validate_sources() -> None:
    discovered = {
        path.parent.name for path in SKILLS_SOURCE.glob("*/SKILL.md") if path.is_file()
    }
    if discovered != set(SKILL_NAMES):
        raise ValueError(
            "repository must contain exactly the eleven supported OfferLoop Skills"
        )
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
        symlinks = _source_symlinks(skill_file.parent)
        if symlinks:
            raise ValueError(f"{name}: symbolic links are not allowed in install sources")


def _included_files(root: Path):
    for directory, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
        parent = Path(directory)
        dirnames[:] = [
            name
            for name in sorted(dirnames)
            if not _is_ignored(parent / name) and not (parent / name).is_symlink()
        ]
        for name in sorted(filenames):
            path = parent / name
            if not _is_ignored(path) and path.is_file():
                yield path, path.relative_to(root)


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
    """Find direct or grouped Skills up to six directory levels."""
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
    parent = Path(directory)
    return {name for name in names if _is_ignored(parent / name)}


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


def _move_directory(source: Path, destination: Path) -> None:
    """Move a directory across platforms, including Windows hosted runners."""
    if destination.exists():
        raise FileExistsError(f"destination already exists: {destination.name}")
    shutil.move(str(source), str(destination))


def _yaml_scalar(value: str) -> str:
    """Return a conservative YAML scalar without requiring PyYAML."""
    value = value.split(" #", 1)[0].strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _hermes_external_dir_values(config_path: Path) -> list[str]:
    """Read the small ``skills.external_dirs`` subset used by Hermes."""
    try:
        text = config_path.read_text(encoding="utf-8")
    except OSError:
        return []

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        payload = None
    if isinstance(payload, dict):
        skills = payload.get("skills")
        raw = skills.get("external_dirs") if isinstance(skills, dict) else None
        if isinstance(raw, str):
            return [raw]
        if isinstance(raw, list):
            return [str(item) for item in raw if str(item).strip()]
        return []

    lines = text.splitlines()
    skills_indent = None
    external_indent = None
    values: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        if skills_indent is None:
            if re.fullmatch(r"skills:\s*(?:#.*)?", stripped):
                skills_indent = indent
            continue
        if indent <= skills_indent:
            break
        if external_indent is None:
            match = re.fullmatch(r"external_dirs:\s*(.*)", stripped)
            if not match:
                continue
            external_indent = indent
            inline = match.group(1).strip()
            if not inline:
                continue
            if inline.startswith("[") and inline.endswith("]"):
                values.extend(
                    _yaml_scalar(item)
                    for item in inline[1:-1].split(",")
                    if _yaml_scalar(item)
                )
            else:
                value = _yaml_scalar(inline)
                if value:
                    values.append(value)
            break
        item = re.fullmatch(r"-\s+(.+)", stripped)
        if item:
            value = _yaml_scalar(item.group(1))
            if value:
                values.append(value)
            continue
        if indent <= external_indent:
            break
    return values


def _hermes_external_roots(home: Path, root: Path, environ=None) -> tuple[Path, ...]:
    source = dict(os.environ if environ is None else environ)
    hermes_home = root.parent
    roots = []
    seen = set()
    for value in _hermes_external_dir_values(hermes_home / "config.yaml"):
        expanded = value
        for key, env_value in source.items():
            expanded = expanded.replace(f"${{{key}}}", str(env_value))
        candidate = _expand_home_path(expanded, home)
        if not candidate.is_absolute():
            candidate = hermes_home / candidate
        try:
            candidate = candidate.resolve()
            local_root = root.resolve()
        except OSError:
            continue
        if candidate == local_root or candidate in seen or not candidate.is_dir():
            continue
        seen.add(candidate)
        roots.append(candidate)
    return tuple(roots)


def _hermes_external_duplicates(
    home: Path, root: Path, environ=None
) -> dict[str, list[tuple[Path, Path]]]:
    duplicates: dict[str, list[tuple[Path, Path]]] = {}
    for external_root in _hermes_external_roots(home, root, environ):
        for name in SKILL_NAMES:
            for candidate in _skill_directories(external_root, name):
                duplicates.setdefault(name, []).append((external_root, candidate))
    return duplicates


def _workbuddy_import_duplicates(root: Path) -> dict[str, list[tuple[Path, Path]]]:
    """Find imported WorkBuddy Skills whose folder differs from the Skill name."""
    duplicates: dict[str, list[tuple[Path, Path]]] = {}
    for name in SKILL_NAMES:
        direct = root / name
        for candidate in _skill_directories(root, name):
            if candidate != direct:
                duplicates.setdefault(name, []).append((root, candidate))
    return duplicates


def install_agent(agent: str, *, environ=None, dry_run=False, upgrade=False) -> dict:
    source = dict(os.environ if environ is None else environ)
    home = Path(source.get("HOME", Path.home())).expanduser()
    root = agent_root(agent, source)
    assert root is not None
    source_digests = {
        name: tree_digest(SKILLS_SOURCE / name) for name in SKILL_NAMES
    }
    hermes_duplicates = (
        _hermes_external_duplicates(home, root, source)
        if agent == "hermes-agent"
        else {}
    )
    workbuddy_duplicates = (
        _workbuddy_import_duplicates(root) if agent == "workbuddy" else {}
    )
    runtime_duplicates = {**hermes_duplicates, **workbuddy_duplicates}
    had_offerloop_install = (
        (root / MANIFEST_NAME).is_file()
        or any((root / name).exists() for name in SKILL_NAMES)
        or bool(runtime_duplicates)
    )
    operations = []
    conflicts = []
    for name in SKILL_NAMES:
        destination = root / name
        if name in runtime_duplicates and not upgrade:
            operations.append((name, "conflict"))
            conflicts.append(name)
        elif name in runtime_duplicates and upgrade:
            operations.append((name, "upgraded"))
        elif not destination.exists():
            operations.append((name, "installed"))
        elif destination.is_dir() and tree_digest(destination) == source_digests[name]:
            operations.append((name, "already_installed"))
        elif upgrade:
            operations.append((name, "upgraded"))
        else:
            operations.append((name, "conflict"))
            conflicts.append(name)

    if conflicts:
        next_action = "检查同名目录；确认属于旧版 OfferLoop 后使用 --upgrade"
        if agent == "hermes-agent" and hermes_duplicates:
            next_action = (
                "Hermes 的 skills.external_dirs 中存在同名 Skill；"
                "确认属于旧版 OfferLoop 后使用 --upgrade 备份并清理重复副本"
            )
        elif agent == "workbuddy" and workbuddy_duplicates:
            next_action = (
                "WorkBuddy 已导入的随机目录中存在同名 Skill；"
                "确认属于旧版 OfferLoop 后使用 --upgrade 备份并清理重复副本"
            )
        return {
            "agent": agent,
            "target": agent_target_label(agent, source),
            "status": "conflict",
            "show_welcome": False,
            "skills": [
                {"name": name, "status": status} for name, status in operations
            ],
            "next_action": next_action,
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
            "show_welcome": not had_offerloop_install,
            "skills": [
                {"name": name, "status": item_status}
                for name, item_status in operations
            ],
        }
        return result

    if all(status == "already_installed" for _, status in operations):
        if not (root / MANIFEST_NAME).is_file():
            root.mkdir(parents=True, exist_ok=True)
            _write_manifest(root, agent, source_digests)
        return {
            "agent": agent,
            "target": agent_target_label(agent, source),
            "status": "already_installed",
            "show_welcome": False,
            "skills": [
                {"name": name, "status": status} for name, status in operations
            ],
        }

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
        external_backups: list[tuple[Path, Path]] = []
        try:
            for name, candidates in runtime_duplicates.items():
                for index, (external_root, candidate) in enumerate(candidates, 1):
                    relative = candidate.relative_to(external_root)
                    duplicate_kind = (
                        "hermes-external"
                        if agent == "hermes-agent"
                        else "workbuddy-imported"
                    )
                    backup = (
                        external_root.parent
                        / ".offerloop-backups"
                        / timestamp
                        / duplicate_kind
                        / f"source-{index}"
                        / relative
                    )
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    _move_directory(candidate, backup)
                    external_backups.append((backup, candidate))

            for name, status in operations:
                staged = stage / name
                destination = root / name
                backup = None
                if destination.exists() and status != "already_installed":
                    # Keep backups outside the Skills discovery root so they cannot
                    # become active through recursive Skill discovery.
                    backup = root.parent / ".offerloop-backups" / timestamp / name
                    backup.parent.mkdir(parents=True, exist_ok=True)
                    _move_directory(destination, backup)
                if status != "already_installed":
                    try:
                        _move_directory(staged, destination)
                    except Exception:
                        if backup and backup.exists() and not destination.exists():
                            _move_directory(backup, destination)
                        raise
        except Exception:
            for backup, candidate in reversed(external_backups):
                if backup.exists() and not candidate.exists():
                    candidate.parent.mkdir(parents=True, exist_ok=True)
                    _move_directory(backup, candidate)
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
        "show_welcome": (
            not had_offerloop_install
            or any(
                name in {
                    "resume-deepthink",
                    "interview-prep",
                    "mock-lab",
                    "talk-review",
                    "pm-sense",
                }
                and status == "installed"
                for name, status in operations
            )
        ),
        "skills": [{"name": name, "status": status} for name, status in operations],
    }
    return result


def _expand_agents(values: list[str]) -> list[str]:
    expanded = []
    for value in values:
        choices = ALL_AGENTS if value == "all" else (value,)
        for choice in choices:
            if choice not in expanded:
                expanded.append(choice)
    return expanded


def _print_welcome() -> None:
    print()
    print(f"🎉 {WELCOME['headline']}")
    print(WELCOME["summary"])
    for group in WELCOME["groups"]:
        print()
        print(f"{group['name']}：")
        for skill in group["skills"]:
            print(
                f"- {skill['name']}｜{skill['title']}："
                f"{skill['purpose']}"
            )
            print(f"  可以说：“{skill['example']}”")
    print()
    print("常用闭环：")
    for workflow in WELCOME["workflows"]:
        print(f"- {workflow}")
    print()
    print(WELCOME["privacy_notice"])
    print("请结束当前 Agent 会话并新开会话，然后直接发送：")
    print(f"“{WELCOME['next_prompt']}”")


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
                    ensure_ascii=True,
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
    show_welcome = not args.dry_run and any(
        report.get("show_welcome") and report["status"] != "conflict"
        for report in reports
    )
    if show_welcome:
        payload["welcome"] = WELCOME
    if args.as_json:
        print(json.dumps(payload, ensure_ascii=True, indent=2))
    else:
        if args.dry_run:
            print("DRY RUN：仅预览，未写入任何 Skill 文件。")
        for report in reports:
            status = report["status"]
            if args.dry_run:
                status = {
                    "installed": "would install",
                    "upgraded": "would upgrade",
                    "already_installed": "already installed; no changes needed",
                    "conflict": "conflict; installation would stop",
                }.get(status, status)
            print(
                f"{report['agent']}: {status} "
                f"(target: {report['target']})"
            )
            if report.get("next_action"):
                print(f"  {report['next_action']}")
        completed = {"installed", "already_installed", "upgraded"}
        if not args.dry_run and any(
            report["status"] in completed for report in reports
        ):
            print("OfferLoop 的 9 个 Skill 已处理完成。")
            if show_welcome:
                _print_welcome()
            else:
                print(
                    "下一步：结束当前 Agent 会话并新开会话，然后调用 "
                    "offerloop-setup 运行只读预检。"
                )
    return 1 if any(report["status"] == "conflict" for report in reports) else 0


if __name__ == "__main__":
    raise SystemExit(main())
