"""Pure, sanitized status helpers for OfferLoop Setup."""

from __future__ import annotations

from collections import defaultdict


VALID_CAPABILITIES = {"collection", "reminder", "workspace", "integration"}
VALID_STATUSES = {
    "ready",
    "needs_action",
    "blocked",
    "unverified",
    "not_selected",
}
STATUS_PRECEDENCE = {
    "not_selected": 0,
    "ready": 1,
    "unverified": 2,
    "needs_action": 3,
    "blocked": 4,
}


def expand_selection(capability):
    """Return internal capabilities selected by one user-facing choice."""
    if capability == "full":
        return set(VALID_CAPABILITIES)
    if capability in VALID_CAPABILITIES - {"integration"}:
        return {capability}
    raise ValueError(f"unknown capability: {capability}")


def aggregate_status(statuses):
    """Return the highest-priority status, or ready for an empty selected check set."""
    values = list(statuses)
    if not values:
        return "ready"
    unknown = set(values) - VALID_STATUSES
    if unknown:
        raise ValueError(f"unknown status: {', '.join(sorted(unknown))}")
    return max(values, key=STATUS_PRECEDENCE.__getitem__)


def build_report(*, selected, checks, schema_version=1):
    """Build a report that never needs to expose raw config or command output."""
    selected_set = set(selected)
    unknown = selected_set - VALID_CAPABILITIES
    if unknown:
        raise ValueError(f"unknown selected capability: {', '.join(sorted(unknown))}")

    grouped = defaultdict(list)
    for check in checks:
        capability = check["capability"]
        status = check["status"]
        if capability not in VALID_CAPABILITIES:
            raise ValueError(f"unknown check capability: {capability}")
        if status not in VALID_STATUSES - {"not_selected"}:
            raise ValueError(f"unknown check status: {status}")
        grouped[capability].append(status)

    capabilities = {}
    for capability in sorted(VALID_CAPABILITIES):
        if capability not in selected_set:
            capabilities[capability] = {"status": "not_selected"}
            continue
        capabilities[capability] = {
            "status": aggregate_status(grouped[capability]),
        }

    selected_statuses = [
        capabilities[capability]["status"]
        for capability in selected_set
    ]
    return {
        "schema_version": schema_version,
        "selected": sorted(selected_set),
        "overall_status": aggregate_status(selected_statuses),
        "capabilities": capabilities,
        "checks": list(checks),
    }
