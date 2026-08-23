#!/usr/bin/env python3
"""Reusable, side-effect-free planning and paging for incremental job scans."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Callable, Iterable, Mapping, Sequence


UPDATED_FIELD = "更新时间"
TARGET_LOOKUP_FIELDS = (
    "投递链接",
    "公告链接",
    "公司",
    "招聘批次",
    "招聘项目",
    "子表 record_id",
    "投递进度",
    "信息更新时间",
    "企业性质",
)


class PaginationSafetyError(RuntimeError):
    """Raised when a remote page cannot be followed without risking data loss."""


class ServerFilterUnsupported(RuntimeError):
    """Raised by an adapter only for a confirmed unsupported filter response."""


@dataclass(frozen=True)
class RecordPage:
    rows: tuple[Mapping[str, object], ...]
    has_more: bool
    next_offset: int | None = None


@dataclass
class IncrementalScanStats:
    actual_pages: int = 0
    records_read: int = 0
    overlap_start: str = ""
    window_records: int = 0
    stop_reason: str = ""
    full_audit: bool = False
    server_filter: bool = True

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class TargetReadPlan:
    mode: str
    full_tables: tuple[str, ...]
    link_filters: tuple[dict[str, object], ...]
    company_keywords: tuple[str, ...]
    fields: tuple[str, ...] = TARGET_LOOKUP_FIELDS


FetchPage = Callable[[int, int, dict[str, object] | None, list[dict[str, object]]], RecordPage]


def resolve_offset(current: int, row_count: int, response_offset: int | None) -> int:
    """Resolve lark-cli's numeric offset dialect without hiding stalled cursors."""
    if row_count < 1:
        raise PaginationSafetyError("cannot advance offset from an empty page")
    if response_offset is None:
        # +record-list accepts a numeric request offset but some versions omit
        # it from the response. Advancing by the returned row count is the
        # deterministic continuation for that offset-based protocol.
        return current + row_count
    if response_offset <= current:
        raise PaginationSafetyError(
            f"Lark pagination did not advance: offset={current}, next={response_offset}"
        )
    return response_offset


