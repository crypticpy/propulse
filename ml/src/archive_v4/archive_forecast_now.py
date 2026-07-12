#!/usr/bin/env python3
"""Capture current NOAA forecast issuances into the immutable V4 archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "ml/data/raw/archive_v4/forecast_issuances"
STATUS = ROOT / "ml/results/propagation_v4/forecast_archive_status.json"
SOURCES = {
    "noaa_45_day": "https://services.swpc.noaa.gov/json/45-day-forecast.json",
    "noaa_3_day": "https://services.swpc.noaa.gov/text/3-day-solar-geomag-predictions.txt",
}


def fetch(url: str) -> tuple[bytes, dict[str, str]]:
    request = urllib.request.Request(
        url, headers={"User-Agent": "Propulse-V4-Forecast-Archive/1.0"}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read(), {key.lower(): value for key, value in response.headers.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    captured_at = datetime.now(timezone.utc)
    capture_id = captured_at.strftime("%Y%m%dT%H%M%SZ")
    output_rows: list[dict[str, Any]] = []
    for name, url in SOURCES.items():
        payload, headers = fetch(url)
        digest = hashlib.sha256(payload).hexdigest()
        suffix = ".json" if name.endswith("45_day") else ".txt"
        directory = RAW / f"source={name}" / f"date={captured_at:%Y-%m-%d}"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{capture_id}-{digest[:12]}{suffix}"
        if path.exists() and not args.force:
            pass
        else:
            path.write_bytes(payload)
        output_rows.append(
            {
                "source": name,
                "url": url,
                "captured_at": captured_at.isoformat(),
                "http_date": headers.get("date"),
                "last_modified": headers.get("last-modified"),
                "etag": headers.get("etag"),
                "bytes": len(payload),
                "sha256": digest,
                "path": str(path.relative_to(ROOT)),
            }
        )
    existing: dict[str, Any] = {"schema_version": 1, "captures": []}
    if STATUS.exists():
        existing = json.loads(STATUS.read_text(encoding="utf-8"))
    known = {(row["source"], row["sha256"]) for row in existing["captures"]}
    existing["captures"].extend(
        row for row in output_rows if (row["source"], row["sha256"]) not in known
    )
    existing["last_capture_at"] = captured_at.isoformat()
    existing["schedule"] = "collector/src/collectors/forecast.ts every 6 hours"
    existing["operational_note"] = (
        "Local capture proves the archive path; deployment migration and service-role "
        "collector are required for continuous production history."
    )
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    STATUS.write_text(json.dumps(existing, indent=2) + "\n", encoding="utf-8")
    print(STATUS)


if __name__ == "__main__":
    main()
