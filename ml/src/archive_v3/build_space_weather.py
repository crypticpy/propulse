"""Build hourly, prediction-time-aligned OMNI2 and GFZ space-weather features."""

from __future__ import annotations

import argparse
import calendar
import json
import math
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import polars as pl

from common import PROCESSED, RAW, ensure_directories, load_config, month_parts, write_json


OMNI_URL = "https://spdf.gsfc.nasa.gov/pub/data/omni/low_res_omni/omni2_{year}.dat"
GFZ_URL = "https://kp.gfz.de/app/json/?start={start}&end={end}&index=Hp60"


def value(parts: list[str], index: int, fill: float) -> float | None:
    number = float(parts[index])
    return None if math.isclose(number, fill) else number


def parse_omni(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="ascii").splitlines():
        parts = line.split()
        if len(parts) < 55:
            continue
        year, day, hour = int(parts[0]), int(parts[1]), int(parts[2])
        observed = datetime(year, 1, 1, tzinfo=timezone.utc) + timedelta(
            days=day - 1, hours=hour
        )
        rows.append(
            {
                "observed_hour": observed,
                "available_at": observed + timedelta(hours=1),
                "bt": value(parts, 9, 999.9),
                "bx_gsm": value(parts, 12, 999.9),
                "by_gsm": value(parts, 15, 999.9),
                "bz_gsm": value(parts, 16, 999.9),
                "temperature_k": value(parts, 22, 9_999_999.0),
                "density_cm3": value(parts, 23, 999.9),
                "wind_speed": value(parts, 24, 9999.0),
                "flow_pressure": value(parts, 28, 99.99),
                "electric_field": value(parts, 35, 999.99),
                "plasma_beta": value(parts, 36, 999.99),
                "alfven_mach": value(parts, 37, 999.9),
                "kp": None if int(parts[38]) == 99 else int(parts[38]) / 10.0,
                "sunspot_number": None if int(parts[39]) == 999 else int(parts[39]),
                "dst": None if int(parts[40]) == 99999 else int(parts[40]),
                "ae": None if int(parts[41]) == 9999 else int(parts[41]),
                "proton_flux_10mev": value(parts, 45, 99999.99),
                "ap": None if int(parts[49]) == 999 else int(parts[49]),
                "f107": value(parts, 50, 999.9),
                "pcn": value(parts, 51, 999.9),
                "al": None if int(parts[52]) == 99999 else int(parts[52]),
                "au": None if int(parts[53]) == 99999 else int(parts[53]),
                "magnetosonic_mach": value(parts, 54, 99.9),
            }
        )
    return rows


def month_bounds(month: str) -> tuple[datetime, datetime]:
    year_s, month_s = month_parts(month)
    year, number = int(year_s), int(month_s)
    start = datetime(year, number, 1, tzinfo=timezone.utc)
    end = start + timedelta(days=calendar.monthrange(year, number)[1])
    return start, end


def download(url: str, path: Path) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as response, path.open("wb") as handle:
        while chunk := response.read(1024 * 1024):
            handle.write(chunk)


def load_hp60(month: str) -> pl.DataFrame:
    start, end = month_bounds(month)
    raw_path = RAW / f"gfz/hp60-{month}.json"
    if not raw_path.exists():
        url = GFZ_URL.format(
            start=(start - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            end=(end + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        download(url, raw_path)
    payload = json.loads(raw_path.read_text(encoding="utf-8"))
    return pl.DataFrame(
        {
            "observed_hour": pl.Series(payload["datetime"]).str.to_datetime(
                time_zone="UTC"
            ),
            "hp60": payload["Hp60"],
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    ensure_directories()
    years = sorted({int(month[:4]) for month in config["months"]})
    omni_rows = []
    for year in years:
        path = RAW / f"omni/omni2_{year}.dat"
        download(OMNI_URL.format(year=year), path)
        omni_rows.extend(parse_omni(path))
    omni = pl.DataFrame(omni_rows).unique("observed_hour").sort("observed_hour")
    hp60 = pl.concat([load_hp60(month) for month in config["months"]]).unique(
        "observed_hour"
    )
    frame = omni.join(hp60, on="observed_hour", how="left").sort("observed_hour")
    numeric = [
        name
        for name, kind in frame.schema.items()
        if kind.is_numeric() and name != "observed_hour"
    ]
    frame = frame.with_columns(
        pl.col("kp").diff(3).alias("kp_delta_3h"),
        pl.col("kp").rolling_max(24).alias("kp_max_24h"),
        pl.col("bz_gsm").rolling_min(3).alias("bz_min_3h"),
        pl.col("dst").rolling_min(6).alias("dst_min_6h"),
        *[pl.col(name).is_null().cast(pl.UInt8).alias(f"{name}_missing") for name in numeric],
    )
    output = PROCESSED / f"space_weather_{config['run_id']}.parquet"
    output.parent.mkdir(parents=True, exist_ok=True)
    frame.write_parquet(output, compression="zstd", statistics=True)
    write_json(
        PROCESSED / f"space_weather_{config['run_id']}.json",
        {
            "rows": frame.height,
            "min_time": frame["observed_hour"].min(),
            "max_time": frame["observed_hour"].max(),
            "years": years,
            "columns": frame.columns,
            "omni_source": "NASA SPDF OMNI2 hourly definitive/reprocessed files",
            "gfz_source": "GFZ Hp60 API, CC BY 4.0",
        },
    )
    print(f"{output}: {frame.height:,} rows")


if __name__ == "__main__":
    main()
