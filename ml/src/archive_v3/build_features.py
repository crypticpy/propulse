"""Build leakage-controlled HF and 6m model matrices from opportunity aggregates."""

from __future__ import annotations

import argparse
import math
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import polars as pl

LIVE_FEATURES = Path(__file__).resolve().parents[1] / "propagation_live"
sys.path.insert(0, str(LIVE_FEATURES))
from opportunity_transform import materialize_field_recency_cells  # noqa: E402

from common import (  # noqa: E402
    PROCESSED,
    configure_duckdb,
    ensure_directories,
    load_config,
    opportunity_path,
)


FEATURE_CONTRACT = "archive-v4-features-v2"
RECENCY_LAG_HOURS = (1, 2, 3, 24)
FIELD_RECENCY_COLUMNS = tuple(
    column
    for lag in RECENCY_LAG_HOURS
    for column in (
        f"path_success_prev{lag}",
        f"path_recency_rate_prev{lag}",
        f"path_prev{lag}_available",
    )
)


BAND_MHZ = {
    "160m": 1.9,
    "80m": 3.6,
    "60m": 5.35,
    "40m": 7.1,
    "30m": 10.12,
    "20m": 14.1,
    "17m": 18.1,
    "15m": 21.1,
    "12m": 24.9,
    "10m": 28.1,
    "6m": 50.3,
}


def quoted(values: list[str]) -> str:
    return ",".join(f"'{value}'" for value in values)


def month_condition(expression: str, months: list[str]) -> str:
    if not months:
        return "FALSE"
    return f"{expression} IN ({quoted(months)})"


def split_sql(config: dict) -> str:
    month_expression = "strftime(g.target_hour, '%Y-%m')"
    if "day_end_exclusive" in config["train"]:
        train_condition = (
            f"{month_condition(month_expression, config['train']['months'])} "
            f"AND day(g.target_hour) < {int(config['train']['day_end_exclusive'])}"
        )
    else:
        train_condition = month_condition(month_expression, config["train"]["months"])
    if "day_start" in config["validation"]:
        validation_condition = (
            f"{month_condition(month_expression, config['validation']['months'])} "
            f"AND day(g.target_hour) >= {int(config['validation']['day_start'])}"
        )
    else:
        validation_condition = month_condition(
            month_expression, config["validation"]["months"]
        )
    test_condition = month_condition(month_expression, config["test"]["months"])
    return f"""
      CASE WHEN {train_condition} THEN 'train'
           WHEN {validation_condition} THEN 'validation'
           WHEN {test_condition} THEN 'test'
           ELSE 'excluded' END
    """


def recency_lag_select_sql() -> str:
    """Field-grain network-recency lag columns served under the v2 contract."""
    return ",\n".join(
        f"""            coalesce(r{lag}.recency_quantile, 0) AS path_success_prev{lag},
            coalesce(r{lag}.recency_rate, 0) AS path_recency_rate_prev{lag},
            (r{lag}.hour_utc IS NOT NULL)::UTINYINT AS path_prev{lag}_available"""
        for lag in RECENCY_LAG_HOURS
    )


def recency_lag_join_sql() -> str:
    return "\n".join(
        f"""          LEFT JOIN field_recency r{lag}
            ON r{lag}.hour_utc=g.target_hour-INTERVAL {lag} HOUR
            AND r{lag}.band=g.band AND r{lag}.tx_field=substr(g.tx_grid4,1,2)
            AND r{lag}.rx_field=substr(g.rx_grid4,1,2)"""
        for lag in RECENCY_LAG_HOURS
    )


