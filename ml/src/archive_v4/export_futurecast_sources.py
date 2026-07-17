#!/usr/bin/env python3
"""Stream the first mature FutureCast source window to private M5 Parquet."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import pyarrow as pa
import pyarrow.parquet as pq
import polars as pl
import psycopg
from psycopg.rows import dict_row

from build_futurecast_examples import HF_BANDS, derive_legal_issues


ROOT = Path(__file__).resolve().parents[3]
V4_2 = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(V4_2))

from m5_runtime import validate_m5_runtime  # noqa: E402
from validate_live_feature_migration import (  # noqa: E402
    current_project_pooler_url,
    read_env,
)


DEFAULT_CONFIG = ROOT / "ml/config/futurecast_v1.json"
RUNTIME_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_ENV = ROOT / ".env.local"
DEFAULT_POOLER_URL = ROOT / "supabase/.temp/pooler-url"
DEFAULT_READINESS = (
    Path.home()
    / "Library/Application Support/PropulseML/forecast_archive/futurecast_readiness.json"
)
REQUIRED_SOURCE_TABLES = (
    "public.space_weather_forecast_values",
    "public.wspr_feature_watermarks",
    "public.wspr_path_hourly_features",
)


FORECAST_SCHEMA = pa.schema(
    [
        ("payload_sha256", pa.string()),
        ("product", pa.string()),
        ("issued_at", pa.timestamp("us", tz="UTC")),
        ("valid_at", pa.timestamp("us", tz="UTC")),
        ("available_at", pa.timestamp("us", tz="UTC")),
        ("metric", pa.string()),
        ("value", pa.float64()),
        ("unit", pa.string()),
        ("quality", pa.string()),
    ]
)
WATERMARK_SCHEMA = pa.schema(
    [
        ("target_hour", pa.timestamp("us", tz="UTC")),
        ("band", pa.string()),
        ("available_at", pa.timestamp("us", tz="UTC")),
        ("status", pa.string()),
        ("source_watermark", pa.timestamp("us", tz="UTC")),
        ("observation_count", pa.int64()),
        ("feature_cell_count", pa.int64()),
        ("provider", pa.string()),
        ("transform_version", pa.string()),
        ("quality_flags", pa.list_(pa.string())),
    ]
)
PATH_SCHEMA = pa.schema(
    [
        ("target_hour", pa.timestamp("us", tz="UTC")),
        ("band", pa.string()),
        ("tx_grid4", pa.string()),
        ("rx_grid4", pa.string()),
        ("successes", pa.float64()),
        ("opportunities", pa.float64()),
        ("success_rate", pa.float64()),
        ("sampled_rows", pa.int64()),
        ("positive_rows", pa.int64()),
        ("available_at", pa.timestamp("us", tz="UTC")),
        ("source_watermark", pa.timestamp("us", tz="UTC")),
        ("provider", pa.string()),
        ("transform_version", pa.string()),
        ("quality_flags", pa.list_(pa.string())),
    ]
)


FORECAST_QUERY = """
SELECT payload_sha256, product, issued_at, valid_at, available_at,
       metric, value, unit, quality
FROM public.space_weather_forecast_values
WHERE available_at >= %s
  AND available_at < %s
  AND valid_at >= %s
  AND valid_at < %s
  AND quality = 'forecast'
ORDER BY available_at, product, metric, valid_at, payload_sha256
"""
WATERMARK_QUERY = """
SELECT target_hour, band, available_at, status, source_watermark,
       observation_count, feature_cell_count, provider, transform_version,
       quality_flags
FROM public.wspr_feature_watermarks
WHERE target_hour >= %s
  AND target_hour < %s
  AND provider = %s
  AND transform_version = %s
ORDER BY target_hour, band, available_at
"""
PATH_QUERY = """
SELECT target_hour, band, tx_grid4, rx_grid4, successes, opportunities,
       success_rate, sampled_rows::bigint, positive_rows::bigint,
       available_at, source_watermark, provider, transform_version,
       quality_flags
FROM public.wspr_path_hourly_features
WHERE target_hour >= %s
  AND target_hour < %s
  AND provider = %s
  AND transform_version = %s
