#!/usr/bin/env python3
"""Create a bounded 90-day FutureCast fixture that can never authorize release."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import polars as pl

from build_futurecast_examples import HF_BANDS
from futurecast_examples import FEATURES


ROOT = Path(__file__).resolve().parents[3]
V4_2 = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(V4_2))

from m5_runtime import validate_m5_runtime  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/futurecast_v1.json"
RUNTIME_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
UTC = timezone.utc
SYNTHETIC_PATHS_PER_BAND = 200


def grid4(index: int) -> str:
    value = index % (18 * 18 * 10 * 10)
    longitude_field = value % 18
    value //= 18
    latitude_field = value % 18
    value //= 18
    longitude_square = value % 10
    latitude_square = value // 10
    return (
        f"{chr(ord('A') + longitude_field)}"
        f"{chr(ord('A') + latitude_field)}"
        f"{longitude_square}{latitude_square}"
    )


PATHS = tuple(
    (
        grid4(path_index * 137),
        grid4(path_index * 257 + 10_009),
    )
    for path_index in range(SYNTHETIC_PATHS_PER_BAND)
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(
        json.dumps(payload, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def atomic_parquet(frame: pl.DataFrame, path: Path) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.unlink(missing_ok=True)
    frame.write_parquet(temporary, compression="zstd", statistics=True)
    os.chmod(temporary, 0o600)
    temporary.replace(path)
    return {
        "path": str(path),
        "rows": frame.height,
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def days(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def forecast_value(metric: str, *, day_offset: int, valid_offset: int) -> float:
    cycle = math.sin((day_offset + valid_offset) / 9.0)
    if metric == "f107":
        return 115.0 + 30.0 * cycle
    if metric in {"ap", "planetary_ap"}:
        return 9.0 + 5.0 * (1.0 + cycle)
    if metric == "mid_latitude_k":
        return 2.0 + 0.8 * (1.0 + cycle)
    if metric == "high_latitude_k":
        return 3.0 + 1.0 * (1.0 + cycle)
    raise ValueError(metric)


def forecast_rows(start: date, count: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for offset in range(count):
        issue_day = start + timedelta(days=offset)
        issued_at = datetime.combine(issue_day, time(0), tzinfo=UTC)
        available_at = issued_at + timedelta(minutes=5)
        for (product, metric), cadence in FEATURES.items():
            valid_times = (
                [issued_at, issued_at + timedelta(days=1)]
                if cadence == 24
                else [issued_at + timedelta(hours=value) for value in (0, 3, 6, 12, 24)]
            )
            payload = hashlib.sha256(f"{product}|{issue_day}".encode()).hexdigest()
            for valid_at in valid_times:
                rows.append(
                    {
                        "payload_sha256": payload,
                        "product": product,
                        "issued_at": issued_at,
                        "valid_at": valid_at,
                        "available_at": available_at,
                        "metric": metric,
                        "value": forecast_value(
                            metric,
                            day_offset=offset,
                            valid_offset=(valid_at.date() - issue_day).days,
                        ),
                        "unit": None,
                        "quality": "forecast",
                    }
                )
    return rows


def hourly_rows(
    day: date,
    *,
    start: date,
    provider: str,
    transform: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    watermarks: list[dict[str, Any]] = []
    paths: list[dict[str, Any]] = []
    for hour in range(24):
        target = datetime.combine(day, time(hour), tzinfo=UTC)
        available = target + timedelta(hours=1, minutes=15)
        source_watermark = target + timedelta(hours=1)
        day_offset = (day - start).days
        solar = math.sin(day_offset / 9.0)
        for band_index, band in enumerate(HF_BANDS):
            watermarks.append(
                {
                    "target_hour": target,
                    "band": band,
                    "available_at": available,
                    "status": "complete",
                    "source_watermark": source_watermark,
                    "observation_count": len(PATHS) * 100,
                    "feature_cell_count": len(PATHS),
                    "provider": provider,
                    "transform_version": transform,
                    "quality_flags": [],
                }
            )
            for path_index, (tx_grid4, rx_grid4) in enumerate(PATHS):
                phase = (
                    -1.4
                    + 0.9 * solar
                    + 0.8 * math.cos((hour - band_index * 1.7) * math.pi / 12)
                    + 0.18 * path_index
                    - 0.05 * abs(band_index - 5)
                )
                probability = 1.0 / (1.0 + math.exp(-phase))
                opportunities = 100.0
                successes = float(round(probability * opportunities))
                paths.append(
                    {
                        "target_hour": target,
                        "band": band,
                        "tx_grid4": tx_grid4,
                        "rx_grid4": rx_grid4,
                        "successes": successes,
                        "opportunities": opportunities,
                        "success_rate": successes / opportunities,
                        "sampled_rows": int(opportunities),
                        "positive_rows": int(successes),
                        "available_at": available,
                        "source_watermark": source_watermark,
                        "provider": provider,
                        "transform_version": transform,
                        "quality_flags": [],
                    }
                )
    return watermarks, paths


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    args.config = args.config.expanduser().resolve()
    output_root = args.output_root.expanduser().resolve()
    if output_root.is_relative_to(ROOT):
        raise RuntimeError("synthetic FutureCast data must remain outside the repository")
    manifest_path = output_root / "SOURCE_EXPORT_MANIFEST.json"
    if manifest_path.exists() and not args.force:
        raise RuntimeError("synthetic FutureCast fixture already exists")
    output_root.mkdir(parents=True, exist_ok=True)
    os.chmod(output_root, 0o700)
    config = json.loads(args.config.read_text(encoding="utf-8"))
    validate_m5_runtime(json.loads(RUNTIME_CONFIG.read_text(encoding="utf-8")))
    start = date(2026, 1, 1)
    count = int(config["minimum_consecutive_common_days"])
    end = start + timedelta(days=count - 1)
    provider = str(config["wspr"]["provider"])
    transform = str(config["wspr"]["transform_version"])

    files = [
        atomic_parquet(
            pl.DataFrame(forecast_rows(start, count)),
            output_root / "forecast_values.parquet",
        )
    ]
    for day in days(start - timedelta(days=1), end + timedelta(days=2)):
        watermarks, paths = hourly_rows(
            day,
            start=start,
            provider=provider,
            transform=transform,
        )
        partition = f"target_date={day.isoformat()}"
        files.append(
            atomic_parquet(
                pl.DataFrame(watermarks),
                output_root / "wspr_watermarks" / partition / "part-000.parquet",
            )
        )
        files.append(
            atomic_parquet(
                pl.DataFrame(paths),
                output_root / "wspr_paths" / partition / "part-000.parquet",
            )
        )
    manifest = {
        "schema_version": 1,
        "generated_at": datetime.now(UTC).isoformat(),
        "scope": "futurecast_v1_private_source_export",
        "data_scope": "synthetic_fixture",
        "decision": "development_sources_frozen",
        "release_approved": False,
        "config_sha256": sha256(args.config),
        "readiness_sha256": None,
        "window": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "days": count,
        },
        "source_tables": [
            "synthetic.space_weather_forecast_values",
            "synthetic.wspr_feature_watermarks",
            "synthetic.wspr_path_hourly_features",
        ],
        "privacy": {
            "raw_wspr_observations_read": False,
            "callsigns_read": False,
            "station_identity_read": False,
            "equipment_read": False,
            "beta_outcomes_read": False,
            "core_prospective_outcomes_read": False,
            "private_grid4_metadata_exported": True,
            "repository_artifact_written": False,
        },
        "execution": {
            "batch_rows": None,
            "parquet_row_group_rows": None,
            "database_transaction_read_only": None,
            "database_identifier_recorded": False,
            "files": files,
        },
    }
    atomic_json(manifest_path, manifest)
    print(manifest_path)


if __name__ == "__main__":
    main()
