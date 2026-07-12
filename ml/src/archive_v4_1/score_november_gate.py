#!/usr/bin/env python3
"""Stream the once-opened November gate through every frozen candidate."""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb

from b2_adapter import apply_v3_calibrator, feature_matrix, load_profile
from calibration import HierarchyModels, predict_family_arrays
from gate_scoring import PRIMARY, decide_gates
from protocol import DEFAULT_CONFIG, DEFAULT_MANIFEST, ProtocolError, artifact, atomic_write_json, load_json, resume_one_shot, utc_now


ROOT = Path(__file__).resolve().parents[3]
V4 = ROOT / "ml/src/archive_v4"
sys.path.insert(0, str(V4))
from external_memory import MetricAccumulator  # noqa: E402


AUDIT_DISTANCE_BINS = (
    ("0-500km", 0.0, 500.0),
    ("500-1500km", 500.0, 1_500.0),
    ("1500-3000km", 1_500.0, 3_000.0),
    ("3000-6000km", 3_000.0, 6_000.0),
    ("6000-10000km", 6_000.0, 10_000.0),
    ("10000km+", 10_000.0, np.inf),
    ("under-3000km", 0.0, 3_000.0),
)
CALIBRATION_CANDIDATES = (
    "C0_identity",
    "C1_global_isotonic",
    "C2_per_band_isotonic",
    "C3_hierarchical_isotonic",
)


def numeric(batch: Any, name: str, dtype: Any = np.float32) -> np.ndarray:
    column = batch.column(name)
    if column.null_count:
        column = pc.fill_null(column, 0)
    return np.asarray(column.to_numpy(zero_copy_only=False), dtype=dtype)


class CandidateMetrics:
    def __init__(self) -> None:
        self.overall = MetricAccumulator()
        self.bands: dict[str, MetricAccumulator] = {}
        self.audit_distance = {
            label: MetricAccumulator() for label, _, _ in AUDIT_DISTANCE_BINS
        }

    def update(
        self,
        target: np.ndarray,
        prediction: np.ndarray,
        weight: np.ndarray,
        bands: np.ndarray,
        distance: np.ndarray,
    ) -> None:
        self.overall.update(target, prediction, weight)
        for band in np.unique(bands):
            mask = bands == band
            self.bands.setdefault(str(band), MetricAccumulator()).update(
                target[mask], prediction[mask], weight[mask]
            )
        for label, lower, upper in AUDIT_DISTANCE_BINS:
            mask = (distance >= lower) & (distance < upper)
            if np.any(mask):
                self.audit_distance[label].update(
                    target[mask], prediction[mask], weight[mask]
                )

    def result(self) -> dict[str, Any]:
        value = self.overall.result()
        value["slices"] = {
            "band": {
                band: accumulator.result()
                for band, accumulator in sorted(self.bands.items())
            },
            "audit_distance": {
                label: accumulator.result()
                for label, accumulator in self.audit_distance.items()
                if accumulator.rows
            },
        }
        return value


def apply_calibrator(calibrator: Any, raw: np.ndarray, bands: np.ndarray, distance: np.ndarray) -> np.ndarray:
    try:
        return np.asarray(calibrator.predict(raw, bands, distance), dtype=np.float64)
    except TypeError:
        try:
            return np.asarray(calibrator.predict(raw, bands), dtype=np.float64)
        except TypeError:
            return np.asarray(calibrator.predict(raw), dtype=np.float64)


def climatology_prediction(
    rates: dict[str, Any],
    bands: np.ndarray,
    hours: np.ndarray,
) -> np.ndarray:
    global_rate = float(rates["global_rate"])
    output = np.full(len(bands), global_rate, dtype=np.float64)
    values = rates["band_hour_rates"]
    for index, (band, hour) in enumerate(zip(bands, hours)):
        output[index] = float(values.get(f"{band}|{int(hour)}", global_rate))
    return output


