"""Run bounded rolling-origin V3 evaluations before opening the locked test month."""

from __future__ import annotations

import argparse
import gc
import time
from typing import Any

import numpy as np
import polars as pl

from common import PROCESSED, RESULTS, load_config, utc_now, write_json
from train_experiment import (
    SEED,
    apply_band_calibrators,
    climatology,
    day_block_delta,
    features_for,
    fit_band_calibrators,
    fit_isotonic,
    predict_engine,
    train_engine,
    weighted_brier,
    weighted_metrics,
)


FOLDS = [
    {
        "name": "2019_seasonal",
        "train": ["2019-01", "2019-04"],
        "validation": ["2019-07"],
        "test": ["2019-10"],
    },
    {
        "name": "solar_regime_transfer",
        "train": ["2019-01", "2019-04", "2019-07", "2019-10"],
        "validation": ["2024-01"],
        "test": ["2024-04"],
    },
]


def load_months(
    path,
    months: list[str],
    features: list[str],
    limit: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, pl.DataFrame]:
    metadata_columns = [
        "target_hour",
        "band",
        "tx_grid4",
        "rx_grid4",
        "dark_frac",
        "kp",
        "dist_km",
    ]
    selected = list(
        dict.fromkeys(
            [*features, "success_rate", "opportunities", "any_success", *metadata_columns]
        )
    )
    lazy = pl.scan_parquet(path).filter(
        pl.col("target_hour").dt.strftime("%Y-%m").is_in(months)
    )
    total = lazy.select(pl.len()).collect(engine="streaming").item()
    if total > limit:
        key = pl.struct(
            "target_hour", "band", "tx_grid4", "rx_grid4", "power_bin_dbm"
        ).hash(SEED)
        lazy = lazy.filter((key % total) < limit).head(limit)
    frame = lazy.select(selected).collect(engine="streaming")
    return (
        frame.select(features).fill_null(0).cast(pl.Float32).to_numpy(),
        frame["success_rate"].to_numpy().astype(np.float32),
        frame["opportunities"].to_numpy().astype(np.float32),
        frame["any_success"].to_numpy().astype(np.uint8),
        frame.select(metadata_columns),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--task", choices=("hf", "6m"), default="hf")
    args = parser.parse_args()
    config = load_config(args.config)
    path = PROCESSED / f"dataset_{config['run_id']}_{args.task}.parquet"
    output: dict[str, Any] = {
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "task": args.task,
        "engine": "xgboost",
        "sample_limits": {"train": 5_000_000, "validation": 2_000_000, "test": 5_000_000},
        "folds": [],
    }
    for fold in FOLDS:
        fold_result: dict[str, Any] = {"name": fold["name"], "months": fold, "profiles": {}}
        for profile in ("physics", "nowcast"):
            print(f"{fold['name']} {profile}", flush=True)
            features = features_for(path, args.task, profile)
            train = load_months(path, fold["train"], features, 5_000_000)
            validation = load_months(path, fold["validation"], features, 2_000_000)
            test = load_months(path, fold["test"], features, 5_000_000)
            x_train, y_train, w_train, _, train_meta = train
            x_val, y_val, w_val, _, val_meta = validation
            x_test, y_test, w_test, any_test, test_meta = test
            started = time.time()
            model, best, val_raw = train_engine(
                "xgboost",
                x_train,
                y_train,
                w_train,
                x_val,
                y_val,
                w_val,
                600,
                60,
            )
            test_raw = predict_engine("xgboost", model, best, x_test)
            global_cal = fit_isotonic(y_val, val_raw, w_val)
            global_val = global_cal.predict(val_raw)
            band_cals = fit_band_calibrators(
                y_val, val_raw, w_val, val_meta["band"].to_numpy(), global_cal
            )
            band_val = apply_band_calibrators(
                band_cals, val_raw, val_meta["band"].to_numpy()
            )
            if weighted_brier(y_val, band_val, w_val) < weighted_brier(
                y_val, global_val, w_val
            ):
                prediction = apply_band_calibrators(
                    band_cals, test_raw, test_meta["band"].to_numpy()
                )
                calibration = "per_band_isotonic"
            else:
                prediction = global_cal.predict(test_raw)
                calibration = "global_isotonic"
            baseline = climatology(train_meta, y_train, w_train, test_meta)
            model_metrics = weighted_metrics(
                y_test, prediction, w_test, any_test
            )
            baseline_metrics = weighted_metrics(
                y_test, baseline, w_test, any_test
            )
            fold_result["profiles"][profile] = {
                "features": len(features),
                "train_rows": len(y_train),
                "validation_rows": len(y_val),
                "test_rows": len(y_test),
                "best_iteration": best,
                "calibration_method": calibration,
                "seconds": time.time() - started,
                "test": model_metrics,
                "climatology": baseline_metrics,
                "brier_skill": 1
                - model_metrics["weighted_brier"] / baseline_metrics["weighted_brier"],
                "day_block": day_block_delta(
                    test_meta, y_test, w_test, prediction, baseline
                ),
            }
            del train, validation, test, model, global_cal, band_cals
            del x_train, y_train, w_train, x_val, y_val, w_val
            del x_test, y_test, w_test, any_test, prediction, baseline
            gc.collect()
        output["folds"].append(fold_result)
    result_dir = RESULTS / config["run_id"]
    result_dir.mkdir(parents=True, exist_ok=True)
    write_json(result_dir / f"{args.task}_rolling_results.json", output)
    print(result_dir / f"{args.task}_rolling_results.json")


if __name__ == "__main__":
    main()
