#!/usr/bin/env python3
"""Select Phase 1 A6/A7 on August and score the frozen policies on M5."""

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
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(V4))
sys.path.insert(0, str(MODULE))

from phase1_core import Phase1Error, validate_config  # noqa: E402
from train_validation import fit_calibrators, load_predictions  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase1_5m.json"
RESULT = ROOT / "ml/results/propagation_v4_2/propagation_v4_2_phase1_5m"
TRAINING_RESULT = RESULT / "training_results.json"
EVALUATION_RESULT = RESULT / "evaluation_results.json"
COHORT_MANIFEST = ROOT / "ml/data/manifests/propagation_v4_2_phase1_5m_cohorts.json"
OUTPUT = RESULT / "conditional_results.json"
POLICIES = ("A6_recent_recency_blend", "A7_60m_specialist")
STAT_SIZE = 4
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


def verify_artifact(item: dict[str, Any]) -> dict[str, Any]:
    path = ROOT / item["path"]
    if path.stat().st_size != int(item["bytes"]):
        raise Phase1Error(f"model artifact size changed: {item['path']}")
    digest = sha256(path)
    if digest != item["sha256"]:
        raise Phase1Error(f"model artifact hash changed: {item['path']}")
    return {
        "path": item["path"],
        "bytes": item["bytes"],
        "sha256": digest,
        "sha256_verified_this_run": True,
    }


def verify_input(month: str, item: dict[str, Any], verify_hash: bool) -> dict[str, Any]:
    path = ROOT / item["path"]
    if path.stat().st_size != int(item["bytes"]):
        raise Phase1Error(f"evaluation input size changed: {month}")
    digest = sha256(path) if verify_hash else str(item["sha256"])
    if digest != item["sha256"]:
        raise Phase1Error(f"evaluation input hash changed: {month}")
    return {
        "path": item["path"],
        "bytes": item["bytes"],
        "sha256": digest,
        "sha256_verified_this_run": verify_hash,
        "rows": item.get("rows"),
    }


def feature_matrix(
    columns: dict[str, np.ndarray], features: list[str]
) -> np.ndarray:
    missing = [name for name in features if name not in columns]
    if missing:
        raise Phase1Error(f"conditional input is missing features: {missing}")
    return np.column_stack(
        [np.asarray(columns[name], dtype=np.float32) for name in features]
    )


def numeric(batch: Any, name: str, dtype: Any = np.float32) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        column = pc.fill_null(column, 0)
    return np.asarray(column.to_numpy(zero_copy_only=False), dtype=dtype)


