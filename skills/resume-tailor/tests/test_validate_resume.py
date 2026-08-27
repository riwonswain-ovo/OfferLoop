from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(name.removesuffix(".py"), path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


renderer = load_script("render_resume.py")
validator = load_script("validate_resume.py")


class ModuleTests(unittest.TestCase):
    def test_accepts_user_module_order(self) -> None:
        self.assertEqual(
            renderer.parse_modules("projects,education,self_evaluation"),
            ["projects", "education", "self_evaluation"],
        )

    def test_rejects_unknown_or_duplicate_modules(self) -> None:
        with self.assertRaises(ValueError):
            renderer.parse_modules("education,skills")
        with self.assertRaises(ValueError):
            renderer.parse_modules("education,product_thinking")
        with self.assertRaises(ValueError):
            renderer.parse_modules("education,education")

    def test_experience_and_projects_use_different_content_shapes(self) -> None:
        experience = renderer.placeholder_section("experience")
        projects = renderer.placeholder_section("projects")
        self.assertIn("岗位职责：", experience)
        self.assertLess(experience.index("岗位职责："), experience.index("project-title"))
        self.assertNotIn("岗位职责：", projects)
        self.assertIn("产品设计与关键动作：", projects)


class HTMLValidationTests(unittest.TestCase):
    def test_generated_copy_has_upstream_ui_photo_and_selected_modules(self) -> None:
        modules = ["education", "projects", "self_evaluation"]
        rendered = renderer.replace_sheets(
            renderer.MOTHER_TEMPLATE.read_text(encoding="utf-8"), modules, None
        )
        with tempfile.TemporaryDirectory() as tempdir:
            output = Path(tempdir) / "resume.html"
            output.write_text(rendered, encoding="utf-8")
            renderer.copy_generic_assets(output.parent)
            self.assertEqual(validator.validate_html(output), [])
            self.assertIn('data-resume-module="education"', rendered)
            self.assertIn('data-resume-module="projects"', rendered)
            self.assertNotIn('data-resume-module="experience"', rendered)
            self.assertNotIn('data-resume-module="product_thinking"', rendered)
            self.assertIn("profile-photo-slot", rendered)
            self.assertIn('class="company-logo school-logo"', rendered)
            self.assertNotIn("\n+", rendered)
            self.assertIn("打印 / 导出 PDF", rendered)

    def test_mother_template_uses_one_content_rail(self) -> None:
        template = renderer.MOTHER_TEMPLATE.read_text(encoding="utf-8")
        self.assertIn("@page { size: A4; margin: 7mm; }", template)
        self.assertIn("--page-inline: 7mm; --content-rail: 0px", template)
        self.assertIn("--body-leading: 1.32; --paragraph-gap: 2px", template)
        self.assertIn("padding: 0 0 0 var(--content-rail)", template)
        self.assertIn(".nested, .nested-deep { margin-left: 0; }", template)
        self.assertIn("grid-template-columns: 22px minmax(0, 1fr) auto", template)
        self.assertIn("grid-template-columns: minmax(0, 1fr) 22mm; gap: 6mm; align-items: end", template)
        self.assertIn("width: 22mm; height: 28mm", template)
        self.assertIn(".school-logo { border-radius: 50%; }", template)
        self.assertIn('.profile-photo-slot.has-photo { border: 1px solid transparent; }', template)
        self.assertIn(".company-meta { grid-column: 3; color: #202020; font-size: 11.2pt", template)
        self.assertIn(".education-name .education-major { margin-left: 4px; }", template)
        self.assertIn("font-size: 13.5pt", template)
        self.assertIn(".role-summary", template)
        self.assertIn("orphans: 2; widows: 2", template)
        self.assertEqual(template.count('<main class="sheet" contenteditable="true">'), 1)
        self.assertNotIn('<main class="sheet page-break"', template)

    def test_skills_and_self_evaluation_are_one_module(self) -> None:
        rendered = renderer.placeholder_section("self_evaluation")
        self.assertIn("个人技能与自我评价", rendered)
        self.assertIn("专业技能：", rendered)
        self.assertIn("自我评价：", rendered)

    def test_validator_rejects_manual_html_pages(self) -> None:
        rendered = renderer.replace_sheets(
            renderer.MOTHER_TEMPLATE.read_text(encoding="utf-8"), ["education"], None
        )
        rendered = rendered.replace("  <script>", '<main class="sheet"></main>\n  <script>')
        with tempfile.TemporaryDirectory() as tempdir:
            output = Path(tempdir) / "resume.html"
            output.write_text(rendered, encoding="utf-8")
            renderer.copy_generic_assets(output.parent)
            errors = validator.validate_html(output)
        self.assertTrue(any("只有 1 个连续 .sheet" in error for error in errors), errors)


if __name__ == "__main__":
    unittest.main()
