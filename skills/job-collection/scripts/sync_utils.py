#!/usr/bin/env python3
"""Pure helper functions used by multi-source sync implementations."""

from __future__ import annotations

import html
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


TRACKING_QUERY_KEYS = {"from", "spm", "track", "tracking_id"}
ENTERPRISE_FIELDS = (
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
)
APPLICATION_STATUSES = ("待确认", "感兴趣", "已投递", "已拒绝")
CANDIDATE_ROUTES = (
    "hard_filtered",
    "auto_write",
    "awaiting_write_confirmation",
)
PROFILE_FIELD_NAMES = (
    "graduation_year",
    "target_cities",
    "city_filter_mode",
    "target_job_preferences",
    "excluded_job_preferences",
    "excluded_companies",
    "excluded_recruitment_types",
)


@dataclass(frozen=True)
class CandidateRouteInputs:
    """Named evidence required before a candidate can be routed."""

    city_matches: bool | None
    graduation_year_matches: bool | None
    recruitment_type_matches: bool | None
    company_is_allowed: bool | None
    profile_graduation_year: str | int
    today: date
    job_preference_matches: bool | None
    job_scope_complete: bool | None = None
    all_positions_explicitly_excluded: bool = False
    same_position_preference_conflict: bool = False
    source_positions_complete: bool | None = None

    def __post_init__(self) -> None:
        for name in (
            "city_matches",
            "graduation_year_matches",
            "recruitment_type_matches",
            "company_is_allowed",
            "job_preference_matches",
        ):
            value = getattr(self, name)
            if value is not None and not isinstance(value, bool):
                raise ValueError(f"{name} must be true, false, or null")
        for name in ("job_scope_complete", "source_positions_complete"):
            value = getattr(self, name)
            if value is not None and not isinstance(value, bool):
                raise ValueError(f"{name} must be boolean or null")
        if (
            self.job_scope_complete is not None
            and self.source_positions_complete is not None
            and self.job_scope_complete != self.source_positions_complete
        ):
            raise ValueError("job scope completeness aliases conflict")
        resolved_scope = (
            self.job_scope_complete
            if self.job_scope_complete is not None
            else self.source_positions_complete
            if self.source_positions_complete is not None
            else False
        )
        object.__setattr__(self, "job_scope_complete", resolved_scope)
        if not isinstance(self.all_positions_explicitly_excluded, bool):
            raise ValueError("all_positions_explicitly_excluded must be boolean")
        if not isinstance(self.same_position_preference_conflict, bool):
            raise ValueError("same_position_preference_conflict must be boolean")
        if self.same_position_preference_conflict and self.job_preference_matches is not True:
            raise ValueError(
                "same_position_preference_conflict requires an included position match"
            )
        if (
            self.job_preference_matches is True
            and self.all_positions_explicitly_excluded
        ):
            raise ValueError(
                "an included position cannot coexist with all positions excluded"
            )
        if not isinstance(self.today, date):
            raise ValueError("today must be a date")


def batch_in_time_window(
    recruitment_batch: str,
    today: date,
    graduation_year: str | int,
) -> bool:
    """Return whether a named recruitment season is open for the user.

    The window is derived from the current date and graduation year; it is not
    a user preference. This compatibility wrapper keeps unknown labels eligible;
    candidate routing uses ``batch_time_window_match`` so they require confirmation.
    """
    result = batch_time_window_match(recruitment_batch, today, graduation_year)
    return result is not False


def batch_time_window_match(
    recruitment_batch: str,
    today: date,
    graduation_year: str | int,
) -> bool | None:
    """Return a tri-state season match; unknown labels require confirmation."""
    match = re.fullmatch(r"\s*(\d{4})\s*(?:届)?\s*", str(graduation_year))
    if not match:
        raise ValueError("graduation_year must contain one four-digit year")

    grad_year = int(match.group(1))
    batch = unicodedata.normalize("NFKC", recruitment_batch or "").strip()
    if not batch:
        return None

    if "补招" in batch or "补录" in batch:
        if "春" in batch:
            return date(grad_year, 3, 1) <= today <= date(grad_year, 7, 31)
        if "秋" in batch:
            return date(grad_year - 1, 11, 1) <= today <= date(grad_year, 3, 31)
        return True
    if "春招" in batch or "春季校园招聘" in batch:
        return date(grad_year, 1, 1) <= today <= date(grad_year, 6, 30)
    if "秋招提前批" in batch or "提前批" in batch:
        return date(grad_year - 1, 7, 1) <= today <= date(grad_year - 1, 10, 31)
    if "秋招专场" in batch or "秋招" in batch or "秋季" in batch:
        return date(grad_year - 1, 7, 1) <= today <= date(grad_year, 1, 31)
    if "暑期实习" in batch or "暑假实习" in batch:
        return date(grad_year - 1, 3, 1) <= today <= date(grad_year - 1, 9, 30)
    return None


