#!/usr/bin/env python3
"""Deterministic helpers for Tencent Docs SmartSheet MCP ingestion.

The Agent host owns the MCP connection and secret storage.  This module keeps
pagination, URL parsing, and completeness checks outside the model context so a
large first sync cannot be mistaken for a complete scan after one truncated
tool response.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Callable, Mapping, Sequence
from urllib.parse import parse_qsl, urlparse


TENCENT_DOCS_MCP_ENDPOINT = "https://docs.qq.com/openapi/mcp"
LIST_RECORDS_TOOL = "smartsheet.list_records"
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 25


class TencentMcpError(RuntimeError):
    """Raised when a Tencent MCP response cannot be trusted as complete."""


class TencentMcpResponseTruncated(TencentMcpError):
    """Raised when an MCP response ends before its JSON payload is complete."""


@dataclass(frozen=True)
class SmartsheetLocation:
    """Stable identifiers parsed from an authorized Tencent SmartSheet URL."""

    file_id: str
    tab_id: str | None
    view_id: str | None


@dataclass(frozen=True)
class PaginationSummary:
    """Completeness evidence for one full SmartSheet record scan."""

    total: int
    pages: int
    records: int
    duplicate_record_ids: int
    complete: bool
    requested_page_size: int = DEFAULT_PAGE_SIZE
    smallest_page_size: int = DEFAULT_PAGE_SIZE
    truncation_retries: int = 0
    field_split_pages: int = 0


def parse_smartsheet_url(url: str) -> SmartsheetLocation:
    """Parse a docs.qq.com SmartSheet URL without accepting lookalike hosts."""

    parsed = urlparse(url)
    if (parsed.hostname or "").lower() != "docs.qq.com":
        raise ValueError("URL is not a Tencent Docs URL")
    match = re.fullmatch(
        r"/smartsheet/([A-Za-z0-9_-]+)", parsed.path.rstrip("/")
    )
    if not match:
        raise ValueError("URL is not a Tencent SmartSheet URL")
    query = dict(parse_qsl(parsed.query, keep_blank_values=False))
    return SmartsheetLocation(
        file_id=match.group(1),
        tab_id=query.get("tab"),
        view_id=query.get("viewId"),
    )


def _decode_text_payload(value: str) -> Mapping[str, object]:
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError as exc:
        raise TencentMcpResponseTruncated(
            "Tencent MCP returned incomplete or non-JSON text content"
        ) from exc
    if not isinstance(decoded, Mapping):
        raise TencentMcpError("Tencent MCP JSON payload is not an object")
    return decoded


def unwrap_tool_payload(value: object) -> Mapping[str, object]:
    """Normalize raw, structuredContent, and text-content MCP results."""

    if isinstance(value, bytes):
        try:
            value = value.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise TencentMcpResponseTruncated(
                "Tencent MCP returned incomplete UTF-8 content"
            ) from exc
    if isinstance(value, str):
        return _decode_text_payload(value)
    if not isinstance(value, Mapping):
        raise TencentMcpError("Tencent MCP tool result is not an object")

    if "records" in value or "error" in value:
        return value

    nested_result = value.get("result")
    if isinstance(nested_result, Mapping):
        return unwrap_tool_payload(nested_result)

    structured = value.get("structuredContent")
    if isinstance(structured, Mapping):
        return structured

    content = value.get("content")
    if isinstance(content, Sequence) and not isinstance(content, (str, bytes)):
        text_items = [
            item.get("text")
            for item in content
            if isinstance(item, Mapping)
            and item.get("type") == "text"
            and isinstance(item.get("text"), str)
        ]
        if len(text_items) == 1:
            return _decode_text_payload(text_items[0])

    raise TencentMcpError("Tencent MCP tool result has no usable record payload")


def list_records_arguments(
    *,
    file_id: str,
    sheet_id: str,
    offset: int,
    limit: int = DEFAULT_PAGE_SIZE,
    view_id: str | None = None,
    field_titles: Sequence[str] = (),
    sort: Sequence[Mapping[str, object]] = (),
) -> dict[str, object]:
    """Build a bounded SmartSheet list_records request."""

    if not file_id or not sheet_id:
        raise ValueError("file_id and sheet_id are required")
    if offset < 0:
        raise ValueError("offset must be non-negative")
    if not 1 <= limit <= MAX_PAGE_SIZE:
        raise ValueError(f"limit must be between 1 and {MAX_PAGE_SIZE}")

    arguments: dict[str, object] = {
        "file_id": file_id,
        "sheet_id": sheet_id,
        "offset": offset,
        "limit": limit,
    }
    if view_id:
        arguments["view_id"] = view_id
    if field_titles:
        arguments["field_titles"] = list(field_titles)
    if sort:
        arguments["sort"] = [dict(item) for item in sort]
    return arguments


def _read_page(
    call_tool: Callable[[str, Mapping[str, object]], object],
    *,
    file_id: str,
    sheet_id: str,
    view_id: str | None,
    field_titles: Sequence[str],
    sort: Sequence[Mapping[str, object]],
    offset: int,
    limit: int,
) -> Mapping[str, object]:
    arguments = list_records_arguments(
        file_id=file_id,
        sheet_id=sheet_id,
        view_id=view_id,
        field_titles=field_titles,
        sort=sort,
        offset=offset,
        limit=limit,
    )
    try:
        result = call_tool(LIST_RECORDS_TOOL, arguments)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise TencentMcpResponseTruncated(
            "Tencent MCP transport returned an incomplete response"
        ) from exc
    return unwrap_tool_payload(result)


def _page_record_ids(payload: Mapping[str, object]) -> list[str]:
    records = payload.get("records")
    if not isinstance(records, Sequence) or isinstance(records, (str, bytes)):
        raise TencentMcpError("Tencent MCP page has no records array")
    record_ids: list[str] = []
    for record in records:
        if not isinstance(record, Mapping):
            raise TencentMcpError("Tencent MCP returned a non-object record")
        record_id = str(record.get("record_id", "") or "").strip()
        if not record_id:
            raise TencentMcpError("Tencent MCP returned a record without record_id")
        record_ids.append(record_id)
    return record_ids


def _require_page_envelope(payload: Mapping[str, object]) -> None:
    missing = [
        key
        for key in ("total", "records", "next")
        if key not in payload
    ]
    if "has_more" not in payload and "hasMore" not in payload:
        missing.append("has_more")
    if missing:
        raise TencentMcpError(
            "Tencent MCP page is missing required fields: " + ", ".join(missing)
        )


def _merge_field_values(left: object, right: object) -> object:
    if isinstance(left, Mapping) and isinstance(right, Mapping):
        overlap = set(left).intersection(right)
        if any(left[key] != right[key] for key in overlap):
            raise TencentMcpError(
                "Tencent MCP field projections returned conflicting values"
            )
        return {**left, **right}
    if (
        isinstance(left, Sequence)
        and not isinstance(left, (str, bytes))
        and isinstance(right, Sequence)
        and not isinstance(right, (str, bytes))
    ):
        return [*left, *right]
    raise TencentMcpError(
        "Tencent MCP field projections returned incompatible field_values"
    )


def _merge_projected_pages(
    left: Mapping[str, object],
    right: Mapping[str, object],
) -> Mapping[str, object]:
    """Merge two one-row field projections after proving they are the same page."""

    for key in ("total", "has_more", "hasMore", "next"):
        if key in left or key in right:
            if left.get(key) != right.get(key):
                raise TencentMcpError(
                    "Tencent SmartSheet changed during field-split recovery"
                )

    left_ids = _page_record_ids(left)
    right_ids = _page_record_ids(right)
    if left_ids != right_ids:
        raise TencentMcpError(
            "Tencent SmartSheet record changed during field-split recovery"
        )

    right_records = {
        str(record["record_id"]): record
        for record in right["records"]
        if isinstance(record, Mapping)
    }
    merged_records: list[Mapping[str, object]] = []
    for left_record in left["records"]:
        if not isinstance(left_record, Mapping):
            raise TencentMcpError("Tencent MCP returned a non-object record")
        record_id = str(left_record["record_id"])
        right_record = right_records[record_id]
        merged_record = dict(left_record)
        merged_record["field_values"] = _merge_field_values(
            left_record.get("field_values", []),
            right_record.get("field_values", []),
        )
        merged_records.append(merged_record)

    merged = dict(left)
    merged["records"] = merged_records
    return merged


def _read_single_row_by_field_groups(
    call_tool: Callable[[str, Mapping[str, object]], object],
    *,
    file_id: str,
    sheet_id: str,
    view_id: str | None,
    field_titles: Sequence[str],
    sort: Sequence[Mapping[str, object]],
    offset: int,
) -> tuple[Mapping[str, object], int]:
    """Recover a one-row page by recursively splitting projected fields."""

    if len(field_titles) < 2:
        raise TencentMcpError(
            "Tencent MCP response is still truncated at limit=1; "
            "provide multiple field_titles so the row can be split by field"
        )

    midpoint = len(field_titles) // 2
    groups = (field_titles[:midpoint], field_titles[midpoint:])
    pages: list[Mapping[str, object]] = []
    nested_truncations = 0
    for group in groups:
        try:
            page = _read_page(
                call_tool,
                file_id=file_id,
                sheet_id=sheet_id,
                view_id=view_id,
                field_titles=group,
                sort=sort,
                offset=offset,
                limit=1,
            )
        except TencentMcpResponseTruncated:
            nested_truncations += 1
            page, child_truncations = _read_single_row_by_field_groups(
                call_tool,
                file_id=file_id,
                sheet_id=sheet_id,
                view_id=view_id,
                field_titles=group,
                sort=sort,
                offset=offset,
            )
            nested_truncations += child_truncations
        pages.append(page)

    return _merge_projected_pages(pages[0], pages[1]), nested_truncations


def scan_all_records(
    call_tool: Callable[[str, Mapping[str, object]], object],
    consume_page: Callable[[Sequence[Mapping[str, object]]], None],
    *,
    file_id: str,
    sheet_id: str,
    view_id: str | None = None,
    field_titles: Sequence[str] = (),
    sort: Sequence[Mapping[str, object]] = (),
    page_size: int = DEFAULT_PAGE_SIZE,
    max_pages: int = 10_000,
) -> PaginationSummary:
    """Read every record page and fail closed on truncation or source drift.

    Pages are handed to ``consume_page`` immediately.  Only record IDs and
    counters remain in memory, so the model never needs to retain the full
    source table in its context.
    """

    if max_pages < 1:
        raise ValueError("max_pages must be positive")

    if not 1 <= page_size <= MAX_PAGE_SIZE:
        raise ValueError(f"page_size must be between 1 and {MAX_PAGE_SIZE}")

    offset = 0
    page_count = 0
    expected_total: int | None = None
    seen_record_ids: set[str] = set()
    duplicate_count = 0
    effective_page_size = page_size
    smallest_page_size = page_size
    truncation_retries = 0
    field_split_pages = 0

    while True:
        if page_count >= max_pages:
            raise TencentMcpError("Tencent MCP pagination exceeded max_pages")

        while True:
            try:
                payload = _read_page(
                    call_tool,
                    file_id=file_id,
                    sheet_id=sheet_id,
                    view_id=view_id,
                    field_titles=field_titles,
                    sort=sort,
                    offset=offset,
                    limit=effective_page_size,
                )
                break
            except TencentMcpResponseTruncated:
                truncation_retries += 1
                if effective_page_size > 1:
                    effective_page_size = max(1, effective_page_size // 2)
                    smallest_page_size = min(
                        smallest_page_size, effective_page_size
                    )
                    continue
                payload, nested_truncations = _read_single_row_by_field_groups(
                    call_tool,
                    file_id=file_id,
                    sheet_id=sheet_id,
                    view_id=view_id,
                    field_titles=field_titles,
                    sort=sort,
                    offset=offset,
                )
                truncation_retries += nested_truncations
                field_split_pages += 1
                break

        page_count += 1

        error = str(payload.get("error", "") or "").strip()
        if error:
            raise TencentMcpError(f"Tencent MCP list_records failed: {error}")
        _require_page_envelope(payload)

        try:
            total = int(payload["total"])
        except (KeyError, TypeError, ValueError) as exc:
            raise TencentMcpError("Tencent MCP page is missing a valid total") from exc
        if total < 0:
            raise TencentMcpError("Tencent MCP page returned a negative total")
        if expected_total is None:
            expected_total = total
        elif total != expected_total:
            raise TencentMcpError(
                "Tencent SmartSheet changed during pagination; total is unstable"
            )

        records = payload.get("records")
        _page_record_ids(payload)

        unique_records: list[Mapping[str, object]] = []
        for record in records:
            if not isinstance(record, Mapping):
                raise TencentMcpError("Tencent MCP returned a non-object record")
            record_id = str(record.get("record_id", "") or "").strip()
            if not record_id:
                raise TencentMcpError("Tencent MCP returned a record without record_id")
            if record_id in seen_record_ids:
                duplicate_count += 1
                continue
            seen_record_ids.add(record_id)
            unique_records.append(record)

        if unique_records:
            consume_page(unique_records)

        has_more = bool(payload.get("has_more", payload.get("hasMore", False)))
        if not has_more:
            break
        if not records:
            raise TencentMcpError(
                "Tencent MCP returned an empty page while has_more is true"
            )
        try:
            next_offset = int(payload["next"])
        except (KeyError, TypeError, ValueError) as exc:
            raise TencentMcpError(
                "Tencent MCP page is missing a valid next offset"
            ) from exc
        if next_offset <= offset:
            raise TencentMcpError("Tencent MCP next offset did not advance")
        offset = next_offset

    final_total = expected_total or 0
    if duplicate_count:
        raise TencentMcpError(
            "Tencent SmartSheet shifted during pagination; duplicate record IDs found"
        )
    if len(seen_record_ids) != final_total:
        raise TencentMcpError(
            "Tencent MCP scan is incomplete: "
            f"received {len(seen_record_ids)} unique records, expected {final_total}"
        )

    return PaginationSummary(
        total=final_total,
        pages=page_count,
        records=len(seen_record_ids),
        duplicate_record_ids=duplicate_count,
        complete=True,
        requested_page_size=page_size,
        smallest_page_size=smallest_page_size,
        truncation_retries=truncation_retries,
        field_split_pages=field_split_pages,
    )
