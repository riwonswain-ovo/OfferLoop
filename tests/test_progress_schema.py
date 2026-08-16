from pathlib import Path
import importlib.util
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (
    ROOT
    / "skills"
    / "offerloop-setup"
    / "scripts"
    / "validate_progress_schema.py"
)
SPEC = importlib.util.spec_from_file_location("validate_progress_schema", SCRIPT)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(validator)


def valid_fields():
    fields = [
        {"name": name, "type": field_type}
        for name, field_type in validator.REQUIRED_TYPES.items()
    ]
    by_name = {field["name"]: field for field in fields}
    by_name["进展状态"]["options"] = [
        {"name": name} for name in validator.PROGRESS_STATUS_OPTIONS
    ]
    by_name["最近完成节点"]["options"] = [
        {"name": name} for name in validator.COMPLETED_NODE_OPTIONS
    ]
    return fields


class ProgressSchemaTest(unittest.TestCase):
    def test_accepts_exact_v6_core_schema(self):
        result = validator.validate({"data": {"fields": valid_fields()}})

        self.assertEqual(result["schema_version"], 6)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["issues"], [])

    def test_reports_missing_fields_and_option_drift(self):
        fields = [field for field in valid_fields() if field["name"] != "公告链接"]
        status = next(field for field in fields if field["name"] == "进展状态")
        status["options"] = [
            option for option in status["options"] if option["name"] != "待 OC"
        ]

        result = validator.validate(fields)

        self.assertEqual(result["status"], "needs_action")
        self.assertIn({"field": "公告链接", "issue": "missing"}, result["issues"])
        self.assertIn(
            {
                "field": "进展状态",
                "issue": "option_mismatch",
                "missing": ["待 OC"],
                "unexpected": [],
            },
            result["issues"],
        )

    def test_rejects_removed_resume_field(self):
        fields = valid_fields() + [{"name": "投递简历版本", "type": "select"}]

        result = validator.validate(fields)

        self.assertIn(
            {"field": "投递简历版本", "issue": "forbidden"},
            result["issues"],
        )


if __name__ == "__main__":
    unittest.main()