def route_candidate(
    *,
    candidate: dict[str, object],
    inputs: CandidateRouteInputs,
    has_announcement_link: bool = True,
    has_application_link: bool = True,
) -> str:
    """Route a normalized candidate without weakening confirmed conditions.

    ``None`` means the adapter could not verify a condition. Industry is not
    a filter. Explicitly excluded roles are filtered only when the source proves
    that it shows the complete position range.
    """
    hard_conditions = (
        inputs.city_matches,
        inputs.graduation_year_matches,
        batch_time_window_match(
            str(candidate.get("recruitment_batch") or ""),
            inputs.today,
            inputs.profile_graduation_year,
        ),
        inputs.recruitment_type_matches,
        inputs.company_is_allowed,
    )
    if any(value is False for value in hard_conditions):
        return "hard_filtered"
    if not has_announcement_link and not has_application_link:
        return "hard_filtered"
    if any(value is None for value in hard_conditions):
        return "awaiting_write_confirmation"
    if inputs.same_position_preference_conflict:
        return "awaiting_write_confirmation"
    if (
        inputs.job_scope_complete
        and inputs.all_positions_explicitly_excluded
    ):
        return "hard_filtered"
    if inputs.job_preference_matches is True:
        return "auto_write"
    return "awaiting_write_confirmation"


def matches_confirmed_direction(
    candidate_role: str,
    confirmed_directions: tuple[str, ...],
) -> bool:
    """Match only user-confirmed role names, synonyms, and transfer directions."""
    candidate = normalize_text(candidate_role)
    if not candidate:
        return False
    return any(
        normalized and normalized in candidate
        for normalized in (normalize_text(value) for value in confirmed_directions)
    )


def resolve_profile_field(fields: dict[str, object], canonical_name: str) -> object:
    """Read a profile field without silently accepting a truncated CLI key.

    Some compact lark-cli outputs abbreviate long field names with a trailing
    ellipsis. A unique prefix may be restored; ambiguous or absent fields are
    errors so hard filters can never be disabled by accident.
    """
    if canonical_name in fields:
        return fields[canonical_name]

    matches = []
    for raw_name, value in fields.items():
        if not raw_name.endswith("..."):
            continue
        prefix = raw_name[:-3]
        if prefix and canonical_name.startswith(prefix):
            matches.append(value)

    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        raise ValueError(f"ambiguous truncated profile field: {canonical_name}")
    raise KeyError(f"missing required profile field: {canonical_name}")


def parse_feishu_bitable_url(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if not (host.endswith(".feishu.cn") or host.endswith(".larksuite.com")):
        raise ValueError("URL is not a Feishu/Lark Base URL")
    match = re.fullmatch(r"/base/([A-Za-z0-9_-]+)", parsed.path.rstrip("/"))
    table_id = dict(parse_qsl(parsed.query)).get("table", "")
    if not match or not table_id:
        raise ValueError("URL must contain a Base token and table query parameter")
    return match.group(1), table_id


def overlap_start(last_sync_time: datetime) -> datetime:
    """Return 00:00 one calendar day before the high-water mark."""
    previous_day = last_sync_time.date() - timedelta(days=1)
    return datetime.combine(previous_day, time.min, tzinfo=last_sync_time.tzinfo)


def normalize_url(url: str) -> str:
    value = html.unescape(url.strip())
    markdown_link = re.fullmatch(r"\[[^\]]*\]\((https?://.*)\)", value)
    if markdown_link:
        value = markdown_link.group(1).strip()
    if not value.lower().startswith(("http://", "https://")):
        return value
    parsed = urlparse(value)
    query = [
        (key, val)
        for key, val in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in TRACKING_QUERY_KEYS
    ]
    path = parsed.path.rstrip("/") or "/"
    raw_fragment = parsed.fragment.strip()
    fragment = (
        raw_fragment
        if raw_fragment
        and (raw_fragment.startswith(("/", "!")) or "=" in raw_fragment or "?" in raw_fragment)
        else ""
    )
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            path,
            "",
            urlencode(sorted(query)),
            fragment,
        )
    )


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lower().strip()
    return re.sub(r"[\W_]+", "", normalized, flags=re.UNICODE)


