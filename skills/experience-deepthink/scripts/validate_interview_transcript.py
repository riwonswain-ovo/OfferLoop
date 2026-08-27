#!/usr/bin/env python3
"""Validate the fixed v2 interview-transcript Markdown structure."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


EXPECTED_QUESTIONS = [
    "一、请介绍一下这个项目",
    "二、请讲一个项目中遇到的失败",
    "三、请讲一个项目中遇到的困难",
    "四、请讲一个你在项目中做出的核心决策",
    "五、请讲讲你在项目中如何进行跨团队协作",
    "六、如果重来一次，你最想改进什么",
    "七、这个项目未来还有哪些优化方向",
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
    elif not h1[0].startswith("面试逐字稿｜"):
        errors.append("一级标题必须以“面试逐字稿｜”开头")

    h2 = re.findall(r"^##\s+(.+?)\s*$", content, flags=re.MULTILINE)
    if h2 != EXPECTED_QUESTIONS:
        errors.append(
            "二级标题必须严格按固定七题排列：\n- "
            + "\n- ".join(EXPECTED_QUESTIONS)
        )

    if re.search(r"<[^>\n]+>", content):
        errors.append("文档中仍有未替换的尖括号模板占位符")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="校验 experience-deepthink v2 面试逐字稿的固定七题结构"
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

    print("[PASS] 面试逐字稿结构符合 v2.0.0 固定七题规范")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
