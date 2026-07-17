"""Train and evaluate the Archive Proof V2 classifiers.

The primary comparison trains identical physics-only feature sets against dense
reference and sparse collector labels. A secondary nowcast profile adds each
source's own lag observations. Polars is used for dataset reads and NumPy is
used only at the model boundary.
"""

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
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "ml/data/processed/archive_v2"
MODEL_DIR = ROOT / "ml/models/archive_v2"
RESULTS_DIR = ROOT / "ml/results/archive_v2"
MANIFEST = RESULTS_DIR / "dataset_manifest.json"

SEED = 20260711
BAKEOFF_ROWS = 2_000_000

PHYSICS_FEATURES = [
    "band_mhz",
    "hod_sin",
    "hod_cos",
    "doy_sin",
    "doy_cos",
    "dist_km",
    "bearing_sin",
    "bearing_cos",
    "tx_lat_sin",
    "tx_lat_cos",
    "tx_lon_sin",
    "tx_lon_cos",
    "rx_lat_sin",
    "rx_lat_cos",
    "rx_lon_sin",
    "rx_lon_cos",
    "mid_lat_sin",
    "mid_lat_cos",
    "mid_lon_sin",
    "mid_lon_cos",
    "sun_elev_tx",
    "sun_elev_rx",
    "sun_elev_mid",
    "dark_frac",
    "min_abs_elev_ends",
    "kp",
    "sfi",
    "bz",
    "by",
    "bt",
    "wind_speed",
    "xray",
    "dst",
    "proton",
    "kp_delta_3h",
    "kp_max_24h",
    "bz_min_3h",
    "xray_max_6h",
    "kp_missing",
    "sfi_missing",
    "bz_missing",
    "by_missing",
    "bt_missing",
    "wind_speed_missing",
    "xray_missing",
    "dst_missing",
    "proton_missing",
    "is_weekend",
    "is_contest",
    "band_160m",
    "band_80m",
    "band_60m",
    "band_40m",
    "band_30m",
    "band_20m",
    "band_17m",
    "band_15m",
    "band_12m",
    "band_10m",
]

NOWCAST_SUFFIXES = [
    "path_prev1",
    "path_prev2",
    "path_prev3",
    "path_prev24",
    "reverse_prev1",
    "tx_band_prev1",
    "rx_band_prev1",
]

t0 = time.time()


def log(message: str) -> None:
    print(f"[{time.time() - t0:7.1f}s] {message}", flush=True)


def json_value(value: Any) -> Any:
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        value = float(value)
        return value if math.isfinite(value) else None
    if isinstance(value, np.ndarray):
        return value.tolist()
    raise TypeError(f"cannot JSON encode {type(value)}")


def features_for(task: str, source: str, profile: str) -> list[str]:
    physics = [feature for feature in PHYSICS_FEATURES if task == "hf" or not feature.startswith("band_")]
    if profile == "physics":
        return physics
    return physics + [f"log1p_{source}_{suffix}" for suffix in NOWCAST_SUFFIXES]


def load_split(
    path: Path,
    split: str,
    feature_columns: list[str],
    label_column: str,
) -> tuple[np.ndarray, np.ndarray]:
    frame = (
        pl.scan_parquet(path)
        .filter(pl.col("split") == split)
        .select(feature_columns + [label_column])
        .collect(engine="streaming")
    )
    x = frame.select(feature_columns).to_numpy().astype(np.float32, copy=False)
    y = frame.get_column(label_column).to_numpy().astype(np.uint8, copy=False)
    return x, y


def load_metadata(path: Path, split: str) -> pl.DataFrame:
    return (
        pl.scan_parquet(path)
        .filter(pl.col("split") == split)
        .select("hour_utc", "band", "reference_open", "sparse_open")
        .collect(engine="streaming")
    )


def finite_metric(function, y: np.ndarray, prediction: np.ndarray) -> float | None:
    if np.unique(y).size < 2:
        return None
    value = float(function(y, prediction))
    return value if math.isfinite(value) else None


def expected_calibration_error(
    y: np.ndarray, prediction: np.ndarray, bins: int = 15
) -> float:
    edges = np.linspace(0.0, 1.0, bins + 1)
    indices = np.minimum(np.digitize(prediction, edges[1:-1]), bins - 1)
    total = len(y)
    error = 0.0
    for index in range(bins):
        mask = indices == index
        if mask.any():
            error += mask.mean() * abs(float(y[mask].mean()) - float(prediction[mask].mean()))
    return float(error) if total else 0.0


