from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
import unittest


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "tencent_mcporter.py"
SPEC = importlib.util.spec_from_file_location("tencent_mcporter", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def configured_payload() -> str:
    return json.dumps(
        {
            "baseUrl": MODULE.EXPECTED_ENDPOINT,
            "headers": {"Authorization": "test-only-secret"},
            "source": {"path": "/tmp/mcporter.json"},
        }
    )


class TencentMcporterProbeTests(unittest.TestCase):
    def test_not_configured_is_distinct_from_network_failure(self):
        def runner(command, _timeout):
            self.assertEqual(command[1:4], ["config", "get", "tencent-docs"])
            return MODULE.CommandResult(returncode=1)

        result = MODULE.probe_connection(runner=runner, mcporter_path="mcporter")
        self.assertEqual(result["status"], "not_configured")
        self.assertFalse(result["configured"])

    def test_sandbox_dns_failure_keeps_configured_state(self):
        def runner(command, _timeout):
            if command[1] == "config":
                return MODULE.CommandResult(0, configured_payload())
            return MODULE.CommandResult(
                0,
                "tencent-docs\n  Tools: <timed out after 20000ms>",
                "fetch failed: getaddrinfo ENOTFOUND docs.qq.com",
            )

        result = MODULE.probe_connection(runner=runner, mcporter_path="mcporter")
        self.assertEqual(result["status"], "network_unavailable")
        self.assertTrue(result["configured"])
        self.assertTrue(result["retryable"])

    def test_ready_requires_all_read_tools(self):
        listing = "\n".join(MODULE.REQUIRED_READ_TOOLS)

        def runner(command, _timeout):
            if command[1] == "config":
                return MODULE.CommandResult(0, configured_payload())
            return MODULE.CommandResult(0, listing)

        result = MODULE.probe_connection(runner=runner, mcporter_path="mcporter")
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["missing_tools"], [])

    def test_reachable_server_can_report_missing_capability(self):
        def runner(command, _timeout):
            if command[1] == "config":
                return MODULE.CommandResult(0, configured_payload())
            return MODULE.CommandResult(0, "smartsheet.list_tables")

        result = MODULE.probe_connection(runner=runner, mcporter_path="mcporter")
        self.assertEqual(result["status"], "capability_missing")
        self.assertIn("smartsheet.list_records", result["missing_tools"])


if __name__ == "__main__":
    unittest.main()
