#!/usr/bin/env python3
"""Measure bottom whitespace in a Resume Tailor one-page A4 PNG."""

from __future__ import annotations

import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit("缺少 Pillow。请使用当前 Agent 的文档运行时执行。") from exc


def bottom_whitespace_mm(path: Path) -> float:
    with Image.open(path) as opened:
        image = opened.convert("RGB")
    width, height = image.size
    if width <= 0 or height <= 0:
        raise ValueError("图片尺寸无效。")

    left = round(width * 13 / 210)
    right = round(width * (210 - 13) / 210)
    minimum_dark = max(12, round((right - left) * 0.002))
    last_content = -1

    for y in range(height):
        row = image.crop((left, y, right, y + 1))
        pixels = (
            row.get_flattened_data()
            if hasattr(row, "get_flattened_data")
            else row.getdata()
        )
        dark = sum(1 for red, green, blue in pixels if min(red, green, blue) < 235)
        if dark >= minimum_dark:
            last_content = y

    if last_content < 0:
        raise ValueError("未识别到正文内容。")
    return (height - 1 - last_content) * 297 / height


def main() -> int:
    parser = argparse.ArgumentParser(description="检查一页 A4 简历底部留白。")
    parser.add_argument("png", type=Path)
    parser.add_argument("--minimum-mm", type=float, default=10)
    parser.add_argument("--maximum-mm", type=float, default=20)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    if not args.png.is_file():
        raise FileNotFoundError(f"找不到 PNG: {args.png}")
    whitespace = bottom_whitespace_mm(args.png)
    print(f"底部留白: {whitespace:.1f} mm")
    in_range = args.minimum_mm <= whitespace <= args.maximum_mm
    if whitespace < args.minimum_mm:
        print("提示: 页面偏满，优先删减弱相关内容。")
    elif whitespace > args.maximum_mm:
        print("提示: 留白偏多，只补充已确认的高相关事实。")
    else:
        print("✓ 页面纵向密度处于建议范围")
    return 0 if in_range or not args.strict else 1


if __name__ == "__main__":
    raise SystemExit(main())
