from datetime import date, datetime, timezone
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.sync_utils import (
    APPLICATION_STATUSES,
    CANDIDATE_ROUTES,
    CandidateRouteInputs,
    ENTERPRISE_FIELDS,
    batch_in_time_window,
    matches_confirmed_direction,
    normalize_url,
    overlap_start,
    parse_feishu_bitable_url,
    recruitment_fingerprint,
    resolve_profile_field,
    route_candidate,
)


def route_inputs(**overrides):
    values = {
        "city_matches": True,
        "graduation_year_matches": True,
        "recruitment_type_matches": True,
        "company_is_allowed": True,
        "profile_graduation_year": "2027届",
        "today": date(2026, 8, 24),
        "job_preference_matches": True,
    }
    values.update(overrides)
    return CandidateRouteInputs(**values)


ROUTE_CANDIDATE = {"recruitment_batch": "秋招"}


class SyncUtilsTest(unittest.TestCase):
    def test_batch_window_matches_2027_recruitment_season_on_2026_08_24(self):
        today = date(2026, 8, 24)
        for batch in ("2027届秋招", "秋招提前批", "秋季校园招聘", "暑期实习"):
            self.assertTrue(batch_in_time_window(batch, today, "2027届"), batch)
        for batch in ("2027届春招", "春季校园招聘", "秋招补录", "春招补招"):
            self.assertFalse(batch_in_time_window(batch, today, "2027届"), batch)

    def test_batch_window_boundaries_are_inclusive(self):
        cases = (
            ("秋招提前批", date(2026, 7, 1), True),
            ("秋招提前批", date(2026, 10, 31), True),
            ("秋招提前批", date(2026, 11, 1), False),
            ("秋招", date(2027, 1, 31), True),
            ("秋招", date(2027, 2, 1), False),
            ("春招", date(2027, 1, 1), True),
            ("春招", date(2027, 6, 30), True),
            ("春招", date(2027, 7, 1), False),
            ("秋招补录", date(2026, 11, 1), True),
            ("秋招补录", date(2027, 3, 31), True),
            ("春招补录", date(2027, 3, 1), True),
            ("春招补录", date(2027, 7, 31), True),
            ("暑期实习", date(2026, 9, 30), True),
            ("暑期实习", date(2026, 10, 1), False),
        )
        for batch, today, expected in cases:
            with self.subTest(batch=batch, today=today):
                self.assertEqual(
                    batch_in_time_window(batch, today, 2027),
                    expected,
                )

    def test_unrecognized_batch_is_not_filtered_by_time_window(self):
        for batch in ("校园招聘", "日常实习", "补录", ""):
            self.assertTrue(batch_in_time_window(batch, date(2026, 8, 24), "2027"))

    def test_invalid_graduation_year_fails_closed(self):
        for value in ("", "27届", "2027/2028", "未知"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                batch_in_time_window("秋招", date(2026, 8, 24), value)

    def test_enterprise_schema_has_exact_field_order(self):
        self.assertEqual(
            ENTERPRISE_FIELDS,
            (
                "信息更新时间",
                "投递进度",
                "公司",
                "招聘批次",
                "招聘项目",
                "招聘岗位",
                "公告链接",
                "投递链接",
                "投递截止时间",
                "城市",
                "行业标签",
                "企业性质",
                "子表 record_id",
            ),
        )
        self.assertNotIn("编号", ENTERPRISE_FIELDS)

    def test_application_statuses_include_interest_without_remapping(self):
        self.assertEqual(
            APPLICATION_STATUSES,
            ("待确认", "感兴趣", "已投递", "已拒绝"),
        )

    def test_candidate_routes_filter_explicit_hard_mismatches(self):
        self.assertEqual(
            CANDIDATE_ROUTES,
            ("hard_filtered", "auto_write", "awaiting_write_confirmation"),
        )
        for field in (
            "city_matches",
            "graduation_year_matches",
            "recruitment_type_matches",
            "company_is_allowed",
        ):
            self.assertEqual(
                route_candidate(
                    candidate=ROUTE_CANDIDATE,
                    inputs=route_inputs(**{field: False}),
                ),
                "hard_filtered",
            )

    def test_batch_window_is_always_part_of_named_hard_filters(self):
        self.assertEqual(
            route_candidate(
                candidate={"recruitment_batch": "春招"},
                inputs=route_inputs(),
            ),
            "hard_filtered",
        )

    def test_unknown_batch_requires_confirmation_in_candidate_routing(self):
        self.assertEqual(
            route_candidate(
                candidate={"recruitment_batch": "其他招聘项目"},
                inputs=route_inputs(),
            ),
            "awaiting_write_confirmation",
        )

    def test_incomplete_hard_filter_data_requires_confirmation(self):
        for field in (
            "city_matches",
            "graduation_year_matches",
            "recruitment_type_matches",
            "company_is_allowed",
        ):
            self.assertEqual(
                route_candidate(
                    candidate=ROUTE_CANDIDATE,
                    inputs=route_inputs(**{field: None}),
                ),
                "awaiting_write_confirmation",
            )

    def test_job_preference_is_a_soft_prewrite_gate(self):
        self.assertEqual(
            route_candidate(
                candidate=ROUTE_CANDIDATE,
                inputs=route_inputs(),
            ),
            "auto_write",
        )
        for job_match in (False, None):
            self.assertEqual(
                route_candidate(
                    candidate=ROUTE_CANDIDATE,
                    inputs=route_inputs(job_preference_matches=job_match),
                ),
                "awaiting_write_confirmation",
            )

    def test_industry_is_not_a_route_input_and_missing_links_require_confirmation(self):
        self.assertEqual(
            route_candidate(
                candidate=ROUTE_CANDIDATE,
                inputs=route_inputs(),
                has_announcement_link=True,
                has_application_link=False,
            ),
            "auto_write",
        )
        self.assertEqual(
            route_candidate(
                candidate=ROUTE_CANDIDATE,
                inputs=route_inputs(),
                has_announcement_link=False,
                has_application_link=False,
            ),
            "awaiting_write_confirmation",
        )

    def test_explicit_role_exclusion_requires_complete_source_scope(self):
        incomplete = route_candidate(
            candidate=ROUTE_CANDIDATE,
            inputs=route_inputs(
                job_preference_matches=False,
                job_scope_complete=False,
                all_positions_explicitly_excluded=True,
            ),
        )
        complete = route_candidate(
            candidate=ROUTE_CANDIDATE,
            inputs=route_inputs(
                job_preference_matches=False,
                job_scope_complete=True,
                all_positions_explicitly_excluded=True,
            ),
        )
        self.assertEqual(incomplete, "awaiting_write_confirmation")
        self.assertEqual(complete, "hard_filtered")

    def test_legacy_scope_name_remains_compatible_with_job_scope_complete(self):
        legacy = route_candidate(
            candidate=ROUTE_CANDIDATE,
            inputs=route_inputs(
                job_preference_matches=False,
                source_positions_complete=True,
                all_positions_explicitly_excluded=True,
            ),
        )
        self.assertEqual(legacy, "hard_filtered")
        with self.assertRaisesRegex(ValueError, "aliases conflict"):
            route_inputs(
                job_scope_complete=False,
                source_positions_complete=True,
            )

    def test_included_and_excluded_role_conflict_requires_confirmation(self):
        self.assertEqual(
            route_candidate(
                candidate=ROUTE_CANDIDATE,
                inputs=route_inputs(
                    job_preference_matches=True,
                    job_scope_complete=True,
                    all_positions_explicitly_excluded=False,
                    same_position_preference_conflict=True,
                ),
            ),
            "awaiting_write_confirmation",
        )

    def test_complete_mixed_roles_keep_an_explicitly_included_position(self):
        self.assertEqual(
            route_candidate(
                candidate={**ROUTE_CANDIDATE, "job_positions": "AI 产品经理、销售"},
                inputs=route_inputs(
                    job_preference_matches=True,
                    job_scope_complete=True,
                    all_positions_explicitly_excluded=False,
                    same_position_preference_conflict=False,
                ),
            ),
            "auto_write",
        )

    def test_role_evidence_rejects_contradictory_aggregate_flags(self):
        with self.assertRaisesRegex(ValueError, "all positions excluded"):
            route_inputs(
                job_preference_matches=True,
                all_positions_explicitly_excluded=True,
            )
        with self.assertRaisesRegex(ValueError, "included position match"):
            route_inputs(
                job_preference_matches=False,
                same_position_preference_conflict=True,
            )

    def test_confirmed_direction_match_is_normalized_but_not_invented(self):
        self.assertTrue(
            matches_confirmed_direction(
                "AI 产品经理",
                ("产品经理", "PMO"),
            )
        )
        self.assertFalse(
            matches_confirmed_direction(
                "解决方案经理",
                ("产品经理", "PMO"),
            )
        )

    def test_parse_feishu_url_with_arbitrary_query_order(self):
        url = "https://example.feishu.cn/base/bascnExample?view=vewExample&table=tblExample"
        self.assertEqual(parse_feishu_bitable_url(url), ("bascnExample", "tblExample"))

    def test_parse_larksuite_url(self):
        url = "https://example.larksuite.com/base/bascnExample?table=tblExample"
        self.assertEqual(parse_feishu_bitable_url(url), ("bascnExample", "tblExample"))

    def test_reject_non_feishu_url(self):
        with self.assertRaises(ValueError):
            parse_feishu_bitable_url("https://example.com/base/a?table=b")

    def test_overlap_uses_previous_calendar_day(self):
        cursor = datetime(2026, 7, 11, 23, 59, 59, tzinfo=timezone.utc)
        self.assertEqual(
            overlap_start(cursor),
            datetime(2026, 7, 10, 0, 0, 0, tzinfo=timezone.utc),
        )

    def test_normalize_url_removes_tracking_and_fragment(self):
        url = "HTTPS://Example.COM/jobs/42/?utm_source=x&job=pm#details"
        self.assertEqual(normalize_url(url), "https://example.com/jobs/42?job=pm")

    def test_normalize_url_preserves_business_hash_route(self):
        left = "https://example.com/recruit/list#/ey=position-a"
        right = "https://example.com/recruit/list#/ey=position-b"
        self.assertNotEqual(normalize_url(left), normalize_url(right))
        self.assertEqual(normalize_url(left), left)

    def test_fingerprint_normalizes_width_case_and_punctuation(self):
        left = recruitment_fingerprint("ＡＣＭＥ 科技", "2027届秋招", "产品经理")
        right = recruitment_fingerprint("acme科技", "2027 届-秋招", "产品 经理")
        self.assertEqual(left, right)

    def test_profile_field_prefers_exact_name(self):
        fields = {
            "excluded_recruitment_types": ["暑期实习", "普通实习", "社招"],
            "excluded_recruitment...": ["wrong"],
        }
        self.assertEqual(
            resolve_profile_field(fields, "excluded_recruitment_types"),
            ["暑期实习", "普通实习", "社招"],
        )

    def test_profile_field_restores_unique_truncated_name(self):
        fields = {"excluded_recruitment...": ["暑期实习", "普通实习", "社招"]}
        self.assertEqual(
            resolve_profile_field(fields, "excluded_recruitment_types"),
            ["暑期实习", "普通实习", "社招"],
        )

    def test_profile_field_never_defaults_missing_hard_filter(self):
        with self.assertRaises(KeyError):
            resolve_profile_field({}, "excluded_recruitment_types")


if __name__ == "__main__":
    unittest.main()
