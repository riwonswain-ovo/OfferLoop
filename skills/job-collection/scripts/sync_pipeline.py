#!/usr/bin/env python3
"""Deterministic state, output, and recovery rules for job collection syncs."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
import hashlib
import json
import re
import time
from typing import Callable, Iterable, Mapping, Protocol, Sequence, TypeVar
from urllib.parse import quote, urlparse, urlunparse

try:
    from .sync_utils import CandidateRouteInputs, route_candidate
except ImportError:  # Direct execution from the Skill root.
    from sync_utils import CandidateRouteInputs, route_candidate


STATUS_COMPLETE = "招聘信息同步完成"
STATUS_PENDING = "招聘信息待确认写入"
STATUS_PARTIAL = "招聘信息部分完成"
STATUS_FAILED = "招聘信息同步失败"
PENDING_BATCH_SCHEMA_VERSION = 2

PERSISTED_CANDIDATE_FIELDS = (
    "source_updated_at",
    "company_name",
    "recruitment_batch",
    "project_name",
    "job_positions",
    "source_url",
    "official_url",
    "application_deadline",
    "location",
    "industry_module",
    "enterprise_type",
)


def _safe_single_line(value: object, *, max_chars: int = 240) -> str:
    text = " ".join(str(value or "").split()).replace("｜", "/")
    text = text.replace("`", "'").replace("<", "‹").replace(">", "›")
    if len(text) <= max_chars:
        return text
    return text[: max(1, max_chars - 1)].rstrip() + "…"


def _safe_markdown_url(value: object) -> str:
    text = str(value or "").strip()
    if not text or any(character.isspace() for character in text):
        return ""
    try:
        parsed = urlparse(text)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        return ""
    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
    ):
        return ""
    try:
        safe_host = hostname.encode("idna").decode("ascii").lower()
    except UnicodeError:
        return ""
    if not re.fullmatch(r"[a-z0-9.-]+", safe_host):
        return ""
    netloc = safe_host + (f":{port}" if port is not None else "")
    return urlunparse(
        (
            parsed.scheme.lower(),
            netloc,
            quote(parsed.path, safe="/%:@-._~!$&'*+,;="),
            parsed.params,
            quote(parsed.query, safe="=&?/:@-._~!$'*,;+%"),
            quote(parsed.fragment, safe="/?@-._~!$&'*+,;=:%"),
        )
    )


@dataclass(frozen=True)
class NotificationPart:
    stage: str
    part: int
    idempotency_key: str
    message: str


@dataclass
class NotificationStageState:
    payload_hashes: list[str]
    succeeded_parts: list[int] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.payload_hashes or any(
            not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value)
            for value in self.payload_hashes
        ):
            raise ValueError("notification payload hashes are invalid")
        if any(
            not isinstance(value, int) or isinstance(value, bool) or value < 1
            for value in self.succeeded_parts
        ):
            raise ValueError("notification succeeded parts must be positive integers")
        if len(self.succeeded_parts) != len(set(self.succeeded_parts)):
            raise ValueError("notification succeeded parts must be unique")
        if any(value > len(self.payload_hashes) for value in self.succeeded_parts):
            raise ValueError("notification succeeded part is outside the payload")

    @property
    def complete(self) -> bool:
        return set(self.succeeded_parts) == set(range(1, len(self.payload_hashes) + 1))


@dataclass
class NotificationState:
    run_id: str
    stages: dict[str, NotificationStageState] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if (
            not isinstance(self.run_id, str)
            or not re.fullmatch(r"[A-Za-z0-9._-]{1,128}", self.run_id)
        ):
            raise ValueError("notification state is missing run_id")
        if not isinstance(self.stages, dict):
            raise ValueError("notification stages must be an object")
        if any(not re.fullmatch(r"[a-z0-9-]+", stage) for stage in self.stages):
            raise ValueError("notification stage names are invalid")

    def prepare(self, stage: str, messages: Sequence[str]) -> tuple[NotificationPart, ...]:
        if not re.fullmatch(r"[a-z0-9-]+", stage):
            raise ValueError("notification stage name is invalid")
        if not messages:
            raise ValueError("notification messages are empty")
        hashes = [
            hashlib.sha256(message.encode("utf-8")).hexdigest()
            for message in messages
        ]
        existing = self.stages.get(stage)
        if existing is None:
            existing = NotificationStageState(payload_hashes=hashes)
            self.stages[stage] = existing
        elif existing.payload_hashes != hashes:
            raise ValueError("notification payload changed for an existing stage")
        succeeded = set(existing.succeeded_parts)
        return tuple(
            NotificationPart(
                stage=stage,
                part=index,
                idempotency_key=(
                    f"offerloop-job-collection-{self.run_id}-{stage}-{index}"
                ),
                message=message,
            )
            for index, message in enumerate(messages, start=1)
            if index not in succeeded
        )

    def mark_succeeded(self, stage: str, part: int) -> None:
        state = self.stages.get(stage)
        if state is None or not isinstance(part, int) or isinstance(part, bool):
            raise ValueError("notification part was not prepared")
        if part < 1 or part > len(state.payload_hashes):
            raise ValueError("notification part is outside the payload")
        if part not in state.succeeded_parts:
            state.succeeded_parts.append(part)
            state.succeeded_parts.sort()

    def stage_complete(self, stage: str) -> bool:
        state = self.stages.get(stage)
        return bool(state and state.complete)

    def to_dict(self) -> dict[str, object]:
        return {
            "run_id": self.run_id,
            "stages": {
                name: {
                    "payload_hashes": state.payload_hashes,
                    "succeeded_parts": state.succeeded_parts,
                }
                for name, state in sorted(self.stages.items())
            },
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, sort_keys=True)

    @classmethod
    def from_dict(cls, payload: object) -> "NotificationState":
        if not isinstance(payload, Mapping):
            raise ValueError("notification state must be an object")
        raw_stages = payload.get("stages")
        if not isinstance(raw_stages, Mapping):
            raise ValueError("notification stages must be an object")
        stages: dict[str, NotificationStageState] = {}
        for name, raw_state in raw_stages.items():
            if not isinstance(name, str) or not isinstance(raw_state, Mapping):
                raise ValueError("notification stage is invalid")
            hashes = raw_state.get("payload_hashes")
            parts = raw_state.get("succeeded_parts", [])
            if not isinstance(hashes, list) or not isinstance(parts, list):
                raise ValueError("notification stage state is invalid")
            stages[name] = NotificationStageState(hashes, parts)
        return cls(run_id=payload.get("run_id"), stages=stages)

    @classmethod
    def from_json(cls, value: str) -> "NotificationState":
        return cls.from_dict(json.loads(value))

    @classmethod
    def merge(cls, states: Sequence["NotificationState"]) -> "NotificationState":
        """Merge source-row copies while preserving every confirmed delivery."""
        if not states:
            raise ValueError("notification states are empty")
        run_ids = {state.run_id for state in states}
        if len(run_ids) != 1:
            raise ValueError("notification states belong to different runs")
        stage_names = {tuple(sorted(state.stages)) for state in states}
        if len(stage_names) != 1:
            raise ValueError("notification states disagree on prepared stages")

        merged_stages: dict[str, NotificationStageState] = {}
        for stage in sorted(states[0].stages):
            stage_states = [state.stages[stage] for state in states]
            hashes = {tuple(item.payload_hashes) for item in stage_states}
            if len(hashes) != 1:
                raise ValueError("notification states disagree on stage payload")
            merged_stages[stage] = NotificationStageState(
                payload_hashes=list(stage_states[0].payload_hashes),
                succeeded_parts=sorted(
                    {
                        part
                        for item in stage_states
                        for part in item.succeeded_parts
                    }
                ),
            )
        return cls(run_id=states[0].run_id, stages=merged_stages)


@dataclass(frozen=True)
class Failure:
    source: str
    reason: str
    state: str


@dataclass(frozen=True)
class PendingCandidate:
    number: int
    company: str
    role: str = ""
    reason: str = ""
    announcement_url: str = ""
    application_url: str = ""
    source_record_id: str = ""
    source_record_exists: bool = True
    source_id: str = ""
    normalized_snapshot: Mapping[str, object] = field(default_factory=dict)

    def line(self) -> str:
        company = _safe_single_line(self.company) or "公司未明确"
        role = _safe_single_line(self.role) or "岗位未明确"
        reason = _safe_single_line(self.reason) or "岗位偏好不明确"
        announcement_url = _safe_markdown_url(self.announcement_url)
        application_url = _safe_markdown_url(self.application_url)
        announcement = (
            f"[公告]({announcement_url})" if announcement_url else "公告缺失"
        )
        application = (
            f"[投递]({application_url})" if application_url else "投递缺失"
        )
        return (
            f"{self.number:02d}｜{company}｜{role}｜{reason}｜"
            f"{announcement}｜{application}"
        )


@dataclass
class SyncSummary:
    written: int = 0
    pending: int = 0
    failed: int = 0
    completed_sources: int = 0
    failures: list[Failure] = field(default_factory=list)
    notification_error: str = ""

    @property
    def title(self) -> str:
        if self.pending > 0:
            return STATUS_PENDING
        if self.failed > 0 and (self.completed_sources > 0 or self.written > 0):
            return STATUS_PARTIAL
        if self.failed > 0:
            return STATUS_FAILED
        return STATUS_COMPLETE


@dataclass
class CursorState:
    committed_cursor: str | None
    recovery_checkpoint: str | None = None

    def checkpoint(self, value: str) -> None:
        self.recovery_checkpoint = value

    def commit(self, value: str, *, fully_processed: bool) -> None:
        if not fully_processed:
            raise ValueError("cannot commit cursor before the source is fully processed")
        self.committed_cursor = value
        self.recovery_checkpoint = None

    def fail(self) -> None:
        """Keep both the committed cursor and the latest recovery checkpoint."""


def render_agent_summary(summary: SyncSummary) -> str:
    lines = [
        summary.title,
        "",
        f"已写入 {summary.written} 条｜待确认写入 {summary.pending} 条｜失败来源 {summary.failed} 个",
    ]
    for failure in summary.failures:
        lines.extend(
            [
                "",
                "失败来源："
                f"{_safe_single_line(failure.source)}｜"
                f"{_safe_single_line(failure.reason)}｜"
                f"{_safe_single_line(failure.state)}",
            ]
        )
    if summary.pending:
        lines.extend(
            ["", "请查看飞书群中的待确认写入清单，并在这里回复要写入或跳过的编号。"]
        )
    if summary.notification_error:
        lines.extend(["", f"飞书群通知发送失败：{summary.notification_error}"])
    return "\n".join(lines)


def _failure_lines(failures: Sequence[Failure]) -> list[str]:
    return [
        "失败来源："
        f"{_safe_single_line(item.source)}｜"
        f"{_safe_single_line(item.reason)}｜"
        f"{_safe_single_line(item.state)}"
        for item in failures
    ]


def _render_bounded_lines(lines: Sequence[str], max_chars: int) -> list[str]:
    if max_chars < 200:
        raise ValueError("max_chars must be at least 200")
    messages: list[str] = []
    current: list[str] = []
    for line in lines:
        chunks = [
            line[index : index + max_chars]
            for index in range(0, len(line), max_chars)
        ]
        if not chunks:
            chunks = [""]
        for chunk in chunks:
            candidate = "\n".join([*current, chunk])
            if current and len(candidate) > max_chars:
                messages.append("\n".join(current))
                current = [chunk]
            else:
                current.append(chunk)
    if current:
        messages.append("\n".join(current))
    if any(len(message) > max_chars for message in messages):
        raise AssertionError("rendered Feishu message exceeds max_chars")
    return messages or [""]


def _split_candidate_lines(
    lines: Sequence[str],
    max_chars: int,
    *,
    overhead_for_page: Callable[[int], int],
) -> list[list[str]]:
    if max_chars < 200:
        raise ValueError("max_chars must be at least 200")
    pages: list[list[str]] = []
    current: list[str] = []
    page_index = 1
    for line in lines:
        available = max_chars - overhead_for_page(page_index)
        if available < 1:
            raise ValueError("message framing exceeds max_chars")
        safe_line = line
        if len(safe_line) + 1 > available:
            safe_line = safe_line[: max(1, available - 2)].rstrip() + "…"
        candidate = [*current, safe_line]
        candidate_size = sum(len(value) + 1 for value in candidate)
        if current and candidate_size > available:
            pages.append(current)
            current = []
            page_index += 1
            available = max_chars - overhead_for_page(page_index)
            if available < 1:
                raise ValueError("message framing exceeds max_chars")
            if len(line) + 1 > available:
                safe_line = line[: max(1, available - 2)].rstrip() + "…"
            else:
                safe_line = line
        current.append(safe_line)
    if current:
        pages.append(current)
    return pages or [[]]


def render_feishu_sync_messages(
    summary: SyncSummary,
    *,
    batch_at: datetime | None = None,
    candidates: Sequence[PendingCandidate] = (),
    max_message_chars: int = 1800,
) -> list[str]:
    if summary.pending != len(candidates):
        raise ValueError("summary.pending must equal the candidate count")

    base = [
        summary.title,
        "",
        f"已写入 {summary.written} 条｜待确认写入 {summary.pending} 条｜失败来源 {summary.failed} 个",
    ]
    failures = _failure_lines(summary.failures)
    if not candidates:
        return _render_bounded_lines(
            base + ([""] + failures if failures else []),
            max_message_chars,
        )
    if batch_at is None:
        raise ValueError("batch_at is required when candidates are pending")

    batch = batch_at.strftime("%Y-%m-%d %H:%M")
    candidate_lines = [item.line() for item in candidates]
    total_hint = max(1, len(candidate_lines))

    def overhead(page_index: int) -> int:
        header = base if page_index == 1 else [summary.title]
        body = header + [
            "",
            f"创建时间：{batch}",
            "",
            f"待确认写入 {page_index}/{total_hint}",
        ]
        body.extend(["", "请回到 Agent 对话，回复“全部写入”“全部跳过”或指定编号。"])
        return len("\n".join(body)) + 1

    pages = _split_candidate_lines(
        candidate_lines,
        max_message_chars,
        overhead_for_page=overhead,
    )
    messages: list[str] = []
    for index, page in enumerate(pages, start=1):
        header = base if index == 1 else [summary.title]
        body = header + ["", f"创建时间：{batch}", "", f"待确认写入 {index}/{len(pages)}"]
        body.extend(page)
        if index == len(pages):
            body.extend(
                ["", "请回到 Agent 对话，回复“全部写入”“全部跳过”或指定编号。"]
            )
        messages.append("\n".join(body))
    if failures:
        messages = _render_bounded_lines(
            base + ["", *failures],
            max_message_chars,
        ) + messages
    if any(len(message) > max_message_chars for message in messages):
        raise AssertionError("rendered Feishu message exceeds max_message_chars")
    return messages


def render_pending_update(
    *,
    batch_at: datetime,
    written_numbers: Sequence[int],
    skipped_numbers: Sequence[int],
    remaining: Sequence[PendingCandidate],
    max_message_chars: int = 1800,
) -> list[str]:
    batch = batch_at.strftime("%Y-%m-%d %H:%M")
    def number_summary(values: Sequence[int]) -> str:
        rendered = "、".join(f"{value:02d}" for value in values) or "无"
        if len(rendered) <= 60:
            return rendered
        prefix = "、".join(f"{value:02d}" for value in values[:10])
        return f"{prefix}等 {len(values)} 条"

    written = number_summary(written_numbers)
    skipped = number_summary(skipped_numbers)
    if not remaining:
        return [
            "\n".join(
                [
                    "待确认写入已完成",
                    "",
                    f"创建时间：{batch}",
                    f"已写入 {len(written_numbers)} 条｜已跳过 {len(skipped_numbers)} 条",
                ]
            )
        ]

    candidate_lines = [item.line() for item in remaining]
    total_hint = max(1, len(candidate_lines))

    def overhead(page_index: int) -> int:
        lines = [
            "待确认写入更新",
            "",
            f"创建时间：{batch}",
            "",
            f"待确认写入 {page_index}/{total_hint}",
        ]
        if page_index == 1:
            lines.insert(
                3,
                f"已写入：{written}｜已跳过：{skipped}｜剩余 {len(remaining)} 条",
            )
        return len("\n".join(lines)) + 1

    pages = _split_candidate_lines(
        candidate_lines,
        max_message_chars,
        overhead_for_page=overhead,
    )
    messages = []
    for index, page in enumerate(pages, start=1):
        lines = ["待确认写入更新", "", f"创建时间：{batch}"]
        if index == 1:
            lines.append(
                f"已写入：{written}｜已跳过：{skipped}｜剩余 {len(remaining)} 条"
            )
        lines.extend(["", f"待确认写入 {index}/{len(pages)}", *page])
        messages.append("\n".join(lines))
    if any(len(message) > max_message_chars for message in messages):
        raise AssertionError("rendered Feishu message exceeds max_message_chars")
    return messages


@dataclass(frozen=True)
class PendingSourceCheckpoint:
    """Cursor material required to finish one source after confirmation."""

    source_id: str
    high_water: str
    recovery_checkpoint: str = ""

    def __post_init__(self) -> None:
        if not isinstance(self.source_id, str) or not self.source_id.strip():
            raise ValueError("pending source is missing source_id")
        if not isinstance(self.high_water, str) or not self.high_water.strip():
            raise ValueError("pending source is missing high_water")
        if not isinstance(self.recovery_checkpoint, str):
            raise ValueError("pending source recovery_checkpoint must be text")


def _strict_positive_int_list(
    payload: Mapping[str, object],
    key: str,
) -> list[int]:
    raw = payload.get(key, [])
    if not isinstance(raw, list):
        raise ValueError(f"{key} must be a list")
    if any(
        not isinstance(value, int) or isinstance(value, bool) or value < 1
        for value in raw
    ):
        raise ValueError(f"{key} must contain positive integers")
    return list(raw)


def _strict_text_list(payload: Mapping[str, object], key: str) -> list[str]:
    raw = payload.get(key, [])
    if not isinstance(raw, list):
        raise ValueError(f"{key} must be a list")
    if any(not isinstance(value, str) or not value.strip() for value in raw):
        raise ValueError(f"{key} must contain non-empty text values")
    return list(raw)


@dataclass
class PendingBatchState:
    """Persisted source-of-truth state stored in 信息源登记."""

    batch_id: str
    candidates: list[PendingCandidate]
    sources: list[PendingSourceCheckpoint] = field(default_factory=list)
    written_numbers: list[int] = field(default_factory=list)
    skipped_numbers: list[int] = field(default_factory=list)
    completion_notification_succeeded: bool = False
    committed_source_ids: list[str] = field(default_factory=list)
    notification_state: NotificationState | None = None

    def __post_init__(self) -> None:
        if not isinstance(self.batch_id, str) or not self.batch_id.strip():
            raise ValueError("pending batch is missing batch_id")
        if self.notification_state is None:
            self.notification_state = NotificationState(run_id=self.batch_id)
        if not isinstance(self.notification_state, NotificationState):
            raise ValueError("pending batch notification state is invalid")
        if not isinstance(self.completion_notification_succeeded, bool):
            raise ValueError("completion notification state must be boolean")
        candidate_numbers = [item.number for item in self.candidates]
        candidate_set = set(candidate_numbers)
        if any(
            not isinstance(number, int) or isinstance(number, bool) or number < 1
            for number in candidate_numbers
        ):
            raise ValueError("pending candidate numbers must be positive")
        if len(candidate_numbers) != len(candidate_set):
            raise ValueError("pending candidate numbers must be unique")
        source_ids = [item.source_id for item in self.sources]
        source_set = set(source_ids)
        if len(source_ids) != len(source_set):
            raise ValueError("pending source IDs must be unique")
        for candidate in self.candidates:
            if (
                not isinstance(candidate.source_id, str)
                or not candidate.source_id
                or candidate.source_id not in source_set
            ):
                raise ValueError(
                    f"pending candidate {candidate.number:02d} has no registered source"
                )
            if (
                not isinstance(candidate.source_record_id, str)
                or not candidate.source_record_id.strip()
            ):
                raise ValueError(
                    f"pending candidate {candidate.number:02d} is missing source_record_id"
                )
            if not isinstance(candidate.source_record_exists, bool):
                raise ValueError(
                    f"pending candidate {candidate.number:02d} existence must be boolean"
                )
            if not isinstance(candidate.normalized_snapshot, Mapping):
                raise ValueError(
                    f"pending candidate {candidate.number:02d} snapshot must be an object"
                )
            missing_fields = [
                key
                for key in PERSISTED_CANDIDATE_FIELDS
                if key not in candidate.normalized_snapshot
            ]
            if missing_fields:
                raise ValueError(
                    f"pending candidate {candidate.number:02d} snapshot is missing: "
                    + ", ".join(missing_fields)
                )
            try:
                json.dumps(candidate.normalized_snapshot, ensure_ascii=False)
            except (TypeError, ValueError) as error:
                raise ValueError(
                    f"pending candidate {candidate.number:02d} snapshot is not JSON-safe"
                ) from error
        if source_set != {item.source_id for item in self.candidates}:
            raise ValueError("each pending source must own at least one candidate")
        written = set(self.written_numbers)
        skipped = set(self.skipped_numbers)
        if any(
            not isinstance(number, int) or isinstance(number, bool) or number < 1
            for number in (*self.written_numbers, *self.skipped_numbers)
        ):
            raise ValueError("resolved candidate numbers must be positive integers")
        if len(written) != len(self.written_numbers):
            raise ValueError("written candidate numbers must be unique")
        if len(skipped) != len(self.skipped_numbers):
            raise ValueError("skipped candidate numbers must be unique")
        if written & skipped:
            raise ValueError("a candidate cannot be both written and skipped")
        unresolved = candidate_set - written - skipped
        auto_skipped = sorted(
            item.number
            for item in self.candidates
            if item.number in unresolved
            and not str(item.announcement_url).strip()
            and not str(item.application_url).strip()
        )
        if auto_skipped:
            self.skipped_numbers.extend(auto_skipped)
            skipped.update(auto_skipped)
        unknown = (written | skipped) - candidate_set
        if unknown:
            values = "、".join(f"{number:02d}" for number in sorted(unknown))
            raise ValueError(f"resolved candidate numbers are missing: {values}")
        committed = set(self.committed_source_ids)
        if any(
            not isinstance(source_id, str) or not source_id.strip()
            for source_id in self.committed_source_ids
        ):
            raise ValueError("committed source IDs must be non-empty text")
        if len(committed) != len(self.committed_source_ids):
            raise ValueError("committed source IDs must be unique")
        if committed - source_set:
            raise ValueError("committed source is missing from pending source state")
        if self.completion_notification_succeeded and self.remaining:
            raise ValueError(
                "completion notification cannot succeed while candidates remain"
            )
        if (
            self.completion_notification_succeeded
            and not self.notification_state.stage_complete("completion")
        ):
            raise ValueError("completion notification state has no successful delivery")
        if committed and (
            self.remaining or not self.completion_notification_succeeded
        ):
            raise ValueError(
                "source cursor cannot be committed before resolution and notification"
            )

    @property
    def remaining(self) -> list[PendingCandidate]:
        resolved = set(self.written_numbers) | set(self.skipped_numbers)
        return [item for item in self.candidates if item.number not in resolved]

    @property
    def committable_sources(self) -> tuple[PendingSourceCheckpoint, ...]:
        if self.remaining or not self.completion_notification_succeeded:
            return ()
        committed = set(self.committed_source_ids)
        return tuple(item for item in self.sources if item.source_id not in committed)

    @property
    def clearable(self) -> bool:
        return (
            not self.remaining
            and self.completion_notification_succeeded
            and len(self.committed_source_ids) == len(self.sources)
        )

    @property
    def status(self) -> str:
        if self.clearable:
            return "ready_to_clear"
        if self.remaining:
            return "open"
        if not self.completion_notification_succeeded:
            return "awaiting_completion_notification"
        return "awaiting_cursor_commit"

    def mark_write_verified(self, numbers: Sequence[int]) -> None:
        self._mark_resolved(numbers, target=self.written_numbers)

    def mark_skipped(self, numbers: Sequence[int]) -> None:
        self._mark_resolved(numbers, target=self.skipped_numbers)

    def _mark_resolved(self, numbers: Sequence[int], *, target: list[int]) -> None:
        if any(
            not isinstance(number, int) or isinstance(number, bool) or number < 1
            for number in numbers
        ):
            raise ValueError("candidate numbers must be positive integers")
        requested = set(numbers)
        remaining = {item.number for item in self.remaining}
        unknown = requested - remaining
        if unknown:
            values = "、".join(f"{number:02d}" for number in sorted(unknown))
            raise ValueError(f"candidate numbers are not pending: {values}")
        target.extend(sorted(requested))

    def mark_completion_notification_succeeded(self) -> None:
        if self.remaining:
            raise ValueError("cannot complete notification while candidates remain")
        if not self.notification_state.stage_complete("completion"):
            raise ValueError("completion notification parts are not all successful")
        self.completion_notification_succeeded = True

    def mark_source_committed(self, source_id: str) -> None:
        allowed = {item.source_id for item in self.committable_sources}
        if source_id not in allowed:
            raise ValueError(f"source cursor is not committable: {source_id}")
        self.committed_source_ids.append(source_id)

    def to_json(self) -> str:
        return json.dumps(
            {
                "schema_version": PENDING_BATCH_SCHEMA_VERSION,
                "batch_id": self.batch_id,
                "candidates": [
                    {
                        "number": item.number,
                        "company": item.company,
                        "role": item.role,
                        "reason": item.reason,
                        "announcement_url": item.announcement_url,
                        "application_url": item.application_url,
                        "source_record_id": item.source_record_id,
                        "source_record_exists": item.source_record_exists,
                        "source_id": item.source_id,
                        "normalized_snapshot": dict(item.normalized_snapshot),
                    }
                    for item in self.candidates
                ],
                "sources": [
                    {
                        "source_id": item.source_id,
                        "high_water": item.high_water,
                        "recovery_checkpoint": item.recovery_checkpoint,
                    }
                    for item in self.sources
                ],
                "written_numbers": sorted(set(self.written_numbers)),
                "skipped_numbers": sorted(set(self.skipped_numbers)),
                "completion_notification_succeeded": (
                    self.completion_notification_succeeded
                ),
                "committed_source_ids": sorted(set(self.committed_source_ids)),
                "notification_state": self.notification_state.to_dict(),
                "status": self.status,
            },
            ensure_ascii=False,
            sort_keys=True,
        )

    def to_source_json(self, source_id: str) -> str:
        """Serialize the fragment stored on one 信息源登记 record."""
        source = next(
            (item for item in self.sources if item.source_id == source_id),
            None,
        )
        if source is None:
            raise ValueError(f"pending source is missing: {source_id}")
        numbers = {
            item.number for item in self.candidates if item.source_id == source_id
        }
        fragment = PendingBatchState(
            batch_id=self.batch_id,
            candidates=[
                item for item in self.candidates if item.source_id == source_id
            ],
            sources=[source],
            written_numbers=[
                number for number in self.written_numbers if number in numbers
            ],
            skipped_numbers=[
                number for number in self.skipped_numbers if number in numbers
            ],
            completion_notification_succeeded=(
                self.completion_notification_succeeded
            ),
            committed_source_ids=(
                [source_id] if source_id in self.committed_source_ids else []
            ),
            notification_state=NotificationState.from_dict(
                self.notification_state.to_dict()
            ),
        )
        return fragment.to_json()

    @classmethod
    def from_json(cls, value: str) -> "PendingBatchState":
        payload = json.loads(value)
        if (
            not isinstance(payload, Mapping)
            or not isinstance(payload.get("batch_id"), str)
            or not str(payload.get("batch_id")).strip()
        ):
            raise ValueError("pending batch payload is missing batch_id")
        if payload.get("schema_version") != PENDING_BATCH_SCHEMA_VERSION:
            raise ValueError("pending batch schema version is unsupported")
        raw_candidates = payload.get("candidates")
        if not isinstance(raw_candidates, list):
            raise ValueError("pending batch payload is missing candidates")
        if any(not isinstance(item, Mapping) for item in raw_candidates):
            raise ValueError("pending candidates must be objects")
        candidates = [PendingCandidate(**item) for item in raw_candidates]
        raw_sources = payload.get("sources")
        if not isinstance(raw_sources, list):
            raise ValueError("pending batch payload is missing sources")
        sources = [PendingSourceCheckpoint(**item) for item in raw_sources]
        raw_notification = payload.get("completion_notification_succeeded", False)
        if not isinstance(raw_notification, bool):
            raise ValueError("completion notification state must be boolean")
        raw_committed = payload.get("committed_source_ids", [])
        if not isinstance(raw_committed, list):
            raise ValueError("committed_source_ids must be a list")
        written_numbers = _strict_positive_int_list(payload, "written_numbers")
        skipped_numbers = _strict_positive_int_list(payload, "skipped_numbers")
        committed_source_ids = _strict_text_list(payload, "committed_source_ids")
        notification_state = NotificationState.from_dict(
            payload.get("notification_state")
        )
        return cls(
            batch_id=payload["batch_id"],
            candidates=candidates,
            sources=sources,
            written_numbers=written_numbers,
            skipped_numbers=skipped_numbers,
            completion_notification_succeeded=raw_notification,
            committed_source_ids=committed_source_ids,
            notification_state=notification_state,
        )

    @classmethod
    def merge_source_json(cls, values: Sequence[str]) -> "PendingBatchState":
        """Merge source-row fragments into one batch and fail closed on drift."""
        fragments = [cls.from_json(value) for value in values]
        if not fragments:
            raise ValueError("pending source fragments are empty")
        if any(len(fragment.sources) != 1 for fragment in fragments):
            raise ValueError("each pending source fragment must contain one source")
        batch_ids = {fragment.batch_id for fragment in fragments}
        if len(batch_ids) != 1:
            raise ValueError("pending source fragments belong to different batches")
        source_ids = [fragment.sources[0].source_id for fragment in fragments]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("pending source fragments contain duplicate sources")

        notification_succeeded = all(
            fragment.completion_notification_succeeded
            for fragment in fragments
        )
        committed = [
            source_id
            for fragment in fragments
            for source_id in fragment.committed_source_ids
        ]
        if committed and not notification_succeeded:
            raise ValueError(
                "pending source fragments disagree on completion notification"
            )
        notification_state = NotificationState.merge(
            [fragment.notification_state for fragment in fragments]
        )
        return cls(
            batch_id=fragments[0].batch_id,
            candidates=[
                candidate
                for fragment in fragments
                for candidate in fragment.candidates
            ],
            sources=[fragment.sources[0] for fragment in fragments],
            written_numbers=[
                number
                for fragment in fragments
                for number in fragment.written_numbers
            ],
            skipped_numbers=[
                number
                for fragment in fragments
                for number in fragment.skipped_numbers
            ],
            completion_notification_succeeded=notification_succeeded,
            committed_source_ids=committed,
            notification_state=notification_state,
        )


@dataclass(frozen=True)
class ConfirmationDecision:
    write_numbers: tuple[int, ...] = ()
    skip_numbers: tuple[int, ...] = ()
    defer: bool = False
    error: str = ""


@dataclass(frozen=True)
class ConfirmationApplyResult:
    written_numbers: tuple[int, ...] = ()
    skipped_numbers: tuple[int, ...] = ()
    needs_source_reconfirmation: tuple[int, ...] = ()


_NUMBER_RE = re.compile(r"(?<!\d)(\d{1,6})(?!\d)")


def parse_confirmation_reply(
    reply: str,
    valid_numbers: Sequence[int],
) -> ConfirmationDecision:
    """Parse explicit write/skip/defer replies without guessing intent."""
    text = " ".join(reply.strip().split())
    valid = set(valid_numbers)
    if not text:
        return ConfirmationDecision(error="回复为空")
    if any(marker in text for marker in ("先别处理", "晚点再看", "稍后处理")):
        return ConfirmationDecision(defer=True)
    if any(marker in text for marker in ("全部写入", "全部留下", "全部保留")):
        return ConfirmationDecision(write_numbers=tuple(sorted(valid)))
    if any(marker in text for marker in ("全部跳过", "全部不要", "全部不写入")):
        return ConfirmationDecision(skip_numbers=tuple(sorted(valid)))

    numbers = {int(value) for value in _NUMBER_RE.findall(text)}
    invalid = numbers - valid
    if invalid:
        return ConfirmationDecision(
            error="不存在的编号：" + "、".join(f"{value:02d}" for value in sorted(invalid))
        )
    if not numbers:
        return ConfirmationDecision(error="没有识别到有效编号")

    write_markers = ("写入", "留下", "保留")
    skip_markers = ("跳过", "不要", "不写入")
    if text.startswith("除了") and any(marker in text for marker in write_markers):
        return ConfirmationDecision(write_numbers=tuple(sorted(valid - numbers)))

    writes: set[int] = set()
    skips: set[int] = set()
    for clause in re.split(r"[，,；;。\n]+", text):
        clause_numbers = {int(value) for value in _NUMBER_RE.findall(clause)}
        if any(marker in clause for marker in skip_markers):
            skips.update(clause_numbers)
        elif any(marker in clause for marker in write_markers):
            writes.update(clause_numbers)
    if writes & skips:
        return ConfirmationDecision(error="同一编号同时包含写入和跳过动作")
    if not writes and not skips:
        return ConfirmationDecision(error="没有识别到明确的写入或跳过动作")
    return ConfirmationDecision(
        write_numbers=tuple(sorted(writes)),
        skip_numbers=tuple(sorted(skips)),
    )


def plan_confirmation_decision(
    state: PendingBatchState,
    decision: ConfirmationDecision,
    *,
    current_source_record_exists: Mapping[int, bool] | None = None,
    reconfirmed_deleted_numbers: Sequence[int] = (),
) -> ConfirmationApplyResult:
    """Plan safe actions; callers mark writes only after write and readback succeed."""
    if decision.error:
        raise ValueError(decision.error)
    if decision.defer:
        return ConfirmationApplyResult()

    remaining = {item.number: item for item in state.remaining}
    requested = set(decision.write_numbers) | set(decision.skip_numbers)
    unknown = requested - set(remaining)
    if unknown:
        values = "、".join(f"{number:02d}" for number in sorted(unknown))
        raise ValueError(f"candidate numbers are not pending: {values}")
    if set(decision.write_numbers) & set(decision.skip_numbers):
        raise ValueError("a candidate cannot be both written and skipped")

    current_existence = current_source_record_exists or {}
    unchecked = set(decision.write_numbers) - set(current_existence)
    if unchecked:
        values = "、".join(f"{number:02d}" for number in sorted(unchecked))
        raise ValueError(f"source record existence was not checked: {values}")
    invalid_checks = [
        number
        for number in decision.write_numbers
        if not isinstance(current_existence[number], bool)
    ]
    if invalid_checks:
        values = "、".join(f"{number:02d}" for number in sorted(invalid_checks))
        raise ValueError(f"source record existence is not boolean: {values}")
    reconfirmed = set(reconfirmed_deleted_numbers)
    blocked = {
        number
        for number in decision.write_numbers
        if not current_existence[number] and number not in reconfirmed
    }
    writes = sorted(set(decision.write_numbers) - blocked)
    skips = sorted(set(decision.skip_numbers))
    return ConfirmationApplyResult(
        written_numbers=tuple(writes),
        skipped_numbers=tuple(skips),
        needs_source_reconfirmation=tuple(sorted(blocked)),
    )


T = TypeVar("T")


def retry_transient(
    operation: Callable[[], T],
    *,
    is_transient: Callable[[Exception], bool],
    max_retries: int = 3,
    sleep: Callable[[float], None] = time.sleep,
    delays: Sequence[float] = (1.0, 2.0, 4.0),
) -> T:
    """Run once, then retry transient failures up to ``max_retries`` times."""
    if max_retries < 0:
        raise ValueError("max_retries must not be negative")
    for attempt in range(max_retries + 1):
        try:
            return operation()
        except Exception as error:
            if not is_transient(error) or attempt == max_retries:
                raise
            sleep(delays[min(attempt, len(delays) - 1)])
    raise AssertionError("unreachable")


@dataclass(frozen=True)
class ScanBatch:
    records: Sequence[Mapping[str, object]]
    high_water: str


class PipelineAdapter(Protocol):
    source_id: str
    name: str
    cursor: CursorState

    def scan(self) -> ScanBatch: ...
    def normalize(self, record: Mapping[str, object]) -> Mapping[str, object] | None: ...
    def route_inputs(self, candidate: Mapping[str, object]) -> CandidateRouteInputs: ...
    def dedupe(self, candidate: Mapping[str, object]) -> str: ...
    def write(self, candidate: Mapping[str, object]) -> None: ...
    def verify(self) -> None: ...


@dataclass
class SourceResult:
    source_id: str
    source: str
    written: int = 0
    pending: list[Mapping[str, object]] = field(default_factory=list)
    duplicate: int = 0
    skipped_missing_company: int = 0
    high_water: str | None = None
    recovery_checkpoint: str = ""
    ready_to_commit: bool = False
    failure: Failure | None = None


def build_pending_batch_state(
    batch_id: str,
    results: Sequence[SourceResult],
) -> PendingBatchState | None:
    """Create stable cross-source numbering and persistence from pipeline results."""
    pending_results = [result for result in results if result.pending]
    if not pending_results:
        return None
    candidates: list[PendingCandidate] = []
    sources: list[PendingSourceCheckpoint] = []
    next_number = 1
    for result in pending_results:
        if not result.high_water:
            raise ValueError(f"pending source is missing high_water: {result.source_id}")
        sources.append(
            PendingSourceCheckpoint(
                source_id=result.source_id,
                high_water=result.high_water,
                recovery_checkpoint=result.recovery_checkpoint,
            )
        )
        for raw_candidate in result.pending:
            snapshot = {
                key: raw_candidate.get(key)
                for key in PERSISTED_CANDIDATE_FIELDS
            }
            record_id = str(
                raw_candidate.get("source_record_id")
                or raw_candidate.get("record_id")
                or ""
            ).strip()
            if not record_id:
                raise ValueError(
                    f"pending candidate has no source_record_id: {result.source_id}"
                )
            candidates.append(
                PendingCandidate(
                    number=next_number,
                    company=str(raw_candidate.get("company_name") or ""),
                    role=str(raw_candidate.get("job_positions") or ""),
                    reason=str(
                        raw_candidate.get("confirmation_reason")
                        or "岗位偏好不明确"
                    ),
                    announcement_url=str(raw_candidate.get("source_url") or ""),
                    application_url=str(raw_candidate.get("official_url") or ""),
                    source_record_id=record_id,
                    source_record_exists=True,
                    source_id=result.source_id,
                    normalized_snapshot=snapshot,
                )
            )
            next_number += 1
    return PendingBatchState(
        batch_id=batch_id,
        candidates=candidates,
        sources=sources,
        notification_state=NotificationState(run_id=batch_id),
    )


def run_source_pipeline(adapter: PipelineAdapter) -> SourceResult:
    """Run the fixed scan → normalize → route → dedupe → write → verify order."""
    result = SourceResult(source_id=adapter.source_id, source=adapter.name)
    try:
        batch = adapter.scan()
        normalized_candidates: list[Mapping[str, object]] = []
        routed_candidates: list[tuple[Mapping[str, object], str]] = []
        for record in batch.records:
            candidate = adapter.normalize(record)
            company = "" if candidate is None else str(
                candidate.get("company_name")
                or candidate.get("company")
                or candidate.get("公司")
                or ""
            ).strip()
            if not company:
                result.skipped_missing_company += 1
                continue
            normalized_candidates.append(candidate)

        for candidate in normalized_candidates:
            route = route_candidate(
                candidate=dict(candidate),
                inputs=adapter.route_inputs(candidate),
                has_announcement_link=bool(candidate.get("source_url")),
                has_application_link=bool(candidate.get("official_url")),
            )
            routed_candidates.append((candidate, route))

        writes = 0
        for candidate, route in routed_candidates:
            if route == "hard_filtered":
                continue
            duplicate = adapter.dedupe(candidate)
            if duplicate == "duplicate":
                result.duplicate += 1
                continue
            if duplicate != "duplicate" and duplicate != "unique":
                result.pending.append(candidate)
                continue
            if route == "awaiting_write_confirmation":
                result.pending.append(candidate)
                continue
            adapter.write(candidate)
            writes += 1
        if writes:
            adapter.verify()
            result.written = writes
        result.high_water = batch.high_water
        result.recovery_checkpoint = adapter.cursor.recovery_checkpoint or ""
        result.ready_to_commit = not result.pending
    except Exception as error:
        adapter.cursor.fail()
        result.failure = Failure(adapter.name, str(error), "等待修复")
    return result


def finalize_source_after_notification(
    adapter: PipelineAdapter,
    result: SourceResult,
    *,
    notification_succeeded: bool,
) -> None:
    """Commit a source only after all business work and notification succeed."""
    if result.failure is not None or not result.ready_to_commit:
        return
    if not notification_succeeded:
        adapter.cursor.fail()
        return
    if result.high_water is None:
        raise ValueError("ready source is missing high_water")
    adapter.cursor.commit(result.high_water, fully_processed=True)


def run_multi_source_pipeline(adapters: Iterable[PipelineAdapter]) -> list[SourceResult]:
    """Run every source independently so one failure never suppresses the rest."""
    return [run_source_pipeline(adapter) for adapter in adapters]


def summarize_source_results(results: Sequence[SourceResult]) -> SyncSummary:
    failures = [result.failure for result in results if result.failure is not None]
    return SyncSummary(
        written=sum(result.written for result in results),
        pending=sum(len(result.pending) for result in results),
        failed=len(failures),
        completed_sources=sum(
            result.failure is None and result.ready_to_commit for result in results
        ),
        failures=failures,
    )
