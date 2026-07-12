"""Train weighted exposure-aware Archive V3 baselines and tree models."""

from __future__ import annotations

import argparse
import gc
import importlib.metadata
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
import polars as pl
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, roc_auc_score

from common import (
    MODELS,
    PROCESSED,
    RESULTS,
    ensure_directories,
    load_config,
    relative,
    write_json,
)


SEED = 20260711

BASE_FEATURES = [
    "band_mhz",
    "power_bin_dbm",
    "hod_sin",
    "hod_cos",
    "doy_sin",
    "doy_cos",
    "is_weekend",
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
    "sun_elev_tx",
    "sun_elev_rx",
    "sun_elev_mid",
    "dark_frac",
    "min_abs_elev_ends",
    "bt",
    "bx_gsm",
    "by_gsm",
    "bz_gsm",
    "temperature_k",
    "density_cm3",
    "wind_speed",
    "flow_pressure",
    "electric_field",
    "plasma_beta",
    "alfven_mach",
    "kp",
    "sunspot_number",
    "dst",
    "ae",
    "proton_flux_10mev",
    "ap",
    "f107",
    "pcn",
    "al",
    "au",
    "magnetosonic_mach",
    "hp60",
    "kp_delta_3h",
    "kp_max_24h",
    "bz_min_3h",
    "dst_min_6h",
]

NOWCAST_FEATURES = [
    "path_success_prev1",
    "path_success_prev2",
    "path_success_prev3",
    "path_success_prev24",
]


def json_value(value: Any) -> Any:
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    raise TypeError(type(value).__name__)


def features_for(path: Path, task: str, profile: str) -> list[str]:
    names = set(pl.scan_parquet(path).collect_schema().names())
    features = [name for name in BASE_FEATURES if name in names]
    if task == "hf":
        features.extend(sorted(name for name in names if name.startswith("band_")))
    if profile == "nowcast":
        features.extend(NOWCAST_FEATURES)
    return list(dict.fromkeys(features))


