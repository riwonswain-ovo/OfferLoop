#!/usr/bin/env python3
"""Read-only OfferLoop first-run checks."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = SKILL_ROOT.parent


def config_root(environ=None):
    source = dict(os.environ if environ is None else environ)
    return Path(source.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "offerloop"


def state_root(environ=None):
    source = dict(os.environ if environ is None else environ)
    return Path(source.get("XDG_STATE_HOME", Path.home() / ".local" / "state")) / "offerloop"


def run_checks(environ=None):
    source = dict(os.environ if environ is None else environ)
    root = config_root(source)
    skills = {
        name: (SKILLS_ROOT / name / "SKILL.md").is_file()
        for name in ("offerloop-setup", "job-collection", "recruiting-reminder")
    }
    public_config = root / "config.json"
    imap_config = root / "recruiting-reminder" / ".env"
    legacy_imap = SKILLS_ROOT / "recruiting-reminder" / "scripts" / ".env"
    return {
        "python": {
            "ok": sys.version_info >= (3, 10),
            "version": ".".join(map(str, sys.version_info[:3])),
            "required": ">=3.10",
        },
        "lark_cli": {"ok": shutil.which("lark-cli") is not None},
        "skills": skills,
        "offerloop_config": {"ok": public_config.is_file(), "path": str(public_config)},
        "imap_config": {
            "ok": imap_config.is_file() or legacy_imap.is_file(),
            "path": str(imap_config),
            "legacy_detected": legacy_imap.is_file(),
        },
        "state_directory": str(state_root(source) / "recruiting-reminder"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = run_checks()
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for name, value in result.items():
            print(f"{name}: {value}")


if __name__ == "__main__":
    main()
