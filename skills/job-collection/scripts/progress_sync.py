#!/usr/bin/env python3
"""Pure rules and repository adapter for OfferLoop application progress sync."""

from __future__ import annotations

from datetime import date


PROGRESS_STATUSES = {
    "待反馈", "待笔试", "待面试", "待群面", "待一面", "待二面",
    "待三面", "待 HR 面", "待 OC", "Offer", "未通过", "主动放弃",
    "岗位关闭", "状态待确认",
}
WRITABLE_PROGRESS_FIELDS = {
    "进展状态", "最近完成节点", "公司", "投递岗位", "岗位 JD", "投递日期",
    "公告链接", "投递链接", "企业清单 record_id", "投递记录 ID",
}


def default_application_id(source_record_id: str) -> str:
    """Return the stable ID for the progress row created automatically."""
    return f"enterprise:{source_record_id}:default"


def application_id_for(record) -> str:
    """Keep an existing application ID or derive one from the progress row."""
    fields = record.get("fields", {})
    return fields.get("投递记录 ID") or f"progress:{record['record_id']}"


def can_delete_generated_default(record, source_record_id: str) -> bool:
    """Return whether a source rollback may safely remove this progress row."""
    fields = record.get("fields", {})
    progress_status = str(fields.get("进展状态", "") or "").strip()
    completed = str(fields.get("最近完成节点", "") or "").strip()
    return (
        str(fields.get("投递记录 ID", "") or "").strip()
        == default_application_id(source_record_id)
        and not str(fields.get("投递岗位", "") or "").strip()
        and not str(fields.get("岗位 JD", "") or "").strip()
        and progress_status == "待反馈"
        and completed == "投递完成"
    )


def normalized_progress_fields(fields: dict) -> dict:
    """Normalize schema v6 state without consulting retired compatibility fields."""
    result = {
        name: value
        for name, value in fields.items()
        if name in WRITABLE_PROGRESS_FIELDS
    }
    status = str(result.get("进展状态", "") or "").strip()
    result["进展状态"] = status if status in PROGRESS_STATUSES else "状态待确认"
    result["最近完成节点"] = result.get("最近完成节点") or "投递完成"
    return result


def build_progress_record(source, submitted_on: date | None):
    """Build fields for the first progress record created from an application."""
    company = str(source.get("fields", {}).get("公司", "")).strip()
    if not company:
        raise ValueError("公司不能为空")
    return {
        "进展状态": "待反馈",
        "最近完成节点": "投递完成",
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
    result = normalized_progress_fields(existing)
    result.pop("原招聘信息", None)
    result["公司"] = source["fields"]["公司"]
    result["公告链接"] = source.get("fields", {}).get("公告链接", "")
    result["投递链接"] = source.get("fields", {}).get("投递链接", "")
    result["企业清单 record_id"] = source["record_id"]
    result["投递记录 ID"] = application_id
    if not result.get("投递日期") and submitted_on:
        result["投递日期"] = submitted_on.isoformat()
    result.setdefault("投递岗位", "")
    result.setdefault("岗位 JD", "")
    return result


def sync_submitted_application(source, repository, submitted_on: date | None):
    """Reconcile every application under one enterprise record in either direction."""
    source_record_id = source["record_id"]
    existing_records = repository.find_all_by_enterprise_record_id(source_record_id)
    if source.get("fields", {}).get("投递进度") != "已投递":
        deletable = [
            record
            for record in existing_records
            if can_delete_generated_default(record, source_record_id)
        ]
        protected = [
            record
            for record in existing_records
            if not can_delete_generated_default(record, source_record_id)
        ]
        for record in deletable:
            repository.delete(record["record_id"])
        return {
            "action": (
                "review_required"
                if protected
                else "deleted" if deletable else "unchanged"
            ),
            "record_ids": [record["record_id"] for record in existing_records],
            "deleted_record_ids": [record["record_id"] for record in deletable],
            "protected_record_ids": [record["record_id"] for record in protected],
        }
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
