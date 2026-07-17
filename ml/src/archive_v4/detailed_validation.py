#!/usr/bin/env python3
"""Build paired daily, distance, and coarse-geographic V4 validation evidence."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import duckdb
import joblib
import numpy as np
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb


V3 = Path(__file__).resolve().parents[1] / "archive_v3"
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(V3))
from common import PROCESSED, RESULTS, load_config, utc_now, write_json  # noqa: E402
from external_memory import month_filter  # noqa: E402


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
    return np.asarray(
        column.to_numpy(zero_copy_only=False),
        dtype=dtype,
    )


def add_score(
    totals: dict[Any, np.ndarray],
    key: Any,
    target: np.ndarray,
    weight: np.ndarray,
    m1: np.ndarray,
    m2: np.ndarray,
    baseline: np.ndarray,
    raw_m2: np.ndarray,
    mask: np.ndarray,
) -> None:
    if not np.any(mask):
        return
    values = totals[key]
    selected_weight = weight[mask]
    selected_target = target[mask]
    values += np.array(
        [
            selected_weight.sum(),
            np.sum(selected_weight * np.square(m1[mask] - selected_target)),
            np.sum(selected_weight * np.square(m2[mask] - selected_target)),
            np.sum(selected_weight * np.square(baseline[mask] - selected_target)),
            np.sum(selected_weight * np.square(raw_m2[mask] - selected_target)),
            mask.sum(),
        ],
        dtype=np.float64,
    )


def score_row(key: Any, values: np.ndarray) -> dict[str, Any]:
    weight = values[0]
    m1 = values[1] / weight
    m2 = values[2] / weight
    baseline = values[3] / weight
    raw_m2 = values[4] / weight
    return {
        "key": key,
        "rows": int(values[5]),
        "opportunities": float(weight),
        "m1_brier": float(m1),
        "m2_brier": float(m2),
        "b0_brier": float(baseline),
        "raw_m2_brier": float(raw_m2),
        "m2_skill_vs_b0": float(1 - m2 / baseline),
        "m2_delta_vs_b0": float(m2 - baseline),
        "m2_delta_vs_m1": float(m2 - m1),
        "m2_calibration_gain": float(raw_m2 - m2),
    }


def baseline_lookup(sample_glob: str, cap: int) -> dict[tuple[str, int], float]:
    connection = duckdb.connect()
    connection.execute(
        f"SET threads={int(os.environ.get('PROPULSE_DUCKDB_THREADS', '10'))}"
    )
    rows = connection.execute(
        f"""
        SELECT band,
               extract('hour' FROM target_hour)::INTEGER AS hour,
               sum(training_weight * success_rate) / sum(training_weight) AS rate
        FROM read_parquet('{sample_glob}', hive_partitioning=true)
        WHERE in_sample_{cap}
        GROUP BY band, hour
        """
    ).fetchall()
    connection.close()
    return {(str(band), int(hour)): float(rate) for band, hour, rate in rows}


def bootstrap_daily(
    daily: list[dict[str, Any]],
    seed: int,
    repetitions: int = 2_000,
) -> dict[str, Any]:
    matrix = np.asarray(
        [
            [
                row["opportunities"],
                row["m1_brier"] * row["opportunities"],
                row["m2_brier"] * row["opportunities"],
                row["b0_brier"] * row["opportunities"],
            ]
            for row in daily
        ],
        dtype=np.float64,
    )
    rng = np.random.default_rng(seed)
    statistics = np.empty((repetitions, 3), dtype=np.float64)
    for index in range(repetitions):
        sampled = matrix[rng.integers(0, len(matrix), len(matrix))].sum(axis=0)
        m1 = sampled[1] / sampled[0]
        m2 = sampled[2] / sampled[0]
        b0 = sampled[3] / sampled[0]
        statistics[index] = (m2, 1 - m2 / b0, m2 - m1)
    labels = ("m2_brier", "m2_skill_vs_b0", "m2_delta_vs_m1")
    return {
        label: {
            "lower_95": float(np.quantile(statistics[:, column], 0.025)),
            "median": float(np.quantile(statistics[:, column], 0.5)),
            "upper_95": float(np.quantile(statistics[:, column], 0.975)),
        }
        for column, label in enumerate(labels)
    }


def load_candidate(candidate: dict[str, Any]) -> tuple[xgb.Booster, Any]:
    model = xgb.Booster()
    model.load_model(ROOT / candidate["model_path"])
    calibrator = joblib.load(ROOT / candidate["calibrator_path"])
    return model, calibrator


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    run_id = config["run_id"]
    result_dir = RESULTS / run_id
    development_path = result_dir / "development_results.json"
    development = json.loads(development_path.read_text(encoding="utf-8"))
    candidates = development["candidates"]
    m1_info = candidates["M1_physics"]
    m2_info = candidates["M2_nowcast"]
    cap = int(m2_info["train_cap"])
    if cap != int(config["sampling"]["primary_train_rows"]):
        raise RuntimeError("detailed validation requires the primary trained cap")
    m1_model, m1_calibrator = load_candidate(m1_info)
    m2_model, m2_calibrator = load_candidate(m2_info)
    sample_dir = PROCESSED / f"samples/{run_id}/hf/train"
    baseline = baseline_lookup(str(sample_dir / "**/*.parquet"), cap)
    validation_path = PROCESSED / f"samples/{run_id}/hf/validation.parquet"
    feature_names = list(dict.fromkeys([*m1_info["features"], *m2_info["features"]]))
    validation_columns = list(dict.fromkeys([
            "target_hour",
            "band",
            "success_rate",
            "opportunities",
            "dist_km",
            "tx_lat",
            "tx_lon",
            *feature_names,
        ]))
    scanner = ds.dataset(validation_path, format="parquet").scanner(
        columns=validation_columns,
        filter=month_filter(config["validation_protocol"]["gate_months"]),
        batch_size=100_000,
    )
    daily: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(6))
    distance: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(6))
    regions: dict[tuple[int, int], np.ndarray] = defaultdict(lambda: np.zeros(6))
    overall: dict[str, np.ndarray] = defaultdict(lambda: np.zeros(6))
    for batch in scanner.to_batches():
        columns = {
            name: numeric(batch, name)
            for name in feature_names
        }
        m1_matrix = np.column_stack([columns[name] for name in m1_info["features"]])
        m2_matrix = np.column_stack([columns[name] for name in m2_info["features"]])
        bands = np.asarray(batch.column("band").to_pylist(), dtype=str)
        distances = numeric(batch, "dist_km", np.float64)
        target = numeric(batch, "success_rate", np.float64)
        weight = numeric(batch, "opportunities", np.float64)
        hours = pc.hour(batch.column("target_hour")).to_numpy(zero_copy_only=False)
        dates = np.asarray(
            pc.strftime(batch.column("target_hour"), format="%Y-%m-%d").to_pylist(),
            dtype=str,
        )
        raw_m1 = m1_model.inplace_predict(
            m1_matrix,
            iteration_range=(0, int(m1_info["best_iteration"]) + 1),
        )
        raw_m2 = m2_model.inplace_predict(
            m2_matrix,
            iteration_range=(0, int(m2_info["best_iteration"]) + 1),
        )
        m1 = m1_calibrator.predict(raw_m1, bands, distances)
        m2 = m2_calibrator.predict(raw_m2, bands, distances)
        b0 = np.asarray(
            [baseline[(band, int(hour))] for band, hour in zip(bands, hours)],
            dtype=np.float64,
        )
        all_rows = np.ones(len(target), dtype=bool)
        add_score(overall, "overall", target, weight, m1, m2, b0, raw_m2, all_rows)
        for key in np.unique(dates):
            add_score(daily, key, target, weight, m1, m2, b0, raw_m2, dates == key)
        for lower, upper in DISTANCE_BINS:
            label = f"{lower}-{upper} km"
            add_score(
                distance,
                label,
                target,
                weight,
                m1,
                m2,
                b0,
                raw_m2,
                (distances >= lower) & (distances < upper),
            )
        latitudes = numeric(batch, "tx_lat", np.float64)
        longitudes = numeric(batch, "tx_lon", np.float64)
        lat_bins = np.floor((latitudes + 90) / 15).astype(int)
        lon_bins = np.floor((longitudes + 180) / 30).astype(int)
        for lat_bin, lon_bin in set(zip(lat_bins, lon_bins)):
            add_score(
                regions,
                (lat_bin, lon_bin),
                target,
                weight,
                m1,
                m2,
                b0,
                raw_m2,
                (lat_bins == lat_bin) & (lon_bins == lon_bin),
            )

    daily_rows = [score_row(key, daily[key]) for key in sorted(daily)]
    distance_rows = [score_row(key, distance[key]) for key in distance]
    region_rows = []
    for (lat_bin, lon_bin), values in regions.items():
        if values[5] < 500:
            continue
        row = score_row(f"{lat_bin}:{lon_bin}", values)
        row.update({
            "lat": -90 + lat_bin * 15 + 7.5,
            "lon": -180 + lon_bin * 30 + 15,
        })
        region_rows.append(row)
    region_rows.sort(key=lambda row: row["opportunities"], reverse=True)
    output = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": run_id,
        "scope": "development_only",
        "locked_archive_test_read": False,
        "train_cap": cap,
        "gate_months": config["validation_protocol"]["gate_months"],
        "overall": score_row("overall", overall["overall"]),
        "day_bootstrap_95": bootstrap_daily(daily_rows, int(config["seed"])),
        "daily": daily_rows,
        "distance": distance_rows,
        "coarse_transmitter_regions": region_rows,
        "privacy": "15x30 degree aggregates only; callsigns, grid cells, and station IDs omitted",
    }
    output["gates"] = {
        "m2_day_bootstrap_skill_lower_positive": (
            output["day_bootstrap_95"]["m2_skill_vs_b0"]["lower_95"] > 0
        ),
        "m2_day_bootstrap_delta_vs_m1_upper_nonpositive": (
            output["day_bootstrap_95"]["m2_delta_vs_m1"]["upper_95"] <= 0
        ),
        "short_path_calibration_non_regression": all(
            row["m2_calibration_gain"] >= 0
            for row in distance_rows
            if row["key"] in {"0-500 km", "500-1500 km"}
        ),
    }
    output["passed"] = all(output["gates"].values())
    result_path = result_dir / "detailed_validation_results.json"
    write_json(result_path, output)
    print(result_path)


if __name__ == "__main__":
    main()
