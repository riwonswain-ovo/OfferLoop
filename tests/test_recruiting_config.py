from pathlib import Path
import importlib.util
import os
import tempfile
import unittest


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "skills"
    / "recruiting-reminder"
    / "scripts"
    / "fetch_mail.py"
)
SPEC = importlib.util.spec_from_file_location("fetch_mail", SCRIPT)
fetch_mail = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(fetch_mail)


class RecruitingConfigTest(unittest.TestCase):
    def test_config_lives_outside_installed_skill(self):
        with tempfile.TemporaryDirectory() as directory:
            environ = {"XDG_CONFIG_HOME": directory}
            expected = Path(directory) / "offerloop" / "recruiting-reminder" / ".env"
            self.assertEqual(fetch_mail.default_env_file(environ), expected)

    def test_explicit_env_file_has_priority(self):
        with tempfile.TemporaryDirectory() as directory:
            custom = Path(directory) / "mail.env"
            custom.write_text("IMAP_HOST=imap.example.com\n", encoding="utf-8")
            config = fetch_mail.load_config(
                environ={"OFFERLOOP_IMAP_ENV": str(custom)}
            )
            self.assertEqual(config["IMAP_HOST"], "imap.example.com")

    def test_process_environment_overrides_file(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("IMAP_HOST=from-file.example.com\n", encoding="utf-8")
            config = fetch_mail.load_config(
                environ={"IMAP_HOST": "from-process.example.com"},
                env_file=env_file,
            )
            self.assertEqual(config["IMAP_HOST"], "from-process.example.com")


if __name__ == "__main__":
    unittest.main()