def load_split(
    path: Path, split: str, features: list[str], limit: int | None = None
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
    lazy = pl.scan_parquet(path).filter(pl.col("split") == split)
    total = lazy.select(pl.len()).collect(engine="streaming").item()
    if limit is not None and total > limit:
        sample_key = pl.struct(
            "target_hour", "band", "tx_grid4", "rx_grid4", "power_bin_dbm"
        ).hash(SEED)
        lazy = lazy.filter((sample_key % total) < limit).head(limit)
    frame = lazy.select(selected).collect(engine="streaming")
    x = frame.select(features).fill_null(0).cast(pl.Float32).to_numpy()
    y = frame.get_column("success_rate").to_numpy().astype(np.float32)
    weight = frame.get_column("opportunities").to_numpy().astype(np.float32)
    any_success = frame.get_column("any_success").to_numpy().astype(np.uint8)
    metadata = frame.select(metadata_columns)
    return x, y, weight, any_success, metadata


def weighted_metrics(
    y: np.ndarray,
    prediction: np.ndarray,
    weight: np.ndarray,
    any_success: np.ndarray,
) -> dict[str, Any]:
    p = np.clip(prediction.astype(np.float64), 1e-7, 1 - 1e-7)
    y64 = y.astype(np.float64)
    w = weight.astype(np.float64)
    brier = float(np.average((y64 - p) ** 2, weights=w))
    log_loss = float(np.average(-(y64 * np.log(p) + (1 - y64) * np.log(1 - p)), weights=w))
    row_brier = float(np.mean((y64 - p) ** 2))
    output: dict[str, Any] = {
        "rows": len(y),
        "weighted_opportunities": float(w.sum()),
        "weighted_prevalence": float(np.average(y64, weights=w)),
        "mean_prediction": float(np.average(p, weights=w)),
        "weighted_brier": brier,
        "weighted_log_loss": log_loss,
        "row_brier": row_brier,
        "mae": float(np.average(np.abs(y64 - p), weights=w)),
    }
    if np.unique(any_success).size == 2:
        output["open_roc_auc"] = float(roc_auc_score(any_success, p))
        output["open_pr_auc"] = float(average_precision_score(any_success, p))
    else:
        output["open_roc_auc"] = None
        output["open_pr_auc"] = None
    return output


def calibration_bins(
    y: np.ndarray, prediction: np.ndarray, weight: np.ndarray, bins: int = 10
) -> list[dict[str, Any]]:
    edges = np.linspace(0, 1, bins + 1)
    index = np.clip(np.digitize(prediction, edges, right=True), 1, bins)
    rows = []
    for number in range(1, bins + 1):
        mask = index == number
        if not mask.any():
            continue
        rows.append(
            {
                "bin": number,
                "lower": float(edges[number - 1]),
                "upper": float(edges[number]),
                "rows": int(mask.sum()),
                "weight": float(weight[mask].sum()),
                "mean_prediction": float(np.average(prediction[mask], weights=weight[mask])),
                "observed_rate": float(np.average(y[mask], weights=weight[mask])),
            }
        )
    return rows


def fit_isotonic(y: np.ndarray, prediction: np.ndarray, weight: np.ndarray) -> IsotonicRegression:
    model = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
    model.fit(prediction, y, sample_weight=weight)
    return model


def weighted_brier(
    y: np.ndarray, prediction: np.ndarray, weight: np.ndarray
) -> float:
    return float(np.average((y - prediction) ** 2, weights=weight))


def fit_band_calibrators(
    y: np.ndarray,
    prediction: np.ndarray,
    weight: np.ndarray,
    bands: np.ndarray,
    fallback: IsotonicRegression,
) -> dict[str, IsotonicRegression]:
    calibrators: dict[str, IsotonicRegression] = {"__global__": fallback}
    for band in np.unique(bands):
        mask = bands == band
        if mask.sum() >= 1000 and np.unique(prediction[mask]).size >= 20:
            calibrators[str(band)] = fit_isotonic(
                y[mask], prediction[mask], weight[mask]
            )
    return calibrators


def apply_band_calibrators(
    calibrators: dict[str, IsotonicRegression],
    prediction: np.ndarray,
    bands: np.ndarray,
) -> np.ndarray:
    output = np.empty_like(prediction, dtype=np.float64)
    fallback = calibrators["__global__"]
    for band in np.unique(bands):
        mask = bands == band
        output[mask] = calibrators.get(str(band), fallback).predict(prediction[mask])
    return output


def train_xgboost(
    x_train: np.ndarray,
    y_train: np.ndarray,
    w_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    w_val: np.ndarray,
    rounds: int,
    early_stopping: int,
) -> tuple[xgb.Booster, int, np.ndarray]:
    train = xgb.QuantileDMatrix(x_train, y_train, weight=w_train, max_bin=255)
    validation = xgb.QuantileDMatrix(
        x_val, y_val, weight=w_val, ref=train, max_bin=255
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
            "seed": SEED,
            "nthread": 14,
        },
        train,
        num_boost_round=rounds,
        evals=[(validation, "validation")],
        early_stopping_rounds=early_stopping,
        verbose_eval=100,
    )
    best = int(model.best_iteration)
    prediction = model.predict(validation, iteration_range=(0, best + 1))
    return model, best, prediction


def train_lightgbm(
    x_train: np.ndarray,
    y_train: np.ndarray,
    w_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    w_val: np.ndarray,
    rounds: int,
    early_stopping: int,
) -> tuple[lgb.Booster, int, np.ndarray]:
    train = lgb.Dataset(x_train, y_train, weight=w_train, free_raw_data=True)
    validation = lgb.Dataset(
        x_val, y_val, weight=w_val, reference=train, free_raw_data=True
    )
    model = lgb.train(
        {
            "objective": "binary",
            "metric": "binary_logloss",
            "learning_rate": 0.04,
            "num_leaves": 127,
            "max_depth": 9,
            "min_data_in_leaf": 300,
            "feature_fraction": 0.9,
            "bagging_fraction": 0.85,
            "bagging_freq": 1,
            "lambda_l1": 0.25,
            "lambda_l2": 8.0,
            "max_bin": 255,
            "num_threads": 14,
            "seed": SEED,
            "verbosity": -1,
        },
        train,
        num_boost_round=rounds,
        valid_sets=[validation],
        callbacks=[lgb.early_stopping(early_stopping, verbose=False), lgb.log_evaluation(100)],
    )
    best = int(model.best_iteration)
    return model, best, model.predict(x_val, num_iteration=best)


def predict_xgboost(model: xgb.Booster, best: int, matrix: np.ndarray) -> np.ndarray:
    return model.predict(
        xgb.QuantileDMatrix(matrix, max_bin=255), iteration_range=(0, best + 1)
    )


