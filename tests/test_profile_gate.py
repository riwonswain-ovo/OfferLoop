from pathlib import Path
import importlib.util
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "skills/offerloop-workspace/scripts/profile_gate.py"


def load_module():
    spec = importlib.util.spec_from_file_location("profile_gate", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ProfileGateCompatibilityTest(unittest.TestCase):
    def test_all_inputs_return_ready_without_inspection_or_side_effects(self):
        gate = load_module()
        for markdown in ("", "# 用户画像\n- 目标岗位：待补充", "private text"):
            with self.subTest(markdown=markdown):
                result = gate.assess_profile(markdown)
                self.assertEqual(result["status"], "ready")
                self.assertEqual(result["reason"], "retired_noop")
                self.assertEqual(result["inspected_fields"], 0)
                self.assertFalse(result["side_effects"])

    def test_cli_does_not_open_the_legacy_profile_path(self):
        missing = ROOT / "does-not-exist-profile.md"
        result = subprocess.run(
            ["python3", str(SCRIPT), "--file", str(missing)],
            check=False,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"status": "ready"', result.stdout)


if __name__ == "__main__":
    unittest.main()
