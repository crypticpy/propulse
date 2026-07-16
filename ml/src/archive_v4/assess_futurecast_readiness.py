#!/usr/bin/env python3
"""Gate FutureCast on real issued-forecast history rather than oracle backfills."""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_STATUS = ROOT / "ml/results/propagation_v4/forecast_archive_status.json"
DEFAULT_OUTPUT = ROOT / "ml/results/propagation_v4/futurecast_readiness.json"


HORIZONS = (3, 6, 12, 24)
REQUIRED_SOURCES = {"noaa_45_day", "noaa_3_day"}


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("forecast archive timestamps must include a timezone")
    return parsed.astimezone(timezone.utc)


def consecutive_day_runs(days: set[date]) -> list[tuple[date, date]]:
    runs: list[tuple[date, date]] = []
    start: date | None = None
    previous: date | None = None
    for day in sorted(days):
        if previous is None or day != previous + timedelta(days=1):
            if start is not None and previous is not None:
                runs.append((start, previous))
            start = day
        previous = day
    if start is not None and previous is not None:
        runs.append((start, previous))
    return runs


def run_days(run: tuple[date, date]) -> int:
    return (run[1] - run[0]).days + 1


def longest_consecutive_days(days: set[date]) -> int:
    return max((run_days(run) for run in consecutive_day_runs(days)), default=0)


def first_qualifying_window(
    days: set[date], minimum_days: int
) -> tuple[date, date] | None:
    for start, end in consecutive_day_runs(days):
        if run_days((start, end)) >= minimum_days:
            return start, start + timedelta(days=minimum_days - 1)
    return None


def assess(captures: list[dict[str, Any]], minimum_days: int) -> dict[str, Any]:
    if minimum_days < 1:
        raise ValueError("minimum_days must be positive")
    days_by_source: dict[str, set[date]] = {}
    legal_capture_days_by_source: dict[str, set[date]] = {}
    horizon_days: dict[str, dict[int, set[date]]] = {}
    payloads_by_source: dict[str, set[str]] = {}
    invalid_by_source: dict[str, int] = {}
    invalid_reasons: dict[str, int] = {}
    capture_days_by_source: dict[str, set[date]] = {}
    first_issue_by_source: dict[str, datetime] = {}
    last_issue_by_source: dict[str, datetime] = {}
    parsed_sources: set[str] = set()
    for row in captures:
        source = str(row.get("source", ""))
        if not source:
            invalid_reasons["missing_source"] = invalid_reasons.get("missing_source", 0) + 1
            continue
        parsed_sources.add(source)
        try:
            captured_at = parse_time(str(row["captured_at"]))
            issued_at = parse_time(str(row.get("issued_at", row["captured_at"])))
        except (KeyError, TypeError, ValueError):
            invalid_by_source[source] = invalid_by_source.get(source, 0) + 1
            invalid_reasons["invalid_timestamp"] = invalid_reasons.get("invalid_timestamp", 0) + 1
            continue
        capture_days_by_source.setdefault(source, set()).add(captured_at.date())
        days_by_source.setdefault(source, set()).add(issued_at.date())
        first_issue_by_source[source] = min(first_issue_by_source.get(source, issued_at), issued_at)
        last_issue_by_source[source] = max(last_issue_by_source.get(source, issued_at), issued_at)
        payload_sha256 = row.get("sha256") or row.get("payload_sha256")
        hash_valid = payload_sha256 is None or (
            isinstance(payload_sha256, str)
            and len(payload_sha256) == 64
            and all(character in "0123456789abcdef" for character in payload_sha256)
        )
        if captured_at < issued_at or not hash_valid:
            reason = "capture_before_issue" if captured_at < issued_at else "invalid_payload_hash"
            invalid_by_source[source] = invalid_by_source.get(source, 0) + 1
            invalid_reasons[reason] = invalid_reasons.get(reason, 0) + 1
            continue
        legal_capture_days_by_source.setdefault(source, set()).add(captured_at.date())
        if payload_sha256:
            payloads_by_source.setdefault(source, set()).add(payload_sha256)
        covered = {int(value) for value in row.get("horizons_covered", [])}
        for horizon in HORIZONS:
            if horizon in covered:
                horizon_days.setdefault(source, {}).setdefault(horizon, set()).add(
                    captured_at.date()
                )

    source_rows = {
        source: {
            "capture_records": sum(row.get("source") == source for row in captures),
            "unique_payloads": len(payloads_by_source.get(source, set())),
            "unique_capture_days": len(capture_days_by_source.get(source, set())),
            "unique_issue_days": len(days_by_source.get(source, set())),
            "legal_capture_days": len(
                legal_capture_days_by_source.get(source, set())
            ),
            "first_issue_at": first_issue_by_source[source].isoformat()
            if source in first_issue_by_source
            else None,
            "last_issue_at": last_issue_by_source[source].isoformat()
            if source in last_issue_by_source
            else None,
            "invalid_captures": invalid_by_source.get(source, 0),
        }
        for source in sorted(REQUIRED_SOURCES | parsed_sources)
    }
    horizon_rows: dict[str, dict[str, Any]] = {}
    for horizon in HORIZONS:
        common_days = set.intersection(*[
            horizon_days.get(source, {}).get(horizon, set())
            for source in sorted(REQUIRED_SOURCES)
        ])
        runs = consecutive_day_runs(common_days)
        longest_run = max(runs, key=run_days) if runs else None
        consecutive_days = run_days(longest_run) if longest_run else 0
        qualifying_window = first_qualifying_window(common_days, minimum_days)
        eligible = consecutive_days >= minimum_days
        horizon_rows[str(horizon)] = {
            "status": "eligible_for_development"
            if eligible
            else "withheld_insufficient_issued_history",
            "common_legal_capture_days": len(common_days),
            "common_legal_capture_start": min(common_days).isoformat()
            if common_days
            else None,
            "common_legal_capture_end": max(common_days).isoformat()
            if common_days
            else None,
            "longest_consecutive_common_days": consecutive_days,
            "longest_run_start": longest_run[0].isoformat()
            if longest_run
            else None,
            "longest_run_end": longest_run[1].isoformat()
            if longest_run
            else None,
            "qualifying_window_start": qualifying_window[0].isoformat()
            if qualifying_window
            else None,
            "qualifying_window_end": qualifying_window[1].isoformat()
            if qualifying_window
            else None,
        }
    ready = all(row["status"] == "eligible_for_development" for row in horizon_rows.values())
    return {
        "minimum_distinct_capture_days": minimum_days,
        "sources": source_rows,
        "required_sources_present": sorted(REQUIRED_SOURCES & parsed_sources),
        "invalid_capture_count": sum(invalid_by_source.values()),
        "invalid_reasons": invalid_reasons,
        "issued_forecast_training_ready": ready,
        "release_approved": False,
        "horizons": horizon_rows,
        "prohibitions": [
            "Do not substitute observed OMNI/GFZ values for historical forecast issuances.",
            "Do not release a horizon before time-held-out skill and calibration gates pass.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status", type=Path, default=DEFAULT_STATUS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--minimum-days", type=int, default=90)
    args = parser.parse_args()
    status = json.loads(args.status.read_text(encoding="utf-8"))
    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "archive_status": str(args.status.relative_to(ROOT)),
        **assess(status.get("captures", []), args.minimum_days),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