def train_engine(
    engine: str,
    x_train: np.ndarray,
    y_train: np.ndarray,
    w_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    w_val: np.ndarray,
    rounds: int,
    early_stopping: int,
) -> tuple[Any, int, np.ndarray]:
    if engine == "lightgbm":
        return train_lightgbm(
            x_train, y_train, w_train, x_val, y_val, w_val, rounds, early_stopping
        )
    return train_xgboost(
        x_train, y_train, w_train, x_val, y_val, w_val, rounds, early_stopping
    )


def predict_engine(engine: str, model: Any, best: int, matrix: np.ndarray) -> np.ndarray:
    if engine == "lightgbm":
        return model.predict(matrix, num_iteration=best)
    return predict_xgboost(model, best, matrix)


def engine_bakeoff(
    x: np.ndarray,
    y: np.ndarray,
    weight: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    w_val: np.ndarray,
    any_val: np.ndarray,
) -> dict[str, Any]:
    limit = min(len(y), 1_000_000)
    rng = np.random.default_rng(SEED)
    index = np.sort(rng.choice(len(y), limit, replace=False)) if len(y) > limit else np.arange(len(y))
    output = {}
    started = time.time()
    xgb_model, best, prediction = train_xgboost(
        x[index], y[index], weight[index], x_val, y_val, w_val, 500, 40
    )
    output["xgboost"] = {
        "seconds": time.time() - started,
        "best_iteration": best,
        "validation": weighted_metrics(y_val, prediction, w_val, any_val),
    }
    del xgb_model
    started = time.time()
    train_set = lgb.Dataset(x[index], y[index], weight=weight[index])
    val_set = lgb.Dataset(x_val, y_val, weight=w_val, reference=train_set)
    lgb_model = lgb.train(
        {
            "objective": "binary",
            "metric": "binary_logloss",
            "learning_rate": 0.04,
            "num_leaves": 127,
            "max_depth": 9,
            "min_data_in_leaf": 300,
            "feature_fraction": 0.9,
            "bagging_fraction": 0.85,
            "bagging_freq": 1,
            "lambda_l2": 8.0,
            "num_threads": 14,
            "seed": SEED,
            "verbosity": -1,
        },
        train_set,
        num_boost_round=500,
        valid_sets=[val_set],
        callbacks=[lgb.early_stopping(40, verbose=False)],
    )
    lgb_prediction = lgb_model.predict(x_val, num_iteration=lgb_model.best_iteration)
    output["lightgbm"] = {
        "seconds": time.time() - started,
        "best_iteration": int(lgb_model.best_iteration),
        "validation": weighted_metrics(y_val, lgb_prediction, w_val, any_val),
    }
    return output


def climatology(
    train_meta: pl.DataFrame,
    y_train: np.ndarray,
    w_train: np.ndarray,
    test_meta: pl.DataFrame,
) -> np.ndarray:
    train = train_meta.with_columns(
        pl.Series("success", y_train * w_train),
        pl.Series("weight", w_train),
        pl.col("target_hour").dt.hour().alias("hour"),
    )
    table = train.group_by("band", "hour").agg(
        (pl.col("success").sum() / pl.col("weight").sum()).alias("prediction")
    )
    global_rate = float(np.average(y_train, weights=w_train))
    return (
        test_meta.with_columns(pl.col("target_hour").dt.hour().alias("hour"))
        .join(table, on=["band", "hour"], how="left")
        .get_column("prediction")
        .fill_null(global_rate)
        .to_numpy()
    )


def global_climatology(
    y_train: np.ndarray, w_train: np.ndarray, rows: int
) -> np.ndarray:
    return np.full(rows, np.average(y_train, weights=w_train), dtype=np.float64)


def claim_metrics(
    y: np.ndarray, prediction: np.ndarray, weight: np.ndarray
) -> list[dict[str, Any]]:
    total_weight = float(weight.sum())
    output = []
    for threshold in (0.5, 0.7, 0.8, 0.9):
        mask = prediction >= threshold
        output.append(
            {
                "threshold": threshold,
                "rows": int(mask.sum()),
                "weighted_coverage": float(weight[mask].sum() / total_weight),
                "weighted_observed_rate": (
                    float(np.average(y[mask], weights=weight[mask]))
                    if mask.any()
                    else None
                ),
            }
        )
    return output


