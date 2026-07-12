#!/usr/bin/env python3
"""Run the preregistered bounded 5M LightGBM implementation comparison."""

from __future__ import annotations

import argparse
import gc
import json
import sys
import time
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
import pyarrow.dataset as ds
import xgboost as xgb


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(V3))
from common import MODELS, PROCESSED, RESULTS, load_config, utc_now, write_json  # noqa: E402

from external_memory import combine_filters, iter_numpy_batches, month_filter  # noqa: E402
from train_validation import (  # noqa: E402
    CALIBRATION_SELECTION_PROTOCOL,
    available_features,
    peak_rss_gb,
    sample_metrics,
    select_calibrator,
)


CAP = 5_000_000


def load_arrays(
    paths: Path | list[Path],
    features: list[str],
    weight_column: str,
    filter_expression: ds.Expression,
    *,
    metadata: list[str] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[str, np.ndarray]]:
    matrices: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    weights: list[np.ndarray] = []
    metadata_values: dict[str, list[np.ndarray]] = {
        name: [] for name in (metadata or [])
    }
    for matrix, target, weight, batch_metadata in iter_numpy_batches(
        paths,
        features,
        weight_column=weight_column,
        filter_expression=filter_expression,
        metadata=metadata,
    ):
        matrices.append(matrix)
        targets.append(target)
        weights.append(weight)
        for name, values in batch_metadata.items():
            metadata_values[name].append(values)
    if not matrices:
        raise RuntimeError("LightGBM comparison selection is empty")
    return (
        np.concatenate(matrices),
        np.concatenate(targets),
        np.concatenate(weights),
        {name: np.concatenate(values) for name, values in metadata_values.items()},
    )


def calibration_tuple(
    raw: np.ndarray,
    target: np.ndarray,
    weight: np.ndarray,
    metadata: dict[str, np.ndarray],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    return (
        raw,
        target,
        weight,
        metadata["band"].astype(str),
        metadata["any_success"].astype(np.uint8),
        metadata["dist_km"].astype(np.float64),
        metadata["target_hour"],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    if config.get("execution_scope") != "development":
        raise RuntimeError("LightGBM comparison requires development scope")
    started = time.time()
    run_id = config["run_id"]
    train_paths = sorted(
        (PROCESSED / f"samples/{run_id}/hf/train").rglob("*.parquet")
    )
    validation_path = PROCESSED / f"samples/{run_id}/hf/validation.parquet"
    features = available_features(train_paths, "M2_nowcast")
    sample_filter = ds.field(f"in_sample_{CAP}") == True  # noqa: E712
    validation = config["validation_protocol"]
    train_x, train_y, train_w, _ = load_arrays(
        train_paths,
        features,
        "training_weight",
        sample_filter,
    )
    tuning_x, tuning_y, tuning_w, _ = load_arrays(
        validation_path,
        features,
        "opportunities",
        month_filter(validation["early_stopping_months"]),
    )
    training = lgb.Dataset(
        train_x,
        label=train_y,
        weight=train_w,
        feature_name=features,
        free_raw_data=True,
    )
    tuning = lgb.Dataset(
        tuning_x,
        label=tuning_y,
        weight=tuning_w,
        feature_name=features,
        reference=training,
        free_raw_data=True,
    )
    model = lgb.train(
        {
            "objective": "cross_entropy",
            "metric": "cross_entropy",
            "learning_rate": 0.04,
            "num_leaves": 255,
            "max_depth": 9,
            "min_data_in_leaf": 200,
            "feature_fraction": 0.9,
            "bagging_fraction": 0.85,
            "bagging_freq": 1,
            "lambda_l1": 0.25,
            "lambda_l2": 8.0,
            "max_bin": 255,
            "seed": int(config["seed"]),
            "num_threads": 10,
            "verbosity": -1,
        },
        training,
        num_boost_round=int(config["xgboost_rounds"]),
        valid_sets=[tuning],
        valid_names=["early_stopping"],
        callbacks=[
            lgb.early_stopping(
                int(config["early_stopping_rounds"]),
                first_metric_only=True,
                verbose=True,
            ),
            lgb.log_evaluation(100),
        ],
    )
    del train_x, train_y, train_w, tuning_x, tuning_y, tuning_w, training, tuning
    gc.collect()

    metadata = ["band", "any_success", "dist_km", "target_hour"]
    cal_x, cal_y, cal_w, cal_meta = load_arrays(
        validation_path,
        features,
        "opportunities",
        month_filter(validation["calibration_months"]),
        metadata=metadata,
    )
    cal_raw = model.predict(cal_x, num_iteration=model.best_iteration)
    calibrator, calibrator_comparison = select_calibrator(
        calibration_tuple(cal_raw, cal_y, cal_w, cal_meta)
    )
    del cal_x, cal_y, cal_w, cal_raw, cal_meta
    gc.collect()

    gate_x, gate_y, gate_w, gate_meta = load_arrays(
        validation_path,
        features,
        "opportunities",
        month_filter(validation["gate_months"]),
        metadata=metadata,
    )
    light_raw = model.predict(gate_x, num_iteration=model.best_iteration)
    bands = gate_meta["band"].astype(str)
    distances = gate_meta["dist_km"].astype(np.float64)
    light_prediction = calibrator.predict(light_raw, bands, distances)
    light_metrics = sample_metrics(
        gate_y,
        light_prediction,
        gate_w,
        gate_meta["any_success"],
    )

    xgb_path = MODELS / run_id / f"M2_nowcast_{CAP}.json"
    xgb_calibrator_path = MODELS / run_id / f"M2_nowcast_{CAP}.isotonic.joblib"
    xgb_model = xgb.Booster()
    xgb_model.load_model(xgb_path)
    best_iteration = int(xgb_model.attr("best_iteration") or 0)
    xgb_raw = xgb_model.inplace_predict(
        gate_x,
        iteration_range=(0, best_iteration + 1),
    )
    xgb_calibrator = joblib.load(xgb_calibrator_path)
    xgb_prediction = xgb_calibrator.predict(xgb_raw, bands, distances)
    xgb_metrics = sample_metrics(
        gate_y,
        xgb_prediction,
        gate_w,
        gate_meta["any_success"],
    )
    brier_delta = light_metrics["weighted_brier"] - xgb_metrics["weighted_brier"]
    tolerance = 0.01 * xgb_metrics["weighted_brier"]
    output: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": run_id,
        "scope": "development_only",
        "locked_archive_test_read": False,
        "purpose": "bounded implementation-regression check, not framework tuning",
        "train_cap": CAP,
        "features": features,
        "calibration_selection_protocol": CALIBRATION_SELECTION_PROTOCOL,
        "lightgbm": {
            "best_iteration": int(model.best_iteration),
            "calibration_method": calibrator.method,
            "calibrator_comparison_on_april_holdout": calibrator_comparison,
            "gate_sample": light_metrics,
        },
        "xgboost": {
            "best_iteration": best_iteration,
            "gate_sample": xgb_metrics,
        },
        "lightgbm_minus_xgboost_brier": brier_delta,
        "regression_tolerance": tolerance,
        "implementation_regression": brier_delta > tolerance,
        "selected_engine": "lightgbm" if brier_delta < -tolerance else "xgboost",
        "runtime_seconds": time.time() - started,
        "peak_rss_gb": peak_rss_gb(),
    }
    result_path = RESULTS / run_id / "lightgbm_comparison_results.json"
    write_json(result_path, output)
    print(result_path)


if __name__ == "__main__":
    main()