def indices(labels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return np.unique(np.asarray(labels).astype(str), return_inverse=True)


def add_group(
    totals: dict[str, np.ndarray],
    grouping: tuple[np.ndarray, np.ndarray],
    contributions: tuple[np.ndarray, ...],
) -> None:
    values, inverse = grouping
    columns = [
        np.bincount(inverse, weights=value, minlength=len(values))
        for value in contributions
    ]
    for index, label in enumerate(values):
        totals[str(label)] += np.asarray(
            [column[index] for column in columns], dtype=np.float64
        )


def distance_labels(distance: np.ndarray) -> np.ndarray:
    labels = np.full(len(distance), "out-of-range", dtype="<U18")
    for lower, upper in DISTANCE_BINS:
        labels[(distance >= lower) & (distance < upper)] = f"{lower}-{upper} km"
    return labels


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


def weighted_brier(
    target: np.ndarray,
    prediction: np.ndarray,
    weight: np.ndarray,
) -> float:
    return float(np.sum(weight * np.square(prediction - target)) / np.sum(weight))


def day_numbers(timestamps: np.ndarray) -> np.ndarray:
    values = timestamps.astype("datetime64[us]")
    return (
        values.astype("datetime64[D]") - values.astype("datetime64[M]")
    ).astype(np.int16) + 1


def selected_calibration_predictions(
    name: str,
    info: dict[str, Any],
    calibration_path: Path,
    month: str,
    fit_days: list[int],
    select_days: list[int],
) -> dict[str, np.ndarray]:
    verify_artifact(info["model"])
    model = xgb.Booster()
    model.load_model(ROOT / info["model"]["path"])
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
        raise Phase1Error("invalid conditional calibration day split")
    bundles = fit_calibrators(
        values[0][fit],
        values[1][fit],
        values[2][fit],
        values[3][fit],
        values[5][fit],
    )
    bundle = next(
        (value for value in bundles if value.method == info["calibration_method"]),
        None,
    )
    if bundle is None:
        raise Phase1Error(f"calibration method unavailable for {name}")
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
    del values, model, bundles, bundle
    gc.collect()
    return output


def same_selection_rows(
    left: dict[str, np.ndarray], right: dict[str, np.ndarray]
) -> bool:
    return all(
        np.array_equal(left[name], right[name])
        for name in ("target", "weight", "band", "distance", "timestamp")
    )


def select_policies(
    config: dict[str, Any],
    training: dict[str, Any],
    cohorts: dict[str, Any],
) -> dict[str, Any]:
    followups = config["conditional_followups"]
    month = str(followups["selection_month"])
    calibration_item = cohorts["calibration"]
    calibration_path = ROOT / calibration_item["path"]
    if calibration_path.stat().st_size != int(calibration_item["bytes"]):
        raise Phase1Error("calibration sample size changed")
    if sha256(calibration_path) != calibration_item["sha256"]:
        raise Phase1Error("calibration sample hash changed")
    names = {
        followups["A6_recent_recency_blend"]["left"],
        followups["A6_recent_recency_blend"]["right"],
        followups["A7_60m_specialist"]["default"],
        followups["A7_60m_specialist"]["specialist"],
    }
    predictions = {
        name: selected_calibration_predictions(
            name,
            training["candidates"][name],
            calibration_path,
            month,
            list(followups["calibrator_fit_days"]),
            list(followups["policy_selection_days"]),
        )
        for name in sorted(names)
    }
    reference = next(iter(predictions.values()))
    if not all(same_selection_rows(reference, value) for value in predictions.values()):
        raise Phase1Error("candidate calibration rows do not align")

    blend = followups["A6_recent_recency_blend"]
    left = predictions[blend["left"]]["prediction"]
    right = predictions[blend["right"]]["prediction"]
    target = reference["target"]
    weight = reference["weight"]
    step = float(blend["left_weight_grid_step"])
    grid = np.arange(0, 1 + step / 2, step)
    grid_rows = [
        {
            "left_weight": float(value),
            "weighted_brier": weighted_brier(
                target, value * left + (1 - value) * right, weight
            ),
        }
        for value in grid
    ]
    selected_blend = min(
        grid_rows,
        key=lambda row: (row["weighted_brier"], -row["left_weight"]),
    )

    router = followups["A7_60m_specialist"]
    default = predictions[router["default"]]["prediction"]
    specialist = predictions[router["specialist"]]["prediction"]
    bands = reference["band"]
    routed_bands: list[str] = []
    band_rows = []
    for band in router["eligible_bands"]:
        mask = bands == band
        opportunities = float(weight[mask].sum())
        default_brier = weighted_brier(target[mask], default[mask], weight[mask])
        specialist_brier = weighted_brier(
            target[mask], specialist[mask], weight[mask]
        )
        qualifies = (
            opportunities >= float(router["minimum_selection_opportunities"])
            and specialist_brier < default_brier
        )
        if qualifies:
            routed_bands.append(str(band))
        band_rows.append(
            {
                "band": str(band),
                "opportunities": opportunities,
                "default_brier": default_brier,
                "specialist_brier": specialist_brier,
                "specialist_minus_default_brier": specialist_brier - default_brier,
                "qualifies": qualifies,
            }
        )
    return {
        "month": month,
        "calibrator_fit_days": followups["calibrator_fit_days"],
        "policy_selection_days": followups["policy_selection_days"],
        "rows": int(len(target)),
        "opportunities": float(weight.sum()),
        "calibration_sample": {
            "path": calibration_item["path"],
            "bytes": calibration_item["bytes"],
            "sha256": calibration_item["sha256"],
            "sha256_verified_this_run": True,
        },
        "A6_recent_recency_blend": {
            "left": blend["left"],
            "right": blend["right"],
            "grid": grid_rows,
            "selected_left_weight": selected_blend["left_weight"],
            "selected_brier": selected_blend["weighted_brier"],
        },
        "A7_60m_specialist": {
            "default": router["default"],
            "specialist": router["specialist"],
            "eligible_bands": router["eligible_bands"],
            "routed_bands": routed_bands,
            "minimum_selection_opportunities": router[
                "minimum_selection_opportunities"
            ],
            "comparison": band_rows,
        },
    }


def stats_result(stats: np.ndarray) -> dict[str, Any]:
    if stats[0] <= 0:
        raise Phase1Error("conditional metric group has no opportunity mass")
    return {
        "opportunities": float(stats[0]),
        "weighted_brier": float(stats[1] / stats[0]),
        "rows": int(stats[2]),
        "positive_mass": float(stats[3]),
    }


def baseline_rows(
    evaluation: dict[str, Any], baseline: str, dimension: str
) -> dict[str, dict[str, Any]]:
    source = evaluation["metrics"]["A0_v3_control:calibrated"]
    field = "b2_brier" if baseline == "B2_frozen_v3" else "candidate_brier"
    if baseline == "A4_recent_cycle":
        source = evaluation["metrics"]["A4_recent_cycle:calibrated"]
    return {
        row["key"]: {
            "opportunities": float(row["opportunities"]),
            "weighted_brier": float(row[field]),
        }
        for row in source["slices"][dimension]
    }


def paired_bootstrap(
    candidate_days: dict[str, np.ndarray],
    baseline_days: dict[str, dict[str, Any]],
    seed: int,
    repetitions: int,
) -> dict[str, float]:
    days = sorted(candidate_days)
    if set(days) != set(baseline_days):
        raise Phase1Error("conditional and baseline day inventories differ")
    matrix = []
    for day in days:
        candidate = candidate_days[day]
        baseline = baseline_days[day]
        if not math.isclose(
            float(candidate[0]),
            float(baseline["opportunities"]),
            rel_tol=1e-10,
            abs_tol=1e-6,
        ):
            raise Phase1Error(f"conditional opportunity mismatch on {day}")
        matrix.append(
            [
                float(candidate[0]),
                float(candidate[1]),
                float(baseline["weighted_brier"]) * float(candidate[0]),
            ]
        )
    values = np.asarray(matrix, dtype=np.float64)
    rng = np.random.default_rng(seed)
    differences = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sampled = values[rng.integers(0, len(values), len(values))].sum(axis=0)
        differences[index] = (sampled[1] - sampled[2]) / sampled[0]
    return {
        "lower_95": float(np.quantile(differences, 0.025)),
        "median": float(np.quantile(differences, 0.5)),
        "upper_95": float(np.quantile(differences, 0.975)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--verify-input-hashes", action="store_true")
    args = parser.parse_args()
    del args.profile
    started = time.monotonic()
    config = load_json(Path(args.config))
    validate_config(config)
    training = load_json(TRAINING_RESULT)
    evaluation = load_json(EVALUATION_RESULT)
    cohorts = load_json(COHORT_MANIFEST)
    if evaluation["december_2024_read"] or evaluation["locked_2025_read"]:
        raise Phase1Error("conditional scorer received a locked outcome result")

    selection = select_policies(config, training, cohorts)
    followups = config["conditional_followups"]
    required_names = sorted(
        {
            followups["A6_recent_recency_blend"]["left"],
            followups["A6_recent_recency_blend"]["right"],
            followups["A7_60m_specialist"]["default"],
            followups["A7_60m_specialist"]["specialist"],
        }
    )
    loaded: dict[str, dict[str, Any]] = {}
    artifacts: dict[str, dict[str, Any]] = {}
    union_features: list[str] = []
    for name in required_names:
        info = training["candidates"][name]
        artifacts[name] = {
            kind: verify_artifact(info[kind]) for kind in ("model", "calibrator")
        }
        model = xgb.Booster()
        model.load_model(ROOT / info["model"]["path"])
        features = [str(value) for value in info["features"]]
        union_features.extend(features)
        loaded[name] = {
            "model": model,
            "calibrator": joblib.load(ROOT / info["calibrator"]["path"]),
            "features": features,
            "best_iteration": int(info["best_iteration"]),
        }
    union_features = list(dict.fromkeys(union_features))
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
    evaluation_inputs = {
        month: verify_input(
            month, evaluation["evaluation_inputs"][month], args.verify_input_hashes
        )
        for month in evaluation["evaluation_months"]
    }

    dimensions = ("month", "day", "band", "distance", "month_band")
    overall = {name: np.zeros(STAT_SIZE, dtype=np.float64) for name in POLICIES}
    groups = {
        name: {
            dimension: defaultdict(lambda: np.zeros(STAT_SIZE, dtype=np.float64))
            for dimension in dimensions
        }
        for name in POLICIES
    }
    blend = selection["A6_recent_recency_blend"]
    blend_weight = float(blend["selected_left_weight"])
    router = selection["A7_60m_specialist"]
    routed_bands = set(router["routed_bands"])
    scored_rows = 0
    for month in evaluation["evaluation_months"]:
        path = ROOT / evaluation_inputs[month]["path"]
        scanner = ds.dataset(path, format="parquet").scanner(
            columns=projection,
            batch_size=100_000,
            use_threads=True,
        )
        month_rows = 0
        for batch in scanner.to_batches():
            columns = {name: numeric(batch, name) for name in union_features}
            target = numeric(batch, "success_rate", np.float64)
            weight = numeric(batch, "opportunities", np.float64)
            bands = np.asarray(batch.column("band").to_pylist(), dtype=str)
            distance = numeric(batch, "dist_km", np.float64)
            days = np.asarray(
                pc.strftime(batch.column("target_hour"), format="%Y-%m-%d").to_pylist(),
                dtype=str,
            )
            labels = {
                "month": np.full(len(target), month, dtype="<U7"),
                "day": days,
                "band": bands,
                "distance": distance_labels(distance),
            }
            labels["month_band"] = np.char.add(
                np.char.add(labels["month"], "|"), bands
            )
            grouping = {name: indices(value) for name, value in labels.items()}
            candidate_predictions: dict[str, np.ndarray] = {}
            for name, info in loaded.items():
                raw = info["model"].inplace_predict(
                    feature_matrix(columns, info["features"]),
                    iteration_range=(0, info["best_iteration"] + 1),
                )
                candidate_predictions[name] = info["calibrator"].predict(
                    raw, bands, distance
                ).astype(np.float64)
            policy_predictions = {
                "A6_recent_recency_blend": (
                    blend_weight * candidate_predictions[blend["left"]]
                    + (1 - blend_weight) * candidate_predictions[blend["right"]]
                ),
                "A7_60m_specialist": np.where(
                    np.isin(bands, list(routed_bands)),
                    candidate_predictions[router["specialist"]],
                    candidate_predictions[router["default"]],
                ),
            }
            for name, prediction in policy_predictions.items():
                contributions = (
                    weight,
                    weight * np.square(prediction - target),
                    np.ones(len(target), dtype=np.float64),
                    weight * target,
                )
                overall[name] += np.asarray(
                    [value.sum() for value in contributions], dtype=np.float64
                )
                for dimension in dimensions:
                    add_group(
                        groups[name][dimension], grouping[dimension], contributions
                    )
            month_rows += len(target)
        evaluation_inputs[month]["rows"] = month_rows
        scored_rows += month_rows
        print(f"scored conditional {month}: {month_rows:,} rows", flush=True)

    metrics = {
        name: {
            "overall": stats_result(overall[name]),
            "slices": {
                dimension: [
                    {"key": key, **stats_result(stats)}
                    for key, stats in sorted(groups[name][dimension].items())
                ]
                for dimension in dimensions
            },
        }
        for name in POLICIES
    }
    baselines = ("A4_recent_cycle", "A0_v3_control", "B2_frozen_v3")
    repetitions = int(followups["bootstrap_repetitions"])
    comparisons: dict[str, Any] = {}
    for policy_index, name in enumerate(POLICIES):
        policy_months = {
            row["key"]: row for row in metrics[name]["slices"]["month"]
        }
        policy_result: dict[str, Any] = {}
        for baseline_index, baseline in enumerate(baselines):
            baseline_overall_source = evaluation["metrics"][
                "A4_recent_cycle:calibrated"
                if baseline == "A4_recent_cycle"
                else "A0_v3_control:calibrated"
            ]["overall"]
            baseline_field = (
                "b2_brier" if baseline == "B2_frozen_v3" else "candidate_brier"
            )
            baseline_overall = float(baseline_overall_source[baseline_field])
            baseline_months = baseline_rows(evaluation, baseline, "month")
            policy_result[baseline] = {
                "delta_brier": metrics[name]["overall"]["weighted_brier"]
                - baseline_overall,
                "month_deltas": {
                    month: policy_months[month]["weighted_brier"]
                    - baseline_months[month]["weighted_brier"]
                    for month in evaluation["evaluation_months"]
                },
                "paired_day_bootstrap": paired_bootstrap(
                    groups[name]["day"],
                    baseline_rows(evaluation, baseline, "day"),
                    int(config["seed"]) + policy_index * 10 + baseline_index,
                    repetitions,
                ),
            }
        comparisons[name] = policy_result
    advance = [
        name
        for name in POLICIES
        if all(
            value < 0
            for value in comparisons[name]["A4_recent_cycle"][
                "month_deltas"
            ].values()
        )
        and comparisons[name]["A4_recent_cycle"]["paired_day_bootstrap"][
            "upper_95"
        ]
        < 0
    ]
    memory = peak_rss_gb()
    output = {
        "schema_version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_id": config["run_id"],
        "scope": "observed_2024_phase1_conditional_followup",
        "selection_basis": (
            "A6/A7 families were triggered by October/November diagnostics; "
            "policy parameters were selected only on cross-fitted August days 21-end."
        ),
        "december_2024_read": False,
        "locked_2025_read": False,
        "evaluation_months": evaluation["evaluation_months"],
        "evaluation_inputs": evaluation_inputs,
        "candidate_artifacts": artifacts,
        "rows": scored_rows,
        "policy_selection": selection,
        "metrics": metrics,
        "comparisons": comparisons,
        "advance_conditional_policy": advance,
        "rule": "Beat A4 in both months with paired-day upper 95% below zero.",
        "compute": {
            "profile": "m5",
            "wall_seconds": time.monotonic() - started,
            "peak_rss_gb": memory,
            "maximum_rss_gb": float(config["compute"]["maximum_rss_gb"]),
            "memory_limit_respected": memory
            <= float(config["compute"]["maximum_rss_gb"]),
            "python": platform.python_version(),
            "numpy": np.__version__,
            "xgboost": xgb.__version__,
        },
    }
    atomic_write(OUTPUT, output)
    print(OUTPUT)


if __name__ == "__main__":
    main()