def _timestamp_ms(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = int(value)
        return number if abs(number) >= 100_000_000_000 else number * 1000
    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip()
        if text.isdigit():
            return _timestamp_ms(int(text))
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


def build_overlap_filter(overlap_start: datetime, field: str = UPDATED_FIELD) -> dict[str, object]:
    """Build the lark-cli view-filter JSON for a calendar-day overlap."""
    exact_date = f"ExactDate({overlap_start.date().isoformat()})"
    return {
        "logic": "or",
        # Base datetime fields do not accept >=. Date equality covers the
        # complete boundary day; > covers all later dates.
        "conditions": [[field, "==", exact_date], [field, ">", exact_date]],
    }


def descending_sort(field: str = UPDATED_FIELD) -> list[dict[str, object]]:
    return [{"field": field, "desc": True}]


def scan_descending_window(
    fetch_page: FetchPage,
    *,
    overlap_start: datetime,
    updated_field: str = UPDATED_FIELD,
    page_size: int = 200,
    server_filter: bool = True,
    full_audit: bool = False,
) -> tuple[list[Mapping[str, object]], IncrementalScanStats]:
    """Read only the overlap window from a descending, offset-paginated source.

    The fallback path deliberately consumes the first page wholly below the
    boundary. This proves the boundary was crossed without dropping records
    equal to the boundary when one timestamp spans multiple pages.
    """
    if overlap_start.tzinfo is None:
        raise ValueError("overlap_start must be timezone-aware")
    if page_size < 1:
        raise ValueError("page_size must be positive")

    boundary_ms = int(overlap_start.timestamp() * 1000)
    filter_json = build_overlap_filter(overlap_start, updated_field) if server_filter else None
    sort_json = descending_sort(updated_field)
    stats = IncrementalScanStats(
        overlap_start=overlap_start.isoformat(),
        full_audit=full_audit,
        server_filter=server_filter,
    )
    window: list[Mapping[str, object]] = []
    seen_record_ids: set[str] = set()
    offset = 0
    previous_ms: int | None = None

    while True:
        page = fetch_page(offset, page_size, filter_json, sort_json)
        rows = list(page.rows)
        stats.actual_pages += 1
        stats.records_read += len(rows)
        if page.has_more and not rows:
            raise PaginationSafetyError("Lark returned an empty page with has_more=true")

        page_times: list[int | None] = []
        for row in rows:
            record_id = str(row.get("record_id") or "")
            if record_id:
                if record_id in seen_record_ids:
                    raise PaginationSafetyError(f"duplicate record across pages: {record_id}")
                seen_record_ids.add(record_id)

            updated_ms = _timestamp_ms(row.get(updated_field))
            page_times.append(updated_ms)
            if updated_ms is not None:
                if previous_ms is not None and updated_ms > previous_ms:
                    raise PaginationSafetyError(
                        f"records are not sorted by {updated_field} descending"
                    )
                previous_ms = updated_ms
            if updated_ms is not None and updated_ms >= boundary_ms:
                window.append(row)

        whole_page_before_boundary = bool(rows) and all(
            value is not None and value < boundary_ms for value in page_times
        )
        if whole_page_before_boundary:
            stats.stop_reason = "time_boundary"
            break
        if not page.has_more:
            stats.stop_reason = (
                "server_filter_exhausted" if server_filter else "source_exhausted"
            )
            break
        offset = resolve_offset(offset, len(rows), page.next_offset)

    stats.window_records = len(window)
    return window, stats


def scan_with_filter_fallback(
    fetch_page: FetchPage,
    *,
    overlap_start: datetime,
    updated_field: str = UPDATED_FIELD,
    page_size: int = 200,
    full_audit: bool = False,
) -> tuple[list[Mapping[str, object]], IncrementalScanStats]:
    """Prefer server filtering and fallback only on an explicit capability error."""
    try:
        return scan_descending_window(
            fetch_page,
            overlap_start=overlap_start,
            updated_field=updated_field,
            page_size=page_size,
            server_filter=True,
            full_audit=full_audit,
        )
    except ServerFilterUnsupported:
        return scan_descending_window(
            fetch_page,
            overlap_start=overlap_start,
            updated_field=updated_field,
            page_size=page_size,
            server_filter=False,
            full_audit=full_audit,
        )


def _chunks(values: Sequence[tuple[str, str]], size: int) -> Iterable[Sequence[tuple[str, str]]]:
    for index in range(0, len(values), size):
        yield values[index : index + size]


def plan_target_reads(
    candidates: Iterable[Mapping[str, object]],
    *,
    full_audit: bool,
    main_table: str,
    child_tables: Iterable[str],
    filter_chunk_size: int = 10,
) -> TargetReadPlan:
    """Plan targeted dedup reads; reserve whole-table reads for explicit audits."""
    if full_audit:
        return TargetReadPlan(
            mode="full_audit",
            full_tables=(main_table, *tuple(child_tables)),
            link_filters=(),
            company_keywords=(),
        )

    link_pairs: set[tuple[str, str]] = set()
    companies: set[str] = set()
    for candidate in candidates:
        for target_field, source_key in (
            ("投递链接", "official_url"),
            ("公告链接", "source_url"),
        ):
            value = str(candidate.get(source_key) or "").strip()
            if value:
                link_pairs.add((target_field, value))
        company = str(candidate.get("company_name") or "").strip()
        if company:
            companies.add(company)

    filters = []
    ordered_pairs = sorted(link_pairs)
    for chunk in _chunks(ordered_pairs, filter_chunk_size):
        filters.append(
            {
                "logic": "or",
                "conditions": [[field, "==", value] for field, value in chunk],
            }
        )
    return TargetReadPlan(
        mode="incremental",
        full_tables=(),
        link_filters=tuple(filters),
        company_keywords=tuple(sorted(companies)),
    )