def write_feature_base(
    con: duckdb.DuckDBPyConnection,
    *,
    source: Path,
    weather: Path,
    base: Path,
    split: str,
) -> None:
    """Write one month's leakage-controlled base feature parquet."""
    con.execute(
        f"""
    CREATE OR REPLACE TEMP VIEW month_opportunities AS
    SELECT * FROM read_parquet('{source}', hive_partitioning=false);

    CREATE OR REPLACE TEMP TABLE path_hour AS
    SELECT target_hour, band, tx_grid4, rx_grid4,
           sum(successes) AS successes, sum(opportunities) AS opportunities,
           sum(successes) / sum(opportunities) AS success_rate,
           max(any_success) AS any_success
    FROM month_opportunities GROUP BY 1, 2, 3, 4;
        """
    )
    # Field-grain recency is built from the same single-month relation as
    # path_hour, so like the grid4 lags it does NOT see the previous
    # month's last hours: lags at the first 1/2/3/24 hours of a month are
    # unavailable (0) for both feature families.
    materialize_field_recency_cells(
        con,
        source_relation="month_opportunities",
        destination_relation="field_recency",
    )
    con.execute(
        f"""
    COPY (
      WITH coords AS (
        SELECT o.*,
          (ascii(substr(tx_grid4, 1, 1)) - 65) * 20 - 180
            + cast(substr(tx_grid4, 3, 1) AS INTEGER) * 2 + 1.0 AS tx_lon,
          (ascii(substr(tx_grid4, 2, 1)) - 65) * 10 - 90
            + cast(substr(tx_grid4, 4, 1) AS INTEGER) + 0.5 AS tx_lat,
          (ascii(substr(rx_grid4, 1, 1)) - 65) * 20 - 180
            + cast(substr(rx_grid4, 3, 1) AS INTEGER) * 2 + 1.0 AS rx_lon,
          (ascii(substr(rx_grid4, 2, 1)) - 65) * 10 - 90
            + cast(substr(rx_grid4, 4, 1) AS INTEGER) + 0.5 AS rx_lat
        FROM read_parquet('{source}', hive_partitioning=false) o
      ), radians AS (
        SELECT *, radians(tx_lat) la1, radians(tx_lon) lo1,
               radians(rx_lat) la2, radians(rx_lon) lo2
        FROM coords
      ), geometry AS (
        SELECT *, lo2-lo1 AS dlon,
          acos(greatest(-1.0, least(1.0,
            sin(la1)*sin(la2)+cos(la1)*cos(la2)*cos(lo2-lo1)))) AS central,
          atan2(sin(la1)+sin(la2), sqrt(pow(cos(la1)+cos(la2)*cos(lo2-lo1),2)
            + pow(cos(la2)*sin(lo2-lo1),2))) AS mid_lat_rad,
          lo1 + atan2(cos(la2)*sin(lo2-lo1), cos(la1)+cos(la2)*cos(lo2-lo1))
            AS mid_lon_rad,
          atan2(sin(lo2-lo1)*cos(la2), cos(la1)*sin(la2)
            - sin(la1)*cos(la2)*cos(lo2-lo1)) AS bearing
        FROM radians
      )
      SELECT g.* EXCLUDE (la1,lo1,la2,lo2,dlon,central,mid_lat_rad,mid_lon_rad,bearing),
        degrees(mid_lat_rad) AS mid_lat, degrees(mid_lon_rad) AS mid_lon,
        central*6371.0 AS dist_km,
        sin(bearing) AS bearing_sin, cos(bearing) AS bearing_cos,
        sin(la1) AS tx_lat_sin, cos(la1) AS tx_lat_cos,
        sin(lo1) AS tx_lon_sin, cos(lo1) AS tx_lon_cos,
        sin(la2) AS rx_lat_sin, cos(la2) AS rx_lat_cos,
        sin(mid_lat_rad) AS mid_lat_sin, cos(mid_lat_rad) AS mid_lat_cos,
        CASE g.band
          WHEN '160m' THEN 1.9 WHEN '80m' THEN 3.6 WHEN '60m' THEN 5.35
          WHEN '40m' THEN 7.1 WHEN '30m' THEN 10.12 WHEN '20m' THEN 14.1
          WHEN '17m' THEN 18.1 WHEN '15m' THEN 21.1 WHEN '12m' THEN 24.9
          WHEN '10m' THEN 28.1 WHEN '6m' THEN 50.3 END AS band_mhz,
        coalesce(p1.success_rate,0) AS wspr_path_success_prev1,
        coalesce(p2.success_rate,0) AS wspr_path_success_prev2,
        coalesce(p3.success_rate,0) AS wspr_path_success_prev3,
        coalesce(p24.success_rate,0) AS wspr_path_success_prev24,
        (p1.target_hour IS NOT NULL)::UTINYINT AS wspr_path_prev1_available,
        (p2.target_hour IS NOT NULL)::UTINYINT AS wspr_path_prev2_available,
        (p3.target_hour IS NOT NULL)::UTINYINT AS wspr_path_prev3_available,
        (p24.target_hour IS NOT NULL)::UTINYINT AS wspr_path_prev24_available,
        sw.available_at AS weather_available_at,
        sw.* EXCLUDE (observed_hour, available_at),
        {split} AS split,
{recency_lag_select_sql()}
      FROM geometry g
      LEFT JOIN path_hour p1 ON p1.target_hour=g.target_hour-INTERVAL 1 HOUR
        AND p1.band=g.band AND p1.tx_grid4=g.tx_grid4 AND p1.rx_grid4=g.rx_grid4
      LEFT JOIN path_hour p2 ON p2.target_hour=g.target_hour-INTERVAL 2 HOUR
        AND p2.band=g.band AND p2.tx_grid4=g.tx_grid4 AND p2.rx_grid4=g.rx_grid4
      LEFT JOIN path_hour p3 ON p3.target_hour=g.target_hour-INTERVAL 3 HOUR
        AND p3.band=g.band AND p3.tx_grid4=g.tx_grid4 AND p3.rx_grid4=g.rx_grid4
      LEFT JOIN path_hour p24 ON p24.target_hour=g.target_hour-INTERVAL 24 HOUR
        AND p24.band=g.band AND p24.tx_grid4=g.tx_grid4 AND p24.rx_grid4=g.rx_grid4
{recency_lag_join_sql()}
      LEFT JOIN read_parquet('{weather}') sw
        ON sw.available_at=g.target_hour
      WHERE ({split}) <> 'excluded'
    ) TO '{base}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000);
        """
    )


