"""Create the publishable V3 source and provenance registry."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from build_space_weather import month_bounds
from common import (
    MANIFESTS,
    RAW,
    load_config,
    relative,
    sha256,
    utc_now,
    write_json,
    wspr_raw_path,
)


def retrieved_at(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()


def source_row(
    path: Path,
    url: str,
    role: str,
    terms_url: str,
    license_note: str,
    digest: str | None = None,
) -> dict:
    if not path.exists():
        raise FileNotFoundError(path)
    return {
        "role": role,
        "path": relative(path),
        "url": url,
        "retrieved_at": retrieved_at(path),
        "bytes": path.stat().st_size,
        "sha256": digest or sha256(path),
        "source_status": "public archive snapshot",
        "terms_url": terms_url,
        "license_note": license_note,
        "parser_version": "archive_v3_schema_1",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    bronze_path = MANIFESTS / f"{config['run_id']}_bronze.json"
    bronze = json.loads(bronze_path.read_text()) if bronze_path.exists() else {"months": []}
    bronze_by_month = {row["month"]: row for row in bronze.get("months", [])}
    sources = []
    for month in config["months"]:
        sources.append(
            source_row(
                wspr_raw_path(month),
                f"https://www.wsprnet.org/archive/wsprspots-{month}.csv.gz",
                "Primary WSPR decode and inferred-exposure observations",
                "https://www.wsprnet.org/archive/",
                "No explicit redistribution license is stated; raw files remain ignored.",
                bronze_by_month.get(month, {}).get("source_sha256"),
            )
        )
    for year in sorted({int(month[:4]) for month in config["months"]}):
        path = RAW / f"omni/omni2_{year}.dat"
        sources.append(
            source_row(
                path,
                f"https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/omni2_{year}.dat",
                "Lagged hourly solar-wind and geomagnetic features",
                "https://omniweb.gsfc.nasa.gov/html/ow_data.html",
                "NASA/SPDF acknowledgement required; definitive or reprocessed values.",
            )
        )
    for month in config["months"]:
        path = RAW / f"gfz/hp60-{month}.json"
        start, end = month_bounds(month)
        request_start = (start - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        request_end = (end + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        sources.append(
            source_row(
                path,
                "https://kp.gfz.de/app/json/"
                f"?start={request_start}&end={request_end}&index=Hp60",
                "Lagged hourly high-cadence geomagnetic index",
                "https://kp.gfz.de/en/hp30-hp60/data",
                "GFZ Hp60 is provided under CC BY 4.0; retain attribution.",
            )
        )
    write_json(
        MANIFESTS / f"{config['run_id']}_sources.json",
        {
            "schema_version": 1,
            "generated_at": utc_now(),
            "run_id": config["run_id"],
            "config_path": config["config_path"],
            "sources": sources,
        },
    )
    print(f"{len(sources)} sources recorded")


if __name__ == "__main__":
    main()
