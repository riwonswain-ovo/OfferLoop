#!/usr/bin/env python3
"""Classify an OfferLoop user-profile Markdown document as empty or ready."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
import unicodedata


PLACEHOLDER_EXACT = {
    "",
    "-",
    "--",
    "—",
    "[]",
    "{}",
    "待补充",
    "待填写",
    "未填写",
    "未知",
    "暂无",
    "无",
    "不详",
    "n/a",
    "na",
    "null",
    "none",
    "incomplete",
}

PLACEHOLDER_PREFIXES = (
    "待补充",
    "待填写",
    "未填写",
    "暂未",
    "尚未",
    "未知",
)

TEMPLATE_LINES = {
    "能力｜证据｜来源",
    "能力|证据|来源",
    "日期｜原值｜新值｜来源｜用户确认",
    "日期|原值|新值|来源|用户确认",
    "未确认推断：不得写入正式画像",
    "未确认推断:不得写入正式画像",
    "日期｜修改内容｜修改前｜修改后｜用户确认",
    "日期|修改内容|修改前|修改后|用户确认",
    "城市、招聘类型、行业和明确排除公司按照已确认范围执行筛选。",
    "岗位名称不同或没有同名实习，不能直接排除招聘信息。",
    "可迁移岗位按照已确认的迁移路径保留。",
    "只有可靠来源展示了企业完整招聘范围，并且全部岗位都是用户确认完全不考虑的方向时，才在写入企业清单前让用户确认。",
    "用户接受某一次边界外机会，不自动修改长期岗位偏好。",
}


def _normalise(value: str) -> str:
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("：", ":").strip()
    value = re.sub(r"\s+", " ", value)
    return value


def _is_placeholder(value: str) -> bool:
    cleaned = _normalise(value).strip(" `*_~|,，。;；:：()（）[]【】")
    lowered = cleaned.lower()
    if lowered.replace(" ", "") in {
        "能力|证据|来源",
        "日期|原值|新值|来源|用户确认",
        "特质|用户如何理解它|来源",
        "解释|否认原因",
        "方向|依据",
        "方向|迁移路径|用户确认",
        "方向|缺少什么信息",
        "方向/门槛|判断来源|待用户确认",
        "岗位方向|判断依据|用户确认",
        "岗位方向|迁移路径|用户确认",
        "岗位方向|用户原始表达",
        "岗位方向|用户确认",
        "岗位方向|涉及的专业门槛|用户是否确认完全不考虑",
        "岗位方向|尚缺少的信息",
        "日期|用户带来的情绪或困惑|必要的触发背景|对话后厘清的认识|仍未解决或待继续观察",
        "日期|样本名称或来源|口语/书面|使用场景|证据权重",
        "agent原表达|用户实际改写|反映出的语言习惯|用户确认",
        "候选特征|观察来源|出现次数|当前置信度",
        "日期|修改内容|修改原因|用户确认",
        "标题/来源|用途|日期",
        "原表达|用户改写|提炼出的习惯",
        "特征|来源数量|适用产物",
    }:
        return True
    if lowered in PLACEHOLDER_EXACT:
        return True
    if lowered.replace(" ", "") in {"指定城市/全国", "不限/具体行业"}:
        return True
    return any(
        lowered == prefix
        or re.match(rf"^{re.escape(prefix)}(?:[:(（\[【]|$)", lowered)
        for prefix in PLACEHOLDER_PREFIXES
    )


def _candidate_lines(markdown: str):
    without_comments = re.sub(r"<!--.*?-->", "", markdown, flags=re.S)
    for raw in without_comments.splitlines():
        line = raw.strip()
        if line.startswith("```"):
            continue
        if not line or line.startswith("#"):
            continue
        line = re.sub(r"^>\s*", "", line)
        line = re.sub(r"^[-*+]\s+", "", line)
        line = re.sub(r"^\d+[.)、]\s*", "", line)
        line = re.sub(r"^\[[ xX]\]\s*", "", line).strip()
        if not line or re.fullmatch(r"[:|\-—\s]+", line):
            continue
        # Fenced profile templates are still inspected: a real value copied into
        # the standard schema should make the document usable.
        yield line


def assess_profile(markdown: str) -> dict[str, object]:
    """Return a privacy-safe classification without echoing profile values."""

    meaningful_fields = 0
    inspected_fields = 0

    for raw_line in _candidate_lines(markdown):
        line = _normalise(raw_line)
        canonical = line.replace(" ", "")
        if canonical in {
            _normalise(item).replace(" ", "") for item in TEMPLATE_LINES
        }:
            continue

        if line.startswith("|") and line.endswith("|"):
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if not cells or all(_is_placeholder(cell) for cell in cells):
                continue
            # Ignore a Markdown table header, but count a populated data row.
            if all(re.fullmatch(r"[-: ]+", cell) for cell in cells):
                continue
            if any(cell in {"字段", "值", "项目", "内容"} for cell in cells):
                continue
            inspected_fields += 1
            meaningful_fields += 1
            continue

        key_value = re.match(r"^([^:]{1,40}):\s*(.*)$", line)
        if key_value:
            key, value = key_value.groups()
            inspected_fields += 1
            if key.strip() in {
                "状态",
                "生成 Skill",
                "生成Skill",
                "run_id",
                "边界声明",
            }:
                continue
            if not _is_placeholder(value):
                meaningful_fields += 1
            continue

        inspected_fields += 1
        if not _is_placeholder(line):
            meaningful_fields += 1

    status = "ready" if meaningful_fields else "empty"
    reason = (
        "found_confirmed_content"
        if meaningful_fields
        else "no_meaningful_confirmed_content"
    )
    return {
        "status": status,
        "meaningful_fields": meaningful_fields,
        "inspected_fields": inspected_fields,
        "reason": reason,
    }


def _read_input(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    return Path(path).read_text(encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Classify an OfferLoop user-profile Markdown document."
    )
    parser.add_argument(
        "--file",
        default="-",
        help="Markdown file to inspect, or - for stdin (default).",
    )
    args = parser.parse_args(argv)
    print(json.dumps(assess_profile(_read_input(args.file)), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
