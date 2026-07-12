#!/usr/bin/env python3
"""Train the independent, mechanism-labeled experimental 6m V4 program."""

from __future__ import annotations

import argparse
import gc
import sys
import time
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import polars as pl
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
sys.path.insert(0, str(V3))
from common import MODELS, PROCESSED, RESULTS, ensure_directories, load_config, relative, sha256, utc_now, write_json  # noqa: E402
from train_experiment import BASE_FEATURES, NOWCAST_FEATURES  # noqa: E402

from external_memory import MetricAccumulator  # noqa: E402


MECHANISMS = ("auroral", "sporadic_e", "tropospheric", "f2_tep", "meteor_scatter", "unknown")


def add_mechanism(frame: pl.DataFrame) -> pl.DataFrame:
    month = pl.col("target_hour").dt.month()
    return frame.with_columns(
        pl.when((pl.col("kp") >= 4) | (pl.col("mid_lat").abs() >= 60))
        .then(pl.lit("auroral"))
        .when(month.is_in([4, 7]) & pl.col("dist_km").is_between(600, 2500))
        .then(pl.lit("sporadic_e"))
        .when(pl.col("dist_km") < 1200)
        .then(pl.lit("tropospheric"))
        .when(
            (pl.col("dist_km") >= 2500)
            & ((pl.col("f107") >= 150) | (pl.col("mid_lat").abs() < 20))
        )
        .then(pl.lit("f2_tep"))
        .when(pl.col("dist_km").is_between(800, 2200))
        .then(pl.lit("meteor_scatter"))
        .otherwise(pl.lit("unknown"))
        .alias("mechanism")
    )


def metrics(target: np.ndarray, prediction: np.ndarray, weight: np.ndarray) -> dict[str, Any]:
    accumulator = MetricAccumulator()
    accumulator.update(target, prediction, weight)
    return accumulator.result()


