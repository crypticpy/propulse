"""Infer exposure-aware WSPR opportunities with deterministic negative sampling."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import duckdb

from common import (
    MANIFESTS,
    configure_duckdb,
    ensure_directories,
    load_config,
    opportunity_path,
    relative,
    utc_now,
    write_json,
    wspr_bronze_path,
)


def build_month(
    con: duckdb.DuckDBPyConnection,
    month: str,
    task: str,
    receiver_samples: int,
) -> dict:
    source = wspr_bronze_path(month)
    destination = opportunity_path(month, task)
    if not source.exists():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    band_filter = "band = '6m'" if task == "6m" else "band <> '6m'"
    started = time.time()
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE positives AS
        SELECT DISTINCT slot_epoch, target_hour, band,
               tx_call, tx_grid4, rx_call, rx_grid4, power_bin_dbm,
               min(snr_db) OVER (
                 PARTITION BY slot_epoch, band, tx_call, rx_call
               ) AS snr_db
        FROM read_parquet('{source}')
        WHERE {band_filter};

        CREATE OR REPLACE TEMP TABLE tx_active AS
        SELECT slot_epoch, target_hour, band, tx_call, tx_grid4, power_bin_dbm,
               min(snr_db) AS best_any_snr
        FROM positives GROUP BY ALL;

        CREATE OR REPLACE TEMP TABLE rx_active AS
        SELECT slot_epoch, band, rx_call, rx_grid4,
               row_number() OVER (
                 PARTITION BY slot_epoch, band ORDER BY rx_call, rx_grid4
               ) AS rx_number,
               count(*) OVER (PARTITION BY slot_epoch, band) AS receiver_count
        FROM (SELECT DISTINCT slot_epoch, band, rx_call, rx_grid4 FROM positives);

        CREATE OR REPLACE TEMP TABLE tx_with_receiver_count AS
        SELECT tx.*, counts.receiver_count,
               least(counts.receiver_count, {receiver_samples})::INTEGER AS sample_count
        FROM tx_active tx
        JOIN (
          SELECT slot_epoch, band, max(receiver_count) AS receiver_count
          FROM rx_active GROUP BY 1, 2
        ) counts USING (slot_epoch, band);

        CREATE OR REPLACE TEMP TABLE sampled_negatives AS
        WITH candidate AS (
          SELECT tx.slot_epoch, tx.target_hour, tx.band,
                 tx.tx_call, tx.tx_grid4, tx.power_bin_dbm,
                 rx.rx_call, rx.rx_grid4,
                 tx.receiver_count::DOUBLE / tx.sample_count AS inclusion_weight
          FROM tx_with_receiver_count tx
          JOIN range(0, {receiver_samples}) samples(sample_index)
            ON samples.sample_index < tx.sample_count
          JOIN rx_active rx
            ON rx.slot_epoch = tx.slot_epoch AND rx.band = tx.band
           AND rx.rx_number = 1 + (
             (hash(tx.slot_epoch, tx.band, tx.tx_call) + samples.sample_index)
             % tx.receiver_count
           )
          WHERE tx.tx_call <> rx.rx_call
        )
        SELECT DISTINCT candidate.*
        FROM candidate
        ANTI JOIN positives p
          ON p.slot_epoch = candidate.slot_epoch AND p.band = candidate.band
         AND p.tx_call = candidate.tx_call AND p.rx_call = candidate.rx_call;

        COPY (
          WITH weighted AS (
            SELECT target_hour, band, tx_grid4, rx_grid4, power_bin_dbm,
                   1.0::DOUBLE AS inclusion_weight, 1::UTINYINT AS decoded,
                   snr_db
            FROM positives
            UNION ALL
            SELECT target_hour, band, tx_grid4, rx_grid4, power_bin_dbm,
                   inclusion_weight, 0::UTINYINT AS decoded,
                   NULL::FLOAT AS snr_db
            FROM sampled_negatives
          )
          SELECT target_hour, band, tx_grid4, rx_grid4, power_bin_dbm,
                 sum(inclusion_weight * decoded)::DOUBLE AS successes,
                 sum(inclusion_weight)::DOUBLE AS opportunities,
                 sum(inclusion_weight * decoded) / sum(inclusion_weight) AS success_rate,
                 (sum(decoded) > 0)::UTINYINT AS any_success,
                 count(*)::INTEGER AS sampled_rows,
                 count(*) FILTER (decoded=1)::INTEGER AS positive_rows,
                 avg(snr_db) FILTER (decoded=1)::FLOAT AS mean_positive_snr,
                 min(snr_db) FILTER (decoded=1)::FLOAT AS min_positive_snr,
                 max(snr_db) FILTER (decoded=1)::FLOAT AS max_positive_snr
          FROM weighted
          WHERE tx_grid4 <> rx_grid4
          GROUP BY ALL
        ) TO '{destination}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000);
        """
    )
    stats = con.execute(
        f"""
        SELECT count(*), sum(sampled_rows), sum(positive_rows),
               sum(opportunities), sum(successes),
               sum(successes) / sum(opportunities),
               count(*) FILTER (any_success=1),
               count(DISTINCT tx_grid4), count(DISTINCT rx_grid4),
               min(target_hour), max(target_hour)
        FROM read_parquet('{destination}')
        """
    ).fetchone()
    exact = con.execute(
        """
        WITH tx_grid AS (
          SELECT slot_epoch, band, tx_grid4, count(*) AS tx_count
          FROM tx_active GROUP BY 1, 2, 3
        ), rx_grid AS (
          SELECT slot_epoch, band, rx_grid4, count(*) AS rx_count
          FROM rx_active GROUP BY 1, 2, 3
        ), rx_total AS (
          SELECT slot_epoch, band, count(*) AS rx_count
          FROM rx_active GROUP BY 1, 2
        )
        SELECT sum(tx.tx_count * (total.rx_count - coalesce(same.rx_count, 0)))::DOUBLE,
               (SELECT count(*) FROM positives WHERE tx_grid4 <> rx_grid4)::DOUBLE
        FROM tx_grid tx
        JOIN rx_total total USING (slot_epoch, band)
        LEFT JOIN rx_grid same ON same.slot_epoch=tx.slot_epoch
          AND same.band=tx.band AND same.rx_grid4=tx.tx_grid4
        """
    ).fetchone()
    return {
        "month": month,
        "task": task,
        "source": relative(source),
        "output": relative(destination),
        "output_size": destination.stat().st_size,
        "rows": stats[0],
        "sampled_rows": stats[1],
        "positive_rows": stats[2],
        "weighted_opportunities": stats[3],
        "weighted_successes": stats[4],
        "weighted_prevalence": stats[5],
        "exact_station_opportunities": exact[0],
        "exact_positive_opportunities": exact[1],
        "sampling_weight_relative_error": (stats[3] - exact[0]) / exact[0],
        "open_path_hours": stats[6],
        "tx_grids4": stats[7],
        "rx_grids4": stats[8],
        "min_time": stats[9],
        "max_time": stats[10],
        "receiver_samples_per_tx_slot": receiver_samples,
        "seconds": time.time() - started,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--task", choices=("hf", "6m"), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    config = load_config(args.config)
    ensure_directories()
    con = duckdb.connect()
    configure_duckdb(con, config, "opportunities")
    manifest_path = MANIFESTS / f"{config['run_id']}_{args.task}_opportunities.json"
    previous = {}
    if manifest_path.exists() and not args.force:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        previous = {row["month"]: row for row in payload.get("months", [])}
    results = []
    for month in config["months"]:
        output = opportunity_path(month, args.task)
        if output.exists() and month in previous and not args.force:
            print(f"skip {month} {args.task}: output exists", flush=True)
            results.append(previous[month])
            continue
        if output.exists():
            print(
                f"rebuild {month} {args.task}: output lacks a manifest entry",
                flush=True,
            )
            output.unlink()
        print(f"build opportunities {month} {args.task}", flush=True)
        row = build_month(
            con,
            month,
            args.task,
            int(config["negative_receivers_per_tx_slot"]),
        )
        results.append(row)
        print(
            f"{month} {args.task}: {row['rows']:,} path-hours, "
            f"weighted prevalence {row['weighted_prevalence']:.5f}, "
            f"{row['seconds']:.1f}s",
            flush=True,
        )
        write_json(
            manifest_path,
            {
                "schema_version": 1,
                "generated_at": utc_now(),
                "config": config,
                "task": args.task,
                "months": results,
            },
        )
    write_json(
        manifest_path,
        {
            "schema_version": 1,
            "generated_at": utc_now(),
            "config": config,
            "task": args.task,
            "months": results,
        },
    )


if __name__ == "__main__":
    main()
