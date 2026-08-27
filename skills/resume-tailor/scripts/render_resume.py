#!/usr/bin/env python3
"""Prepare an editable ASu resume HTML copy and export that same file to PDF."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
MOTHER_TEMPLATE = SKILL_ROOT / "assets" / "asu-resume-template.html"
GENERIC_ASSET_DIRS = ("icons", "logos")
MODULES = {
    "education": "教育经历",
    "experience": "实习经历",
    "projects": "项目经历",
    "self_evaluation": "个人技能与自我评价",
}
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}


def parse_modules(raw: str) -> list[str]:
    modules = [item.strip() for item in raw.split(",") if item.strip()]
    unknown = [item for item in modules if item not in MODULES]
    if unknown:
        raise ValueError(f"未知模块：{', '.join(unknown)}；可选：{', '.join(MODULES)}")
    if not modules:
        raise ValueError("至少选择一个简历模块")
    if len(modules) != len(set(modules)):
        raise ValueError("模块不能重复")
    return modules


def safe_asset_name(alias: str, source: Path) -> str:
    clean_alias = re.sub(r"[^A-Za-z0-9._-]+", "-", alias).strip("-.") or "asset"
    digest = hashlib.sha256(source.read_bytes()).hexdigest()[:10]
    suffix = source.suffix.lower() or mimetypes.guess_extension(mimetypes.guess_type(source.name)[0] or "") or ".img"
    return f"{clean_alias}-{digest}{suffix}"


def copy_user_asset(spec: str, assets_dir: Path) -> tuple[str, str]:
    if "=" not in spec:
        raise ValueError(f"素材参数必须是 名称=路径：{spec}")
    alias, raw_path = spec.split("=", 1)
    source = Path(raw_path).expanduser().resolve()
    if not source.is_file():
        raise ValueError(f"素材不存在：{raw_path}")
    mime = mimetypes.guess_type(source.name)[0]
    if mime not in IMAGE_MIMES:
        raise ValueError(f"不支持的图片格式：{source.name}")
    assets_dir.mkdir(parents=True, exist_ok=True)
    name = safe_asset_name(alias, source)
    target = assets_dir / name
    if not target.exists():
        shutil.copy2(source, target)
    return alias, f"assets/{name}"


def copy_generic_assets(output_dir: Path) -> None:
    for dirname in GENERIC_ASSET_DIRS:
        source = SKILL_ROOT / "assets" / dirname
        target = output_dir / dirname
        shutil.copytree(source, target, dirs_exist_ok=True)


def placeholder_section(module: str) -> str:
    title = MODULES[module]
    if module == "education":
        body = """      <div class=\"company\">
        <img class=\"company-logo school-logo\" src=\"icons/graduation-cap.svg\" alt=\"学校 Logo 占位图标\">
        <div class=\"company-name education-name\">【学校】<span class=\"education-major\">· 【专业】 · 【学历】</span></div>
        <div class=\"company-meta\">【起止时间】</div>
      </div>"""
    elif module == "experience":
        body = """      <div class=\"company\">
        <div class=\"company-name\">【公司 · 部门 · 职位】</div>
        <div class=\"company-meta\">【起止时间】</div>
      </div>
      <div class=\"role-summary\"><strong>岗位职责：</strong>【用一句话概括所在业务、主要负责方向和工作范围】</div>
      <article class=\"project\">
        <div class=\"project-title\">【项目名称】　|　【一句话产品定位】</div>
        <ul>
          <li><strong>背景与目标：</strong>【待填写】</li>
          <li><strong>核心判断与动作：</strong>【待填写；不得超过逐字稿与细节复原稿支持的作用域】</li>
          <li><strong>验证与结果：</strong>【待填写；没有可靠指标时不虚构】</li>
        </ul>
      </article>"""
    elif module == "projects":
        body = """      <div class=\"company\">
        <div class=\"company-name\">【项目 / 产品 · 个人角色】</div>
        <div class=\"company-meta\">【起止时间】</div>
      </div>
      <article class=\"project\">
        <div class=\"project-title\">【项目名称】　|　【一句话产品定位】</div>
        <ul>
          <li><strong>背景与目标：</strong>【待填写】</li>
          <li><strong>产品设计与关键动作：</strong>【待填写；不得超过逐字稿与细节复原稿支持的作用域】</li>
          <li><strong>验证与结果：</strong>【待填写；没有可靠指标时不虚构】</li>
        </ul>
      </article>"""
    else:
        body = """      <ul>
        <li><strong class="skill-label">专业技能：</strong>【只填写有事实依据的工具、方法、语言或证书】</li>
        <li><strong class="skill-label">自我评价：</strong>【用具体经历或行为证据说明，避免空泛形容词】</li>
      </ul>"""
    return f'    <section class="section" data-resume-module="{module}">\n      <h2 class="section-title">{title}</h2>\n{body}\n    </section>'


def header_markup(photo_src: str | None) -> str:
    if photo_src:
        photo = (
            f'<img class="profile-photo" src="{html.escape(photo_src, quote=True)}" alt="证件照">\n'
            '        <input class="photo-input" type="file" accept="image/*" aria-label="选择证件照">'
        )
        slot_class = "profile-photo-slot has-photo"
    else:
        photo = (
            '<span class="photo-placeholder">证件照<br>预留位置</span>\n'
            '        <input class="photo-input" type="file" accept="image/*" aria-label="选择证件照">'
        )
        slot_class = "profile-photo-slot"
    return f"""    <header class=\"header-grid\">
      <div>
        <h1>【姓名】</h1>
        <div class=\"meta-row\"><img class=\"meta-icon\" src=\"icons/phone.svg\" alt=\"电话图标\"><span>【电话】</span><span class=\"separator\">|</span><img class=\"meta-icon\" src=\"icons/envelope.svg\" alt=\"邮箱图标\"><span>【邮箱】</span><span class=\"separator\">|</span><img class=\"meta-icon\" src=\"icons/wechat.svg\" alt=\"微信图标\"><span>【微信 / 主页】</span></div>
        <div class=\"meta-row\"><img class=\"meta-icon\" src=\"icons/user.svg\" alt=\"身份图标\"><strong>【身份 · 目标岗位 · 核心方向 · 到岗时间】</strong></div>
        <div class=\"meta-row\"><img class=\"meta-icon\" src=\"logos/github.svg\" alt=\"GitHub 图标\"><strong>【GitHub / 作品集 / 论文 / 开源贡献】</strong></div>
      </div>
      <div class=\"{slot_class}\" contenteditable=\"false\" role=\"button\" tabindex=\"0\" aria-label=\"选择或替换证件照\">
        {photo}
      </div>
    </header>"""


def replace_sheets(template: str, modules: list[str], photo_src: str | None) -> str:
    first_main = template.find('<main class="sheet" contenteditable="true">')
    script_start = template.find("  <script>", first_main)
    if first_main < 0 or script_start < 0:
        raise ValueError("上游母版结构异常：未找到可编辑页面或脚本")
    before = template[:first_main]
    after = template[script_start:]
    sections = "\n\n".join(placeholder_section(module) for module in modules)
    selected = ",".join(modules)
    marker = f'  <meta name="offerloop-resume-version" content="2.0.0">\n  <meta name="offerloop-resume-modules" content="{selected}">\n'
    before = before.replace("</head>", marker + "</head>")
    sheet = f'<main class="sheet" contenteditable="true">\n{header_markup(photo_src)}\n\n{sections}\n  </main>\n\n'
    return before + sheet + after


def prepare_html(args: argparse.Namespace) -> None:
    modules = parse_modules(args.modules)
    output = args.html.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    copy_generic_assets(output.parent)
    assets_dir = output.parent / "assets"
    manifest: dict[str, str] = {}
    for spec in args.asset or []:
        alias, relative = copy_user_asset(spec, assets_dir)
        manifest[alias] = relative
    photo_src = None
    if args.photo:
        alias, photo_src = copy_user_asset(f"profile-photo={args.photo}", assets_dir)
        manifest[alias] = photo_src
    rendered = replace_sheets(MOTHER_TEMPLATE.read_text(encoding="utf-8"), modules, photo_src)
    output.write_text(rendered, encoding="utf-8")
    if manifest:
        (assets_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(f"已生成 ASu 可编辑 HTML：{output}")
    print(f"已选择模块：{', '.join(MODULES[item] for item in modules)}")
    if manifest:
        print(f"用户素材已保存：{assets_dir}")


def find_chrome(explicit: Path | None = None) -> Path:
    candidates = [
        str(explicit) if explicit else None,
        os.environ.get("CHROME_PATH"),
        shutil.which("google-chrome"),
        shutil.which("chromium"),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    raise FileNotFoundError("未找到 Chrome/Chromium/Edge；可通过 --chrome 或 CHROME_PATH 指定")


def export_pdf(args: argparse.Namespace) -> None:
    html_path = args.html.expanduser().resolve()
    pdf_path = args.pdf.expanduser().resolve()
    if not html_path.is_file():
        raise FileNotFoundError(f"HTML 不存在：{html_path}")
    pdf_path.parent.mkdir(parents=True, exist_ok=True)
    chrome = find_chrome(args.chrome)
    with tempfile.TemporaryDirectory(prefix="asu-resume-chrome-") as profile_dir:
        command = [
            str(chrome), "--headless=new", "--disable-gpu", "--disable-extensions",
            "--hide-scrollbars", "--no-first-run", "--no-pdf-header-footer",
            "--run-all-compositor-stages-before-draw", "--virtual-time-budget=1800",
            f"--user-data-dir={profile_dir}", f"--print-to-pdf={pdf_path}", html_path.as_uri(),
        ]
        completed = subprocess.run(command, text=True, capture_output=True, check=False)
    if completed.returncode != 0 or not pdf_path.is_file():
        detail = (completed.stderr or completed.stdout).strip()[-1200:]
        raise RuntimeError(f"Chrome 导出 PDF 失败：{detail}")
    print(f"已从同一 HTML 导出 PDF：{pdf_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OfferLoop ASu 简历 HTML/PDF 工具")
    subparsers = parser.add_subparsers(dest="command", required=True)
    prepare = subparsers.add_parser("prepare", help="从只读母版生成用户专属可编辑 HTML")
    prepare.add_argument("--html", required=True, type=Path)
    prepare.add_argument("--modules", required=True, help=f"逗号分隔：{','.join(MODULES)}")
    prepare.add_argument("--photo", type=Path, help="用户证件照；复制到输出目录 assets/")
    prepare.add_argument("--asset", action="append", help="附加素材，格式 名称=/absolute/path，可重复")
    export = subparsers.add_parser("export", help="从已经确认的同一 HTML 导出 PDF")
    export.add_argument("--html", required=True, type=Path)
    export.add_argument("--pdf", required=True, type=Path)
    export.add_argument("--chrome", type=Path)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    try:
        prepare_html(args) if args.command == "prepare" else export_pdf(args)
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
