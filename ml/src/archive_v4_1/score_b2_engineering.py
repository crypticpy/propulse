#!/usr/bin/env python3
"""Score frozen V3/B2 on observed October V4 rows for engineering validation."""

from __future__ import annotations

import argparse
import json
import sys
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
sys.path.append(str(V4))

from external_memory import MetricAccumulator, month_filter  # noqa: E402

from b2_adapter import apply_v3_calibrator, feature_matrix, load_profile  # noqa: E402
from protocol import artifact, atomic_write_json, load_json, utc_now  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_1.json"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_1/preregistration/b2_october_engineering.json"
)
DISTANCE_BINS = (
    (0, 500),
    (500, 1_500),
    (1_500, 3_000),
    (3_000, 6_000),
    (6_000, 10_000),
    (10_000, 25_000),
)


def numeric(batch: Any, name: str, dtype: Any = np.float32) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        column = pc.fill_null(column, 0)
    return np.asarray(column.to_numpy(zero_copy_only=False), dtype=dtype)


def paired_result(values: np.ndarray) -> dict[str, Any]:
    weight = values[0]
    b2 = values[1] / weight
    m2 = values[2] / weight
    return {
        "opportunities": float(weight),
        "rows": int(values[3]),
        "b2_brier": float(b2),
        "m2_brier": float(m2),
        "m2_minus_b2_brier": float(m2 - b2),
        "m2_relative_brier_improvement": float(1 - m2 / b2),
    }


def add_pair(
    totals: dict[str, np.ndarray],
    key: str,
    target: np.ndarray,
    weight: np.ndarray,
    b2: np.ndarray,
    m2: np.ndarray,
    mask: np.ndarray,
) -> None:
    if not np.any(mask):
        return
    selected_weight = weight[mask]
    selected_target = target[mask]
    totals[key] += np.array(
        [
            selected_weight.sum(),
            np.dot(selected_weight, np.square(b2[mask] - selected_target)),
            np.dot(selected_weight, np.square(m2[mask] - selected_target)),
            mask.sum(),
        ],
        dtype=np.float64,
    )


