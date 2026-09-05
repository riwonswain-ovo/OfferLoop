from pathlib import Path
import importlib.util
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILL_ROOT = ROOT / "skills" / "interview-prep"
BUNDLE_SCRIPT = ROOT / "scripts" / "build_installer_bundle.py"


def load_bundle_builder():
    spec = importlib.util.spec_from_file_location(
        "interview_prep_bundle_contract", BUNDLE_SCRIPT
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def section(text: str, start: str, end: str | None = None) -> str:
    start_index = text.index(start)
    if end is None:
        return text[start_index:]
    return text[start_index : text.index(end, start_index)]


class InterviewPrepStagedReadingContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
        cls.method = (
            SKILL_ROOT / "references" / "self-introduction-method.md"
        ).read_text(encoding="utf-8")
        cls.stage_a = section(
            cls.skill,
            "### 阶段 A｜隔离生成并冻结自我介绍",
            "### 阶段 B｜生成完整文档的其余部分",
        )
        cls.stage_b = section(
            cls.skill,
            "### 阶段 B｜生成完整文档的其余部分",
            "按需读取：",
        )

    def test_stage_a_is_mandatory_and_has_one_method_reference(self):
        self.assertIn("无论用户只要自我介绍", self.stage_a)
        method_references = set(
            re.findall(r"`references/([^`]+\.md)`", self.stage_a)
        )
        self.assertEqual(method_references, {"self-introduction-method.md"})
        self.assertIn("不得读取本 Skill 的其他 reference", self.stage_a)

    def test_stage_a_precedes_stage_b_and_freezes_before_other_references(self):
        self.assertLess(
            self.skill.index("### 阶段 A｜隔离生成并冻结自我介绍"),
            self.skill.index("### 阶段 B｜生成完整文档的其余部分"),
        )
        ordered_steps = (
            "1. 收集公司、岗位、JD、当前轮次",
            "2. 只读取 `references/self-introduction-method.md`",
            "3. 生成自我介绍",
            "然后冻结结果",
        )
        positions = [self.stage_a.index(step) for step in ordered_steps]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("只有在自我介绍已生成并冻结后", self.stage_b)

    def test_stage_b_cannot_rewrite_the_frozen_introduction(self):
        self.assertIn("原样插入阶段 A 已冻结的自我介绍", self.stage_b)
        self.assertIn("不得直接在阶段 B 改写", self.stage_b)
        downstream_guards = {
            "answer-logic.md": "不得用于检查、压缩、润色或改写该结果",
            "preparation-template.md": "不得重新生成或改写自我介绍",
            "quality-gates.md": "未另套结构、数量、时长或语言风格规则，也未直接改写已冻结结果",
            "role-adaptation.md": "不得用岗位画像重新选择其中的经历",
            "role-guides/ai-product.md": "本指南不得回写",
        }
        for relative, guard in downstream_guards.items():
            text = (SKILL_ROOT / "references" / relative).read_text(encoding="utf-8")
            self.assertIn("阶段 A", text, relative)
            self.assertIn(guard, text, relative)

    def test_confirmed_copy_has_priority_and_duration_is_spoken_time(self):
        self.assertIn("必须以该版本为底稿", self.method)
        self.assertIn("除非用户明确要求推倒重写", self.method)
        self.assertIn("建议时长为 1—2 分钟", self.method)
        self.assertIn("以真实、自然口述时间为唯一长度标准", self.method)
        self.assertIn("不设置汉字数上下限", self.method)
        self.assertIn("只有连续口述两次后确实超过两分钟", self.method)

    def test_installer_bundle_includes_method_reference_only_as_product_content(self):
        builder = load_bundle_builder()
        installer = builder._load_installer()
        payload_paths = {path for path, _source in builder._payload_files(installer)}
        self.assertIn(
            "skills/interview-prep/references/self-introduction-method.md",
            payload_paths,
        )
        self.assertNotIn("skills/interview-prep/test-results.md", payload_paths)
        self.assertFalse((SKILL_ROOT / "test-results.md").exists())
        self.assertNotIn("my.feishu.cn", self.method)


if __name__ == "__main__":
    unittest.main()
