#!/usr/bin/env python3
"""Summarize M5 forecast receipts and refresh the FutureCast readiness gate."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / "ml/src/archive_v4"
sys.path.insert(0, str(MODULE))

from assess_futurecast_readiness import assess  # noqa: E402


PRODUCT_SOURCES = {
    "noaa_45_day_ap_f107": "noaa_45_day",
    "noaa_3_day_solar_geomagnetic": "noaa_3_day",
}


def flatten_receipts(paths: list[Path]) -> list[dict[str, Any]]:
    captures: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for path in sorted(paths):
        receipt = json.loads(path.read_text(encoding="utf-8"))
        if receipt.get("schemaVersion") != 1:
            raise RuntimeError(f"unsupported forecast receipt schema: {path}")
        receipt_captured_at = receipt.get("capturedAt")
        products = receipt.get("products")
        if not isinstance(products, list) or len(products) != 2:
            raise RuntimeError(f"forecast receipt must contain two products: {path}")
        for product in products:
            product_name = product.get("product")
            source = PRODUCT_SOURCES.get(product_name)
            if source is None:
                raise RuntimeError(f"unexpected forecast product {product_name!r}: {path}")
            captured_at = product.get("capturedAt")
            if captured_at != receipt_captured_at:
                raise RuntimeError(f"product capture time differs from receipt: {path}")
            key = (source, str(product.get("issuedAt")), str(product.get("payloadSha256")))
            if key in seen:
                continue
            seen.add(key)
            captures.append({
                "source": source,
                "product": product_name,
                "issued_at": product.get("issuedAt"),
                "captured_at": captured_at,
                "sha256": product.get("payloadSha256"),
                "value_count": product.get("valueCount"),
                "metrics": product.get("metrics", []),
                "valid_start": product.get("validStart"),
                "valid_end": product.get("validEnd"),
                "lead_minutes_min": product.get("leadMinutesMin"),
                "lead_minutes_max": product.get("leadMinutesMax"),
                "horizons_covered": product.get("horizonsCovered", []),
                "receipt": path.name,
            })
    return captures


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipt-dir", type=Path, required=True)
    parser.add_argument("--status-output", type=Path, required=True)
    parser.add_argument("--readiness-output", type=Path, required=True)
    parser.add_argument("--minimum-days", type=int, default=90)
    args = parser.parse_args()
    captures = flatten_receipts(list(args.receipt_dir.glob("*.json")))
    generated_at = datetime.now(timezone.utc).isoformat()
    status = {
        "schema_version": 2,
        "generated_at": generated_at,
        "captures": captures,
        "last_capture_at": max(
            (row["captured_at"] for row in captures),
            default=None,
        ),
        "schedule": "M5 forecast-only LaunchAgent every 6 hours",
        "raw_rows_redistributed": False,
    }
    readiness = {
        "schema_version": 2,
        "generated_at": generated_at,
        "archive_status": str(args.status_output),
        **assess(captures, args.minimum_days),
    }
    atomic_write(args.status_output, status)
    atomic_write(args.readiness_output, readiness)
    print(json.dumps({
        "captures": len(captures),
        "ready": readiness["issued_forecast_training_ready"],
        "status": str(args.status_output),
        "readiness": str(args.readiness_output),
    }))


if __name__ == "__main__":
    main()
