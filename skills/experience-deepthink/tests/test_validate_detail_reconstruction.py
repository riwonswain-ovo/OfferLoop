from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "validate_detail_reconstruction.py"
)
SPEC = importlib.util.spec_from_file_location("detail_validator", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def build_document(sections: list[str]) -> str:
    body = ["# 细节复原稿｜测试项目"]
    for section in sections:
        body.extend(["", f"## {section}", "", "正文。"])
    return "\n".join(body)


class DetailReconstructionValidatorTest(unittest.TestCase):
    def test_accepts_exact_eight_chapters(self) -> None:
        markdown = build_document(MODULE.EXPECTED_SECTIONS)
        self.assertEqual(MODULE.validate_markdown(markdown), [])

    def test_rejects_missing_chapter(self) -> None:
        markdown = build_document(MODULE.EXPECTED_SECTIONS[:-1])
        self.assertTrue(MODULE.validate_markdown(markdown))

    def test_rejects_wrong_order(self) -> None:
        sections = MODULE.EXPECTED_SECTIONS.copy()
        sections[3], sections[4] = sections[4], sections[3]
        markdown = build_document(sections)
        self.assertTrue(MODULE.validate_markdown(markdown))

    def test_rejects_template_placeholders(self) -> None:
        markdown = build_document(MODULE.EXPECTED_SECTIONS) + "\n\n### <待替换>"
        self.assertTrue(MODULE.validate_markdown(markdown))


if __name__ == "__main__":
    unittest.main()
