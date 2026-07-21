from datetime import date
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.progress_sync import (
    build_progress_record,
    merge_progress_record,
    sync_submitted_application,
)


class FakeProgressRepository:
    def __init__(self):
        self.records = {}

    def find_by_enterprise_record_id(self, source_record_id):
        return self.records.get(source_record_id)

    def create(self, fields):
        record = {"record_id": "rec_progress", "fields": dict(fields)}
        self.records[fields["企业清单 record_id"]] = record
        return record["record_id"]

    def update(self, record_id, fields):
        key = fields["企业清单 record_id"]
        self.records[key] = {"record_id": record_id, "fields": dict(fields)}


class ProgressSyncTest(unittest.TestCase):
    def test_first_submission_builds_progress_record_with_blank_position(self):
        source = {
            "record_id": "rec_source",
            "fields": {"公司": "示例公司", "投递进度": "已投递", "公告链接": "https://example.com/notice", "投递链接": "https://example.com/apply"},
        }

        result = build_progress_record(source, submitted_on=date(2026, 7, 17))

        self.assertEqual(
            result,
            {
                "当前阶段": "已投递",
                "公司": "示例公司",
                "投递岗位": "",
                "投递日期": "2026-07-17",
                "岗位 JD": "",
                "公告链接": "https://example.com/notice",
                "投递链接": "https://example.com/apply",
                "企业清单 record_id": "rec_source",
            },
        )

    def test_repeat_submission_preserves_user_and_later_stage_fields(self):
        source = {
            "record_id": "rec_source",
            "fields": {"公司": "示例公司（更新）", "投递进度": "已投递", "公告链接": "https://example.com/new-notice", "投递链接": "https://example.com/new-apply"},
        }
        existing = {
            "当前阶段": "二面",
            "公司": "示例公司",
            "投递岗位": "AI 产品经理",
            "投递日期": "2026-07-10",
            "岗位 JD": "负责 AI 产品规划",
            "公告链接": "https://old.example/notice",
            "投递链接": "https://old.example/apply",
            "企业清单 record_id": "rec_source",
        }

        result = merge_progress_record(
            existing,
            source,
            submitted_on=date(2026, 7, 17),
        )

        self.assertEqual(result["当前阶段"], "二面")
        self.assertEqual(result["投递岗位"], "AI 产品经理")
        self.assertEqual(result["投递日期"], "2026-07-10")
        self.assertEqual(result["岗位 JD"], "负责 AI 产品规划")
        self.assertEqual(result["公司"], "示例公司（更新）")
        self.assertEqual(result["公告链接"], "https://example.com/new-notice")
        self.assertEqual(result["投递链接"], "https://example.com/new-apply")

    def test_sync_is_idempotent_by_enterprise_record_id(self):
        source = {
            "record_id": "rec_source",
            "fields": {"公司": "示例公司", "投递进度": "已投递", "公告链接": "https://example.com/notice", "投递链接": "https://example.com/apply"},
        }
        repository = FakeProgressRepository()

        first = sync_submitted_application(
            source,
            repository,
            submitted_on=date(2026, 7, 17),
        )
        second = sync_submitted_application(
            source,
            repository,
            submitted_on=date(2026, 7, 18),
        )

        self.assertEqual(first, {"action": "created", "record_id": "rec_progress"})
        self.assertEqual(second, {"action": "unchanged", "record_id": "rec_progress"})
        self.assertEqual(len(repository.records), 1)
        self.assertEqual(
            repository.records["rec_source"]["fields"]["投递日期"],
            "2026-07-17",
        )

    def test_sync_skips_records_not_in_submitted_status(self):
        source = {
            "record_id": "rec_source",
            "fields": {"公司": "示例公司", "投递进度": "感兴趣"},
        }
        repository = FakeProgressRepository()

        result = sync_submitted_application(
            source,
            repository,
            submitted_on=date(2026, 7, 17),
        )

        self.assertEqual(result, {"action": "skipped", "reason": "not_submitted"})
        self.assertEqual(repository.records, {})

    def test_first_submission_requires_company(self):
        source = {
            "record_id": "rec_source",
            "fields": {"公司": "", "投递进度": "已投递"},
        }

        with self.assertRaisesRegex(ValueError, "公司"):
            build_progress_record(source, submitted_on=date(2026, 7, 17))

    def test_historical_migration_can_preserve_unknown_submission_date(self):
        source = {
            "record_id": "rec_source",
            "fields": {"公司": "历史公司", "投递进度": "已投递"},
        }

        result = build_progress_record(source, submitted_on=None)

        self.assertEqual(result["投递日期"], "")


if __name__ == "__main__":
    unittest.main()
