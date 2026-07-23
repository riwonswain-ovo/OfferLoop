#!/usr/bin/env python3
"""Pure rules and repository adapter for OfferLoop application progress sync."""

from __future__ import annotations

from datetime import date


def default_application_id(source_record_id: str) -> str:
    """Return the stable ID for the progress row created automatically."""
    return f"enterprise:{source_record_id}:default"


def application_id_for(record) -> str:
    """Keep an existing application ID or derive one from the progress row."""
    fields = record.get("fields", {})
    return fields.get("投递记录 ID") or f"progress:{record['record_id']}"


def build_progress_record(source, submitted_on: date | None):
    """Build fields for the first progress record created from an application."""
    company = str(source.get("fields", {}).get("公司", "")).strip()
    if not company:
        raise ValueError("公司不能为空")
    return {
        "当前阶段": "已投递",
        "公司": company,
        "投递岗位": "",
        "投递日期": submitted_on.isoformat() if submitted_on else "",
        "岗位 JD": "",
        "公告链接": source.get("fields", {}).get("公告链接", ""),
        "投递链接": source.get("fields", {}).get("投递链接", ""),
        "企业清单 record_id": source["record_id"],
        "投递记录 ID": default_application_id(source["record_id"]),
    }


def merge_progress_record(
    existing,
    source,
    submitted_on: date | None,
    application_id: str,
):
    """Refresh source-owned fields without overwriting user or later-stage data."""
    result = dict(existing)
    result.pop("原招聘信息", None)
    result["公司"] = source["fields"]["公司"]
    result["公告链接"] = source.get("fields", {}).get("公告链接", "")
    result["投递链接"] = source.get("fields", {}).get("投递链接", "")
    result["企业清单 record_id"] = source["record_id"]
    result["投递记录 ID"] = application_id
    if not result.get("当前阶段"):
        result["当前阶段"] = "已投递"
    if not result.get("投递日期") and submitted_on:
        result["投递日期"] = submitted_on.isoformat()
    result.setdefault("投递岗位", "")
    result.setdefault("岗位 JD", "")
    return result


def sync_submitted_application(source, repository, submitted_on: date | None):
    """Create or refresh every application under one enterprise record."""
    if source.get("fields", {}).get("投递进度") != "已投递":
        return {"action": "skipped", "reason": "not_submitted"}
    source_record_id = source["record_id"]
    existing_records = repository.find_all_by_enterprise_record_id(source_record_id)
    if not existing_records:
        fields = build_progress_record(source, submitted_on)
        record_id = repository.create(fields)
        return {
            "action": "created",
            "record_id": record_id,
            "record_ids": [record_id],
        }

    updated_ids = []
    record_ids = []
    for existing in existing_records:
        record_ids.append(existing["record_id"])
        fields = merge_progress_record(
            existing["fields"],
            source,
            submitted_on,
            application_id_for(existing),
        )
        if fields != existing["fields"]:
            repository.update(existing["record_id"], fields)
            updated_ids.append(existing["record_id"])

    return {
        "action": "updated" if updated_ids else "unchanged",
        "record_id": record_ids[0],
        "record_ids": record_ids,
        "updated_record_ids": updated_ids,
    }
