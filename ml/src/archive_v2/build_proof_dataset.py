"""Build the common-support PSK-only archive proof datasets.

DuckDB performs source filtering, aggregation, and relational joins. Polars
adds vectorized row features lazily and writes independent HF and 6m files.
No pandas dataframe or random negative sampling is used.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import polars as pl


ROOT = Path(__file__).resolve().parents[3]
MAD = ROOT / "ml/data/processed/madrigal/*.parquet"
OURS = ROOT / "ml/data/processed/spots_slim.parquet"
SOLAR = ROOT / "ml/data/raw/solar_snapshots.csv"
OUT_DIR = ROOT / "ml/data/processed/archive_v2"
RESULTS_DIR = ROOT / "ml/results/archive_v2"
BASE = OUT_DIR / "proof_base.parquet"
HF_OUT = OUT_DIR / "proof_hf.parquet"
SIX_OUT = OUT_DIR / "proof_6m.parquet"
MANIFEST = RESULTS_DIR / "dataset_manifest.json"

START = "2026-03-01"
TRAIN_END = "2026-03-20"
VAL_END = "2026-03-24"
END = "2026-04-01"
MIN_PAIR_SPOTS = 300

DIGITAL_MODES = (
    "FT8",
    "FT4",
    "FT2",
    "JS8",
    "VARAC",
    "RTTY",
    "FREEDV",
    "PKT",
    "DATA",
    "OLIVIA",
    "JT65",
    "JT9",
    "MSK144",
    "Q65",
    "FST4",
    "FST4W",
)

BAND_MHZ = {
    "160m": 1.9,
    "80m": 3.6,
    "60m": 5.35,
    "40m": 7.1,
    "30m": 10.12,
    "20m": 14.15,
    "17m": 18.1,
    "15m": 21.2,
    "12m": 24.9,
    "10m": 28.4,
    "6m": 50.3,
}

t0 = time.time()


def log(message: str) -> None:
    print(f"[{time.time() - t0:7.1f}s] {message}", flush=True)


def sql_list(values: tuple[str, ...]) -> str:
    return ",".join(f"'{value}'" for value in values)


def source_inventory() -> list[dict[str, int | str]]:
    paths = sorted((ROOT / "ml/data/processed/madrigal").glob("*.parquet"))
    paths.extend([OURS, SOLAR])
    inventory = []
    for path in paths:
        stat = path.stat()
        inventory.append(
            {
                "path": str(path.relative_to(ROOT)),
                "size": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
            }
        )
    return inventory


def add_polars_features(source: Path, destination: Path, task: str) -> None:
    deg = math.pi / 180.0
    frame = pl.scan_parquet(source)
    if task == "hf":
        frame = frame.filter(pl.col("band") != "6m")
    else:
        frame = frame.filter(pl.col("band") == "6m")

    frame = frame.with_columns(
        (pl.col("hour_utc").dt.hour() + 0.5).alias("frac_hour"),
        pl.col("hour_utc").dt.ordinal_day().alias("day_of_year"),
        pl.when(pl.col("hour_utc") < pl.lit(datetime(2026, 3, 20, tzinfo=timezone.utc)))
        .then(pl.lit("train"))
        .when(pl.col("hour_utc") < pl.lit(datetime(2026, 3, 24, tzinfo=timezone.utc)))
        .then(pl.lit("val"))
        .otherwise(pl.lit("test"))
        .alias("split"),
    )
    frame = frame.with_columns(
        (
            2
            * math.pi
            / 365
            * (
                pl.col("day_of_year")
                - 1
                + (pl.col("frac_hour") - 12) / 24
            )
        ).alias("solar_gamma"),
        (2 * math.pi * pl.col("frac_hour") / 24).sin().alias("hod_sin"),
        (2 * math.pi * pl.col("frac_hour") / 24).cos().alias("hod_cos"),
        (2 * math.pi * (pl.col("day_of_year") - 1) / 365).sin().alias("doy_sin"),
        (2 * math.pi * (pl.col("day_of_year") - 1) / 365).cos().alias("doy_cos"),
        (pl.col("hour_utc").dt.weekday() >= 6).cast(pl.UInt8).alias("is_weekend"),
        pl.col("hour_utc")
        .dt.date()
        .is_in(
            [
                datetime(2026, 3, 7).date(),
                datetime(2026, 3, 8).date(),
                datetime(2026, 3, 28).date(),
                datetime(2026, 3, 29).date(),
            ]
        )
        .cast(pl.UInt8)
        .alias("is_contest"),
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
    )

    lag_columns = [
        f"{source_name}_{feature}"
        for source_name in ("reference", "sparse")
        for feature in (
            "path_prev1",
            "path_prev2",
            "path_prev3",
            "path_prev24",
            "reverse_prev1",
            "tx_band_prev1",
            "rx_band_prev1",
        )
    ]
    solar_columns = ["kp", "sfi", "bz", "by", "bt", "wind_speed", "xray", "dst", "proton"]
    band_columns = [band for band in BAND_MHZ if band != "6m"]
    frame = frame.with_columns(
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
        *[pl.col(column).log1p().alias(f"log1p_{column}") for column in lag_columns],
        *[
            pl.col(column).is_null().cast(pl.UInt8).alias(f"{column}_missing")
            for column in solar_columns
        ],
        *[
            (pl.col("band") == band).cast(pl.UInt8).alias(f"band_{band}")
            for band in band_columns
        ],
    )
    frame = frame.drop(
        "frac_hour",
        "day_of_year",
        "solar_gamma",
        "solar_declination",
        "equation_of_time",
    )
    frame.sink_parquet(destination, compression="zstd", statistics=True)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    temp_dir = OUT_DIR / "duckdb_tmp"
    temp_dir.mkdir(exist_ok=True)

    con = duckdb.connect()
    con.execute("SET TimeZone='UTC'")
    con.execute("SET memory_limit='20GB'")
    con.execute("SET threads=10")
    con.execute("SET preserve_insertion_order=false")
    con.execute(f"SET temp_directory='{temp_dir}'")

    modes = sql_list(DIGITAL_MODES)
    con.execute(
        f"""
        CREATE TEMP VIEW reference_spots AS
        SELECT hour_utc, band, tx_field, rx_field, tx_callsign, rx_callsign
        FROM read_parquet('{MAD}')
        WHERE ssrc = 'PSK' AND mode_class = 'digital'
          AND hour_utc >= TIMESTAMPTZ '{START}'
          AND hour_utc < TIMESTAMPTZ '{END}'
          AND tx_field IS NOT NULL AND rx_field IS NOT NULL;

        CREATE TEMP VIEW sparse_spots AS
        SELECT hour_utc, band, tx_field, rx_field, tx_callsign, rx_callsign
        FROM read_parquet('{OURS}')
        WHERE source = 'pskreporter' AND mode IN ({modes})
          AND hour_utc >= TIMESTAMPTZ '{START}'
          AND hour_utc < TIMESTAMPTZ '{END}'
          AND tx_field IS NOT NULL AND rx_field IS NOT NULL;
        """
    )

    log("building train-only common pair universe")
    con.execute(
        f"""
        CREATE TEMP TABLE reference_pairs AS
        SELECT tx_field, rx_field, count(*) AS n
        FROM reference_spots
        WHERE hour_utc < TIMESTAMPTZ '{TRAIN_END}'
        GROUP BY 1, 2 HAVING count(*) >= {MIN_PAIR_SPOTS};

        CREATE TEMP TABLE sparse_pairs AS
        SELECT tx_field, rx_field, count(*) AS n
        FROM sparse_spots
        WHERE hour_utc < TIMESTAMPTZ '{TRAIN_END}'
        GROUP BY 1, 2 HAVING count(*) >= {MIN_PAIR_SPOTS};

        CREATE TEMP TABLE pairs AS
        SELECT r.tx_field, r.rx_field, r.n AS reference_train_spots,
               s.n AS sparse_train_spots
        FROM reference_pairs r
        JOIN sparse_pairs s USING (tx_field, rx_field);

        CREATE TEMP TABLE tx_fields AS SELECT DISTINCT tx_field FROM pairs;
        CREATE TEMP TABLE rx_fields AS SELECT DISTINCT rx_field FROM pairs;
        """
    )
    pair_count = con.execute("SELECT count(*) FROM pairs").fetchone()[0]
    log(f"common pairs: {pair_count:,}")

    log("aggregating PSK labels on common pairs")
    con.execute(
        """
        CREATE TEMP TABLE reference_pos AS
        SELECT s.hour_utc, s.band, s.tx_field, s.rx_field,
               count(*) AS spot_count
        FROM reference_spots s
        JOIN pairs p USING (tx_field, rx_field)
        GROUP BY 1, 2, 3, 4;

        CREATE TEMP TABLE sparse_pos AS
        SELECT s.hour_utc, s.band, s.tx_field, s.rx_field,
               count(*) AS spot_count
        FROM sparse_spots s
        JOIN pairs p USING (tx_field, rx_field)
        GROUP BY 1, 2, 3, 4;
        """
    )

    log("aggregating same-band endpoint activity")
    con.execute(
        """
        CREATE TEMP TABLE reference_tx_band AS
        SELECT s.hour_utc, s.band, s.tx_field,
               count(*) AS spots, count(DISTINCT tx_callsign) AS stations
        FROM reference_spots s JOIN tx_fields f USING (tx_field)
        GROUP BY 1, 2, 3;

        CREATE TEMP TABLE reference_rx_band AS
        SELECT s.hour_utc, s.band, s.rx_field,
               count(*) AS spots, count(DISTINCT rx_callsign) AS stations
        FROM reference_spots s JOIN rx_fields f USING (rx_field)
        GROUP BY 1, 2, 3;

        CREATE TEMP TABLE sparse_tx_band AS
        SELECT s.hour_utc, s.band, s.tx_field,
               count(*) AS spots, count(DISTINCT tx_callsign) AS stations
        FROM sparse_spots s JOIN tx_fields f USING (tx_field)
        GROUP BY 1, 2, 3;

        CREATE TEMP TABLE sparse_rx_band AS
        SELECT s.hour_utc, s.band, s.rx_field,
               count(*) AS spots, count(DISTINCT rx_callsign) AS stations
        FROM sparse_spots s JOIN rx_fields f USING (rx_field)
        GROUP BY 1, 2, 3;
        """
    )

    log("building pair geometry")
    con.execute(
        """
        CREATE TEMP TABLE pair_geometry AS
        WITH coords AS (
            SELECT *,
                (ascii(substr(tx_field, 1, 1)) - 65) * 20 - 170.0 AS tx_lon,
                (ascii(substr(tx_field, 2, 1)) - 65) * 10 - 85.0 AS tx_lat,
                (ascii(substr(rx_field, 1, 1)) - 65) * 20 - 170.0 AS rx_lon,
                (ascii(substr(rx_field, 2, 1)) - 65) * 10 - 85.0 AS rx_lat
            FROM pairs
        ), radians AS (
            SELECT *, radians(tx_lat) la1, radians(tx_lon) lo1,
                   radians(rx_lat) la2, radians(rx_lon) lo2
            FROM coords
        ), vectors AS (
            SELECT *, lo2 - lo1 AS dlon,
                   cos(la2) * cos(lo2 - lo1) AS bx,
                   cos(la2) * sin(lo2 - lo1) AS by_vec
            FROM radians
        ), geometry AS (
            SELECT *,
                acos(greatest(-1.0, least(1.0,
                    sin(la1) * sin(la2) + cos(la1) * cos(la2) * cos(dlon)
                ))) AS central,
                atan2(sin(la1) + sin(la2),
                      sqrt(pow(cos(la1) + bx, 2) + pow(by_vec, 2))) AS mid_lat_rad,
                lo1 + atan2(by_vec, cos(la1) + bx) AS mid_lon_rad,
                atan2(sin(dlon) * cos(la2),
                      cos(la1) * sin(la2) - sin(la1) * cos(la2) * cos(dlon))
                      AS bearing
            FROM vectors
        )
        SELECT tx_field, rx_field,
               tx_lat, tx_lon, rx_lat, rx_lon,
               degrees(mid_lat_rad) AS mid_lat,
               degrees(mid_lon_rad) AS mid_lon,
               central * 6371.0 AS dist_km,
               sin(bearing) AS bearing_sin,
               cos(bearing) AS bearing_cos,
               sin(la1) AS tx_lat_sin, cos(la1) AS tx_lat_cos,
               sin(lo1) AS tx_lon_sin, cos(lo1) AS tx_lon_cos,
               sin(la2) AS rx_lat_sin, cos(la2) AS rx_lat_cos,
               sin(lo2) AS rx_lon_sin, cos(lo2) AS rx_lon_cos,
               sin(mid_lat_rad) AS mid_lat_sin, cos(mid_lat_rad) AS mid_lat_cos,
               sin(mid_lon_rad) AS mid_lon_sin, cos(mid_lon_rad) AS mid_lon_cos
        FROM geometry;
        """
    )

    log("building as-of solar features")
    con.execute(
        f"""
        CREATE TEMP TABLE solar_raw AS
        SELECT date_trunc('hour', captured_at) AS observed_hour,
               avg(kp_index) AS kp, avg(sfi) AS sfi, avg(bz_gsm) AS bz,
               avg(by_gsm) AS "by", avg(bt) AS bt,
               avg(solar_wind_speed) AS wind_speed,
               avg(xray_flux) AS xray, avg(dst_index) AS dst,
               avg(proton_flux_10mev) AS proton
        FROM read_csv('{SOLAR}', delim='\t', header=false, skip=1, nullstr='\\N',
            columns={{'id':'BIGINT','captured_at':'TIMESTAMPTZ','kp_index':'DOUBLE',
                     'sfi':'DOUBLE','bz_gsm':'DOUBLE','by_gsm':'DOUBLE','bt':'DOUBLE',
                     'solar_wind_speed':'DOUBLE','sunspot_number':'DOUBLE',
                     'xray_flux':'DOUBLE','proton_flux_10mev':'DOUBLE',
                     'dst_index':'DOUBLE','solar_wind_density':'DOUBLE'}})
        GROUP BY 1;

        CREATE TEMP TABLE solar AS
        SELECT observed_hour + INTERVAL 1 HOUR AS hour_utc,
               kp, sfi, bz, "by", bt, wind_speed, xray, dst, proton,
               kp - lag(kp, 3) OVER w AS kp_delta_3h,
               max(kp) OVER (w ROWS BETWEEN 23 PRECEDING AND CURRENT ROW) AS kp_max_24h,
               min(bz) OVER (w ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS bz_min_3h,
               max(xray) OVER (w ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) AS xray_max_6h
        FROM solar_raw WINDOW w AS (ORDER BY observed_hour);
        """
    )

    log("joining candidates, labels, lags, geometry, and solar")
    con.execute(
        f"""
        COPY (
            SELECT
                tx.hour_utc + INTERVAL 1 HOUR AS hour_utc,
                tx.band, p.tx_field, p.rx_field,
                coalesce(r0.spot_count, 0)::INTEGER AS reference_count,
                coalesce(o0.spot_count, 0)::INTEGER AS sparse_count,
                (r0.spot_count IS NOT NULL)::UTINYINT AS reference_open,
                (o0.spot_count IS NOT NULL)::UTINYINT AS sparse_open,
                tx.spots::INTEGER AS reference_tx_exposure_prev1,
                rx.spots::INTEGER AS reference_rx_exposure_prev1,
                tx.stations::INTEGER AS reference_tx_stations_prev1,
                rx.stations::INTEGER AS reference_rx_stations_prev1,

                coalesce(r1.spot_count, 0)::INTEGER AS reference_path_prev1,
                coalesce(r2.spot_count, 0)::INTEGER AS reference_path_prev2,
                coalesce(r3.spot_count, 0)::INTEGER AS reference_path_prev3,
                coalesce(r24.spot_count, 0)::INTEGER AS reference_path_prev24,
                coalesce(rr1.spot_count, 0)::INTEGER AS reference_reverse_prev1,
                coalesce(rtx1.spots, 0)::INTEGER AS reference_tx_band_prev1,
                coalesce(rrx1.spots, 0)::INTEGER AS reference_rx_band_prev1,

                coalesce(o1.spot_count, 0)::INTEGER AS sparse_path_prev1,
                coalesce(o2.spot_count, 0)::INTEGER AS sparse_path_prev2,
                coalesce(o3.spot_count, 0)::INTEGER AS sparse_path_prev3,
                coalesce(o24.spot_count, 0)::INTEGER AS sparse_path_prev24,
                coalesce(or1.spot_count, 0)::INTEGER AS sparse_reverse_prev1,
                coalesce(otx1.spots, 0)::INTEGER AS sparse_tx_band_prev1,
                coalesce(orx1.spots, 0)::INTEGER AS sparse_rx_band_prev1,

                g.* EXCLUDE (tx_field, rx_field),
                CASE tx.band
                    WHEN '160m' THEN 1.9 WHEN '80m' THEN 3.6
                    WHEN '60m' THEN 5.35 WHEN '40m' THEN 7.1
                    WHEN '30m' THEN 10.12 WHEN '20m' THEN 14.15
                    WHEN '17m' THEN 18.1 WHEN '15m' THEN 21.2
                    WHEN '12m' THEN 24.9 WHEN '10m' THEN 28.4
                    WHEN '6m' THEN 50.3
                END::FLOAT AS band_mhz,
                s.kp, s.sfi, s.bz, s."by" AS "by", s.bt, s.wind_speed,
                s.xray, s.dst, s.proton, s.kp_delta_3h,
                s.kp_max_24h, s.bz_min_3h, s.xray_max_6h
            FROM pairs p
            JOIN reference_tx_band tx USING (tx_field)
            JOIN reference_rx_band rx
              ON rx.hour_utc = tx.hour_utc AND rx.band = tx.band
             AND rx.rx_field = p.rx_field
            LEFT JOIN reference_pos r0
              ON r0.hour_utc = tx.hour_utc + INTERVAL 1 HOUR AND r0.band = tx.band
             AND r0.tx_field = p.tx_field AND r0.rx_field = p.rx_field
            LEFT JOIN sparse_pos o0
              ON o0.hour_utc = tx.hour_utc + INTERVAL 1 HOUR AND o0.band = tx.band
             AND o0.tx_field = p.tx_field AND o0.rx_field = p.rx_field

            LEFT JOIN reference_pos r1 ON r1.hour_utc = tx.hour_utc
             AND r1.band = tx.band AND r1.tx_field = p.tx_field AND r1.rx_field = p.rx_field
            LEFT JOIN reference_pos r2 ON r2.hour_utc = tx.hour_utc - INTERVAL 1 HOUR
             AND r2.band = tx.band AND r2.tx_field = p.tx_field AND r2.rx_field = p.rx_field
            LEFT JOIN reference_pos r3 ON r3.hour_utc = tx.hour_utc - INTERVAL 2 HOUR
             AND r3.band = tx.band AND r3.tx_field = p.tx_field AND r3.rx_field = p.rx_field
            LEFT JOIN reference_pos r24 ON r24.hour_utc = tx.hour_utc - INTERVAL 23 HOUR
             AND r24.band = tx.band AND r24.tx_field = p.tx_field AND r24.rx_field = p.rx_field
            LEFT JOIN reference_pos rr1 ON rr1.hour_utc = tx.hour_utc
             AND rr1.band = tx.band AND rr1.tx_field = p.rx_field AND rr1.rx_field = p.tx_field
            LEFT JOIN reference_tx_band rtx1 ON rtx1.hour_utc = tx.hour_utc
             AND rtx1.band = tx.band AND rtx1.tx_field = p.tx_field
            LEFT JOIN reference_rx_band rrx1 ON rrx1.hour_utc = tx.hour_utc
             AND rrx1.band = tx.band AND rrx1.rx_field = p.rx_field

            LEFT JOIN sparse_pos o1 ON o1.hour_utc = tx.hour_utc
             AND o1.band = tx.band AND o1.tx_field = p.tx_field AND o1.rx_field = p.rx_field
            LEFT JOIN sparse_pos o2 ON o2.hour_utc = tx.hour_utc - INTERVAL 1 HOUR
             AND o2.band = tx.band AND o2.tx_field = p.tx_field AND o2.rx_field = p.rx_field
            LEFT JOIN sparse_pos o3 ON o3.hour_utc = tx.hour_utc - INTERVAL 2 HOUR
             AND o3.band = tx.band AND o3.tx_field = p.tx_field AND o3.rx_field = p.rx_field
            LEFT JOIN sparse_pos o24 ON o24.hour_utc = tx.hour_utc - INTERVAL 23 HOUR
             AND o24.band = tx.band AND o24.tx_field = p.tx_field AND o24.rx_field = p.rx_field
            LEFT JOIN sparse_pos or1 ON or1.hour_utc = tx.hour_utc
             AND or1.band = tx.band AND or1.tx_field = p.rx_field AND or1.rx_field = p.tx_field
            LEFT JOIN sparse_tx_band otx1 ON otx1.hour_utc = tx.hour_utc
             AND otx1.band = tx.band AND otx1.tx_field = p.tx_field
            LEFT JOIN sparse_rx_band orx1 ON orx1.hour_utc = tx.hour_utc
             AND orx1.band = tx.band AND orx1.rx_field = p.rx_field

            JOIN pair_geometry g
              ON g.tx_field = p.tx_field AND g.rx_field = p.rx_field
            LEFT JOIN solar s ON s.hour_utc = tx.hour_utc + INTERVAL 1 HOUR
            WHERE tx.hour_utc + INTERVAL 1 HOUR >= TIMESTAMPTZ '{START}'
              AND tx.hour_utc + INTERVAL 1 HOUR < TIMESTAMPTZ '{END}'
            ORDER BY tx.hour_utc + INTERVAL 1 HOUR, tx.band, p.tx_field, p.rx_field
        ) TO '{BASE}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000);
        """
    )

    log("adding Polars features and writing independent tasks")
    add_polars_features(BASE, HF_OUT, "hf")
    add_polars_features(BASE, SIX_OUT, "6m")
    BASE.unlink(missing_ok=True)

    stats = {}
    for task, path in (("hf", HF_OUT), ("6m", SIX_OUT)):
        result = con.execute(
            f"""
            SELECT split, count(*) AS rows,
                   avg(reference_open) AS reference_open_rate,
                   avg(sparse_open) AS sparse_open_rate,
                   sum(reference_open) AS reference_positives,
                   sum(sparse_open) AS sparse_positives
            FROM read_parquet('{path}') GROUP BY split ORDER BY split
            """
        )
        columns = [column[0] for column in result.description]
        stats[task] = [dict(zip(columns, row, strict=True)) for row in result.fetchall()]
        log(f"{task}: {stats[task]}")

    inventory = source_inventory()
    inventory_hash = hashlib.sha256(
        json.dumps(inventory, sort_keys=True).encode("utf-8")
    ).hexdigest()
    manifest = {
        "schema_version": 2,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "source_filters": {
            "reference": "Madrigal ssrc=PSK, mode_class=digital",
            "sparse": f"collector source=pskreporter, mode in {list(DIGITAL_MODES)}",
        },
        "period": {"start": START, "train_end": TRAIN_END, "val_end": VAL_END, "end": END},
        "minimum_train_pair_spots_per_source": MIN_PAIR_SPOTS,
        "common_pairs": pair_count,
        "sampling": "none",
        "input_inventory_sha256": inventory_hash,
        "input_inventory": inventory,
        "outputs": {
            "hf": str(HF_OUT.relative_to(ROOT)),
            "6m": str(SIX_OUT.relative_to(ROOT)),
        },
        "stats": stats,
        "versions": {
            package: importlib.metadata.version(package)
            for package in ("duckdb", "polars", "pyarrow", "numpy")
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    log(f"wrote manifest {MANIFEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