def day_bootstrap(
    daily: list[dict[str, Any]],
    seed: int,
    repetitions: int,
) -> dict[str, float]:
    matrix = np.asarray(
        [
            [
                row["opportunities"],
                row["b2_brier"] * row["opportunities"],
                row["m2_brier"] * row["opportunities"],
            ]
            for row in daily
        ],
        dtype=np.float64,
    )
    if len(matrix) < 2:
        raise RuntimeError("paired bootstrap requires at least two UTC days")
    rng = np.random.default_rng(seed)
    values = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sampled = matrix[rng.integers(0, len(matrix), len(matrix))].sum(axis=0)
        values[index] = (sampled[2] - sampled[1]) / sampled[0]
    return {
        "lower_95": float(np.quantile(values, 0.025)),
        "median": float(np.quantile(values, 0.5)),
        "upper_95": float(np.quantile(values, 0.975)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile

    config = load_json(Path(args.config))
    frozen = config["frozen_candidates"]
    v3_results = load_json(ROOT / frozen["v3_results"])
    v4_results = load_json(ROOT / frozen["v4_results"])
    v3_info = v3_results["profiles"]["nowcast"]
    m2_info = v4_results["candidates"]["M2_nowcast"]
    b2 = load_profile("nowcast", v3_info, ROOT)
    m2_model = xgb.Booster()
    m2_model.load_model(ROOT / m2_info["model_path"])
    m2_calibrator = joblib.load(ROOT / m2_info["calibrator_path"])
    m2_features = [str(value) for value in m2_info["features"]]
    if m2_model.feature_names is not None and m2_model.feature_names != m2_features:
        raise RuntimeError("frozen M2 feature order changed")
    if not set(b2.features).issubset(m2_features):
        raise RuntimeError("V3 features are not a subset of V4 M2 features")

    validation = (
        ROOT
        / "ml/data/processed/archive_v4"
        / f"samples/{config['parent_run_id']}/hf/validation.parquet"
    )
    if not validation.exists():
        raise FileNotFoundError(validation)
    columns = list(dict.fromkeys([
        *m2_features,
        "target_hour",
        "band",
        "dist_km",
        "success_rate",
        "opportunities",
    ]))
    scanner = ds.dataset(validation, format="parquet").scanner(
        columns=columns,
        filter=month_filter(config["data_roles"]["observed_engineering"]),
        batch_size=100_000,
        use_threads=True,
    )
    metrics = {
        "b2_frozen_v3": MetricAccumulator(),
        "m2_raw": MetricAccumulator(),
        "m2_v4_calibrated": MetricAccumulator(),
    }
    overall: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(4))
    daily_totals: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(4))
    distance_totals: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(4))
    for batch in scanner.to_batches():
        feature_columns = {name: numeric(batch, name) for name in m2_features}
        bands = np.asarray(batch.column("band").to_pylist(), dtype=str)
        distance = numeric(batch, "dist_km", np.float64)
        target = numeric(batch, "success_rate", np.float64)
        weight = numeric(batch, "opportunities", np.float64)
        b2_matrix = feature_matrix(feature_columns, b2.features)
        b2_raw = b2.model.inplace_predict(
            b2_matrix,
            iteration_range=(0, b2.best_iteration + 1),
        )
        b2_prediction = apply_v3_calibrator(b2.calibrator, b2_raw, bands)
        m2_matrix = feature_matrix(feature_columns, m2_features)
        m2_raw = m2_model.inplace_predict(
            m2_matrix,
            iteration_range=(0, int(m2_info["best_iteration"]) + 1),
        )
        m2_prediction = m2_calibrator.predict(m2_raw, bands, distance)
        metrics["b2_frozen_v3"].update(target, b2_prediction, weight)
        metrics["m2_raw"].update(target, m2_raw, weight)
        metrics["m2_v4_calibrated"].update(target, m2_prediction, weight)
        all_rows = np.ones(len(target), dtype=bool)
        add_pair(overall, "overall", target, weight, b2_prediction, m2_prediction, all_rows)
        days = np.asarray(
            pc.strftime(batch.column("target_hour"), format="%Y-%m-%d").to_pylist(),
            dtype=str,
        )
        for day in np.unique(days):
            add_pair(
                daily_totals,
                day,
                target,
                weight,
                b2_prediction,
                m2_prediction,
                days == day,
            )
        for lower, upper in DISTANCE_BINS:
            label = f"{lower}-{upper} km"
            add_pair(
                distance_totals,
                label,
                target,
                weight,
                b2_prediction,
                m2_prediction,
                (distance >= lower) & (distance < upper),
            )

    daily = [
        {"date": day, **paired_result(daily_totals[day])}
        for day in sorted(daily_totals)
    ]
    result = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "observed_october_engineering_non_gating",
        "months": config["data_roles"]["observed_engineering"],
        "locked_archive_test_read": False,
        "selection_permitted": False,
        "estimand": "V4 natural-distribution opportunity-weighted single-decode probability",
        "validation_data": artifact(validation),
        "metrics": {name: value.result() for name, value in metrics.items()},
        "paired": paired_result(overall["overall"]),
        "day_bootstrap_m2_minus_b2": day_bootstrap(
            daily,
            config["seed"],
            config["calibration"]["bootstrap_repetitions"],
        ),
        "daily": daily,
        "distance": [
            {"key": key, **paired_result(distance_totals[key])}
            for key in distance_totals
        ],
        "frozen_artifacts": {
            "b2_model": artifact(ROOT / v3_info["model_path"]),
            "b2_calibrator": artifact(
                (ROOT / v3_info["model_path"]).with_suffix(".isotonic.joblib")
            ),
            "m2_model": artifact(ROOT / m2_info["model_path"]),
            "m2_v4_calibrator": artifact(ROOT / m2_info["calibrator_path"]),
        },
    }
    atomic_write_json(Path(args.output), result)
    print(args.output)


if __name__ == "__main__":
    main()
