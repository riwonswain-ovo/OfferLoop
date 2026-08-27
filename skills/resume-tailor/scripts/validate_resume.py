#!/usr/bin/env python3
"""Validate an OfferLoop ASu resume HTML/PDF bundle."""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse


ALLOWED_MODULES = {"education", "experience", "projects", "self_evaluation"}


class ResumeHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sources: list[str] = []
        self.sheet_count = 0
        self.has_photo_slot = False
        self.has_toolbar = False
        self.modules: list[str] = []
        self.version: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = set((values.get("class") or "").split())
        if tag == "main" and "sheet" in classes:
            self.sheet_count += 1
        if "profile-photo-slot" in classes:
            self.has_photo_slot = True
        if "toolbar" in classes:
            self.has_toolbar = True
        if values.get("data-resume-module"):
            self.modules.append(values["data-resume-module"] or "")
        if tag == "meta" and values.get("name") == "offerloop-resume-version":
            self.version = values.get("content")
        if tag in {"img", "script"} and values.get("src"):
            self.sources.append(values["src"] or "")
        if tag == "link" and values.get("href"):
            self.sources.append(values["href"] or "")


def validate_html(path: Path) -> list[str]:
    if not path.is_file():
        return [f"HTML 不存在：{path}"]
    errors: list[str] = []
    parser = ResumeHTMLParser()
    parser.feed(path.read_text(encoding="utf-8"))
    if parser.version != "2.0.0":
        errors.append("HTML 缺少 OfferLoop resume-tailor v2.0.0 标记")
    if parser.sheet_count != 1:
        errors.append(f"HTML 必须只有 1 个连续 .sheet，交由浏览器自然分页；当前为 {parser.sheet_count}")
    if not parser.has_photo_slot:
        errors.append("HTML 缺少右上角证件照预留位")
    if not parser.has_toolbar:
        errors.append("HTML 缺少 ASu 编辑工具栏")
    unknown = sorted(set(parser.modules) - ALLOWED_MODULES)
    if unknown:
        errors.append(f"HTML 含未知模块：{', '.join(unknown)}")
    if not parser.modules:
        errors.append("HTML 未声明任何用户选择模块")
    for source in parser.sources:
        parsed = urlparse(source)
        if parsed.scheme in {"http", "https", "data"} or source.startswith("#"):
            continue
        target = (path.parent / unquote(parsed.path)).resolve()
        if not target.is_file():
            errors.append(f"HTML 引用的本地素材不存在：{source}")
    return errors


def pdf_page_count(path: Path) -> int | None:
    try:
        from pypdf import PdfReader  # type: ignore

        return len(PdfReader(str(path)).pages)
    except Exception:  # optional parser failures fall back to pdfinfo
        pass
    pdfinfo = shutil.which("pdfinfo")
    if pdfinfo:
        completed = subprocess.run([pdfinfo, str(path)], text=True, capture_output=True, check=False)
        match = re.search(r"^Pages:\s+(\d+)", completed.stdout, re.MULTILINE)
        if match:
            return int(match.group(1))
    return None


def validate_pdf(path: Path) -> list[str]:
    if not path.is_file():
        return [f"PDF 不存在：{path}"]
    errors: list[str] = []
    if path.read_bytes()[:5] != b"%PDF-":
        errors.append("文件不是有效 PDF")
    pages = pdf_page_count(path)
    if pages is None:
        errors.append("无法读取 PDF 页数；请安装 pypdf 或 pdfinfo")
    elif not 1 <= pages <= 2:
        errors.append(f"PDF 最多两页，当前为 {pages} 页")
    return errors


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="校验 ASu 简历 HTML/PDF")
    parser.add_argument("--html", required=True, type=Path)
    parser.add_argument("--pdf", type=Path)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    errors = validate_html(args.html.expanduser().resolve())
    if args.pdf:
        errors.extend(validate_pdf(args.pdf.expanduser().resolve()))
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
    print("校验通过：ASu v2 HTML 结构、素材引用与 1–2 页约束有效")


if __name__ == "__main__":
    main()
