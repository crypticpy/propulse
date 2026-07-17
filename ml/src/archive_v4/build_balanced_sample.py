#!/usr/bin/env python3
"""Build deterministic nested, regime-balanced V4 training samples."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any

import duckdb
import polars as pl


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
sys.path.insert(0, str(V3))
from common import (  # noqa: E402
    MANIFESTS,
    PROCESSED,
    configure_duckdb,
    ensure_directories,
    load_config,
    relative,
    sha256,
    utc_now,
    write_json,
)


STRATA = [
    "year",
    "season_anchor",
    "band",
    "power_bin_dbm",
    "distance_bin",
    "f107_regime",
    "geomagnetic_regime",
    "path_history_regime",
]


def allocate_quotas(counts: list[int], cap: int) -> list[int]:
    """Allocate an equal-stratum cap with deterministic water filling."""
    if cap < 0:
        raise ValueError("cap must be nonnegative")
    total = sum(counts)
    if cap >= total:
        return list(counts)
    quotas = [0] * len(counts)
    remaining = cap
    active = {index for index, count in enumerate(counts) if count > 0}
    while remaining and active:
        share = max(1, remaining // len(active))
        progressed = False
        for index in sorted(active):
            add = min(share, counts[index] - quotas[index], remaining)
            if add:
                quotas[index] += add
                remaining -= add
                progressed = True
            if remaining == 0:
                break
        active = {index for index in active if quotas[index] < counts[index]}
        if not progressed:
            break
    return quotas


def strata_sql() -> str:
    return """
      year(target_hour)::SMALLINT AS year,
      month(target_hour)::UTINYINT AS season_anchor,
      CASE WHEN dist_km < 1000 THEN '<1k'
           WHEN dist_km < 3000 THEN '1-3k'
           WHEN dist_km < 6000 THEN '3-6k'
           WHEN dist_km < 10000 THEN '6-10k'
           ELSE '>10k' END AS distance_bin,
      CASE WHEN f107 IS NULL THEN 'missing'
           WHEN f107 < 100 THEN 'low'
           WHEN f107 < 150 THEN 'medium'
           ELSE 'high' END AS f107_regime,
      CASE WHEN kp IS NULL THEN 'missing'
           WHEN kp < 2 THEN 'quiet'
           WHEN kp < 4 THEN 'active'
           ELSE 'storm' END AS geomagnetic_regime,
      CASE WHEN coalesce(path_prev1_available, 0) = 0
                 AND coalesce(path_prev2_available, 0) = 0
                 AND coalesce(path_prev3_available, 0) = 0
                 AND coalesce(path_prev24_available, 0) = 0 THEN 'unavailable'
           WHEN greatest(path_success_prev1, path_success_prev2,
                         path_success_prev3, path_success_prev24) > 0 THEN 'recent_success'
           ELSE 'available_no_success' END AS path_history_regime
    """


def duckdb_parquet_source(path: Path) -> str:
    return str(path / "*.parquet") if path.is_dir() else str(path)


def build(config_path: str, task: str, force: bool) -> dict[str, Any]:
    config = load_config(config_path)
    ensure_directories()
    source = PROCESSED / f"dataset_{config['run_id']}_{task}.parquet"
    if not source.exists():
        raise FileNotFoundError(source)
    sample_dir = PROCESSED / f"samples/{config['run_id']}/{task}/train"
    validation_path = (
        PROCESSED / f"samples/{config['run_id']}/{task}/validation.parquet"
    )
    allocation_path = (
        PROCESSED / f"samples/{config['run_id']}/{task}/allocations.parquet"
    )
    manifest_path = MANIFESTS / f"{config['run_id']}_{task}_balanced_sample.json"
    if sample_dir.exists() and not force:
        if manifest_path.exists() and validation_path.exists():
            return json.loads(manifest_path.read_text(encoding="utf-8"))
        shutil.rmtree(sample_dir)
    if force:
        shutil.rmtree(sample_dir, ignore_errors=True)
        validation_path.unlink(missing_ok=True)
        allocation_path.unlink(missing_ok=True)
    sample_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    configure_duckdb(con, config, f"balanced-sample-{task}")
    source_glob = duckdb_parquet_source(source)
    con.execute(
        f"""
        CREATE OR REPLACE TEMP VIEW stratified AS
        SELECT *, {strata_sql()}
        FROM read_parquet('{source_glob}')
        """
    )
    rows = con.execute(
        f"""
        SELECT {','.join(STRATA)}, count(*)::BIGINT AS natural_rows,
               sum(opportunities)::DOUBLE AS natural_opportunities
        FROM stratified WHERE split='train'
        GROUP BY {','.join(STRATA)}
        ORDER BY {','.join(STRATA)}
        """
    ).fetchall()
    if not rows:
        raise RuntimeError("training split is empty")
    counts = [int(row[-2]) for row in rows]
    curve_caps = [int(value) for value in config["sampling"]["learning_curve_rows"]]
    allocations = [allocate_quotas(counts, min(cap, sum(counts))) for cap in curve_caps]
    allocation = pl.DataFrame(
        [
            {
                **dict(zip(STRATA, row[: len(STRATA)])),
                "natural_rows": row[-2],
                "natural_opportunities": row[-1],
                **{
                    f"quota_{cap}": allocations[position][index]
                    for position, cap in enumerate(curve_caps)
                },
            }
            for index, row in enumerate(rows)
        ]
    )
    allocation.write_parquet(allocation_path, compression="zstd")
    largest = curve_caps[-1]
    key_columns = ",".join(STRATA)
    con.execute(
        f"""
        COPY (
          WITH ranked AS (
            SELECT s.*, a.natural_rows, a.natural_opportunities,
                   {','.join(f'a.quota_{cap}' for cap in curve_caps)},
                   row_number() OVER (
                     PARTITION BY {','.join(f's.{name}' for name in STRATA)}
                     ORDER BY hash(s.target_hour, s.band, s.tx_grid4, s.rx_grid4,
                                   s.power_bin_dbm, {int(config['seed'])})
                   ) AS sample_rank_in_stratum
            FROM stratified s JOIN read_parquet('{allocation_path}') a
              USING ({key_columns})
            WHERE s.split='train'
          ), selected AS (
            SELECT * FROM ranked WHERE sample_rank_in_stratum <= quota_{largest}
          ), sampled_totals AS (
            SELECT {key_columns}, sum(opportunities)::DOUBLE AS sampled_opportunities
            FROM selected GROUP BY {key_columns}
          )
          SELECT selected.*,
                 natural_rows::DOUBLE / quota_{largest} AS inverse_inclusion_weight,
                 natural_opportunities / sampled_opportunities AS poststrat_factor,
                 opportunities * natural_opportunities / sampled_opportunities
                   AS training_weight,
                 {','.join(f'(sample_rank_in_stratum <= quota_{cap}) AS in_sample_{cap}' for cap in curve_caps)}
          FROM selected JOIN sampled_totals USING ({key_columns})
        ) TO '{sample_dir}' (FORMAT PARQUET, COMPRESSION ZSTD,
          ROW_GROUP_SIZE 250000, PARTITION_BY (year), OVERWRITE_OR_IGNORE true)
        """
    )
    validation_limit = int(config["sampling"]["validation_rows"])
    con.execute(
        f"""
        COPY (
          SELECT * FROM stratified WHERE split='validation'
          ORDER BY hash(target_hour, band, tx_grid4, rx_grid4,
                        power_bin_dbm, {int(config['seed'])})
          LIMIT {validation_limit}
        ) TO '{validation_path}' (FORMAT PARQUET, COMPRESSION ZSTD,
          ROW_GROUP_SIZE 250000)
        """
    )
    sample_glob = str(sample_dir / "**/*.parquet")
    sample_stats = con.execute(
        f"""
        SELECT count(*), sum(training_weight), sum(opportunities)
        FROM read_parquet('{sample_glob}', hive_partitioning=true)
        """
    ).fetchone()
    natural = con.execute(
        "SELECT count(*), sum(opportunities) FROM stratified WHERE split='train'"
    ).fetchone()
    validation_rows = con.execute(
        f"SELECT count(*) FROM read_parquet('{validation_path}')"
    ).fetchone()[0]
    files = sorted(sample_dir.rglob("*.parquet"))
    manifest = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "task": task,
        "seed": config["seed"],
        "strata": STRATA,
        "natural_train_rows": natural[0],
        "natural_train_opportunities": natural[1],
        "nested_sample_rows": {
            str(cap): sum(values) for cap, values in zip(curve_caps, allocations)
        },
        "sampled_train_rows": sample_stats[0],
        "poststratified_opportunities": sample_stats[1],
        "raw_sample_opportunities": sample_stats[2],
        "validation_sample_rows": validation_rows,
        "training_files": [
            {"path": relative(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in files
        ],
        "validation_file": {
            "path": relative(validation_path),
            "bytes": validation_path.stat().st_size,
            "sha256": sha256(validation_path),
        },
        "weight_contract": (
            "Rows are selected uniformly by stable hash within frozen strata; "
            "training_weight post-stratifies sampled opportunity mass to the exact "
            "natural opportunity mass in each stratum."
        ),
    }
    write_json(manifest_path, manifest)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--task", choices=("hf", "6m"), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    manifest = build(args.config, args.task, args.force)
    print(json.dumps({key: manifest[key] for key in (
        "task", "natural_train_rows", "nested_sample_rows", "validation_sample_rows"
    )}, indent=2))


if __name__ == "__main__":
    main()