def normalize_company_name(value: str) -> str:
    """Normalize cosmetic legal suffixes without collapsing subsidiaries."""
    normalized = normalize_text(value)
    suffixes = (
        "集团股份有限公司", "集团有限责任公司", "股份有限责任公司", "股份有限公司",
        "集团有限公司", "有限责任公司", "companylimited", "incorporated",
        "corporation", "控股集团", "有限公司", "coltd", "limited", "company",
        "集团", "公司", "corp", "ltd", "inc", "group",
    )
    for suffix in suffixes:
        if normalized.endswith(suffix) and len(normalized) >= len(suffix) + 2:
            return normalized[:-len(suffix)]
    return normalized


def canonical_recruitment_type(value: str) -> str:
    """Map explicit source labels to the recruitment-type preference taxonomy."""
    normalized = normalize_text(value)
    if not normalized:
        return ""
    if any(token in normalized for token in ("暑期实习", "暑假实习", "summerintern", "summerinternship")):
        return "暑期实习"
    if any(token in normalized for token in ("社招", "社会招聘", "experiencedhire", "experiencedhiring")):
        return "社招"
    if any(token in normalized for token in (
        "普通实习", "日常实习", "寒假实习", "冬季实习", "实习生", "实习",
        "internship", "intern", "offcycle", "winterintern",
    )):
        return "普通实习"
    if any(token in normalized for token in (
        "秋招", "春招", "校招", "校园招聘", "提前批", "补招", "补录", "graduateprogram",
    )):
        return "校招"
    return ""


def normalize_recruitment_batch(value: str) -> str:
    """Collapse wording variants while preserving genuinely distinct hiring stages."""
    normalized = re.sub(r"(?:20)?\d{2}届", "", normalize_text(value))
    if not normalized:
        return ""
    is_autumn = "秋" in normalized
    is_spring = "春" in normalized
    if is_autumn and "提前" in normalized:
        return "秋招提前批"
    if is_autumn and any(token in normalized for token in ("补招", "补录")):
        return "秋招补录"
    if is_spring and any(token in normalized for token in ("补招", "补录")):
        return "春招补录"
    if is_autumn:
        return "秋招"
    if is_spring:
        return "春招"
    recruitment_type = canonical_recruitment_type(normalized)
    if recruitment_type:
        return recruitment_type
    if any(token in normalized for token in ("校招", "校园招聘", "graduateprogram")):
        return "校招"
    return normalized


def recruitment_type_match(
    recruitment_batch: str,
    excluded_recruitment_types: Sequence[str],
    *,
    project_name: str = "",
    announcement_title: str = "",
    job_positions: str = "",
    job_scope_complete: bool = False,
) -> bool | None:
    """Return whether explicit recruitment-type evidence passes confirmed exclusions.

    Generic, daily, winter and English internship labels map to ``普通实习``;
    summer internships remain a separate preference category. Conflicting explicit
    evidence is uncertain rather than silently weakened.
    """
    excluded = {
        canonical
        for value in excluded_recruitment_types
        if (canonical := canonical_recruitment_type(str(value)))
    }
    evidence_types = {
        canonical
        for value in (recruitment_batch, project_name, announcement_title)
        if (canonical := canonical_recruitment_type(value))
    }
    if job_scope_complete and job_positions.strip():
        roles = [
            item.strip()
            for item in re.split(r"[、,，;；/|\n]+", job_positions)
            if item.strip()
        ]
        role_types = [canonical_recruitment_type(role) for role in roles]
        if roles and all(role_types):
            evidence_types.update(role_types)
    if not evidence_types:
        return None
    excluded_evidence = {value for value in evidence_types if value in excluded}
    if not excluded_evidence:
        return True
    if excluded_evidence == evidence_types:
        return False
    return None


def recruitment_fingerprint(
    company: str, batch: str, project_or_title: str
) -> str:
    return "|".join(
        normalize_text(value) for value in (company, batch, project_or_title)
    )
