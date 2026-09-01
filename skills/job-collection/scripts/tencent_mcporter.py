#!/usr/bin/env python3
"""Safely probe the configured Tencent Docs MCP exposed through mcporter.

The probe deliberately never prints configuration headers or tool output.  It
distinguishes an absent configuration from a configured service that is merely
unreachable in the current sandbox/network context.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from dataclasses import dataclass
from typing import Callable, Sequence


SERVICE_NAME = "tencent-docs"
EXPECTED_ENDPOINT = "https://docs.qq.com/openapi/mcp"
REQUIRED_READ_TOOLS = (
    "smartsheet.list_tables",
    "smartsheet.list_views",
    "smartsheet.list_fields",
    "smartsheet.list_records",
)

NETWORK_MARKERS = (
    "enotfound",
    "fetch failed",
    "network",
    "offline",
    "timed out",
    "timeout",
    "econnreset",
    "econnrefused",
    "temporary failure in name resolution",
    "no such host",
)
AUTH_MARKERS = (
    "400006",
    "token_invalid",
    "authentication failed",
    "鉴权失败",
    "unauthorized",
)


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str = ""
    stderr: str = ""
    timed_out: bool = False


Runner = Callable[[Sequence[str], int], CommandResult]


def _run(command: Sequence[str], timeout_seconds: int) -> CommandResult:
    try:
        completed = subprocess.run(
            list(command),
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        return CommandResult(returncode=124, timed_out=True)
    return CommandResult(
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )


def _result(
    status: str,
    *,
    configured: bool,
    retryable: bool,
    reason: str,
    config_source: str = "",
    missing_tools: Sequence[str] = (),
) -> dict[str, object]:
    return {
        "status": status,
        "service": SERVICE_NAME,
        "configured": configured,
        "retryable": retryable,
        "reason": reason,
        "config_source": config_source,
        "required_tools": list(REQUIRED_READ_TOOLS),
        "missing_tools": list(missing_tools),
    }


def probe_connection(
    *,
    timeout_ms: int = 20_000,
    runner: Runner = _run,
    mcporter_path: str | None = None,
) -> dict[str, object]:
    """Return a secret-free connection diagnosis for the Tencent MCP."""

    if timeout_ms < 1_000:
        raise ValueError("timeout_ms must be at least 1000")
    binary = mcporter_path or shutil.which("mcporter")
    if not binary:
        return _result(
            "mcporter_missing",
            configured=False,
            retryable=False,
            reason="mcporter executable is not installed or not on PATH",
        )

    config = runner(
        [binary, "config", "get", SERVICE_NAME, "--json"],
        10,
    )
    if config.timed_out or config.returncode != 0:
        return _result(
            "not_configured",
            configured=False,
            retryable=False,
            reason="tencent-docs is absent from the mcporter home/project configuration",
        )
    try:
        payload = json.loads(config.stdout)
    except json.JSONDecodeError:
        return _result(
            "configuration_invalid",
            configured=False,
            retryable=False,
            reason="mcporter returned an unreadable tencent-docs configuration",
        )
    if not isinstance(payload, dict):
        return _result(
            "configuration_invalid",
            configured=False,
            retryable=False,
            reason="mcporter returned a non-object tencent-docs configuration",
        )

    base_url = str(payload.get("baseUrl", "") or "")
    source = payload.get("source")
    config_source = (
        str(source.get("path", "") or "") if isinstance(source, dict) else ""
    )
    headers = payload.get("headers")
    authorization = ""
    if isinstance(headers, dict):
        authorization = str(
            headers.get("Authorization", headers.get("authorization", "")) or ""
        ).strip()
    if base_url != EXPECTED_ENDPOINT or not authorization:
        return _result(
            "configuration_invalid",
            configured=False,
            retryable=False,
            reason="tencent-docs endpoint or Authorization header is missing/invalid",
            config_source=config_source,
        )

    discovery = runner(
        [binary, "list", SERVICE_NAME, "--timeout", str(timeout_ms)],
        max(10, timeout_ms // 1000 + 10),
    )
    combined = f"{discovery.stdout}\n{discovery.stderr}".lower()
    if discovery.timed_out or any(marker in combined for marker in NETWORK_MARKERS):
        return _result(
            "network_unavailable",
            configured=True,
            retryable=True,
            reason=(
                "tencent-docs is configured, but tool discovery could not reach "
                "the service in the current network/sandbox context"
            ),
            config_source=config_source,
        )
    if any(marker in combined for marker in AUTH_MARKERS):
        return _result(
            "credential_invalid",
            configured=True,
            retryable=False,
            reason="Tencent Docs rejected the configured credential",
            config_source=config_source,
        )
    if discovery.returncode != 0:
        return _result(
            "mcp_error",
            configured=True,
            retryable=True,
            reason="Tencent Docs MCP tool discovery failed without a safe detailed diagnosis",
            config_source=config_source,
        )

    missing = [tool for tool in REQUIRED_READ_TOOLS if tool not in discovery.stdout]
    if missing:
        return _result(
            "capability_missing",
            configured=True,
            retryable=False,
            reason="Tencent Docs MCP is reachable but required read tools are unavailable",
            config_source=config_source,
            missing_tools=missing,
        )
    return _result(
        "ready",
        configured=True,
        retryable=False,
        reason="Tencent Docs MCP and required SmartSheet read tools are available",
        config_source=config_source,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Probe Tencent Docs MCP without exposing credentials or tool schemas."
    )
    parser.add_argument("command", choices=("probe",))
    parser.add_argument("--timeout-ms", type=int, default=20_000)
    args = parser.parse_args()
    result = probe_connection(timeout_ms=args.timeout_ms)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return {
        "ready": 0,
        "not_configured": 2,
        "mcporter_missing": 2,
        "network_unavailable": 3,
        "credential_invalid": 4,
        "configuration_invalid": 4,
        "capability_missing": 5,
        "mcp_error": 6,
    }[str(result["status"])]


if __name__ == "__main__":
    raise SystemExit(main())
