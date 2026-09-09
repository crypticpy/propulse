"""Versioned archive coverage evidence, kept separate from model row schemas."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone


KNOWN_GAPS_CONTRACT = "spot-known-gaps-v1"
PARQUET_COVERAGE_KEY = b"propulse.coverage.evidence"
SUPPORTED_CONTRACTS = frozenset({KNOWN_GAPS_CONTRACT})


def _utc(value: datetime) -> str:
    if value.tzinfo is None:
        raise ValueError("coverage timestamps must be timezone-aware")
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )


def canonical_coverage(
    value: object,
    contract: str,
    range_start: datetime,
    range_end: datetime,
) -> dict[str, object]:
    if contract not in SUPPORTED_CONTRACTS:
        raise RuntimeError(f"unsupported archive coverage contract: {contract}")
    if not isinstance(value, dict):
        raise RuntimeError("archive coverage evidence is not an object")
    if (
        range_start.tzinfo is None
        or range_end.tzinfo is None
        or range_start.utcoffset() != timedelta(0)
        or range_end.utcoffset() != timedelta(0)
        or range_start.minute != 0
        or range_start.second != 0
        or range_start.microsecond != 0
        or range_end.minute != 0
        or range_end.second != 0
        or range_end.microsecond != 0
        or range_end <= range_start
        or range_end - range_start > timedelta(days=32)
    ):
        raise RuntimeError("archive coverage partition range is invalid")
    expected_keys = {"version", "scope", "range_start", "range_end", "gaps"}
    if (
        set(value) != expected_keys
        or type(value.get("version")) is not int
        or value.get("version") != 1
        or value.get("scope") != "known-gaps-only"
    ):
        raise RuntimeError("archive coverage evidence has an invalid shape")
    if value.get("range_start") != _utc(range_start) or value.get("range_end") != _utc(range_end):
        raise RuntimeError("archive coverage evidence range does not match partition")
    gaps = value.get("gaps")
    if not isinstance(gaps, list) or len(gaps) > 1000:
        raise RuntimeError("archive coverage gap list is invalid")
    canonical_gaps: list[dict[str, str]] = []
    previous_start: str | None = None
    for item in gaps:
        if not isinstance(item, dict) or set(item) != {"start_hour", "end_hour", "recorded_at", "reason"}:
            raise RuntimeError("archive coverage gap has an invalid shape")
        if not all(
            isinstance(item[key], str)
            for key in ("start_hour", "end_hour", "recorded_at", "reason")
        ):
            raise RuntimeError("archive coverage gap values must be strings")
        gap = {
            key: item[key]
            for key in ("start_hour", "end_hour", "recorded_at", "reason")
        }
        if gap["reason"] != "raw_expired" or previous_start is not None and gap["start_hour"] <= previous_start:
            raise RuntimeError("archive coverage gaps are not canonical")
        for key in ("start_hour", "end_hour", "recorded_at"):
            try:
                parsed = datetime.fromisoformat(gap[key].replace("Z", "+00:00"))
            except ValueError as error:
                raise RuntimeError("archive coverage gap timestamp is invalid") from error
            if parsed.tzinfo is None or _utc(parsed) != gap[key]:
                raise RuntimeError("archive coverage gap timestamp is not canonical UTC")
        if not gap["start_hour"].endswith(":00:00.000000Z") or not gap["end_hour"].endswith(":00:00.000000Z"):
            raise RuntimeError("archive coverage gap bounds are not aligned hours")
        if gap["end_hour"] < gap["start_hour"] or gap["start_hour"] >= _utc(range_end) or gap["end_hour"] < _utc(range_start):
            raise RuntimeError("archive coverage gap does not overlap the partition")
        previous_start = gap["start_hour"]
        canonical_gaps.append(gap)
    return {
        "version": 1,
        "scope": "known-gaps-only",
        "range_start": _utc(range_start),
        "range_end": _utc(range_end),
        "gaps": canonical_gaps,
    }


def coverage_bytes(value: dict[str, object]) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def coverage_from_metadata(metadata: dict[bytes, bytes] | None) -> object | None:
    if not metadata or PARQUET_COVERAGE_KEY not in metadata:
        return None
    try:
        return json.loads(metadata[PARQUET_COVERAGE_KEY].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("Parquet coverage metadata is invalid") from error
