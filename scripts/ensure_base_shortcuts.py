#!/usr/bin/env python3
"""Create idempotent Wiki shortcut pages for the three existing OfferLoop Bases."""

from __future__ import annotations

import argparse
from html import escape
import json
from pathlib import Path
import subprocess


SHORTCUTS = (
    ("企业清单", "target_base_url", "招聘机会事实源"),
    ("求职进展", "progress_base_url", "投递与流程状态事实源"),
    ("笔面试中心", "reminder_base_url", "待完成和已完成事件事实源"),
)


def config_path() -> Path:
    return Path.home() / ".config" / "offerloop" / "config.json"


def call(args: list[str]) -> dict:
    completed = subprocess.run(args, text=True, capture_output=True, check=False)
    raw = completed.stdout or completed.stderr
    start = raw.find("{")
    body = json.loads(raw[start:]) if start >= 0 else {"ok": False}
    body.pop("_notice", None)
    if completed.returncode:
        raise RuntimeError(body.get("error", {}).get("message", "lark-cli failed"))
    return body


def ensure(config: dict) -> list[dict]:
    profile = str(config["lark_profile"])
    space_id = str(config["wiki_space_id"])
    parent = str(config["workspace_core_data_node_token"])
    listed = call(
        [
            "lark-cli",
            "wiki",
            "+node-list",
            "--space-id",
            space_id,
            "--parent-node-token",
            parent,
            "--page-all",
            "--page-limit",
            "0",
            "--profile",
            profile,
            "--as",
            "user",
        ]
    )
    existing = {
        node["title"]: node
        for node in listed.get("data", {}).get("nodes", [])
    }
    results = []
    for title, config_key, purpose in SHORTCUTS:
        node = existing.get(title)
        status = "already_exists"
        if node is None:
            created = call(
                [
                    "lark-cli",
                    "wiki",
                    "+node-create",
                    "--space-id",
                    space_id,
                    "--parent-node-token",
                    parent,
                    "--title",
                    title,
                    "--obj-type",
                    "docx",
                    "--profile",
                    profile,
                    "--as",
                    "user",
                ]
            )
            node = created.get("data", {}).get("node") or created.get("data", {})
            status = "created"
        url = str(config[config_key])
        content = (
            f"<title>{title}</title><p>{purpose}。该页面只提供固定入口，"
            "数据仍保存在原 Base 对象中，不复制记录。</p>"
            f'<p><button action="OpenLink" src="{escape(url, quote=True)}">'
            f"打开{title}</button></p>"
            f'<bookmark name="{title}" href="{escape(url, quote=True)}"></bookmark>'
        )
        call(
            [
                "lark-cli",
                "docs",
                "+update",
                "--doc",
                str(node["obj_token"]),
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
        results.append(
            {
                "title": title,
                "status": status,
                "url": f"https://my.feishu.cn/wiki/{node['node_token']}",
            }
        )
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=config_path())
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding="utf-8"))
    result = {
        "ready": all(str(config.get(key, "")).startswith("https://") for _, key, _ in SHORTCUTS),
        "apply": args.apply,
        "shortcuts": ensure(config) if args.apply else [],
    }
    print(json.dumps(result, ensure_ascii=False) if args.json else "OfferLoop Base shortcuts ready")
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