ORDER BY target_hour, band, tx_grid4, rx_grid4, available_at
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_midnight(value: date) -> datetime:
    return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)


def qualifying_window(
    readiness: dict[str, Any], config: dict[str, Any]
) -> tuple[date, date]:
    if (
        readiness.get("issued_forecast_training_ready") is not True
        or readiness.get("release_approved") is not False
        or int(readiness.get("minimum_distinct_capture_days", 0))
        != int(config["minimum_consecutive_common_days"])
        or int(readiness.get("invalid_capture_count", -1)) != 0
    ):
        raise RuntimeError("FutureCast issued history is not ready for development")
    windows: set[tuple[str, str]] = set()
    for horizon in config["horizons_hours"]:
        row = readiness.get("horizons", {}).get(str(horizon), {})
        start = row.get("qualifying_window_start")
        end = row.get("qualifying_window_end")
        if row.get("status") != "eligible_for_development" or not start or not end:
            raise RuntimeError(f"FutureCast horizon +{horizon} is not mature")
        windows.add((str(start), str(end)))
    if len(windows) != 1:
        raise RuntimeError("FutureCast horizons do not share one frozen window")
    start_text, end_text = windows.pop()
    start = date.fromisoformat(start_text)
    end = date.fromisoformat(end_text)
    expected_days = int(config["minimum_consecutive_common_days"])
    if (end - start).days + 1 != expected_days:
        raise RuntimeError("FutureCast qualifying window length is inconsistent")
    return start, end


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(
        json.dumps(payload, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def stream_query_to_parquet(
    connection: psycopg.Connection[Any],
    *,
    query: str,
    parameters: tuple[Any, ...],
    schema: pa.Schema,
    output: Path,
    batch_rows: int,
    row_group_rows: int,
    cursor_name: str,
) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + f".tmp-{os.getpid()}")
    temporary.unlink(missing_ok=True)
    writer: pq.ParquetWriter | None = None
    rows_written = 0
    batches = 0
    started = time.perf_counter()
    try:
        with connection.cursor(name=cursor_name, row_factory=dict_row) as cursor:
            cursor.execute(query, parameters)
            while True:
                rows = cursor.fetchmany(batch_rows)
                if not rows:
                    break
                table = pa.Table.from_pylist(list(rows), schema=schema)
                if writer is None:
                    writer = pq.ParquetWriter(
                        temporary,
                        schema,
                        compression="zstd",
                        use_dictionary=True,
                        write_statistics=True,
                    )
                writer.write_table(table, row_group_size=row_group_rows)
                rows_written += len(rows)
                batches += 1
        if writer is None:
            writer = pq.ParquetWriter(
                temporary,
                schema,
                compression="zstd",
                use_dictionary=True,
                write_statistics=True,
            )
        writer.close()
        writer = None
        os.chmod(temporary, 0o600)
        temporary.replace(output)
    except Exception:
        if writer is not None:
            writer.close()
        temporary.unlink(missing_ok=True)
        raise
    return {
        "path": str(output),
        "rows": rows_written,
        "batches": batches,
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "wall_seconds": time.perf_counter() - started,
    }


def target_days(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def required_outcome_hours(
    forecast_path: Path,
    *,
    start: date,
    end: date,
    config: dict[str, Any],
) -> list[datetime]:
    issues = derive_legal_issues(
        pl.read_parquet(forecast_path),
        start=start,
        end=end,
        issue_minute=int(config["issue_minute_utc"]),
        horizons=config["horizons_hours"],
    )
    required_days = int(config["minimum_consecutive_common_days"])
    for horizon in config["horizons_hours"]:
        days = {
            datetime.fromisoformat(row["issue_time"]).date()
            for row in issues
            if int(row["horizon_hours"]) == int(horizon)
        }
        if len(days) != required_days:
            raise RuntimeError(
                f"FutureCast +{horizon} does not have {required_days} complete issue days"
            )
    return sorted(
        {
            datetime.fromisoformat(row["valid_time"]).replace(
                minute=0,
                second=0,
                microsecond=0,
            )
            for row in issues
        }
    )


def validate_outcome_watermark_maturity(
    rows: Iterable[dict[str, Any]],
    *,
    outcome_hours: Iterable[datetime],
) -> dict[str, int]:
    expected = {
        (hour.astimezone(timezone.utc), band)
        for hour in outcome_hours
        for band in HF_BANDS
    }
    complete: set[tuple[datetime, str]] = set()
    for row in rows:
        target = row.get("target_hour")
        available = row.get("available_at")
        source_watermark = row.get("source_watermark")
        if not all(isinstance(value, datetime) for value in (target, available, source_watermark)):
            continue
        target = target.astimezone(timezone.utc)
        close = target + timedelta(hours=1)
        key = (target, str(row.get("band")))
        if (
            key in expected
            and row.get("status") == "complete"
            and not row.get("quality_flags")
            and available.astimezone(timezone.utc) >= close
            and source_watermark.astimezone(timezone.utc) >= close
        ):
            complete.add(key)
    missing = expected - complete
    if missing:
        first = min(missing, key=lambda value: (value[0], value[1]))
        raise RuntimeError(
            "FutureCast WSPR outcomes are not mature; first missing "
            f"hour-band is {first[0].isoformat()} {first[1]}"
        )
    return {
        "required_hour_band_watermarks": len(expected),
        "complete_hour_band_watermarks": len(complete),
    }


def validate_output_root(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    if resolved.is_relative_to(ROOT):
        raise RuntimeError("FutureCast source exports must remain outside the repository")
    projects = Path("/Volumes/Projects").resolve()
    if not resolved.is_relative_to(projects):
        raise RuntimeError("FutureCast source exports must use the Projects volume")
    return resolved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--readiness", type=Path, default=DEFAULT_READINESS)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--pooler-url-file", type=Path, default=DEFAULT_POOLER_URL)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--preflight", action="store_true")
    parser.add_argument(
        "--acknowledge-open-futurecast-development-scope",
        action="store_true",
    )
    args = parser.parse_args()

    config = json.loads(args.config.read_text(encoding="utf-8"))
    runtime = validate_m5_runtime(
        json.loads(RUNTIME_CONFIG.read_text(encoding="utf-8"))
    )
    if runtime["physical_cores_visible"] != int(
        config["compute"]["physical_cores"]
    ):
        raise RuntimeError("FutureCast compute contract differs from the M5 runtime")
    readiness = json.loads(args.readiness.read_text(encoding="utf-8"))
    try:
        start_day, end_day = qualifying_window(readiness, config)
    except RuntimeError as error:
        if args.preflight:
            print(
                json.dumps(
                    {
                        "schema_version": 1,
                        "scope": "futurecast_v1_source_export_preflight",
                        "decision": "withheld",
                        "reason": str(error),
                        "issued_forecast_training_ready": bool(
                            readiness.get("issued_forecast_training_ready")
                        ),
                        "release_approved": False,
                    },
                    indent=2,
                )
            )
            return
        raise
    if args.preflight:
        print(
            json.dumps(
                {
                    "schema_version": 1,
                    "scope": "futurecast_v1_source_export_preflight",
                    "decision": "ready_to_export",
                    "window_start": start_day.isoformat(),
                    "window_end": end_day.isoformat(),
                    "release_approved": False,
                },
                indent=2,
            )
        )
        return
    if not args.acknowledge_open_futurecast_development_scope:
        raise RuntimeError("opening the mature FutureCast development scope requires acknowledgement")

    output_root = validate_output_root(
        args.output_root or Path(config["export"]["root"])
    )
    output_root.mkdir(parents=True, exist_ok=True)
    os.chmod(output_root, 0o700)
    manifest_path = output_root / "SOURCE_EXPORT_MANIFEST.json"
    if manifest_path.exists():
        raise RuntimeError("production FutureCast source export is already frozen")
    batch_rows = int(config["export"]["batch_rows"])
    row_group_rows = int(config["export"]["parquet_row_group_rows"])
    provider = str(config["wspr"]["provider"])
    transform = str(config["wspr"]["transform_version"])
    values = read_env(args.env_file.expanduser().resolve())
    pooler_url = current_project_pooler_url(values, args.pooler_url_file)

    window_start = utc_midnight(start_day)
    window_end_exclusive = utc_midnight(end_day + timedelta(days=1))
    forecast_start = window_start - timedelta(
        days=int(config["export"]["forecast_lookback_days"])
    )
    label_end_exclusive = window_end_exclusive + timedelta(
        hours=max(int(value) for value in config["horizons_hours"]) + 1
    )
    path_start = window_start - timedelta(
        hours=max(int(value) for value in config["wspr"]["history_lags_hours"])
    )

    files: list[dict[str, Any]] = []
    with psycopg.connect(pooler_url, autocommit=False) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION READ ONLY")
        files.append(
            stream_query_to_parquet(
                connection,
                query=FORECAST_QUERY,
                parameters=(
                    forecast_start,
                    window_end_exclusive,
                    window_start,
                    label_end_exclusive,
                ),
                schema=FORECAST_SCHEMA,
                output=output_root / "forecast_values.parquet",
                batch_rows=batch_rows,
                row_group_rows=row_group_rows,
                cursor_name="futurecast_forecasts",
            )
        )
        export_start_day = path_start.date()
        export_end_day = (label_end_exclusive - timedelta(microseconds=1)).date()
        for index, day in enumerate(target_days(export_start_day, export_end_day)):
            day_start = utc_midnight(day)
            day_end = day_start + timedelta(days=1)
            partition = f"target_date={day.isoformat()}"
            files.append(
                stream_query_to_parquet(
                    connection,
                    query=WATERMARK_QUERY,
                    parameters=(day_start, day_end, provider, transform),
                    schema=WATERMARK_SCHEMA,
                    output=output_root / "wspr_watermarks" / partition / "part-000.parquet",
                    batch_rows=batch_rows,
                    row_group_rows=row_group_rows,
                    cursor_name=f"futurecast_watermarks_{index}",
                )
            )
        outcomes = required_outcome_hours(
            output_root / "forecast_values.parquet",
            start=start_day,
            end=end_day,
            config=config,
        )
        watermark_paths = [
            output_root
            / "wspr_watermarks"
            / f"target_date={day.isoformat()}"
            / "part-000.parquet"
            for day in target_days(export_start_day, export_end_day)
        ]
        watermark_rows: list[dict[str, Any]] = []
        for path in watermark_paths:
            watermark_rows.extend(
                pq.read_table(
                    path,
                    columns=(
                        "target_hour",
                        "band",
                        "available_at",
                        "status",
                        "source_watermark",
                        "quality_flags",
                    ),
                ).to_pylist()
            )
        watermark_maturity = validate_outcome_watermark_maturity(
            watermark_rows,
            outcome_hours=outcomes,
        )
        for index, day in enumerate(target_days(export_start_day, export_end_day)):
            day_start = utc_midnight(day)
            day_end = day_start + timedelta(days=1)
            partition = f"target_date={day.isoformat()}"
            files.append(
                stream_query_to_parquet(
                    connection,
                    query=PATH_QUERY,
                    parameters=(day_start, day_end, provider, transform),
                    schema=PATH_SCHEMA,
                    output=output_root / "wspr_paths" / partition / "part-000.parquet",
                    batch_rows=batch_rows,
                    row_group_rows=row_group_rows,
                    cursor_name=f"futurecast_paths_{index}",
                )
            )
        connection.rollback()

    manifest = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "futurecast_v1_private_source_export",
        "data_scope": "production_issued_history",
        "decision": "development_sources_frozen",
        "release_approved": False,
        "config_sha256": sha256(args.config),
        "readiness_sha256": sha256(args.readiness),
        "window": {
            "start": start_day.isoformat(),
            "end": end_day.isoformat(),
            "days": (end_day - start_day).days + 1,
        },
        "source_tables": list(REQUIRED_SOURCE_TABLES),
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
            "batch_rows": batch_rows,
            "parquet_row_group_rows": row_group_rows,
            "database_transaction_read_only": True,
            "database_identifier_recorded": False,
            "outcome_watermark_maturity": watermark_maturity,
            "files": files,
        },
    }
    atomic_json(manifest_path, manifest)
    print(manifest_path)


if __name__ == "__main__":
    main()
