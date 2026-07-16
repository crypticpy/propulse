#!/usr/bin/env python3
"""Compare the shared live transform with an open historical opportunity hour."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import resource
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb


ROOT = Path(__file__).resolve().parents[3]
LIVE = ROOT / "ml/src/propagation_live"
sys.path.insert(0, str(LIVE))

from opportunity_transform import (  # noqa: E402
    RECEIVER_SAMPLES_PER_TX_SLOT,
    materialize_opportunity_cells,
    materialize_path_hour_cells,
    transform_metadata,
)


DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/transform_parity.json"
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sql_string(value: str | Path) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def parse_hour(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("--target-hour must include a UTC offset")
    parsed = parsed.astimezone(timezone.utc)
    if parsed.minute or parsed.second or parsed.microsecond:
        raise ValueError("--target-hour must be aligned to an hour")
    return parsed


def logical_path(path: Path) -> str:
    parts = path.parts
    if "data" in parts:
        return Path(*parts[parts.index("data"):]).as_posix()
    return path.name


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def peak_rss_gib() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    divisor = 1024**3 if sys.platform == "darwin" else 1024**2
    return float(value / divisor)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bronze", type=Path, required=True)
    parser.add_argument("--opportunities", type=Path, required=True)
    parser.add_argument("--target-hour", required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--threads", type=int, default=18)
    args = parser.parse_args()
    if not args.bronze.is_file() or not args.opportunities.is_file():
        raise FileNotFoundError("bronze and opportunity parquet files are required")
    if args.threads < 1 or args.threads > (os.cpu_count() or 1):
        raise ValueError("--threads must fit the visible CPU count")
    target_hour = parse_hour(args.target_hour)
    started = time.perf_counter()
    connection = duckdb.connect()
    connection.execute(f"SET threads={args.threads}")
    connection.execute("SET memory_limit='32GB'")
    connection.execute("SET preserve_insertion_order=false")
    target_sql = sql_string(target_hour.isoformat())
    connection.execute(
        f"""
        CREATE TEMP TABLE wspr_source AS
        SELECT * FROM read_parquet({sql_string(args.bronze)})
        WHERE target_hour = CAST({target_sql} AS TIMESTAMPTZ);

        CREATE TEMP VIEW expected_hour AS
        SELECT * FROM read_parquet(
          {sql_string(args.opportunities)}, hive_partitioning=false
        )
        WHERE target_hour = CAST({target_sql} AS TIMESTAMPTZ);
        """
    )
    input_rows = int(connection.execute("SELECT count(*) FROM wspr_source").fetchone()[0])
    expected_rows = int(connection.execute("SELECT count(*) FROM expected_hour").fetchone()[0])
    if input_rows == 0 or expected_rows == 0:
        raise RuntimeError("selected parity hour has no source or expected rows")
    materialize_opportunity_cells(
        connection,
        source_relation="wspr_source",
        task="hf",
        receiver_samples=RECEIVER_SAMPLES_PER_TX_SLOT,
    )
    actual_rows = int(
        connection.execute("SELECT count(*) FROM opportunity_cells").fetchone()[0]
    )
    left_difference = int(connection.execute(
        """
        SELECT count(*) FROM (
          (SELECT * FROM opportunity_cells)
          EXCEPT ALL
          (SELECT * FROM expected_hour)
        )
        """
    ).fetchone()[0])
    right_difference = int(connection.execute(
        """
        SELECT count(*) FROM (
          (SELECT * FROM expected_hour)
          EXCEPT ALL
          (SELECT * FROM opportunity_cells)
        )
        """
    ).fetchone()[0])
    totals = connection.execute(
        """
        SELECT
          (SELECT sum(successes) FROM opportunity_cells),
          (SELECT sum(successes) FROM expected_hour),
          (SELECT sum(opportunities) FROM opportunity_cells),
          (SELECT sum(opportunities) FROM expected_hour),
          (SELECT sum(sampled_rows) FROM opportunity_cells),
          (SELECT sum(sampled_rows) FROM expected_hour)
        """
    ).fetchone()
    materialize_path_hour_cells(connection)
    connection.execute(
        """
        CREATE TEMP TABLE expected_path_hour AS
        SELECT target_hour, band, tx_grid4, rx_grid4,
               sum(successes)::DOUBLE AS successes,
               sum(opportunities)::DOUBLE AS opportunities,
               sum(successes) / sum(opportunities) AS success_rate,
               sum(sampled_rows)::INTEGER AS sampled_rows,
               sum(positive_rows)::INTEGER AS positive_rows
        FROM expected_hour
        GROUP BY 1, 2, 3, 4
        """
    )
    lag_counts = connection.execute(
        """
        SELECT
          (SELECT count(*) FROM path_hour_cells),
          (SELECT count(*) FROM expected_path_hour),
          (SELECT count(*) FROM (
            (SELECT * FROM path_hour_cells)
            EXCEPT ALL
            (SELECT * FROM expected_path_hour)
          )),
          (SELECT count(*) FROM (
            (SELECT * FROM expected_path_hour)
            EXCEPT ALL
            (SELECT * FROM path_hour_cells)
          ))
        """
    ).fetchone()
    exact = (
        actual_rows == expected_rows
        and left_difference == 0
        and right_difference == 0
        and lag_counts[0] == lag_counts[1]
        and lag_counts[2] == 0
        and lag_counts[3] == 0
    )
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "open_development_transform_parity",
        "locked_outcomes_read": False,
        "target_hour": target_hour.isoformat(),
        "inputs": {
            "bronze": {
                "path": logical_path(args.bronze),
                "bytes": args.bronze.stat().st_size,
                "sha256": sha256(args.bronze),
            },
            "opportunities": {
                "path": logical_path(args.opportunities),
                "bytes": args.opportunities.stat().st_size,
                "sha256": sha256(args.opportunities),
            },
        },
        "transform": transform_metadata(RECEIVER_SAMPLES_PER_TX_SLOT),
        "compute": {
            "machine": platform.machine(),
            "visible_cpus": os.cpu_count(),
            "duckdb_threads": args.threads,
            "peak_rss_gib": peak_rss_gib(),
            "wall_seconds": time.perf_counter() - started,
        },
        "parity": {
            "input_spot_rows": input_rows,
            "expected_rows": expected_rows,
            "actual_rows": actual_rows,
            "actual_minus_expected_rows": left_difference,
            "expected_minus_actual_rows": right_difference,
            "actual_successes": float(totals[0]),
            "expected_successes": float(totals[1]),
            "actual_opportunities": float(totals[2]),
            "expected_opportunities": float(totals[3]),
            "actual_sampled_rows": int(totals[4]),
            "expected_sampled_rows": int(totals[5]),
            "actual_lag_cells": int(lag_counts[0]),
            "expected_lag_cells": int(lag_counts[1]),
            "actual_minus_expected_lag_cells": int(lag_counts[2]),
            "expected_minus_actual_lag_cells": int(lag_counts[3]),
            "exact": exact,
        },
        "decision": "pass" if exact else "fail",
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2))
    if not exact:
        raise SystemExit("shared opportunity transform parity failed")


if __name__ == "__main__":
    main()