def slice_metrics(
    metadata: pl.DataFrame,
    y: np.ndarray,
    prediction: np.ndarray,
    weight: np.ndarray,
    any_success: np.ndarray,
    train_metadata: pl.DataFrame,
) -> dict[str, Any]:
    output: dict[str, Any] = {"band": []}
    for band in metadata.get_column("band").unique().sort().to_list():
        mask = metadata.get_column("band").to_numpy() == band
        output["band"].append(
            {"band": band, **weighted_metrics(y[mask], prediction[mask], weight[mask], any_success[mask])}
        )
    train_tx = train_metadata.get_column("tx_grid4").unique()
    train_rx = train_metadata.get_column("rx_grid4").unique()
    unseen = metadata.select(
        (
            ~pl.col("tx_grid4").is_in(train_tx.implode())
            | ~pl.col("rx_grid4").is_in(train_rx.implode())
        ).alias("unseen")
    ).get_column("unseen").to_numpy()
    output["unseen_endpoint_grid"] = (
        weighted_metrics(y[unseen], prediction[unseen], weight[unseen], any_success[unseen])
        if unseen.any()
        else None
    )
    train_paths = train_metadata.select(
        pl.concat_str("tx_grid4", "rx_grid4", separator="|").alias("path")
    ).unique().get_column("path")
    unseen_path = metadata.select(
        ~pl.concat_str("tx_grid4", "rx_grid4", separator="|")
        .is_in(train_paths.implode())
        .alias("unseen_path")
    ).get_column("unseen_path").to_numpy()
    output["unseen_grid_path"] = (
        weighted_metrics(
            y[unseen_path],
            prediction[unseen_path],
            weight[unseen_path],
            any_success[unseen_path],
        )
        if unseen_path.any()
        else None
    )
    distance = metadata.get_column("dist_km").to_numpy()
    output["distance"] = []
    for label, lower, upper in (
        ("0-1000km", 0, 1000),
        ("1000-3000km", 1000, 3000),
        ("3000-6000km", 3000, 6000),
        ("6000-10000km", 6000, 10000),
        ("10000km+", 10000, np.inf),
    ):
        mask = (distance >= lower) & (distance < upper)
        if mask.any():
            output["distance"].append(
                {
                    "bucket": label,
                    **weighted_metrics(
                        y[mask], prediction[mask], weight[mask], any_success[mask]
                    ),
                }
            )
    dark = metadata.get_column("dark_frac").to_numpy()
    kp = metadata.get_column("kp").fill_null(0).to_numpy()
    for name, mask in {
        "night_heavy": dark >= 2 / 3,
        "mixed_light": (dark > 1 / 3) & (dark < 2 / 3),
        "day_heavy": dark <= 1 / 3,
        "geomagnetic_quiet": kp < 2,
        "geomagnetic_active": (kp >= 2) & (kp < 4),
        "geomagnetic_storm": kp >= 4,
    }.items():
        output[name] = weighted_metrics(y[mask], prediction[mask], weight[mask], any_success[mask]) if mask.any() else None
    return output


