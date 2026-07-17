#!/usr/bin/env python3
"""Inventory V4 WSPR archive objects without reading outcome rows."""

from __future__ import annotations

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
URL = "https://www.wsprnet.org/archive/wsprspots-{month}.csv.gz"


def head(month: str) -> dict:
    url = URL.format(month=month)
    request = urllib.request.Request(
        url,
        method="HEAD",
        headers={"User-Agent": "Propulse-Archive-V4/1.0"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return {
            "month": month,
            "url": url,
            "status": response.status,
            "content_length": int(response.headers.get("Content-Length", 0)),
            "last_modified": response.headers.get("Last-Modified"),
            "etag": response.headers.get("ETag"),
            "accept_ranges": response.headers.get("Accept-Ranges"),
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="ml/config/propagation_v4.json")
    parser.add_argument(
        "--output",
        default="ml/results/propagation_v4/preregistration/remote_inventory.json",
    )
    args = parser.parse_args()
    config_path = ROOT / args.config
    config = json.loads(config_path.read_text())
    rows = []
    for month in config["months"]:
        row = head(month)
        rows.append(row)
        print(f"{month}: {row['content_length']:,} bytes", flush=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": "HTTP HEAD only; archive contents were not read",
        "objects": rows,
        "total_compressed_bytes": sum(row["content_length"] for row in rows),
        "split_compressed_bytes": {
            name: sum(
                row["content_length"]
                for row in rows
                if row["month"] in months
            )
            for name, months in {
                "train": config["splits"]["train"],
                "validation": config["splits"]["validation"],
                "locked_archive_test": config["splits"]["locked_archive_test"],
            }.items()
        },
    }
    output = ROOT / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"total: {payload['total_compressed_bytes']:,} bytes")


if __name__ == "__main__":
    main()
