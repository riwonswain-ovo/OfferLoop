from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "validate_language.py"
SPEC = importlib.util.spec_from_file_location("language_validator", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class LanguageValidatorTest(unittest.TestCase):
    def test_accepts_positive_attribution_and_real_maturity(self) -> None:
        markdown = (
            "我负责功能层面接入，算法团队负责优化分单模型。"
            "本阶段完成 PRD、原型和可测试 Demo。"
        )
        self.assertEqual(MODULE.validate_language(markdown, "detail"), [])

    def test_accepts_direct_unknown_in_detail_chapter(self) -> None:
        markdown = (
            "## 八、项目中当时未充分了解的细节\n"
            "当时没有记录检索准确率。后续可以建立独立测试集验证。"
        )
        self.assertEqual(MODULE.validate_language(markdown, "detail"), [])

    def test_accepts_scoped_positive_result(self) -> None:
        markdown = "在5名测试者的指定任务中，所有人都完成了查询，3人反馈引用定位不清楚。"
        self.assertEqual(MODULE.validate_language(markdown, "detail"), [])

    def test_accepts_root_cause_without_missing_closure(self) -> None:
        markdown = "复盘后我发现，抽样标准只看频率，没有覆盖低频高风险场景。"
        self.assertEqual(MODULE.validate_language(markdown, "interview"), [])

    def test_accepts_future_direction_without_missing_result(self) -> None:
        markdown = "后续会优先优化引用定位，并通过指定任务完成率和引用识别率判断效果。"
        self.assertEqual(MODULE.validate_language(markdown, "interview"), [])

    def test_rejects_defensive_attribution(self) -> None:
        markdown = "数据管道由研发实现，不能将这部分归为本人贡献。"
        self.assertTrue(MODULE.validate_language(markdown, "detail"))

    def test_rejects_missing_evidence_disclaimer(self) -> None:
        markdown = "这套方法目前还没有在其他真实项目中形成应用证据。"
        self.assertTrue(MODULE.validate_language(markdown, "interview"))

    def test_rejects_generation_receipt(self) -> None:
        markdown = "已按 experience-deepthink 的固定七题结构校验通过。"
        self.assertTrue(MODULE.validate_language(markdown, "interview"))

    def test_rejects_rephrased_missing_correction(self) -> None:
        markdown = "这次复盘最终停留在根因分析阶段，没有继续实施修正动作。"
        self.assertTrue(MODULE.validate_language(markdown, "interview"))

    def test_rejects_repeated_evidence_boundary(self) -> None:
        markdown = "现有结果只能支持原型可操作，不能外推为真实业务价值。"
        self.assertTrue(MODULE.validate_language(markdown, "detail"))

    def test_rejects_missing_future_validation_result(self) -> None:
        markdown = "这两个方向还没有新的上线验证结果。"
        self.assertTrue(MODULE.validate_language(markdown, "interview"))

    def test_rejects_negative_maturity_enumeration(self) -> None:
        markdown = "项目停留在 Demo 阶段，没有真实上线、真实业务用户或业务收益。"
        self.assertTrue(MODULE.validate_language(markdown, "detail"))

    def test_rejects_result_scope_disclaimer(self) -> None:
        markdown = "本阶段的任务完成情况只能说明流程跑通，不能替代对检索质量的评测。"
        self.assertTrue(MODULE.validate_language(markdown, "detail"))

    def test_rejects_rephrased_missing_application_evidence(self) -> None:
        markdown = "这套方法已经形成，但实际效果仍需要在后续项目中验证。"
        self.assertTrue(MODULE.validate_language(markdown, "interview"))

    def test_ignores_examples_inside_fenced_code(self) -> None:
        markdown = "```markdown\n不能将平台能力归为个人成果。\n```"
        self.assertEqual(MODULE.validate_language(markdown, "detail"), [])


if __name__ == "__main__":
    unittest.main()
