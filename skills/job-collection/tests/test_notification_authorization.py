import json
from pathlib import Path
import tempfile
import unittest

from scripts import notification_authorization as auth


def config(target_id="oc_example", identity="bot"):
    return {
        "notifications": {
            "status": "enabled",
            "target_type": "chat",
            "target_id": target_id,
            "target_name": "默认通知群",
            "identity": identity,
        }
    }


class NotificationAuthorizationTests(unittest.TestCase):
    def test_authorize_and_check(self):
        policy, result = auth.authorize(config())
        self.assertTrue(result["authorized"])
        self.assertTrue(auth.check_authorization(config(), policy)["authorized"])
        self.assertNotIn("oc_example", json.dumps(policy))

    def test_destination_change_invalidates_authorization(self):
        policy, _ = auth.authorize(config())
        result = auth.check_authorization(config(target_id="oc_changed"), policy)
        self.assertFalse(result["authorized"])
        self.assertIn("changed", result["reason"])

    def test_identity_change_invalidates_authorization(self):
        policy, _ = auth.authorize(config())
        result = auth.check_authorization(config(identity="user"), policy)
        self.assertFalse(result["authorized"])

    def test_private_write_and_recheck(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config_path = root / "config.json"
            policy_path = root / "policy.json"
            config_path.write_text(json.dumps(config()), encoding="utf-8")
            status = auth.main(
                [
                    "authorize",
                    "--config",
                    str(config_path),
                    "--policy",
                    str(policy_path),
                    "--confirm-standing-authorization",
                ]
            )
            self.assertEqual(status, 0)
            self.assertEqual(policy_path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(
                auth.main(
                    ["check", "--config", str(config_path), "--policy", str(policy_path)]
                ),
                0,
            )


if __name__ == "__main__":
    unittest.main()
