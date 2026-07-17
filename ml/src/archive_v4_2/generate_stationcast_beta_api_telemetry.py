#!/usr/bin/env python3
"""Export aggregate-only StationCast beta API counters from PostgreSQL."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg

from generate_stationcast_beta_operations_receipt import API_COUNT_FIELDS, parse_utc
from m5_runtime import validate_m5_runtime
from score_stationcast_beta import validate_beta_config
from validate_live_feature_migration import (
    DEFAULT_ENV,
    DEFAULT_POOLER_URL,
    ROOT,
    atomic_write,
    current_project_pooler_url,
    read_env,
)


CONFIG = ROOT / "ml/config/propagation_v4_2_beta_protocol.json"
M5_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_PRIVATE_ROOT = Path("/Volumes/Projects/PropulseML/private/stationcast_beta")
UNSIGNED_FIELDS = {
    "schema_version",
    "scope",
    "protocol_version",
    "window",
    "counts",
    "participant_data_present",
}


def validate_unsigned_receipt(
    value: dict[str, Any],
    config: dict[str, Any],
    *,
    window_start: datetime,
    window_end: datetime,
) -> None:
    if not isinstance(value, dict):
        raise RuntimeError("aggregate beta telemetry receipt is invalid")
    if set(value) != UNSIGNED_FIELDS:
        raise RuntimeError("aggregate beta telemetry fields are invalid")
    if value.get("schema_version") != 1:
        raise RuntimeError("aggregate beta telemetry schema is invalid")
    if value.get("scope") != "stationcast_beta_api_telemetry":
        raise RuntimeError("aggregate beta telemetry scope is invalid")
    if value.get("protocol_version") != config["protocol_version"]:
        raise RuntimeError("aggregate beta telemetry protocol is invalid")
    if value.get("participant_data_present") is not False:
        raise RuntimeError("aggregate beta telemetry contains participant data")
    counts = value.get("counts")
    if not isinstance(counts, dict) or set(counts) != set(API_COUNT_FIELDS):
        raise RuntimeError("aggregate beta telemetry counters are incomplete")
    if any(
        not isinstance(counts[name], int)
        or isinstance(counts[name], bool)
        or counts[name] < 0
        for name in API_COUNT_FIELDS
    ):
        raise RuntimeError("aggregate beta telemetry counters are invalid")
    if counts["errors"] > counts["requests"]:
        raise RuntimeError("aggregate beta telemetry error count exceeds requests")
    window = value.get("window")
    try:
        supplied_start = parse_utc(str(window["start"]))
        supplied_end = parse_utc(str(window["end"]))
    except (KeyError, TypeError, ValueError) as error:
        raise RuntimeError("aggregate beta telemetry window is invalid") from error
    if supplied_start != window_start or supplied_end != window_end:
        raise RuntimeError("aggregate beta telemetry window does not match the request")
    if (
        window_end <= window_start
        or window_end - window_start > timedelta(days=180)
        or window_start.minute
        or window_start.second
        or window_start.microsecond
        or window_end.minute
        or window_end.second
        or window_end.microsecond
    ):
        raise RuntimeError("aggregate beta telemetry window must use UTC hours")


def default_output(window_start: datetime, window_end: datetime) -> Path:
    return DEFAULT_PRIVATE_ROOT / (
        f"stationcast_beta_api_telemetry_unsigned_"
        f"{window_start:%Y%m%dT%H%M}_{window_end:%Y%m%dT%H%M}.json"
    )


def require_owner_only_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.stat().st_mode & 0o077:
        raise RuntimeError("aggregate beta telemetry output directory must be owner-only")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--window-start", required=True)
    parser.add_argument("--window-end", required=True)
    parser.add_argument("--config", type=Path, default=CONFIG)
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--pooler-url-file", type=Path, default=DEFAULT_POOLER_URL)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    validate_m5_runtime(json.loads(M5_CONFIG.read_text(encoding="utf-8")))
    config = json.loads(args.config.read_text(encoding="utf-8"))
    validate_beta_config(config)
    window_start = parse_utc(args.window_start)
    window_end = parse_utc(args.window_end)
    if (
        window_end <= window_start
        or window_end - window_start > timedelta(days=180)
        or window_start.minute
        or window_start.second
        or window_start.microsecond
        or window_end.minute
        or window_end.second
        or window_end.microsecond
    ):
        raise RuntimeError("StationCast beta telemetry window must use UTC hours")

    values = read_env(args.env_file)
    password = values.get("SUPABASE_DB_PASSWORD", "")
    if not password:
        raise RuntimeError("target database password is unavailable")
    pooler_url = current_project_pooler_url(
        values,
        args.pooler_url_file.read_text(encoding="utf-8").strip(),
    )
    with psycopg.connect(
        pooler_url,
        password=password,
        connect_timeout=15,
        sslmode="require",
        application_name="propulse-stationcast-beta-telemetry-export",
    ) as connection:
        connection.execute("SET TRANSACTION READ ONLY")
        row = connection.execute(
            "SELECT public.get_propagation_beta_api_telemetry(%s, %s, %s)",
            (config["protocol_version"], window_start, window_end),
        ).fetchone()
        connection.rollback()
    if row is None or not isinstance(row[0], dict):
        raise RuntimeError("aggregate beta telemetry export returned no receipt")
    receipt = row[0]
    validate_unsigned_receipt(
        receipt,
        config,
        window_start=window_start,
        window_end=window_end,
    )
    output = args.output or default_output(window_start, window_end)
    require_owner_only_directory(output.parent)
    atomic_write(output, receipt)
    os.chmod(output, 0o600)
    print(output)


if __name__ == "__main__":
    main()
