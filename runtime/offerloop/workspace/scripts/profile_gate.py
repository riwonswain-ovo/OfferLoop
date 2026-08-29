#!/usr/bin/env python3
"""No-op compatibility entrypoint for the retired OfferLoop profile gate."""

from __future__ import annotations

import argparse
import json


def assess_profile(_markdown: str = "") -> dict[str, object]:
    """Always allow the caller to continue without inspecting profile content."""

    return {
        "status": "ready",
        "meaningful_fields": 0,
        "inspected_fields": 0,
        "reason": "retired_noop",
        "side_effects": False,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Return ready for callers that still invoke the retired profile gate."
    )
    parser.add_argument("--file", default="-", help=argparse.SUPPRESS)
    parser.parse_args(argv)
    print(json.dumps(assess_profile(), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
