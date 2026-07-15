#!/usr/bin/env python3
"""Manage non-secret OfferLoop locator config and initialize IMAP template."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import tempfile


SKILL_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = SKILL_ROOT.parent


def config_root(environ=None):
    source = dict(os.environ if environ is None else environ)
    return Path(source.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "offerloop"


def config_file(environ=None):
    return config_root(environ) / "config.json"


def load_config(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_private_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temporary = tempfile.mkstemp(prefix="offerloop-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def init_imap(environ=None):
    destination = config_root(environ) / "recruiting-reminder" / ".env"
    if destination.exists():
        return destination, False
    template = SKILLS_ROOT / "recruiting-reminder" / "scripts" / ".env.example"
    if not template.exists():
        raise FileNotFoundError(f"IMAP template not found: {template}")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copyfile(template, destination)
    os.chmod(destination, 0o600)
    return destination, True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", help="lark-cli profile name (not a secret)")
    parser.add_argument("--target-base-url", help="OfferLoop target Base URL")
    parser.add_argument("--init-imap", action="store_true")
    args = parser.parse_args()

    path = config_file()
    data = load_config(path)
    if args.profile:
        data["lark_profile"] = args.profile
    if args.target_base_url:
        data["target_base_url"] = args.target_base_url
    if args.profile or args.target_base_url:
        write_private_json(path, data)
        print(f"Updated {path}")
    if args.init_imap:
        destination, created = init_imap()
        action = "Created" if created else "Already exists"
        print(f"{action}: {destination}")
    if not (args.profile or args.target_base_url or args.init_imap):
        parser.print_help()


if __name__ == "__main__":
    main()
