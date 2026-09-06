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
MODULE = Path(__file__).resolve().parent
LIVE = ROOT / "ml/src/propagation_live"
sys.path.insert(0, str(LIVE))
sys.path.insert(0, str(MODULE))

import run_paths  # noqa: E402
from opportunity_transform import (  # noqa: E402
    RECEIVER_SAMPLES_PER_TX_SLOT,
    materialize_field_recency_cells,
    materialize_opportunity_cells,
    materialize_path_hour_cells,
    transform_metadata,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


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


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def percent_rank_column(values: list[float]) -> list[float]:
    """Pure-Python ``percent_rank() OVER (ORDER BY value)`` for one partition.

    Matches SQL semantics: ties share the rank of the first occurrence, and a
    lone value scores 0. Used to independently re-derive
    ``materialize_field_recency_cells``' ``recency_quantile`` column so a
    regression in that window function (or the SQL around it) cannot pass
    unnoticed.
    """
    count = len(values)
    if count <= 1:
        return [0.0] * count
    order = sorted(range(count), key=lambda index: values[index])
    ranks = [0] * count
    position = 0
    while position < count:
        tie_end = position
        while (
            tie_end + 1 < count
            and values[order[tie_end + 1]] == values[order[position]]
        ):
            tie_end += 1
        for tied_index in range(position, tie_end + 1):
            ranks[order[tied_index]] = position
        position = tie_end + 1
    return [rank / (count - 1) for rank in ranks]


def field_recency_parity(
    connection: duckdb.DuckDBPyConnection,
    *,
    source_relation: str = "opportunity_cells",
) -> dict[str, Any]:
    """Recompute ``field_recency_cells.recency_quantile`` in Python.

    ``recency_quantile`` is ``percent_rank()`` of ``recency_rate`` (``1 /
    exposure``) partitioned by ``(band, hour_utc)``. This recomputes that
    independently of DuckDB's window function and compares row for row.
    """
    materialize_field_recency_cells(connection, source_relation=source_relation)
    rows = connection.execute(
        """
        SELECT band, hour_utc, recency_rate, recency_quantile
        FROM field_recency_cells
        ORDER BY band, hour_utc, tx_field, rx_field
        """
    ).fetchall()
    groups: dict[tuple[str, Any], list[int]] = {}
    for index, (band, hour_utc, _rate, _quantile) in enumerate(rows):
        groups.setdefault((band, hour_utc), []).append(index)
    recomputed = [0.0] * len(rows)
    for indices in groups.values():
        rates = [rows[index][2] for index in indices]
        for offset, quantile in zip(indices, percent_rank_column(rates)):
            recomputed[offset] = quantile
    mismatches = sum(
        1
        for index, row in enumerate(rows)
        if abs(recomputed[index] - float(row[3])) > 1e-9
    )
    return {
        "rows": len(rows),
        "groups": len(groups),
        "mismatched_recency_quantiles": mismatches,
        "exact": mismatches == 0 and len(rows) > 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--bronze", type=Path, required=True)
    parser.add_argument("--opportunities", type=Path, required=True)
    parser.add_argument("--target-hour", required=True)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--threads", type=int, default=18)
    args = parser.parse_args()
    config = load_json(Path(args.config).resolve())
    output_path = args.output or run_paths.transform_parity_path(config)
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
    field_recency = field_recency_parity(connection)
    exact = (
        actual_rows == expected_rows
        and left_difference == 0
        and right_difference == 0
        and lag_counts[0] == lag_counts[1]
        and lag_counts[2] == 0
        and lag_counts[3] == 0
        and field_recency["exact"]
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
            "field_recency_quantile_python_recomputation": field_recency,
            "exact": exact,
        },
        "decision": "pass" if exact else "fail",
    }
    atomic_write(output_path, result)
    print(json.dumps(result, indent=2))
    if not exact:
        raise SystemExit("shared opportunity transform parity failed")


if __name__ == "__main__":
    main()
