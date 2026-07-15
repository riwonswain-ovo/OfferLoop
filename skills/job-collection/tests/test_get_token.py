import json
import os
from pathlib import Path
import tempfile
import unittest
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.get_token import load_credentials, read_cached_token, write_cached_token


class TokenHelperTest(unittest.TestCase):
    def test_environment_takes_precedence_over_dotenv(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("FEISHU_APP_ID=file\nFEISHU_APP_SECRET=file-secret\n")
            credentials = load_credentials(
                {"FEISHU_APP_ID": "env", "FEISHU_APP_SECRET": "env-secret"},
                env_file,
            )
            self.assertEqual(credentials, ("env", "env-secret"))

    def test_cache_file_is_private(self):
        with tempfile.TemporaryDirectory() as directory:
            cache_file = Path(directory) / "token.json"
            write_cached_token(cache_file, "token", 9999999999)
            self.assertEqual(oct(cache_file.stat().st_mode & 0o777), "0o600")
            self.assertEqual(read_cached_token(cache_file, now=1), "token")
            self.assertEqual(json.loads(cache_file.read_text())["token"], "token")


if __name__ == "__main__":
    unittest.main()
