#!/usr/bin/env python3
"""Offline, read-only OfferLoop first-run checks."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = SKILL_ROOT.parent
STATUS_MODEL_PATH = Path(__file__).with_name("status_model.py")

BUNDLED_SKILLS = (
    "offerloop-setup",
    "offerloop-workspace",
    "job-collection",
    "recruiting-reminder",
)
EXTERNAL_SKILLS_BY_CAPABILITY = {
    "collection": (),
    "reminder": ("lark-calendar",),
    "workspace": ("lark-base", "lark-doc", "lark-wiki"),
    "integration": ("lark-shared", "lark-apps"),
}
LARK_CLI_RECOVERY = (
    "运行 `npx @larksuite/cli@latest install` 安装 lark-cli；再运行 "
    "Agent 对应的 `npx skills add larksuite/cli -g -a codex -y`、"
    "`-a claude-code`、`-a hermes-agent` 或 `-a openclaw` 安装官方 Lark Skills，"
    "然后新开 Agent 会话"
)
LARK_SKILLS_RECOVERY = (
    "运行 Agent 对应的 `npx skills add larksuite/cli -g -a codex -y`、"
    "`-a claude-code`、`-a hermes-agent` 或 `-a openclaw` "
    "安装官方 Lark Skills，然后新开 Agent 会话"
)
MIN_LARK_CLI_VERSION = (1, 0, 73)


def _load_status_model():
    spec = importlib.util.spec_from_file_location(
        "offerloop_setup_status_model", STATUS_MODEL_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


status_model = _load_status_model()

WORKSPACE_LOCATORS = (
    "lark_profile",
    "target_base_url",
    "progress_base_url",
    "reminder_base_url",
    "wiki_space_id",
    "workspace_home_node_token",
    "workbench_url",
    "schema_version",
)
IMAP_REQUIRED_KEYS = {
    "IMAP_HOST",
    "IMAP_PORT",
    "IMAP_LOGIN",
    "IMAP_PASSWORD",
    "MAILBOX",
    "TZ",
}
IMAP_PLACEHOLDER_VALUES = {
    "IMAP_HOST": {"imap.example.com"},
    "IMAP_LOGIN": {"you@example.com"},
    "IMAP_PASSWORD": {"your-app-specific-password", "app-specific-password"},
}


def config_root(environ=None):
    source = dict(os.environ if environ is None else environ)
    return Path(source.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "offerloop"


def state_root(environ=None):
    source = dict(os.environ if environ is None else environ)
    return Path(source.get("XDG_STATE_HOME", Path.home() / ".local" / "state")) / "offerloop"


def _skill_roots(source, override=None):
    """Return supported local Skill roots without exposing them in reports."""
    if override is not None:
        candidates = [override] if isinstance(override, (str, Path)) else override
    else:
        home = Path(source.get("HOME", Path.home()))
        candidates = [
            SKILLS_ROOT,
            home / ".agents" / "skills",
            home / ".codex" / "skills",
            home / ".claude" / "skills",
            home / ".hermes" / "skills",
        ]
        openclaw_state = source.get("OPENCLAW_STATE_DIR")
        if openclaw_state:
            value = str(openclaw_state)
            if value.startswith("~/") or value.startswith("~\\"):
                openclaw_root = home / value[2:]
            elif value == "~":
                openclaw_root = home
            else:
                openclaw_root = Path(value).expanduser()
        else:
            openclaw_root = home / ".openclaw"
        candidates.append(openclaw_root / "skills")
        codex_home = source.get("CODEX_HOME")
        if codex_home:
            candidates.append(Path(codex_home) / "skills")
        claude_home = source.get("CLAUDE_CONFIG_DIR")
        if claude_home:
            candidates.append(Path(claude_home) / "skills")
        hermes_home = source.get("HERMES_HOME")
        if hermes_home:
            candidates.append(Path(hermes_home) / "skills")

    roots = []
    seen = set()
    for candidate in candidates:
        path = Path(candidate).expanduser()
        try:
            identity = path.resolve(strict=False)
        except OSError:
            identity = path.absolute()
        if identity in seen:
            continue
        seen.add(identity)
        roots.append(path)
    return tuple(roots)


def _skill_is_installed(name, roots):
    return any((root / name / "SKILL.md").is_file() for root in roots)


def _required_external_skills(capability, config):
    required = set(EXTERNAL_SKILLS_BY_CAPABILITY[capability])
    notification = config.get("notifications")
    if capability in {"collection", "reminder"} and isinstance(notification, dict):
        if notification.get("status") == "enabled":
            required.add("lark-im")
            target_id = str(notification.get("target_id", ""))
            if notification.get("target_type") == "user" and not target_id.startswith("ou_"):
                required.add("lark-contact")
    return tuple(sorted(required))


def _external_skills_check(config, capability, roots):
    required = _required_external_skills(capability, config)
    if not required:
        return _check(
            "local.external_skills",
            capability,
            "ready",
            "此能力核心流程直接使用 lark-cli，无额外 Lark Skill 依赖",
        )

    missing = tuple(name for name in required if not _skill_is_installed(name, roots))
    if missing:
        names = "、".join(missing)
        return _check(
            "local.external_skills",
            capability,
            "blocked",
            f"缺少所选能力需要的外部 Lark Skill：{names}",
            f"缺少：{names}。{LARK_SKILLS_RECOVERY}",
        )
    return _check(
        "local.external_skills",
        capability,
        "ready",
        "已发现所选能力需要的外部 Lark Skill（未验证线上权限）："
        + "、".join(required),
    )


def _online_permissions_check(capability):
    return _check(
        "online.permissions",
        capability,
        "unverified",
        "飞书身份、资源访问与线上权限尚未验证",
        "获得用户确认后，按 verification-matrix 执行只读在线验收",
    )


def _run_local_command(command, *, environ, timeout=5):
    try:
        return subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=environ,
        )
    except (OSError, subprocess.SubprocessError):
        return None


def _version_tuple(text):
    match = re.search(r"(?:version\s+)?(\d+)\.(\d+)\.(\d+)", text)
    if not match:
        return None
    return tuple(int(part) for part in match.groups())


def _probe_lark_cli(source, configured_profile):
    search_path = source.get("PATH")
    executable = shutil.which("lark-cli", path=search_path)
    if not executable:
        return (
            ("blocked", "未找到 lark-cli", LARK_CLI_RECOVERY),
            None,
        )

    environment = dict(os.environ)
    environment.update(source)
    version_result = _run_local_command(
        [executable, "--version"], environ=environment
    )
    version = (
        _version_tuple((version_result.stdout + version_result.stderr).strip())
        if version_result and version_result.returncode == 0
        else None
    )
    if version is None:
        return (
            (
                "blocked",
                "lark-cli 无法报告有效版本",
                "重新安装 lark-cli 1.0.73 或更高版本",
            ),
            None,
        )
    if version < MIN_LARK_CLI_VERSION:
        return (
            (
                "needs_action",
                "lark-cli 版本低于支持基线",
                "升级到 lark-cli 1.0.73 或更高版本",
            ),
            None,
        )

    lark_check = ("ready", "lark-cli 版本符合要求", "")
    if configured_profile in (None, ""):
        return lark_check, (
            "needs_action",
            "未登记飞书 profile",
            "选择并登记 lark-cli profile",
        )

    profiles_result = _run_local_command(
        [executable, "profile", "list"], environ=environment
    )
    try:
        profiles = json.loads(profiles_result.stdout) if profiles_result else None
    except json.JSONDecodeError:
        profiles = None
    if isinstance(profiles, dict):
        profiles = profiles.get("profiles")
    if (
        not profiles_result
        or profiles_result.returncode != 0
        or not isinstance(profiles, list)
    ):
        return lark_check, (
            "blocked",
            "无法读取本机 lark-cli profiles",
            "修复或升级 lark-cli 后重新检查",
        )
    names = {
        item.get("name") for item in profiles if isinstance(item, dict)
    }
    if configured_profile not in names:
        return lark_check, (
            "blocked",
            "已登记的飞书 profile 在本机不存在",
            "选择现有 profile，或在本机安全初始化新 profile 后重新登记",
        )

    doctor_result = _run_local_command(
        [executable, "doctor", "--offline", "--profile", str(configured_profile)],
        environ=environment,
    )
    try:
        doctor = json.loads(doctor_result.stdout) if doctor_result else None
    except json.JSONDecodeError:
        doctor = None
    doctor_ok = bool(doctor_result and doctor_result.returncode == 0)
    if isinstance(doctor, dict) and "ok" in doctor:
        doctor_ok = doctor_ok and doctor.get("ok") is True
    if not doctor_ok:
        return lark_check, (
            "blocked",
            "飞书 profile 本地离线检查未通过",
            "运行 lark-cli doctor --offline 修复本地配置；不要在聊天中发送凭证",
        )
    return lark_check, (
        "ready",
        "飞书 profile 已存在且本地配置可用",
        "",
    )


def _legacy_checks(source):
    """Preserve the original no-argument API for older callers."""
    root = config_root(source)
    skills = {
        name: (SKILLS_ROOT / name / "SKILL.md").is_file()
        for name in BUNDLED_SKILLS
    }
    public_config = root / "config.json"
    locator_status = {name: False for name in WORKSPACE_LOCATORS}
    if public_config.is_file():
        try:
            data = json.loads(public_config.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}
        locator_status = {
            name: name in data and data[name] not in (None, "")
            for name in WORKSPACE_LOCATORS
        }
    imap_config = root / "recruiting-reminder" / ".env"
    legacy_imap = SKILLS_ROOT / "recruiting-reminder" / "scripts" / ".env"
    return {
        "python": {
            "ok": sys.version_info >= (3, 10),
            "version": ".".join(map(str, sys.version_info[:3])),
            "required": ">=3.10",
        },
        "lark_cli": {"ok": shutil.which("lark-cli") is not None},
        "skills": skills,
        "offerloop_config": {
            "ok": public_config.is_file(),
            "path": str(public_config),
            "locators": locator_status,
        },
        "imap_config": {
            "ok": imap_config.is_file() or legacy_imap.is_file(),
            "path": str(imap_config),
            "legacy_detected": legacy_imap.is_file(),
        },
        "state_directory": str(state_root(source) / "recruiting-reminder"),
    }


def _read_config(path):
    if not path.is_file():
        return {}, "missing"
    try:
        return json.loads(path.read_text(encoding="utf-8")), "ready"
    except (OSError, json.JSONDecodeError):
        return {}, "invalid"


def _permissions_too_open(path):
    """POSIX mode bits are not a meaningful confidentiality check on Windows."""
    return os.name != "nt" and bool(path.stat().st_mode & 0o077)


def _env_values(path):
    if not path.is_file():
        return {}
    values = {}
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            values[key.strip()] = value
    except OSError:
        return {}
    return values


def _incomplete_imap_keys(values):
    incomplete = set(IMAP_REQUIRED_KEYS - set(values))
    for key in IMAP_REQUIRED_KEYS & set(values):
        value = values[key].strip()
        placeholders = IMAP_PLACEHOLDER_VALUES.get(key, set())
        if not value or value.casefold() in placeholders:
            incomplete.add(key)
    return incomplete


def _check(check_id, capability, status, summary, next_action=""):
    return {
        "id": check_id,
        "capability": capability,
        "status": status,
        "summary": summary,
        "next_action": next_action,
    }


def _status_for_present(value, summary, action):
    if value not in (None, ""):
        return "ready", summary, ""
    missing_summary = summary.replace("已登记", "未登记", 1)
    return "needs_action", missing_summary, action


def _selected_capabilities(capability):
    return status_model.expand_selection(capability)


def _notification_check(config, capability):
    notification = config.get("notifications")
    if notification in (None, {}):
        return _check(
            f"local.{capability}_notification",
            capability,
            "ready",
            "飞书消息通知未启用（可选）",
        )
    if not isinstance(notification, dict):
        return _check(
            f"local.{capability}_notification",
            capability,
            "needs_action",
            "飞书消息通知配置格式无效",
            "重新登记通知状态、目标和发送身份",
        )
    if notification.get("status") != "enabled":
        return _check(
            f"local.{capability}_notification",
            capability,
            "ready",
            "飞书消息通知已停用（可选）",
        )
    target_type = notification.get("target_type")
    target_id = str(notification.get("target_id", ""))
    identity = notification.get("identity")
    target_valid = (
        (target_type == "user" and target_id.startswith("ou_"))
        or (target_type == "chat" and target_id.startswith("oc_"))
    )
    if not target_valid or identity not in ("bot", "user"):
        return _check(
            f"local.{capability}_notification",
            capability,
            "needs_action",
            "飞书消息通知定位不完整",
            "重新登记匹配的通知目标和发送身份",
        )
    return _check(
        f"local.{capability}_notification",
        capability,
        "unverified",
        "飞书消息通知已登记，待在线验证",
        "首次发送前确认接收方、摘要模板和发送身份并验证 IM 权限",
    )


def _capability_report(source, capability, skills_roots=None):
    selected = _selected_capabilities(capability)
    checks = []
    roots = _skill_roots(source, skills_roots)
    root = config_root(source)
    config_path = root / "config.json"
    config, config_state = _read_config(config_path)

    common_status = "ready"
    common_summary = "公共配置可读"
    common_action = ""
    if config_state == "missing":
        common_status = "needs_action"
        common_summary = "尚未登记 OfferLoop 公共定位"
        common_action = "运行 offerloop-setup 配置所选能力的非敏感定位信息"
    elif config_state == "invalid":
        common_status = "blocked"
        common_summary = "OfferLoop 公共配置不是有效 JSON"
        common_action = "修复 config.json 格式后重新检查"
    elif _permissions_too_open(config_path):
        common_status = "needs_action"
        common_summary = "OfferLoop 公共配置权限过宽"
        common_action = "将 config.json 权限收紧为 0600"

    bundled_skills = {
        name: _skill_is_installed(name, roots)
        for name in BUNDLED_SKILLS
    }
    lark_check, profile_check = _probe_lark_cli(
        source, config.get("lark_profile")
    )

    for selected_capability in sorted(selected):
        checks.extend(
            [
                _check(
                    "local.python",
                    selected_capability,
                    "ready" if sys.version_info >= (3, 10) else "blocked",
                    "Python 版本符合要求"
                    if sys.version_info >= (3, 10)
                    else "Python 版本低于 3.10",
                    "安装或选择 Python 3.10 及以上版本"
                    if sys.version_info < (3, 10)
                    else "",
                ),
                _check(
                    "local.lark_cli",
                    selected_capability,
                    *lark_check,
                ),
                _check(
                    "local.skills",
                    selected_capability,
                    "ready" if all(bundled_skills.values()) else "blocked",
                    "OfferLoop 四个 Skill 已安装"
                    if all(bundled_skills.values())
                    else "OfferLoop Skill 安装不完整",
                    "重新安装缺失的 OfferLoop Skill"
                    if not all(bundled_skills.values())
                    else "",
                ),
                _check(
                    "local.config",
                    selected_capability,
                    common_status,
                    common_summary,
                    common_action,
                ),
                _external_skills_check(
                    config,
                    selected_capability,
                    roots,
                ),
                _online_permissions_check(selected_capability),
            ]
        )
        if profile_check is None:
            profile_check = (
                "blocked",
                "无法验证飞书 profile",
                "先修复 lark-cli，再重新检查 profile",
            )
        checks.append(
            _check(
                "local.profile_locator",
                selected_capability,
                *profile_check,
            )
        )

    if "collection" in selected:
        status, result_summary, action = _status_for_present(
            config.get("target_base_url"),
            "已登记求职企业清单",
            "登记求职企业清单地址",
        )
        checks.append(
            _check(
                "local.collection_locator",
                "collection",
                status,
                result_summary,
                action,
            )
        )
        if config.get("progress_base_url") in (None, ""):
            checks.append(
                _check(
                    "local.progress_locator",
                    "collection",
                    "unverified",
                    "未登记求职进展（可选，跨 Base 对账未启用）",
                    "如需跨 Base 对账，再登记求职进展地址",
                )
            )
        else:
            checks.append(
                _check(
                    "local.progress_locator",
                    "collection",
                    "ready",
                    "已登记求职进展（可选）",
                )
            )
        checks.append(_notification_check(config, "collection"))

    if "reminder" in selected:
        for field, check_id, summary in (
            ("progress_base_url", "local.progress_locator", "已登记求职进展"),
            ("reminder_base_url", "local.reminder_locator", "已登记笔面试中心"),
        ):
            status, result_summary, action = _status_for_present(
                config.get(field), summary, f"登记 {summary.replace('已登记', '')} 地址"
            )
            checks.append(_check(check_id, "reminder", status, result_summary, action))
        checks.append(_notification_check(config, "reminder"))

        imap_path = root / "recruiting-reminder" / ".env"
        imap_values = _env_values(imap_path)
        if not imap_path.is_file():
            imap_status = "needs_action"
            imap_summary = "尚未创建 IMAP 配置"
            imap_action = "初始化并在本机填写 IMAP 配置"
        elif _incomplete_imap_keys(imap_values):
            imap_status = "needs_action"
            imap_summary = "IMAP 配置尚未填写完整"
            imap_action = "在本机填写真实 IMAP 配置后重试"
        elif _permissions_too_open(imap_path):
            imap_status = "needs_action"
            imap_summary = "IMAP 配置权限过宽"
            imap_action = "将 IMAP 配置权限收紧为 0600"
        else:
            imap_status = "ready"
            imap_summary = "IMAP 配置字段齐全"
            imap_action = ""
        checks.append(
            _check("local.imap_config", "reminder", imap_status, imap_summary, imap_action)
        )
        state_path = state_root(source) / "recruiting-reminder"
        checks.append(
            _check(
                "local.reminder_state",
                "reminder",
                "ready" if state_path.exists() else "unverified",
                "邮件状态目录可用" if state_path.exists() else "邮件状态目录将在首次运行时创建",
            )
        )

    if "workspace" in selected:
        required = (
            "target_base_url",
            "progress_base_url",
            "reminder_base_url",
            "wiki_space_id",
            "workspace_home_node_token",
            "workbench_url",
        )
        missing = [name for name in required if config.get(name) in (None, "")]
        checks.append(
            _check(
                "local.workspace_locators",
                "workspace",
                "ready" if not missing else "needs_action",
                "工作台与知识库定位已登记"
                if not missing
                else "工作台或知识库定位不完整",
                "登记三张 Base、知识库首页和工作台地址" if missing else "",
            )
        )

    if "integration" in selected:
        required = ("lark_profile", "target_base_url", "progress_base_url")
        missing = [name for name in required if config.get(name) in (None, "")]
        bridge = config.get("progress_sync")
        bridge_ready = (
            isinstance(bridge, dict)
            and all(bridge.get(name) not in (None, "") for name in ("app_id", "endpoint", "workflow_id"))
            and bridge.get("status") == "enabled"
        )
        checks.append(
            _check(
                "local.progress_sync_bridge",
                "integration",
                "ready" if not missing and bridge_ready else "needs_action",
                "求职进展即时桥接定位已登记"
                if not missing and bridge_ready
                else "即时同步所需的 Base 或桥接定位未完成",
                "登记 profile、两张 Base 和 progress_sync 桥接元数据"
                if missing or not bridge_ready
                else "",
            )
        )

    return status_model.build_report(selected=selected, checks=checks)


def run_checks(environ=None, capability=None, skills_roots=None):
    source = dict(os.environ if environ is None else environ)
    if capability is None:
        return _legacy_checks(source)
    return _capability_report(source, capability, skills_roots=skills_roots)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument(
        "--capability",
        choices=("collection", "reminder", "workspace", "full"),
        help="run a capability-specific offline preflight",
    )
    args = parser.parse_args()
    result = run_checks(capability=args.capability)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for name, value in result.items():
            print(f"{name}: {value}")


if __name__ == "__main__":
    main()
