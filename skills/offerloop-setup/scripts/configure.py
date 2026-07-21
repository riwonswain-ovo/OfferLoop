#!/usr/bin/env python3
"""Manage non-secret OfferLoop locator config and initialize IMAP template."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import tempfile
from urllib.parse import urlparse


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = SKILL_ROOT.parent
PUBLIC_LOCATOR_KEYS = {
    "lark_profile",
    "target_base_url",
    "progress_base_url",
    "reminder_base_url",
    "wiki_space_id",
    "workspace_home_node_token",
    "workbench_url",
    "schema_version",
}
PROGRESS_SYNC_KEYS = {"app_id", "endpoint", "workflow_id", "status"}
NOTIFICATION_KEYS = {"status", "target_type", "target_name", "target_id", "identity"}


def config_root(environ=None):
    source = dict(os.environ if environ is None else environ)
    return Path(source.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "offerloop"


def config_file(environ=None):
    return config_root(environ) / "config.json"


def load_config(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_private_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix="offerloop-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def update_locator_config(path, updates):
    """Merge non-secret OfferLoop resource locators into the private config file."""
    unknown = set(updates) - PUBLIC_LOCATOR_KEYS
    if unknown:
        names = ", ".join(sorted(unknown))
        raise ValueError(f"public config cannot store secret or unknown keys: {names}")
    workbench_url = updates.get("workbench_url")
    if workbench_url is not None:
        validate_workbench_url(workbench_url)
    data = load_config(path)
    data.update({key: value for key, value in updates.items() if value is not None})
    write_private_json(path, data)
    return data


def update_progress_sync_config(path, updates):
    """Merge non-secret instant-sync locators without replacing sibling config."""
    unknown = set(updates) - PROGRESS_SYNC_KEYS
    if unknown:
        names = ", ".join(sorted(unknown))
        raise ValueError(f"progress_sync cannot store secret or unknown keys: {names}")
    filtered = {key: value for key, value in updates.items() if value is not None}
    if "endpoint" in filtered:
        validate_progress_sync_endpoint(filtered["endpoint"])

    data = load_config(path)
    existing = data.get("progress_sync", {})
    if existing is None:
        existing = {}
    if not isinstance(existing, dict):
        raise ValueError("progress_sync must be a JSON object")
    bridge = dict(existing)
    bridge.update(filtered)
    if bridge.get("status") == "enabled":
        missing = [
            key
            for key in ("app_id", "endpoint", "workflow_id")
            if bridge.get(key) in (None, "")
        ]
        if missing:
            raise ValueError(
                "progress_sync cannot be enabled without: " + ", ".join(missing)
            )
    data["progress_sync"] = bridge
    write_private_json(path, data)
    return data


def update_notification_config(path, updates):
    """Merge the explicitly approved Feishu notification destination."""
    unknown = set(updates) - NOTIFICATION_KEYS
    if unknown:
        names = ", ".join(sorted(unknown))
        raise ValueError(f"notifications cannot store secret or unknown keys: {names}")
    filtered = {key: value for key, value in updates.items() if value is not None}
    if filtered.get("status") not in (None, "enabled", "disabled"):
        raise ValueError("notifications status must be enabled or disabled")
    if filtered.get("target_type") not in (None, "user", "chat"):
        raise ValueError("notifications target_type must be user or chat")
    if filtered.get("identity") not in (None, "bot", "user"):
        raise ValueError("notifications identity must be bot or user")
    if "target_name" in filtered:
        target_name = str(filtered["target_name"]).strip()
        if not target_name:
            raise ValueError("notifications target_name must not be empty")
        filtered["target_name"] = target_name

    data = load_config(path)
    existing = data.get("notifications", {})
    if existing is None:
        existing = {}
    if not isinstance(existing, dict):
        raise ValueError("notifications must be a JSON object")
    notification = dict(existing)
    notification.update(filtered)

    target_type = notification.get("target_type")
    target_id = str(notification.get("target_id", "")).strip()
    if target_id:
        expected_prefix = {"user": "ou_", "chat": "oc_"}.get(target_type)
        if expected_prefix is None or not target_id.startswith(expected_prefix):
            raise ValueError("notifications target_id does not match target_type")
    if notification.get("status") == "enabled":
        missing = [
            key
            for key in ("target_type", "target_id", "identity")
            if notification.get(key) in (None, "")
        ]
        if missing:
            raise ValueError(
                "notifications cannot be enabled without: " + ", ".join(missing)
            )

    data["notifications"] = notification
    write_private_json(path, data)
    return data


def validate_workbench_url(value):
    parsed = urlparse(str(value))
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("workbench_url must be an absolute https URL")
    if parsed.username or parsed.password:
        raise ValueError("workbench_url must not contain credentials")
    if parsed.fragment:
        raise ValueError("workbench_url must not contain a fragment")


def validate_progress_sync_endpoint(value):
    parsed = urlparse(str(value))
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("progress_sync endpoint must be an absolute https URL")
    if parsed.username or parsed.password:
        raise ValueError("progress_sync endpoint must not contain credentials")
    if parsed.fragment:
        raise ValueError("progress_sync endpoint must not contain a fragment")


def init_imap(environ=None):
    destination = config_root(environ) / "recruiting-reminder" / ".env"
    if destination.exists():
        return destination, False
    template = SKILLS_ROOT / "recruiting-reminder" / "scripts" / ".env.example"
    if not template.exists():
        raise FileNotFoundError(f"IMAP template not found: {template}")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copyfile(template, destination)
    os.chmod(destination, 0o600)
    return destination, True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", help="lark-cli profile name (not a secret)")
    parser.add_argument("--target-base-url", help="OfferLoop target Base URL")
    parser.add_argument("--progress-base-url", help="OfferLoop progress Base URL")
    parser.add_argument("--reminder-base-url", help="OfferLoop interview center Base URL")
    parser.add_argument("--wiki-space-id", help="OfferLoop Wiki space ID")
    parser.add_argument("--workspace-home-node-token", help="OfferLoop homepage Wiki node")
    parser.add_argument("--workbench-url", help="published OfferLoop workbench HTTPS URL")
    parser.add_argument("--schema-version", type=int, help="OfferLoop schema version")
    parser.add_argument("--progress-sync-app-id", help="published sync app ID")
    parser.add_argument("--progress-sync-endpoint", help="published sync HTTPS endpoint")
    parser.add_argument("--progress-sync-workflow-id", help="Base workflow ID")
    parser.add_argument(
        "--progress-sync-status",
        choices=("unverified", "enabled", "disabled"),
        help="sync bridge status; use enabled only after online verification",
    )
    parser.add_argument(
        "--notification-status",
        choices=("enabled", "disabled"),
        help="send one Feishu summary after a mutating skill run",
    )
    parser.add_argument(
        "--notification-target-type",
        choices=("user", "chat"),
        help="notification destination type",
    )
    parser.add_argument("--notification-target-id", help="Feishu ou_xxx or oc_xxx")
    parser.add_argument(
        "--notification-target-name",
        help="confirmed Feishu user or chat display name (not a secret)",
    )
    parser.add_argument(
        "--notification-identity",
        choices=("bot", "user"),
        help="explicitly approved message sender identity",
    )
    parser.add_argument("--init-imap", action="store_true")
    args = parser.parse_args()

    path = config_file()
    updates = {
        "lark_profile": args.profile,
        "target_base_url": args.target_base_url,
        "progress_base_url": args.progress_base_url,
        "reminder_base_url": args.reminder_base_url,
        "wiki_space_id": args.wiki_space_id,
        "workspace_home_node_token": args.workspace_home_node_token,
        "workbench_url": args.workbench_url,
        "schema_version": args.schema_version,
    }
    if any(value is not None for value in updates.values()):
        update_locator_config(path, updates)
        print(f"Updated {path}")
    progress_sync_updates = {
        "app_id": args.progress_sync_app_id,
        "endpoint": args.progress_sync_endpoint,
        "workflow_id": args.progress_sync_workflow_id,
        "status": args.progress_sync_status,
    }
    if any(value is not None for value in progress_sync_updates.values()):
        update_progress_sync_config(path, progress_sync_updates)
        print(f"Updated {path}")
    notification_updates = {
        "status": args.notification_status,
        "target_type": args.notification_target_type,
        "target_name": args.notification_target_name,
        "target_id": args.notification_target_id,
        "identity": args.notification_identity,
    }
    if any(value is not None for value in notification_updates.values()):
        update_notification_config(path, notification_updates)
        print(f"Updated {path}")
    if args.init_imap:
        destination, created = init_imap()
        action = "Created" if created else "Already exists"
        print(f"{action}: {destination}")
    if not (
        any(value is not None for value in updates.values())
        or any(value is not None for value in progress_sync_updates.values())
        or any(value is not None for value in notification_updates.values())
        or args.init_imap
    ):
        parser.print_help()


if __name__ == "__main__":
    main()
