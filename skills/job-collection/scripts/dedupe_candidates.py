#!/usr/bin/env python3
"""Read-only, fail-closed deduplication for normalized recruitment candidates."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
import json
from pathlib import Path
import subprocess
import time
from typing import Callable, Iterable, Mapping, Sequence

try:  # Support both direct CLI execution and package-style unit tests.
    from .incremental_scan import plan_target_reads
    from .sync_utils import (
        normalize_company_name,
        normalize_recruitment_batch,
        normalize_text,
        normalize_url,
    )
except ImportError:  # pragma: no cover - exercised by direct CLI use
    from incremental_scan import plan_target_reads
    from sync_utils import (
        normalize_company_name,
        normalize_recruitment_batch,
        normalize_text,
        normalize_url,
    )


TARGET_FIELDS = (
    "信息更新时间",
    "投递进度",
    "公司",
    "招聘批次",
    "招聘项目",
    "公告标题",
    "招聘岗位",
    "公告链接",
    "投递链接",
    "子表 record_id",
)
TRANSIENT_MARKERS = ("limited", "rate limit", "timeout", "temporarily", "connection")
TERMINAL_APPLICATION_STATUSES = {"已投递", "已拒绝"}


@dataclass(frozen=True)
class Decision:
    stable_key: str
    dedupe_result: str
    confidence: str
    reason: str
    target_record_ids: tuple[str, ...] = ()
    target_statuses: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, object]:
        return {
            "stable_key": self.stable_key,
            "dedupe_result": self.dedupe_result,
            "confidence": self.confidence,
            "reason": self.reason,
            "target_record_ids": list(self.target_record_ids),
            "target_statuses": list(self.target_statuses),
        }


def _strings(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, Mapping):
        result: list[str] = []
        for key in ("text", "link", "url", "value", "name"):
            if key in value:
                result.extend(_strings(value[key]))
        return result
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        result = []
        for item in value:
            result.extend(_strings(item))
        return result
    return [str(value)]


def _first_text(value: object) -> str:
    values = _strings(value)
    return values[0] if values else ""


def extract_target_records(response: Mapping[str, object]) -> list[dict[str, object]]:
    """Parse both object-style and tabular lark-cli Base responses."""
    data = response.get("data")
    if not isinstance(data, Mapping):
        raise ValueError("target response is missing data")

    records = data.get("records")
    if isinstance(records, list):
        parsed = []
        for item in records:
            if not isinstance(item, Mapping):
                raise ValueError("target records must be objects")
            fields = item.get("fields")
            if not isinstance(fields, Mapping):
                raise ValueError("target record is missing fields")
            row = dict(fields)
            row["_record_id"] = str(item.get("record_id") or item.get("id") or "")
            parsed.append(row)
        return parsed

    rows = data.get("data")
    fields = data.get("fields")
    if not isinstance(rows, list) or not isinstance(fields, list):
        raise ValueError("unsupported target response shape")
    record_ids = data.get("record_id_list")
    if record_ids is not None and (
        not isinstance(record_ids, list) or len(record_ids) != len(rows)
    ):
        raise ValueError("target record_id_list does not match returned rows")
    parsed = []
    for index, values in enumerate(rows):
        if not isinstance(values, list) or len(values) != len(fields):
            raise ValueError("target tabular row does not match fields")
        row = {str(name): value for name, value in zip(fields, values)}
        row["_record_id"] = str(record_ids[index]) if isinstance(record_ids, list) else ""
        parsed.append(row)
    return parsed


def _candidate_key(candidate: Mapping[str, object]) -> str:
    source_id = str(candidate.get("source_id") or "").strip()
    source_record_id = str(candidate.get("source_record_id") or "").strip()
    expected = f"{source_id}:{source_record_id}"
    stable_key = str(candidate.get("stable_key") or "").strip()
    if not source_id or not source_record_id or stable_key != expected:
        raise ValueError("candidate stable_key must equal source_id:source_record_id")
    return stable_key


def _candidate_urls(candidate: Mapping[str, object]) -> set[str]:
    return {
        normalized
        for key in ("official_url", "source_url")
        for raw in _strings(candidate.get(key))
        if (normalized := normalize_url(raw))
    }


def _record_urls(record: Mapping[str, object]) -> set[str]:
    return {
        normalized
        for key in ("投递链接", "公告链接")
        for raw in _strings(record.get(key))
        if (normalized := normalize_url(raw))
    }


def _record_identity(record: Mapping[str, object]) -> str:
    record_id = str(record.get("_record_id") or "")
    if record_id:
        return record_id
    return "|".join(
        normalize_text(_first_text(record.get(key)))
        for key in ("公司", "招聘批次", "招聘项目", "招聘岗位", "公告链接", "投递链接")
    )


def _unique_records(records: Iterable[Mapping[str, object]]) -> list[dict[str, object]]:
    result: dict[str, dict[str, object]] = {}
    for record in records:
        result.setdefault(_record_identity(record), dict(record))
    return list(result.values())


def company_search_keywords(company: str) -> tuple[str, ...]:
    raw = company.strip()
    normalized = normalize_company_name(raw)
    return tuple(sorted({value for value in (raw, normalized) if value}))


def _decision(candidate: Mapping[str, object], records: Sequence[Mapping[str, object]]) -> Decision:
    stable_key = _candidate_key(candidate)
    candidate_urls = _candidate_urls(candidate)
    exact = [record for record in records if candidate_urls & _record_urls(record)]
    if exact:
        return Decision(
            stable_key,
            "duplicate",
            "high",
            "规范化公告链接或投递链接与目标主表既有记录一致",
            tuple(str(item.get("_record_id") or "") for item in exact),
            tuple(_first_text(item.get("投递进度")) for item in exact),
        )

    company = normalize_company_name(str(candidate.get("company_name") or ""))
    company_rows = [
        record for record in records
        if normalize_company_name(_first_text(record.get("公司"))) == company
    ]
    if not company_rows:
        return Decision(stable_key, "unique", "high", "链接和公司均未命中目标主表")

    batch = normalize_recruitment_batch(str(candidate.get("recruitment_batch") or ""))
    if not batch:
        return Decision(stable_key, "needs_confirmation", "low", "公司已存在但候选招聘批次不明确")
    same_batch = [
        record for record in company_rows
        if normalize_recruitment_batch(_first_text(record.get("招聘批次"))) == batch
    ]
    if not same_batch:
        known_batches = {
            normalize_recruitment_batch(_first_text(record.get("招聘批次")))
            for record in company_rows
            if _first_text(record.get("招聘批次"))
        }
        if len(known_batches) == len(company_rows):
            return Decision(stable_key, "unique", "high", "同公司既有记录属于不同真实招聘批次")
        return Decision(stable_key, "needs_confirmation", "low", "同公司记录的招聘批次不完整")

    terminal_matches = [
        record for record in same_batch
        if _first_text(record.get("投递进度")) in TERMINAL_APPLICATION_STATUSES
    ]
    if terminal_matches:
        return Decision(
            stable_key,
            "duplicate",
            "high",
            "同一规范公司和招聘批次已有已投递或已拒绝记录",
            tuple(str(item.get("_record_id") or "") for item in terminal_matches),
            tuple(_first_text(item.get("投递进度")) for item in terminal_matches),
        )

    candidate_title = normalize_text(str(
        candidate.get("project_name") or candidate.get("announcement_title") or ""
    ))
    candidate_jobs = normalize_text(str(candidate.get("job_positions") or ""))
    high_matches = []
    for record in same_batch:
        target_title = normalize_text(
            _first_text(record.get("招聘项目")) or _first_text(record.get("公告标题"))
        )
        target_jobs = normalize_text(_first_text(record.get("招聘岗位")))
        if (candidate_title and target_title == candidate_title) or (
            candidate_jobs and target_jobs == candidate_jobs
        ):
            high_matches.append(record)
    if high_matches:
        return Decision(
            stable_key,
            "duplicate",
            "high",
            "公司、招聘批次及招聘项目或岗位一致",
            tuple(str(item.get("_record_id") or "") for item in high_matches),
            tuple(_first_text(item.get("投递进度")) for item in high_matches),
        )
    return Decision(
        stable_key,
        "needs_confirmation",
        "medium",
        "同公司同招聘批次，但招聘项目或岗位无法高置信度确认一致",
        tuple(str(item.get("_record_id") or "") for item in same_batch),
        tuple(_first_text(item.get("投递进度")) for item in same_batch),
    )


def partition_candidates(
    candidates: Sequence[Mapping[str, object]],
    records: Sequence[Mapping[str, object]],
) -> dict[str, object]:
    records = _unique_records(records)
    keys = [_candidate_key(candidate) for candidate in candidates]
    if len(set(keys)) != len(keys):
        raise ValueError("candidate stable_keys must be unique")
    decisions: dict[str, Decision] = {}
    for candidate in candidates:
        route = str(candidate.get("route") or "")
        if route not in {"hard_filtered", "auto_write", "awaiting_write_confirmation"}:
            raise ValueError(f"unsupported candidate route: {route}")
        if route != "hard_filtered":
            decision = _decision(candidate, records)
            decisions[decision.stable_key] = decision

    write_candidates = []
    pending_candidates = []
    duplicate_candidates = []
    hard_filtered_candidates = []
    for candidate in candidates:
        route = str(candidate["route"])
        if route == "hard_filtered":
            hard_filtered_candidates.append(dict(candidate))
            continue
        decision = decisions[_candidate_key(candidate)]
        if decision.dedupe_result == "duplicate":
            duplicate_candidates.append(dict(candidate))
        elif decision.dedupe_result == "needs_confirmation" or route == "awaiting_write_confirmation":
            pending_candidates.append(dict(candidate))
        elif route == "auto_write" and decision.dedupe_result == "unique":
            write_candidates.append(dict(candidate))
        else:
            raise RuntimeError("candidate did not receive exactly one disposition")

    if sum(map(len, (
        write_candidates,
        pending_candidates,
        duplicate_candidates,
        hard_filtered_candidates,
    ))) != len(candidates):
        raise RuntimeError("dedupe partitions do not cover candidates exactly once")
    return {
        "summary": {
            "candidates": len(candidates),
            "write": len(write_candidates),
            "pending": len(pending_candidates),
            "duplicate": len(duplicate_candidates),
            "hard_filtered": len(hard_filtered_candidates),
        },
        "decisions": [decisions[key].to_dict() for key in keys if key in decisions],
        "write_candidates": write_candidates,
        "pending_candidates": pending_candidates,
        "duplicate_candidates": duplicate_candidates,
        "hard_filtered_candidates": hard_filtered_candidates,
    }


def _run_json(command: list[str], *, timeout: int, max_retries: int) -> dict[str, object]:
    for attempt in range(max_retries + 1):
        result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
        if result.returncode == 0:
            payload = json.loads(result.stdout)
            if payload.get("ok") is not True:
                raise RuntimeError("target read was not confirmed")
            return payload
        detail = (result.stderr or result.stdout)[-1600:]
        if attempt == max_retries or not any(marker in detail.lower() for marker in TRANSIENT_MARKERS):
            raise RuntimeError(detail)
        time.sleep(2 ** attempt)
    raise AssertionError("unreachable")


def _read_target(
    candidates: Sequence[Mapping[str, object]],
    *,
    base_token: str,
    table_id: str,
    profile: str,
    identity: str,
    timeout: int,
    max_retries: int,
    workers: int,
    runner: Callable[..., dict[str, object]] = _run_json,
) -> list[dict[str, object]]:
    plan = plan_target_reads(
        candidates,
        full_audit=False,
        main_table=table_id,
        child_tables=(),
        filter_chunk_size=10,
    )
    base = [
        "lark-cli", "base", "+record-list",
        "--base-token", base_token,
        "--table-id", table_id,
        "--profile", profile,
        "--as", identity,
        "--format", "json",
        "--limit", "200",
    ]
    field_args = [value for field in TARGET_FIELDS for value in ("--field-id", field)]
    link_records: list[dict[str, object]] = []
    for filter_spec in plan.link_filters:
        response = runner(
            [*base, "--filter-json", json.dumps(filter_spec, ensure_ascii=False), *field_args],
            timeout=timeout,
            max_retries=max_retries,
        )
        link_records.extend(extract_target_records(response))
    link_records = _unique_records(link_records)

    unmatched_company_names = {
        str(candidate.get("company_name") or "").strip()
        for candidate in candidates
        if str(candidate.get("route") or "") != "hard_filtered"
        and not any(_candidate_urls(candidate) & _record_urls(record) for record in link_records)
        and str(candidate.get("company_name") or "").strip()
    }
    unmatched_companies = sorted({
        keyword
        for company in unmatched_company_names
        for keyword in company_search_keywords(company)
    })

    def search(company: str) -> list[dict[str, object]]:
        command = [
            "lark-cli", "base", "+record-search",
            "--base-token", base_token,
            "--table-id", table_id,
            "--keyword", company,
            "--search-field", "公司",
            "--profile", profile,
            "--as", identity,
            "--format", "json",
            "--limit", "200",
            *field_args,
        ]
        return extract_target_records(runner(command, timeout=timeout, max_retries=max_retries))

    company_records: list[dict[str, object]] = []
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = [pool.submit(search, company) for company in unmatched_companies]
        for future in as_completed(futures):
            company_records.extend(future.result())
    return _unique_records([*link_records, *company_records])


def _load_candidates(path: Path) -> list[dict[str, object]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw = payload.get("candidates") if isinstance(payload, Mapping) else payload
    if not isinstance(raw, list) or any(not isinstance(item, Mapping) for item in raw):
        raise ValueError("candidate file must be a list or contain a candidates list")
    return [dict(item) for item in raw]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", type=Path, required=True)
    parser.add_argument("--base-token", required=True)
    parser.add_argument("--table-id", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", default="codex")
    parser.add_argument("--as", dest="identity", default="user")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--max-retries", type=int, default=3)
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()
    candidates = _load_candidates(args.candidates)
    records = _read_target(
        candidates,
        base_token=args.base_token,
        table_id=args.table_id,
        profile=args.profile,
        identity=args.identity,
        timeout=args.timeout,
        max_retries=args.max_retries,
        workers=args.workers,
    )
    result = partition_candidates(candidates, records)
    result["target_records_read"] = len(records)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".tmp")
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(args.output)
    print(json.dumps({**result["summary"], "target_records_read": len(records)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
