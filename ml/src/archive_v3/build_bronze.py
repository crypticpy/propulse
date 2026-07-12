"""Convert immutable WSPR monthly CSV archives to typed, audited Parquet."""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import duckdb

from common import (
    MANIFESTS,
    WSPR_COLUMNS,
    band_sql,
    configure_duckdb,
    ensure_directories,
    load_config,
    relative,
    sha256,
    utc_now,
    write_json,
    wspr_bronze_path,
    wspr_raw_path,
)


def sql_columns() -> str:
    values = ",".join(f"'{name}':'{kind}'" for name, kind in WSPR_COLUMNS.items())
    return "{" + values + "}"


def convert_month(con: duckdb.DuckDBPyConnection, month: str) -> dict:
    source = wspr_raw_path(month)
    destination = wspr_bronze_path(month)
    if not source.exists():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    started = time.time()
    band = band_sql()
    con.execute(
        f"""
        COPY (
          WITH raw AS (
            SELECT *
            FROM read_csv('{source}', header=false, auto_detect=false,
              columns={sql_columns()}, compression='gzip', strict_mode=false,
              ignore_errors=true, null_padding=true)
          ), normalized AS (
            SELECT
              spot_id,
              observed_epoch,
              to_timestamp(observed_epoch) AS observed_at_utc,
              (observed_epoch // 120) * 120 AS slot_epoch,
              date_trunc('hour', to_timestamp(observed_epoch)) AS target_hour,
              upper(trim(rx_call_raw)) AS rx_call,
              upper(trim(rx_grid_raw)) AS rx_grid,
              substr(upper(trim(rx_grid_raw)), 1, 4) AS rx_grid4,
              upper(trim(tx_call_raw)) AS tx_call,
              upper(trim(tx_grid_raw)) AS tx_grid,
              substr(upper(trim(tx_grid_raw)), 1, 4) AS tx_grid4,
              snr_db::FLOAT AS snr_db,
              frequency_mhz,
              round(frequency_mhz * 1000000)::BIGINT AS frequency_hz,
              tx_power_dbm::FLOAT AS tx_power_dbm,
              round(tx_power_dbm / 5.0) * 5.0 AS power_bin_dbm,
              drift_hz_per_min::FLOAT AS drift_hz_per_min,
              source_distance_km::FLOAT AS source_distance_km,
              source_azimuth_deg::FLOAT AS source_azimuth_deg,
              source_band,
              decoder_version,
              source_code,
              {band} AS band,
              hash(spot_id, observed_epoch, rx_call_raw, tx_call_raw, frequency_mhz)
                AS source_row_id
            FROM raw
          )
          SELECT * FROM normalized
          WHERE band IS NOT NULL
            AND observed_epoch BETWEEN 1230768000 AND 1893456000
            AND regexp_full_match(rx_grid, '[A-R]{{2}}[0-9]{{2}}([A-X]{{2}})?')
            AND regexp_full_match(tx_grid, '[A-R]{{2}}[0-9]{{2}}([A-X]{{2}})?')
            AND length(rx_call) BETWEEN 3 AND 20
            AND length(tx_call) BETWEEN 3 AND 20
            AND tx_power_dbm BETWEEN -10 AND 70
            AND snr_db BETWEEN -80 AND 40
        ) TO '{destination}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000);
        """
    )
    stats = con.execute(
        f"""
        SELECT count(*) AS row_count, count(DISTINCT source_row_id) AS unique_rows,
               min(observed_at_utc), max(observed_at_utc),
               count(DISTINCT tx_call), count(DISTINCT rx_call),
               count(DISTINCT tx_grid4), count(DISTINCT rx_grid4),
               count(*) FILTER (band='6m') six_meter_rows
        FROM read_parquet('{destination}')
        """
    ).fetchone()
    return {
        "month": month,
        "source": relative(source),
        "source_size": source.stat().st_size,
        "source_sha256": sha256(source),
        "output": relative(destination),
        "output_size": destination.stat().st_size,
        "rows": stats[0],
        "unique_rows": stats[1],
        "min_time": stats[2],
        "max_time": stats[3],
        "tx_calls": stats[4],
        "rx_calls": stats[5],
        "tx_grids4": stats[6],
        "rx_grids4": stats[7],
        "six_meter_rows": stats[8],
        "seconds": time.time() - started,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    config = load_config(args.config)
    ensure_directories()
    con = duckdb.connect()
    configure_duckdb(con, config, "bronze")
    results = []
    for month in config["months"]:
        output = wspr_bronze_path(month)
        if output.exists() and not args.force:
            print(f"skip {month}: {output} exists", flush=True)
            continue
        if output.exists():
            output.unlink()
        print(f"convert {month}", flush=True)
        row = convert_month(con, month)
        results.append(row)
        print(f"{month}: {row['rows']:,} rows in {row['seconds']:.1f}s", flush=True)
    manifest = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "config": config,
        "months": results,
    }
    write_json(MANIFESTS / f"{config['run_id']}_bronze.json", manifest)


if __name__ == "__main__":
    main()