def metrics(y: np.ndarray, prediction: np.ndarray) -> dict[str, Any]:
    p = np.clip(prediction, 1e-7, 1 - 1e-7)
    result: dict[str, Any] = {
        "rows": len(y),
        "positives": int(y.sum()),
        "prevalence": float(y.mean()),
        "roc_auc": finite_metric(roc_auc_score, y, p),
        "pr_auc": finite_metric(average_precision_score, y, p),
        "brier": float(brier_score_loss(y, p)),
        "log_loss": float(log_loss(y, p, labels=[0, 1])),
        "ece_15": expected_calibration_error(y, p),
        "mean_prediction": float(p.mean()),
        "thresholds": {},
    }
    for threshold in (0.5, 0.7, 0.8, 0.9):
        mask = p >= threshold
        result["thresholds"][str(threshold)] = {
            "claims": int(mask.sum()),
            "precision": float(y[mask].mean()) if mask.any() else None,
            "coverage": float(mask.mean()),
        }
    return result


def calibration_bins(
    y: np.ndarray, prediction: np.ndarray, bins: int = 10
) -> list[dict[str, Any]]:
    edges = np.linspace(0.0, 1.0, bins + 1)
    indices = np.minimum(np.digitize(prediction, edges[1:-1]), bins - 1)
    rows = []
    for index in range(bins):
        mask = indices == index
        if not mask.any():
            continue
        rows.append(
            {
                "bin": index + 1,
                "lower": float(edges[index]),
                "upper": float(edges[index + 1]),
                "mean_prediction": float(prediction[mask].mean()),
                "observed_rate": float(y[mask].mean()),
                "rows": int(mask.sum()),
            }
        )
    return rows


def fit_isotonic(y: np.ndarray, prediction: np.ndarray) -> IsotonicRegression | None:
    if np.unique(y).size < 2 or np.unique(prediction).size < 20:
        return None
    calibrator = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    calibrator.fit(prediction, y)
    return calibrator


def train_lightgbm(
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    rounds: int = 1200,
) -> tuple[lgb.Booster, int, np.ndarray]:
    train_set = lgb.Dataset(x_train, y_train, free_raw_data=True)
    val_set = lgb.Dataset(x_val, y_val, reference=train_set, free_raw_data=True)
    model = lgb.train(
        {
            "objective": "binary",
            "metric": "binary_logloss",
            "learning_rate": 0.04,
            "num_leaves": 127,
            "max_depth": 10,
            "min_data_in_leaf": 300,
            "feature_fraction": 0.9,
            "bagging_fraction": 0.85,
            "bagging_freq": 1,
            "lambda_l1": 0.2,
            "lambda_l2": 5.0,
            "max_bin": 255,
            "num_threads": 10,
            "seed": SEED,
            "feature_fraction_seed": SEED,
            "bagging_seed": SEED,
            "deterministic": True,
            "force_col_wise": True,
            "verbosity": -1,
        },
        train_set,
        num_boost_round=rounds,
        valid_sets=[val_set],
        callbacks=[lgb.early_stopping(75, verbose=False), lgb.log_evaluation(100)],
    )
    best_iteration = int(model.best_iteration)
    prediction = model.predict(x_val, num_iteration=best_iteration)
    return model, best_iteration, prediction


def train_xgboost(
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    rounds: int = 1200,
) -> tuple[xgb.Booster, int, np.ndarray]:
    train_matrix = xgb.QuantileDMatrix(x_train, y_train, max_bin=255)
    val_matrix = xgb.QuantileDMatrix(x_val, y_val, ref=train_matrix, max_bin=255)
    model = xgb.train(
        {
            "objective": "binary:logistic",
            "eval_metric": "logloss",
            "tree_method": "hist",
            "max_depth": 10,
            "min_child_weight": 100,
            "eta": 0.04,
            "subsample": 0.85,
            "colsample_bytree": 0.9,
            "lambda": 5.0,
            "alpha": 0.2,
            "max_bin": 255,
            "seed": SEED,
            "nthread": 10,
        },
        train_matrix,
        num_boost_round=rounds,
        evals=[(val_matrix, "validation")],
        early_stopping_rounds=75,
        verbose_eval=100,
    )
    best_iteration = int(model.best_iteration)
    prediction = model.predict(val_matrix, iteration_range=(0, best_iteration + 1))
    return model, best_iteration, prediction


