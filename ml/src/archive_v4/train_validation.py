#!/usr/bin/env python3
"""Train V4 candidates using development data only; never reads the locked test."""

from __future__ import annotations

import argparse
import gc
import importlib.metadata
import json
import os
import resource
import sys
import time
from pathlib import Path
from typing import Any

import joblib
import duckdb
import numpy as np
import polars as pl
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, roc_auc_score


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(V3))
from common import (  # noqa: E402
    MANIFESTS,
    MODELS,
    PROCESSED,
    RESULTS,
    ensure_directories,
    load_config,
    relative,
    sha256,
    utc_now,
    write_json,
)
from train_experiment import BASE_FEATURES, NOWCAST_FEATURES  # noqa: E402

from external_memory import (  # noqa: E402
    MetricAccumulator,
    ParquetDataIter,
    combine_filters,
    iter_numpy_batches,
    month_filter,
    score_stream,
)
from calibration import CalibratorBundle  # noqa: E402


def duckdb_parquet_source(path: Path) -> str:
    return str(path / "*.parquet") if path.is_dir() else str(path)


def available_features(paths: list[Path], profile: str) -> list[str]:
    names = set(ds.dataset([str(path) for path in paths], format="parquet").schema.names)
    features = [name for name in BASE_FEATURES if name in names]
    features.extend(sorted(name for name in names if name.startswith("band_")))
    features.extend(sorted(name for name in names if name.endswith("_missing")))
    if profile == "M2_nowcast":
        features.extend(name for name in NOWCAST_FEATURES if name in names)
        features.extend(
            name
            for name in (
                "path_prev1_available",
                "path_prev2_available",
                "path_prev3_available",
                "path_prev24_available",
            )
            if name in names
        )
    return list(dict.fromkeys(features))


def load_predictions(
    model: xgb.Booster,
    best: int,
    path: Path | list[Path],
    features: list[str],
    months: list[str],
    weight_column: str = "opportunities",
) -> tuple[
    np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray
]:
    raw_rows, targets, weights, bands, any_success, distances, target_hours = (
        [], [], [], [], [], [], []
    )
    for matrix, target, weight, metadata in iter_numpy_batches(
        path,
        features,
        weight_column=weight_column,
        filter_expression=month_filter(months),
        metadata=["band", "any_success", "dist_km", "target_hour"],
    ):
        raw_rows.append(
            model.inplace_predict(matrix, iteration_range=(0, best + 1))
        )
        targets.append(target)
        weights.append(weight)
        bands.append(metadata["band"])
        any_success.append(metadata["any_success"])
        distances.append(metadata["dist_km"])
        target_hours.append(metadata["target_hour"])
    if not raw_rows:
        raise RuntimeError(f"validation sample has no rows for {months}")
    return tuple(
        np.concatenate(values)
        for values in (
            raw_rows, targets, weights, bands, any_success, distances, target_hours
        )
    )  # type: ignore[return-value]


def fit_calibrators(
    raw: np.ndarray,
    target: np.ndarray,
    weight: np.ndarray,
    bands: np.ndarray,
    distance: np.ndarray,
) -> tuple[CalibratorBundle, CalibratorBundle, CalibratorBundle]:
    global_model = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
    global_model.fit(raw, target, sample_weight=weight)
    models: dict[str, IsotonicRegression] = {}
    text_bands = bands.astype(str)
    for band in np.unique(text_bands):
        mask = text_bands == band
        if mask.sum() < 10_000 or np.unique(raw[mask]).size < 50:
            continue
        model = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
        model.fit(raw[mask], target[mask], sample_weight=weight[mask])
        models[band] = model
    distance_models: dict[tuple[str, str], IsotonicRegression] = {}
    groups = CalibratorBundle.distance_groups(distance.astype(np.float64))
    for band, group in sorted(set(zip(text_bands, groups))):
        mask = (text_bands == band) & (groups == group)
        if mask.sum() < 20_000 or np.unique(raw[mask]).size < 50:
            continue
        model = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
        model.fit(raw[mask], target[mask], sample_weight=weight[mask])
        distance_models[(band, group)] = model
    return (
        CalibratorBundle(global_model),
        CalibratorBundle(global_model, models),
        CalibratorBundle(global_model, models, distance_models),
    )


