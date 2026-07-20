from pathlib import Path
import importlib.util
import unittest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "skills" / "recruiting-reminder" / "scripts" / "fetch_mail.py"


def load_module():
    spec = importlib.util.spec_from_file_location("offerloop_fetch_mail", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


fetch_mail = load_module()


class FakeConnection:
    def __init__(self):
        self.logged_out = False
        self.search_called = False
        self.fetch_called = False

    def login(self, login, password):
        self.login_args = (login, password)

    def select(self, mailbox):
        self.mailbox = mailbox
        return "OK", [b"0"]

    def uid(self, command, *args):
        if command.lower() == "search":
            self.search_called = True
        if command.lower() == "fetch":
            self.fetch_called = True
        raise AssertionError("connection check must not read messages")

    def logout(self):
        self.logged_out = True


class FetchMailConnectionCheckTest(unittest.TestCase):
    def test_connection_check_logs_in_selects_mailbox_and_logs_out(self):
        connection = FakeConnection()

        result = fetch_mail.check_connection(
            {
                "IMAP_HOST": "imap.example.com",
                "IMAP_PORT": "993",
                "IMAP_LOGIN": "person@example.com",
                "IMAP_PASSWORD": "private-password",
                "MAILBOX": "INBOX",
            },
            connect=lambda host, port: connection,
        )

        self.assertEqual(result, {"ok": True, "mailbox": "INBOX"})
        self.assertTrue(connection.logged_out)
        self.assertFalse(connection.search_called)
        self.assertFalse(connection.fetch_called)

    def test_connection_check_sanitizes_login_failure(self):
        class RejectingConnection(FakeConnection):
            def login(self, login, password):
                raise RuntimeError(f"rejected {login} {password}")

        result = fetch_mail.check_connection(
            {
                "IMAP_HOST": "imap.example.com",
                "IMAP_PORT": "993",
                "IMAP_LOGIN": "person@example.com",
                "IMAP_PASSWORD": "private-password",
            },
            connect=lambda host, port: RejectingConnection(),
        )

        self.assertEqual(result, {"ok": False, "error": "IMAP connection failed"})
        self.assertNotIn("person@example.com", str(result))
        self.assertNotIn("private-password", str(result))


class PermanentIgnoreRulesTest(unittest.TestCase):
    def test_ignored_company_matches_subject_without_whitespace(self):
        rules = {
            "ignored_companies": ["多益 网络"],
            "ignored_email_addresses": [],
            "ignored_email_domains": [],
        }
        envelope = {
            "subject": "多益网络校园招聘通知",
            "from": "招聘团队 <campus@example.com>",
            "body_preview": "",
        }
        self.assertTrue(fetch_mail.is_permanently_ignored(envelope, rules))

    def test_ignored_address_and_domain_are_exact_case_insensitive(self):
        envelope = {
            "subject": "Assessment",
            "from": "Campus <Recruiter@Example.com>",
            "body_preview": "",
        }
        by_address = {
            "ignored_companies": [],
            "ignored_email_addresses": ["recruiter@example.com"],
            "ignored_email_domains": [],
        }
        by_domain = {
            "ignored_companies": [],
            "ignored_email_addresses": [],
            "ignored_email_domains": ["EXAMPLE.COM"],
        }
        self.assertTrue(fetch_mail.is_permanently_ignored(envelope, by_address))
        self.assertTrue(fetch_mail.is_permanently_ignored(envelope, by_domain))

    def test_unrelated_sender_is_not_ignored(self):
        rules = {
            "ignored_companies": ["多益网络"],
            "ignored_email_addresses": [],
            "ignored_email_domains": [],
        }
        envelope = {
            "subject": "另一家公司面试通知",
            "from": "campus@example.com",
            "body_preview": "请参加面试",
        }
        self.assertFalse(fetch_mail.is_permanently_ignored(envelope, rules))
