#!/usr/bin/env python3
"""Pure helper functions used by multi-source sync implementations."""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, time, timedelta
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
PROFILE_FIELD_NAMES = (
    "graduation_year",
    "target_cities",
    "city_filter_mode",
    "excluded_companies",
    "excluded_industries",
    "excluded_recruitment_types",
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
    value = url.strip()
    if not value.lower().startswith(("http://", "https://")):
        return value
    parsed = urlparse(value)
    query = [
        (key, val)
        for key, val in parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in TRACKING_QUERY_KEYS
    ]
    path = parsed.path.rstrip("/") or "/"
    return urlunparse(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            path,
            "",
            urlencode(sorted(query)),
            "",
        )
    )


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lower().strip()
    return re.sub(r"[\W_]+", "", normalized, flags=re.UNICODE)


def recruitment_fingerprint(
    company: str, batch: str, project_or_title: str
) -> str:
    return "|".join(
        normalize_text(value) for value in (company, batch, project_or_title)
    )