CALIBRATION_SELECTION_PROTOCOL = (
    "April days 1-20 fit; days 21-end method selection; full April refit"
)


def select_calibrator(
    calibration: tuple[
        np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray,
        np.ndarray,
    ],
) -> tuple[CalibratorBundle, dict[str, dict[str, Any]]]:
    timestamps = calibration[6].astype("datetime64[us]")
    calibration_days = (
        timestamps.astype("datetime64[D]") - timestamps.astype("datetime64[M]")
    ).astype(np.int16) + 1
    calibration_fit = calibration_days <= 20
    calibration_select = calibration_days > 20
    if not calibration_fit.any() or not calibration_select.any():
        raise RuntimeError("calibration month does not cover both frozen day windows")
    candidates = list(fit_calibrators(
        calibration[0][calibration_fit],
        calibration[1][calibration_fit],
        calibration[2][calibration_fit],
        calibration[3][calibration_fit],
        calibration[5][calibration_fit],
    ))
    candidate_metrics = {
        candidate.method: sample_metrics(
            calibration[1][calibration_select],
            candidate.predict(
                calibration[0][calibration_select],
                calibration[3][calibration_select],
                calibration[5][calibration_select],
            ),
            calibration[2][calibration_select],
            calibration[4][calibration_select],
        )
        for candidate in candidates
    }
    selected_method = min(
        candidates,
        key=lambda candidate: (
            candidate_metrics[candidate.method]["weighted_brier"],
            candidate_metrics[candidate.method]["weighted_log_loss"],
        ),
    ).method
    selected = next(
        candidate
        for candidate in fit_calibrators(
            calibration[0], calibration[1], calibration[2], calibration[3],
            calibration[5],
        )
        if candidate.method == selected_method
    )
    return selected, candidate_metrics


def sample_metrics(
    target: np.ndarray,
    prediction: np.ndarray,
    weight: np.ndarray,
    any_success: np.ndarray,
) -> dict[str, Any]:
    accumulator = MetricAccumulator()
    accumulator.update(target, prediction, weight)
    output = accumulator.result()
    binary = any_success.astype(np.uint8)
    if np.unique(binary).size == 2:
        output["open_roc_auc"] = float(roc_auc_score(binary, prediction))
        output["open_pr_auc"] = float(average_precision_score(binary, prediction))
    else:
        output["open_roc_auc"] = None
        output["open_pr_auc"] = None
    return output


def in_memory_quantile_matrix(
    paths: Path | list[Path],
    features: list[str],
    *,
    weight_column: str,
    filter_expression: ds.Expression | None,
    ref: xgb.QuantileDMatrix | None = None,
) -> xgb.QuantileDMatrix:
    matrices: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    weights: list[np.ndarray] = []
    for matrix, target, weight, _ in iter_numpy_batches(
        paths,
        features,
        weight_column=weight_column,
        filter_expression=filter_expression,
    ):
        matrices.append(matrix)
        targets.append(target)
        weights.append(weight)
    if not matrices:
        raise RuntimeError("in-memory matrix selection is empty")
    matrix = np.concatenate(matrices)
    target = np.concatenate(targets)
    weight = np.concatenate(weights)
    output = xgb.QuantileDMatrix(
        matrix,
        target,
        weight=weight,
        max_bin=255,
        ref=ref,
    )
    del matrix, target, weight, matrices, targets, weights
    return output


def peak_rss_gb() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    # macOS reports bytes; Linux reports KiB.
    return float(value) / (1024**3) if sys.platform == "darwin" else float(value) / (1024**2)


