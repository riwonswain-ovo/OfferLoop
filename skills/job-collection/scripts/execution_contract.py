#!/usr/bin/env python3
"""Fake-only ledger for observable job-collection tool calls."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Mapping, Sequence


ROUTES = {"hard_filtered", "auto_write", "awaiting_write_confirmation"}
DEDUP_RESULTS = {"unique", "duplicate", "needs_confirmation"}


def _text(payload: Mapping[str, object], name: str) -> str:
    value = payload.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"tool call requires top-level {name}")
    return value.strip()


def _identity(payload: Mapping[str, object]) -> tuple[str, str, str]:
    stable_key = _text(payload, "stable_key")
    source_id = _text(payload, "source_id")
    source_record_id = _text(payload, "source_record_id")
    expected = f"{source_id}:{source_record_id}"
    if stable_key != expected:
        raise ValueError(f"stable_key must equal source_id:source_record_id ({expected})")
    return stable_key, source_id, source_record_id


def _stable_keys(values: Iterable[str]) -> tuple[str, ...]:
    keys = tuple(values)
    if not keys or any(not isinstance(key, str) or not key.strip() for key in keys):
        raise ValueError("tool call requires non-empty stable_keys")
    if len(set(keys)) != len(keys):
        raise ValueError("stable_keys must be unique")
    return keys


@dataclass
class ExecutionContract:
    """Reject incomplete parameters, unsafe ordering, and late finalize repair."""

    events: list[str] = field(default_factory=list)
    records: dict[str, tuple[str, str]] = field(default_factory=dict)
    normalized: dict[str, Mapping[str, object]] = field(default_factory=dict)
    routes: dict[str, str] = field(default_factory=dict)
    dedupe_results: dict[str, str] = field(default_factory=dict)
    dispositions: dict[str, str] = field(default_factory=dict)
    written: set[str] = field(default_factory=set)
    write_verified: set[str] = field(default_factory=set)
    pending_persisted: set[str] = field(default_factory=set)
    records_sealed: bool = False
    schema_drift: bool = False
    audit_done: bool = False
    proposal_done: bool = False
    mapping_confirmed: bool = False
    notification_done: bool = False
    cursor_advanced: bool = False
    finalize_attempts: int = 0
    premature_finalize_attempted: bool = False

    def register_source_records(
        self, records: Sequence[Mapping[str, object]]
    ) -> None:
        """Register the complete scanned set before per-record processing."""
        if self.records or self.records_sealed:
            raise RuntimeError("source records are already registered")
        for payload in records:
            key, source_id, source_record_id = _identity(payload)
            if key in self.records:
                raise ValueError(f"duplicate source record: {key}")
            self.records[key] = (source_id, source_record_id)
        self.records_sealed = True
        self.events.append("source.records:" + ",".join(self.records))

    def record_normalize(self, payload: Mapping[str, object]) -> None:
        key = self._known_identity(payload)
        if key in self.normalized:
            raise ValueError(f"record already normalized: {key}")
        if not isinstance(payload.get("normalized_record"), Mapping):
            raise ValueError("record.normalize requires top-level normalized_record")
        normalized_record = payload["normalized_record"]
        self.normalized[key] = dict(normalized_record)
        self.events.append(f"record.normalize:{key}")

    def candidate_route(self, payload: Mapping[str, object]) -> None:
        key = self._known_identity(payload)
        route = _text(payload, "route")
        if route not in ROUTES:
            raise ValueError(f"unsupported route: {route}")
        if key not in self.normalized:
            raise RuntimeError("candidate.route requires record.normalize")
        if key in self.routes:
            raise ValueError(f"record already routed: {key}")
        normalized = self.normalized[key]
        has_link = bool(normalized.get("source_url") or normalized.get("official_url"))
        if route == "auto_write" and not has_link:
            raise RuntimeError("a record with two missing links cannot be auto_write")
        self.routes[key] = route
        if route == "hard_filtered":
            self.dispositions[key] = "hard_filtered"
        self.events.append(f"candidate.route:{key}:{route}")

    def candidate_dedupe(self, payload: Mapping[str, object]) -> None:
        key = self._known_identity(payload, require_route=True)
        result = _text(payload, "dedupe_result")
        if result not in DEDUP_RESULTS:
            raise ValueError(f"unsupported dedupe_result: {result}")
        self._require_every_record_routed()
        if self.routes[key] == "hard_filtered":
            raise RuntimeError("hard_filtered records do not enter candidate.dedupe")
        if key in self.dedupe_results:
            raise ValueError(f"record already deduped: {key}")
        self.dedupe_results[key] = result
        if result == "duplicate":
            self.dispositions[key] = "duplicate"
        self.events.append(f"candidate.dedupe:{key}:{result}")

    def pending_create(self, payload: Mapping[str, object]) -> None:
        keys, items = self._batch(payload)
        self._require_every_applicable_record_deduped()
        expected = {
            key
            for key, route in self.routes.items()
            if key not in self.dispositions
            and (
                route == "awaiting_write_confirmation"
                or self.dedupe_results.get(key) == "needs_confirmation"
            )
        }
        if set(keys) != expected:
            raise RuntimeError("pending.create stable_keys must equal the full pending set")
        for key, item in zip(keys, items):
            if _text(item, "route") != self.routes[key]:
                raise ValueError(f"route does not match candidate.route: {key}")
            if key in self.pending_persisted:
                raise RuntimeError(f"pending record already persisted: {key}")
        self.pending_persisted.update(keys)
        self.dispositions.update(
            (key, "awaiting_write_confirmation_persisted") for key in keys
        )
        self.events.append("pending.create:" + ",".join(keys))

    def target_write(self, payload: Mapping[str, object]) -> None:
        keys, items = self._batch(payload)
        self._require_every_applicable_record_deduped()
        if self.schema_drift and not self.mapping_confirmed:
            raise RuntimeError(
                "target.write requires target.audit, mapping.propose, and user confirmation"
            )
        for key, item in zip(keys, items):
            route = _text(item, "route")
            if route != "auto_write" or self.routes.get(key) != route:
                raise RuntimeError(f"target.write received a non-auto_write record: {key}")
            if self.dedupe_results.get(key) != "unique":
                raise RuntimeError(f"target.write requires unique candidate.dedupe: {key}")
            if key in self.written:
                raise RuntimeError(f"record already written: {key}")
        self.written.update(keys)
        self.events.append("target.write:" + ",".join(keys))

    def target_verify(self, payload: Mapping[str, object]) -> None:
        keys, items = self._batch(payload)
        for key, item in zip(keys, items):
            if _text(item, "route") != "auto_write":
                raise RuntimeError(f"target.verify received a non-auto_write record: {key}")
            if key not in self.written:
                raise RuntimeError("target.verify requires a successful target.write")
            if key in self.write_verified:
                raise RuntimeError(f"record already verified: {key}")
        self.write_verified.update(keys)
        self.dispositions.update((key, "auto_write_verified") for key in keys)
        self.events.append("target.verify:" + ",".join(keys))

    def detect_schema_drift(self) -> None:
        if self.written:
            raise RuntimeError("schema drift must be detected before target.write")
        self.schema_drift = True
        self.events.append("schema.drift")

    def target_audit(self) -> None:
        if not self.schema_drift or self.written:
            raise RuntimeError("target.audit is only valid before any target.write")
        self.audit_done = True
        self.events.append("target.audit")

    def mapping_propose(self) -> None:
        if not self.audit_done or self.written:
            raise RuntimeError("mapping.propose requires target.audit before any write")
        self.proposal_done = True
        self.events.append("mapping.propose")

    def confirm_mapping(self) -> None:
        if not self.proposal_done:
            raise RuntimeError("mapping confirmation requires mapping.propose")
        self.mapping_confirmed = True
        self.events.append("user.mapping_confirmed")

    def notification_succeeded(self) -> None:
        self._require_all_disposed()
        self.notification_done = True
        self.events.append("notification.success")

    def advance_cursor(self) -> None:
        self._require_all_disposed()
        if not self.notification_done or self.pending_persisted:
            raise RuntimeError("cursor cannot advance before terminal notification")
        self.cursor_advanced = True
        self.events.append("cursor.advance")

    def confirmed_summary(self) -> dict[str, int]:
        """Return counts only from tool-confirmed dispositions."""
        return {
            "written": len(self.write_verified),
            "pending": len(self.pending_persisted),
            "hard_filtered": sum(
                value == "hard_filtered" for value in self.dispositions.values()
            ),
            "duplicate": sum(
                value == "duplicate" for value in self.dispositions.values()
            ),
        }

    def evaluation_finalize(
        self,
        status: str = "completed",
        *,
        summary: Mapping[str, int] | None = None,
    ) -> None:
        self.finalize_attempts += 1
        self.events.append(f"evaluation.finalize.attempt:{self.finalize_attempts}")
        if self.premature_finalize_attempted:
            raise RuntimeError("run is invalid after an incomplete first finalize")
        try:
            self._evaluation_finalize(status=status, summary=summary)
        except Exception:
            if self.finalize_attempts == 1:
                self.premature_finalize_attempted = True
            raise

    def _evaluation_finalize(
        self,
        *,
        status: str,
        summary: Mapping[str, int] | None,
    ) -> None:
        if self.schema_drift and not self.mapping_confirmed:
            if not self.audit_done or not self.proposal_done:
                raise RuntimeError(
                    "evaluation.finalize requires target.audit and mapping.propose"
                )
            if status != "awaiting_user_confirmation":
                raise RuntimeError(
                    "schema remediation may only finalize as awaiting_user_confirmation"
                )
            if self.written or self.notification_done or self.cursor_advanced:
                raise RuntimeError("schema remediation pause cannot contain success actions")
            self.events.append("evaluation.finalize:awaiting_user_confirmation")
            return
        if status != "completed":
            raise ValueError(f"unsupported final status: {status}")
        self._require_all_disposed()
        if not self.notification_done:
            raise RuntimeError("evaluation.finalize requires notification completion")
        if not self.pending_persisted and not self.cursor_advanced:
            raise RuntimeError("evaluation.finalize requires cursor completion")
        confirmed = self.confirmed_summary()
        if summary is not None and dict(summary) != confirmed:
            raise RuntimeError("completion summary contradicts tool-confirmed state")
        self.events.append("evaluation.finalize:completed")

    def _known_identity(
        self,
        payload: Mapping[str, object],
        *,
        require_route: bool = False,
    ) -> str:
        key, source_id, source_record_id = _identity(payload)
        if self.records.get(key) != (source_id, source_record_id):
            raise ValueError(f"unknown source record: {key}")
        if require_route:
            route = _text(payload, "route")
            if self.routes.get(key) != route:
                raise ValueError(f"route does not match candidate.route: {key}")
        return key

    def _batch(
        self, payload: Mapping[str, object]
    ) -> tuple[tuple[str, ...], tuple[Mapping[str, object], ...]]:
        raw_keys = payload.get("stable_keys")
        if not isinstance(raw_keys, Sequence) or isinstance(raw_keys, (str, bytes)):
            raise ValueError("batch tool call requires top-level stable_keys")
        keys = _stable_keys(raw_keys)
        raw_records = payload.get("records")
        if not isinstance(raw_records, Sequence) or isinstance(raw_records, (str, bytes)):
            raise ValueError("batch tool call requires top-level records")
        if len(raw_records) != len(keys) or any(
            not isinstance(item, Mapping) for item in raw_records
        ):
            raise ValueError("batch records must match stable_keys one-for-one")
        items = tuple(raw_records)
        item_keys = tuple(self._known_identity(item, require_route=True) for item in items)
        if item_keys != keys:
            raise ValueError("batch records must follow stable_keys in the same order")
        return keys, items

    def _require_every_record_routed(self) -> None:
        if not self.records_sealed or set(self.normalized) != set(self.records):
            raise RuntimeError("every source record must complete record.normalize first")
        if set(self.routes) != set(self.records):
            raise RuntimeError("every source record must complete candidate.route first")

    def _require_every_applicable_record_deduped(self) -> None:
        self._require_every_record_routed()
        expected = {
            key for key, route in self.routes.items() if route != "hard_filtered"
        }
        if set(self.dedupe_results) != expected:
            raise RuntimeError("every applicable record must complete candidate.dedupe first")

    def _require_all_disposed(self) -> None:
        self._require_every_applicable_record_deduped()
        missing = set(self.records) - set(self.dispositions)
        if missing:
            raise RuntimeError(
                "records lack independent dispositions: "
                + ", ".join(sorted(missing))
            )
