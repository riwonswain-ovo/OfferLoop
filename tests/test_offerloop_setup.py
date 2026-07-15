from pathlib import Path
import importlib.util
import json
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def load_module(name, relative_path):
    path = ROOT / relative_path
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


configure = load_module(
    "offerloop_configure", "skills/offerloop-setup/scripts/configure.py"
)
preflight = load_module(
    "offerloop_preflight", "skills/offerloop-setup/scripts/preflight.py"
)


class OfferLoopSetupTest(unittest.TestCase):
    def test_private_config_is_written_outside_skill(self):
        with tempfile.TemporaryDirectory() as directory:
            path = configure.config_file({"XDG_CONFIG_HOME": directory})
            configure.write_private_json(path, {"lark_profile": "offerloop"})
            self.assertEqual(path, Path(directory) / "offerloop" / "config.json")
            self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")
            self.assertEqual(json.loads(path.read_text())["lark_profile"], "offerloop")

    def test_preflight_discovers_all_bundled_skills(self):
        with tempfile.TemporaryDirectory() as directory:
            result = preflight.run_checks({"XDG_CONFIG_HOME": directory})
            self.assertTrue(all(result["skills"].values()))


if __name__ == "__main__":
    unittest.main()