def train_engine(
    engine: str,
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
) -> tuple[Any, int, np.ndarray]:
    if engine == "lightgbm":
        return train_lightgbm(x_train, y_train, x_val, y_val)
    return train_xgboost(x_train, y_train, x_val, y_val)


def predict(engine: str, model: Any, best_iteration: int, matrix: np.ndarray) -> np.ndarray:
    if engine == "lightgbm":
        return model.predict(matrix, num_iteration=best_iteration)
    test_matrix = xgb.QuantileDMatrix(matrix, max_bin=255)
    return model.predict(test_matrix, iteration_range=(0, best_iteration + 1))


def save_model(
    engine: str,
    model: Any,
    calibrator: IsotonicRegression | None,
    name: str,
    metadata: dict[str, Any],
    reference_calibrator: IsotonicRegression | None = None,
) -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    suffix = "txt" if engine == "lightgbm" else "json"
    model.save_model(str(MODEL_DIR / f"{name}.{suffix}"))
    if calibrator is not None:
        joblib.dump(calibrator, MODEL_DIR / f"{name}.isotonic.joblib")
    if reference_calibrator is not None:
        joblib.dump(
            reference_calibrator,
            MODEL_DIR / f"{name}.reference_truth.isotonic.joblib",
        )
    (MODEL_DIR / f"{name}.metadata.json").write_text(
        json.dumps(metadata, indent=2, default=json_value) + "\n", encoding="utf-8"
    )


def climatology_predictions(
    path: Path, train_label: str, test_meta: pl.DataFrame
) -> np.ndarray:
    train = (
        pl.scan_parquet(path)
        .filter(pl.col("split") == "train")
        .select("band", pl.col("hour_utc").dt.hour().alias("hour"), train_label)
        .group_by("band", "hour")
        .agg(pl.col(train_label).mean().alias("climatology"))
        .collect(engine="streaming")
    )
    global_rate = float(
        pl.scan_parquet(path)
        .filter(pl.col("split") == "train")
        .select(pl.col(train_label).mean())
        .collect(engine="streaming")
        .item()
    )
    return (
        test_meta.with_columns(pl.col("hour_utc").dt.hour().alias("hour"))
        .join(train, on=["band", "hour"], how="left")
        .get_column("climatology")
        .fill_null(global_rate)
        .to_numpy()
    )


def per_band_metrics(
    metadata: pl.DataFrame, truth: np.ndarray, prediction: np.ndarray
) -> list[dict[str, Any]]:
    bands = metadata.get_column("band").to_numpy()
    rows = []
    for band in sorted(set(bands)):
        mask = bands == band
        row = {"band": band}
        row.update(metrics(truth[mask], prediction[mask]))
        rows.append(row)
    return rows


def day_block_comparison(
    metadata: pl.DataFrame,
    truth: np.ndarray,
    reference_prediction: np.ndarray,
    sparse_prediction: np.ndarray,
) -> dict[str, Any]:
    dates = metadata.get_column("hour_utc").dt.date().to_numpy()
    unique_dates = np.unique(dates)
    daily = []
    for date in unique_dates:
        mask = dates == date
        ref_brier = float(np.mean((truth[mask] - reference_prediction[mask]) ** 2))
        sparse_brier = float(np.mean((truth[mask] - sparse_prediction[mask]) ** 2))
        daily.append(
            {
                "date": str(date),
                "reference_brier": ref_brier,
                "sparse_brier": sparse_brier,
                "delta_reference_minus_sparse": ref_brier - sparse_brier,
                "rows": int(mask.sum()),
            }
        )
    deltas = np.array([row["delta_reference_minus_sparse"] for row in daily])
    rng = np.random.default_rng(SEED)
    draws = rng.choice(deltas, size=(10_000, len(deltas)), replace=True).mean(axis=1)
    return {
        "daily": daily,
        "mean_daily_delta": float(deltas.mean()),
        "bootstrap_95_ci": [float(np.quantile(draws, 0.025)), float(np.quantile(draws, 0.975))],
        "reference_wins_days": int((deltas < 0).sum()),
        "days": len(deltas),
    }


