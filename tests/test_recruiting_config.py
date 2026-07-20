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
SKILL = SCRIPT.parents[1] / "SKILL.md"
SPEC = importlib.util.spec_from_file_location("fetch_mail", SCRIPT)
fetch_mail = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(fetch_mail)


class RecruitingConfigTest(unittest.TestCase):
    def test_skill_targets_the_unified_interview_center(self):
        content = SKILL.read_text(encoding="utf-8")
        for expected in (
            "笔面试中心",
            "全部安排",
            "scripts/event_model.py",
            "reminder_base_url",
            "progress_base_url",
            "面试准备文档",
            "面试复盘文档",
            "offerloop-workspace",
            "未来 7 天",
        ):
            self.assertIn(expected, content)
        self.assertNotIn("按类型选 Base", content)
        self.assertNotIn("建**两个** Base", content)

    def test_envelope_exposes_stable_message_thread_headers(self):
        headers = (
            b"Subject: =?utf-8?b?5LiA6Z2i6YCa55+l?=\r\n"
            b"From: recruiter@example.com\r\n"
            b"Date: Fri, 17 Jul 2026 10:00:00 +0800\r\n"
            b"Message-ID: <rescheduled@example.com>\r\n"
            b"In-Reply-To: <original@example.com>\r\n"
            b"References: <thread@example.com> <original@example.com>\r\n\r\n"
        )

        envelope = fetch_mail.parse_envelope("42", headers, "preview")

        self.assertEqual(envelope["source_mail_id"], "<rescheduled@example.com>")
        self.assertEqual(envelope["in_reply_to"], "<original@example.com>")
        self.assertEqual(
            envelope["references"],
            ["<thread@example.com>", "<original@example.com>"],
        )

    def test_envelope_falls_back_to_mailbox_uid_without_message_id(self):
        envelope = fetch_mail.parse_envelope(
            "42",
            b"Subject: Interview\r\nFrom: recruiter@example.com\r\n\r\n",
            "",
        )

        self.assertEqual(envelope["source_mail_id"], "imap_uid:42")

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
