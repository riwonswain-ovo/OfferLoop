#!/usr/bin/env python3
"""Persist and verify standing authorization for job-collection notifications.

The authorization is bound to the exact configured destination and identity by
an opaque SHA-256 fingerprint.  The raw Feishu target ID remains only in the
existing private OfferLoop config and is never printed or copied into the
authorization file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import tempfile


SCHEMA_VERSION = 1
SCOPE = "job-collection.notifications"


def config_root(environ: dict[str, str] | None = None) -> Path:
    source = os.environ if environ is None else environ
    return Path(source.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "offerloop"


def default_config_path() -> Path:
    return config_root() / "config.json"


def default_policy_path() -> Path:
    return config_root() / "job-collection-notification-authorization.json"


def load_json(path: Path) -> dict:
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path.name} must contain a JSON object")
    return data


def write_private_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix="offerloop-auth-", dir=path.parent)
    try:
        if os.name != "nt":
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
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


def configured_destination(config: dict) -> dict:
    notification = config.get("notifications")
    if not isinstance(notification, dict):
        raise ValueError("OfferLoop notifications are not configured")
    if notification.get("status") != "enabled":
        raise ValueError("OfferLoop notifications are not enabled")

    target_type = str(notification.get("target_type", "")).strip()
    target_id = str(notification.get("target_id", "")).strip()
    target_name = str(notification.get("target_name", "")).strip()
    identity = str(notification.get("identity", "")).strip()
    expected_prefix = {"chat": "oc_", "user": "ou_"}.get(target_type)
    if expected_prefix is None or not target_id.startswith(expected_prefix):
        raise ValueError("OfferLoop notification destination is invalid")
    if not target_name:
        raise ValueError("OfferLoop notification destination name is missing")
    if identity not in {"bot", "user"}:
        raise ValueError("OfferLoop notification identity is invalid")
    return {
        "target_type": target_type,
        "target_id": target_id,
        "target_name": target_name,
        "identity": identity,
    }


def destination_fingerprint(destination: dict) -> str:
    raw = "\0".join(
        [
            SCOPE,
            destination["target_type"],
            destination["target_id"],
            destination["identity"],
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def safe_result(*, authorized: bool, reason: str, destination: dict | None) -> dict:
    result = {
        "authorized": authorized,
        "reason": reason,
        "scope": SCOPE,
    }
    if destination:
        result.update(
            {
                "target_name": destination["target_name"],
                "target_type": destination["target_type"],
                "identity": destination["identity"],
            }
        )
    return result


def check_authorization(config: dict, policy: dict) -> dict:
    try:
        destination = configured_destination(config)
    except ValueError as error:
        return safe_result(authorized=False, reason=str(error), destination=None)
    if policy.get("schema_version") != SCHEMA_VERSION:
        return safe_result(
            authorized=False, reason="standing authorization is missing", destination=destination
        )
    if policy.get("enabled") is not True or policy.get("scope") != SCOPE:
        return safe_result(
            authorized=False, reason="standing authorization is disabled", destination=destination
        )
    if policy.get("destination_fingerprint") != destination_fingerprint(destination):
        return safe_result(
            authorized=False,
            reason="configured destination or identity changed",
            destination=destination,
        )
    return safe_result(authorized=True, reason="standing authorization matched", destination=destination)


def authorize(config: dict) -> tuple[dict, dict]:
    destination = configured_destination(config)
    policy = {
        "schema_version": SCHEMA_VERSION,
        "enabled": True,
        "scope": SCOPE,
        "target_name": destination["target_name"],
        "target_type": destination["target_type"],
        "identity": destination["identity"],
        "destination_fingerprint": destination_fingerprint(destination),
        "authorized_at": datetime.now(timezone.utc).isoformat(),
        "authorization_source": "explicit_user_request",
    }
    return policy, safe_result(
        authorized=True, reason="standing authorization saved", destination=destination
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "authorize", "revoke"))
    parser.add_argument("--config", type=Path, default=default_config_path())
    parser.add_argument("--policy", type=Path, default=default_policy_path())
    parser.add_argument(
        "--confirm-standing-authorization",
        action="store_true",
        help="required for authorize; records the user's explicit standing instruction",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = load_json(args.config)
    policy = load_json(args.policy)

    if args.action == "authorize":
        if not args.confirm_standing_authorization:
            raise SystemExit("authorize requires --confirm-standing-authorization")
        policy, result = authorize(config)
        write_private_json(args.policy, policy)
        print(json.dumps(result, ensure_ascii=False))
        return 0

    if args.action == "revoke":
        policy["schema_version"] = SCHEMA_VERSION
        policy["enabled"] = False
        policy["scope"] = SCOPE
        policy["revoked_at"] = datetime.now(timezone.utc).isoformat()
        write_private_json(args.policy, policy)
        destination = None
        try:
            destination = configured_destination(config)
        except ValueError:
            pass
        print(
            json.dumps(
                safe_result(
                    authorized=False,
                    reason="standing authorization revoked",
                    destination=destination,
                ),
                ensure_ascii=False,
            )
        )
        return 0

    result = check_authorization(config, policy)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["authorized"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
