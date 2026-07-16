#!/usr/bin/env python3
"""Build a bounded, issued-input P.533 diagnostic without reading gate labels."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

import duckdb
import numpy as np
import polars as pl
from sklearn.isotonic import IsotonicRegression

from build_futurecast_examples import BAND_MHZ
from external_memory import MetricAccumulator
from p533_adapter import Circuit, P533Runner


ROOT = Path(__file__).resolve().parents[3]
V4_2 = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(V4_2))

from m5_runtime import validate_m5_runtime  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/futurecast_v1.json"
RUNTIME_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_SOURCE = ROOT / "ml/data/vendor/itu-r-hf-v14.3"
DEFAULT_BUILD_MANIFEST = ROOT / "ml/results/propagation_v4/p533_build_manifest.json"
JOIN_COLUMNS = ("issue_time", "horizon_hours", "band", "tx_grid4", "rx_grid4")
_PROCESS_RUNNER: P533Runner | None = None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(
        json.dumps(payload, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def atomic_parquet(frame: pl.DataFrame, path: Path) -> None:
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


def f107_to_sunspot_number(f107: float) -> int:
    """Australian BOM statistical F10.7-to-sunspot conversion, P.533-clipped."""
    if not np.isfinite(f107):
        raise ValueError("P.533 F10.7 input must be finite")
    difference = float(f107) - 67.0
    estimate = (
        1.61 * difference
        - (0.0733 * difference) ** 2
        + (0.0240 * difference) ** 3
    )
    return max(1, min(311, int(round(estimate))))


def grid_center(grid4: str) -> tuple[float, float]:
    value = grid4.strip().upper()
    if (
        len(value) != 4
        or not "A" <= value[0] <= "R"
        or not "A" <= value[1] <= "R"
        or not value[2:].isdigit()
    ):
        raise ValueError("P.533 requires a valid four-character Maidenhead grid")
    longitude = (ord(value[0]) - ord("A")) * 20 - 180 + int(value[2]) * 2 + 1
    latitude = (ord(value[1]) - ord("A")) * 10 - 90 + int(value[3]) + 0.5
    return float(latitude), float(longitude)


def quoted_paths(paths: Sequence[Path]) -> str:
    return ",".join("'" + str(path).replace("'", "''") + "'" for path in paths)


def sample_sql(
    paths: Sequence[Path],
    *,
    f107_feature: str,
    rows_per_band_day: int,
    seed: int,
    include_labels: bool,
) -> str:
    if not paths:
        raise RuntimeError("P.533 sample source is empty")
    label_columns = ", success_rate, opportunities" if include_labels else ""
    escaped_feature = f107_feature.replace('"', '""')
    return f"""
      WITH ranked AS (
        SELECT issue_time, valid_time, horizon_hours, band, tx_grid4, rx_grid4,
               \"{escaped_feature}\" AS issued_f107{label_columns},
               row_number() OVER (
                 PARTITION BY CAST(issue_time AS DATE), horizon_hours, band
                 ORDER BY md5(concat_ws('|', CAST(issue_time AS VARCHAR),
                                        CAST(horizon_hours AS VARCHAR), band,
                                        tx_grid4, rx_grid4, '{int(seed)}'))
               ) AS sample_rank
        FROM read_parquet([{quoted_paths(paths)}], hive_partitioning=false)
      )
      SELECT * EXCLUDE (sample_rank)
      FROM ranked
      WHERE sample_rank <= {int(rows_per_band_day)}
      ORDER BY horizon_hours, issue_time, band, tx_grid4, rx_grid4
    """


def select_sample(
    records: Sequence[Mapping[str, Any]],
    *,
    f107_feature: str,
    rows_per_band_day: int,
    seed: int,
    include_labels: bool,
) -> pl.DataFrame:
    paths = [Path(str(row["path"])) for row in records]
    connection = duckdb.connect()
    try:
        connection.execute("SET TimeZone='UTC'")
        return connection.execute(
            sample_sql(
                paths,
                f107_feature=f107_feature,
                rows_per_band_day=rows_per_band_day,
                seed=seed,
                include_labels=include_labels,
            )
        ).pl().with_columns(
            pl.col("issue_time").dt.convert_time_zone("UTC"),
            pl.col("valid_time").dt.convert_time_zone("UTC"),
        )
    finally:
        connection.close()


def validate_sample_coverage(
    frame: pl.DataFrame,
    *,
    horizons: Sequence[int],
    expected_days: int,
) -> None:
    if frame.is_empty() or frame.select(pl.struct(JOIN_COLUMNS).is_duplicated().any()).item():
        raise RuntimeError("P.533 sample is empty or has duplicate path keys")
    daily = frame.group_by(
        "horizon_hours",
        pl.col("issue_time").dt.date().alias("issue_day"),
        "band",
    ).len()
    if daily.height != len(horizons) * expected_days * 10 or daily["len"].min() <= 0:
        raise RuntimeError("P.533 sample is missing a required day-band stratum")
    summary = frame.group_by("horizon_hours").agg(
        pl.col("issue_time").dt.date().n_unique().alias("issue_days"),
        pl.col("band").n_unique().alias("bands"),
    )
    actual = {
        int(row["horizon_hours"]): (int(row["issue_days"]), int(row["bands"]))
        for row in summary.to_dicts()
    }
    expected = {int(value): (expected_days, 10) for value in horizons}
    if actual != expected:
        raise RuntimeError(f"P.533 sample coverage differs from protocol: {actual}")


def row_key(row: Mapping[str, Any], settings: Mapping[str, Any]) -> tuple[Any, ...]:
    tx_lat, tx_lon = grid_center(str(row["tx_grid4"]))
    rx_lat, rx_lon = grid_center(str(row["rx_grid4"]))
    valid = row["valid_time"]
    if not isinstance(valid, datetime):
        valid = datetime.fromisoformat(str(valid).replace("Z", "+00:00"))
    return (
        round(tx_lat, 4),
        round(tx_lon, 4),
        round(rx_lat, 4),
        round(rx_lon, 4),
        valid.year,
        valid.month,
        valid.hour,
        f107_to_sunspot_number(float(row["issued_f107"])),
        round(BAND_MHZ[str(row["band"])], 3),
        float(settings["tx_power_watts"]),
        float(settings["bandwidth_hz"]),
        float(settings["required_snr_db"]),
    )


def run_circuit(runner: P533Runner, key: tuple[Any, ...]) -> dict[str, Any]:
    (
        tx_lat,
        tx_lon,
        rx_lat,
        rx_lon,
        year,
        month,
        hour,
        sunspot,
        frequency,
        power,
        bandwidth,
        required_snr,
    ) = key
    output = runner.run(
        Circuit(
            tx_lat=tx_lat,
            tx_lon=tx_lon,
            rx_lat=rx_lat,
            rx_lon=rx_lon,
            year=year,
            month=month,
            utc_hours=(hour,),
            sunspot_number=sunspot,
            frequencies_mhz=(frequency,),
            tx_power_watts=power,
            bandwidth_hz=bandwidth,
            required_snr_db=required_snr,
        )
    )
    if len(output) != 1:
        raise RuntimeError(f"expected one P.533 output row, received {len(output)}")
    return output[0]


def initialize_runner(source: str) -> None:
    global _PROCESS_RUNNER
    _PROCESS_RUNNER = P533Runner(Path(source))


def run_circuit_in_process(key: tuple[Any, ...]) -> dict[str, Any]:
    if _PROCESS_RUNNER is None:
        raise RuntimeError("P.533 worker is not initialized")
    return run_circuit(_PROCESS_RUNNER, key)


def metric(target: np.ndarray, prediction: np.ndarray, weight: np.ndarray) -> dict[str, Any]:
    accumulator = MetricAccumulator()
    accumulator.update(target, prediction, weight)
    return accumulator.result()


def fit_calibrator(
    frame: pl.DataFrame,
    *,
    fit_days: int,
    guard_days: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    days = sorted(set(frame.get_column("issue_time").dt.date().to_list()))
    if len(days) != fit_days + guard_days:
        raise RuntimeError("P.533 calibration split has the wrong issue-day count")
    fit = frame.filter(pl.col("issue_time").dt.date().is_in(days[:fit_days]))
    guard = frame.filter(pl.col("issue_time").dt.date().is_in(days[fit_days:]))
    model = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    model.fit(
        fit.get_column("p533_snr_db").to_numpy(),
        fit.get_column("success_rate").to_numpy(),
        sample_weight=fit.get_column("opportunities").to_numpy(),
    )
    isotonic = {
        "method": "isotonic_snr",
        "x_thresholds": [float(value) for value in model.X_thresholds_],
        "y_thresholds": [float(value) for value in model.y_thresholds_],
    }
    candidates = {
        "raw_reliability": guard.get_column("p533_raw_reliability").to_numpy(),
        "isotonic_snr": np.interp(
            guard.get_column("p533_snr_db").to_numpy(),
            np.asarray(isotonic["x_thresholds"]),
            np.asarray(isotonic["y_thresholds"]),
        ),
    }
    target = guard.get_column("success_rate").to_numpy()
    weight = guard.get_column("opportunities").to_numpy()
    metrics = {
        name: metric(target, prediction, weight)
        for name, prediction in candidates.items()
    }
    selected = min(
        candidates,
        key=lambda name: (
            metrics[name]["weighted_brier"],
            metrics[name]["weighted_log_loss"],
            0 if name == "raw_reliability" else 1,
        ),
    )
    calibrator = {"method": "raw_reliability"} if selected == "raw_reliability" else isotonic
    return calibrator, {"selected": selected, "guard_metrics": metrics}


def apply_calibrator(frame: pl.DataFrame, calibrator: Mapping[str, Any]) -> np.ndarray:
    if calibrator["method"] == "raw_reliability":
        return frame.get_column("p533_raw_reliability").to_numpy()
    if calibrator["method"] != "isotonic_snr":
        raise ValueError("unsupported P.533 calibrator")
    return np.interp(
        frame.get_column("p533_snr_db").to_numpy(),
        np.asarray(calibrator["x_thresholds"]),
        np.asarray(calibrator["y_thresholds"]),
    )


def validate_build(source: Path, manifest_path: Path, expected_tag: str) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("tag") != expected_tag:
        raise RuntimeError("P.533 build manifest tag differs from FutureCast config")
    for record in manifest.get("artifacts", []):
        artifact = source / str(record["path"])
        if sha256(artifact) != record.get("sha256"):
            raise RuntimeError("P.533 pinned binary checksum mismatch")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--examples-root", type=Path, required=True)
    parser.add_argument("--training-manifest", type=Path, required=True)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--p533-build-manifest", type=Path, default=DEFAULT_BUILD_MANIFEST)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--force-development-rerun", action="store_true")
    parser.add_argument("--allow-synthetic-fixture", action="store_true")
    args = parser.parse_args()

    args.config = args.config.expanduser().resolve()
    args.examples_root = args.examples_root.expanduser().resolve()
    args.training_manifest = args.training_manifest.expanduser().resolve()
    args.source = args.source.expanduser().resolve()
    args.p533_build_manifest = args.p533_build_manifest.expanduser().resolve()
    args.output_root = args.output_root.expanduser().resolve()
    if args.output_root.is_relative_to(ROOT):
        raise RuntimeError("FutureCast P.533 private output must remain outside the repository")
    args.output_root.mkdir(parents=True, exist_ok=True)
    os.chmod(args.output_root, 0o700)
    output_manifest = args.output_root / "P533_MANIFEST.json"

    config = json.loads(args.config.read_text(encoding="utf-8"))
    validate_m5_runtime(json.loads(RUNTIME_CONFIG.read_text(encoding="utf-8")))
    examples_path = args.examples_root / "EXAMPLE_MANIFEST.json"
    examples = json.loads(examples_path.read_text(encoding="utf-8"))
    training = json.loads(args.training_manifest.read_text(encoding="utf-8"))
    if (
        examples.get("config_sha256") != sha256(args.config)
        or training.get("example_manifest_sha256") != sha256(examples_path)
        or training.get("decision") != "models_frozen_gate_unopened"
        or training.get("gate", {}).get("rows_read") is not False
        or examples.get("data_scope") != training.get("data_scope")
        or examples.get("data_scope")
        not in {"production_issued_history", "synthetic_fixture"}
    ):
        raise RuntimeError("P.533 inputs are not frozen before gate access")
    if (
        examples["data_scope"] == "synthetic_fixture"
        and not args.allow_synthetic_fixture
    ):
        raise RuntimeError("synthetic P.533 diagnostic requires explicit acknowledgement")
    if examples["data_scope"] == "production_issued_history" and args.force_development_rerun:
        raise RuntimeError("production FutureCast P.533 diagnostics are immutable")
    if output_manifest.exists() and (
        examples["data_scope"] == "production_issued_history"
        or not args.force_development_rerun
    ):
        raise RuntimeError("FutureCast P.533 diagnostic is already frozen")
    build = validate_build(
        args.source,
        args.p533_build_manifest,
        str(config["p533"]["source_tag"]),
    )
    runner = P533Runner(args.source)
    if runner.version() != build.get("self_reported_version"):
        raise RuntimeError("P.533 runtime version differs from the pinned build")

    calibration_records = [
        row for row in examples["partitions"] if row["split"] == "calibration"
    ]
    gate_records = [row for row in examples["partitions"] if row["split"] == "gate"]
    for record in (*calibration_records, *gate_records):
        if sha256(Path(record["path"])) != record.get("sha256"):
            raise RuntimeError("P.533 source example checksum mismatch")
    settings = config["p533"]
    rows_per = int(settings["rows_per_band_per_issue_day"])
    f107_feature = str(settings["forecast_f107_feature"])
    calibration = select_sample(
        calibration_records,
        f107_feature=f107_feature,
        rows_per_band_day=rows_per,
        seed=int(config["seed"]),
        include_labels=True,
    )
    gate = select_sample(
        gate_records,
        f107_feature=f107_feature,
        rows_per_band_day=rows_per,
        seed=int(config["seed"]),
        include_labels=False,
    )
    horizons = [int(value) for value in config["horizons_hours"]]
    validate_sample_coverage(calibration, horizons=horizons, expected_days=15)
    validate_sample_coverage(gate, horizons=horizons, expected_days=15)

    combined = pl.concat(
        [
            calibration.with_columns(pl.lit("calibration").alias("sample_split")),
            gate.with_columns(
                pl.lit(None, dtype=pl.Float64).alias("success_rate"),
                pl.lit(None, dtype=pl.Float64).alias("opportunities"),
                pl.lit("gate").alias("sample_split"),
            ),
        ],
        how="diagonal_relaxed",
    )
    rows = combined.to_dicts()
    keys = [row_key(row, settings) for row in rows]
    unique_keys = list(dict.fromkeys(keys))
    outputs: dict[tuple[Any, ...], dict[str, Any]] = {}
    failures: list[dict[str, str]] = []
    started = time.perf_counter()
    workers = int(settings["workers"])
    if workers != int(config["compute"]["physical_cores"]):
        raise RuntimeError("P.533 worker contract does not use the M5 physical cores")
    with concurrent.futures.ProcessPoolExecutor(
        max_workers=workers,
        initializer=initialize_runner,
        initargs=(str(args.source),),
    ) as pool:
        pending = {pool.submit(run_circuit_in_process, key): key for key in unique_keys}
        for completed, future in enumerate(concurrent.futures.as_completed(pending), 1):
            key = pending[future]
            try:
                outputs[key] = future.result()
            except Exception as error:  # noqa: BLE001
                failures.append(
                    {
                        "key_sha256": hashlib.sha256(repr(key).encode()).hexdigest(),
                        "error": str(error),
                    }
                )
            if completed % 1000 == 0:
                print(f"P.533 {completed:,}/{len(unique_keys):,}", flush=True)
    if failures:
        raise RuntimeError(f"{len(failures)} P.533 circuits failed; first={failures[0]}")

    enriched = combined.with_columns(
        pl.Series(
            "p533_snr_db",
            [float(outputs[key]["snr_db"]) for key in keys],
        ),
        pl.Series(
            "p533_raw_reliability",
            [float(outputs[key]["overall_circuit_reliability"]) for key in keys],
        ),
        pl.Series("p533_sunspot_number", [int(key[7]) for key in keys]),
    )
    partitions: list[dict[str, Any]] = []
    calibration_evidence: dict[str, Any] = {}
    for horizon in horizons:
        horizon_calibration = enriched.filter(
            (pl.col("horizon_hours") == horizon)
            & (pl.col("sample_split") == "calibration")
        )
        calibrator, evidence = fit_calibrator(
            horizon_calibration,
            fit_days=int(settings["calibration_fit_days"]),
            guard_days=int(settings["calibration_guard_days"]),
        )
        calibrator_path = args.output_root / f"horizon={horizon}" / "calibrator.json"
        atomic_json(calibrator_path, calibrator)
        calibration_evidence[str(horizon)] = {
            **evidence,
            "calibrator_path": str(calibrator_path),
            "calibrator_sha256": sha256(calibrator_path),
        }
        for split in ("calibration", "gate"):
            selected = enriched.filter(
                (pl.col("horizon_hours") == horizon)
                & (pl.col("sample_split") == split)
            )
            probability = np.clip(apply_calibrator(selected, calibrator), 0.0, 1.0)
            private = selected.select(
                *JOIN_COLUMNS,
                "valid_time",
                "issued_f107",
                "p533_sunspot_number",
                "p533_snr_db",
                "p533_raw_reliability",
            ).with_columns(pl.Series("probability", probability))
            path = (
                args.output_root
                / f"horizon={horizon}"
                / f"split={split}"
                / "predictions.parquet"
            )
            atomic_parquet(private, path)
            partitions.append(
                {
                    "horizon_hours": horizon,
                    "split": split,
                    "prediction_path": str(path),
                    "prediction_sha256": sha256(path),
                    "rows": private.height,
                    "issue_days": private.get_column("issue_time").dt.date().n_unique(),
                    "bands": private.get_column("band").n_unique(),
                }
            )

    manifest = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "futurecast_v1_p533_forecast_diagnostic",
        "data_scope": examples["data_scope"],
        "decision": "diagnostic_frozen_gate_labels_unread",
        "release_approved": False,
        "config_sha256": sha256(args.config),
        "example_manifest_sha256": sha256(examples_path),
        "training_manifest_sha256": sha256(args.training_manifest),
        "p533_build_manifest_sha256": sha256(args.p533_build_manifest),
        "p533_self_reported_version": runner.version(),
        "equivalent_forecast_inputs": True,
        "observed_weather_substituted": False,
        "gate_labels_read": False,
        "sampling": {
            "method": "stable_md5_rank_per_issue_day_horizon_band",
            "rows_per_band_per_issue_day": rows_per,
            "seed": int(config["seed"]),
        },
        "input_contract": {
            "f107_feature": f107_feature,
            "f107_to_sunspot_method": settings["f107_to_sunspot_method"],
            "f107_to_sunspot_equation": "R=1.61D-(0.0733D)^2+(0.0240D)^3; D=F10.7-67",
            "f107_to_sunspot_source": "https://www.sws.bom.gov.au/Educational/2/2/5",
            "sunspot_clip": [1, 311],
            "tx_power_watts": float(settings["tx_power_watts"]),
            "bandwidth_hz": float(settings["bandwidth_hz"]),
            "required_snr_db": float(settings["required_snr_db"]),
        },
        "calibration": calibration_evidence,
        "partitions": partitions,
        "execution": {
            "workers": workers,
            "sample_rows": combined.height,
            "unique_circuits": len(unique_keys),
            "wall_seconds": time.perf_counter() - started,
        },
        "privacy": {
            "callsigns_read": False,
            "station_identity_read": False,
            "equipment_read": False,
            "private_grid4_written_outside_repository": True,
        },
        "limitations": [
            "P.533 is a bounded paired diagnostic, not a full-gate release baseline.",
            "The F10.7-to-sunspot conversion is statistical and has known scatter.",
            "One watt and isotropic antennas are fixed references, not station equipment claims.",
        ],
    }
    atomic_json(output_manifest, manifest)
    print(output_manifest)


if __name__ == "__main__":
    main()