def score_climatology(
    config: dict[str, Any],
    *,
    train_before: str | None = None,
    gate_months: list[str] | None = None,
) -> dict[str, Any]:
    source = PROCESSED / f"dataset_{config['run_id']}_hf.parquet"
    source_glob = duckdb_parquet_source(source)
    training_where = "split='train'"
    if train_before is not None:
        training_where += f" AND target_hour < TIMESTAMPTZ '{train_before}'"
    con = duckdb.connect()
    rows = con.execute(
        f"""
        SELECT band, hour(target_hour) AS hour,
               sum(successes) / sum(opportunities) AS probability
        FROM read_parquet('{source_glob}') WHERE {training_where}
        GROUP BY band, hour(target_hour)
        """
    ).fetchall()
    global_rate = con.execute(
        f"""
        SELECT sum(successes) / sum(opportunities)
        FROM read_parquet('{source_glob}') WHERE {training_where}
        """
    ).fetchone()[0]
    rates = {(str(row[0]), int(row[1])): float(row[2]) for row in rows}
    global_rates = np.full(24, float(global_rate), dtype=np.float64)
    rate_arrays: dict[str, np.ndarray] = {}
    for (band, hour), probability in rates.items():
        rate_arrays.setdefault(
            band, global_rates.copy()
        )[hour] = probability
    scanner = ds.dataset(str(source), format="parquet").scanner(
        columns=["target_hour", "band", "success_rate", "opportunities"],
        filter=month_filter(gate_months or config["validation_protocol"]["gate_months"]),
        batch_size=250_000,
    )
    overall = MetricAccumulator()
    bands: dict[str, MetricAccumulator] = {}
    for batch in scanner.to_batches():
        text_bands = batch.column("band").to_numpy(zero_copy_only=False).astype(str)
        hours = pc.hour(batch.column("target_hour")).to_numpy(zero_copy_only=False)
        prediction = np.full(len(text_bands), float(global_rate), dtype=np.float64)
        for band in np.unique(text_bands):
            mask = text_bands == band
            prediction[mask] = rate_arrays.get(band, global_rates)[hours[mask]]
        target = batch.column("success_rate").to_numpy(zero_copy_only=False).astype(np.float32)
        weight = batch.column("opportunities").to_numpy(zero_copy_only=False).astype(np.float32)
        overall.update(target, prediction, weight)
        for band in np.unique(text_bands):
            mask = text_bands == band
            bands.setdefault(band, MetricAccumulator()).update(
                target[mask], prediction[mask], weight[mask]
            )
    output = overall.result()
    output["slices"] = {
        "band": {band: value.result() for band, value in sorted(bands.items())}
    }
    output["definition"] = "Natural-distribution train band-by-UTC-hour climatology"
    return output


def score_p533_pair(
    config: dict[str, Any], candidate: dict[str, Any]
) -> dict[str, Any] | None:
    cache = PROCESSED / f"p533/{config['run_id']}_validation.parquet"
    p533_calibrator_path = MODELS / config["run_id"] / "B1_p533.isotonic.joblib"
    if not cache.exists() or not p533_calibrator_path.exists():
        return None
    frame = pl.read_parquet(cache).filter(
        pl.col("sample_month").is_in(config["validation_protocol"]["gate_months"])
    )
    if frame.is_empty():
        return None
    features = candidate["features"]
    missing = sorted(set(features) - set(frame.columns))
    if missing:
        return {
            "status": "not_comparable_missing_features",
            "missing_features": missing,
        }
    model = xgb.Booster()
    model.load_model(ROOT / candidate["model_path"])
    calibrator = joblib.load(ROOT / candidate["calibrator_path"])
    matrix = frame.select(features).fill_null(0).cast(pl.Float32).to_numpy()
    raw = model.inplace_predict(
        matrix, iteration_range=(0, int(candidate["best_iteration"]) + 1)
    )
    bands = frame["band"].to_numpy()
    distance = frame["dist_km"].to_numpy()
    candidate_prediction = calibrator.predict(raw, bands, distance)
    p533_calibrator = joblib.load(p533_calibrator_path)
    p533_prediction = p533_calibrator.predict(frame["adjusted_snr_db"].to_numpy())
    target = frame["success_rate"].to_numpy()
    weight = frame["opportunities"].to_numpy()
    any_success = frame["any_success"].to_numpy()
    candidate_metrics = sample_metrics(
        target, candidate_prediction, weight, any_success
    )
    p533_metrics = sample_metrics(target, p533_prediction, weight, any_success)
    return {
        "status": "paired_gate_sample",
        "rows": frame.height,
        "candidate": candidate_metrics,
        "p533": p533_metrics,
        "candidate_minus_p533_brier": (
            candidate_metrics["weighted_brier"] - p533_metrics["weighted_brier"]
        ),
        "candidate_brier_skill_vs_p533": (
            1 - candidate_metrics["weighted_brier"] / p533_metrics["weighted_brier"]
        ),
    }


