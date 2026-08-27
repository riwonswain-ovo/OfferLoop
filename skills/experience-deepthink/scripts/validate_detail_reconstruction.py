#!/usr/bin/env python3
"""Validate the fixed v2 detail-reconstruction Markdown structure."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


EXPECTED_SECTIONS = [
    "一、项目概述",
    "二、项目背景与优化方向",
    "三、项目目标与数据指标",
    "四、方案及动作",
    "五、验证与结果",
    "六、项目未来的优化方向",
    "七、在这个项目中的收获",
    "八、项目中当时未充分了解的细节",
]


def strip_fenced_code(markdown: str) -> str:
    lines: list[str] = []
    in_fence = False
    fence_marker = ""
    for line in markdown.splitlines():
        stripped = line.lstrip()
        if not in_fence and (stripped.startswith("```") or stripped.startswith("~~~")):
            in_fence = True
            fence_marker = stripped[:3]
            continue
        if in_fence and stripped.startswith(fence_marker):
            in_fence = False
            fence_marker = ""
            continue
        if not in_fence:
            lines.append(line)
    return "\n".join(lines)


def validate_markdown(markdown: str) -> list[str]:
    content = strip_fenced_code(markdown)
    errors: list[str] = []

    h1 = re.findall(r"^#\s+(.+?)\s*$", content, flags=re.MULTILINE)
    if len(h1) != 1:
        errors.append(f"应只有一个一级标题，实际为 {len(h1)} 个")
    elif not h1[0].startswith("细节复原稿｜"):
        errors.append("一级标题必须以“细节复原稿｜”开头")

    h2 = re.findall(r"^##\s+(.+?)\s*$", content, flags=re.MULTILINE)
    if h2 != EXPECTED_SECTIONS:
        errors.append(
            "二级章节必须严格按固定八章排列：\n- " + "\n- ".join(EXPECTED_SECTIONS)
        )

    if re.search(r"<[^>\n]+>", content):
        errors.append("文档中仍有未替换的尖括号模板占位符")

    if re.search(r"^\s*\.\.\.\s*$", content, flags=re.MULTILINE):
        errors.append("文档中仍有未删除的省略号模板占位符")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="校验 experience-deepthink v2 细节复原稿的固定八章结构"
    )
    parser.add_argument("markdown_file", type=Path)
    args = parser.parse_args()

    try:
        markdown = args.markdown_file.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"读取失败：{exc}", file=sys.stderr)
        return 2

    errors = validate_markdown(markdown)
    if errors:
        for error in errors:
            print(f"[FAIL] {error}", file=sys.stderr)
        return 1

    print("[PASS] 细节复原稿结构符合 v2.0.0 固定八章规范")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
