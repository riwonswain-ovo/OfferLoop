#!/usr/bin/env python3
"""Pure helper functions used by multi-source sync implementations."""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime, time, timedelta
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse


TRACKING_QUERY_KEYS = {"from", "spm", "track", "tracking_id"}


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