def add_daily(
    daily: dict[tuple[str, str], np.ndarray],
    days: np.ndarray,
    name: str,
    target: np.ndarray,
    prediction: np.ndarray,
    weight: np.ndarray,
) -> None:
    for day in np.unique(days):
        mask = days == day
        selected_weight = weight[mask]
        daily[(str(day), name)] += np.array(
            [
                float(selected_weight.sum()),
                float(np.dot(selected_weight, np.square(prediction[mask] - target[mask]))),
                int(mask.sum()),
            ],
            dtype=np.float64,
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--attempt-id", required=True)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--integrity-audit", type=Path, required=True)
    parser.add_argument("--climatology", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile

    config = load_json(Path(args.config))
    run_manifest = load_json(DEFAULT_MANIFEST)
    resume_one_shot(run_manifest, "november-gate", args.attempt_id)
    if config["data_roles"]["untouched_development_gate"] != ["2024-11"]:
        raise ProtocolError("November scorer requires the exact frozen gate month")
    audit = load_json(args.integrity_audit)
    validation = load_json(
        ROOT
        / "ml/results/propagation_v4_1"
        / config["run_id"]
        / "candidate_validation.json"
    )
    if not args.dataset.exists():
        raise FileNotFoundError(args.dataset)

    v4_results = load_json(ROOT / config["frozen_candidates"]["v4_results"])
    v3_results = load_json(ROOT / config["frozen_candidates"]["v3_results"])
    m1_info = v4_results["candidates"]["M1_physics"]
    m2_info = v4_results["candidates"]["M2_nowcast"]
    m1_model = xgb.Booster()
    m1_model.load_model(ROOT / m1_info["model_path"])
    m1_calibrator = joblib.load(ROOT / m1_info["calibrator_path"])
    m2_model = xgb.Booster()
    m2_model.load_model(ROOT / m2_info["model_path"])
    selected_calibrator = joblib.load(
        ROOT / run_manifest["frozen_artifacts"]["selected_calibrator"]["path"]
    )
    hierarchy = HierarchyModels(
        selected_calibrator.global_model,
        selected_calibrator.band_models,
        selected_calibrator.band_distance_models,
    )
    b2 = load_profile("nowcast", v3_results["profiles"]["nowcast"], ROOT)
    m1_features = [str(value) for value in m1_info["features"]]
    m2_features = [str(value) for value in m2_info["features"]]
    union_features = list(dict.fromkeys([*m2_features, *m1_features, *b2.features]))
    columns = [
        *union_features,
        "target_hour",
        "band",
        "dist_km",
        "success_rate",
        "opportunities",
    ]
    scanner = ds.dataset(args.dataset, format="parquet").scanner(
        columns=columns,
        batch_size=int(config["calibration"]["stream_batch_rows"]),
        use_threads=True,
    )
    rates = load_json(args.climatology)
    metrics: dict[str, CandidateMetrics] = {
        name: CandidateMetrics()
        for name in (
            "B0_climatology",
            "M1_physics",
            "B2_frozen_v3",
            "M2_raw",
            *CALIBRATION_CANDIDATES,
            PRIMARY,
        )
    }
    daily: dict[tuple[str, str], np.ndarray] = defaultdict(lambda: np.zeros(3))
    rows = 0
    for batch_index, batch in enumerate(scanner.to_batches(), 1):
        feature_columns = {name: numeric(batch, name) for name in union_features}
        bands = np.asarray(batch.column("band").to_pylist(), dtype=str)
        distance = numeric(batch, "dist_km", np.float64)
        target = numeric(batch, "success_rate", np.float64)
        weight = numeric(batch, "opportunities", np.float64)
        days = np.asarray(
            pc.strftime(batch.column("target_hour"), format="%Y-%m-%d").to_pylist(),
            dtype=str,
        )
        hours = np.asarray(pc.hour(batch.column("target_hour")).to_numpy(), dtype=np.int16)
        m2_raw = m2_model.inplace_predict(
            feature_matrix(feature_columns, m2_features),
            iteration_range=(0, int(m2_info["best_iteration"]) + 1),
        ).astype(np.float64)
        predictions: dict[str, np.ndarray] = {
            "B0_climatology": climatology_prediction(rates, bands, hours),
            "M2_raw": m2_raw,
        }
        m1_raw = m1_model.inplace_predict(
            feature_matrix(feature_columns, m1_features),
            iteration_range=(0, int(m1_info["best_iteration"]) + 1),
        )
        predictions["M1_physics"] = apply_calibrator(
            m1_calibrator, m1_raw, bands, distance
        )
        _, predictions["B2_frozen_v3"] = b2.predict(feature_columns, bands)
        for candidate in CALIBRATION_CANDIDATES:
            predictions[candidate] = predict_family_arrays(
                hierarchy, m2_raw, bands, distance, candidate
            )
        predictions[PRIMARY] = selected_calibrator.predict(m2_raw, bands, distance)
        for name, prediction in predictions.items():
            values = np.clip(np.asarray(prediction, dtype=np.float64), 1e-7, 1 - 1e-7)
            metrics[name].update(target, values, weight, bands, distance)
            add_daily(daily, days, name, target, values, weight)
        rows += batch.num_rows
        if batch_index % 50 == 0:
            print(f"November gate: batches={batch_index} rows={rows:,}", flush=True)

    metric_results = {name: value.result() for name, value in metrics.items()}
    daily_rows = [
        {
            "day": day,
            "candidate": candidate,
            "weighted_opportunities": float(values[0]),
            "weighted_squared_error": float(values[1]),
            "rows": int(values[2]),
        }
        for (day, candidate), values in sorted(daily.items())
    ]
    decision = decide_gates(
        metric_results,
        daily_rows,
        config,
        integrity_passed=bool(audit.get("passed", False)),
        fallback_passed=bool(validation.get("passed", False)),
        serving_parity_passed=bool(validation.get("gates", {}).get("offline_service_parity", False)),
    )
    result = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "untouched_november_gate",
        "attempt_id": args.attempt_id,
        "months": ["2024-11"],
        "november_gate_read": True,
        "locked_archive_test_read": False,
        "rows": rows,
        "dataset": artifact(args.dataset),
        "integrity_audit": artifact(args.integrity_audit),
        "metrics": metric_results,
        "daily": daily_rows,
        "decision": decision,
        "b1_p533": {
            "status": "frozen_bounded_sample_baseline",
            "development_evidence": artifact(
                ROOT
                / "ml/results/propagation_v4"
                / config["parent_run_id"]
                / "p533_validation_results.json"
            ),
        },
        "frozen_artifacts": {
            name: value
            for name, value in run_manifest["frozen_artifacts"].items()
            if name in {"candidate_freeze", "scorer_freeze", "b2_freeze"}
        },
    }
    atomic_write_json(args.output, result)
    print(args.output)


if __name__ == "__main__":
    main()