def day_block_delta(
    metadata: pl.DataFrame,
    y: np.ndarray,
    weight: np.ndarray,
    model_prediction: np.ndarray,
    baseline_prediction: np.ndarray,
) -> dict[str, Any]:
    dates = metadata.get_column("target_hour").dt.date().to_numpy()
    daily = []
    for date in np.unique(dates):
        mask = dates == date
        model_brier = float(np.average((y[mask] - model_prediction[mask]) ** 2, weights=weight[mask]))
        base_brier = float(np.average((y[mask] - baseline_prediction[mask]) ** 2, weights=weight[mask]))
        daily.append({"date": str(date), "model_brier": model_brier, "baseline_brier": base_brier, "delta": model_brier-base_brier})
    values = np.array([row["delta"] for row in daily])
    rng = np.random.default_rng(SEED)
    draws = rng.choice(values, size=(10000, len(values)), replace=True).mean(axis=1)
    return {
        "daily": daily,
        "mean_delta": float(values.mean()),
        "bootstrap_95_ci": [float(np.quantile(draws, 0.025)), float(np.quantile(draws, 0.975))],
        "wins": int((values < 0).sum()),
        "days": len(values),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--task", choices=("hf", "6m"), required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    ensure_directories()
    path = PROCESSED / f"dataset_{config['run_id']}_{args.task}.parquet"
    if not path.exists():
        raise FileNotFoundError(path)
    result_dir = RESULTS / config["run_id"]
    model_dir = MODELS / config["run_id"]
    result_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, Any] = {
        "schema_version": 1,
        "run_id": config["run_id"],
        "task": args.task,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "config": config,
        "profiles": {},
    }
    cached = {}
    selected_engine = "xgboost"
    for profile in ("physics", "nowcast"):
        features = features_for(path, args.task, profile)
        print(f"load {profile}: {len(features)} features", flush=True)
        train = load_split(
            path, "train", features, config.get("primary_train_rows")
        )
        validation = load_split(
            path, "validation", features, config.get("validation_rows")
        )
        test = load_split(path, "test", features)
        x_train, y_train, w_train, any_train, train_meta = train
        x_val, y_val, w_val, any_val, val_meta = validation
        x_test, y_test, w_test, any_test, test_meta = test
        if np.unique(any_train).size < 2 or len(y_train) < 1000:
            results["profiles"][profile] = {"skipped": "insufficient class support", "rows": len(y_train)}
            continue
        if profile == "physics":
            results["engine_bakeoff"] = engine_bakeoff(
                x_train, y_train, w_train, x_val, y_val, w_val, any_val
            )
            selected_engine = min(
                results["engine_bakeoff"],
                key=lambda name: (
                    results["engine_bakeoff"][name]["validation"]["weighted_brier"],
                    results["engine_bakeoff"][name]["validation"]["weighted_log_loss"],
                ),
            )
            results["selected_engine"] = selected_engine
        baseline = climatology(train_meta, y_train, w_train, test_meta)
        global_baseline = global_climatology(y_train, w_train, len(y_test))
        started = time.time()
        model, best, val_raw = train_engine(
            selected_engine,
            x_train,
            y_train,
            w_train,
            x_val,
            y_val,
            w_val,
            int(config["xgboost_rounds"]),
            int(config["early_stopping_rounds"]),
        )
        test_raw = predict_engine(selected_engine, model, best, x_test)
        calibrator = fit_isotonic(y_val, val_raw, w_val)
        global_val_prediction = calibrator.predict(val_raw)
        global_test_prediction = calibrator.predict(test_raw)
        band_calibrators = fit_band_calibrators(
            y_val,
            val_raw,
            w_val,
            val_meta.get_column("band").to_numpy(),
            calibrator,
        )
        band_val_prediction = apply_band_calibrators(
            band_calibrators, val_raw, val_meta.get_column("band").to_numpy()
        )
        band_test_prediction = apply_band_calibrators(
            band_calibrators, test_raw, test_meta.get_column("band").to_numpy()
        )
        if weighted_brier(y_val, band_val_prediction, w_val) < weighted_brier(
            y_val, global_val_prediction, w_val
        ):
            calibration_method = "per_band_isotonic"
            calibrated_val = band_val_prediction
            test_prediction = band_test_prediction
            selected_calibrator: Any = band_calibrators
        else:
            calibration_method = "global_isotonic"
            calibrated_val = global_val_prediction
            test_prediction = global_test_prediction
            selected_calibrator = calibrator
        suffix = "txt" if selected_engine == "lightgbm" else "json"
        model_path = model_dir / f"{args.task}_{profile}.{suffix}"
        model.save_model(model_path)
        joblib.dump(
            selected_calibrator,
            model_dir / f"{args.task}_{profile}.isotonic.joblib",
        )
        if selected_engine == "lightgbm":
            importance_rows = [
                {"feature": feature, "gain": float(gain)}
                for feature, gain in zip(
                    features, model.feature_importance(importance_type="gain")
                )
            ]
        else:
            importance = model.get_score(importance_type="gain")
            importance_rows = [
                {"feature": features[int(key[1:])], "gain": float(gain)}
                for key, gain in importance.items()
            ]
        profile_result = {
            "engine": selected_engine,
            "calibration_method": calibration_method,
            "features": features,
            "best_iteration": best,
            "seconds": time.time() - started,
            "train_rows": len(y_train),
            "validation_rows": len(y_val),
            "test_rows": len(y_test),
            "validation_raw": weighted_metrics(y_val, val_raw, w_val, any_val),
            "validation_calibrated": weighted_metrics(
                y_val, calibrated_val, w_val, any_val
            ),
            "test_raw": weighted_metrics(y_test, test_raw, w_test, any_test),
            "test_calibrated": weighted_metrics(y_test, test_prediction, w_test, any_test),
            "climatology": weighted_metrics(y_test, baseline, w_test, any_test),
            "global_climatology": weighted_metrics(
                y_test, global_baseline, w_test, any_test
            ),
            "brier_skill_vs_climatology": 1
            - weighted_metrics(y_test, test_prediction, w_test, any_test)["weighted_brier"]
            / weighted_metrics(y_test, baseline, w_test, any_test)["weighted_brier"],
            "calibration_bins": calibration_bins(y_test, test_prediction, w_test),
            "claim_metrics": claim_metrics(y_test, test_prediction, w_test),
            "slices": slice_metrics(test_meta, y_test, test_prediction, w_test, any_test, train_meta),
            "day_block_vs_climatology": day_block_delta(test_meta, y_test, w_test, test_prediction, baseline),
            "feature_importance_gain": sorted(
                importance_rows,
                key=lambda row: row["gain"],
                reverse=True,
            ),
            "model_path": relative(model_path),
        }
        if profile == "nowcast":
            curves = []
            rng = np.random.default_rng(SEED)
            for requested in config.get("learning_curve_rows", []):
                size = min(int(requested), len(y_train))
                if curves and size == curves[-1]["train_rows"]:
                    continue
                index = (
                    np.sort(rng.choice(len(y_train), size, replace=False))
                    if size < len(y_train)
                    else np.arange(len(y_train))
                )
                curve_started = time.time()
                curve_model, curve_best, curve_val = train_engine(
                    selected_engine,
                    x_train[index],
                    y_train[index],
                    w_train[index],
                    x_val,
                    y_val,
                    w_val,
                    min(600, int(config["xgboost_rounds"])),
                    int(config["early_stopping_rounds"]),
                )
                curve_raw = predict_engine(selected_engine, curve_model, curve_best, x_test)
                curve_calibrator = fit_isotonic(y_val, curve_val, w_val)
                curve_global_val = curve_calibrator.predict(curve_val)
                curve_band_calibrators = fit_band_calibrators(
                    y_val,
                    curve_val,
                    w_val,
                    val_meta.get_column("band").to_numpy(),
                    curve_calibrator,
                )
                curve_band_val = apply_band_calibrators(
                    curve_band_calibrators,
                    curve_val,
                    val_meta.get_column("band").to_numpy(),
                )
                if weighted_brier(y_val, curve_band_val, w_val) < weighted_brier(
                    y_val, curve_global_val, w_val
                ):
                    curve_prediction = apply_band_calibrators(
                        curve_band_calibrators,
                        curve_raw,
                        test_meta.get_column("band").to_numpy(),
                    )
                    curve_calibration = "per_band_isotonic"
                else:
                    curve_prediction = curve_calibrator.predict(curve_raw)
                    curve_calibration = "global_isotonic"
                curves.append(
                    {
                        "requested_rows": int(requested),
                        "train_rows": size,
                        "best_iteration": curve_best,
                        "calibration_method": curve_calibration,
                        "seconds": time.time() - curve_started,
                        "test": weighted_metrics(
                            y_test, curve_prediction, w_test, any_test
                        ),
                    }
                )
                del curve_model, curve_calibrator, curve_val, curve_raw, curve_prediction
                gc.collect()
            profile_result["learning_curve"] = curves
        results["profiles"][profile] = profile_result
        cached[profile] = {"prediction": test_prediction}
        if profile == "physics":
            cached[profile].update(
                {"y": y_test, "weight": w_test, "metadata": test_meta}
            )
        del train, validation, test, x_train, y_train, w_train, any_train
        del x_val, y_val, w_val, any_val, x_test, y_test, w_test, any_test
        del model, calibrator, selected_calibrator, band_calibrators
        del baseline, global_baseline, val_raw, test_raw
        del global_val_prediction, global_test_prediction
        del band_val_prediction, band_test_prediction, calibrated_val, test_prediction
        gc.collect()
    if "physics" in cached and "nowcast" in cached:
        y = cached["physics"]["y"]
        weight = cached["physics"]["weight"]
        metadata = cached["physics"]["metadata"]
        physics_pred = cached["physics"]["prediction"]
        nowcast_pred = cached["nowcast"]["prediction"]
        results["nowcast_vs_physics"] = day_block_delta(
            metadata, y, weight, nowcast_pred, physics_pred
        )
    results["versions"] = {
        package: importlib.metadata.version(package)
        for package in ("duckdb", "polars", "numpy", "scikit-learn", "lightgbm", "xgboost")
    }
    write_json(result_dir / f"{args.task}_results.json", results)
    print(result_dir / f"{args.task}_results.json")


if __name__ == "__main__":
    main()
