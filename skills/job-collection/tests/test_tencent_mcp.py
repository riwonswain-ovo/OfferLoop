from pathlib import Path
import json
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.tencent_mcp import (
    DEFAULT_PAGE_SIZE,
    LIST_RECORDS_TOOL,
    TencentMcpError,
    TencentMcpResponseTruncated,
    list_records_arguments,
    parse_smartsheet_url,
    scan_all_records,
    unwrap_tool_payload,
)


class TencentMcpTest(unittest.TestCase):
    def test_parse_smartsheet_url_preserves_sheet_and_view_hints(self):
        location = parse_smartsheet_url(
            "https://docs.qq.com/smartsheet/FileExample"
            "?tab=SheetExample&viewId=ViewExample"
        )
        self.assertEqual(location.file_id, "FileExample")
        self.assertEqual(location.tab_id, "SheetExample")
        self.assertEqual(location.view_id, "ViewExample")

    def test_rejects_lookalike_host(self):
        with self.assertRaises(ValueError):
            parse_smartsheet_url(
                "https://docs.qq.com.example.com/smartsheet/FileExample"
            )

    def test_list_records_arguments_are_bounded_and_project_fields(self):
        arguments = list_records_arguments(
            file_id="FileExample",
            sheet_id="SheetExample",
            view_id="ViewExample",
            field_titles=("公司", "更新时间"),
            sort=({"field_title": "更新时间", "desc": True},),
            offset=100,
            limit=100,
        )
        self.assertEqual(
            arguments,
            {
                "file_id": "FileExample",
                "sheet_id": "SheetExample",
                "view_id": "ViewExample",
                "field_titles": ["公司", "更新时间"],
                "sort": [{"field_title": "更新时间", "desc": True}],
                "offset": 100,
                "limit": 100,
            },
        )
        with self.assertRaises(ValueError):
            list_records_arguments(
                file_id="FileExample",
                sheet_id="SheetExample",
                offset=0,
                limit=101,
            )

    def test_unwraps_text_content_result(self):
        payload = unwrap_tool_payload(
            {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(
                            {
                                "total": 0,
                                "has_more": False,
                                "next": 0,
                                "records": [],
                            }
                        ),
                    }
                ]
            }
        )
        self.assertEqual(payload["total"], 0)

    def test_unwraps_raw_json_and_rejects_truncated_json(self):
        payload = unwrap_tool_payload(
            json.dumps(
                {
                    "total": 0,
                    "has_more": False,
                    "next": 0,
                    "records": [],
                }
            )
        )
        self.assertEqual(payload["records"], [])

        with self.assertRaises(TencentMcpResponseTruncated):
            unwrap_tool_payload('{"total": 1, "records": [{"record_id": "r1')

    def test_full_scan_follows_next_until_complete(self):
        calls = []
        consumed = []
        pages = {
            0: {
                "total": 3,
                "has_more": True,
                "next": 2,
                "records": [
                    {"record_id": "r1", "field_values": {"公司": "A"}},
                    {"record_id": "r2", "field_values": {"公司": "B"}},
                ],
            },
            2: {
                "total": 3,
                "has_more": False,
                "next": 3,
                "records": [
                    {"record_id": "r3", "field_values": {"公司": "C"}},
                ],
            },
        }

        def call_tool(name, arguments):
            calls.append((name, arguments))
            return pages[arguments["offset"]]

        summary = scan_all_records(
            call_tool,
            lambda records: consumed.extend(records),
            file_id="FileExample",
            sheet_id="SheetExample",
            field_titles=("公司",),
            page_size=2,
        )

        self.assertEqual([call[0] for call in calls], [LIST_RECORDS_TOOL] * 2)
        self.assertEqual([call[1]["offset"] for call in calls], [0, 2])
        self.assertEqual([record["record_id"] for record in consumed], ["r1", "r2", "r3"])
        self.assertEqual(summary.total, 3)
        self.assertEqual(summary.pages, 2)
        self.assertTrue(summary.complete)
        self.assertEqual(summary.smallest_page_size, 2)
        self.assertEqual(summary.truncation_retries, 0)

    def test_full_scan_retries_same_offset_with_smaller_pages(self):
        calls = []
        consumed = []
        records = [
            {"record_id": "r1", "field_values": []},
            {"record_id": "r2", "field_values": []},
            {"record_id": "r3", "field_values": []},
        ]

        def call_tool(_name, arguments):
            calls.append((arguments["offset"], arguments["limit"]))
            if arguments["limit"] > 2:
                return '{"total": 3, "records": [{"record_id": "cut'
            offset = arguments["offset"]
            limit = arguments["limit"]
            page_records = records[offset : offset + limit]
            next_offset = offset + len(page_records)
            return {
                "total": len(records),
                "has_more": next_offset < len(records),
                "next": next_offset,
                "records": page_records,
            }

        summary = scan_all_records(
            call_tool,
            lambda page: consumed.extend(page),
            file_id="FileExample",
            sheet_id="SheetExample",
            field_titles=("公司",),
            page_size=8,
        )

        self.assertEqual(
            calls,
            [(0, 8), (0, 4), (0, 2), (2, 2)],
        )
        self.assertEqual([record["record_id"] for record in consumed], ["r1", "r2", "r3"])
        self.assertEqual(summary.requested_page_size, 8)
        self.assertEqual(summary.smallest_page_size, 2)
        self.assertEqual(summary.truncation_retries, 2)

    def test_single_row_truncation_splits_fields_and_merges_by_record_id(self):
        calls = []
        consumed = []

        def call_tool(_name, arguments):
            fields = tuple(arguments.get("field_titles", ()))
            calls.append((arguments["limit"], fields))
            if len(fields) > 1:
                return '{"total": 1, "records": [{"record_id": "cut'
            return {
                "total": 1,
                "has_more": False,
                "next": 0,
                "records": [
                    {
                        "record_id": "r1",
                        "field_values": [
                            {"field": fields[0], "string_value": fields[0].lower()}
                        ],
                    }
                ],
            }

        summary = scan_all_records(
            call_tool,
            lambda page: consumed.extend(page),
            file_id="FileExample",
            sheet_id="SheetExample",
            field_titles=("公司", "更新时间"),
            page_size=1,
        )

        self.assertEqual(
            calls,
            [
                (1, ("公司", "更新时间")),
                (1, ("公司",)),
                (1, ("更新时间",)),
            ],
        )
        self.assertEqual(
            consumed[0]["field_values"],
            [
                {"field": "公司", "string_value": "公司"},
                {"field": "更新时间", "string_value": "更新时间"},
            ],
        )
        self.assertEqual(summary.truncation_retries, 1)
        self.assertEqual(summary.field_split_pages, 1)

    def test_single_field_truncation_fails_closed(self):
        with self.assertRaisesRegex(TencentMcpError, "still truncated at limit=1"):
            scan_all_records(
                lambda _name, _arguments: '{"records": [',
                lambda _records: None,
                file_id="FileExample",
                sheet_id="SheetExample",
                field_titles=("说明",),
                page_size=1,
            )

    def test_default_page_size_uses_empirically_safe_start(self):
        arguments = list_records_arguments(
            file_id="FileExample",
            sheet_id="SheetExample",
            offset=0,
        )
        self.assertEqual(arguments["limit"], DEFAULT_PAGE_SIZE)

    def test_page_missing_completeness_fields_fails_closed(self):
        with self.assertRaisesRegex(TencentMcpError, "missing required fields"):
            scan_all_records(
                lambda _name, _arguments: {
                    "total": 1,
                    "records": [{"record_id": "r1", "field_values": []}],
                },
                lambda _records: None,
                file_id="FileExample",
                sheet_id="SheetExample",
            )

    def test_full_scan_rejects_truncated_last_page(self):
        def call_tool(_name, _arguments):
            return {
                "total": 2,
                "has_more": False,
                "next": 1,
                "records": [{"record_id": "r1", "field_values": {}}],
            }

        with self.assertRaisesRegex(TencentMcpError, "incomplete"):
            scan_all_records(
                call_tool,
                lambda _records: None,
                file_id="FileExample",
                sheet_id="SheetExample",
            )

    def test_full_scan_rejects_source_drift(self):
        pages = {
            0: {
                "total": 2,
                "has_more": True,
                "next": 1,
                "records": [{"record_id": "r1", "field_values": {}}],
            },
            1: {
                "total": 3,
                "has_more": False,
                "next": 2,
                "records": [{"record_id": "r2", "field_values": {}}],
            },
        }

        with self.assertRaisesRegex(TencentMcpError, "total is unstable"):
            scan_all_records(
                lambda _name, arguments: pages[arguments["offset"]],
                lambda _records: None,
                file_id="FileExample",
                sheet_id="SheetExample",
                page_size=1,
            )


if __name__ == "__main__":
    unittest.main()
