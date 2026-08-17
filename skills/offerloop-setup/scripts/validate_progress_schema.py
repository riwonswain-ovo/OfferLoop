#!/usr/bin/env python3
"""Validate a lark-cli field-list response against OfferLoop progress schema v6."""

from __future__ import annotations

import argparse
import json
import sys


REQUIRED_TYPES = {
    "求职记录": "formula",
    "进展状态": "select",
    "最近完成节点": "select",
    "公司": "text",
    "投递岗位": "text",
    "岗位 JD": "text",
    "投递日期": "datetime",
    "公告链接": "text",
    "投递链接": "text",
    "企业清单 record_id": "text",
    "投递记录 ID": "text",
}
PROGRESS_STATUS_OPTIONS = {
    "待反馈",
    "待笔试",
    "待面试",
    "待群面",
    "待一面",
    "待二面",
    "待三面",
    "待 HR 面",
    "待 OC",
    "Offer",
    "未通过",
    "主动放弃",
    "岗位关闭",
    "状态待确认",
}
COMPLETED_NODE_OPTIONS = {
    "投递完成",
    "笔试完成",
    "面试完成",
    "群面完成",
    "一面完成",
    "二面完成",
    "三面完成",
    "HR面完成",
}
FORBIDDEN_FIELDS = {
    "投递简历版本",
    "当前阶段",
    "下一环节",
    "流程结果",
    "当前状态",
}


def _fields(payload: object) -> list[dict]:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        raise ValueError("field payload must be an object or array")
    data = payload.get("data", payload)
    if isinstance(data, dict) and isinstance(data.get("fields"), list):
        return data["fields"]
    raise ValueError("field payload does not contain data.fields")


def validate(payload: object) -> dict:
    fields = _fields(payload)
    by_name = {str(field.get("name", "")): field for field in fields}
    issues = []
    for name, expected_type in REQUIRED_TYPES.items():
        field = by_name.get(name)
        if field is None:
            issues.append({"field": name, "issue": "missing"})
        elif field.get("type") != expected_type:
            issues.append(
                {
                    "field": name,
                    "issue": "wrong_type",
                    "expected": expected_type,
                    "actual": field.get("type"),
                }
            )
    for name in sorted(FORBIDDEN_FIELDS & by_name.keys()):
        issues.append({"field": name, "issue": "forbidden"})
    for name, expected in (
        ("进展状态", PROGRESS_STATUS_OPTIONS),
        ("最近完成节点", COMPLETED_NODE_OPTIONS),
    ):
        field = by_name.get(name)
        if field is None:
            continue
        actual = {
            str(option.get("name", ""))
            for option in field.get("options", [])
            if isinstance(option, dict)
        }
        if actual != expected:
            issues.append(
                {
                    "field": name,
                    "issue": "option_mismatch",
                    "missing": sorted(expected - actual),
                    "unexpected": sorted(actual - expected),
                }
            )
    return {
        "schema_version": 6,
        "status": "ready" if not issues else "needs_action",
        "issues": issues,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="-", help="field-list JSON file or - for stdin")
    args = parser.parse_args(argv)
    if args.input == "-":
        payload = json.load(sys.stdin)
    else:
        with open(args.input, encoding="utf-8") as handle:
            payload = json.load(handle)
    result = validate(payload)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
