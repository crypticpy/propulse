#!/usr/bin/env python3
"""Run frozen 5M rolling-origin M2 development checks over 2020-2023."""

from __future__ import annotations

import argparse
import gc
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pyarrow as pa
import pyarrow.dataset as ds
import xgboost as xgb


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
sys.path.insert(0, str(V3))
from common import PROCESSED, RESULTS, load_config, utc_now, write_json  # noqa: E402

from external_memory import combine_filters, month_filter, score_stream  # noqa: E402
from train_validation import (  # noqa: E402
    CALIBRATION_SELECTION_PROTOCOL,
    available_features,
    in_memory_quantile_matrix,
    load_predictions,
    peak_rss_gb,
    sample_metrics,
    score_climatology,
    select_calibrator,
)


FOLD_YEARS = (2020, 2021, 2022, 2023)
CAP = 5_000_000


def fold_months(year: int) -> dict[str, list[str]]:
    return {
        "early_stopping_months": [f"{year}-01", f"{year}-07"],
        "calibration_months": [f"{year}-04"],
        "gate_months": [f"{year}-10"],
    }


def run_fold(
    config: dict[str, Any],
    year: int,
    train_paths: list[Path],
    features: list[str],
) -> dict[str, Any]:
    protocol = fold_months(year)
    cutoff = datetime(year, 1, 1, tzinfo=timezone.utc)
    sample_filter = ds.field(f"in_sample_{CAP}") == True  # noqa: E712
    train_filter = combine_filters(
        sample_filter,
        ds.field("target_hour") < pa.scalar(cutoff),
    )
    started = time.time()
    train_matrix = in_memory_quantile_matrix(
        train_paths,
        features,
        weight_column="training_weight",
        filter_expression=train_filter,
    )
    tuning_matrix = in_memory_quantile_matrix(
        train_paths,
        features,
        weight_column="training_weight",
        filter_expression=combine_filters(
            sample_filter, month_filter(protocol["early_stopping_months"])
        ),
        ref=train_matrix,
    )
    model = xgb.train(
        {
            "objective": "binary:logistic",
            "eval_metric": "logloss",
            "tree_method": "hist",
            "max_depth": 9,
            "min_child_weight": 200,
            "eta": 0.04,
            "subsample": 0.85,
            "colsample_bytree": 0.9,
            "lambda": 8.0,
            "alpha": 0.25,
            "max_bin": 255,
            "seed": int(config["seed"]),
            "nthread": int(os.environ.get("PROPULSE_DUCKDB_THREADS", "10")),
        },
        train_matrix,
        num_boost_round=int(config["xgboost_rounds"]),
        evals=[(tuning_matrix, "early_stopping")],
        early_stopping_rounds=int(config["early_stopping_rounds"]),
        verbose_eval=100,
    )
    best = int(model.best_iteration)
    calibration = load_predictions(
        model,
        best,
        train_paths,
        features,
        protocol["calibration_months"],
        weight_column="training_weight",
    )
    calibrator, calibration_comparison = select_calibrator(calibration)
    gate_sample = load_predictions(
        model,
        best,
        train_paths,
        features,
        protocol["gate_months"],
        weight_column="training_weight",
    )
    sample_result = sample_metrics(
        gate_sample[1],
        calibrator.predict(gate_sample[0], gate_sample[3], gate_sample[5]),
        gate_sample[2],
        gate_sample[4],
    )
    full_result = score_stream(
        model,
        best,
        PROCESSED / f"dataset_{config['run_id']}_hf.parquet",
        features,
        weight_column="opportunities",
        calibrate=calibrator.predict,
        filter_expression=month_filter(protocol["gate_months"]),
    )
    baseline = score_climatology(
        config,
        train_before=cutoff.isoformat(),
        gate_months=protocol["gate_months"],
    )
    output = {
        "name": f"train_before_{year}_gate_{year}_10",
        "train_before": cutoff.isoformat(),
        "protocol": protocol,
        "train_rows": train_matrix.num_row(),
        "early_stopping_rows": tuning_matrix.num_row(),
        "best_iteration": best,
        "calibration_method": calibrator.method,
        "calibration_selection_protocol": CALIBRATION_SELECTION_PROTOCOL,
        "calibrator_comparison_on_april_holdout": calibration_comparison,
        "gate_sample": sample_result,
        "gate_full": full_result,
        "climatology": baseline,
        "brier_skill_vs_climatology": (
            1 - full_result["weighted_brier"] / baseline["weighted_brier"]
        ),
        "runtime_seconds": time.time() - started,
        "peak_rss_gb": peak_rss_gb(),
    }
    del train_matrix, tuning_matrix, model
    gc.collect()
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    if config.get("execution_scope") != "development":
        raise RuntimeError("rolling validation requires development scope")
    sample_dir = PROCESSED / f"samples/{config['run_id']}/hf/train"
    train_paths = sorted(sample_dir.rglob("*.parquet"))
    if not train_paths:
        raise FileNotFoundError(sample_dir)
    features = available_features(train_paths, "M2_nowcast")
    result_dir = RESULTS / config["run_id"]
    result_dir.mkdir(parents=True, exist_ok=True)
    result_path = result_dir / "rolling_validation_results.json"
    output: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "development_only",
        "locked_archive_test_read": False,
        "cap": CAP,
        "features": features,
        "folds": [],
    }
    for year in FOLD_YEARS:
        print(f"rolling fold {year}", flush=True)
        fold = run_fold(config, year, train_paths, features)
        output["folds"].append(fold)
        output["all_folds_positive_brier_skill"] = all(
            row["brier_skill_vs_climatology"] > 0 for row in output["folds"]
        )
        output["generated_at"] = utc_now()
        write_json(result_path, output)
    print(result_path)


if __name__ == "__main__":
    main()
