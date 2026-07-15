from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / "skills"


class RepositoryContractTest(unittest.TestCase):
    def test_expected_skills_are_discoverable(self):
        expected = {"offerloop-setup", "job-collection", "recruiting-reminder"}
        discovered = {
            path.parent.name for path in SKILLS.glob("*/SKILL.md") if path.is_file()
        }
        self.assertEqual(discovered, expected)

    def test_skill_frontmatter_name_matches_directory(self):
        for skill_file in SKILLS.glob("*/SKILL.md"):
            text = skill_file.read_text(encoding="utf-8")
            match = re.search(r"^name:\s*([^\s]+)\s*$", text, re.MULTILINE)
            self.assertIsNotNone(match, skill_file)
            self.assertEqual(match.group(1), skill_file.parent.name)

    def test_no_stale_information_collection_dependency(self):
        reminder = (SKILLS / "recruiting-reminder" / "SKILL.md").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("information-collection", reminder)

    def test_business_skills_point_to_offerloop_setup(self):
        for name in ("job-collection", "recruiting-reminder"):
            text = (SKILLS / name / "SKILL.md").read_text(encoding="utf-8")
            self.assertIn("offerloop-setup", text, name)

    def test_no_scaffold_placeholders_remain(self):
        for skill_file in SKILLS.glob("*/SKILL.md"):
            self.assertNotIn("TODO", skill_file.read_text(encoding="utf-8"), skill_file)


if __name__ == "__main__":
    unittest.main()
