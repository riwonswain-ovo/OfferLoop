#!/usr/bin/env python3
"""Pure rules and repository adapter for OfferLoop application progress sync."""

from __future__ import annotations

from datetime import date


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
    }


def merge_progress_record(existing, source, submitted_on: date | None):
    """Refresh source-owned fields without overwriting user or later-stage data."""
    result = dict(existing)
    result.pop("原招聘信息", None)
    result["公司"] = source["fields"]["公司"]
    result["公告链接"] = source.get("fields", {}).get("公告链接", "")
    result["投递链接"] = source.get("fields", {}).get("投递链接", "")
    result["企业清单 record_id"] = source["record_id"]
    if not result.get("当前阶段"):
        result["当前阶段"] = "已投递"
    if not result.get("投递日期") and submitted_on:
        result["投递日期"] = submitted_on.isoformat()
    result.setdefault("投递岗位", "")
    result.setdefault("岗位 JD", "")
    return result


def sync_submitted_application(source, repository, submitted_on: date | None):
    """Create or refresh one progress record using the enterprise record ID."""
    if source.get("fields", {}).get("投递进度") != "已投递":
        return {"action": "skipped", "reason": "not_submitted"}
    source_record_id = source["record_id"]
    existing = repository.find_by_enterprise_record_id(source_record_id)
    if existing is None:
        fields = build_progress_record(source, submitted_on)
        record_id = repository.create(fields)
        return {"action": "created", "record_id": record_id}

    fields = merge_progress_record(existing["fields"], source, submitted_on)
    if fields == existing["fields"]:
        return {"action": "unchanged", "record_id": existing["record_id"]}
    repository.update(existing["record_id"], fields)
    return {"action": "updated", "record_id": existing["record_id"]}