def train_candidate(
    config: dict[str, Any],
    profile: str,
    cap: int,
    train_paths: list[Path],
    validation_path: Path,
    model_dir: Path,
    cache_dir: Path,
    save: bool,
) -> dict[str, Any]:
    features = available_features(train_paths, profile)
    sample_filter = ds.field(f"in_sample_{cap}") == True  # noqa: E712
    validation = config["validation_protocol"]
    in_memory_cap = int(os.environ.get("PROPULSE_IN_MEMORY_CAP", "5000000"))
    training_mode = "in_memory_quantile" if cap <= in_memory_cap else "external_memory_quantile"
    train_iterator = None
    tuning_iterator = None
    if cap <= in_memory_cap:
        train_matrix = in_memory_quantile_matrix(
            train_paths,
            features,
            weight_column="training_weight",
            filter_expression=sample_filter,
        )
        tuning_matrix = in_memory_quantile_matrix(
            validation_path,
            features,
            weight_column="opportunities",
            filter_expression=month_filter(validation["early_stopping_months"]),
            ref=train_matrix,
        )
    else:
        train_iterator = ParquetDataIter(
            train_paths,
            features,
            weight_column="training_weight",
            cache_prefix=str(cache_dir / f"{profile}-{cap}-train"),
            filter_expression=sample_filter,
        )
        tuning_iterator = ParquetDataIter(
            validation_path,
            features,
            weight_column="opportunities",
            cache_prefix=str(cache_dir / f"{profile}-{cap}-tuning"),
            filter_expression=month_filter(validation["early_stopping_months"]),
        )
        train_matrix = xgb.ExtMemQuantileDMatrix(train_iterator, max_bin=255)
        tuning_matrix = xgb.ExtMemQuantileDMatrix(
            tuning_iterator, max_bin=255, ref=train_matrix
        )
    started = time.time()
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
        validation_path,
        features,
        validation["calibration_months"],
    )
    selected, candidate_metrics = select_calibrator(calibration)
    gate = load_predictions(
        model,
        best,
        validation_path,
        features,
        validation["gate_months"],
    )
    gate_sample = sample_metrics(
        gate[1], selected.predict(gate[0], gate[3], gate[5]), gate[2], gate[4]
    )
    full_gate = score_stream(
        model,
        best,
        PROCESSED / f"dataset_{config['run_id']}_hf.parquet",
        features,
        weight_column="opportunities",
        calibrate=selected.predict,
        filter_expression=month_filter(validation["gate_months"]),
    )
    model_path = model_dir / f"{profile}_{cap}.json"
    calibrator_path = model_dir / f"{profile}_{cap}.isotonic.joblib"
    if save:
        model.save_model(model_path)
        joblib.dump(selected, calibrator_path)
    importance = model.get_score(importance_type="gain")
    result = {
        "candidate": profile,
        "train_cap": cap,
        "features": features,
        "training_mode": training_mode,
        "train_rows": train_matrix.num_row(),
        "early_stopping_rows": tuning_matrix.num_row(),
        "best_iteration": best,
        "calibration_method": selected.method,
        "calibration_selection_protocol": CALIBRATION_SELECTION_PROTOCOL,
        "calibrator_comparison_on_april_holdout": candidate_metrics,
        "gate_sample": gate_sample,
        "gate_full": full_gate,
        "seconds": time.time() - started,
        "peak_rss_gb": peak_rss_gb(),
        "feature_importance_gain": sorted(
            [
                {"feature": features[int(key[1:])], "gain": float(value)}
                for key, value in importance.items()
            ],
            key=lambda row: row["gain"],
            reverse=True,
        ),
        "model_path": relative(model_path) if save else None,
        "calibrator_path": relative(calibrator_path) if save else None,
    }
    del train_matrix, tuning_matrix, train_iterator, tuning_iterator, model
    gc.collect()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    parser.add_argument("--max-cap", type=int)
    args = parser.parse_args()
    config = load_config(args.config)
    if config.get("execution_scope") != "development":
        raise RuntimeError("training requires a development scoped config")
    ensure_directories()
    run_id = config["run_id"]
    sample_dir = PROCESSED / f"samples/{run_id}/hf/train"
    train_paths = sorted(sample_dir.rglob("*.parquet"))
    validation_path = PROCESSED / f"samples/{run_id}/hf/validation.parquet"
    audit_path = MANIFESTS / f"{run_id}_hf_development_audit.json"
    if not train_paths or not validation_path.exists() or not audit_path.exists():
        raise FileNotFoundError("balanced sample and passing development audit are required")
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    if audit["summary"]["failures"]:
        raise RuntimeError("development audit has failures")
    caps = [
        value
        for value in config["sampling"]["learning_curve_rows"]
        if args.max_cap is None or value <= args.max_cap
    ]
    if not caps:
        raise ValueError("--max-cap is below the first preregistered learning-curve cap")
    model_dir = MODELS / run_id
    result_dir = RESULTS / run_id
    cache_dir = Path(os.environ.get("PROPULSE_ML_TEMP_ROOT", "/tmp/propulse-ml")) / run_id / "xgb"
    model_dir.mkdir(parents=True, exist_ok=True)
    result_dir.mkdir(parents=True, exist_ok=True)
    cache_dir.mkdir(parents=True, exist_ok=True)
    previous_curves: dict[int, dict[str, Any]] = {}
    previous_results_path = result_dir / "development_results.json"
    if previous_results_path.exists():
        previous = json.loads(previous_results_path.read_text(encoding="utf-8"))
        if (
            previous.get("run_id") == run_id
            and previous.get("scope") == "development_only"
            and previous.get("calibration_selection_protocol")
            == CALIBRATION_SELECTION_PROTOCOL
        ):
            previous_curves = {
                int(row["train_cap"]): row
                for row in previous.get("learning_curve", [])
            }
    output: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": run_id,
        "scope": "development_only",
        "locked_archive_test_read": False,
        "validation_protocol": config["validation_protocol"],
        "calibration_selection_protocol": CALIBRATION_SELECTION_PROTOCOL,
        "candidates": {},
        "baselines": {
            "B0_climatology": score_climatology(config),
            "B1_p533_voacap": {"status": "pending_pinned_baseline_build"},
            "B2_frozen_v3": {"status": "pending_frozen_model_transfer"},
        },
        "learning_curve": [],
    }
    primary_cap = caps[-1]
    for profile in ("M1_physics", "M2_nowcast"):
        print(f"train {profile} cap={primary_cap:,}", flush=True)
        output["candidates"][profile] = train_candidate(
            config, profile, primary_cap, train_paths, validation_path,
            model_dir, cache_dir, save=True,
        )
        candidate = output["candidates"][profile]["gate_full"]
        baseline = output["baselines"]["B0_climatology"]
        output["candidates"][profile]["brier_skill_vs_B0"] = (
            1 - candidate["weighted_brier"] / baseline["weighted_brier"]
        )
    for cap in caps:
        print(f"learning curve M2 cap={cap:,}", flush=True)
        if cap == primary_cap:
            curve = output["candidates"]["M2_nowcast"]
        elif cap in previous_curves:
            print(f"reuse learning curve M2 cap={cap:,}", flush=True)
            output["learning_curve"].append(previous_curves[cap])
            continue
        else:
            curve = train_candidate(
                config, "M2_nowcast", cap, train_paths, validation_path,
                model_dir, cache_dir, save=False,
            )
        output["learning_curve"].append({
            key: curve[key]
            for key in ("train_cap", "train_rows", "best_iteration", "gate_full", "seconds", "peak_rss_gb")
        })
    paired_p533 = score_p533_pair(config, output["candidates"]["M2_nowcast"])
    if paired_p533 is not None:
        output["baselines"]["B1_p533_voacap"] = paired_p533
    output["versions"] = {
        package: importlib.metadata.version(package)
        for package in ("numpy", "pyarrow", "scikit-learn", "xgboost")
    }
    results_path = result_dir / "development_results.json"
    write_json(results_path, output)
    bundle = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": run_id,
        "scope": "development_only",
        "locked_test_scored": False,
        "artifacts": [],
    }
    for path in sorted(model_dir.glob("M[12]_*.json")) + sorted(model_dir.glob("M[12]_*.joblib")):
        bundle["artifacts"].append({
            "path": relative(path), "bytes": path.stat().st_size, "sha256": sha256(path)
        })
    write_json(result_dir / "development_bundle_manifest.json", bundle)
    print(results_path)


if __name__ == "__main__":
    main()
