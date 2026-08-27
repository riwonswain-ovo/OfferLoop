from pathlib import Path
import importlib.util
import unittest


ROOT = Path(__file__).resolve().parents[3]
PATH = ROOT / "skills" / "job-collection" / "scripts" / "preference_migration.py"
SPEC = importlib.util.spec_from_file_location("preference_migration", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PreferenceMigrationTest(unittest.TestCase):
    def test_base_is_truth_when_profile_is_missing(self):
        result = MODULE.plan_migration({"base_preference": {"city": ["上海"]}})
        self.assertEqual(result["status"], "ready")
        self.assertTrue(result["write_allowed"])

    def test_empty_base_requires_confirmation_before_copy(self):
        result = MODULE.plan_migration({"profile_preference": {"city": ["北京"]}})
        self.assertEqual(result["status"], "needs_confirmation")
        self.assertFalse(result["write_allowed"])
        self.assertEqual(result["proposed_base_preference"], {"city": ["北京"]})

    def test_equivalent_values_are_ready_after_normalization(self):
        result = MODULE.plan_migration(
            {
                "base_preference": {"city": ["上海", "北京"]},
                "profile_preference": {"city": ["北京", "上海"]},
            }
        )
        self.assertEqual(result["status"], "ready")

    def test_conflict_stops_writes_and_lists_fields(self):
        result = MODULE.plan_migration(
            {
                "base_preference": {"city": ["北京"], "recruit_type": "校招"},
                "profile_preference": {"city": ["上海"], "recruit_type": "校招"},
            }
        )
        self.assertEqual(result["status"], "conflict")
        self.assertFalse(result["write_allowed"])
        self.assertEqual(result["conflicting_fields"], ["city"])

    def test_both_missing_requires_task_input(self):
        result = MODULE.plan_migration({})
        self.assertEqual(result["status"], "needs_input")
        self.assertFalse(result["write_allowed"])


if __name__ == "__main__":
    unittest.main()