def add_polars_features(source: Path | list[Path], destination: Path, task: str) -> None:
    sources = source if isinstance(source, list) else [source]
    destination.mkdir(parents=True, exist_ok=True)
    deg = math.pi / 180.0
    for index, current_source in enumerate(sources):
        part = destination / f"part-{index:03d}.parquet"
        if part.exists():
            print(f"reuse feature partition {index + 1}/{len(sources)}", flush=True)
            continue
        frame = pl.scan_parquet(current_source).filter(
            pl.col("target_hour").is_not_null()
            & pl.col("opportunities").is_not_null()
            & (pl.col("opportunities") > 0)
            & pl.col("split").is_in(["train", "validation", "test"])
        )
        frame = frame.with_columns(
            (pl.col("target_hour").dt.hour() + 0.5).alias("frac_hour"),
            pl.col("target_hour").dt.ordinal_day().alias("day_of_year"),
        ).with_columns(
            (
                2
                * math.pi
                / 365
                * (pl.col("day_of_year") - 1 + (pl.col("frac_hour") - 12) / 24)
            ).alias("solar_gamma"),
            (2 * math.pi * pl.col("frac_hour") / 24).sin().alias("hod_sin"),
            (2 * math.pi * pl.col("frac_hour") / 24).cos().alias("hod_cos"),
            (2 * math.pi * (pl.col("day_of_year") - 1) / 365).sin().alias("doy_sin"),
            (2 * math.pi * (pl.col("day_of_year") - 1) / 365).cos().alias("doy_cos"),
            (pl.col("target_hour").dt.weekday() >= 6).cast(pl.UInt8).alias("is_weekend"),
        )
        gamma = pl.col("solar_gamma")
        frame = frame.with_columns(
            (
                0.006918
                - 0.399912 * gamma.cos()
                + 0.070257 * gamma.sin()
                - 0.006758 * (2 * gamma).cos()
                + 0.000907 * (2 * gamma).sin()
                - 0.002697 * (3 * gamma).cos()
                + 0.00148 * (3 * gamma).sin()
            ).alias("solar_declination"),
            (
                229.18
                * (
                    0.000075
                    + 0.001868 * gamma.cos()
                    - 0.032077 * gamma.sin()
                    - 0.014615 * (2 * gamma).cos()
                    - 0.040849 * (2 * gamma).sin()
                )
            ).alias("equation_of_time"),
        )

        def sun_elevation(lat: str, lon: str) -> pl.Expr:
            lat_rad = pl.col(lat) * deg
            hour_angle = (
                (
                    pl.col("frac_hour") * 60
                    + pl.col("equation_of_time")
                    + 4 * pl.col(lon)
                )
                / 4
                - 180
            ) * deg
            sine = (
                lat_rad.sin() * pl.col("solar_declination").sin()
                + lat_rad.cos()
                * pl.col("solar_declination").cos()
                * hour_angle.cos()
            ).clip(-1.0, 1.0)
            return sine.arcsin() / deg

        frame = frame.with_columns(
            sun_elevation("tx_lat", "tx_lon").alias("sun_elev_tx"),
            sun_elevation("rx_lat", "rx_lon").alias("sun_elev_rx"),
            sun_elevation("mid_lat", "mid_lon").alias("sun_elev_mid"),
        ).with_columns(
            (
                (
                    (pl.col("sun_elev_tx") < 0).cast(pl.Float32)
                    + (pl.col("sun_elev_mid") < 0).cast(pl.Float32)
                    + (pl.col("sun_elev_rx") < 0).cast(pl.Float32)
                )
                / 3
            ).alias("dark_frac"),
            pl.min_horizontal(
                pl.col("sun_elev_tx").abs(), pl.col("sun_elev_rx").abs()
            ).alias("min_abs_elev_ends"),
            *[
                (pl.col("band") == band).cast(pl.UInt8).alias(f"band_{band}")
                for band in BAND_MHZ
                if (task == "hf" and band != "6m")
            ],
        )
        temporary = part.with_suffix(".tmp.parquet")
        temporary.unlink(missing_ok=True)
        frame.drop(
            "frac_hour",
            "day_of_year",
            "solar_gamma",
            "solar_declination",
            "equation_of_time",
        ).sink_parquet(temporary, compression="zstd", statistics=True)
        temporary.replace(part)
        print(f"wrote feature partition {index + 1}/{len(sources)}", flush=True)


