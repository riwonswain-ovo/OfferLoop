#!/usr/bin/env python3
"""Resolve the complete OfferLoop Feishu workspace mode without network access."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def config_file(environ=None) -> Path:
    source = dict(os.environ if environ is None else environ)
    home = Path(source.get("HOME", Path.home()))
    root = Path(source.get("XDG_CONFIG_HOME", home / ".config"))
    return root / "offerloop" / "config.json"


def resolve_mode(path: Path | None = None, environ=None) -> dict:
    target = path or config_file(environ)
    try:
        config = json.loads(target.read_text(encoding="utf-8"))
    except FileNotFoundError:
        config = {}
    except (OSError, json.JSONDecodeError):
        config = {}

    installation = config.get("installation")
    if isinstance(installation, dict):
        mode = installation.get("mode")
        skills = installation.get("selected_skills", [])
    else:
        mode = config.get("install_mode")
        skills = config.get("selected_skills", [])
    source = "config" if mode == "full" else "legacy_requires_full_setup"
    result = {
        "mode": "full",
        "source": source,
        "artifact_storage": "feishu_default",
        "migration_required": mode != "full",
    }
    if isinstance(skills, list):
        result["selected_skills"] = [str(item) for item in skills]
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path)
    args = parser.parse_args(argv)
    print(json.dumps(resolve_mode(args.config), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
