#!/usr/bin/env python3
"""Reject defensive attribution and generation-process meta language."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import NamedTuple


class ForbiddenPattern(NamedTuple):
    label: str
    pattern: str


FORBIDDEN_PATTERNS = [
    ForbiddenPattern(
        "责任排除声明",
        r"(?:不能|不应|不会|不宜)将.{0,40}归(?:为|入).{0,16}(?:本人|个人|我)",
    ),
    ForbiddenPattern(
        "责任排除声明",
        r"(?:不归(?:为|入)|不属于).{0,16}(?:本人|个人|我)",
    ),
    ForbiddenPattern(
        "底层实现免责声明",
        r"(?:底层|技术实现|平台能力).{0,24}(?:不归|不属于|不在).{0,24}(?:本人|个人|我)",
    ),
    ForbiddenPattern(
        "未参与事项声明",
        r"(?:我|本人).{0,12}(?:没有|并未|未).{0,20}(?:参与|负责).{0,20}"
        r"(?:底层|研发|算法|模型训练|技术实现)",
    ),
    ForbiddenPattern("事实边界元话语", r"现有事实只能确认"),
    ForbiddenPattern("事实边界元话语", r"(?:现有|项目)?结果只能支持"),
    ForbiddenPattern("事实边界元话语", r"不能进一步(?:声称|推断|判断)"),
    ForbiddenPattern("事实边界元话语", r"不能(?:直接证明|外推)"),
    ForbiddenPattern(
        "事实边界元话语",
        r"不对.{0,32}(?:作|做).{0,8}(?:推断|判断)",
    ),
    ForbiddenPattern(
        "防御性闭环声明",
        r"(?:不会|不能)把.{0,32}(?:描述|表述|包装)成",
    ),
    ForbiddenPattern(
        "防御性闭环声明",
        r"没有将.{0,40}表述为",
    ),
    ForbiddenPattern(
        "缺失应用证据声明",
        r"(?:目前|现在|现阶段)?(?:还)?没有.{0,24}(?:应用证据|形成应用证据)",
    ),
    ForbiddenPattern(
        "缺失应用证据声明",
        r"(?:还)?没有在其他.{0,24}(?:项目|经历).{0,24}(?:应用|验证)",
    ),
    ForbiddenPattern(
        "缺失修正动作声明",
        r"没有实际采取.{0,16}(?:修正|改进)动作",
    ),
    ForbiddenPattern(
        "缺失修正结果声明",
        r"没有.{0,12}(?:修正|改进)后的结果",
    ),
    ForbiddenPattern("缺失闭环声明", r"只完成了根因分析"),
    ForbiddenPattern(
        "缺失闭环声明",
        r"(?:工作|项目|复盘).{0,16}(?:停在|停留在|停在了).{0,16}根因分析",
    ),
    ForbiddenPattern(
        "缺失修正动作声明",
        r"没有.{0,16}(?:继续|实际).{0,16}(?:实施|采取|进行).{0,8}(?:修正|改进)动作",
    ),
    ForbiddenPattern(
        "缺失验证结果声明",
        r"还没有.{0,20}(?:上线|灰度|实验|应用).{0,16}(?:验证)?结果",
    ),
    ForbiddenPattern(
        "缺失应用证据声明",
        r"(?:这套方法|实际效果).{0,24}(?:仍|还)(?:需|需要|有待).{0,20}验证",
    ),
    ForbiddenPattern(
        "生成过程回执",
        r"已按.{0,40}(?:结构|模板).{0,16}(?:校验|检查)",
    ),
    ForbiddenPattern(
        "生成过程回执",
        r"(?:结构|格式).{0,16}(?:校验|检查)(?:通过|完成)",
    ),
    ForbiddenPattern(
        "生成过程回执",
        r"(?:底层|模型).{0,30}未写入(?:逐字稿|复原稿)",
    ),
    ForbiddenPattern(
        "保存状态回执",
        r"(?:内容)?(?:未|没有)保存到外部系统",
    ),
]


DETAIL_OUTSIDE_UNKNOWN_PATTERNS = [
    ForbiddenPattern(
        "成熟度否定枚举",
        r"(?:项目|本阶段).{0,24}(?:没有|未进入|未形成).{0,20}"
        r"(?:真实上线|真实业务|业务使用|业务用户|业务收益|业务数据)",
    ),
    ForbiddenPattern(
        "成熟度否定枚举",
        r"(?:项目|本阶段).{0,16}(?:停留|停在).{0,16}(?:原型|Demo)",
    ),
    ForbiddenPattern(
        "结果口径免责声明",
        r"(?:任务完成情况|测试结果|验证结果|这些观察|当前结论|本阶段.{0,8}结果)"
        r".{0,32}(?:只|仅)能(?:说明|支持|反映)",
    ),
    ForbiddenPattern("结果口径免责声明", r"不作为真实业务效果指标"),
    ForbiddenPattern("结果口径免责声明", r"不能替代对.{0,40}(?:评测|判断|检查|验证)"),
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


def validate_language(markdown: str, kind: str) -> list[str]:
    if kind not in {"detail", "interview"}:
        raise ValueError(f"unsupported document kind: {kind}")

    content = strip_fenced_code(markdown)
    errors: list[str] = []
    for rule in FORBIDDEN_PATTERNS:
        match = re.search(rule.pattern, content, flags=re.DOTALL)
        if not match:
            continue
        excerpt = re.sub(r"\s+", " ", match.group(0)).strip()
        errors.append(f"{rule.label}：{excerpt}")

    if kind == "detail":
        detail_body = re.split(
            r"(?m)^## 八、项目中当时未充分了解的细节\s*$", content, maxsplit=1
        )[0]
        for rule in DETAIL_OUTSIDE_UNKNOWN_PATTERNS:
            match = re.search(rule.pattern, detail_body, flags=re.DOTALL)
            if not match:
                continue
            excerpt = re.sub(r"\s+", " ", match.group(0)).strip()
            errors.append(f"{rule.label}：{excerpt}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="校验 experience-deepthink 成稿中的防御性表达和元话语"
    )
    parser.add_argument("--kind", choices=["detail", "interview"], required=True)
    parser.add_argument("markdown_file", type=Path)
    args = parser.parse_args()

    try:
        markdown = args.markdown_file.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"读取失败：{exc}", file=sys.stderr)
        return 2

    errors = validate_language(markdown, args.kind)
    if errors:
        for error in errors:
            print(f"[FAIL] {error}", file=sys.stderr)
        return 1

    print(f"[PASS] {args.kind} 成稿未发现防御性归责句或生成过程元话语")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
