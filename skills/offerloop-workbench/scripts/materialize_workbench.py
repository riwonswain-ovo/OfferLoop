#!/usr/bin/env python3
"""Reject deployment of the retired OfferLoop workbench snapshot."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


RETIRED_MESSAGE = (
    "the legacy OfferLoop workbench was retired on 2026-08-17; "
    "its template is a frozen source snapshot and cannot be deployed"
)


def materialize(destination: Path, dry_run: bool = False) -> dict:
    del destination, dry_run
    raise RuntimeError(RETIRED_MESSAGE)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    del args.json
    try:
        materialize(args.destination, args.dry_run)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(2) from error


if __name__ == "__main__":
    main()
