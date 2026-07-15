#!/usr/bin/env python3
"""Score Phase 2 components and the refit A6 policy in one bounded stream."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import os
import platform
import resource
import sys
import tempfile
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb


ROOT = Path(__file__).resolve().parents[3]
V4 = ROOT / "ml/src/archive_v4"
V4_1 = ROOT / "ml/src/archive_v4_1"
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(V4))
sys.path.insert(0, str(V4_1))
sys.path.insert(0, str(MODULE))

from b2_adapter import feature_matrix as b2_feature_matrix, load_profile  # noqa: E402
from m5_runtime import configure_arrow_threads  # noqa: E402
from phase2_core import (  # noqa: E402
    EXPECTED_CANDIDATES,
    Phase2Error,
    decide_100m,
    is_robust_b2_win,
    scale_workset,
    select_final_candidate,
    select_50m_components,
    validate_config,
)
from train_validation import fit_calibrators, load_predictions  # noqa: E402
from train_phase2_scale import validate_m5_runtime  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V3_RESULTS = ROOT / "ml/results/archive_v3/archive_v3_eight_month/hf_results.json"
PHASE0_CONFIG = ROOT / "ml/config/propagation_v4_2.json"
PHASE1_DIR = ROOT / "ml/results/propagation_v4_2/propagation_v4_2_phase1_5m"
PHASE1_EVALUATION = PHASE1_DIR / "evaluation_results.json"
PHASE1_CONDITIONAL = PHASE1_DIR / "conditional_results.json"
PHASE2_20M_EVALUATION = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "evaluation_20m_results.json"
)
PREDICTION_THREAD_BENCHMARK = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "prediction_thread_benchmark.json"
)
STAT_SIZE = 7
CALIBRATION_BINS = 20
DISTANCE_BINS = (
    (0, 500),
    (500, 1_500),
    (1_500, 3_000),
    (3_000, 6_000),
    (6_000, 10_000),
    (10_000, 25_000),
)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def peak_rss_gb() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    divisor = 1024**3 if sys.platform == "darwin" else 1024**2
    return float(value / divisor)


def verify_artifact(item: dict[str, Any], label: str) -> Path:
    path = ROOT / item["path"]
    if path.stat().st_size != int(item["bytes"]):
        raise Phase2Error(f"artifact size changed: {label}")
    if sha256(path) != item["sha256"]:
        raise Phase2Error(f"artifact hash changed: {label}")
    return path


def verify_input(month: str, item: dict[str, Any], verify_hash: bool) -> dict[str, Any]:
    path = ROOT / item["path"]
    if path.stat().st_size != int(item["bytes"]):
        raise Phase2Error(f"evaluation input size changed: {month}")
    digest = sha256(path) if verify_hash else str(item["sha256"])
    if digest != item["sha256"]:
        raise Phase2Error(f"evaluation input hash changed: {month}")
    return {
        "path": item["path"],
        "bytes": item["bytes"],
        "sha256": digest,
        "sha256_verified_this_run": verify_hash,
        "rows": item.get("rows"),
    }


def numeric(batch: Any, name: str, dtype: Any = np.float32) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        column = pc.fill_null(column, 0)
    return np.asarray(column.to_numpy(zero_copy_only=False), dtype=dtype)


def text_labels(batch: Any, name: str) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        raise Phase2Error(f"scoring label contains nulls: {name}")
    return np.asarray(column.to_numpy(zero_copy_only=False), dtype=str)


def date_labels(batch: Any, name: str) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        raise Phase2Error(f"scoring timestamp contains nulls: {name}")
    formatted = pc.strftime(column, format="%Y-%m-%d")
    return np.asarray(formatted.to_numpy(zero_copy_only=False), dtype=str)


def feature_matrix(columns: dict[str, np.ndarray], features: list[str]) -> np.ndarray:
    missing = [name for name in features if name not in columns]
    if missing:
        raise Phase2Error(f"scoring input is missing features: {missing}")
    return np.column_stack(
        [np.asarray(columns[name], dtype=np.float32) for name in features]
    )


def cached_feature_matrix(
    cache: dict[tuple[str, ...], np.ndarray],
    columns: dict[str, np.ndarray],
    features: list[str],
) -> np.ndarray:
    key = tuple(features)
    if key not in cache:
        cache[key] = feature_matrix(columns, features)
    return cache[key]


def selected_prediction_threads(
    config: dict[str, Any], benchmark: dict[str, Any], benchmark_sha256: str
) -> int:
    if benchmark.get("december_2024_read") or benchmark.get("locked_2025_read"):
        raise Phase2Error("prediction thread benchmark reports locked outcome access")
    if not benchmark.get("all_predictions_bit_identical"):
        raise Phase2Error("prediction thread benchmark did not preserve exact output")
    selected = int(benchmark["selected_threads"])
    hardware = config["compute"]["apple_silicon"]
    if (
        "single_process_prediction_threads" not in hardware
        or "prediction_thread_benchmark_sha256" not in hardware
    ):
        raise Phase2Error(
            "run the prediction benchmark and freeze its selected thread count"
        )
    configured = int(hardware["single_process_prediction_threads"])
    if str(hardware["prediction_thread_benchmark_sha256"]) != benchmark_sha256:
        raise Phase2Error("prediction thread benchmark checksum changed")
    tested = {int(row["threads"]) for row in benchmark["results"]}
    if selected != configured or selected not in tested:
        raise Phase2Error("prediction thread decision does not match frozen config")
    return selected


def indices(labels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return np.unique(np.asarray(labels).astype(str), return_inverse=True)


def distance_labels(distance: np.ndarray) -> np.ndarray:
    labels = np.full(len(distance), "out-of-range", dtype="<U18")
    for lower, upper in DISTANCE_BINS:
        labels[(distance >= lower) & (distance < upper)] = f"{lower}-{upper} km"
    return labels


def contributions(
    target: np.ndarray, prediction: np.ndarray, weight: np.ndarray
) -> tuple[np.ndarray, ...]:
    clipped = np.clip(prediction.astype(np.float64, copy=False), 1e-7, 1 - 1e-7)
    error = clipped - target
    return (
        weight,
        weight * np.square(error),
        np.ones(len(target), dtype=np.float64),
        weight * target,
        weight * (-(target * np.log(clipped) + (1 - target) * np.log(1 - clipped))),
        weight * np.abs(error),
        weight * clipped,
    )


def add_group(
    totals: dict[str, np.ndarray],
    grouping: tuple[np.ndarray, np.ndarray],
    values: tuple[np.ndarray, ...],
) -> None:
    labels, inverse = grouping
    columns = [
        np.bincount(inverse, weights=value, minlength=len(labels)) for value in values
    ]
    for index, label in enumerate(labels):
        totals[str(label)] += np.asarray(
            [column[index] for column in columns], dtype=np.float64
        )


def stats_result(stats: np.ndarray) -> dict[str, Any]:
    if stats[0] <= 0:
        raise Phase2Error("metric group has no opportunity mass")
    return {
        "opportunities": float(stats[0]),
        "weighted_brier": float(stats[1] / stats[0]),
        "rows": int(stats[2]),
        "weighted_prevalence": float(stats[3] / stats[0]),
        "weighted_log_loss": float(stats[4] / stats[0]),
        "weighted_mae": float(stats[5] / stats[0]),
        "mean_prediction": float(stats[6] / stats[0]),
    }


def calibration_result(
    weights: np.ndarray, targets: np.ndarray, predictions: np.ndarray
) -> dict[str, Any]:
    total = float(weights.sum())
    rows = []
    ece = 0.0
    mce = 0.0
    for index in range(CALIBRATION_BINS):
        weight = float(weights[index])
        if weight <= 0:
            continue
        observed = float(targets[index] / weight)
        predicted = float(predictions[index] / weight)
        error = abs(observed - predicted)
        ece += weight / total * error
        mce = max(mce, error)
        rows.append(
            {
                "bin": index,
                "lower": index / CALIBRATION_BINS,
                "upper": (index + 1) / CALIBRATION_BINS,
                "opportunities": weight,
                "mean_prediction": predicted,
                "observed_rate": observed,
            }
        )
    return {
        "expected_calibration_error": ece,
        "maximum_calibration_error": mce,
        "bins": rows,
    }


def update_calibration(
    arrays: tuple[np.ndarray, np.ndarray, np.ndarray],
    target: np.ndarray,
    prediction: np.ndarray,
    weight: np.ndarray,
) -> None:
    clipped = np.clip(prediction.astype(np.float64, copy=False), 0, 1)
    indexes = np.minimum(
        (clipped * CALIBRATION_BINS).astype(np.int64), CALIBRATION_BINS - 1
    )
    arrays[0][:] += np.bincount(indexes, weights=weight, minlength=CALIBRATION_BINS)
    arrays[1][:] += np.bincount(
        indexes, weights=weight * target, minlength=CALIBRATION_BINS
    )
    arrays[2][:] += np.bincount(
        indexes, weights=weight * clipped, minlength=CALIBRATION_BINS
    )


def day_numbers(timestamps: np.ndarray) -> np.ndarray:
    values = timestamps.astype("datetime64[us]")
    return (values.astype("datetime64[D]") - values.astype("datetime64[M]")).astype(
        np.int16
    ) + 1


def temporary_policy_predictions(
    info: dict[str, Any],
    calibration_path: Path,
    month: str,
    fit_days: list[int],
    select_days: list[int],
) -> dict[str, np.ndarray]:
    model = xgb.Booster()
    model.load_model(verify_artifact(info["model"], f"{info['candidate']} model"))
    values = load_predictions(
        model,
        int(info["best_iteration"]),
        calibration_path,
        [str(value) for value in info["features"]],
        [month],
    )
    days = day_numbers(values[6])
    fit = (days >= fit_days[0]) & (days <= fit_days[1])
    select = (days >= select_days[0]) & (days <= select_days[1])
    if not fit.any() or not select.any() or np.any(fit & select):
        raise Phase2Error("invalid A6 calibration split")
    bundles = fit_calibrators(
        values[0][fit], values[1][fit], values[2][fit], values[3][fit], values[5][fit]
    )
    bundle = next(
        (value for value in bundles if value.method == info["calibration_method"]),
        None,
    )
    if bundle is None:
        raise Phase2Error(f"calibration method unavailable for {info['candidate']}")
    output = {
        "prediction": bundle.predict(
            values[0][select], values[3][select], values[5][select]
        ).astype(np.float64),
        "target": values[1][select].astype(np.float64),
        "weight": values[2][select].astype(np.float64),
        "band": values[3][select].astype(str),
        "distance": values[5][select].astype(np.float64),
        "timestamp": values[6][select],
    }
    del model, values, bundles, bundle
    gc.collect()
    return output


def select_a6(
    config: dict[str, Any], training: dict[str, Any], manifest: dict[str, Any]
) -> dict[str, Any]:
    policy = config["conditional_policy"]
    final_fold = config["final_fold"]
    calibration_path = verify_artifact(manifest["calibration"], "calibration sample")
    names = (policy["left"], policy["right"])
    values = {
        name: temporary_policy_predictions(
            training["candidates"][name][final_fold],
            calibration_path,
            str(policy["selection_month"]),
            list(policy["calibrator_fit_days"]),
            list(policy["policy_selection_days"]),
        )
        for name in names
    }
    left, right = (values[name] for name in names)
    for field in ("target", "weight", "band", "distance", "timestamp"):
        if not np.array_equal(left[field], right[field]):
            raise Phase2Error(f"A6 component selection rows differ: {field}")
    step = float(policy["left_weight_grid_step"])
    grid_rows = []
    for value in np.arange(0, 1 + step / 2, step):
        prediction = value * left["prediction"] + (1 - value) * right["prediction"]
        brier = float(
            np.sum(left["weight"] * np.square(prediction - left["target"]))
            / np.sum(left["weight"])
        )
        grid_rows.append({"left_weight": float(value), "weighted_brier": brier})
    selected = min(grid_rows, key=lambda row: (row["weighted_brier"], -row["left_weight"]))
    return {
        "name": policy["name"],
        "left": policy["left"],
        "right": policy["right"],
        "selection_month": policy["selection_month"],
        "calibrator_fit_days": policy["calibrator_fit_days"],
        "policy_selection_days": policy["policy_selection_days"],
        "rows": int(len(left["target"])),
        "opportunities": float(left["weight"].sum()),
        "grid": grid_rows,
        "selected_left_weight": float(selected["left_weight"]),
        "selected_brier": float(selected["weighted_brier"]),
    }


def paired_bootstrap(
    candidate_days: dict[str, np.ndarray],
    reference_days: dict[str, dict[str, float]],
    seed: int,
    repetitions: int,
) -> dict[str, float]:
    days = sorted(candidate_days)
    if set(days) != set(reference_days):
        raise Phase2Error("paired-day inventories differ")
    rows = []
    for day in days:
        candidate = candidate_days[day]
        reference = reference_days[day]
        if not math.isclose(
            float(candidate[0]), float(reference["opportunities"]), rel_tol=1e-10, abs_tol=1e-6
        ):
            raise Phase2Error(f"paired-day opportunities differ: {day}")
        rows.append(
            [
                float(candidate[0]),
                float(candidate[1]),
                float(reference["weighted_brier"]) * float(candidate[0]),
            ]
        )
    matrix = np.asarray(rows, dtype=np.float64)
    rng = np.random.default_rng(seed)
    differences = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sampled = matrix[rng.integers(0, len(matrix), len(matrix))].sum(axis=0)
        differences[index] = (sampled[1] - sampled[2]) / sampled[0]
    return {
        "lower_95": float(np.quantile(differences, 0.025)),
        "median": float(np.quantile(differences, 0.5)),
        "upper_95": float(np.quantile(differences, 0.975)),
    }


def reference_days(
    phase1_evaluation: dict[str, Any],
    phase1_conditional: dict[str, Any],
    name: str,
) -> dict[str, dict[str, float]]:
    if name == "B2_frozen_v3":
        rows = phase1_evaluation["metrics"]["A4_recent_cycle:calibrated"]["slices"]["day"]
        return {
            row["key"]: {
                "opportunities": float(row["opportunities"]),
                "weighted_brier": float(row["b2_brier"]),
            }
            for row in rows
        }
    if name == "A6_recent_recency_blend":
        rows = phase1_conditional["metrics"][name]["slices"]["day"]
        return {
            row["key"]: {
                "opportunities": float(row["opportunities"]),
                "weighted_brier": float(row["weighted_brier"]),
            }
            for row in rows
        }
    rows = phase1_evaluation["metrics"][f"{name}:calibrated"]["slices"]["day"]
    return {
        row["key"]: {
            "opportunities": float(row["opportunities"]),
            "weighted_brier": float(row["candidate_brier"]),
        }
        for row in rows
    }


def reference_months(
    phase1_evaluation: dict[str, Any],
    phase1_conditional: dict[str, Any],
    name: str,
) -> dict[str, float]:
    if name == "B2_frozen_v3":
        rows = phase1_evaluation["metrics"]["A4_recent_cycle:calibrated"]["slices"]["month"]
        return {row["key"]: float(row["b2_brier"]) for row in rows}
    if name == "A6_recent_recency_blend":
        rows = phase1_conditional["metrics"][name]["slices"]["month"]
        return {row["key"]: float(row["weighted_brier"]) for row in rows}
    rows = phase1_evaluation["metrics"][f"{name}:calibrated"]["slices"]["month"]
    return {row["key"]: float(row["candidate_brier"]) for row in rows}


def reference_overall(
    phase1_evaluation: dict[str, Any],
    phase1_conditional: dict[str, Any],
    name: str,
) -> float:
    if name == "B2_frozen_v3":
        return float(
            phase1_evaluation["metrics"]["A4_recent_cycle:calibrated"]["overall"]["b2_brier"]
        )
    if name == "A6_recent_recency_blend":
        return float(phase1_conditional["metrics"][name]["overall"]["weighted_brier"])
    return float(
        phase1_evaluation["metrics"][f"{name}:calibrated"]["overall"]["candidate_brier"]
    )


def evaluation_variant(name: str) -> str:
    if name in {"B2_frozen_v3", "A6_recent_recency_blend"}:
        return name
    return f"{name}:calibrated"


def evaluation_reference_days(
    evaluation: dict[str, Any], name: str
) -> dict[str, dict[str, float]]:
    rows = evaluation["metrics"][evaluation_variant(name)]["slices"]["day"]
    return {
        row["key"]: {
            "opportunities": float(row["opportunities"]),
            "weighted_brier": float(row["weighted_brier"]),
        }
        for row in rows
    }


def evaluation_reference_months(
    evaluation: dict[str, Any], name: str
) -> dict[str, float]:
    rows = evaluation["metrics"][evaluation_variant(name)]["slices"]["month"]
    return {row["key"]: float(row["weighted_brier"]) for row in rows}


def evaluation_reference_overall(evaluation: dict[str, Any], name: str) -> float:
    return float(
        evaluation["metrics"][evaluation_variant(name)]["overall"]["weighted_brier"]
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--scale", type=int, required=True)
    parser.add_argument("--verify-input-hashes", action="store_true")
    args = parser.parse_args()
    del args.profile
    started = time.monotonic()
    config = load_json(Path(args.config))
    validate_config(config)
    runtime = validate_m5_runtime(config)
    arrow = configure_arrow_threads(config, parallel_fit=False)
    scale = int(args.scale)
    if scale not in [int(value) for value in config["sampling"]["scales"]]:
        raise Phase2Error(f"scale is not preregistered: {scale}")
    result_dir = ROOT / "ml/results/propagation_v4_2" / config["run_id"]
    training_path = result_dir / f"training_{scale // 1_000_000}m_results.json"
    manifest_path = (
        ROOT
        / "ml/data/manifests"
        / f"propagation_v4_2_phase2_{scale // 1_000_000}m_cohorts.json"
    )
    training = load_json(training_path)
    manifest = load_json(manifest_path)
    if training["december_2024_read"] or training["locked_2025_read"]:
        raise Phase2Error("training result reports locked outcome access")
    phase2_20m_evaluation = (
        load_json(PHASE2_20M_EVALUATION) if scale == 50_000_000 else None
    )
    candidate_names, fold_names = scale_workset(
        config, scale, phase2_20m_evaluation
    )
    final_fold = config["final_fold"]
    if tuple(training["candidates"]) != candidate_names:
        raise Phase2Error("training result has an incomplete candidate inventory")
    if any(
        set(training["candidates"][name]) != set(fold_names)
        for name in candidate_names
    ):
        raise Phase2Error("training result has incomplete rolling folds")

    v3_result = load_json(V3_RESULTS)
    b2_info = v3_result["profiles"]["nowcast"]
    b2 = load_profile("nowcast", b2_info, ROOT)
    prediction_threads = selected_prediction_threads(
        config,
        load_json(PREDICTION_THREAD_BENCHMARK),
        sha256(PREDICTION_THREAD_BENCHMARK),
    )
    b2.model.set_param({"nthread": prediction_threads})
    phase0_inputs = load_json(PHASE0_CONFIG)["diagnosis"]["inputs"]
    evaluation_inputs = {
        month: verify_input(month, phase0_inputs[month], args.verify_input_hashes)
        for month in config["evaluation_months"]
    }
    loaded: dict[str, dict[str, Any]] = {}
    artifacts: dict[str, Any] = {}
    union_features = list(b2.features)
    for name in candidate_names:
        info = training["candidates"][name][final_fold]
        model_path = verify_artifact(info["model"], f"{name} model")
        calibrator_path = verify_artifact(info["calibrator"], f"{name} calibrator")
        model = xgb.Booster()
        model.load_model(model_path)
        model.set_param({"nthread": prediction_threads})
        features = list(map(str, info["features"]))
        union_features.extend(features)
        loaded[name] = {
            "model": model,
            "calibrator": joblib.load(calibrator_path),
            "features": features,
            "best_iteration": int(info["best_iteration"]),
        }
        artifacts[name] = {"model": info["model"], "calibrator": info["calibrator"]}
    union_features = list(dict.fromkeys(union_features))
    has_a6 = {
        str(config["conditional_policy"]["left"]),
        str(config["conditional_policy"]["right"]),
    } <= set(candidate_names)
    a6 = select_a6(config, training, manifest) if has_a6 else None
    variants = [
        "B2_frozen_v3",
        *[f"{name}:raw" for name in candidate_names],
        *[f"{name}:calibrated" for name in candidate_names],
        *(["A6_recent_recency_blend"] if has_a6 else []),
    ]
    dimensions = ("month", "day", "band", "distance", "month_band")
    overall = {name: np.zeros(STAT_SIZE, dtype=np.float64) for name in variants}
    groups = {
        name: {
            dimension: defaultdict(lambda: np.zeros(STAT_SIZE, dtype=np.float64))
            for dimension in dimensions
        }
        for name in variants
    }
    calibration = {
        name: (
            np.zeros(CALIBRATION_BINS, dtype=np.float64),
            np.zeros(CALIBRATION_BINS, dtype=np.float64),
            np.zeros(CALIBRATION_BINS, dtype=np.float64),
        )
        for name in variants
    }
    projection = list(
        dict.fromkeys(
            [
                *union_features,
                "target_hour",
                "band",
                "dist_km",
                "success_rate",
                "opportunities",
            ]
        )
    )
    scored_rows = 0
    for month in config["evaluation_months"]:
        path = ROOT / evaluation_inputs[month]["path"]
        scanner = ds.dataset(path, format="parquet").scanner(
            columns=projection, batch_size=100_000, use_threads=True
        )
        month_rows = 0
        for batch in scanner.to_batches():
            columns = {name: numeric(batch, name) for name in union_features}
            target = numeric(batch, "success_rate", np.float64)
            weight = numeric(batch, "opportunities", np.float64)
            bands = text_labels(batch, "band")
            distance = numeric(batch, "dist_km", np.float64)
            days = date_labels(batch, "target_hour")
            if any(not value.startswith(month) for value in np.unique(days)):
                raise Phase2Error(f"evaluation file contains rows outside {month}")
            labels = {
                "month": np.full(len(target), month, dtype="<U7"),
                "day": days,
                "band": bands,
                "distance": distance_labels(distance),
            }
            labels["month_band"] = np.char.add(np.char.add(labels["month"], "|"), bands)
            grouping = {name: indices(value) for name, value in labels.items()}
            _, b2_prediction = b2.predict(columns, bands)
            predictions: dict[str, np.ndarray] = {
                "B2_frozen_v3": b2_prediction.astype(np.float64)
            }
            calibrated: dict[str, np.ndarray] = {}
            matrix_cache: dict[tuple[str, ...], np.ndarray] = {}
            for name in candidate_names:
                info = loaded[name]
                raw = info["model"].inplace_predict(
                    cached_feature_matrix(
                        matrix_cache, columns, info["features"]
                    ),
                    iteration_range=(0, info["best_iteration"] + 1),
                ).astype(np.float64)
                calibrated[name] = info["calibrator"].predict(raw, bands, distance).astype(
                    np.float64
                )
                predictions[f"{name}:raw"] = raw
                predictions[f"{name}:calibrated"] = calibrated[name]
            if a6 is not None:
                left_weight = float(a6["selected_left_weight"])
                predictions["A6_recent_recency_blend"] = (
                    left_weight * calibrated[a6["left"]]
                    + (1 - left_weight) * calibrated[a6["right"]]
                )
            for name, prediction in predictions.items():
                values = contributions(target, prediction, weight)
                overall[name] += np.asarray(
                    [value.sum() for value in values], dtype=np.float64
                )
                for dimension in dimensions:
                    add_group(groups[name][dimension], grouping[dimension], values)
                update_calibration(calibration[name], target, prediction, weight)
            month_rows += len(target)
        evaluation_inputs[month]["rows"] = month_rows
        scored_rows += month_rows
        print(f"scored {month}: {month_rows:,} rows", flush=True)

    metrics = {
        name: {
            "overall": {
                **stats_result(overall[name]),
                **calibration_result(*calibration[name]),
            },
            "slices": {
                dimension: [
                    {"key": key, **stats_result(stats)}
                    for key, stats in sorted(groups[name][dimension].items())
                ]
                for dimension in dimensions
            },
        }
        for name in variants
    }
    phase1_evaluation = load_json(PHASE1_EVALUATION)
    phase1_conditional = load_json(PHASE1_CONDITIONAL)
    repetitions = int(config["conditional_policy"]["bootstrap_repetitions"])
    seed = int(config["seed"])
    selection_rows = []
    compared_names = [
        *candidate_names,
        *(["A6_recent_recency_blend"] if has_a6 else []),
    ]
    for index, name in enumerate(compared_names):
        variant = name if name.startswith("A6") else f"{name}:calibrated"
        month_rows = {
            row["key"]: row for row in metrics[variant]["slices"]["month"]
        }
        b2_months = reference_months(
            phase1_evaluation, phase1_conditional, "B2_frozen_v3"
        )
        if phase2_20m_evaluation is None:
            prior_months = reference_months(
                phase1_evaluation, phase1_conditional, name
            )
            prior_brier = reference_overall(
                phase1_evaluation, phase1_conditional, name
            )
            prior_days = reference_days(
                phase1_evaluation, phase1_conditional, name
            )
            prior_scale = 5_000_000
        else:
            prior_months = evaluation_reference_months(
                phase2_20m_evaluation, name
            )
            prior_brier = evaluation_reference_overall(
                phase2_20m_evaluation, name
            )
            prior_days = evaluation_reference_days(phase2_20m_evaluation, name)
            prior_scale = 20_000_000
        evaluation_brier = float(metrics[variant]["overall"]["weighted_brier"])
        b2_brier = reference_overall(
            phase1_evaluation, phase1_conditional, "B2_frozen_v3"
        )
        b2_interval = paired_bootstrap(
            groups[variant]["day"],
            reference_days(phase1_evaluation, phase1_conditional, "B2_frozen_v3"),
            seed + index * 2,
            repetitions,
        )
        prior_interval = paired_bootstrap(
            groups[variant]["day"],
            prior_days,
            seed + index * 2 + 1,
            repetitions,
        )
        row = {
            "candidate": name,
            "evaluation_brier": evaluation_brier,
            "b2_brier": b2_brier,
            "reference_scale": prior_scale,
            "reference_brier": prior_brier,
            "delta_vs_b2": evaluation_brier - b2_brier,
            "relative_gap_to_b2": (evaluation_brier - b2_brier) / b2_brier,
            "month_deltas_vs_b2": {
                month: month_rows[month]["weighted_brier"] - b2_months[month]
                for month in config["evaluation_months"]
            },
            "bootstrap_vs_b2": b2_interval,
            "bootstrap_upper_vs_b2": b2_interval["upper_95"],
            "delta_vs_reference": evaluation_brier - prior_brier,
            "relative_improvement_vs_reference": 1 - evaluation_brier / prior_brier,
            "month_deltas_vs_reference": {
                month: month_rows[month]["weighted_brier"] - prior_months[month]
                for month in config["evaluation_months"]
            },
            "bootstrap_vs_reference": prior_interval,
            "bootstrap_upper_vs_reference": prior_interval["upper_95"],
        }
        if scale == 20_000_000:
            row.update(
                {
                    "phase1_5m_brier": prior_brier,
                    "delta_vs_5m": row["delta_vs_reference"],
                    "relative_improvement_vs_5m": row[
                        "relative_improvement_vs_reference"
                    ],
                    "month_deltas_vs_5m": row["month_deltas_vs_reference"],
                    "bootstrap_vs_5m": prior_interval,
                    "bootstrap_upper_vs_5m": prior_interval["upper_95"],
                }
            )
        else:
            row.update(
                {
                    "phase2_20m_brier": prior_brier,
                    "delta_vs_20m": row["delta_vs_reference"],
                    "relative_improvement_vs_20m": row[
                        "relative_improvement_vs_reference"
                    ],
                    "month_deltas_vs_20m": row["month_deltas_vs_reference"],
                    "bootstrap_vs_20m": prior_interval,
                    "bootstrap_upper_vs_20m": prior_interval["upper_95"],
                }
            )
        selection_rows.append(row)
    component_rows = [row for row in selection_rows if row["candidate"] in candidate_names]
    a6_row = next(
        (
            row
            for row in selection_rows
            if row["candidate"] == "A6_recent_recency_blend"
        ),
        None,
    )
    advancement = config["advancement"]
    advance = (
        select_50m_components(
            component_rows,
            a6_row=a6_row,
            maximum=int(advancement["maximum_50m_components"]),
            maximum_relative_gap=float(advancement["maximum_relative_gap_to_b2"]),
        )
        if scale == 20_000_000
        else list(candidate_names)
    )
    rolling = {
        name: {
            "folds": [
                {
                    "fold": fold,
                    "early_stopping_month": training["candidates"][name][fold][
                        "early_stopping_month"
                    ],
                    "best_iteration": training["candidates"][name][fold]["best_iteration"],
                    "best_score": training["candidates"][name][fold]["best_score"],
                }
                for fold in fold_names
            ],
            "best_iteration_range": (
                max(
                    int(training["candidates"][name][fold]["best_iteration"])
                    for fold in fold_names
                )
                - min(
                    int(training["candidates"][name][fold]["best_iteration"])
                    for fold in fold_names
                )
            ),
        }
        for name in candidate_names
    }
    hundred_million = None
    final_candidate = None
    if scale == 50_000_000:
        final_candidate = select_final_candidate(
            selection_rows,
            float(advancement["maximum_relative_gap_to_b2"]),
        )
        hundred_million = {}
        for row in component_rows:
            evidence = {
                "relative_improvement_20m_to_50m": row[
                    "relative_improvement_vs_20m"
                ],
                "residual_supports_variance_or_rare_regime": False,
                "beats_b2_consistently": is_robust_b2_win(row),
                "compute_fits": True,
                "inference_compatible": True,
                "december_2024_read": False,
            }
            approved, reasons = decide_100m(
                evidence,
                float(
                    advancement[
                        "minimum_20m_to_50m_relative_improvement_for_100m"
                    ]
                ),
            )
            hundred_million[row["candidate"]] = {
                "approved": approved,
                "reasons": reasons,
                "evidence": evidence,
                "note": "Residual-support gate remains conservative until the Phase 2 report review.",
            }
    memory = peak_rss_gb()
    output = {
        "schema_version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_id": config["run_id"],
        "scale": scale,
        "scope": "observed_2024_phase2_evaluation",
        "december_2024_read": False,
        "locked_2025_read": False,
        "evaluation_months": config["evaluation_months"],
        "evaluation_inputs": evaluation_inputs,
        "candidate_artifacts": artifacts,
        "rows": scored_rows,
        "metrics": metrics,
        "a6_policy_selection": a6,
        "rolling_early_stopping_sensitivity": rolling,
        "selection": {
            "rows": selection_rows,
            "advance_to_50m": advance,
            "maximum_components": int(advancement["maximum_50m_components"]),
            "robust_b2_rule": advancement["robust_b2_rule"],
            "learning_rule": advancement["learning_rule"],
        },
        "hundred_million_decision": hundred_million,
        "final_candidate_selection": final_candidate,
        "training_result": training_path.relative_to(ROOT).as_posix(),
        "cohort_manifest": manifest_path.relative_to(ROOT).as_posix(),
        "compute": {
            **runtime,
            **arrow,
            "profile": "m5",
            "wall_seconds": time.monotonic() - started,
            "peak_rss_gb": memory,
            "maximum_rss_gb": float(config["compute"]["maximum_rss_gb"]),
            "memory_limit_respected": memory
            <= float(config["compute"]["maximum_rss_gb"]),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "xgboost": xgb.__version__,
            "xgboost_prediction_threads": prediction_threads,
        },
    }
    output_path = result_dir / f"evaluation_{scale // 1_000_000}m_results.json"
    atomic_write(output_path, output)
    print(output_path)


if __name__ == "__main__":
    main()
