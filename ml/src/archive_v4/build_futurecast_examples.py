#!/usr/bin/env python3
"""Build leakage-safe direct-horizon FutureCast examples with Polars."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

import polars as pl

from futurecast_examples import (
    FEATURES,
    HORIZONS,
    build_issued_forecast_features,
    feature_name,
)


ROOT = Path(__file__).resolve().parents[3]
V4_2 = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(V4_2))

from m5_runtime import validate_m5_runtime  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/futurecast_v1.json"
RUNTIME_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
HF_BANDS = (
    "160m",
    "80m",
    "60m",
    "40m",
    "30m",
    "20m",
    "17m",
    "15m",
    "12m",
    "10m",
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
}
IDENTIFIER_COLUMNS = (
    "tx_grid4",
    "rx_grid4",
)
METADATA_COLUMNS = (
    "issue_time",
    "valid_time",
    "target_hour",
    "horizon_hours",
    "split",
    "band",
    "tx_grid4",
    "rx_grid4",
    "successes",
    "opportunities",
    "success_rate",
    "sampled_rows",
    "positive_rows",
    "outcome_available_at",
    "provider",
    "transform_version",
)
GEOMETRY_TIME_FEATURES = (
    "dist_km",
    "bearing_sin",
    "bearing_cos",
    "tx_lat_sin",
    "tx_lat_cos",
    "tx_lon_sin",
    "tx_lon_cos",
    "rx_lat_sin",
    "rx_lat_cos",
    "mid_lat_sin",
    "mid_lat_cos",
    "hod_sin",
    "hod_cos",
    "doy_sin",
    "doy_cos",
    "is_weekend",
    "sun_elev_tx",
    "sun_elev_rx",
    "sun_elev_mid",
    "dark_frac",
    "min_abs_elev_ends",
    "band_mhz",
    *(f"band_{band}" for band in HF_BANDS),
)


def forecast_feature_columns() -> tuple[str, ...]:
    columns: list[str] = []
    for key in FEATURES:
        name = feature_name(*key)
        columns.extend(
            (
                name,
                f"{name}__forecast_age_minutes",
                f"{name}__availability_age_minutes",
                f"{name}__missing",
            )
        )
    return tuple(columns)


def history_feature_columns(history_lags: Iterable[int]) -> tuple[str, ...]:
    return tuple(
        name
        for lag in history_lags
        for name in (f"path_success_prev{lag}", f"path_prev{lag}_available")
    )


def model_feature_columns(history_lags: Iterable[int]) -> dict[str, tuple[str, ...]]:
    weather_only = (*GEOMETRY_TIME_FEATURES, *forecast_feature_columns())
    return {
        "weather_only": weather_only,
        "direct": (*weather_only, *history_feature_columns(history_lags)),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def valid_sha256(value: object) -> bool:
    return bool(
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def aware(value: datetime | str) -> datetime:
    parsed = (
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        if isinstance(value, str)
        else value
    )
    if parsed.tzinfo is None:
        raise ValueError("FutureCast timestamps must include a timezone")
    return parsed.astimezone(timezone.utc)


def scheduled_issue_time(available_at: datetime | str, minute: int) -> datetime:
    if not 0 <= minute <= 59:
        raise ValueError("issue minute must be between 0 and 59")
    available = aware(available_at)
    candidate = available.replace(minute=minute, second=0, microsecond=0)
    if candidate < available:
        candidate += timedelta(hours=1)
    return candidate


def forecast_rows(frame: pl.DataFrame) -> list[dict[str, Any]]:
    columns = (
        "payload_sha256",
        "product",
        "issued_at",
        "valid_at",
        "available_at",
        "metric",
        "value",
        "quality",
    )
    return frame.select(columns).to_dicts()


def derive_legal_issues(
    forecasts: pl.DataFrame,
    *,
    start: date,
    end: date,
    issue_minute: int,
    horizons: Iterable[int] = HORIZONS,
) -> list[dict[str, Any]]:
    rows = forecast_rows(forecasts)
    candidates = sorted(
        {
            scheduled_issue_time(value, issue_minute)
            for value in forecasts.get_column("available_at").to_list()
        }
    )
    examples: list[dict[str, Any]] = []
    for issue_time in candidates:
        if not start <= issue_time.date() <= end:
            continue
        for horizon in horizons:
            selected = build_issued_forecast_features(
                rows,
                issue_time=issue_time,
                horizon_hours=int(horizon),
            )
            triggered_by_complete_issuance = any(
                scheduled_issue_time(value["available_at"], issue_minute)
                == issue_time
                for value in selected["issuances"].values()
            )
            if selected["complete"] and triggered_by_complete_issuance:
                examples.append(selected)
    return examples


def split_for_issue(
    issue_time: datetime | str,
    *,
    start: date,
    split_days: dict[str, int],
) -> str:
    offset = (aware(issue_time).date() - start).days
    train_end = int(split_days["train"])
    calibration_end = train_end + int(split_days["calibration"])
    gate_end = calibration_end + int(split_days["gate"])
    if 0 <= offset < train_end:
        return "train"
    if train_end <= offset < calibration_end:
        return "calibration"
    if calibration_end <= offset < gate_end:
        return "gate"
    raise ValueError("FutureCast issue time is outside the frozen split")


def canonical_watermarks(
    watermarks: pl.DataFrame,
    *,
    target_hour: datetime,
    provider: str,
    transform_version: str,
    available_by: datetime | None,
) -> pl.DataFrame:
    expression = (
        (pl.col("target_hour") == target_hour)
        & (pl.col("provider") == provider)
        & (pl.col("transform_version") == transform_version)
        & (pl.col("status") == "complete")
        & (pl.col("quality_flags").list.len() == 0)
    )
    if available_by is not None:
        expression &= pl.col("available_at") <= available_by
    return (
        watermarks.filter(expression)
        .sort("available_at")
        .unique(subset=("target_hour", "band"), keep="last")
        .select("target_hour", "band", "available_at", "provider", "transform_version")
    )


def paths_for_watermarks(
    paths: pl.DataFrame,
    watermarks: pl.DataFrame,
) -> pl.DataFrame:
    return (
        paths.filter(pl.col("quality_flags").list.len() == 0)
        .join(
            watermarks,
            on=("target_hour", "band", "available_at", "provider", "transform_version"),
            how="inner",
        )
    )


def grid_center(prefix: str) -> tuple[pl.Expr, pl.Expr]:
    grid = pl.col(f"{prefix}_grid4")
    lon = (
        (grid.str.slice(0, 1).str.to_integer(base=36) - 10) * 20
        - 180
        + grid.str.slice(2, 1).str.to_integer() * 2
        + 1.0
    )
    lat = (
        (grid.str.slice(1, 1).str.to_integer(base=36) - 10) * 10
        - 90
        + grid.str.slice(3, 1).str.to_integer()
        + 0.5
    )
    return lat.cast(pl.Float64), lon.cast(pl.Float64)


def add_geometry(frame: pl.DataFrame) -> pl.DataFrame:
    tx_lat, tx_lon = grid_center("tx")
    rx_lat, rx_lon = grid_center("rx")
    result = frame.with_columns(
        tx_lat.alias("tx_lat"),
        tx_lon.alias("tx_lon"),
        rx_lat.alias("rx_lat"),
        rx_lon.alias("rx_lon"),
    ).with_columns(
        pl.col("tx_lat").radians().alias("tx_lat_rad"),
        pl.col("tx_lon").radians().alias("tx_lon_rad"),
        pl.col("rx_lat").radians().alias("rx_lat_rad"),
        pl.col("rx_lon").radians().alias("rx_lon_rad"),
    )
    delta_lon = pl.col("rx_lon_rad") - pl.col("tx_lon_rad")
    haversine = (
        ((pl.col("rx_lat_rad") - pl.col("tx_lat_rad")) / 2).sin().pow(2)
        + pl.col("tx_lat_rad").cos()
        * pl.col("rx_lat_rad").cos()
        * (delta_lon / 2).sin().pow(2)
    ).clip(0.0, 1.0)
    midpoint_x = (
        pl.col("tx_lat_rad").cos() * pl.col("tx_lon_rad").cos()
        + pl.col("rx_lat_rad").cos() * pl.col("rx_lon_rad").cos()
    )
    midpoint_y = (
        pl.col("tx_lat_rad").cos() * pl.col("tx_lon_rad").sin()
        + pl.col("rx_lat_rad").cos() * pl.col("rx_lon_rad").sin()
    )
    midpoint_z = pl.col("tx_lat_rad").sin() + pl.col("rx_lat_rad").sin()
    bearing_y = delta_lon.sin() * pl.col("rx_lat_rad").cos()
    bearing_x = (
        pl.col("tx_lat_rad").cos() * pl.col("rx_lat_rad").sin()
        - pl.col("tx_lat_rad").sin()
        * pl.col("rx_lat_rad").cos()
        * delta_lon.cos()
    )
    result = result.with_columns(
        (2 * haversine.sqrt().arcsin() * 6371.0088).alias("dist_km"),
        pl.arctan2(midpoint_z, (midpoint_x.pow(2) + midpoint_y.pow(2)).sqrt()).alias(
            "mid_lat_rad"
        ),
        pl.arctan2(midpoint_y, midpoint_x).alias("mid_lon_rad"),
        pl.arctan2(bearing_y, bearing_x).alias("bearing_rad"),
    ).with_columns(
        pl.col("mid_lat_rad").degrees().alias("mid_lat"),
        pl.col("mid_lon_rad").degrees().alias("mid_lon"),
        pl.col("bearing_rad").sin().alias("bearing_sin"),
        pl.col("bearing_rad").cos().alias("bearing_cos"),
        pl.col("tx_lat_rad").sin().alias("tx_lat_sin"),
        pl.col("tx_lat_rad").cos().alias("tx_lat_cos"),
        pl.col("tx_lon_rad").sin().alias("tx_lon_sin"),
        pl.col("tx_lon_rad").cos().alias("tx_lon_cos"),
        pl.col("rx_lat_rad").sin().alias("rx_lat_sin"),
        pl.col("rx_lat_rad").cos().alias("rx_lat_cos"),
        pl.col("mid_lat_rad").sin().alias("mid_lat_sin"),
        pl.col("mid_lat_rad").cos().alias("mid_lat_cos"),
    )
    return result.drop(
        "tx_lat_rad",
        "tx_lon_rad",
        "rx_lat_rad",
        "rx_lon_rad",
        "bearing_rad",
    )


def add_valid_time_features(frame: pl.DataFrame) -> pl.DataFrame:
    degrees = math.pi / 180.0
    result = frame.with_columns(
        (
            pl.col("valid_time").dt.hour()
            + pl.col("valid_time").dt.minute() / 60.0
        ).alias("frac_hour"),
        pl.col("valid_time").dt.ordinal_day().alias("day_of_year"),
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
        (pl.col("valid_time").dt.weekday() >= 6).cast(pl.UInt8).alias("is_weekend"),
    )
    gamma = pl.col("solar_gamma")
    result = result.with_columns(
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

    def sun_elevation(latitude: str, longitude: str) -> pl.Expr:
        lat_rad = pl.col(latitude) * degrees
        hour_angle = (
            (
                pl.col("frac_hour") * 60
                + pl.col("equation_of_time")
                + 4 * pl.col(longitude)
            )
            / 4
            - 180
        ) * degrees
        sine = (
            lat_rad.sin() * pl.col("solar_declination").sin()
            + lat_rad.cos()
            * pl.col("solar_declination").cos()
            * hour_angle.cos()
        ).clip(-1.0, 1.0)
        return sine.arcsin() / degrees

    result = result.with_columns(
        sun_elevation("tx_lat", "tx_lon").alias("sun_elev_tx"),
        sun_elevation("rx_lat", "rx_lon").alias("sun_elev_rx"),
        sun_elevation("mid_lat", "mid_lon").alias("sun_elev_mid"),
        pl.col("band").replace_strict(BAND_MHZ).cast(pl.Float32).alias("band_mhz"),
        *[
            (pl.col("band") == band).cast(pl.UInt8).alias(f"band_{band}")
            for band in HF_BANDS
        ],
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
            pl.col("sun_elev_tx").abs(),
            pl.col("sun_elev_rx").abs(),
        ).alias("min_abs_elev_ends"),
    )
    return result.drop(
        "frac_hour",
        "day_of_year",
        "solar_gamma",
        "solar_declination",
        "equation_of_time",
        "tx_lat",
        "tx_lon",
        "rx_lat",
        "rx_lon",
        "mid_lat",
        "mid_lon",
        "mid_lat_rad",
        "mid_lon_rad",
    )


def build_example_frame(
    *,
    paths: pl.DataFrame,
    watermarks: pl.DataFrame,
    forecast: dict[str, Any],
    provider: str,
    transform_version: str,
    history_lags: Iterable[int],
    split: str,
) -> pl.DataFrame:
    issue_time = aware(forecast["issue_time"])
    valid_time = aware(forecast["valid_time"])
    target_hour = valid_time.replace(minute=0, second=0, microsecond=0)
    outcome_marks = canonical_watermarks(
        watermarks,
        target_hour=target_hour,
        provider=provider,
        transform_version=transform_version,
        available_by=None,
    )
    if set(outcome_marks.get_column("band").to_list()) != set(HF_BANDS):
        raise RuntimeError("FutureCast outcome hour does not have ten complete bands")
    outcome = paths_for_watermarks(paths, outcome_marks).select(
        "target_hour",
        "band",
        "tx_grid4",
        "rx_grid4",
        "successes",
        "opportunities",
        "success_rate",
        "sampled_rows",
        "positive_rows",
        pl.col("available_at").alias("outcome_available_at"),
        "provider",
        "transform_version",
    )
    if outcome.is_empty():
        raise RuntimeError("FutureCast outcome hour has no path features")
    frame = outcome
    issue_hour = issue_time.replace(minute=0, second=0, microsecond=0)
    for lag in history_lags:
        history_hour = issue_hour - timedelta(hours=int(lag))
        history_marks = canonical_watermarks(
            watermarks,
            target_hour=history_hour,
            provider=provider,
            transform_version=transform_version,
            available_by=issue_time,
        )
        history = paths_for_watermarks(paths, history_marks).select(
            "band",
            "tx_grid4",
            "rx_grid4",
            pl.col("success_rate").alias(f"path_success_prev{lag}"),
            pl.lit(1, dtype=pl.UInt8).alias(f"path_prev{lag}_available"),
            pl.col("available_at").alias(f"path_prev{lag}_available_at"),
        )
        frame = frame.join(
            history,
            on=("band", "tx_grid4", "rx_grid4"),
            how="left",
        ).with_columns(
            pl.col(f"path_success_prev{lag}").fill_null(0.0),
            pl.col(f"path_prev{lag}_available").fill_null(0),
        )

    frame = frame.with_columns(
        pl.lit(issue_time).alias("issue_time"),
        pl.lit(valid_time).alias("valid_time"),
        pl.lit(int(forecast["horizon_hours"]), dtype=pl.Int16).alias(
            "horizon_hours"
        ),
        pl.lit(split).alias("split"),
    )
    for key in FEATURES:
        name = feature_name(*key)
        provenance = forecast["provenance"][name]
        frame = frame.with_columns(
            pl.lit(float(forecast["values"][name])).alias(name),
            pl.lit(int(provenance["forecast_age_minutes"])).alias(
                f"{name}__forecast_age_minutes"
            ),
            pl.lit(int(provenance["availability_age_minutes"])).alias(
                f"{name}__availability_age_minutes"
            ),
            pl.lit(0, dtype=pl.UInt8).alias(f"{name}__missing"),
        )
    return add_valid_time_features(add_geometry(frame))


def leakage_audit(frame: pl.DataFrame, history_lags: Iterable[int]) -> dict[str, Any]:
    if frame.is_empty():
        raise RuntimeError("FutureCast example partition is empty")
    issue_time = frame.get_column("issue_time")[0]
    valid_time = frame.get_column("valid_time")[0]
    horizon = int(frame.get_column("horizon_hours")[0])
    expected_valid = issue_time + timedelta(hours=horizon)
    expected_target_hour = valid_time.replace(minute=0, second=0, microsecond=0)
    outcome_complete_after = expected_target_hour + timedelta(hours=1)
    bad_history = 0
    for lag in history_lags:
        name = f"path_prev{lag}_available_at"
        bad_history += frame.filter(pl.col(name) > pl.col("issue_time")).height
    failures = {
        "issue_valid_horizon_exact": valid_time == expected_valid,
        "outcome_target_hour_exact": frame.filter(
            pl.col("target_hour") != expected_target_hour
        ).is_empty(),
        "outcome_available_after_hour_close": frame.filter(
            pl.col("outcome_available_at") < outcome_complete_after
        ).is_empty(),
        "history_available_after_issue_rows": bad_history == 0,
        "positive_opportunities": frame.filter(pl.col("opportunities") <= 0).is_empty(),
        "success_rate_exact": frame.filter(
            (pl.col("success_rate") - pl.col("successes") / pl.col("opportunities"))
            .abs()
            > 1e-12
        ).is_empty(),
        "unique_path_keys": frame.select(
            pl.struct(
                "issue_time",
                "horizon_hours",
                "band",
                "tx_grid4",
                "rx_grid4",
            ).is_duplicated().any()
        ).item()
        is False,
        "grid4_not_in_model_features": all(
            name in METADATA_COLUMNS for name in IDENTIFIER_COLUMNS
        ),
    }
    if not all(failures.values()):
        raise RuntimeError(f"FutureCast leakage audit failed: {failures}")
    return failures


def source_partition_paths(root: Path, dataset: str, hours: Iterable[datetime]) -> list[Path]:
    paths = sorted({
        root / dataset / f"target_date={hour.date().isoformat()}" / "part-000.parquet"
        for hour in hours
    })
    missing = [path for path in paths if not path.is_file()]
    if missing:
        raise FileNotFoundError(missing)
    return paths


def atomic_write_parquet(frame: pl.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.unlink(missing_ok=True)
    frame.write_parquet(
        temporary,
        compression="zstd",
        statistics=True,
        row_group_size=250_000,
    )
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def validate_source_manifest(
    root: Path,
    manifest: dict[str, Any],
    config_path: Path,
) -> tuple[date, date, str]:
    privacy = manifest.get("privacy", {})
    data_scope = manifest.get("data_scope")
    readiness_sha256 = manifest.get("readiness_sha256")
    if (
        manifest.get("scope") != "futurecast_v1_private_source_export"
        or manifest.get("decision") != "development_sources_frozen"
        or manifest.get("release_approved") is not False
        or data_scope not in {"production_issued_history", "synthetic_fixture"}
        or manifest.get("config_sha256") != sha256(config_path)
        or (
            data_scope == "production_issued_history"
            and not valid_sha256(readiness_sha256)
        )
        or (data_scope == "synthetic_fixture" and readiness_sha256 is not None)
        or privacy.get("raw_wspr_observations_read") is not False
        or privacy.get("callsigns_read") is not False
        or privacy.get("station_identity_read") is not False
        or privacy.get("equipment_read") is not False
        or privacy.get("beta_outcomes_read") is not False
        or privacy.get("core_prospective_outcomes_read") is not False
        or privacy.get("repository_artifact_written") is not False
    ):
        raise RuntimeError("FutureCast source export manifest is invalid")
    for record in manifest.get("execution", {}).get("files", []):
        path = Path(str(record["path"])).expanduser().resolve()
        if not path.is_relative_to(root) or sha256(path) != record.get("sha256"):
            raise RuntimeError("FutureCast source file checksum mismatch")
    window = manifest["window"]
    return (
        date.fromisoformat(window["start"]),
        date.fromisoformat(window["end"]),
        str(manifest["data_scope"]),
    )


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(
        json.dumps(payload, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--allow-synthetic-fixture", action="store_true")
    args = parser.parse_args()

    config = json.loads(args.config.read_text(encoding="utf-8"))
    runtime = validate_m5_runtime(json.loads(RUNTIME_CONFIG.read_text(encoding="utf-8")))
    if runtime["physical_cores_visible"] != int(config["compute"]["physical_cores"]):
        raise RuntimeError("FutureCast materializer does not match the M5 core contract")
    source_root = args.source_root.expanduser().resolve()
    output_root = (
        args.output_root.expanduser().resolve()
        if args.output_root
        else source_root / "examples"
    )
    if output_root.is_relative_to(ROOT):
        raise RuntimeError("FutureCast examples must remain outside the repository")
    output_root.mkdir(parents=True, exist_ok=True)
    os.chmod(output_root, 0o700)
    source_manifest_path = source_root / "SOURCE_EXPORT_MANIFEST.json"
    source_manifest = json.loads(source_manifest_path.read_text(encoding="utf-8"))
    start, end, data_scope = validate_source_manifest(
        source_root, source_manifest, args.config
    )
    if data_scope == "synthetic_fixture" and not args.allow_synthetic_fixture:
        raise RuntimeError("synthetic FutureCast materialization requires explicit acknowledgement")
    manifest_path = output_root / "EXAMPLE_MANIFEST.json"
    if data_scope == "production_issued_history" and args.force:
        raise RuntimeError("production FutureCast examples are immutable")
    if manifest_path.exists() and (
        data_scope == "production_issued_history" or not args.force
    ):
        raise RuntimeError("FutureCast example manifest is already frozen")
    forecast_frame = pl.read_parquet(source_root / "forecast_values.parquet")
    legal_issues = derive_legal_issues(
        forecast_frame,
        start=start,
        end=end,
        issue_minute=int(config["issue_minute_utc"]),
        horizons=config["horizons_hours"],
    )
    if not legal_issues:
        raise RuntimeError("FutureCast source export has no complete legal issues")

    provider = str(config["wspr"]["provider"])
    transform = str(config["wspr"]["transform_version"])
    lags = [int(value) for value in config["wspr"]["history_lags_hours"]]
    feature_columns = model_feature_columns(lags)
    partitions: list[dict[str, Any]] = []
    for forecast in legal_issues:
        issue_time = aware(forecast["issue_time"])
        valid_time = aware(forecast["valid_time"])
        target_hour = valid_time.replace(minute=0, second=0, microsecond=0)
        history_hours = [
            issue_time.replace(minute=0, second=0, microsecond=0)
            - timedelta(hours=lag)
            for lag in lags
        ]
        hours = [target_hour, *history_hours]
        watermark_files = source_partition_paths(
            source_root, "wspr_watermarks", hours
        )
        path_files = source_partition_paths(source_root, "wspr_paths", hours)
        watermarks = pl.read_parquet(watermark_files)
        paths = pl.read_parquet(path_files)
        split = split_for_issue(issue_time, start=start, split_days=config["split_days"])
        frame = build_example_frame(
            paths=paths,
            watermarks=watermarks,
            forecast=forecast,
            provider=provider,
            transform_version=transform,
            history_lags=lags,
            split=split,
        )
        gates = leakage_audit(frame, lags)
        token = issue_time.strftime("%Y%m%dT%H%M%SZ")
        output = (
            output_root
            / f"horizon={int(forecast['horizon_hours'])}"
            / f"issue_date={issue_time.date().isoformat()}"
            / f"issue-{token}.parquet"
        )
        if output.exists() and not args.force:
            raise RuntimeError(f"FutureCast example partition already exists: {output}")
        atomic_write_parquet(frame, output)
        partitions.append(
            {
                "path": str(output),
                "sha256": sha256(output),
                "issue_time": issue_time.isoformat(),
                "valid_time": valid_time.isoformat(),
                "horizon_hours": int(forecast["horizon_hours"]),
                "split": split,
                "rows": frame.height,
                "opportunities": float(frame.get_column("opportunities").sum()),
                "gates": gates,
            }
        )
    manifest = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "futurecast_v1_direct_horizon_examples",
        "data_scope": data_scope,
        "decision": "development_examples_frozen",
        "release_approved": False,
        "config_sha256": sha256(args.config),
        "source_manifest_sha256": sha256(source_manifest_path),
        "readiness_sha256": source_manifest.get("readiness_sha256"),
        "window": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "days": (end - start).days + 1,
        },
        "splits": config["split_days"],
        "horizons_hours": config["horizons_hours"],
        "feature_columns": {
            name: list(columns) for name, columns in feature_columns.items()
        },
        "model_identifier_columns": [],
        "private_evaluation_metadata": list(IDENTIFIER_COLUMNS),
        "privacy": {
            "raw_wspr_observations_read": False,
            "station_identity_read": False,
            "equipment_read": False,
            "grid4_in_model_matrix": False,
            "locked_core_outcomes_read": False,
        },
        "partitions": partitions,
    }
    atomic_json(manifest_path, manifest)
    success = output_root / "_SUCCESS"
    success.write_text(sha256(manifest_path) + "\n", encoding="ascii")
    os.chmod(success, 0o600)
    print(manifest_path)


if __name__ == "__main__":
    main()