def bakeoff(path: Path, task: str) -> tuple[str, dict[str, Any]]:
    features = features_for(task, "reference", "physics")
    x_train, y_train = load_split(path, "train", features, "reference_open")
    x_val, y_val = load_split(path, "val", features, "reference_open")
    if len(y_train) > BAKEOFF_ROWS:
        rng = np.random.default_rng(SEED)
        indices = np.sort(rng.choice(len(y_train), BAKEOFF_ROWS, replace=False))
        x_bake, y_bake = x_train[indices], y_train[indices]
    else:
        x_bake, y_bake = x_train, y_train

    results = {}
    for engine in ("lightgbm", "xgboost"):
        started = time.time()
        log(f"bakeoff {engine}: {len(y_bake):,} train / {len(y_val):,} validation")
        model, iteration, prediction = train_engine(engine, x_bake, y_bake, x_val, y_val)
        results[engine] = {
            "best_iteration": iteration,
            "seconds": time.time() - started,
            "validation": metrics(y_val, prediction),
        }
        del model, prediction
        gc.collect()
    del x_train, y_train, x_val, y_val, x_bake, y_bake
    gc.collect()

    winner = min(
        results,
        key=lambda name: (
            results[name]["validation"]["brier"],
            -(results[name]["validation"]["pr_auc"] or 0.0),
        ),
    )
    log(f"bakeoff winner: {winner}")
    return winner, results


