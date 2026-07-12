#!/usr/bin/env python3
"""Stream a paired V3/B2 versus raw V4/M2 diagnosis over observed 2024 data."""

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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds
import pyarrow.parquet as pq
import xgboost as xgb


ROOT = Path(__file__).resolve().parents[3]
V4_1 = ROOT / "ml/src/archive_v4_1"
sys.path.insert(0, str(V4_1))

from b2_adapter import feature_matrix, load_profile  # noqa: E402

from diagnostic_core import (  # noqa: E402
    STAT_SIZE,
    bootstrap_blend_delta,
    bootstrap_policy_delta,
    empty_stats,
    grouped_stats,
    optimal_b2_weight,
    paired_result,
    rounded_weight,
    row_contributions,
    routed_stats,
    select_band_router,
    select_stable_router,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2.json"
DISTANCE_BINS = (
    (0, 500),
    (500, 1_500),
    (1_500, 3_000),
    (3_000, 6_000),
    (6_000, 10_000),
    (10_000, 25_000),
)
WEATHER_MISSING_SUFFIX = "_missing"


class DiagnosticError(RuntimeError):
    """Raised before a diagnosis would use an invalid artifact or outcome."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=False)
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


def text_column(batch: Any, name: str) -> np.ndarray:
    return np.asarray(batch.column(name).to_pylist(), dtype=str)


def label_distance(distance: np.ndarray) -> np.ndarray:
    labels = np.full(len(distance), "out-of-range", dtype="<U18")
    for lower, upper in DISTANCE_BINS:
        labels[(distance >= lower) & (distance < upper)] = f"{lower}-{upper} km"
    return labels


def label_history(columns: dict[str, np.ndarray]) -> np.ndarray:
    recent = columns["path_prev1_available"] > 0
    day = (~recent) & (columns["path_prev24_available"] > 0)
    return np.select(
        [recent, day],
        ["recent_1h", "recent_24h"],
        default="no_recent_history",
    )


def label_f107(columns: dict[str, np.ndarray]) -> np.ndarray:
    value = columns["f107"]
    missing = columns["f107_missing"] > 0
    return np.select(
        [missing, value < 100, value < 150, value < 200],
        ["missing", "under_100", "100-150", "150-200"],
        default="200_plus",
    )


def label_geomagnetic(columns: dict[str, np.ndarray]) -> np.ndarray:
    value = columns["kp"]
    missing = columns["kp_missing"] > 0
    return np.select(
        [missing, value < 2, value < 4],
        ["missing", "quiet_under_2", "unsettled_2_to_4"],
        default="disturbed_4_plus",
    )


def label_missingness(
    columns: dict[str, np.ndarray], missing_features: list[str]
) -> np.ndarray:
    count = np.zeros(len(next(iter(columns.values()))), dtype=np.int16)
    for feature in missing_features:
        count += columns[feature] > 0
    return np.select(
        [count == 0, count <= 3, count <= 8],
        ["none", "1-3", "4-8"],
        default="9_plus",
    )


def label_receiver_latitude(rx_lat_sin: np.ndarray) -> np.ndarray:
    latitude = np.degrees(np.arcsin(np.clip(rx_lat_sin, -1.0, 1.0)))
    return np.select(
        [latitude < -45, latitude < -15, latitude < 15, latitude < 45],
        ["south_high", "south_mid", "equatorial", "north_mid"],
        default="north_high",
    )


def label_disagreement(b2: np.ndarray, m2: np.ndarray) -> np.ndarray:
    difference = np.abs(m2 - b2)
    return np.select(
        [difference < 0.01, difference < 0.03, difference < 0.10],
        ["under_0.01", "0.01-0.03", "0.03-0.10"],
        default="0.10_plus",
    )


def add_group(
    totals: dict[str, np.ndarray],
    labels: np.ndarray,
    contributions: tuple[np.ndarray, ...],
) -> None:
    for label, stats in grouped_stats(labels, contributions).items():
        totals[label] += stats


def add_month_group(
    totals: dict[tuple[str, str], np.ndarray],
    month: str,
    labels: np.ndarray,
    contributions: tuple[np.ndarray, ...],
) -> None:
    for label, stats in grouped_stats(labels, contributions).items():
        totals[(month, label)] += stats


def sum_keys(totals: dict[str, np.ndarray], keys: list[str]) -> np.ndarray:
    output = empty_stats()
    for key in keys:
        output += totals[key]
    return output


def slice_rows(values: dict[str, np.ndarray]) -> list[dict[str, Any]]:
    return [
        {"key": key, **paired_result(values[key])}
        for key in sorted(values)
        if values[key][0] > 0
    ]


def policy_result(stats: np.ndarray, candidate: str) -> dict[str, Any]:
    base = paired_result(stats)
    return {
        "candidate": candidate,
        "opportunities": base["opportunities"],
        "rows": base["rows"],
        "positive_mass": base["positive_mass"],
        "b2_brier": base["b2_brier"],
        "candidate_brier": base["m2_brier"],
        "candidate_minus_b2_brier": base["m2_minus_b2_brier"],
        "candidate_relative_brier_improvement": base[
            "m2_relative_brier_improvement"
        ],
    }


def routed_daily(
    detailed: dict[str, np.ndarray],
    choices: dict[str, str],
) -> list[np.ndarray]:
    by_day: dict[str, dict[str, np.ndarray]] = defaultdict(dict)
    for composite, stats in detailed.items():
        day, key = composite.split("||", 1)
        by_day[day][key] = stats
    return [routed_stats(by_day[day], choices) for day in sorted(by_day)]


def maximum_rss_gb() -> float:
    value = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    if platform.system() == "Darwin":
        return value / (1024**3)
    return value / (1024**2)


def validate_contract(config: dict[str, Any]) -> list[str]:
    diagnosis = config["diagnosis"]
    months = [
        *diagnosis["development_months"],
        *diagnosis["evaluation_months"],
    ]
    if months != ["2024-02", "2024-04", "2024-05", "2024-08", "2024-10", "2024-11"]:
        raise DiagnosticError("Phase 0 requires the exact six already-observed months")
    forbidden = set(diagnosis["forbidden_months"])
    if forbidden & set(months):
        raise DiagnosticError("diagnosis months overlap a forbidden outcome")
    if set(diagnosis["inputs"]) != set(months):
        raise DiagnosticError("input inventory does not exactly match diagnosis months")
    for month, item in diagnosis["inputs"].items():
        if month.startswith("2025-") or month == "2024-12":
            raise DiagnosticError(f"forbidden outcome in input inventory: {month}")
        path = str(item["path"])
        if "2024-12" in path or "2025-" in path:
            raise DiagnosticError(f"forbidden outcome path in input inventory: {path}")
    return months


def validate_input(path: Path, expected: dict[str, Any], verify_hash: bool) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(path)
    size = path.stat().st_size
    if size != int(expected["bytes"]):
        raise DiagnosticError(f"input size changed: {path}")
    observed_hash = sha256(path) if verify_hash else str(expected["sha256"])
    if observed_hash != expected["sha256"]:
        raise DiagnosticError(f"input checksum changed: {path}")
    metadata = pq.ParquetFile(path).metadata
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": size,
        "sha256": observed_hash,
        "sha256_verified_this_run": verify_hash,
        "rows": metadata.num_rows,
        "row_groups": metadata.num_row_groups,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output")
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--verify-input-hashes", action="store_true")
    args = parser.parse_args()
    del args.profile

    started = time.monotonic()
    config_path = Path(args.config).resolve()
    config = load_json(config_path)
    diagnosis = config["diagnosis"]
    months = validate_contract(config)
    development_months = list(diagnosis["development_months"])
    evaluation_months = list(diagnosis["evaluation_months"])
    output = Path(args.output or ROOT / config["output"]).resolve()

    v3_results = load_json(ROOT / config["frozen_candidates"]["v3_results"])
    v4_results = load_json(ROOT / config["frozen_candidates"]["v4_results"])
    v3_info = v3_results["profiles"]["nowcast"]
    m2_info = v4_results["candidates"]["M2_nowcast"]
    b2 = load_profile("nowcast", v3_info, ROOT)
    m2_features = [str(value) for value in m2_info["features"]]
    if not set(b2.features).issubset(m2_features):
        raise DiagnosticError("frozen V3 features are not a subset of V4 M2")
    m2_model = xgb.Booster()
    m2_path = ROOT / m2_info["model_path"]
    m2_model.load_model(m2_path)
    if m2_model.feature_names is not None and m2_model.feature_names != m2_features:
        raise DiagnosticError("frozen M2 feature order changed")

    required_auxiliary = {
        "target_hour",
        "band",
        "success_rate",
        "opportunities",
        "dist_km",
        "rx_lat_sin",
        "f107",
        "f107_missing",
        "kp",
        "kp_missing",
        "path_prev1_available",
        "path_prev24_available",
    }
    columns = list(dict.fromkeys([*m2_features, *sorted(required_auxiliary)]))
    missing_features = [name for name in m2_features if name.endswith(WEATHER_MISSING_SUFFIX)]

    groups: dict[str, dict[str, np.ndarray]] = {
        name: defaultdict(lambda: np.zeros(STAT_SIZE, dtype=np.float64))
        for name in (
            "month",
            "day",
            "band",
            "distance",
            "band_distance",
            "history",
            "f107",
            "geomagnetic",
            "missingness",
            "receiver_latitude",
            "disagreement",
            "day_band",
            "day_band_distance",
        )
    }
    month_band_distance: dict[tuple[str, str], np.ndarray] = defaultdict(
        lambda: np.zeros(STAT_SIZE, dtype=np.float64)
    )
    inputs: dict[str, dict[str, Any]] = {}

    for month in months:
        expected = diagnosis["inputs"][month]
        path = ROOT / expected["path"]
        inputs[month] = validate_input(path, expected, args.verify_input_hashes)
        scanner = ds.dataset(path, format="parquet").scanner(
            columns=columns,
            batch_size=int(diagnosis["batch_rows"]),
            use_threads=True,
        )
        month_rows = 0
        for batch in scanner.to_batches():
            feature_columns = {name: numeric(batch, name) for name in m2_features}
            target = numeric(batch, "success_rate", np.float64)
            weight = numeric(batch, "opportunities", np.float64)
            bands = text_column(batch, "band")
            distance = numeric(batch, "dist_km", np.float64)
            b2_raw, b2_prediction = b2.predict(feature_columns, bands)
            del b2_raw
            m2_prediction = m2_model.inplace_predict(
                feature_matrix(feature_columns, m2_features),
                iteration_range=(0, int(m2_info["best_iteration"]) + 1),
            )
            timestamps = np.asarray(
                pc.strftime(batch.column("target_hour"), format="%Y-%m-%d").to_pylist(),
                dtype=str,
            )
            if any(not day.startswith(month) for day in np.unique(timestamps)):
                raise DiagnosticError(f"{path} contains rows outside {month}")
            distances = label_distance(distance)
            band_distance = np.char.add(np.char.add(bands, "|"), distances)
            day_band = np.char.add(np.char.add(timestamps, "||"), bands)
            day_band_distance = np.char.add(
                np.char.add(timestamps, "||"), band_distance
            )
            labels = {
                "month": np.full(len(target), month, dtype="<U7"),
                "day": timestamps,
                "band": bands,
                "distance": distances,
                "band_distance": band_distance,
                "history": label_history(feature_columns),
                "f107": label_f107(feature_columns),
                "geomagnetic": label_geomagnetic(feature_columns),
                "missingness": label_missingness(feature_columns, missing_features),
                "receiver_latitude": label_receiver_latitude(
                    feature_columns["rx_lat_sin"]
                ),
                "disagreement": label_disagreement(b2_prediction, m2_prediction),
                "day_band": day_band,
                "day_band_distance": day_band_distance,
            }
            contributions = row_contributions(
                target, weight, b2_prediction, m2_prediction
            )
            for name, values in labels.items():
                add_group(groups[name], values, contributions)
            add_month_group(
                month_band_distance,
                month,
                band_distance,
                contributions,
            )
            month_rows += len(target)
        if month_rows != inputs[month]["rows"]:
            raise DiagnosticError(
                f"row count changed for {month}: {month_rows} != {inputs[month]['rows']}"
            )
        print(f"scored {month}: {month_rows:,} rows", flush=True)

    development = sum_keys(groups["month"], development_months)
    evaluation = sum_keys(groups["month"], evaluation_months)
    all_observed = sum_keys(groups["month"], months)
    unrounded_blend = optimal_b2_weight(development)
    selected_blend = rounded_weight(unrounded_blend, float(diagnosis["blend_step"]))
    blend_grid = []
    for value in np.arange(0.0, 1.00001, float(diagnosis["blend_step"])):
        blend_grid.append(
            {
                "b2_weight": float(round(value, 10)),
                "development": paired_result(development, float(value)),
                "evaluation": paired_result(evaluation, float(value)),
            }
        )

    development_bands: dict[str, np.ndarray] = defaultdict(
        lambda: np.zeros(STAT_SIZE, dtype=np.float64)
    )
    for composite, stats in groups["day_band"].items():
        day, band = composite.split("||", 1)
        if day[:7] in development_months:
            development_bands[band] += stats
    band_choices = select_band_router(development_bands)
    stable_choices = select_stable_router(
        month_band_distance,
        development_months,
        float(diagnosis["router_minimum_month_opportunities"]),
        float(diagnosis["router_minimum_month_positive_mass"]),
    )

    evaluation_band_totals: dict[str, np.ndarray] = defaultdict(
        lambda: np.zeros(STAT_SIZE, dtype=np.float64)
    )
    evaluation_band_distance_totals: dict[str, np.ndarray] = defaultdict(
        lambda: np.zeros(STAT_SIZE, dtype=np.float64)
    )
    for composite, stats in groups["day_band"].items():
        day, band = composite.split("||", 1)
        if day[:7] in evaluation_months:
            evaluation_band_totals[band] += stats
    for composite, stats in groups["day_band_distance"].items():
        day, key = composite.split("||", 1)
        if day[:7] in evaluation_months:
            evaluation_band_distance_totals[key] += stats
    band_policy = routed_stats(evaluation_band_totals, band_choices)
    stable_policy = routed_stats(evaluation_band_distance_totals, stable_choices)

    evaluation_daily = [
        groups["day"][day]
        for day in sorted(groups["day"])
        if day[:7] in evaluation_months
    ]
    band_daily = routed_daily(
        {
            key: stats
            for key, stats in groups["day_band"].items()
            if key[:7] in evaluation_months
        },
        band_choices,
    )
    stable_daily = routed_daily(
        {
            key: stats
            for key, stats in groups["day_band_distance"].items()
            if key[:7] in evaluation_months
        },
        stable_choices,
    )
    repetitions = int(diagnosis["bootstrap_repetitions"])
    seed = int(config["seed"])
    bootstrap = {
        "raw_m2_minus_b2": bootstrap_policy_delta(
            evaluation_daily, 2, seed, repetitions
        ),
        "selected_blend_minus_b2": bootstrap_blend_delta(
            evaluation_daily, selected_blend, seed + 1, repetitions
        ),
        "band_router_minus_b2": bootstrap_policy_delta(
            band_daily, 2, seed + 2, repetitions
        ),
        "stable_band_distance_router_minus_b2": bootstrap_policy_delta(
            stable_daily, 2, seed + 3, repetitions
        ),
    }

    m2_band_choices = [band for band, value in band_choices.items() if value == "m2"]
    stable_m2_choices = [key for key, value in stable_choices.items() if value == "m2"]
    policies = {
        "raw_m2": policy_result(evaluation, "raw_m2"),
        "selected_blend": {
            "candidate": "fixed_convex_blend",
            **paired_result(evaluation, selected_blend),
        },
        "band_router": policy_result(band_policy, "development_selected_band_router"),
        "stable_band_distance_router": policy_result(
            stable_policy, "cross_month_stable_band_distance_router"
        ),
    }
    best_policy = min(
        policies,
        key=lambda name: policies[name].get(
            "candidate_brier", policies[name].get("blend_brier", float("inf"))
        ),
    )

    result = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "observed_2024_paired_diagnosis",
        "outcome_access": {
            "observed_months": months,
            "development_months": development_months,
            "evaluation_months": evaluation_months,
            "december_2024_read": False,
            "locked_2025_read": False,
            "selection_claim": "October and November are evaluation-only for Phase 0 policies; neither is a fresh validation claim.",
        },
        "estimand": "V4 natural-distribution opportunity-weighted conditional single-decode probability",
        "inputs": inputs,
        "frozen_models": {
            "b2_model": {
                "path": v3_info["model_path"],
                "sha256": sha256(ROOT / v3_info["model_path"]),
                "best_iteration": int(v3_info["best_iteration"]),
                "features": len(b2.features),
            },
            "m2_model": {
                "path": m2_info["model_path"],
                "sha256": sha256(m2_path),
                "best_iteration": int(m2_info["best_iteration"]),
                "features": len(m2_features),
            },
        },
        "overall": {
            "development": paired_result(development),
            "evaluation": paired_result(evaluation),
            "all_observed": paired_result(all_observed),
        },
        "blend_selection": {
            "selected_on": development_months,
            "evaluated_on": evaluation_months,
            "analytic_b2_weight": unrounded_blend,
            "rounded_b2_weight": selected_blend,
            "rounding_step": float(diagnosis["blend_step"]),
            "grid": blend_grid,
        },
        "routers": {
            "band": {
                "choices": band_choices,
                "m2_choices": m2_band_choices,
            },
            "stable_band_distance": {
                "choices": stable_choices,
                "m2_choices": stable_m2_choices,
                "minimum_month_opportunities": float(
                    diagnosis["router_minimum_month_opportunities"]
                ),
                "minimum_month_positive_mass": float(
                    diagnosis["router_minimum_month_positive_mass"]
                ),
            },
        },
        "evaluation_policies": policies,
        "best_evaluation_policy": best_policy,
        "bootstrap": bootstrap,
        "slices": {
            name: slice_rows(groups[name])
            for name in (
                "month",
                "day",
                "band",
                "distance",
                "band_distance",
                "history",
                "f107",
                "geomagnetic",
                "missingness",
                "receiver_latitude",
                "disagreement",
            )
        },
        "candidate_recommendation": {
            "phase_1_required": True,
            "best_no_retraining_policy": best_policy,
            "preserve_m2_specialist_bands": m2_band_choices,
            "preserve_stable_m2_band_distance_cells": stable_m2_choices,
            "advance_ablations": ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
            "reason": "Use paired evidence to test recency and sampling before selecting a new 50M core.",
        },
        "compute": {
            "machine_profile": "m5",
            "batch_rows": int(diagnosis["batch_rows"]),
            "wall_seconds": time.monotonic() - started,
            "maximum_rss_gb": maximum_rss_gb(),
            "python": platform.python_version(),
            "platform": platform.platform(),
            "numpy": np.__version__,
            "pyarrow": pa.__version__,
            "xgboost": xgb.__version__,
        },
    }
    atomic_write_json(output, result)
    print(output)


if __name__ == "__main__":
    main()
