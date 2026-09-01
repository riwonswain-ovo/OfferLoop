from pathlib import Path
import importlib.util
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "runtime/offerloop/admin/scripts/automation_contract.py"


def load_module():
    spec = importlib.util.spec_from_file_location("automation_contract", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class AutomationContractTest(unittest.TestCase):
    def setUp(self):
        self.contract = load_module()

    def snapshot(self, daily="enabled"):
        plan = self.contract.build_plan(daily)
        enterprise = []
        for item in plan["enterprise_workflows"]:
            action = (
                "HTTPClientAction"
                if item["title"] == self.contract.ENTERPRISE_PROGRESS_TITLE
                else "SetRecordAction"
            )
            enterprise.append(
                {
                    **item,
                    "excludes_automation_batch_update": True,
                    "step_types": ["SetRecordTrigger", action],
                    **(
                        {"record_locator_transport": "query"}
                        if action == "HTTPClientAction"
                        else {}
                    ),
                }
            )
        reminder = [
            {
                **plan["reminder_workflows"][0],
                "excludes_automation_batch_update": True,
                "step_types": ["SetRecordTrigger", "HTTPClientAction"],
                "record_locator_transport": "query",
            }
        ]
        daily_payload = {
            "selection": daily,
            "status": "enabled" if daily == "enabled" else "disabled",
        }
        if daily == "enabled":
            daily_payload.update(
                {
                    "name": self.contract.DAILY_CHECKIN_TRIGGER,
                    "trigger_type": "cron",
                    "cron": self.contract.DAILY_CHECKIN_CRON,
                    "timezone": self.contract.DAILY_CHECKIN_TIMEZONE,
                    "card_callback_verified": True,
                    "callback_route_public_verified": True,
                    "group_permission_verified": True,
                    "calendar_permission_verified": True,
                    "calendar_scope_isolation_verified": True,
                }
            )
        return {
            "enterprise_workflows": enterprise,
            "reminder_workflows": reminder,
            "sync_service": {
                "release_status": "finished",
                "health_status": "ready",
                "base_read_write_permissions_verified": True,
            },
            "daily_checkin": daily_payload,
        }

    def test_plan_has_twelve_workflows_and_explicit_daily_choice(self):
        plan = self.contract.build_plan("enabled")
        self.assertEqual(plan["workflow_count"], 12)
        self.assertEqual(len(plan["enterprise_workflows"]), 11)
        self.assertEqual(len(plan["reminder_workflows"]), 1)
        self.assertEqual(plan["daily_checkin"]["cron"], "10 22 * * *")
        self.assertFalse(plan["online_writes"])

    def test_complete_enabled_inventory_is_ready(self):
        result = self.contract.validate_snapshot(self.snapshot())
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["workflow_counts"]["total_expected"], 12)
        self.assertFalse(result["secrets_processed"])

    def test_explicitly_disabled_daily_checkin_is_valid(self):
        result = self.contract.validate_snapshot(self.snapshot("disabled"))
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["daily_checkin_selection"], "disabled")

    def test_missing_workflow_and_unverified_card_are_blocked(self):
        snapshot = self.snapshot()
        snapshot["enterprise_workflows"].pop()
        snapshot["daily_checkin"]["card_callback_verified"] = False
        result = self.contract.validate_snapshot(snapshot)
        self.assertEqual(result["status"], "blocked")
        self.assertTrue(any("missing enabled workflows" in item for item in result["errors"]))
        self.assertTrue(any("card_callback_verified" in item for item in result["errors"]))

    def test_login_redirecting_callback_route_is_blocked(self):
        snapshot = self.snapshot()
        snapshot["daily_checkin"]["callback_route_public_verified"] = False
        result = self.contract.validate_snapshot(snapshot)
        self.assertEqual(result["status"], "blocked")
        self.assertTrue(
            any("callback_route_public_verified" in item for item in result["errors"])
        )

    def test_calendar_fallback_or_personal_invite_is_blocked(self):
        snapshot = self.snapshot()
        snapshot["daily_checkin"]["calendar_scope_isolation_verified"] = False
        result = self.contract.validate_snapshot(snapshot)
        self.assertEqual(result["status"], "blocked")
        self.assertTrue(
            any("calendar_scope_isolation_verified" in item for item in result["errors"])
        )

    def test_raw_body_locator_and_unverified_base_writes_are_blocked(self):
        snapshot = self.snapshot()
        next(
            item
            for item in snapshot["enterprise_workflows"]
            if item["title"] == self.contract.ENTERPRISE_PROGRESS_TITLE
        )["record_locator_transport"] = "raw_body"
        snapshot["sync_service"]["base_read_write_permissions_verified"] = False
        result = self.contract.validate_snapshot(snapshot)
        self.assertEqual(result["status"], "blocked")
        self.assertTrue(any("query transport" in item for item in result["errors"]))
        self.assertTrue(any("read/write permissions" in item for item in result["errors"]))


if __name__ == "__main__":
    unittest.main()