def train_one(
    path: Path,
    task: str,
    engine: str,
    source: str,
    profile: str,
    val_metadata: pl.DataFrame,
    test_metadata: pl.DataFrame,
) -> tuple[dict[str, Any], np.ndarray] | None:
    label = f"{source}_open"
    features = features_for(task, source, profile)
    log(f"loading {task} {source} {profile} matrices ({len(features)} features)")
    x_train, y_train = load_split(path, "train", features, label)
    x_val, y_val = load_split(path, "val", features, label)
    x_test, y_test_native = load_split(path, "test", features, label)
    if np.unique(y_train).size < 2 or np.unique(y_val).size < 2:
        log(f"skipping {task} {source} {profile}: label has fewer than two classes")
        return None

    started = time.time()
    model, best_iteration, val_prediction = train_engine(
        engine, x_train, y_train, x_val, y_val
    )
    raw_test_prediction = predict(engine, model, best_iteration, x_test)
    calibrator = fit_isotonic(y_val, val_prediction)
    native_calibrated_test = (
        calibrator.predict(raw_test_prediction) if calibrator is not None else raw_test_prediction
    )
    calibrated_val = calibrator.predict(val_prediction) if calibrator is not None else val_prediction
    reference_val_truth = (
        val_metadata.get_column("reference_open").to_numpy().astype(np.uint8)
    )
    reference_calibrator = fit_isotonic(reference_val_truth, val_prediction)
    reference_calibrated_test = (
        reference_calibrator.predict(raw_test_prediction)
        if reference_calibrator is not None
        else raw_test_prediction
    )
    reference_calibrated_val = (
        reference_calibrator.predict(val_prediction)
        if reference_calibrator is not None
        else val_prediction
    )
    reference_truth = test_metadata.get_column("reference_open").to_numpy().astype(np.uint8)

    name = f"proof_v2_{task}_{source}_{profile}"
    model_metadata = {
        "name": name,
        "task": task,
        "source": source,
        "profile": profile,
        "engine": engine,
        "best_iteration": best_iteration,
        "features": features,
        "calibrated": calibrator is not None,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset_manifest": str(MANIFEST.relative_to(ROOT)),
    }
    save_model(
        engine,
        model,
        calibrator,
        name,
        model_metadata,
        reference_calibrator=reference_calibrator if source != "reference" else None,
    )

    result = {
        **model_metadata,
        "seconds": time.time() - started,
        "train_rows": len(y_train),
        "train_positives": int(y_train.sum()),
        "validation_native_raw": metrics(y_val, val_prediction),
        "validation_native_calibrated": metrics(y_val, calibrated_val),
        "test_native_raw": metrics(y_test_native, raw_test_prediction),
        "test_native_calibrated": metrics(y_test_native, native_calibrated_test),
        "test_reference_raw": metrics(reference_truth, raw_test_prediction),
        "test_reference_native_calibrated": metrics(
            reference_truth, native_calibrated_test
        ),
        "validation_reference_recalibrated": metrics(
            reference_val_truth, reference_calibrated_val
        ),
        "test_reference_calibrated": metrics(
            reference_truth, reference_calibrated_test
        ),
        "test_reference_calibration_bins": calibration_bins(
            reference_truth, reference_calibrated_test
        ),
        "per_band_reference_calibrated": per_band_metrics(
            test_metadata, reference_truth, reference_calibrated_test
        ),
    }
    log(
        f"{name}: reference-test PR-AUC "
        f"{result['test_reference_calibrated']['pr_auc']!s}, Brier "
        f"{result['test_reference_calibrated']['brier']:.5f}"
    )
    del model, calibrator, reference_calibrator
    del x_train, y_train, x_val, y_val, x_test, y_test_native
    gc.collect()
    return result, reference_calibrated_test


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", choices=("hf", "6m"), required=True)
    args = parser.parse_args()
    task = args.task
    path = DATA_DIR / ("proof_hf.parquet" if task == "hf" else "proof_6m.parquet")
    if not path.exists() or not MANIFEST.exists():
        raise SystemExit("dataset or manifest missing; run build_proof_dataset.py first")

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    test_metadata = load_metadata(path, "test")
    val_metadata = load_metadata(path, "val")
    reference_truth = test_metadata.get_column("reference_open").to_numpy().astype(np.uint8)
    sparse_truth = test_metadata.get_column("sparse_open").to_numpy().astype(np.uint8)

    engine, bakeoff_results = bakeoff(path, task)
    models: dict[str, Any] = {}
    predictions: dict[str, np.ndarray] = {}
    for source in ("reference", "sparse"):
        for profile in ("physics", "nowcast"):
            trained = train_one(
                path, task, engine, source, profile, val_metadata, test_metadata
            )
            if trained is None:
                continue
            result, prediction = trained
            key = f"{source}_{profile}"
            models[key] = result
            predictions[key] = prediction

    ref_climatology = climatology_predictions(path, "reference_open", test_metadata)
    sparse_climatology = climatology_predictions(path, "sparse_open", test_metadata)
    baselines = {
        "reference_band_hour_climatology_on_reference": metrics(
            reference_truth, ref_climatology
        ),
        "sparse_band_hour_climatology_on_sparse": metrics(sparse_truth, sparse_climatology),
        "sparse_band_hour_climatology_on_reference": metrics(
            reference_truth, sparse_climatology
        ),
    }
    ref_baseline_brier = baselines["reference_band_hour_climatology_on_reference"]["brier"]
    for model_result in models.values():
        brier = model_result["test_reference_calibrated"]["brier"]
        model_result["test_reference_calibrated"]["brier_skill_vs_reference_climatology"] = (
            1.0 - brier / ref_baseline_brier
        )

    comparisons = {}
    for profile in ("physics", "nowcast"):
        ref_key = f"reference_{profile}"
        sparse_key = f"sparse_{profile}"
        if ref_key not in models or sparse_key not in models:
            continue
        ref_metrics = models[ref_key]["test_reference_calibrated"]
        sparse_metrics = models[sparse_key]["test_reference_calibrated"]
        comparisons[profile] = {
            "delta_reference_minus_sparse": {
                metric: ref_metrics[metric] - sparse_metrics[metric]
                for metric in ("roc_auc", "pr_auc", "brier", "log_loss", "ece_15")
                if ref_metrics[metric] is not None and sparse_metrics[metric] is not None
            },
            "day_block_brier": day_block_comparison(
                test_metadata,
                reference_truth,
                predictions[ref_key],
                predictions[sparse_key],
            ),
        }

    label_agreement = {
        "test_rows": len(reference_truth),
        "reference_positives": int(reference_truth.sum()),
        "sparse_positives": int(sparse_truth.sum()),
        "both_positive": int(((reference_truth == 1) & (sparse_truth == 1)).sum()),
        "reference_only_positive": int(((reference_truth == 1) & (sparse_truth == 0)).sum()),
        "sparse_only_positive": int(((reference_truth == 0) & (sparse_truth == 1)).sum()),
        "sparse_recall_of_reference": float(
            sparse_truth[reference_truth == 1].mean() if reference_truth.any() else 0.0
        ),
    }
    output = {
        "schema_version": 2,
        "task": task,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "selected_engine": engine,
        "bakeoff": bakeoff_results,
        "label_agreement": label_agreement,
        "baselines": baselines,
        "models": models,
        "comparisons": comparisons,
        "versions": {
            package: importlib.metadata.version(package)
            for package in ("polars", "lightgbm", "xgboost", "scikit-learn", "numpy")
        },
    }
    output_path = RESULTS_DIR / f"{task}_results.json"
    output_path.write_text(
        json.dumps(output, indent=2, default=json_value) + "\n", encoding="utf-8"
    )
    log(f"wrote {output_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
