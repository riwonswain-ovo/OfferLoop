from datetime import date
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.progress_sync import (
    application_id_for,
    build_progress_record,
    merge_progress_record,
    sync_submitted_application,
)


class FakeProgressRepository:
    def __init__(self):
        self.records = []

    def find_all_by_enterprise_record_id(self, source_record_id):
        return [
            record
            for record in self.records
            if record["fields"]["企业清单 record_id"] == source_record_id
        ]

    def create(self, fields):
        record = {"record_id": "rec_progress", "fields": dict(fields)}
        self.records.append(record)
        return record["record_id"]

    def update(self, record_id, fields):
        for record in self.records:
            if record["record_id"] == record_id:
                record["fields"] = dict(fields)
                return
        raise AssertionError(f"unknown record: {record_id}")


class ProgressSyncTest(unittest.TestCase):
    def test_first_submission_builds_progress_record_with_blank_position(self):
        source = {
            "record_id": "rec_source",
            "fields": {
                "公司": "示例公司",
                "投递进度": "已投递",
                "公告链接": "https://example.com/notice",
                "投递链接": "https://example.com/apply",
            },
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
                "投递记录 ID": "enterprise:rec_source:default",
            },
        )

    def test_repeat_submission_preserves_user_and_later_stage_fields(self):
        source = {
            "record_id": "rec_source",
            "fields": {
                "公司": "示例公司（更新）",
                "投递进度": "已投递",
                "公告链接": "https://new.example/notice",
                "投递链接": "https://new.example/apply",
            },
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
            application_id="progress:rec_progress",
        )

        self.assertEqual(result["当前阶段"], "二面")
        self.assertEqual(result["投递岗位"], "AI 产品经理")
        self.assertEqual(result["投递日期"], "2026-07-10")
        self.assertEqual(result["岗位 JD"], "负责 AI 产品规划")
        self.assertEqual(result["公司"], "示例公司（更新）")
        self.assertNotIn("原招聘信息", result)
        self.assertEqual(result["公告链接"], "https://new.example/notice")
        self.assertEqual(result["投递链接"], "https://new.example/apply")
        self.assertEqual(result["投递记录 ID"], "progress:rec_progress")

    def test_sync_is_idempotent_by_enterprise_record_id(self):
        source = {
            "record_id": "rec_source",
            "fields": {
                "公司": "示例公司",
                "投递进度": "已投递",
                "公告链接": "https://example.com/notice",
                "投递链接": "https://example.com/apply",
            },
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

        self.assertEqual(first["action"], "created")
        self.assertEqual(second["action"], "unchanged")
        self.assertEqual(len(repository.records), 1)
        self.assertEqual(
            repository.records[0]["fields"]["投递日期"],
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
        self.assertEqual(repository.records, [])

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

    def test_multiple_jobs_for_one_enterprise_are_preserved_and_updated(self):
        source = {
            "record_id": "rec_source",
            "fields": {
                "公司": "示例公司（更新）",
                "投递进度": "已投递",
                "公告链接": "https://new.example/notice",
                "投递链接": "https://new.example/apply",
            },
        }
        repository = FakeProgressRepository()
        repository.records = [
            {
                "record_id": "rec_job_one",
                "fields": {
                    "当前阶段": "一面",
                    "公司": "示例公司",
                    "投递岗位": "AI 产品经理",
                    "投递日期": "2026-07-10",
                    "岗位 JD": "岗位一",
                    "企业清单 record_id": "rec_source",
                },
            },
            {
                "record_id": "rec_job_two",
                "fields": {
                    "当前阶段": "已投递",
                    "公司": "示例公司",
                    "投递岗位": "策略产品经理",
                    "投递日期": "2026-07-11",
                    "岗位 JD": "岗位二",
                    "企业清单 record_id": "rec_source",
                    "投递记录 ID": "manual:job-two",
                },
            },
        ]

        result = sync_submitted_application(source, repository, date(2026, 7, 18))

        self.assertEqual(result["action"], "updated")
        self.assertEqual(result["record_ids"], ["rec_job_one", "rec_job_two"])
        self.assertEqual(repository.records[0]["fields"]["投递岗位"], "AI 产品经理")
        self.assertEqual(repository.records[1]["fields"]["投递岗位"], "策略产品经理")
        self.assertEqual(repository.records[0]["fields"]["投递记录 ID"], "progress:rec_job_one")
        self.assertEqual(repository.records[1]["fields"]["投递记录 ID"], "manual:job-two")
        self.assertEqual(repository.records[0]["fields"]["当前阶段"], "一面")

    def test_application_id_falls_back_to_progress_record_id(self):
        self.assertEqual(
            application_id_for({"record_id": "rec_job", "fields": {}}),
            "progress:rec_job",
        )


if __name__ == "__main__":
    unittest.main()
