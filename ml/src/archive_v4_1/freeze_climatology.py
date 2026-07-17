#!/usr/bin/env python3
"""Freeze the V4 natural-distribution band-by-hour B0 rates for gate scoring."""

from __future__ import annotations

import argparse
from pathlib import Path

import duckdb

from protocol import DEFAULT_CONFIG, DEFAULT_MANIFEST, ProtocolError, artifact, atomic_write_json, load_json, utc_now


ROOT = Path(__file__).resolve().parents[3]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config = load_json(Path(args.config))
    manifest = load_json(DEFAULT_MANIFEST)
    if manifest["november_gate_opened"] or manifest["locked_archive_test_opened"]:
        raise ProtocolError("B0 must be frozen before locked outcome access")
    source = (
        ROOT
        / "ml/data/processed/archive_v4"
        / f"dataset_{config['parent_run_id']}_hf.parquet"
    )
    source_glob = source / "part-*.parquet"
    if not source.is_dir():
        raise FileNotFoundError(source)
    connection = duckdb.connect()
    connection.execute("SET TimeZone='UTC'")
    rows = connection.execute(
        f"""
        SELECT band, hour(target_hour) AS utc_hour,
               sum(successes)::DOUBLE / sum(opportunities) AS probability,
               count(*) AS rows,
               sum(opportunities) AS weighted_opportunities
        FROM read_parquet('{source_glob}', hive_partitioning=false)
        WHERE split='train'
        GROUP BY band, hour(target_hour)
        ORDER BY band, utc_hour
        """
    ).fetchall()
    global_row = connection.execute(
        f"""
        SELECT sum(successes)::DOUBLE / sum(opportunities), count(*),
               sum(opportunities), min(target_hour), max(target_hour)
        FROM read_parquet('{source_glob}', hive_partitioning=false)
        WHERE split='train'
        """
    ).fetchone()
    output = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "frozen_b0_train_climatology",
        "november_gate_read": False,
        "locked_archive_test_read": False,
        "definition": "Natural-distribution frozen V4 train band-by-UTC-hour climatology",
        "source": {
            "path": source.relative_to(ROOT).as_posix(),
            "parts": len(list(source.glob("part-*.parquet"))),
            "parent_development_results_sha256": artifact(
                ROOT
                / config["frozen_candidates"]["v4_results"]
            )["sha256"],
            "evidence_note": "The parent V4 development-results hash identifies the immutable training contract; large input part hashes remain in the V4 manifests.",
        },
        "train_rows": int(global_row[1]),
        "weighted_opportunities": float(global_row[2]),
        "minimum_time": global_row[3].isoformat(),
        "maximum_time": global_row[4].isoformat(),
        "global_rate": float(global_row[0]),
        "band_hour_rates": {
            f"{band}|{int(hour)}": float(probability)
            for band, hour, probability, _, _ in rows
        },
        "support": {
            f"{band}|{int(hour)}": {
                "rows": int(count),
                "weighted_opportunities": float(opportunities),
            }
            for band, hour, _, count, opportunities in rows
        },
    }
    atomic_write_json(args.output, output)
    print(args.output)


if __name__ == "__main__":
    main()
