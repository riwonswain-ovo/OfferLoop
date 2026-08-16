#!/usr/bin/env python3
"""Render the schema-v6 OfferLoop guide into the configured Feishu homepage."""

from __future__ import annotations

import argparse
from html import escape
import json
from pathlib import Path
import subprocess


SKILLS = (
    ("career-profile", "建立并持续校准用户画像"),
    ("job-collection", "岗位收集、筛选与边缘候选确认"),
    ("recruiting-reminder", "招聘邮件识别与笔面试事件管理"),
    ("experience-deepthink", "经历复原、深挖和证据整理"),
    ("resume-tailor", "生成岗位定制简历"),
    ("competency-lab", "岗位能力抽象、差距诊断和专项训练"),
    ("interview-prep", "真实面试准备"),
    ("mock-lab", "模拟面试和逐题训练"),
    ("talk-review", "真实面试 ASR 拆解与复盘"),
)

DIRECTORIES = (
    ("01｜核心求职数据", "workspace_core_data_node_token", "三张 Base 的固定入口"),
    ("02｜用户画像", "user_profile", "确认后的偏好、能力证据和表达风格"),
    ("03｜定制简历", "current_resumes", "岗位定制简历"),
    ("04｜经历深挖", "experience_deepthink", "细节复原稿与经历面试稿"),
    ("05｜岗位能力与训练", "competency_training", "岗位能力画像与专项训练"),
    ("06｜面试准备", "interview_prep", "公司、岗位与轮次准备材料"),
    ("07｜模拟面试", "mock_lab", "模拟记录、点评和能力观察"),
    ("08｜真实面试复盘", "interview_review", "ASR 待复盘与已完成复盘"),
)


def config_path() -> Path:
    return Path.home() / ".config" / "offerloop" / "config.json"


def load_config(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema_version") != 6:
        raise ValueError("OfferLoop config must be migrated to schema v6 first")
    return data


def _wiki_url(token: str) -> str:
    return f"https://my.feishu.cn/wiki/{escape(token, quote=True)}"


def render(config: dict) -> str:
    storage = config.get("artifact_storage", {}).get("folders", {})
    locators = dict(storage)
    locators["workspace_core_data_node_token"] = config.get(
        "workspace_core_data_node_token", ""
    )
    rows = []
    for title, key, purpose in DIRECTORIES:
        token = str(locators.get(key, "")).strip()
        if not token:
            raise ValueError(f"missing directory locator: {key}")
        rows.append(
            f'<tr><td><a href="{_wiki_url(token)}">{title}</a></td>'
            f"<td>{purpose}</td></tr>"
        )
    skill_rows = "".join(
        f"<tr><td>{name}</td><td>{purpose}</td></tr>"
        for name, purpose in SKILLS
    )
    base_links = (
        ("企业清单", "target_base_url"),
        ("求职进展", "progress_base_url"),
        ("笔面试中心", "reminder_base_url"),
    )
    buttons = []
    for label, key in base_links:
        url = str(config.get(key, "")).strip()
        if not url.startswith("https://"):
            raise ValueError(f"missing or unsafe Base URL: {key}")
        buttons.append(
            f'<p><button action="OpenLink" src="{escape(url, quote=True)}">'
            f"{label}</button></p>"
        )
    return (
        "<title>00｜OfferLoop 使用指南</title>"
        "<p>OfferLoop 用三张 Base 保存求职事实，用本私有知识库保存画像、简历、经历、训练与复盘。</p>"
        '<callout emoji="📌" background-color="light-blue" border-color="blue">'
        "<p><b>三个固定数据入口</b></p>"
        + "".join(buttons)
        + "</callout>"
        "<h2>三条闭环</h2><ol>"
        '<li seq="auto"><b>招聘机会闭环：</b>硬条件过滤，岗位软偏离先确认，再去重写入。</li>'
        '<li seq="auto"><b>求职进展闭环：</b>邀请只创建待完成事件；确认完成后才推进。</li>'
        '<li seq="auto"><b>能力成长闭环：</b>面试形成待验证观察，专项训练后再模拟复测。</li>'
        "</ol><h2>固定知识库目录</h2>"
        "<table><thead><tr><th>入口</th><th>保存内容</th></tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table><h2>9 个长期 Skill</h2>"
        "<table><thead><tr><th>Skill</th><th>作用</th></tr></thead><tbody>"
        + skill_rows
        + "</tbody></table><h2>进展维护规则</h2>"
        "<p>“进展状态”是当前状态唯一真源；“最近完成节点”只记录已经可靠完成的最晚节点。"
        "收到邀请不等于完成；旧记录无法判断时进入“状态待确认”，不自行猜测。</p>"
    )


def call_cli(args: list[str]) -> dict:
    completed = subprocess.run(args, text=True, capture_output=True, check=False)
    raw = completed.stdout or completed.stderr
    start = raw.find("{")
    payload = json.loads(raw[start:]) if start >= 0 else {"ok": False}
    payload.pop("_notice", None)
    if completed.returncode:
        raise RuntimeError(payload.get("error", {}).get("message", "lark-cli failed"))
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=config_path())
    parser.add_argument(
        "--profile",
        help="override the configured lark-cli profile for this document update",
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    config = load_config(args.config)
    profile = args.profile or str(config["lark_profile"])
    content = render(config)
    result = {
        "ready": True,
        "apply": args.apply,
        "skill_count": len(SKILLS),
        "directory_count": len(DIRECTORIES),
    }
    if args.apply:
        call_cli(
            [
                "lark-cli",
                "docs",
                "+update",
                "--doc",
                str(config["workspace_home_node_token"]),
                "--command",
                "overwrite",
                "--content",
                content,
                "--profile",
                profile,
                "--as",
                "user",
            ]
        )
        fetched = call_cli(
            [
                "lark-cli",
                "docs",
                "+fetch",
                "--doc",
                str(config["workspace_home_node_token"]),
                "--detail",
                "simple",
                "--profile",
                profile,
                "--as",
                "user",
            ]
        )
        body = fetched.get("data", {}).get("document", {}).get("content", "")
        result["verified"] = all(
            marker in body
            for marker in ("9 个长期 Skill", "三条闭环", "进展状态")
        )
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    else:
        print("OfferLoop homepage ready" if not args.apply else "OfferLoop homepage updated")
    return 0 if result.get("verified", True) else 1


if __name__ == "__main__":
    raise SystemExit(main())
