from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.incremental_scan import (
    PaginationSafetyError,
    RecordPage,
    ServerFilterUnsupported,
    build_overlap_filter,
    plan_target_reads,
    resolve_offset,
    scan_descending_window,
    scan_with_filter_fallback,
)


TZ = timezone(timedelta(hours=8))
BOUNDARY = datetime(2026, 8, 15, tzinfo=TZ)


def row(record_id: str, value: datetime) -> dict[str, object]:
    return {"record_id": record_id, "更新时间": int(value.timestamp() * 1000)}


def paged_fetch(pages, calls):
    def fetch(offset, limit, filter_json, sort_json):
        calls.append(
            {
                "offset": offset,
                "limit": limit,
                "filter": filter_json,
                "sort": sort_json,
            }
        )
        return pages[offset]

    return fetch


class IncrementalScanTest(unittest.TestCase):
    def test_first_page_already_crosses_boundary(self):
        calls = []
        pages = {
            0: RecordPage(
                rows=(row("old-1", BOUNDARY - timedelta(seconds=1)),),
                has_more=True,
                next_offset=1,
            )
        }
        records, stats = scan_descending_window(
            paged_fetch(pages, calls),
            overlap_start=BOUNDARY,
            server_filter=False,
        )
        self.assertEqual(records, [])
        self.assertEqual(stats.actual_pages, 1)
        self.assertEqual(stats.records_read, 1)
        self.assertEqual(stats.stop_reason, "time_boundary")

    def test_boundary_timestamp_spans_two_pages_without_loss(self):
        calls = []
        pages = {
            0: RecordPage(
                rows=(row("new", BOUNDARY + timedelta(hours=1)), row("edge-1", BOUNDARY)),
                has_more=True,
                next_offset=2,
            ),
            2: RecordPage(
                rows=(row("edge-2", BOUNDARY), row("old-1", BOUNDARY - timedelta(seconds=1))),
                has_more=True,
                next_offset=4,
            ),
            4: RecordPage(
                rows=(row("old-2", BOUNDARY - timedelta(seconds=2)),),
                has_more=True,
                next_offset=5,
            ),
        }
        records, stats = scan_descending_window(
            paged_fetch(pages, calls), overlap_start=BOUNDARY, server_filter=False
        )
        self.assertEqual([item["record_id"] for item in records], ["new", "edge-1", "edge-2"])
        self.assertEqual(stats.actual_pages, 3)
        self.assertEqual(stats.stop_reason, "time_boundary")

    def test_equal_update_times_are_all_retained(self):
        calls = []
        pages = {
            0: RecordPage(
                rows=tuple(row(f"same-{index}", BOUNDARY) for index in range(5)),
                has_more=False,
            )
        }
        records, stats = scan_descending_window(
            paged_fetch(pages, calls), overlap_start=BOUNDARY
        )
        self.assertEqual(len(records), 5)
        self.assertEqual(stats.window_records, 5)

    def test_unadvanced_high_water_mark_repeats_only_overlap_pages(self):
        calls = []
        pages = {
            0: RecordPage(
                rows=(row("new", BOUNDARY),), has_more=True, next_offset=1
            ),
            1: RecordPage(
                rows=(row("old", BOUNDARY - timedelta(days=1)),),
                has_more=True,
                next_offset=2,
            ),
        }
        fetch = paged_fetch(pages, calls)
        first, first_stats = scan_descending_window(
            fetch, overlap_start=BOUNDARY, server_filter=False
        )
        second, second_stats = scan_descending_window(
            fetch, overlap_start=BOUNDARY, server_filter=False
        )
        self.assertEqual(first, second)
        self.assertEqual(first_stats.actual_pages, 2)
        self.assertEqual(second_stats.actual_pages, 2)
        self.assertEqual([call["offset"] for call in calls], [0, 1, 0, 1])

    def test_non_advancing_cursor_fails_safely(self):
        calls = []
        pages = {
            0: RecordPage(
                rows=(row("new", BOUNDARY),), has_more=True, next_offset=0
            )
        }
        with self.assertRaisesRegex(PaginationSafetyError, "did not advance"):
            scan_descending_window(
                paged_fetch(pages, calls), overlap_start=BOUNDARY
            )

    def test_offset_dialect_advances_by_page_length_when_response_omits_offset(self):
        self.assertEqual(resolve_offset(200, 200, None), 400)

    def test_filter_is_pushed_down_and_fallback_is_explicit(self):
        calls = []
        fallback_pages = {
            0: RecordPage(
                rows=(row("new", BOUNDARY),), has_more=True, next_offset=1
            ),
            1: RecordPage(
                rows=(row("old", BOUNDARY - timedelta(seconds=1)),),
                has_more=False,
            ),
        }

        def fetch(offset, limit, filter_json, sort_json):
            calls.append(filter_json)
            if filter_json is not None:
                raise ServerFilterUnsupported("InvalidFilter")
            return fallback_pages[offset]

        records, stats = scan_with_filter_fallback(fetch, overlap_start=BOUNDARY)
        self.assertEqual([item["record_id"] for item in records], ["new"])
        self.assertEqual(calls[0], build_overlap_filter(BOUNDARY))
        self.assertIsNone(calls[1])
        self.assertFalse(stats.server_filter)

    def test_datetime_filter_uses_supported_operators_and_keeps_boundary_day(self):
        self.assertEqual(
            build_overlap_filter(BOUNDARY),
            {
                "logic": "or",
                "conditions": [
                    ["更新时间", "==", "ExactDate(2026-08-15)"],
                    ["更新时间", ">", "ExactDate(2026-08-15)"],
                ],
            },
        )

    def test_full_audit_and_incremental_target_reads_differ(self):
        candidates = [
            {
                "company_name": "示例公司",
                "official_url": "https://jobs.example/apply",
                "source_url": "https://jobs.example/notice",
            }
        ]
        incremental = plan_target_reads(
            candidates,
            full_audit=False,
            main_table="main",
            child_tables=("internet", "finance"),
        )
        audit = plan_target_reads(
            candidates,
            full_audit=True,
            main_table="main",
            child_tables=("internet", "finance"),
        )
        self.assertEqual(incremental.mode, "incremental")
        self.assertEqual(incremental.full_tables, ())
        self.assertEqual(incremental.company_keywords, ("示例公司",))
        self.assertEqual(len(incremental.link_filters), 1)
        self.assertEqual(audit.mode, "full_audit")
        self.assertEqual(audit.full_tables, ("main", "internet", "finance"))
        self.assertEqual(audit.link_filters, ())
        self.assertEqual(audit.company_keywords, ())

    def test_target_link_filters_are_split_before_base_condition_limit(self):
        candidates = [
            {"official_url": f"https://jobs.example/{index}"}
            for index in range(21)
        ]
        plan = plan_target_reads(
            candidates,
            full_audit=False,
            main_table="main",
            child_tables=(),
        )
        self.assertEqual(
            [len(item["conditions"]) for item in plan.link_filters], [10, 10, 1]
        )


if __name__ == "__main__":
    unittest.main()
