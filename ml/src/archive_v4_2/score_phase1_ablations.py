#!/usr/bin/env python3
"""Score all Phase 1 ablations in one bounded October/November stream."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import resource
import sys
import tempfile
import time
from collections import defaultdict
from itertools import combinations
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb


ROOT = Path(__file__).resolve().parents[3]
V4_1 = ROOT / "ml/src/archive_v4_1"
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(V4_1))
sys.path.insert(0, str(MODULE))

from b2_adapter import feature_matrix, load_profile  # noqa: E402
from phase1_core import (  # noqa: E402
    EXPECTED_CANDIDATES,
    Phase1Error,
    select_advancement,
    validate_config,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase1_5m.json"
TRAINING_RESULT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase1_5m/training_results.json"
)
OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase1_5m/evaluation_results.json"
)
V3_RESULTS = ROOT / "ml/results/archive_v3/archive_v3_eight_month/hf_results.json"
PHASE0_CONFIG = ROOT / "ml/config/propagation_v4_2.json"
DISTANCE_BINS = (
    (0, 500),
    (500, 1_500),
    (1_500, 3_000),
    (3_000, 6_000),
    (6_000, 10_000),
    (10_000, 25_000),
)
STAT_SIZE = 5
PAIR_STAT_SIZE = 4


def peak_rss_gb() -> float:
    """Return process peak RSS in GiB on macOS and Linux."""
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    divisor = 1024**3 if sys.platform == "darwin" else 1024**2
    return float(value / divisor)


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
    size = len(values)
    columns = [
        np.bincount(inverse, weights=value, minlength=size)
        for value in contributions
    ]
    for index, label in enumerate(values):
        totals[str(label)] += np.asarray(
            [column[index] for column in columns], dtype=np.float64
        )


def stats_result(stats: np.ndarray) -> dict[str, Any]:
    if stats[0] <= 0:
        raise ValueError("metric group has no opportunity mass")
    b2 = stats[1] / stats[0]
    candidate = stats[2] / stats[0]
    return {
        "opportunities": float(stats[0]),
        "rows": int(stats[3]),
        "positive_mass": float(stats[4]),
        "b2_brier": float(b2),
        "candidate_brier": float(candidate),
        "candidate_minus_b2_brier": float(candidate - b2),
        "candidate_relative_brier_improvement_vs_b2": float(1 - candidate / b2),
    }


def bootstrap_difference(
    candidate: dict[str, np.ndarray],
    reference: dict[str, np.ndarray],
    seed: int,
    repetitions: int,
) -> dict[str, float]:
    days = sorted(set(candidate) & set(reference))
    if len(days) < 2:
        raise Phase1Error("paired bootstrap requires at least two common days")
    matrix = np.asarray(
        [
            [candidate[day][0], candidate[day][2], reference[day][2]]
            for day in days
        ],
        dtype=np.float64,
    )
    rng = np.random.default_rng(seed)
    values = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sampled = matrix[rng.integers(0, len(matrix), len(matrix))].sum(axis=0)
        values[index] = (sampled[1] - sampled[2]) / sampled[0]
    return {
        "lower_95": float(np.quantile(values, 0.025)),
        "median": float(np.quantile(values, 0.5)),
        "upper_95": float(np.quantile(values, 0.975)),
    }


def blend_diagnostic(stats: np.ndarray) -> dict[str, float]:
    opportunities, left_sse, right_sse, cross = map(float, stats)
    denominator = left_sse + right_sse - 2 * cross
    if opportunities <= 0:
        raise Phase1Error("pairwise diagnostic has no opportunity mass")
    if denominator <= 0:
        left_weight = 0.5
    else:
        left_weight = min(1.0, max(0.0, (right_sse - cross) / denominator))
    blend_sse = (
        left_weight**2 * left_sse
        + (1 - left_weight) ** 2 * right_sse
        + 2 * left_weight * (1 - left_weight) * cross
    )
    left_brier = left_sse / opportunities
    right_brier = right_sse / opportunities
    blend_brier = blend_sse / opportunities
    residual_correlation = (
        cross / np.sqrt(left_sse * right_sse)
        if left_sse > 0 and right_sse > 0
        else 0.0
    )
    return {
        "opportunities": opportunities,
        "left_brier": left_brier,
        "right_brier": right_brier,
        "residual_correlation": float(residual_correlation),
        "optimal_left_weight": left_weight,
        "optimal_blend_brier": blend_brier,
        "improvement_vs_better_component": min(left_brier, right_brier)
        - blend_brier,
    }


def distance_labels(distance: np.ndarray) -> np.ndarray:
    labels = np.full(len(distance), "out-of-range", dtype="<U18")
    for lower, upper in DISTANCE_BINS:
        labels[(distance >= lower) & (distance < upper)] = f"{lower}-{upper} km"
    return labels


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
        "rows": item["rows"] if "rows" in item else None,
    }


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
    if tuple(training["candidates"]) != EXPECTED_CANDIDATES:
        raise Phase1Error("training result does not contain the exact candidate set")

    v3_result = load_json(V3_RESULTS)
    b2_info = v3_result["profiles"]["nowcast"]
    b2 = load_profile("nowcast", b2_info, ROOT)
    phase0 = load_json(PHASE0_CONFIG)["diagnosis"]["inputs"]
    evaluation_inputs = {
        month: verify_input(month, phase0[month], args.verify_input_hashes)
        for month in config["data_roles"]["evaluation"]
    }

    loaded: dict[str, dict[str, Any]] = {}
    candidate_artifacts: dict[str, dict[str, Any]] = {}
    union_features = list(b2.features)
    for name in EXPECTED_CANDIDATES:
        info = training["candidates"][name]
        candidate_artifacts[name] = {
            kind: verify_artifact(info[kind]) for kind in ("model", "calibrator")
        }
        model = xgb.Booster()
        model.load_model(ROOT / info["model"]["path"])
        calibrator = joblib.load(ROOT / info["calibrator"]["path"])
        features = [str(value) for value in info["features"]]
        union_features.extend(features)
        loaded[name] = {
            "model": model,
            "calibrator": calibrator,
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

    variants = [f"{name}:{kind}" for name in EXPECTED_CANDIDATES for kind in ("raw", "calibrated")]
    overall = {
        variant: np.zeros(STAT_SIZE, dtype=np.float64) for variant in variants
    }
    dimensions = (
        "month",
        "day",
        "band",
        "distance",
        "band_distance",
        "month_band",
        "month_distance",
        "month_band_distance",
    )
    groups = {
        variant: {
            dimension: defaultdict(lambda: np.zeros(STAT_SIZE, dtype=np.float64))
            for dimension in dimensions
        }
        for variant in variants
    }
    pairwise = {
        f"{left}|{right}": {
            "overall": np.zeros(PAIR_STAT_SIZE, dtype=np.float64),
            "month": defaultdict(lambda: np.zeros(PAIR_STAT_SIZE, dtype=np.float64)),
        }
        for left, right in combinations(EXPECTED_CANDIDATES, 2)
    }
    scored_rows = 0
    for month in config["data_roles"]["evaluation"]:
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
            if any(not value.startswith(month) for value in np.unique(days)):
                raise Phase1Error(f"evaluation file contains rows outside {month}")
            b2_raw, b2_prediction = b2.predict(columns, bands)
            del b2_raw
            b2_error = b2_prediction.astype(np.float64) - target
            b2_sse = weight * np.square(b2_error)
            labels = {
                "month": np.full(len(target), month, dtype="<U7"),
                "day": days,
                "band": bands,
                "distance": distance_labels(distance),
            }
            labels["band_distance"] = np.char.add(
                np.char.add(bands, "|"), labels["distance"]
            )
            labels["month_band"] = np.char.add(
                np.char.add(labels["month"], "|"), bands
            )
            labels["month_distance"] = np.char.add(
                np.char.add(labels["month"], "|"), labels["distance"]
            )
            labels["month_band_distance"] = np.char.add(
                np.char.add(labels["month"], "|"), labels["band_distance"]
            )
            grouping = {name: indices(value) for name, value in labels.items()}
            calibrated_errors: dict[str, np.ndarray] = {}
            for name in EXPECTED_CANDIDATES:
                info = loaded[name]
                raw = info["model"].inplace_predict(
                    feature_matrix(columns, info["features"]),
                    iteration_range=(0, info["best_iteration"] + 1),
                )
                calibrated = info["calibrator"].predict(raw, bands, distance)
                for kind, prediction in (("raw", raw), ("calibrated", calibrated)):
                    variant = f"{name}:{kind}"
                    error = prediction.astype(np.float64) - target
                    contributions = (
                        weight,
                        b2_sse,
                        weight * np.square(error),
                        np.ones(len(target), dtype=np.float64),
                        weight * target,
                    )
                    overall[variant] += np.asarray(
                        [value.sum() for value in contributions], dtype=np.float64
                    )
                    for dimension in grouping:
                        add_group(
                            groups[variant][dimension],
                            grouping[dimension],
                            contributions,
                        )
                    if kind == "calibrated":
                        calibrated_errors[name] = error
            for left, right in combinations(EXPECTED_CANDIDATES, 2):
                key = f"{left}|{right}"
                left_error = calibrated_errors[left]
                right_error = calibrated_errors[right]
                contributions = (
                    weight,
                    weight * np.square(left_error),
                    weight * np.square(right_error),
                    weight * left_error * right_error,
                )
                pairwise[key]["overall"] += np.asarray(
                    [value.sum() for value in contributions], dtype=np.float64
                )
                add_group(
                    pairwise[key]["month"],
                    grouping["month"],
                    contributions,
                )
            month_rows += len(target)
        print(f"scored {month}: {month_rows:,} rows", flush=True)
        evaluation_inputs[month]["rows"] = month_rows
        scored_rows += month_rows

    metrics = {
        variant: {
            "overall": stats_result(overall[variant]),
            "slices": {
                dimension: [
                    {"key": key, **stats_result(stats)}
                    for key, stats in sorted(groups[variant][dimension].items())
                ]
                for dimension in dimensions
            },
        }
        for variant in variants
    }
    control_variant = "A0_v3_control:calibrated"
    selection_rows = []
    bootstrap: dict[str, dict[str, float]] = {}
    seed = int(config["seed"])
    for index, name in enumerate(EXPECTED_CANDIDATES):
        variant = f"{name}:calibrated"
        interval = bootstrap_difference(
            groups[variant]["day"],
            groups[control_variant]["day"],
            seed + index,
            2000,
        )
        bootstrap[name] = interval
        month_values = {
            row["key"]: row for row in metrics[variant]["slices"]["month"]
        }
        control_months = {
            row["key"]: row
            for row in metrics[control_variant]["slices"]["month"]
        }
        overall_result = metrics[variant]["overall"]
        control_brier = metrics[control_variant]["overall"]["candidate_brier"]
        selection_rows.append(
            {
                "candidate": name,
                "evaluation_brier": overall_result["candidate_brier"],
                "delta_vs_b2": overall_result["candidate_minus_b2_brier"],
                "delta_vs_a0": overall_result["candidate_brier"] - control_brier,
                "month_deltas_vs_a0": {
                    month: month_values[month]["candidate_brier"]
                    - control_months[month]["candidate_brier"]
                    for month in config["data_roles"]["evaluation"]
                },
                "bootstrap_upper_vs_a0": interval["upper_95"],
                "best_iteration": training["candidates"][name]["best_iteration"],
                "calibration_method": training["candidates"][name][
                    "calibration_method"
                ],
            }
        )
    advancement = select_advancement(selection_rows, maximum=3)
    pairwise_diagnostics = {
        key: {
            "left": key.split("|", 1)[0],
            "right": key.split("|", 1)[1],
            "overall": blend_diagnostic(value["overall"]),
            "months": {
                month: blend_diagnostic(stats)
                for month, stats in sorted(value["month"].items())
            },
        }
        for key, value in pairwise.items()
    }
    v3_curve = next(
        row
        for row in v3_result["profiles"]["nowcast"]["learning_curve"]
        if int(row["train_rows"]) == 5_000_000
    )
    a0_october = next(
        row
        for row in metrics[control_variant]["slices"]["month"]
        if row["key"] == "2024-10"
    )
    peak_memory = peak_rss_gb()
    memory_limit = float(config["compute"]["maximum_rss_gb"])
    result = {
        "schema_version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_id": config["run_id"],
        "scope": "observed_2024_phase1_evaluation",
        "december_2024_read": False,
        "locked_2025_read": False,
        "evaluation_months": config["data_roles"]["evaluation"],
        "evaluation_inputs": evaluation_inputs,
        "candidate_artifacts": candidate_artifacts,
        "rows": scored_rows,
        "metrics": metrics,
        "selection": {
            "rows": selection_rows,
            "advance_to_20m": advancement,
            "rule": "Beat A0 in both months with paired-day upper 95% below zero; at most three.",
        },
        "bootstrap_candidate_minus_a0": bootstrap,
        "pairwise_calibrated_residual_diagnostics": pairwise_diagnostics,
        "a0_reproduction": {
            "original_v3_5m_october_brier": v3_curve["test"]["weighted_brier"],
            "phase1_a0_october_brier": a0_october["candidate_brier"],
            "absolute_delta": a0_october["candidate_brier"]
            - v3_curve["test"]["weighted_brier"],
            "contract_difference": "Phase 1 uses a stable natural top-hash cohort, 1,200-round ceiling, and August calibration; the original curve used a RNG subset of the V3 50M sample, 600 rounds, and July calibration.",
        },
        "training_result": TRAINING_RESULT.relative_to(ROOT).as_posix(),
        "compute": {
            "profile": "m5",
            "wall_seconds": time.monotonic() - started,
            "peak_rss_gb": peak_memory,
            "maximum_rss_gb": memory_limit,
            "memory_limit_respected": peak_memory <= memory_limit,
            "python": platform.python_version(),
            "numpy": np.__version__,
            "xgboost": xgb.__version__,
        },
    }
    atomic_write(OUTPUT, result)
    print(OUTPUT)


if __name__ == "__main__":
    main()