def fit_model(
    train: pl.DataFrame,
    tuning: pl.DataFrame,
    calibration: pl.DataFrame,
    features: list[str],
    seed: int,
) -> tuple[xgb.Booster, int, IsotonicRegression]:
    def matrix(frame: pl.DataFrame) -> np.ndarray:
        return frame.select(features).fill_null(0).cast(pl.Float32).to_numpy()

    train_matrix = xgb.QuantileDMatrix(
        matrix(train),
        train["success_rate"].to_numpy(),
        weight=train["opportunities"].to_numpy(),
        max_bin=255,
    )
    tuning_matrix = xgb.QuantileDMatrix(
        matrix(tuning),
        tuning["success_rate"].to_numpy(),
        weight=tuning["opportunities"].to_numpy(),
        max_bin=255,
        ref=train_matrix,
    )
    model = xgb.train(
        {
            "objective": "binary:logistic",
            "eval_metric": "logloss",
            "tree_method": "hist",
            "max_depth": 7,
            "min_child_weight": 50,
            "eta": 0.05,
            "subsample": 0.85,
            "colsample_bytree": 0.9,
            "lambda": 8,
            "max_bin": 255,
            "seed": seed,
            "nthread": 10,
        },
        train_matrix,
        num_boost_round=700,
        evals=[(tuning_matrix, "early_stopping")],
        early_stopping_rounds=60,
        verbose_eval=False,
    )
    best = int(model.best_iteration)
    calibration_raw = model.inplace_predict(
        matrix(calibration), iteration_range=(0, best + 1)
    )
    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
    calibrator.fit(
        calibration_raw,
        calibration["success_rate"].to_numpy(),
        sample_weight=calibration["opportunities"].to_numpy(),
    )
    return model, best, calibrator


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    if config.get("execution_scope") != "development":
        raise RuntimeError("6m training requires development scope")
    ensure_directories()
    dataset = PROCESSED / f"dataset_{config['run_id']}_6m.parquet"
    if not dataset.exists():
        raise FileNotFoundError(dataset)
    source = dataset / "*.parquet" if dataset.is_dir() else dataset
    frame = add_mechanism(pl.read_parquet(source))
    schema = set(frame.columns)
    features = [name for name in BASE_FEATURES if name in schema]
    features.extend(name for name in NOWCAST_FEATURES if name in schema)
    features.extend(sorted(name for name in schema if name.endswith("_missing")))
    features = list(dict.fromkeys(features))
    protocol = config["validation_protocol"]
    months = frame["target_hour"].dt.strftime("%Y-%m")
    train = frame.filter(pl.col("split") == "train")
    tuning = frame.filter(months.is_in(protocol["early_stopping_months"]))
    calibration = frame.filter(months.is_in(protocol["calibration_months"]))
    gate = frame.filter(months.is_in(protocol["gate_months"]))
    model_dir = MODELS / config["run_id"] / "6m"
    model_dir.mkdir(parents=True, exist_ok=True)
    models: dict[str, tuple[xgb.Booster, int, IsotonicRegression]] = {}
    results: dict[str, Any] = {}
    started = time.time()
    for mechanism in MECHANISMS:
        mechanism_train = train.filter(pl.col("mechanism") == mechanism)
        mechanism_tuning = tuning.filter(pl.col("mechanism") == mechanism)
        mechanism_calibration = calibration.filter(pl.col("mechanism") == mechanism)
        mechanism_gate = gate.filter(pl.col("mechanism") == mechanism)
        if min(mechanism_train.height, mechanism_tuning.height, mechanism_calibration.height, mechanism_gate.height) < 500:
            results[mechanism] = {"status": "insufficient_support", "train_rows": mechanism_train.height}
            continue
        model, best, calibrator = fit_model(
            mechanism_train,
            mechanism_tuning,
            mechanism_calibration,
            features,
            int(config["seed"]),
        )
        gate_matrix = mechanism_gate.select(features).fill_null(0).cast(pl.Float32).to_numpy()
        raw = model.inplace_predict(gate_matrix, iteration_range=(0, best + 1))
        prediction = calibrator.predict(raw)
        target = mechanism_gate["success_rate"].to_numpy()
        weight = mechanism_gate["opportunities"].to_numpy()
        train_rate = float(np.average(
            mechanism_train["success_rate"].to_numpy(),
            weights=mechanism_train["opportunities"].to_numpy(),
        ))
        baseline = np.full(len(target), train_rate)
        model_metrics = metrics(target, prediction, weight)
        baseline_metrics = metrics(target, baseline, weight)
        model_path = model_dir / f"{mechanism}.json"
        calibrator_path = model_dir / f"{mechanism}.isotonic.joblib"
        model.save_model(model_path)
        joblib.dump(calibrator, calibrator_path)
        results[mechanism] = {
            "status": "trained_experimental",
            "train_rows": mechanism_train.height,
            "gate_rows": mechanism_gate.height,
            "best_iteration": best,
            "train_prevalence": train_rate,
            "gate": model_metrics,
            "climatology": baseline_metrics,
            "brier_skill": 1 - model_metrics["weighted_brier"] / baseline_metrics["weighted_brier"],
            "model_path": relative(model_path),
            "model_sha256": sha256(model_path),
            "calibrator_path": relative(calibrator_path),
            "calibrator_sha256": sha256(calibrator_path),
        }
        models[mechanism] = (model, best, calibrator)
        gc.collect()
    gate_predictions = np.zeros(gate.height, dtype=np.float64)
    gate_baseline = np.zeros(gate.height, dtype=np.float64)
    covered = np.zeros(gate.height, dtype=bool)
    gate_mechanisms = gate["mechanism"].to_numpy().astype(str)
    for mechanism, (model, best, calibrator) in models.items():
        mask = gate_mechanisms == mechanism
        matrix = gate.filter(pl.Series(mask)).select(features).fill_null(0).cast(pl.Float32).to_numpy()
        gate_predictions[mask] = calibrator.predict(
            model.inplace_predict(matrix, iteration_range=(0, best + 1))
        )
        gate_baseline[mask] = results[mechanism]["train_prevalence"]
        covered[mask] = True
    target = gate["success_rate"].to_numpy()
    weight = gate["opportunities"].to_numpy()
    overall = metrics(target[covered], gate_predictions[covered], weight[covered])
    overall_baseline = metrics(target[covered], gate_baseline[covered], weight[covered])
    event = covered & np.isin(gate_mechanisms, ["auroral", "sporadic_e", "f2_tep"])
    quiet = covered & (gate["kp"].fill_null(0).to_numpy() < 2)

    def slice_metrics(mask: np.ndarray) -> dict[str, Any] | None:
        if not mask.any():
            return None
        model_result = metrics(target[mask], gate_predictions[mask], weight[mask])
        baseline_result = metrics(target[mask], gate_baseline[mask], weight[mask])
        return {
            "model": model_result,
            "mechanism_climatology": baseline_result,
            "brier_skill": 1 - model_result["weighted_brier"] / baseline_result["weighted_brier"],
        }
    output = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "development_only",
        "locked_archive_test_read": False,
        "program": "6m_mechanism_mixture_experimental",
        "features": features,
        "mechanism_definition": (
            "Frozen geometry/season/geomagnetic heuristic routes rows to small trees; "
            "mechanism labels are hypotheses, not observed ground truth."
        ),
        "mechanisms": results,
        "overall_gate": overall,
        "overall_mechanism_climatology": overall_baseline,
        "overall_brier_skill": 1 - overall["weighted_brier"] / overall_baseline["weighted_brier"],
        "gate_row_coverage": float(covered.mean()),
        "event_gate": slice_metrics(event),
        "quiet_gate": slice_metrics(quiet),
        "release_approved": False,
        "release_blockers": [
            "No GIRO foEs/foF2 validation arm is available.",
            "No historical/operational NWP parity arm is available.",
            "Mechanism assignments are heuristic and require event catalog validation.",
            "Locked 2025 and prospective event/quiet tests have not been opened."
        ],
        "runtime_seconds": time.time() - started,
    }
    result_dir = RESULTS / config["run_id"]
    result_dir.mkdir(parents=True, exist_ok=True)
    write_json(result_dir / "6m_development_results.json", output)
    print(result_dir / "6m_development_results.json")


if __name__ == "__main__":
    main()
