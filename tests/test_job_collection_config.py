from pathlib import Path
import importlib.util
import tempfile
import unittest


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "skills"
    / "job-collection"
    / "scripts"
    / "get_token.py"
)
SPEC = importlib.util.spec_from_file_location("get_token", SCRIPT)
get_token = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(get_token)


class JobCollectionConfigTest(unittest.TestCase):
    def test_default_env_file_is_update_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            path = get_token.default_env_file({"XDG_CONFIG_HOME": directory})
            self.assertEqual(
                path, Path(directory) / "offerloop" / "job-collection" / ".env"
            )

    def test_environment_overrides_offerloop_env_file(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "FEISHU_APP_ID=file\nFEISHU_APP_SECRET=file-secret\n",
                encoding="utf-8",
            )
            credentials = get_token.load_credentials(
                {
                    "FEISHU_APP_ID": "process",
                    "FEISHU_APP_SECRET": "process-secret",
                },
                env_file,
            )
            self.assertEqual(credentials, ("process", "process-secret"))


if __name__ == "__main__":
    unittest.main()
