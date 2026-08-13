#!/usr/bin/env python3
"""Overlay the bundled workbench template onto a bound Miaoda project."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil


CONTROL_FILE = "template.json"
ALWAYS_PROTECTED = {
    ".git",
    ".spark",
    ".spark_project",
    ".env",
    ".env.local",
    "node_modules",
    "dist",
    "logs",
}


def skill_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_manifest(template_root: Path) -> dict:
    path = template_root / CONTROL_FILE
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"invalid template manifest: {path}") from error
    if manifest.get("schema_version") != 1 or manifest.get("template_id") != "offerloop-workbench":
        raise ValueError(f"unsupported workbench template manifest: {path}")
    return manifest


def validate_destination(destination: Path) -> Path:
    destination = destination.expanduser().resolve()
    if not destination.is_dir():
        raise ValueError("destination must be an existing Miaoda project directory")
    binding = destination / ".spark" / "meta.json"
    if not binding.is_file():
        raise ValueError(
            "destination is not bound to a Miaoda app; initialize it before overlay"
        )
    try:
        metadata = json.loads(binding.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError("destination Miaoda binding is invalid") from error
    if not str(metadata.get("app_id", "")).strip():
        raise ValueError("destination Miaoda binding has no app_id")
    return destination


def iter_template_files(template_root: Path, protected: set[str]):
    for source in sorted(template_root.rglob("*")):
        if not source.is_file() or source.name == CONTROL_FILE:
            continue
        relative = source.relative_to(template_root)
        if relative.parts and relative.parts[0] in protected:
            continue
        if source.is_symlink():
            raise ValueError(f"template contains unsupported symlink: {relative}")
        yield source, relative


def materialize(destination: Path, dry_run: bool = False) -> dict:
    template_root = skill_root() / "assets" / "workbench-template"
    manifest = load_manifest(template_root)
    destination = validate_destination(destination)
    protected = ALWAYS_PROTECTED | set(manifest.get("protected_destination_paths", []))
    files = list(iter_template_files(template_root, protected))
    overwritten = sum((destination / relative).exists() for _, relative in files)
    if not dry_run:
        for source, relative in files:
            target = destination / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    return {
        "template_id": manifest["template_id"],
        "destination": str(destination),
        "files": len(files),
        "overwritten": overwritten,
        "dry_run": dry_run,
        "binding_preserved": True,
        "required_environment": manifest.get("required_environment", []),
        "optional_environment": manifest.get("optional_environment", []),
        "deployment_contract": manifest.get("deployment_contract", {}),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = materialize(args.destination, args.dry_run)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        mode = "would copy" if args.dry_run else "copied"
        print(f"{result['template_id']}: {mode} {result['files']} files")


if __name__ == "__main__":
    main()
