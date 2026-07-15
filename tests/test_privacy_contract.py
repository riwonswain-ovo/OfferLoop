from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})")
PHONE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
ABSOLUTE_HOME = re.compile(r"/(?:Users|home)/[^/<>'\s]+/")
PRIVATE_TOKEN = re.compile(
    r"(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|"
    r"sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|"
    r"bascn(?!Example)[A-Za-z0-9_-]{8,})"
)
ALLOWED_EMAIL_DOMAINS = {"example.com", "xx.com", "188.com"}


def tracked_text_files():
    paths = subprocess.check_output(
        ["git", "ls-files"], cwd=ROOT, text=True
    ).splitlines()
    for relative in paths:
        path = ROOT / relative
        try:
            yield relative, path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue


class PrivacyContractTest(unittest.TestCase):
    def test_no_personal_contact_details_or_home_paths(self):
        findings = []
        for relative, content in tracked_text_files():
            for match in EMAIL.finditer(content):
                if match.group(1).lower() not in ALLOWED_EMAIL_DOMAINS:
                    findings.append(f"{relative}: non-placeholder email")
            if PHONE.search(content):
                findings.append(f"{relative}: phone-like value")
            if ABSOLUTE_HOME.search(content):
                findings.append(f"{relative}: personal absolute path")
        self.assertEqual(findings, [])

    def test_no_concrete_secret_or_base_token_patterns(self):
        findings = [
            relative
            for relative, content in tracked_text_files()
            if PRIVATE_TOKEN.search(content)
        ]
        self.assertEqual(findings, [])

    def test_commit_emails_use_github_noreply(self):
        emails = subprocess.check_output(
            ["git", "log", "--all", "--format=%ae%n%ce"], cwd=ROOT, text=True
        ).splitlines()
        self.assertTrue(emails)
        self.assertTrue(
            all(email.endswith("@users.noreply.github.com") for email in emails),
            emails,
        )


if __name__ == "__main__":
    unittest.main()