def require_feature_contract(config: dict) -> None:
    """Fail fast unless the config declares the contract this builder emits.

    ``FEATURE_CONTRACT`` above is a hardcoded module constant: this builder
    has produced only the V2 recency layout since that feature set shipped,
    regardless of what a config's other settings imply. A config that does
    not declare ``"feature_contract": "archive-v4-features-v2"`` would
    silently receive V2 features under a run that never asked for them --
    including a V1 run, whose frozen datasets must never be rebuilt.
    """
    declared = config.get("feature_contract")
    if declared != FEATURE_CONTRACT:
        source = config.get("config_path", config.get("run_id", "<config>"))
        raise RuntimeError(
            f"{source}: this branch's feature builder only produces the "
            f"{FEATURE_CONTRACT!r} contract (found feature_contract="
            f"{declared!r}); V1 datasets are frozen and must not be "
            "rebuilt with this script."
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--task", choices=("hf", "6m"), required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    config = load_config(args.config)
    require_feature_contract(config)
    ensure_directories()
    output = PROCESSED / f"dataset_{config['run_id']}_{args.task}.parquet"
    legacy_base = PROCESSED / f"dataset_{config['run_id']}_{args.task}_base.parquet"
    if output.is_dir() and (output / "_SUCCESS").exists() and not args.force:
        print(f"{output} exists")
        return
    if output.is_file() and not args.force:
        print(f"{output} exists")
        return
    if args.force:
        if output.is_dir():
            shutil.rmtree(output, ignore_errors=True)
            if output.exists():
                raise RuntimeError(f"failed to clear feature directory: {output}")
        else:
            output.unlink(missing_ok=True)
        legacy_base.unlink(missing_ok=True)
    paths = [opportunity_path(month, args.task) for month in config["months"]]
    missing = [path for path in paths if not path.exists()]
    if missing:
        raise FileNotFoundError(missing)
    weather_run_id = config.get("space_weather_run_id", config["run_id"])
    weather = PROCESSED / f"space_weather_{weather_run_id}.parquet"
    if not weather.exists():
        raise FileNotFoundError(weather)
    split = split_sql(config)
    con = duckdb.connect()
    configure_duckdb(con, config, "features")
    started = time.time()
    bases = [
        PROCESSED / f"dataset_{config['run_id']}_{args.task}_base_{month}.parquet"
        for month in config["months"]
    ]
    if args.force:
        for base in bases:
            base.unlink(missing_ok=True)
    base_stats = [0, 0, 0, 0]
    for month, source, base in zip(config["months"], paths, bases):
        if base.exists() and not args.force:
            month_stats = con.execute(
                f"""
                SELECT count(*) AS rows,
                       count(*) FILTER (target_hour IS NULL) AS null_hours,
                       count(*) FILTER (opportunities IS NULL OR opportunities <= 0) AS bad_weights,
                       count(*) FILTER (split = 'excluded' OR split IS NULL) AS bad_splits
                FROM read_parquet('{base}')
                """
            ).fetchone()
            print(
                f"reuse feature base {month} {args.task}: rows={month_stats[0]:,}",
                flush=True,
            )
            if any(month_stats[1:]):
                raise RuntimeError(
                    f"existing base feature invariant failed for {month}: {month_stats}"
                )
            base_stats = [
                left + right for left, right in zip(base_stats, month_stats)
            ]
            continue
        if base.exists():
            base.unlink()
        print(f"build feature base {month} {args.task}", flush=True)
        write_feature_base(
            con, source=source, weather=weather, base=base, split=split
        )
        month_stats = con.execute(
            f"""
        SELECT count(*) AS rows,
               count(*) FILTER (target_hour IS NULL) AS null_hours,
               count(*) FILTER (opportunities IS NULL OR opportunities <= 0) AS bad_weights,
               count(*) FILTER (split = 'excluded' OR split IS NULL) AS bad_splits
        FROM read_parquet('{base}')
        """
        ).fetchone()
        print(
            f"{month} base rows={month_stats[0]:,} null_hours={month_stats[1]:,} "
            f"bad_weights={month_stats[2]:,} bad_splits={month_stats[3]:,}",
            flush=True,
        )
        if any(month_stats[1:]):
            raise RuntimeError(f"base feature invariant failed for {month}: {month_stats}")
        base_stats = [left + right for left, right in zip(base_stats, month_stats)]
    print(
        f"base audit rows={base_stats[0]:,} null_hours={base_stats[1]:,} "
        f"bad_weights={base_stats[2]:,} bad_splits={base_stats[3]:,}",
        flush=True,
    )
    add_polars_features(bases, output, args.task)
    output_glob = output / "part-*.parquet" if output.is_dir() else output
    output_audit = pl.scan_parquet(output_glob).select(
        pl.len().alias("rows"),
        pl.col("target_hour").null_count().alias("null_hours"),
        (pl.col("opportunities").is_null() | (pl.col("opportunities") <= 0))
        .sum()
        .alias("bad_weights"),
        (pl.col("split").is_null() | (pl.col("split") == "excluded"))
        .sum()
        .alias("bad_splits"),
    ).collect().row(0)
    print(
        f"output audit rows={output_audit[0]:,} null_hours={output_audit[1]:,} "
        f"bad_weights={output_audit[2]:,} bad_splits={output_audit[3]:,}",
        flush=True,
    )
    if output_audit[0] != base_stats[0] or any(output_audit[1:]):
        raise RuntimeError(
            f"feature handoff invariant failed: base={base_stats}, output={output_audit}"
        )
    output_columns = set(pl.scan_parquet(output_glob).collect_schema().names())
    missing_columns = [
        column for column in FIELD_RECENCY_COLUMNS if column not in output_columns
    ]
    if missing_columns:
        raise RuntimeError(f"{FEATURE_CONTRACT} columns missing: {missing_columns}")
    for base in bases:
        base.unlink()
    stats = pl.scan_parquet(output_glob).group_by("split").agg(
        pl.len().alias("rows"),
        pl.col("opportunities").sum().alias("weighted_opportunities"),
        pl.col("successes").sum().alias("weighted_successes"),
    ).collect()
    (output / "_CONTRACT").write_text(f"{FEATURE_CONTRACT}\n", encoding="ascii")
    (output / "_SUCCESS").write_text("complete\n", encoding="ascii")
    print(stats)
    print(f"{output} built in {time.time()-started:.1f}s")


if __name__ == "__main__":
    main()
