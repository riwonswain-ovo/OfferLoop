from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


SCRIPT_PATH = (
    Path(__file__).resolve().parents[1]
    / "scripts"
    / "validate_interview_transcript.py"
)
SPEC = importlib.util.spec_from_file_location("interview_validator", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def build_document(questions: list[str]) -> str:
    body = ["# 面试逐字稿｜测试项目｜策略产品经理"]
    for question in questions:
        body.extend(["", f"## {question}", "", "正文。"])
    return "\n".join(body)


class InterviewTranscriptValidatorTest(unittest.TestCase):
    def test_accepts_exact_seven_questions(self) -> None:
        markdown = build_document(MODULE.EXPECTED_QUESTIONS)
        self.assertEqual(MODULE.validate_markdown(markdown), [])

    def test_rejects_missing_question(self) -> None:
        markdown = build_document(MODULE.EXPECTED_QUESTIONS[:-1])
        self.assertTrue(MODULE.validate_markdown(markdown))

    def test_rejects_wrong_order(self) -> None:
        questions = MODULE.EXPECTED_QUESTIONS.copy()
        questions[2], questions[3] = questions[3], questions[2]
        markdown = build_document(questions)
        self.assertTrue(MODULE.validate_markdown(markdown))

    def test_rejects_old_standalone_background_question(self) -> None:
        questions = MODULE.EXPECTED_QUESTIONS.copy()
        questions.insert(1, "二、请介绍一下项目背景")
        markdown = build_document(questions)
        self.assertTrue(MODULE.validate_markdown(markdown))


if __name__ == "__main__":
    unittest.main()
