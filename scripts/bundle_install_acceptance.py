#!/usr/bin/env python3
"""Build, extract, and cold-install the minimal OfferLoop bundle."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts" / "build_installer_bundle.py"
COLD_ACCEPTANCE = ROOT / "scripts" / "cold_install_acceptance.py"


def _load_builder():
    spec = importlib.util.spec_from_file_location(
        "offerloop_bundle_acceptance_builder", BUILDER
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("OfferLoop bundle builder is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="offerloop-bundle-acceptance-") as directory:
        root = Path(directory)
        result = _load_builder().build_bundle(root / "artifacts")
        archive_path = Path(result["archive"])
        actual_checksum = hashlib.sha256(archive_path.read_bytes()).hexdigest()
        if actual_checksum != result["sha256"]:
            raise AssertionError("bundle checksum does not match the build report")
        checksum_line = Path(result["checksum_file"]).read_text(encoding="ascii").strip()
        if checksum_line != f"{actual_checksum}  {archive_path.name}":
            raise AssertionError("bundle checksum file is invalid")

        extracted = root / "extracted"
        with zipfile.ZipFile(archive_path) as archive:
            for name in archive.namelist():
                relative = Path(name)
                if relative.is_absolute() or ".." in relative.parts:
                    raise AssertionError("bundle contains an unsafe archive path")
            archive.extractall(extracted)
        manifest = json.loads(Path(result["manifest"]).read_text(encoding="utf-8"))
        source = extracted / manifest["archive_root"]
        subprocess.run(
            [
                sys.executable,
                str(COLD_ACCEPTANCE),
                "--source",
                str(source),
            ],
            cwd=ROOT,
            check=True,
        )
        print(
            "bundle install accepted: deterministic manifest, SHA-256, safe extraction, "
            f"{result['compressed_bytes']} compressed bytes, and four-Agent cold install"
        )


if __name__ == "__main__":
    main()
