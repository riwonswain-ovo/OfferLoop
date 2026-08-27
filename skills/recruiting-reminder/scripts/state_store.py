#!/usr/bin/env python3
"""Atomic local state for processed mail, failed steps, and notification idempotency."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import tempfile


def _scalar(value, name, limit=1000):
    if isinstance(value, (dict, list, tuple, set)) or value is None:
        raise ValueError(f"{name} must be a scalar")
    text = str(value).strip()
    if not text or len(text) > limit or any(ord(char) < 32 or ord(char) == 127 for char in text):
        raise ValueError(f"{name} is invalid")
    return text


def state_dir(environ=None):
    source = os.environ if environ is None else environ
    return Path(source.get("XDG_STATE_HOME", Path.home() / ".local/state")) / "offerloop/recruiting-reminder"


def _load(path, default):
    if not path.exists():
        return default
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, type(default)):
        raise ValueError(f"invalid state shape: {path.name}")
    return value


def _atomic_update(path, update, default, load_fn=None):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = path.with_suffix(path.suffix + ".lock")
    with lock_path.open("a+", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = load_fn(path) if load_fn else _load(path, default)
        result = update(current)
        fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as stream:
                json.dump(result, stream, ensure_ascii=False, separators=(",", ":"))
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temp_name, 0o600)
            os.replace(temp_name, path)
        finally:
            if os.path.exists(temp_name):
                os.unlink(temp_name)
        return result


def mark_processed(identifiers, path=None):
    selected = Path(path) if path else state_dir() / "processed_emails.json"
    clean = [_scalar(value, "source_mail_id") for value in identifiers]
    def update(current):
        values = current.get("source_mail_ids", [])
        merged = list(dict.fromkeys([*values, *clean]))
        return {"version": 2, "source_mail_ids": merged}
    def load_legacy(path):
        if not path.exists(): return {"version": 2, "source_mail_ids": []}
        value = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(value, list): return {"version": 2, "source_mail_ids": [str(item) for item in value]}
        if isinstance(value, dict):
            merged = []
            for key in ("source_mail_ids", "processed", "message_ids", "uids"):
                if isinstance(value.get(key), list): merged.extend(str(item) for item in value[key])
            return {"version": 2, "source_mail_ids": list(dict.fromkeys(merged))}
        raise ValueError("invalid processed-mail state")
    return _atomic_update(selected, update, {"version": 2, "source_mail_ids": []}, load_legacy)


def record_failure(entry, path=None):
    if not isinstance(entry, dict):
        raise ValueError("failure must be an object")
    allowed = {"run_id", "source_id", "failed_step", "successful_steps", "idempotency_key", "error_type"}
    clean = {key: entry.get(key) for key in allowed if entry.get(key) not in (None, "")}
    required = {"run_id", "source_id", "failed_step", "idempotency_key", "error_type"}
    if not required.issubset(clean):
        raise ValueError("failure requires run_id, source_id, failed_step, idempotency_key, and error_type")
    successful_steps = clean.get("successful_steps", [])
    if not isinstance(successful_steps, list) or len(successful_steps) > 20:
        raise ValueError("successful_steps must be an array of at most 20 items")
    clean["run_id"] = _scalar(clean["run_id"], "run_id", 256)
    clean["source_id"] = _scalar(clean["source_id"], "source_id")
    clean["failed_step"] = _scalar(clean["failed_step"], "failed_step", 120)
    clean["idempotency_key"] = _scalar(clean["idempotency_key"], "idempotency_key", 256)
    clean["error_type"] = _scalar(clean["error_type"], "error_type", 80)
    clean["successful_steps"] = [_scalar(value, "successful_step", 120) for value in successful_steps]
    clean.update({"status": "open", "failed_at": datetime.now(timezone.utc).isoformat()})
    selected = Path(path) if path else state_dir() / "failures.json"
    def update(current):
        retained = [item for item in current if item.get("idempotency_key") != clean["idempotency_key"]]
        resolved = [item for item in retained if item.get("status") != "open"][-1000:]
        opened = [item for item in retained if item.get("status") == "open"]
        return [*resolved, *opened, clean]
    result = _atomic_update(selected, update, [])
    if path is None:
        _mark_operation_failed(clean)
    return result


def resolve_failure(idempotency_key, path=None):
    idempotency_key = _scalar(idempotency_key, "idempotency_key", 256)
    selected = Path(path) if path else state_dir() / "failures.json"
    def update(current):
        for item in current:
            if item.get("idempotency_key") == idempotency_key and item.get("status") == "open":
                item["status"] = "resolved"
                item["resolved_at"] = datetime.now(timezone.utc).isoformat()
        opened = [item for item in current if item.get("status") == "open"]
        resolved = [item for item in current if item.get("status") != "open"][-1000:]
        return [*resolved, *opened]
    return _atomic_update(selected, update, [])


def list_open_failures(path=None):
    selected = Path(path) if path else state_dir() / "failures.json"
    return [item for item in _load(selected, []) if item.get("status") == "open"]


def record_success(entry, path=None):
    if not isinstance(entry, dict):
        raise ValueError("success must be an object")
    allowed = {"run_id", "source_id", "step", "idempotency_key", "result_ref"}
    clean = {key: entry.get(key) for key in allowed if entry.get(key) not in (None, "")}
    required = {"run_id", "source_id", "step", "idempotency_key"}
    if not required.issubset(clean):
        raise ValueError("success requires run_id, source_id, step, and idempotency_key")
    clean["run_id"] = _scalar(clean["run_id"], "run_id", 256)
    clean["source_id"] = _scalar(clean["source_id"], "source_id")
    clean["step"] = _scalar(clean["step"], "step", 120)
    clean["idempotency_key"] = _scalar(clean["idempotency_key"], "idempotency_key", 256)
    if "result_ref" in clean:
        clean["result_ref"] = _scalar(clean["result_ref"], "result_ref", 1000)
    clean.update({"status": "succeeded", "completed_at": datetime.now(timezone.utc).isoformat()})
    selected = Path(path) if path else state_dir() / "operations.json"
    def update(current):
        retained = [item for item in current if item.get("idempotency_key") != clean["idempotency_key"]]
        return _compact_operations([*retained, clean])
    return _atomic_update(selected, update, [])


def get_operation(idempotency_key, path=None):
    idempotency_key = _scalar(idempotency_key, "idempotency_key", 256)
    selected = Path(path) if path else state_dir() / "operations.json"
    return next(
        (item for item in reversed(_load(selected, [])) if item.get("idempotency_key") == idempotency_key),
        None,
    )


def begin_operation(entry, path=None, allow_retry=False):
    """Atomically claim an external write before it is attempted."""
    if not isinstance(entry, dict):
        raise ValueError("operation must be an object")
    required = {"run_id", "source_id", "step", "idempotency_key"}
    clean = {key: entry.get(key) for key in required if entry.get(key) not in (None, "")}
    if required != set(clean):
        raise ValueError("operation requires run_id, source_id, step, and idempotency_key")
    for key, limit in (("run_id", 256), ("source_id", 1000), ("step", 120), ("idempotency_key", 256)):
        clean[key] = _scalar(clean[key], key, limit)
    selected = Path(path) if path else state_dir() / "operations.json"
    claimed = False
    def update(current):
        nonlocal claimed
        existing = next((item for item in reversed(current) if item.get("idempotency_key") == clean["idempotency_key"]), None)
        if existing and existing.get("status") in {"pending", "succeeded"}:
            return current
        if existing and existing.get("status") == "failed" and not allow_retry:
            return current
        claimed = True
        pending = {**clean, "status": "pending", "started_at": datetime.now(timezone.utc).isoformat()}
        retained = [item for item in current if item.get("idempotency_key") != clean["idempotency_key"]]
        return _compact_operations([*retained, pending])
    state = _atomic_update(selected, update, [])
    current = next((item for item in reversed(state) if item.get("idempotency_key") == clean["idempotency_key"]), None)
    return {"claimed": claimed, "entry": current}


def _mark_operation_failed(failure, path=None):
    selected = Path(path) if path else state_dir() / "operations.json"
    def update(current):
        matched = False
        for item in current:
            if item.get("idempotency_key") == failure["idempotency_key"]:
                matched = True
                item.update({
                    "status": "failed",
                    "failed_at": failure["failed_at"],
                    "error_type": failure["error_type"],
                })
        if not matched:
            current.append({
                "run_id": failure["run_id"], "source_id": failure["source_id"],
                "step": failure["failed_step"], "idempotency_key": failure["idempotency_key"],
                "status": "failed", "failed_at": failure["failed_at"],
                "error_type": failure["error_type"],
            })
        return _compact_operations(current)
    return _atomic_update(selected, update, [])


def record_mail_outcome(entry, path=None):
    """Persist only routing metadata needed for later source-chain handling."""
    if not isinstance(entry, dict):
        raise ValueError("mail outcome must be an object")
    source_id = _scalar(entry.get("source_mail_id"), "source_mail_id")
    outcome = _scalar(entry.get("outcome"), "outcome", 80)
    if outcome not in {"skipped_preliminary", "processed", "ignored", "not_recruiting"}:
        raise ValueError("unsupported mail outcome")
    selected = Path(path) if path else state_dir() / "mail_outcomes.json"
    def update(current):
        current[source_id] = {"outcome": outcome, "recorded_at": datetime.now(timezone.utc).isoformat()}
        return current
    return _atomic_update(selected, update, {})


def get_mail_outcome(source_id, path=None):
    source_id = _scalar(source_id, "source_mail_id")
    selected = Path(path) if path else state_dir() / "mail_outcomes.json"
    return _load(selected, {}).get(source_id)


def claim_notification(run_id, path=None):
    run_id = _scalar(run_id, "run_id", 256)
    selected = Path(path) if path else state_dir() / "notifications.json"
    claimed = False
    def update(current):
        nonlocal claimed
        key = str(run_id)
        existing = current.get(key, {})
        # A process can die after Feishu accepts a message but before the local
        # state is marked sent.  Never expire an in-flight claim automatically:
        # at-most-once delivery is safer than silently sending a duplicate.
        if existing.get("status") in {"sending", "sent"}:
            return current
        claimed = True
        current.pop(key, None)
        current[key] = {"status": "sending", "claimed_at": datetime.now(timezone.utc).isoformat()}
        sent_keys = [name for name, item in current.items() if item.get("status") == "sent"]
        while len(current) > 1000 and sent_keys:
            current.pop(sent_keys.pop(0), None)
        return current
    state = _atomic_update(selected, update, {})
    return {"claimed": claimed, "entry": state.get(str(run_id), {})}


def notification_idempotency_key(run_id):
    run_id = _scalar(run_id, "run_id", 256)
    return f"offerloop-recruiting-reminder-{run_id}"


def mark_notification(run_id, path=None):
    run_id = _scalar(run_id, "run_id", 256)
    selected = Path(path) if path else state_dir() / "notifications.json"
    def update(current):
        current.pop(str(run_id), None)
        current[str(run_id)] = {"status": "sent", "sent_at": datetime.now(timezone.utc).isoformat()}
        return current
    return _atomic_update(selected, update, {})


def release_notification(run_id, path=None, verified_absent=False):
    if not verified_absent:
        raise ValueError("release requires verified_absent=true after checking the target chat")
    run_id = _scalar(run_id, "run_id", 256)
    selected = Path(path) if path else state_dir() / "notifications.json"
    def update(current):
        if current.get(str(run_id), {}).get("status") == "sending":
            current.pop(str(run_id), None)
        return current
    return _atomic_update(selected, update, {})


def notification_status(run_id, path=None):
    run_id = _scalar(run_id, "run_id", 256)
    selected = Path(path) if path else state_dir() / "notifications.json"
    return _load(selected, {}).get(str(run_id))


def _compact_operations(items, limit=5000):
    pending = [item for item in items if item.get("status") == "pending"]
    completed = [item for item in items if item.get("status") != "pending"]
    room = max(0, limit - len(pending))
    return [*(completed[-room:] if room else []), *pending]


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    processed = sub.add_parser("mark-processed")
    processed.add_argument("identifiers", nargs="+")
    failed = sub.add_parser("record-failure")
    failed.add_argument("--json", required=True)
    resolved = sub.add_parser("resolve-failure")
    resolved.add_argument("idempotency_key")
    sub.add_parser("list-open-failures")
    success = sub.add_parser("record-success")
    success.add_argument("--json", required=True)
    operation = sub.add_parser("get-operation")
    operation.add_argument("idempotency_key")
    begin = sub.add_parser("begin-operation")
    begin.add_argument("--json", required=True)
    begin.add_argument("--retry", action="store_true")
    mail_outcome = sub.add_parser("record-mail-outcome")
    mail_outcome.add_argument("--json", required=True)
    get_outcome = sub.add_parser("get-mail-outcome")
    get_outcome.add_argument("source_mail_id")
    claim = sub.add_parser("claim-notification")
    claim.add_argument("run_id")
    notice = sub.add_parser("mark-notification")
    notice.add_argument("run_id")
    release = sub.add_parser("release-notification")
    release.add_argument("run_id")
    release.add_argument("--verified-absent", action="store_true", required=True)
    notice_status = sub.add_parser("notification-status")
    notice_status.add_argument("run_id")
    args = parser.parse_args()
    if args.command == "mark-processed":
        state = mark_processed(args.identifiers)
        result = {"marked": len(args.identifiers), "total": len(state["source_mail_ids"])}
    elif args.command == "record-failure":
        payload = json.loads(args.json)
        state = record_failure(payload)
        result = {"recorded": payload.get("idempotency_key"), "open_count": sum(item.get("status") == "open" for item in state)}
    elif args.command == "resolve-failure":
        state = resolve_failure(args.idempotency_key)
        result = {"resolved": args.idempotency_key, "open_count": sum(item.get("status") == "open" for item in state)}
    elif args.command == "record-success":
        payload = json.loads(args.json)
        record_success(payload)
        result = get_operation(payload.get("idempotency_key"))
    elif args.command == "get-operation": result = get_operation(args.idempotency_key)
    elif args.command == "begin-operation": result = begin_operation(json.loads(args.json), allow_retry=args.retry)
    elif args.command == "record-mail-outcome":
        payload = json.loads(args.json)
        record_mail_outcome(payload)
        result = {"source_mail_id": payload.get("source_mail_id"), "outcome": payload.get("outcome")}
    elif args.command == "get-mail-outcome": result = get_mail_outcome(args.source_mail_id)
    elif args.command == "claim-notification": result = claim_notification(args.run_id)
    elif args.command == "mark-notification":
        mark_notification(args.run_id)
        result = {"run_id": args.run_id, "status": "sent"}
    elif args.command == "release-notification":
        release_notification(args.run_id, verified_absent=args.verified_absent)
        result = {"run_id": args.run_id, "status": "released_after_verified_absent"}
    elif args.command == "notification-status": result = notification_status(args.run_id)
    else: result = list_open_failures()
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
