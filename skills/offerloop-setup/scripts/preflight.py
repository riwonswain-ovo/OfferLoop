#!/usr/bin/env python3
"""Offline, read-only OfferLoop first-run checks."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = SKILL_ROOT.parent
STATUS_MODEL_PATH = Path(__file__).with_name("status_model.py")


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


def _legacy_checks(source):
    """Preserve the original no-argument API for older callers."""
    root = config_root(source)
    skills = {
        name: (SKILLS_ROOT / name / "SKILL.md").is_file()
        for name in (
            "offerloop-setup",
            "offerloop-workspace",
            "job-collection",
            "recruiting-reminder",
        )
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
    return ("ready", summary, "") if value not in (None, "") else (
        "needs_action",
        summary,
        action,
    )


def _selected_capabilities(capability):
    return status_model.expand_selection(capability)


def _capability_report(source, capability):
    selected = _selected_capabilities(capability)
    checks = []
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
    elif config_path.stat().st_mode & 0o077:
        common_status = "needs_action"
        common_summary = "OfferLoop 公共配置权限过宽"
        common_action = "将 config.json 权限收紧为 0600"

    bundled_skills = {
        name: (SKILLS_ROOT / name / "SKILL.md").is_file()
        for name in (
            "offerloop-setup",
            "offerloop-workspace",
            "job-collection",
            "recruiting-reminder",
        )
    }

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
                    "ready" if shutil.which("lark-cli") else "blocked",
                    "lark-cli 可用" if shutil.which("lark-cli") else "未找到 lark-cli",
                    "安装并初始化 lark-cli" if not shutil.which("lark-cli") else "",
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
            ]
        )
        profile_status, profile_summary, profile_action = _status_for_present(
            config.get("lark_profile"),
            "已登记飞书 profile",
            "选择并登记 lark-cli profile",
        )
        checks.append(
            _check(
                "local.profile_locator",
                selected_capability,
                profile_status,
                profile_summary,
                profile_action,
            )
        )

    if "collection" in selected:
        for field, check_id, summary in (
            ("target_base_url", "local.collection_locator", "已登记求职企业清单"),
            ("progress_base_url", "local.progress_locator", "已登记求职进展"),
        ):
            status, result_summary, action = _status_for_present(
                config.get(field), summary, f"登记 {summary.replace('已登记', '')} 地址"
            )
            checks.append(_check(check_id, "collection", status, result_summary, action))

    if "reminder" in selected:
        for field, check_id, summary in (
            ("progress_base_url", "local.progress_locator", "已登记求职进展"),
            ("reminder_base_url", "local.reminder_locator", "已登记笔面试中心"),
        ):
            status, result_summary, action = _status_for_present(
                config.get(field), summary, f"登记 {summary.replace('已登记', '')} 地址"
            )
            checks.append(_check(check_id, "reminder", status, result_summary, action))

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
        elif imap_path.stat().st_mode & 0o077:
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


def run_checks(environ=None, capability=None):
    source = dict(os.environ if environ is None else environ)
    if capability is None:
        return _legacy_checks(source)
    return _capability_report(source, capability)


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
