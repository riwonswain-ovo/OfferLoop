#!/usr/bin/env python3
"""Build a safe, resumable OfferLoop first-deployment plan.

The script never calls Feishu, creates resources, or reads credentials. It only
inspects non-secret locator configuration and can persist a redacted checkpoint.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import tempfile


PLAN_VERSION = 1
CAPABILITIES = {"collection", "reminder", "workspace", "full"}
RESOURCE_LOCATORS = {
    "enterprise_base": "target_base_url",
    "progress_base": "progress_base_url",
    "reminder_base": "reminder_base_url",
    "workbench": "workbench_url",
}
TEMPLATE_DIRECTORIES = {
    "workbench": "assets/workbench-template",
    "progress_sync": "assets/progress-sync-template",
}
PHASES = (
    ("preflight", "检查 Python、lark-cli、四个 Skill 与选定 profile"),
    ("bot_setup", "按需启用机器人能力、发布并安装应用，验证目标群成员关系"),
    ("bases", "创建或接管求职企业清单、求职进展与笔面试中心"),
    ("workspace", "创建私有知识库、固定目录和使用指南"),
    ("workbench", "发布招聘工作台"),
    ("progress_sync", "发布已投递即时同步服务并创建唯一 Base workflow"),
    ("imap", "创建本地 IMAP 模板，等待用户在本机填写授权码"),
    ("acceptance", "运行只读验收；即时联动演练必须使用并清理临时记录"),
)


def config_root(environ=None):
    source = dict(os.environ if environ is None else environ)
    return Path(source.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "offerloop"


def state_root(environ=None):
    source = dict(os.environ if environ is None else environ)
    return Path(source.get("XDG_STATE_HOME", Path.home() / ".local" / "state")) / "offerloop"


def config_file(environ=None):
    return config_root(environ) / "config.json"


def checkpoint_file(environ=None):
    return state_root(environ) / "deployment.json"


def load_config(environ=None):
    path = config_file(environ)
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def expand_capability(capability):
    if capability not in CAPABILITIES:
        raise ValueError(f"unsupported capability: {capability}")
    return {"collection", "reminder", "workspace", "integration"} if capability == "full" else {capability}


def _configured(config, resource):
    if resource == "wiki_home":
        return bool(config.get("wiki_space_id") and config.get("workspace_home_node_token"))
    if resource == "progress_sync":
        bridge = config.get("progress_sync")
        return isinstance(bridge, dict) and bridge.get("status") == "enabled" and all(
            bridge.get(name) for name in ("app_id", "endpoint", "workflow_id")
        )
    locator = RESOURCE_LOCATORS.get(resource)
    return bool(locator and config.get(locator))


def _required_resources(selected):
    required = {"enterprise_base", "progress_base"}
    if "reminder" in selected or "workspace" in selected:
        required.add("reminder_base")
    if "workspace" in selected:
        required.update({"wiki_home", "workbench"})
    if "integration" in selected:
        required.add("progress_sync")
    return required


def _resource_status(config, resource):
    if _configured(config, resource):
        return "ready"
    template = TEMPLATE_DIRECTORIES.get(resource)
    if template and not (Path(__file__).resolve().parents[1] / template).is_dir():
        return "blocked"
    return "pending"


def build_plan(config, capability="full"):
    selected = expand_capability(capability)
    resources = [
        {"id": resource, "status": _resource_status(config, resource)}
        for resource in sorted(_required_resources(selected))
    ]
    return {
        "version": PLAN_VERSION,
        "capability": capability,
        "selected": sorted(selected),
        "profile_ready": bool(config.get("lark_profile")),
        "resources": resources,
        "phases": [
            {"id": phase_id, "summary": summary}
            for phase_id, summary in PHASES
            if phase_id != "imap" or "reminder" in selected
        ],
        "confirmations": [
            "创建或接管 Base、知识库、工作台和即时同步服务前的一次总确认",
            "启用通知时确认接收方式、目标名称、发送身份和最终摘要模板",
            "用户填写 IMAP 授权码后的一次仅连通性检查确认",
        ],
        "safety": {"stores_secrets": False, "creates_resources": False, "reads_mail": False},
    }


def write_checkpoint(path, plan):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    payload = {key: plan[key] for key in ("version", "capability", "resources", "phases")}
    fd, temporary = tempfile.mkstemp(prefix="offerloop-deploy-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capability", choices=sorted(CAPABILITIES), default="full")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--write-checkpoint", action="store_true")
    args = parser.parse_args()
    plan = build_plan(load_config(), args.capability)
    if args.write_checkpoint:
        write_checkpoint(checkpoint_file(), plan)
    if args.json:
        print(json.dumps(plan, ensure_ascii=False, indent=2))
    else:
        for resource in plan["resources"]:
            print(f"{resource['id']}: {resource['status']}")


if __name__ == "__main__":
    main()
