#!/usr/bin/env python3
"""Gate FutureCast on real issued-forecast history rather than oracle backfills."""

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_STATUS = ROOT / "ml/results/propagation_v4/forecast_archive_status.json"
DEFAULT_OUTPUT = ROOT / "ml/results/propagation_v4/futurecast_readiness.json"


def assess(captures: list[dict[str, Any]], minimum_days: int) -> dict[str, Any]:
    parsed = [
        (row["source"], datetime.fromisoformat(row["captured_at"]))
        for row in captures
    ]
    days_by_source: dict[str, set[str]] = {}
    for source, captured_at in parsed:
        days_by_source.setdefault(source, set()).add(captured_at.date().isoformat())
    required = {"noaa_45_day", "noaa_3_day"}
    source_rows = {
        source: {
            "unique_payloads": sum(row["source"] == source for row in captures),
            "unique_capture_days": len(days_by_source.get(source, set())),
            "first_capture_day": min(days_by_source[source]) if days_by_source.get(source) else None,
            "last_capture_day": max(days_by_source[source]) if days_by_source.get(source) else None,
        }
        for source in sorted(required | set(days_by_source))
    }
    ready = required.issubset(days_by_source) and all(
        len(days_by_source[source]) >= minimum_days for source in required
    )
    return {
        "minimum_distinct_capture_days": minimum_days,
        "sources": source_rows,
        "required_sources_present": sorted(required & set(days_by_source)),
        "issued_forecast_training_ready": ready,
        "release_approved": False,
        "horizons": {
            str(hours): {
                "status": "eligible_for_development" if ready else "withheld_insufficient_issued_history"
            }
            for hours in (3, 6, 12, 24)
        },
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
        "generated_at": datetime.now().astimezone().isoformat(),
        "archive_status": str(args.status.relative_to(ROOT)),
        **assess(status.get("captures", []), args.minimum_days),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
