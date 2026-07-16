#!/usr/bin/env python3
"""Score the frozen FutureCast gate once and release only passing horizons."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import resource
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Mapping, Sequence

import numpy as np
import polars as pl
import pyarrow.parquet as pq
import xgboost as xgb

from external_memory import MetricAccumulator
from train_futurecast import apply_calibrator


ROOT = Path(__file__).resolve().parents[3]
V4_2 = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(V4_2))

from m5_runtime import validate_m5_runtime  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/futurecast_v1.json"
RUNTIME_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
JOIN_COLUMNS = (
    "issue_time",
    "horizon_hours",
    "band",
    "tx_grid4",
    "rx_grid4",
)
BASELINES = ("persistence", "climatology", "weather_only")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def peak_rss_gib() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return float(value) / (1024**3) if sys.platform == "darwin" else float(value) / (1024**2)


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(
        json.dumps(payload, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def bootstrap_upper(
    day_error_deltas: Sequence[float],
    day_weights: Sequence[float],
    *,
    replicates: int,
    confidence: float,
    seed: int,
) -> float:
    errors = np.asarray(day_error_deltas, dtype=np.float64)
    weights = np.asarray(day_weights, dtype=np.float64)
    if (
        errors.size < 2
        or errors.shape != weights.shape
        or replicates < 100
        or np.any(~np.isfinite(errors))
        or np.any(~np.isfinite(weights))
        or np.any(weights <= 0)
    ):
        raise ValueError("paired issue-day bootstrap needs at least two days and 100 replicates")
    generator = np.random.default_rng(seed)
    indexes = generator.integers(0, errors.size, size=(replicates, errors.size))
    samples = errors[indexes].sum(axis=1) / weights[indexes].sum(axis=1)
    return float(np.quantile(samples, confidence))


def relative_brier_improvement(candidate_brier: float, baseline_brier: float) -> float:
    if baseline_brier > 0:
        return 1.0 - candidate_brier / baseline_brier
    return 0.0 if candidate_brier == 0 else -1.0


def release_gates(
    *,
    direct: Mapping[str, Any],
    baselines: Mapping[str, Mapping[str, Any]],
    best_baseline: str,
    paired_day_upper_95: float,
    issue_days: int,
    maximum_band_regression: float | None,
    config: Mapping[str, Any],
    p533_equivalent_forecast_inputs: bool,
    source_integrity_passed: bool,
    production_evidence: bool,
    peak_rss: float,
) -> dict[str, bool]:
    gates = config["gates"]
    wspr = config["wspr"]
    baseline = baselines[best_baseline]
    relative_improvement = relative_brier_improvement(
        float(direct["weighted_brier"]),
        float(baseline["weighted_brier"]),
    )
    return {
        "minimum_gate_issue_days": issue_days
        >= int(wspr["minimum_gate_days_per_horizon"]),
        "minimum_gate_opportunities": float(direct["weighted_opportunities"])
        >= float(wspr["minimum_gate_opportunities_per_horizon"]),
        "relative_brier_improvement": relative_improvement
        >= float(gates["minimum_relative_brier_improvement_over_best_baseline"]),
        "paired_issue_day_upper_95_below_zero": paired_day_upper_95
        < float(gates["maximum_paired_day_brier_delta_upper_95"]),
        "calibration": float(direct["expected_calibration_error"])
        <= float(gates["maximum_ece"])
        and float(direct["expected_calibration_error"])
        - float(baseline["expected_calibration_error"])
        <= float(gates["maximum_ece_delta_over_best_baseline"]),
        "supported_band_safety": maximum_band_regression is not None
        and maximum_band_regression
        <= float(gates["maximum_supported_band_relative_brier_regression"]),
        "p533_forecast_input_diagnostic": p533_equivalent_forecast_inputs,
        "source_and_training_integrity": source_integrity_passed,
        "production_issued_evidence": production_evidence,
        "m5_rss_within_limit": peak_rss
        <= float(gates["maximum_scoring_process_rss_gib"]),
    }


def validate_training_manifest(
    path: Path,
    config_path: Path,
    example_manifest_path: Path,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    examples = json.loads(example_manifest_path.read_text(encoding="utf-8"))
    training = json.loads(path.read_text(encoding="utf-8"))
    if (
        training.get("scope") != "futurecast_v1_development_models"
        or training.get("data_scope") != examples.get("data_scope")
        or training.get("data_scope")
        not in {"production_issued_history", "synthetic_fixture"}
        or training.get("decision") != "models_frozen_gate_unopened"
        or training.get("release_approved") is not False
        or training.get("config_sha256") != sha256(config_path)
        or training.get("example_manifest_sha256") != sha256(example_manifest_path)
        or training.get("gate", {}).get("rows_read") is not False
        or training.get("privacy", {}).get("grid4_model_features") is not False
        or training.get("privacy", {}).get("station_identity_read") is not False
        or training.get("privacy", {}).get("beta_outcomes_read") is not False
    ):
        raise RuntimeError("FutureCast training manifest is invalid")
    expected_models = {
        (int(horizon), profile)
        for horizon in config["horizons_hours"]
        for profile in ("direct", "weather_only")
    }
    actual_models: set[tuple[int, str]] = set()
    for row in training.get("models", []):
        model = Path(row["model_path"])
        calibrator = Path(row["calibrator_path"])
        if (
            sha256(model) != row.get("model_sha256")
            or sha256(calibrator) != row.get("calibrator_sha256")
            or row.get("gate_rows_read") is not False
        ):
            raise RuntimeError("FutureCast model checksum or gate boundary failed")
        actual_models.add((int(row["horizon_hours"]), str(row["profile"])))
    if actual_models != expected_models:
        raise RuntimeError("FutureCast training manifest does not contain eight frozen models")
    frozen_gate = {
        (row["path"], row["sha256"])
        for row in training.get("gate", {}).get("partitions_frozen", [])
    }
    actual_gate = {
        (row["path"], row["sha256"])
        for row in examples.get("partitions", [])
        if row["split"] == "gate"
    }
    if frozen_gate != actual_gate:
        raise RuntimeError("FutureCast gate partitions changed after model freeze")
    return config, examples, training


def validate_p533_manifest(
    path: Path,
    *,
    config: Mapping[str, Any],
    config_path: Path,
    example_manifest_path: Path,
    training_manifest_path: Path,
) -> dict[int, dict[str, Any]]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if (
        manifest.get("scope") != "futurecast_v1_p533_forecast_diagnostic"
        or manifest.get("decision") != "diagnostic_frozen_gate_labels_unread"
        or manifest.get("release_approved") is not False
        or manifest.get("equivalent_forecast_inputs") is not True
        or manifest.get("observed_weather_substituted") is not False
        or manifest.get("gate_labels_read") is not False
        or manifest.get("data_scope")
        != json.loads(example_manifest_path.read_text(encoding="utf-8")).get("data_scope")
        or manifest.get("config_sha256") != sha256(config_path)
        or manifest.get("example_manifest_sha256") != sha256(example_manifest_path)
        or manifest.get("training_manifest_sha256") != sha256(training_manifest_path)
    ):
        raise RuntimeError("FutureCast P.533 diagnostic manifest is invalid")
    records: dict[int, dict[str, Any]] = {}
    for row in manifest.get("partitions", []):
        if row.get("split") != "gate":
            continue
        horizon = int(row["horizon_hours"])
        if horizon in records:
            raise RuntimeError("FutureCast P.533 gate diagnostic is ambiguous")
        prediction = Path(row["prediction_path"])
        if sha256(prediction) != row.get("prediction_sha256") or int(row["rows"]) <= 0:
            raise RuntimeError(f"FutureCast P.533 prediction checksum failed: +{horizon}")
        if (
            int(row.get("issue_days", 0))
            != int(config["wspr"]["minimum_gate_days_per_horizon"])
            or int(row.get("bands", 0)) != 10
        ):
            raise RuntimeError("FutureCast P.533 sample coverage is incomplete")
        records[horizon] = row
    expected = {int(value) for value in config["horizons_hours"]}
    if set(records) != expected:
        raise RuntimeError("FutureCast P.533 predictions do not cover every horizon")
    return records


def model_record(
    training: Mapping[str, Any], horizon: int, profile: str
) -> Mapping[str, Any]:
    matches = [
        row
        for row in training["models"]
        if int(row["horizon_hours"]) == horizon and row["profile"] == profile
    ]
    if len(matches) != 1:
        raise RuntimeError("FutureCast frozen model lookup is ambiguous")
    return matches[0]


def load_model(record: Mapping[str, Any]) -> tuple[xgb.Booster, dict[str, Any]]:
    model = xgb.Booster()
    model.load_model(record["model_path"])
    calibrator = json.loads(Path(record["calibrator_path"]).read_text(encoding="utf-8"))
    return model, calibrator


def predict_model(
    frame: pl.DataFrame,
    model: xgb.Booster,
    record: Mapping[str, Any],
    calibrator: Mapping[str, Any],
) -> np.ndarray:
    matrix = frame.select(record["features"]).fill_null(0).cast(pl.Float32).to_numpy()
    raw = model.inplace_predict(
        matrix,
        iteration_range=(0, int(record["best_iteration"]) + 1),
    )
    return apply_calibrator(raw, dict(calibrator))


def climatology_prediction(
    frame: pl.DataFrame,
    climatology: Mapping[str, Any],
) -> np.ndarray:
    global_probability = float(climatology["global_probability"])
    lookup = {
        (str(row["band"]), int(row["valid_hour"])): float(row["probability"])
        for row in climatology["band_hour"]
    }
    return np.asarray(
        [
            lookup.get((str(band), int(hour)), global_probability)
            for band, hour in zip(
                frame.get_column("band"),
                frame.get_column("valid_time").dt.hour(),
            )
        ],
        dtype=np.float64,
    )


def load_p533_sample(record: Mapping[str, Any]) -> pl.DataFrame:
    prediction = pl.read_parquet(record["prediction_path"]).select(
        *JOIN_COLUMNS,
        "probability",
    ).with_columns(pl.col("issue_time").dt.convert_time_zone("UTC"))
    if prediction.select(pl.struct(JOIN_COLUMNS).is_duplicated().any()).item():
        raise RuntimeError("FutureCast P.533 predictions contain duplicate path keys")
    values = prediction.get_column("probability").to_numpy()
    if np.any(~np.isfinite(values)) or np.any((values < 0) | (values > 1)):
        raise RuntimeError("FutureCast P.533 probability is outside [0, 1]")
    return prediction


def iter_partition_frames(path: Path, *, batch_rows: int) -> Iterator[pl.DataFrame]:
    parquet = pq.ParquetFile(path)
    for batch in parquet.iter_batches(batch_size=batch_rows, use_threads=True):
        if batch.num_rows:
            yield pl.from_arrow(batch)


def score_horizon(
    *,
    horizon: int,
    records: Sequence[dict[str, Any]],
    training: Mapping[str, Any],
    climatology: Mapping[str, Any],
    p533_record: Mapping[str, Any],
    config: Mapping[str, Any],
) -> dict[str, Any]:
    direct_record = model_record(training, horizon, "direct")
    weather_record = model_record(training, horizon, "weather_only")
    direct_model, direct_calibrator = load_model(direct_record)
    weather_model, weather_calibrator = load_model(weather_record)
    accumulators = {name: MetricAccumulator() for name in ("direct", *BASELINES)}
    band_accumulators: dict[str, dict[str, MetricAccumulator]] = defaultdict(
        lambda: {name: MetricAccumulator() for name in ("direct", *BASELINES)}
    )
    day_errors: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: {name: [0.0, 0.0] for name in ("direct", *BASELINES)}
    )
    p533_sample = load_p533_sample(p533_record)
    p533_accumulators = {
        "direct": MetricAccumulator(),
        "p533": MetricAccumulator(),
    }
    p533_rows_scored = 0
    batch_rows = int(config["compute"]["score_batch_rows"])
    for record in records:
        for frame in iter_partition_frames(Path(record["path"]), batch_rows=batch_rows):
            target = frame.get_column("success_rate").to_numpy().astype(np.float64)
            weight = frame.get_column("opportunities").to_numpy().astype(np.float64)
            climate = climatology_prediction(frame, climatology)
            persistence = np.where(
                frame.get_column("path_prev1_available").to_numpy() == 1,
                frame.get_column("path_success_prev1").to_numpy(),
                climate,
            )
            predictions = {
                "direct": predict_model(
                    frame, direct_model, direct_record, direct_calibrator
                ),
                "persistence": np.clip(persistence, 0.0, 1.0),
                "climatology": climate,
                "weather_only": predict_model(
                    frame, weather_model, weather_record, weather_calibrator
                ),
            }
            day = str(record["issue_time"][:10])
            text_bands = frame.get_column("band").to_numpy().astype(str)
            for name, prediction in predictions.items():
                accumulators[name].update(target, prediction, weight)
                day_errors[day][name][0] += float(
                    np.dot(weight, (target - prediction) ** 2)
                )
                day_errors[day][name][1] += float(weight.sum())
                for band in np.unique(text_bands):
                    mask = text_bands == band
                    band_accumulators[band][name].update(
                        target[mask], prediction[mask], weight[mask]
                    )
            paired = frame.select(*JOIN_COLUMNS).with_columns(
                pl.Series("direct_probability", predictions["direct"]),
                pl.Series("target", target),
                pl.Series("weight", weight),
            ).join(
                p533_sample,
                on=JOIN_COLUMNS,
                how="inner",
                validate="1:1",
            )
            if paired.height:
                paired_target = paired.get_column("target").to_numpy()
                paired_weight = paired.get_column("weight").to_numpy()
                p533_accumulators["direct"].update(
                    paired_target,
                    paired.get_column("direct_probability").to_numpy(),
                    paired_weight,
                )
                p533_accumulators["p533"].update(
                    paired_target,
                    paired.get_column("probability").to_numpy(),
                    paired_weight,
                )
                p533_rows_scored += paired.height
    if p533_rows_scored != p533_sample.height:
        raise RuntimeError(
            "FutureCast P.533 diagnostic sample does not align to frozen gate examples"
        )
    metrics = {name: accumulator.result() for name, accumulator in accumulators.items()}
    best_baseline = min(
        BASELINES,
        key=lambda name: (
            metrics[name]["weighted_brier"],
            metrics[name]["weighted_log_loss"],
            name,
        ),
    )
    day_error_deltas = [
        day_errors[day]["direct"][0] - day_errors[day][best_baseline][0]
        for day in sorted(day_errors)
    ]
    day_weights = [
        day_errors[day]["direct"][1]
        for day in sorted(day_errors)
    ]
    upper = bootstrap_upper(
        day_error_deltas,
        day_weights,
        replicates=int(config["bootstrap"]["replicates"]),
        confidence=float(config["bootstrap"]["confidence"]),
        seed=int(config["seed"]) + horizon,
    )
    supported_minimum = float(
        config["gates"]["minimum_supported_band_opportunities"]
    )
    band_rows: dict[str, Any] = {}
    supported_regressions: list[float] = []
    supported_regression_valid = True
    for band, candidates in sorted(band_accumulators.items()):
        row = {name: accumulator.result() for name, accumulator in candidates.items()}
        baseline_brier = float(row[best_baseline]["weighted_brier"])
        direct_brier = float(row["direct"]["weighted_brier"])
        supported = float(row["direct"]["weighted_opportunities"]) >= supported_minimum
        regression = (
            direct_brier / baseline_brier - 1
            if baseline_brier > 0
            else 0.0
            if direct_brier == 0
            else None
        )
        if supported:
            if regression is None:
                supported_regression_valid = False
            else:
                supported_regressions.append(regression)
        band_rows[band] = {
            "supported": supported,
            "relative_brier_regression": regression,
            "metrics": row,
        }
    maximum_regression = (
        max(supported_regressions)
        if supported_regressions and supported_regression_valid
        else None
    )
    peak = peak_rss_gib()
    gates = release_gates(
        direct=metrics["direct"],
        baselines={name: metrics[name] for name in BASELINES},
        best_baseline=best_baseline,
        paired_day_upper_95=upper,
        issue_days=len(day_errors),
        maximum_band_regression=maximum_regression,
        config=config,
        p533_equivalent_forecast_inputs=p533_rows_scored == p533_sample.height,
        source_integrity_passed=True,
        production_evidence=training["data_scope"] == "production_issued_history",
        peak_rss=peak,
    )
    p533_metrics = {
        name: accumulator.result() for name, accumulator in p533_accumulators.items()
    }
    return {
        "status": "pass" if all(gates.values()) else "withheld",
        "release_approved": all(gates.values()),
        "horizon_hours": horizon,
        "issue_days": len(day_errors),
        "best_baseline": best_baseline,
        "relative_brier_improvement": relative_brier_improvement(
            float(metrics["direct"]["weighted_brier"]),
            float(metrics[best_baseline]["weighted_brier"]),
        ),
        "paired_issue_day_brier_delta_upper_95": upper,
        "maximum_supported_band_relative_brier_regression": maximum_regression,
        "metrics": metrics,
        "bands": band_rows,
        "p533_paired_diagnostic": {
            "sample_rows": p533_rows_scored,
            "sample_contract": "up to 50 deterministic paths per issue day, horizon, and band",
            "metrics": p533_metrics,
            "direct_minus_p533_weighted_brier": float(
                p533_metrics["direct"]["weighted_brier"]
            )
            - float(p533_metrics["p533"]["weighted_brier"]),
            "release_baseline_selection_eligible": False,
        },
        "gates": gates,
        "peak_rss_gib": peak,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--examples-root", type=Path, required=True)
    parser.add_argument("--training-manifest", type=Path, required=True)
    parser.add_argument("--p533-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--force-development-rerun", action="store_true")
    parser.add_argument("--allow-synthetic-fixture", action="store_true")
    args = parser.parse_args()

    args.config = args.config.expanduser().resolve()
    args.examples_root = args.examples_root.expanduser().resolve()
    args.training_manifest = args.training_manifest.expanduser().resolve()
    args.p533_manifest = args.p533_manifest.expanduser().resolve()
    args.output = args.output.expanduser().resolve()
    validate_m5_runtime(
        json.loads(RUNTIME_CONFIG.read_text(encoding="utf-8")),
        xgboost_module=xgb,
    )
    example_manifest_path = args.examples_root / "EXAMPLE_MANIFEST.json"
    config, examples, training = validate_training_manifest(
        args.training_manifest,
        args.config,
        example_manifest_path,
    )
    if (
        examples["data_scope"] == "synthetic_fixture"
        and not args.allow_synthetic_fixture
    ):
        raise RuntimeError("synthetic FutureCast gate scoring requires explicit acknowledgement")
    if examples["data_scope"] == "production_issued_history" and args.force_development_rerun:
        raise RuntimeError("production FutureCast gate results are immutable")
    if args.output.exists() and (
        examples["data_scope"] == "production_issued_history"
        or not args.force_development_rerun
    ):
        raise RuntimeError("FutureCast gate has already been scored at this output path")
    gate_records = [
        row for row in examples["partitions"] if row["split"] == "gate"
    ]
    for record in gate_records:
        if sha256(Path(record["path"])) != record.get("sha256"):
            raise RuntimeError("FutureCast gate partition checksum changed before scoring")
    p533_records = validate_p533_manifest(
        args.p533_manifest,
        config=config,
        config_path=args.config,
        example_manifest_path=example_manifest_path,
        training_manifest_path=args.training_manifest,
    )
    climatology_path = Path(training["climatology_path"])
    if sha256(climatology_path) != training.get("climatology_sha256"):
        raise RuntimeError("FutureCast climatology checksum changed")
    climatology = json.loads(climatology_path.read_text(encoding="utf-8"))
    horizons = {
        str(horizon): score_horizon(
            horizon=int(horizon),
            records=[
                row
                for row in gate_records
                if int(row["horizon_hours"]) == int(horizon)
            ],
            training=training,
            climatology=climatology[str(horizon)],
            p533_record=p533_records[int(horizon)],
            config=config,
        )
        for horizon in config["horizons_hours"]
    }
    released = [
        int(horizon)
        for horizon, row in horizons.items()
        if row["release_approved"] is True
    ]
    result = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "futurecast_v1_locked_gate",
        "data_scope": examples["data_scope"],
        "decision": (
            "release_candidate"
            if len(released) == len(config["horizons_hours"])
            else "partial_release_candidate"
            if released
            else "withheld"
        ),
        "release_approved": bool(released),
        "released_horizons_hours": released,
        "withheld_horizons_hours": sorted(
            set(int(value) for value in config["horizons_hours"]) - set(released)
        ),
        "config_sha256": sha256(args.config),
        "example_manifest_sha256": sha256(example_manifest_path),
        "training_manifest_sha256": sha256(args.training_manifest),
        "p533_manifest_sha256": sha256(args.p533_manifest),
        "gate_scored_once": True,
        "post_gate_tuning_permitted": False,
        "observed_weather_substituted": False,
        "locked_core_policy_changed": False,
        "horizons": horizons,
    }
    atomic_json(args.output, result)
    print(args.output)


if __name__ == "__main__":
    main()
