#!/usr/bin/env python3
"""Build the deterministic, minimal OfferLoop public installer bundle."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
INSTALLER_PATH = ROOT / "scripts" / "install_offerloop.py"
MAX_COMPRESSED_BYTES = 2 * 1024 * 1024
FIXED_TIMESTAMP = (2020, 1, 1, 0, 0, 0)
TOP_LEVEL_FILES = (
    "VERSION",
    "README.md",
    "LICENSE",
    "MIGRATION.md",
    "SECURITY.md",
    "RELEASE_NOTES.md",
)
ENTRYPOINTS = (
    "scripts/install_offerloop.py",
    "scripts/setup_offerloop.py",
)


def _load_installer():
    spec = importlib.util.spec_from_file_location(
        "offerloop_bundle_installer", INSTALLER_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("OfferLoop installer is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _payload_files(installer):
    selected: dict[str, Path] = {}
    for relative in (*TOP_LEVEL_FILES, *ENTRYPOINTS):
        source = ROOT / relative
        if not source.is_file():
            raise ValueError(f"required bundle file is missing: {relative}")
        selected[relative] = source

    for name in installer.SKILL_NAMES:
        skill_root = ROOT / "skills" / name
        for source, relative in installer._included_files(skill_root):
            selected[(Path("skills") / name / relative).as_posix()] = source

    runtime_roots = (
        (ROOT / "runtime" / "offerloop" / "workspace", Path("runtime/offerloop/workspace")),
        (
            ROOT / "runtime" / "offerloop" / "admin" / "scripts",
            Path("runtime/offerloop/admin/scripts"),
        ),
        (
            ROOT / "runtime" / "offerloop" / "admin" / "references",
            Path("runtime/offerloop/admin/references"),
        ),
        (
            ROOT / "runtime" / "offerloop" / "admin" / "assets",
            Path("runtime/offerloop/admin/assets"),
        ),
    )
    for source_root, archive_root in runtime_roots:
        for source, relative in installer._included_files(source_root):
            selected[(archive_root / relative).as_posix()] = source
    return tuple(sorted(selected.items()))


def _file_entry(path: str, source: Path) -> dict:
    content = source.read_bytes()
    return {
        "path": path,
        "size": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }


def _zip_info(path: str, *, executable: bool = False) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(path, FIXED_TIMESTAMP)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = ((0o755 if executable else 0o644) & 0xFFFF) << 16
    return info


def build_bundle(output_dir: Path) -> dict:
    installer = _load_installer()
    version = installer.offerloop_version()
    archive_stem = f"OfferLoop-v{version}"
    archive_root = archive_stem
    output_dir.mkdir(parents=True, exist_ok=True)
    zip_path = output_dir / f"{archive_stem}.zip"
    manifest_path = output_dir / f"{archive_stem}.manifest.json"
    checksum_path = output_dir / f"{archive_stem}.zip.sha256"

    files = _payload_files(installer)
    entries = [_file_entry(path, source) for path, source in files]
    manifest = {
        "schema_version": 1,
        "offerloop_version": version,
        "archive_root": archive_root,
        "entry_count": len(entries),
        "entries": entries,
    }
    manifest_bytes = (
        json.dumps(manifest, ensure_ascii=True, indent=2, sort_keys=True) + "\n"
    ).encode("utf-8")

    with tempfile.NamedTemporaryFile(
        prefix=f".{archive_stem}-",
        suffix=".zip",
        dir=output_dir,
        delete=False,
    ) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(
            temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
        ) as archive:
            archive.writestr(
                _zip_info(f"{archive_root}/BUNDLE-MANIFEST.json"),
                manifest_bytes,
            )
            for relative, source in files:
                archive_path = f"{archive_root}/{relative}"
                executable = relative.startswith("scripts/") and relative.endswith(".py")
                archive.writestr(
                    _zip_info(archive_path, executable=executable),
                    source.read_bytes(),
                )
        size = temporary_path.stat().st_size
        if size > MAX_COMPRESSED_BYTES:
            raise ValueError(
                f"compressed installer bundle exceeds {MAX_COMPRESSED_BYTES} bytes"
            )
        checksum = hashlib.sha256(temporary_path.read_bytes()).hexdigest()
        temporary_path.replace(zip_path)
        zip_path.chmod(0o644)
        manifest_path.write_bytes(manifest_bytes)
        checksum_path.write_text(
            f"{checksum}  {zip_path.name}\n",
            encoding="ascii",
        )
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise

    return {
        "schema_version": 1,
        "status": "built",
        "offerloop_version": version,
        "archive": str(zip_path),
        "manifest": str(manifest_path),
        "checksum_file": str(checksum_path),
        "sha256": checksum,
        "compressed_bytes": size,
        "max_compressed_bytes": MAX_COMPRESSED_BYTES,
        "entry_count": len(entries),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args(argv)
    result = build_bundle(args.output_dir)
    if args.as_json:
        print(json.dumps(result, ensure_ascii=True, indent=2))
    else:
        print(
            f"Built {Path(result['archive']).name}: "
            f"{result['compressed_bytes']} bytes, SHA-256 {result['sha256']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
