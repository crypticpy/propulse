#!/usr/bin/env python3
"""Select and refit guarded V4.1 calibration from streamed OOF predictions."""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pyarrow as pa
import pyarrow.dataset as ds
import pyarrow.parquet as pq

from calibration import (
    CANDIDATE_IDS,
    GuardedCalibratorBundle,
    predict_family_arrays,
)
from protocol import ROOT, artifact, atomic_write_json, load_json, sha256, utc_now
from streaming_calibration import (
    GroupedBinnedStatistics,
    fit_hierarchy_from_statistics,
    load_statistics,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_1.json"
DEFAULT_PROTOCOL = (
    ROOT / "ml/results/propagation_v4_1/preregistration/run_manifest.json"
)
FIXED_CANDIDATES = CANDIDATE_IDS[:4]
PRIMARY_CANDIDATE = CANDIDATE_IDS[4]


@dataclass
class ReliabilityStatistics:
    bins: int = 20
    rows: int = 0
    weight: float = 0.0
    target: float = 0.0
    prediction: float = 0.0
    squared_error: float = 0.0
    absolute_error: float = 0.0
    log_loss: float = 0.0
    bin_weight: np.ndarray = field(init=False)
    bin_target: np.ndarray = field(init=False)
    bin_prediction: np.ndarray = field(init=False)

    def __post_init__(self) -> None:
        self.bin_weight = np.zeros(self.bins, dtype=np.float64)
        self.bin_target = np.zeros(self.bins, dtype=np.float64)
        self.bin_prediction = np.zeros(self.bins, dtype=np.float64)

    def update(
        self,
        target: np.ndarray,
        prediction: np.ndarray,
        weight: np.ndarray,
    ) -> None:
        y = np.asarray(target, dtype=np.float64)
        p = np.clip(np.asarray(prediction, dtype=np.float64), 1e-7, 1 - 1e-7)
        w = np.asarray(weight, dtype=np.float64)
        self.rows += len(y)
        self.weight += float(w.sum())
        self.target += float(np.dot(w, y))
        self.prediction += float(np.dot(w, p))
        self.squared_error += float(np.dot(w, np.square(p - y)))
        self.absolute_error += float(np.dot(w, np.abs(p - y)))
        self.log_loss += float(
            np.dot(w, -(y * np.log(p) + (1 - y) * np.log(1 - p)))
        )
        indexes = np.minimum((p * self.bins).astype(np.int64), self.bins - 1)
        self.bin_weight += np.bincount(indexes, weights=w, minlength=self.bins)
        self.bin_target += np.bincount(indexes, weights=w * y, minlength=self.bins)
        self.bin_prediction += np.bincount(
            indexes,
            weights=w * p,
            minlength=self.bins,
        )

    def merge(self, other: "ReliabilityStatistics") -> None:
        if self.bins != other.bins:
            raise ValueError("reliability bin counts differ")
        for name in (
            "rows",
            "weight",
            "target",
            "prediction",
            "squared_error",
            "absolute_error",
            "log_loss",
        ):
            setattr(self, name, getattr(self, name) + getattr(other, name))
        self.bin_weight += other.bin_weight
        self.bin_target += other.bin_target
        self.bin_prediction += other.bin_prediction

    def result(self) -> dict[str, Any]:
        if not self.weight:
            raise RuntimeError("cannot report empty reliability statistics")
        calibration = []
        expected_error = 0.0
        maximum_error = 0.0
        for index, weight in enumerate(self.bin_weight):
            if not weight:
                continue
            observed = self.bin_target[index] / weight
            predicted = self.bin_prediction[index] / weight
            error = abs(observed - predicted)
            expected_error += weight / self.weight * error
            maximum_error = max(maximum_error, error)
            calibration.append(
                {
                    "bin": index,
                    "lower": index / self.bins,
                    "upper": (index + 1) / self.bins,
                    "weight": float(weight),
                    "mean_prediction": float(predicted),
                    "observed_rate": float(observed),
                }
            )
        return {
            "rows": self.rows,
            "weighted_opportunities": self.weight,
            "weighted_prevalence": self.target / self.weight,
            "mean_prediction": self.prediction / self.weight,
            "weighted_brier": self.squared_error / self.weight,
            "weighted_log_loss": self.log_loss / self.weight,
            "weighted_mae": self.absolute_error / self.weight,
            "expected_calibration_error": expected_error,
            "maximum_calibration_error": maximum_error,
            "calibration_bins": calibration,
        }


class OofAccumulator:
    def __init__(self) -> None:
        self.support: dict[tuple[str, str, str, str], np.ndarray] = {}
        self.loss: dict[tuple[str, str, str, str, str], float] = {}
        self.reliability: dict[tuple[str, str], ReliabilityStatistics] = {}

    def _add_scope(
        self,
        scope_type: str,
        scope_key: str,
        month: str,
        day: str,
        target: np.ndarray,
        weight: np.ndarray,
        predictions: dict[str, np.ndarray],
    ) -> None:
        key = (scope_type, scope_key, month, day)
        values = self.support.setdefault(key, np.zeros(4, dtype=np.float64))
        values += (
            len(target),
            float(weight.sum()),
            float(np.dot(weight, target)),
            float(np.dot(weight, 1 - target)),
        )
        for candidate, prediction in predictions.items():
            loss_key = (*key, candidate)
            self.loss[loss_key] = self.loss.get(loss_key, 0.0) + float(
                np.dot(weight, np.square(prediction - target))
            )

    def update(
        self,
        month: str,
        day: np.ndarray,
        target: np.ndarray,
        weight: np.ndarray,
        bands: np.ndarray,
        distance_groups: np.ndarray,
        predictions: dict[str, np.ndarray],
    ) -> None:
        text_bands = np.asarray(bands).astype(str)
        groups = np.asarray(distance_groups).astype(str)
        for current_day in np.unique(day):
            day_mask = day == current_day
            scoped_predictions = {
                name: values[day_mask] for name, values in predictions.items()
            }
            self._add_scope(
                "overall",
                "all",
                month,
                str(current_day),
                target[day_mask],
                weight[day_mask],
                scoped_predictions,
            )
            for band in np.unique(text_bands[day_mask]):
                band_mask = day_mask & (text_bands == band)
                self._add_scope(
                    "band",
                    band,
                    month,
                    str(current_day),
                    target[band_mask],
                    weight[band_mask],
                    {name: values[band_mask] for name, values in predictions.items()},
                )
                for group in np.unique(groups[band_mask]):
                    leaf_mask = band_mask & (groups == group)
                    leaf = f"{band}|{group}"
                    self._add_scope(
                        "leaf",
                        leaf,
                        month,
                        str(current_day),
                        target[leaf_mask],
                        weight[leaf_mask],
                        {
                            name: values[leaf_mask]
                            for name, values in predictions.items()
                        },
                    )
        for band in np.unique(text_bands):
            band_mask = text_bands == band
            for group in np.unique(groups[band_mask]):
                mask = band_mask & (groups == group)
                leaf = f"{band}|{group}"
                for candidate, prediction in predictions.items():
                    self.reliability.setdefault(
                        (leaf, candidate),
                        ReliabilityStatistics(),
                    ).update(target[mask], prediction[mask], weight[mask])


def bootstrap_upper(
    day_weight: np.ndarray,
    day_delta: np.ndarray,
    *,
    seed: int,
    repetitions: int,
) -> float:
    if not len(day_weight) or np.any(day_weight <= 0):
        raise ValueError("bootstrap requires positive daily weights")
    rng = np.random.default_rng(seed)
    statistics = np.empty(repetitions, dtype=np.float64)
    for index in range(repetitions):
        sampled = rng.integers(0, len(day_weight), len(day_weight))
        statistics[index] = day_delta[sampled].sum() / day_weight[sampled].sum()
    return float(np.quantile(statistics, 0.975))


def selection_evidence(
    accumulator: OofAccumulator,
    scope_type: str,
    scope_key: str,
    candidate: str,
    fallback: str,
    config: dict[str, Any],
) -> dict[str, Any]:
    keys = sorted(
        key
        for key in accumulator.support
        if key[0] == scope_type and key[1] == scope_key
    )
    if not keys:
        raise ValueError(f"selection scope is empty: {scope_type} {scope_key}")
    support = np.sum([accumulator.support[key] for key in keys], axis=0)
    candidate_loss = np.array(
        [accumulator.loss[(*key, candidate)] for key in keys], dtype=np.float64
    )
    fallback_loss = np.array(
        [accumulator.loss[(*key, fallback)] for key in keys], dtype=np.float64
    )
    raw_loss = np.array(
        [accumulator.loss[(*key, "C0_identity")] for key in keys], dtype=np.float64
    )
    day_weight = np.array([accumulator.support[key][1] for key in keys])
    months = sorted(set(key[2] for key in keys))
    monthly_gain = {}
    for month in months:
        selected = np.array([key[2] == month for key in keys])
        monthly_gain[month] = float(
            (raw_loss[selected].sum() - candidate_loss[selected].sum())
            / day_weight[selected].sum()
        )
    candidate_brier = float(candidate_loss.sum() / support[1])
    fallback_brier = float(fallback_loss.sum() / support[1])
    raw_brier = float(raw_loss.sum() / support[1])
    calibration = config["calibration"]
    upper = bootstrap_upper(
        day_weight,
        candidate_loss - fallback_loss,
        seed=int(config["seed"]),
        repetitions=int(calibration["bootstrap_repetitions"]),
    )
    supported = (
        int(support[0]) >= int(calibration["minimum_rows"])
        and support[2] >= float(calibration["minimum_positive_equivalent"])
        and support[3] >= float(calibration["minimum_negative_equivalent"])
        and len(months) >= int(calibration["minimum_months"])
    )
    selected = (
        supported
        and candidate_brier < fallback_brier
        and all(value >= 0 for value in monthly_gain.values())
        and upper <= float(calibration["bootstrap_upper_bound"])
    )
    return {
        "rows": int(support[0]),
        "weighted_opportunities": float(support[1]),
        "positive_equivalent": float(support[2]),
        "negative_equivalent": float(support[3]),
        "months": months,
        "candidate": candidate,
        "fallback": fallback,
        "candidate_brier": candidate_brier,
        "fallback_brier": fallback_brier,
        "raw_brier": raw_brier,
        "candidate_minus_fallback_brier": candidate_brier - fallback_brier,
        "monthly_calibration_gain": monthly_gain,
        "bootstrap_upper_95": upper,
        "supported": bool(supported),
        "selected": bool(selected),
    }


def evaluate_month(
    month: str,
    path: Path,
    models: Any,
    accumulator: OofAccumulator,
    batch_size: int,
) -> int:
    scanner = ds.dataset(path, format="parquet").scanner(
        columns=[
            "target_hour",
            "band",
            "dist_km",
            "serving_distance_group",
            "raw_probability",
            "success_rate",
            "opportunities",
        ],
        batch_size=batch_size,
        use_threads=True,
    )
    rows = 0
    for batch_index, batch in enumerate(scanner.to_batches(), start=1):
        raw = batch.column("raw_probability").to_numpy().astype(np.float64)
        target = batch.column("success_rate").to_numpy().astype(np.float64)
        weight = batch.column("opportunities").to_numpy().astype(np.float64)
        bands = batch.column("band").to_numpy(zero_copy_only=False).astype(str)
        distance = batch.column("dist_km").to_numpy().astype(np.float64)
        groups = (
            batch.column("serving_distance_group")
            .to_numpy(zero_copy_only=False)
            .astype(str)
        )
        day = (
            batch.column("target_hour")
            .to_numpy(zero_copy_only=False)
            .astype("datetime64[D]")
            .astype(str)
        )
        predictions = {
            candidate: predict_family_arrays(models, raw, bands, distance, candidate)
            for candidate in FIXED_CANDIDATES
        }
        accumulator.update(
            month,
            day,
            target,
            weight,
            bands,
            groups,
            predictions,
        )
        rows += len(raw)
        if batch_index % 50 == 0:
            print(f"OOF {month}: batches={batch_index:,} rows={rows:,}", flush=True)
    return rows


def merge_reliability(
    accumulator: OofAccumulator,
    choices: dict[str, str] | str,
    *,
    band: str | None = None,
    distance: str | None = None,
) -> ReliabilityStatistics:
    output = ReliabilityStatistics()
    matched = 0
    leaves = sorted(set(leaf for leaf, _ in accumulator.reliability))
    for leaf in leaves:
        leaf_band, leaf_distance = leaf.split("|", 1)
        if band is not None and leaf_band != band:
            continue
        if distance is not None and leaf_distance != distance:
            continue
        candidate = choices[leaf] if isinstance(choices, dict) else choices
        output.merge(accumulator.reliability[(leaf, candidate)])
        matched += 1
    if not matched:
        raise ValueError("no reliability leaves matched")
    return output


def candidate_metrics(
    accumulator: OofAccumulator,
    choices: dict[str, str] | str,
) -> dict[str, Any]:
    leaves = sorted(set(leaf for leaf, _ in accumulator.reliability))
    bands = sorted(set(leaf.split("|", 1)[0] for leaf in leaves))
    distances = sorted(set(leaf.split("|", 1)[1] for leaf in leaves))
    result = merge_reliability(accumulator, choices).result()
    result["slices"] = {
        "band": {
            band: merge_reliability(accumulator, choices, band=band).result()
            for band in bands
        },
        "serving_distance": {
            distance: merge_reliability(
                accumulator,
                choices,
                distance=distance,
            ).result()
            for distance in distances
        },
    }
    return result


def compose_c4_daily(
    accumulator: OofAccumulator,
    choices: dict[str, str],
) -> None:
    leaf_keys = [key for key in accumulator.support if key[0] == "leaf"]
    band_values: dict[tuple[str, str, str, str], tuple[np.ndarray, float]] = {}
    overall_values: dict[tuple[str, str, str, str], tuple[np.ndarray, float]] = {}
    for key in leaf_keys:
        leaf = key[1]
        band = leaf.split("|", 1)[0]
        support = accumulator.support[key]
        loss = accumulator.loss[(*key, choices[leaf])]
        accumulator.loss[(*key, PRIMARY_CANDIDATE)] = loss
        for aggregate_key, destination in (
            (("band", band, key[2], key[3]), band_values),
            (("overall", "all", key[2], key[3]), overall_values),
        ):
            previous_support, previous_loss = destination.get(
                aggregate_key,
                (np.zeros(4, dtype=np.float64), 0.0),
            )
            destination[aggregate_key] = (
                previous_support + support,
                previous_loss + loss,
            )
    for destination in (band_values, overall_values):
        for key, (support, loss) in destination.items():
            existing = accumulator.support[key]
            if not np.allclose(existing, support, rtol=1e-12, atol=1e-6):
                raise RuntimeError(f"C4 daily support composition failed: {key}")
            accumulator.loss[(*key, PRIMARY_CANDIDATE)] = loss


def daily_rows(accumulator: OofAccumulator) -> list[dict[str, Any]]:
    output = []
    for key in sorted(accumulator.support):
        support = accumulator.support[key]
        for candidate in CANDIDATE_IDS:
            loss_key = (*key, candidate)
            if loss_key not in accumulator.loss:
                continue
            output.append(
                {
                    "scope_type": key[0],
                    "scope_key": key[1],
                    "month": key[2],
                    "day": key[3],
                    "candidate": candidate,
                    "rows": int(support[0]),
                    "weighted_opportunities": float(support[1]),
                    "positive_equivalent": float(support[2]),
                    "negative_equivalent": float(support[3]),
                    "weighted_squared_error": accumulator.loss[loss_key],
                }
            )
    return output


def write_daily(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".tmp.parquet")
    pq.write_table(pa.Table.from_pylist(rows), temporary, compression="zstd")
    temporary.replace(path)


def git_commit() -> str:
    status = subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True
    ).strip()
    if status:
        raise RuntimeError("calibration selection requires a clean committed worktree")
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
    ).strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile

    started = time.time()
    config = load_json(Path(args.config))
    protocol = load_json(DEFAULT_PROTOCOL)
    if protocol["november_gate_opened"] or protocol["locked_archive_test_opened"]:
        raise RuntimeError("calibration selection must precede locked outcome access")
    commit = git_commit()
    frozen_predictions = protocol["frozen_artifacts"].get("calibration_predictions")
    if frozen_predictions is None:
        raise RuntimeError("frozen calibration predictions are required")
    prediction_manifest_path = ROOT / frozen_predictions["path"]
    if sha256(prediction_manifest_path) != frozen_predictions["sha256"]:
        raise RuntimeError("calibration prediction manifest changed")
    prediction_manifest = load_json(prediction_manifest_path)
    months = list(config["data_roles"]["calibration_development"])
    if list(prediction_manifest["months"]) != months:
        raise RuntimeError("calibration prediction months changed")
    bins = int(config["calibration"]["sufficient_statistic_bins"])
    statistics: dict[str, GroupedBinnedStatistics] = {}
    prediction_paths = {}
    for month in months:
        month_manifest = prediction_manifest["months"][month]
        stats_path = ROOT / month_manifest["sufficient_statistics"]["path"]
        prediction_path = ROOT / month_manifest["predictions"]["path"]
        if sha256(stats_path) != month_manifest["sufficient_statistics"]["sha256"]:
            raise RuntimeError(f"sufficient statistics changed for {month}")
        if sha256(prediction_path) != month_manifest["predictions"]["sha256"]:
            raise RuntimeError(f"predictions changed for {month}")
        observed_month, statistics[month] = load_statistics(stats_path, bins)
        if observed_month != month:
            raise RuntimeError(f"statistics month mismatch: {month}")
        prediction_paths[month] = prediction_path

    accumulator = OofAccumulator()
    for held_out in months:
        pooled = GroupedBinnedStatistics.pooled(
            value for month, value in statistics.items() if month != held_out
        )
        models = fit_hierarchy_from_statistics(pooled)
        rows = evaluate_month(
            held_out,
            prediction_paths[held_out],
            models,
            accumulator,
            int(config["calibration"]["stream_batch_rows"]),
        )
        expected = int(prediction_manifest["months"][held_out]["rows"])
        if rows != expected:
            raise RuntimeError(f"OOF row audit failed for {held_out}: {rows} != {expected}")

    global_evidence = selection_evidence(
        accumulator,
        "overall",
        "all",
        "C1_global_isotonic",
        "C0_identity",
        config,
    )
    global_fallback = (
        "C1_global_isotonic" if global_evidence["selected"] else "C0_identity"
    )
    bands = sorted(key[1] for key in accumulator.support if key[0] == "band")
    bands = sorted(set(bands))
    band_evidence = {}
    selected_bands = []
    band_fallbacks = {}
    for band in bands:
        evidence = selection_evidence(
            accumulator,
            "band",
            band,
            "C2_per_band_isotonic",
            global_fallback,
            config,
        )
        band_evidence[band] = evidence
        if evidence["selected"]:
            selected_bands.append(band)
            band_fallbacks[band] = "C2_per_band_isotonic"
        else:
            band_fallbacks[band] = global_fallback

    leaves = sorted(key[1] for key in accumulator.support if key[0] == "leaf")
    leaves = sorted(set(leaves))
    leaf_evidence = {}
    selected_leaves = []
    choices = {}
    for leaf in leaves:
        band = leaf.split("|", 1)[0]
        evidence = selection_evidence(
            accumulator,
            "leaf",
            leaf,
            "C3_hierarchical_isotonic",
            band_fallbacks[band],
            config,
        )
        leaf_evidence[leaf] = evidence
        if evidence["selected"]:
            selected_leaves.append(tuple(leaf.split("|", 1)))
            choices[leaf] = "C3_hierarchical_isotonic"
        else:
            choices[leaf] = band_fallbacks[band]
    compose_c4_daily(accumulator, choices)

    metrics = {
        candidate: candidate_metrics(accumulator, candidate)
        for candidate in FIXED_CANDIDATES
    }
    metrics[PRIMARY_CANDIDATE] = candidate_metrics(accumulator, choices)
    daily = daily_rows(accumulator)
    full_statistics = GroupedBinnedStatistics.pooled(statistics.values())
    full_models = fit_hierarchy_from_statistics(full_statistics)
    bundle = GuardedCalibratorBundle(
        full_models,
        use_global=bool(global_evidence["selected"]),
        selected_bands=selected_bands,
        selected_band_distances=selected_leaves,
    )

    result_root = (
        ROOT / "ml/results/propagation_v4_1" / config["run_id"]
    )
    model_root = ROOT / "ml/models/archive_v4_1" / config["run_id"]
    result_root.mkdir(parents=True, exist_ok=True)
    model_root.mkdir(parents=True, exist_ok=True)
    model_path = model_root / "M2_nowcast_v4_1_calibrator.joblib"
    descriptor, temporary_name = tempfile.mkstemp(
        dir=model_root,
        prefix=f".{model_path.name}.",
        suffix=".tmp",
    )
    os.close(descriptor)
    temporary_model = Path(temporary_name)
    try:
        joblib.dump(bundle, temporary_model)
        os.replace(temporary_model, model_path)
    finally:
        temporary_model.unlink(missing_ok=True)
    daily_path = result_root / "calibration_oof_daily.parquet"
    write_daily(daily_path, daily)
    payload = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "calibration-development-selection",
        "code_commit": commit,
        "months": months,
        "primary_candidate": PRIMARY_CANDIDATE,
        "probability_bins": bins,
        "bootstrap_repetitions": int(
            config["calibration"]["bootstrap_repetitions"]
        ),
        "selection": {
            "global": global_evidence,
            "bands": band_evidence,
            "band_distances": leaf_evidence,
            "selected_global": bool(global_evidence["selected"]),
            "selected_bands": selected_bands,
            "selected_band_distances": [list(value) for value in selected_leaves],
            "leaf_candidate_choices": choices,
        },
        "candidate_metrics": metrics,
        "artifacts": {
            "calibrator": artifact(model_path),
            "oof_daily": artifact(daily_path),
            "prediction_manifest": artifact(prediction_manifest_path),
        },
        "environment": {
            "platform": platform.platform(),
            "python": sys.version.split()[0],
            "numpy": np.__version__,
            "pyarrow": pa.__version__,
            "joblib": joblib.__version__,
        },
        "seconds": time.time() - started,
        "november_gate_read": False,
        "locked_archive_test_read": False,
    }
    output = result_root / "calibration_selection.json"
    atomic_write_json(output, payload)
    print(output)


if __name__ == "__main__":
    main()
