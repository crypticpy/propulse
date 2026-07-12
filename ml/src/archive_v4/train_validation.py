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
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import average_precision_score, roc_auc_score


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
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


class CalibratorBundle:
    def __init__(
        self,
        global_model: IsotonicRegression,
        band_models: dict[str, IsotonicRegression] | None = None,
    ) -> None:
        self.global_model = global_model
        self.band_models = band_models or {}

    @property
    def method(self) -> str:
        return "per_band_isotonic" if self.band_models else "global_isotonic"

    def predict(self, raw: np.ndarray, bands: np.ndarray) -> np.ndarray:
        if not self.band_models:
            return self.global_model.predict(raw)
        output = np.empty(len(raw), dtype=np.float64)
        text_bands = bands.astype(str)
        for band in np.unique(text_bands):
            mask = text_bands == band
            output[mask] = self.band_models.get(band, self.global_model).predict(raw[mask])
        return output


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
    path: Path,
    features: list[str],
    months: list[str],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    raw_rows, targets, weights, bands, any_success = [], [], [], [], []
    for matrix, target, weight, metadata in iter_numpy_batches(
        path,
        features,
        weight_column="opportunities",
        filter_expression=month_filter(months),
        metadata=["band", "any_success"],
    ):
        raw_rows.append(
            model.inplace_predict(matrix, iteration_range=(0, best + 1))
        )
        targets.append(target)
        weights.append(weight)
        bands.append(metadata["band"])
        any_success.append(metadata["any_success"])
    if not raw_rows:
        raise RuntimeError(f"validation sample has no rows for {months}")
    return tuple(
        np.concatenate(values)
        for values in (raw_rows, targets, weights, bands, any_success)
    )  # type: ignore[return-value]


def fit_calibrators(
    raw: np.ndarray,
    target: np.ndarray,
    weight: np.ndarray,
    bands: np.ndarray,
) -> tuple[CalibratorBundle, CalibratorBundle]:
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
    return CalibratorBundle(global_model), CalibratorBundle(global_model, models)


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


def peak_rss_gb() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return float(value) / (1024**3)


def score_climatology(config: dict[str, Any]) -> dict[str, Any]:
    source = PROCESSED / f"dataset_{config['run_id']}_hf.parquet"
    con = duckdb.connect()
    rows = con.execute(
        f"""
        SELECT band, hour(target_hour) AS hour,
               sum(successes) / sum(opportunities) AS probability
        FROM read_parquet('{source}') WHERE split='train'
        GROUP BY band, hour(target_hour)
        """
    ).fetchall()
    global_rate = con.execute(
        f"""
        SELECT sum(successes) / sum(opportunities)
        FROM read_parquet('{source}') WHERE split='train'
        """
    ).fetchone()[0]
    rates = {(str(row[0]), int(row[1])): float(row[2]) for row in rows}
    scanner = ds.dataset(str(source), format="parquet").scanner(
        columns=["target_hour", "band", "success_rate", "opportunities"],
        filter=month_filter(config["validation_protocol"]["gate_months"]),
        batch_size=250_000,
    )
    overall = MetricAccumulator()
    bands: dict[str, MetricAccumulator] = {}
    for batch in scanner.to_batches():
        text_bands = batch.column("band").to_numpy(zero_copy_only=False).astype(str)
        hours = pc.hour(batch.column("target_hour")).to_numpy(zero_copy_only=False)
        prediction = np.array(
            [rates.get((band, int(hour)), global_rate) for band, hour in zip(text_bands, hours)],
            dtype=np.float64,
        )
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
    global_cal, band_cal = fit_calibrators(
        calibration[0], calibration[1], calibration[2], calibration[3]
    )
    gate = load_predictions(
        model,
        best,
        validation_path,
        features,
        validation["gate_months"],
    )
    candidates = [global_cal, band_cal]
    candidate_metrics = {
        candidate.method: sample_metrics(
            gate[1], candidate.predict(gate[0], gate[3]), gate[2], gate[4]
        )
        for candidate in candidates
    }
    selected = min(
        candidates,
        key=lambda candidate: (
            candidate_metrics[candidate.method]["weighted_brier"],
            candidate_metrics[candidate.method]["weighted_log_loss"],
        ),
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
        "train_rows": train_matrix.num_row(),
        "early_stopping_rows": tuning_matrix.num_row(),
        "best_iteration": best,
        "calibration_method": selected.method,
        "calibrator_comparison_on_gate_sample": candidate_metrics,
        "gate_sample": candidate_metrics[selected.method],
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
    output: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": run_id,
        "scope": "development_only",
        "locked_archive_test_read": False,
        "validation_protocol": config["validation_protocol"],
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
        else:
            curve = train_candidate(
                config, "M2_nowcast", cap, train_paths, validation_path,
                model_dir, cache_dir, save=False,
            )
        output["learning_curve"].append({
            key: curve[key]
            for key in ("train_cap", "train_rows", "best_iteration", "gate_full", "seconds", "peak_rss_gb")
        })
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
