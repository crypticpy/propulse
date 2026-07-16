#!/usr/bin/env python3
"""Fit frozen direct and weather-only FutureCast models without opening gate data."""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import multiprocessing
import os
import resource
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Sequence

import duckdb
import numpy as np
import pyarrow as pa
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression

from external_memory import MetricAccumulator, ParquetDataIter, iter_numpy_batches


ROOT = Path(__file__).resolve().parents[3]
V4_2 = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(V4_2))

from m5_runtime import configure_arrow_threads, validate_m5_runtime  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/futurecast_v1.json"
RUNTIME_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".tmp-{os.getpid()}")
    temporary.write_text(
        json.dumps(payload, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def peak_rss_gib() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return float(value) / (1024**3) if sys.platform == "darwin" else float(value) / (1024**2)


def weighted_metrics(
    target: np.ndarray,
    prediction: np.ndarray,
    weight: np.ndarray,
) -> dict[str, Any]:
    accumulator = MetricAccumulator()
    accumulator.update(target, prediction, weight)
    return accumulator.result()


def apply_calibrator(prediction: np.ndarray, calibrator: dict[str, Any]) -> np.ndarray:
    values = np.asarray(prediction, dtype=np.float64)
    if calibrator["method"] == "identity":
        return np.clip(values, 0.0, 1.0)
    if calibrator["method"] != "isotonic":
        raise ValueError("unsupported FutureCast calibrator")
    return np.interp(
        values,
        np.asarray(calibrator["x_thresholds"], dtype=np.float64),
        np.asarray(calibrator["y_thresholds"], dtype=np.float64),
    )


def fit_guarded_isotonic(
    *,
    fit_prediction: np.ndarray,
    fit_target: np.ndarray,
    fit_weight: np.ndarray,
    guard_prediction: np.ndarray,
    guard_target: np.ndarray,
    guard_weight: np.ndarray,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    model = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    model.fit(fit_prediction, fit_target, sample_weight=fit_weight)
    candidates = {
        "identity": {"method": "identity"},
        "isotonic": {
            "method": "isotonic",
            "x_thresholds": [float(value) for value in model.X_thresholds_],
            "y_thresholds": [float(value) for value in model.y_thresholds_],
        },
    }
    metrics = {
        name: weighted_metrics(
            guard_target,
            apply_calibrator(guard_prediction, calibrator),
            guard_weight,
        )
        for name, calibrator in candidates.items()
    }
    selected_name = min(
        candidates,
        key=lambda name: (
            metrics[name]["weighted_brier"],
            metrics[name]["weighted_log_loss"],
            0 if name == "identity" else 1,
        ),
    )
    return candidates[selected_name], metrics


def validate_calibration_sample_sizes(
    fit_rows: int,
    guard_rows: int,
    minimum_rows: int,
) -> None:
    if minimum_rows < 1 or fit_rows < minimum_rows or guard_rows < minimum_rows:
        raise RuntimeError("FutureCast calibration subsplit is below the frozen row minimum")


def partition_records(
    manifest: dict[str, Any],
    *,
    horizon: int,
    split: str,
) -> list[dict[str, Any]]:
    if split not in {"train", "calibration", "gate"}:
        raise ValueError("unsupported FutureCast split")
    return sorted(
        (
            row
            for row in manifest["partitions"]
            if int(row["horizon_hours"]) == horizon and row["split"] == split
        ),
        key=lambda row: (row["issue_time"], row["path"]),
    )


def calibration_groups(
    records: Sequence[dict[str, Any]],
    subsplit_days: dict[str, int],
) -> dict[str, list[Path]]:
    dates = sorted({date.fromisoformat(row["issue_time"][:10]) for row in records})
    expected = sum(int(value) for value in subsplit_days.values())
    if len(dates) != expected:
        raise RuntimeError("FutureCast calibration block does not contain 15 issue days")
    groups: dict[str, set[date]] = {}
    offset = 0
    for name in ("early_stopping", "isotonic_fit", "identity_guard"):
        count = int(subsplit_days[name])
        groups[name] = set(dates[offset : offset + count])
        offset += count
    return {
        name: [
            Path(row["path"])
            for row in records
            if date.fromisoformat(row["issue_time"][:10]) in selected
        ]
        for name, selected in groups.items()
    }


def validate_examples(
    manifest_path: Path,
    config_path: Path,
) -> tuple[dict[str, Any], dict[str, Any]]:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    privacy = manifest.get("privacy", {})
    if (
        manifest.get("scope") != "futurecast_v1_direct_horizon_examples"
        or manifest.get("data_scope")
        not in {"production_issued_history", "synthetic_fixture"}
        or manifest.get("decision") != "development_examples_frozen"
        or manifest.get("release_approved") is not False
        or manifest.get("config_sha256") != sha256(config_path)
        or manifest.get("model_identifier_columns") != []
        or privacy.get("raw_wspr_observations_read") is not False
        or privacy.get("station_identity_read") is not False
        or privacy.get("equipment_read") is not False
        or privacy.get("grid4_in_model_matrix") is not False
        or privacy.get("locked_core_outcomes_read") is not False
    ):
        raise RuntimeError("FutureCast example manifest is invalid")
    total_days = sum(int(value) for value in config["split_days"].values())
    if int(manifest["window"]["days"]) != total_days:
        raise RuntimeError("FutureCast example window differs from the frozen split")
    feature_columns = manifest.get("feature_columns", {})
    if not feature_columns.get("direct") or not feature_columns.get("weather_only"):
        raise RuntimeError("FutureCast feature matrices are not frozen")
    seen: set[str] = set()
    for row in manifest.get("partitions", []):
        path = Path(str(row["path"])).expanduser().resolve()
        if str(path) in seen or sha256(path) != row.get("sha256"):
            raise RuntimeError("FutureCast example checksum mismatch")
        seen.add(str(path))
        if not row.get("gates") or not all(row["gates"].values()):
            raise RuntimeError("FutureCast example leakage gate failed")
    for horizon in config["horizons_hours"]:
        for split, days in config["split_days"].items():
            records = partition_records(manifest, horizon=int(horizon), split=split)
            distinct_days = {row["issue_time"][:10] for row in records}
            if len(distinct_days) != int(days):
                raise RuntimeError(
                    f"FutureCast +{horizon} {split} does not cover {days} issue days"
                )
    return config, manifest


def load_predictions(
    model: xgb.Booster,
    best_iteration: int,
    paths: Sequence[Path],
    features: list[str],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    predictions: list[np.ndarray] = []
    targets: list[np.ndarray] = []
    weights: list[np.ndarray] = []
    for matrix, target, weight, _metadata in iter_numpy_batches(
        list(paths),
        features,
        weight_column="opportunities",
        batch_size=250_000,
    ):
        predictions.append(
            model.inplace_predict(
                matrix,
                iteration_range=(0, best_iteration + 1),
            )
        )
        targets.append(target)
        weights.append(weight)
    if not predictions:
        raise RuntimeError("FutureCast calibration selection is empty")
    return (
        np.concatenate(predictions),
        np.concatenate(targets),
        np.concatenate(weights),
    )


def xgboost_parameters(config: dict[str, Any], *, seed_offset: int) -> dict[str, Any]:
    values = config["model"]
    return {
        "objective": values["objective"],
        "eval_metric": values["eval_metric"],
        "tree_method": values["tree_method"],
        "eta": float(values["learning_rate"]),
        "max_depth": int(values["max_depth"]),
        "min_child_weight": float(values["min_child_weight"]),
        "subsample": float(values["subsample"]),
        "colsample_bytree": float(values["colsample_bytree"]),
        "lambda": float(values["lambda"]),
        "alpha": float(values["alpha"]),
        "max_bin": 255,
        "seed": int(config["seed"]) + seed_offset,
        "nthread": int(values["threads_per_worker"]),
    }


def fit_model(task: dict[str, Any]) -> dict[str, Any]:
    config = task["config"]
    profile = str(task["profile"])
    horizon = int(task["horizon"])
    features = list(task["features"])
    train_paths = [Path(path) for path in task["train_paths"]]
    calibration = {
        name: [Path(path) for path in paths]
        for name, paths in task["calibration"].items()
    }
    output_root = Path(task["output_root"])
    cache_root = Path(task["cache_root"])
    threads = int(config["model"]["threads_per_worker"])
    pa.set_cpu_count(threads)
    pa.set_io_thread_count(max(1, threads // 2))
    output_root.mkdir(parents=True, exist_ok=True)
    cache_root.mkdir(parents=True, exist_ok=True)
    train_iter = ParquetDataIter(
        train_paths,
        features,
        weight_column="opportunities",
        cache_prefix=str(cache_root / f"{profile}-{horizon}-{os.getpid()}-train"),
    )
    early_iter = ParquetDataIter(
        calibration["early_stopping"],
        features,
        weight_column="opportunities",
        cache_prefix=str(cache_root / f"{profile}-{horizon}-{os.getpid()}-early"),
    )
    train_matrix = xgb.ExtMemQuantileDMatrix(train_iter, max_bin=255)
    early_matrix = xgb.ExtMemQuantileDMatrix(
        early_iter,
        max_bin=255,
        ref=train_matrix,
    )
    train_rows = int(train_matrix.num_row())
    early_stopping_rows = int(early_matrix.num_row())
    started = time.perf_counter()
    model = xgb.train(
        xgboost_parameters(
            config,
            seed_offset=horizon * 10 + (0 if profile == "direct" else 1),
        ),
        train_matrix,
        num_boost_round=int(config["model"]["max_rounds"]),
        evals=[(early_matrix, "early_stopping")],
        early_stopping_rounds=int(config["model"]["early_stopping_rounds"]),
        verbose_eval=100,
    )
    best_iteration = int(model.best_iteration)
    fit_prediction, fit_target, fit_weight = load_predictions(
        model,
        best_iteration,
        calibration["isotonic_fit"],
        features,
    )
    guard_prediction, guard_target, guard_weight = load_predictions(
        model,
        best_iteration,
        calibration["identity_guard"],
        features,
    )
    validate_calibration_sample_sizes(
        int(fit_target.size),
        int(guard_target.size),
        int(config["calibration"]["minimum_rows"]),
    )
    calibrator, comparison = fit_guarded_isotonic(
        fit_prediction=fit_prediction,
        fit_target=fit_target,
        fit_weight=fit_weight,
        guard_prediction=guard_prediction,
        guard_target=guard_target,
        guard_weight=guard_weight,
    )
    model_path = output_root / f"futurecast_{profile}_h{horizon}.ubj"
    calibrator_path = output_root / f"futurecast_{profile}_h{horizon}.calibrator.json"
    temporary_model = model_path.with_name(
        f"{model_path.stem}.tmp-{os.getpid()}{model_path.suffix}"
    )
    model.save_model(str(temporary_model))
    os.chmod(temporary_model, 0o600)
    temporary_model.replace(model_path)
    atomic_json(calibrator_path, calibrator)
    importance = model.get_score(importance_type="gain")
    del train_matrix, early_matrix, train_iter, early_iter
    return {
        "profile": profile,
        "horizon_hours": horizon,
        "features": features,
        "train_rows": train_rows,
        "early_stopping_rows": early_stopping_rows,
        "best_iteration": best_iteration,
        "calibration_method": calibrator["method"],
        "calibration_fit_rows": int(fit_target.size),
        "calibration_guard_rows": int(guard_target.size),
        "calibration_guard_metrics": comparison,
        "model_path": str(model_path),
        "model_sha256": sha256(model_path),
        "calibrator_path": str(calibrator_path),
        "calibrator_sha256": sha256(calibrator_path),
        "feature_importance_gain": sorted(
            (
                {
                    "feature": features[int(name[1:])],
                    "gain": float(gain),
                }
                for name, gain in importance.items()
            ),
            key=lambda row: row["gain"],
            reverse=True,
        ),
        "wall_seconds": time.perf_counter() - started,
        "peak_rss_gib": peak_rss_gib(),
        "gate_rows_read": False,
    }


def train_climatology(
    records: Sequence[dict[str, Any]],
    *,
    threads: int,
    memory_limit: str,
) -> dict[str, Any]:
    paths_by_horizon: defaultdict[int, list[str]] = defaultdict(list)
    for row in records:
        if row["split"] == "train":
            paths_by_horizon[int(row["horizon_hours"])].append(str(row["path"]))
    output: dict[str, Any] = {}
    connection = duckdb.connect()
    connection.execute(f"SET threads={threads}")
    connection.execute(f"SET memory_limit='{memory_limit}'")
    for horizon, paths in sorted(paths_by_horizon.items()):
        quoted = ",".join("'" + path.replace("'", "''") + "'" for path in paths)
        rows = connection.execute(
            f"""
            SELECT band, hour(valid_time) AS valid_hour,
                   sum(successes) / sum(opportunities) AS probability,
                   sum(opportunities) AS opportunities
            FROM read_parquet([{quoted}], hive_partitioning=false)
            GROUP BY band, valid_hour
            ORDER BY band, valid_hour
            """
        ).fetchall()
        global_row = connection.execute(
            f"""
            SELECT sum(successes) / sum(opportunities), sum(opportunities)
            FROM read_parquet([{quoted}], hive_partitioning=false)
            """
        ).fetchone()
        output[str(horizon)] = {
            "global_probability": float(global_row[0]),
            "opportunities": float(global_row[1]),
            "band_hour": [
                {
                    "band": str(row[0]),
                    "valid_hour": int(row[1]),
                    "probability": float(row[2]),
                    "opportunities": float(row[3]),
                }
                for row in rows
            ],
        }
    connection.close()
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--examples-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path)
    parser.add_argument("--cache-root", type=Path)
    parser.add_argument("--force-development-rerun", action="store_true")
    parser.add_argument("--allow-synthetic-fixture", action="store_true")
    args = parser.parse_args()

    args.config = args.config.expanduser().resolve()
    args.examples_root = args.examples_root.expanduser().resolve()
    config, manifest = validate_examples(
        args.examples_root / "EXAMPLE_MANIFEST.json",
        args.config,
    )
    if (
        manifest["data_scope"] == "synthetic_fixture"
        and not args.allow_synthetic_fixture
    ):
        raise RuntimeError("synthetic FutureCast training requires explicit acknowledgement")
    runtime_config = json.loads(RUNTIME_CONFIG.read_text(encoding="utf-8"))
    runtime = validate_m5_runtime(runtime_config, xgboost_module=xgb)
    arrow = configure_arrow_threads(runtime_config, parallel_fit=True)
    workers = int(config["model"]["training_workers"])
    threads = int(config["model"]["threads_per_worker"])
    if workers * threads != int(config["compute"]["physical_cores"]):
        raise RuntimeError("FutureCast XGBoost workers oversubscribe the M5")
    fit_rss_limit = float(config["compute"]["maximum_fit_process_rss_gib"])
    parallel_rss_limit = float(config["compute"]["maximum_parallel_fit_rss_gib"])
    if workers * fit_rss_limit > parallel_rss_limit:
        raise RuntimeError("FutureCast parallel fit RSS contract is internally unsafe")
    output_root = (
        args.output_root.expanduser().resolve()
        if args.output_root
        else args.examples_root.expanduser().resolve().parent / "models"
    )
    cache_root = (
        args.cache_root.expanduser().resolve()
        if args.cache_root
        else Path(config["compute"]["temp_root"]).expanduser().resolve()
    )
    if output_root.is_relative_to(ROOT) or cache_root.is_relative_to(ROOT):
        raise RuntimeError("FutureCast model and cache roots must remain outside the repository")
    output_root.mkdir(parents=True, exist_ok=True)
    cache_root.mkdir(parents=True, exist_ok=True)
    os.chmod(output_root, 0o700)
    os.chmod(cache_root, 0o700)
    manifest_path = output_root / "TRAINING_MANIFEST.json"
    if manifest["data_scope"] == "production_issued_history" and args.force_development_rerun:
        raise RuntimeError("production FutureCast models are immutable")
    if manifest_path.exists() and (
        manifest["data_scope"] == "production_issued_history"
        or not args.force_development_rerun
    ):
        raise RuntimeError(
            "FutureCast models are already frozen; use a new output root or "
            "--force-development-rerun before gate scoring"
        )

    climatology = train_climatology(
        manifest["partitions"],
        threads=int(config["compute"]["duckdb_threads"]),
        memory_limit=str(config["compute"]["duckdb_memory_limit"]),
    )
    climatology_path = output_root / "futurecast_climatology.json"
    atomic_json(climatology_path, climatology)

    tasks: list[dict[str, Any]] = []
    for horizon in config["horizons_hours"]:
        train_records = partition_records(manifest, horizon=int(horizon), split="train")
        calibration_records = partition_records(
            manifest,
            horizon=int(horizon),
            split="calibration",
        )
        groups = calibration_groups(
            calibration_records,
            config["calibration_subsplit_days"],
        )
        for profile in ("direct", "weather_only"):
            tasks.append(
                {
                    "config": config,
                    "profile": profile,
                    "horizon": int(horizon),
                    "features": manifest["feature_columns"][profile],
                    "train_paths": [row["path"] for row in train_records],
                    "calibration": {
                        name: [str(path) for path in paths]
                        for name, paths in groups.items()
                    },
                    "output_root": str(output_root),
                    "cache_root": str(cache_root),
                }
            )
    results: list[dict[str, Any]] = []
    with concurrent.futures.ProcessPoolExecutor(
        max_workers=workers,
        mp_context=multiprocessing.get_context("spawn"),
        max_tasks_per_child=1,
    ) as executor:
        futures = [executor.submit(fit_model, task) for task in tasks]
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if float(result["peak_rss_gib"]) > fit_rss_limit:
                raise RuntimeError("FutureCast fit exceeded the RSS ceiling")
            results.append(result)
            print(
                f"completed {result['profile']} +{result['horizon_hours']}h "
                f"at iteration {result['best_iteration']}",
                flush=True,
            )
    conservative_parallel_peak = workers * max(
        float(row["peak_rss_gib"]) for row in results
    )
    if conservative_parallel_peak > parallel_rss_limit:
        raise RuntimeError("FutureCast parallel fits exceeded the combined RSS ceiling")

    training_manifest = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": "futurecast_v1_development_models",
        "data_scope": manifest["data_scope"],
        "decision": "models_frozen_gate_unopened",
        "release_approved": False,
        "config_sha256": sha256(args.config),
        "example_manifest_sha256": sha256(
            args.examples_root / "EXAMPLE_MANIFEST.json"
        ),
        "runtime": runtime,
        "arrow": arrow,
        "parallelism": {
            "workers": workers,
            "threads_per_worker": threads,
            "total_xgboost_threads": workers * threads,
            "process_start_method": "spawn",
            "max_tasks_per_child": 1,
            "per_fit_rss_limit_gib": fit_rss_limit,
            "combined_rss_limit_gib": parallel_rss_limit,
            "conservative_combined_peak_rss_gib": conservative_parallel_peak,
        },
        "calibration_subsplit_days": config["calibration_subsplit_days"],
        "climatology_path": str(climatology_path),
        "climatology_sha256": sha256(climatology_path),
        "models": sorted(results, key=lambda row: (row["horizon_hours"], row["profile"])),
        "gate": {
            "rows_read": False,
            "partitions_frozen": [
                {"path": row["path"], "sha256": row["sha256"]}
                for row in manifest["partitions"]
                if row["split"] == "gate"
            ],
        },
        "privacy": {
            "grid4_model_features": False,
            "station_identity_read": False,
            "beta_outcomes_read": False,
            "core_prospective_policy_changed": False,
        },
    }
    atomic_json(manifest_path, training_manifest)
    print(manifest_path)


if __name__ == "__main__":
    main()
