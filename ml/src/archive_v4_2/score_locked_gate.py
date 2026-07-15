#!/usr/bin/env python3
"""Stream a once-opened V4.2 outcome gate through the frozen candidate."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import platform
import resource
import sys
import time
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pyarrow.compute as pc
import pyarrow.dataset as ds
import xgboost as xgb


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
SERVICE = ROOT / "ml/service"
V4 = ROOT / "ml/src/archive_v4"
V4_1 = ROOT / "ml/src/archive_v4_1"
for path in (V4, V4_1, SERVICE, MODULE):
    sys.path.insert(0, str(path))

from b2_adapter import load_profile  # noqa: E402
from gate_scoring import decide_archive, decide_december  # noqa: E402
from m5_runtime import configure_arrow_threads  # noqa: E402
from outcome_protocol import (  # noqa: E402
    DEFAULT_MANIFEST,
    OutcomeProtocolError,
    atomic_write,
    load_json,
    record_scope_result,
    resume_scope,
    sha256,
    verify_frozen_artifacts,
)
from score_phase2_scale import (  # noqa: E402
    CALIBRATION_BINS,
    STAT_SIZE,
    add_group,
    calibration_result,
    contributions,
    distance_labels,
    feature_matrix,
    indices,
    numeric,
    stats_result,
    update_calibration,
)
from train_phase2_scale import validate_m5_runtime  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V3_RESULTS = ROOT / "ml/results/archive_v3/archive_v3_eight_month/hf_results.json"


def peak_rss_gb() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    divisor = 1024**3 if sys.platform == "darwin" else 1024**2
    return float(value / divisor)


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repository_path(value: str | Path) -> Path:
    path = Path(value)
    path = path if path.is_absolute() else ROOT / path
    try:
        path.relative_to(ROOT)
    except ValueError as error:
        raise OutcomeProtocolError(
            f"gate inputs must use a repository path: {path}"
        ) from error
    return path


def parse_datasets(values: list[str], expected: list[str]) -> dict[str, Path]:
    parsed: dict[str, Path] = {}
    for value in values:
        month, separator, raw_path = value.partition("=")
        if not separator or not month or not raw_path or month in parsed:
            raise OutcomeProtocolError(f"invalid --dataset value: {value}")
        parsed[month] = repository_path(raw_path)
    if list(parsed) != expected:
        raise OutcomeProtocolError(
            f"gate datasets must be ordered exactly {expected}; got {list(parsed)}"
        )
    return parsed


def week_labels(days: np.ndarray) -> np.ndarray:
    unique = np.unique(days.astype(str))
    lookup = {}
    for value in unique:
        iso = date.fromisoformat(str(value)).isocalendar()
        lookup[str(value)] = f"{iso.year}-W{iso.week:02d}"
    return np.asarray([lookup[str(value)] for value in days], dtype="<U8")


def verified_inputs(
    paths: dict[str, Path], audit: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    if not audit.get("passed"):
        raise OutcomeProtocolError("gate integrity audit did not pass")
    if list(map(str, audit.get("months", []))) != list(paths):
        raise OutcomeProtocolError("integrity audit month inventory differs")
    datasets = audit.get("datasets", {})
    output = {}
    for month, path in paths.items():
        expected = datasets.get(month)
        if expected is None:
            raise OutcomeProtocolError(f"integrity audit lacks dataset: {month}")
        if not path.is_file() or path.stat().st_size != int(expected["bytes"]):
            raise OutcomeProtocolError(f"gate dataset size differs: {month}")
        digest = file_sha256(path)
        if digest != str(expected["sha256"]):
            raise OutcomeProtocolError(f"gate dataset checksum differs: {month}")
        output[month] = {
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": digest,
            "rows": 0,
        }
    return output


class BundlePredictor:
    def __init__(self, manifest_path: Path) -> None:
        self.manifest_path = manifest_path
        payload = load_json(manifest_path)
        profile = payload["profiles"]["nowcast"]
        items = (
            list(profile["components"])
            if profile.get("kind") == "weighted_ensemble"
            else [profile]
        )
        self.features = list(map(str, items[0]["features"]))
        self.components = []
        weights = []
        for item in items:
            features = list(map(str, item["features"]))
            if features != self.features:
                raise OutcomeProtocolError("bundle component feature order differs")
            model_path = (manifest_path.parent / item["model_path"]).resolve()
            calibrator_path = (
                manifest_path.parent / item["calibrator_path"]
            ).resolve()
            if sha256(model_path) != str(item["model_sha256"]):
                raise OutcomeProtocolError("bundle model checksum differs")
            if sha256(calibrator_path) != str(item["calibrator_sha256"]):
                raise OutcomeProtocolError("bundle calibrator checksum differs")
            model = xgb.Booster()
            model.load_model(model_path)
            weight = float(item.get("weight", 1.0))
            weights.append(weight)
            self.components.append(
                {
                    "model": model,
                    "calibrator": joblib.load(calibrator_path),
                    "best_iteration": int(item["best_iteration"]),
                    "weight": weight,
                }
            )
        if any(value < 0 for value in weights) or not np.isclose(sum(weights), 1.0):
            raise OutcomeProtocolError("bundle weights are invalid")

    def predict(
        self,
        columns: dict[str, np.ndarray],
        bands: np.ndarray,
        distance: np.ndarray,
    ) -> np.ndarray:
        matrix = feature_matrix(columns, self.features)
        prediction = np.zeros(len(bands), dtype=np.float64)
        for item in self.components:
            raw = item["model"].inplace_predict(
                matrix,
                iteration_range=(0, item["best_iteration"] + 1),
            )
            calibrated = item["calibrator"].predict(raw, bands, distance)
            prediction += float(item["weight"]) * np.asarray(
                calibrated, dtype=np.float64
            )
        return prediction


def score(
    paths: dict[str, Path],
    input_artifacts: dict[str, dict[str, Any]],
    config: dict[str, Any],
    bundle_path: Path,
) -> tuple[dict[str, Any], int]:
    candidate = BundlePredictor(bundle_path)
    v3_results = load_json(V3_RESULTS)
    b2 = load_profile("nowcast", v3_results["profiles"]["nowcast"], ROOT)
    features = list(dict.fromkeys([*candidate.features, *b2.features]))
    variants = ("candidate", "B2_frozen_v3")
    dimensions = ("month", "day", "week", "band", "distance")
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
                *features,
                "target_hour",
                "band",
                "dist_km",
                "success_rate",
                "opportunities",
            ]
        )
    )
    batch_rows = int(
        config["phase4" if list(paths) == config["phase4"]["gate_months"] else "phase5"]
        ["batch_rows"]
    )
    scored_rows = 0
    for month, path in paths.items():
        scanner = ds.dataset(path, format="parquet").scanner(
            columns=projection, batch_size=batch_rows, use_threads=True
        )
        month_rows = 0
        for batch_index, batch in enumerate(scanner.to_batches(), 1):
            columns = {name: numeric(batch, name) for name in features}
            target = numeric(batch, "success_rate", np.float64)
            weight = numeric(batch, "opportunities", np.float64)
            bands = np.asarray(batch.column("band").to_pylist(), dtype=str)
            distance = numeric(batch, "dist_km", np.float64)
            days = np.asarray(
                pc.strftime(
                    batch.column("target_hour"), format="%Y-%m-%d"
                ).to_pylist(),
                dtype=str,
            )
            if any(not value.startswith(month) for value in np.unique(days)):
                raise OutcomeProtocolError(
                    f"gate dataset contains rows outside {month}"
                )
            labels = {
                "month": np.full(len(target), month, dtype="<U7"),
                "day": days,
                "week": week_labels(days),
                "band": bands,
                "distance": distance_labels(distance),
            }
            grouping = {name: indices(value) for name, value in labels.items()}
            predictions = {
                "candidate": candidate.predict(columns, bands, distance),
            }
            _, b2_prediction = b2.predict(columns, bands)
            predictions["B2_frozen_v3"] = b2_prediction.astype(np.float64)
            for name, prediction in predictions.items():
                values = contributions(target, prediction, weight)
                overall[name] += np.asarray(
                    [value.sum() for value in values], dtype=np.float64
                )
                for dimension in dimensions:
                    add_group(
                        groups[name][dimension], grouping[dimension], values
                    )
                update_calibration(
                    calibration[name], target, prediction, weight
                )
            month_rows += batch.num_rows
            if batch_index % 50 == 0:
                print(
                    f"gate {month}: batches={batch_index} rows={month_rows:,}",
                    flush=True,
                )
        input_artifacts[month]["rows"] = month_rows
        scored_rows += month_rows
        gc.collect()
        print(f"scored gate month {month}: {month_rows:,} rows", flush=True)
    metrics = {
        name: {
            "overall": {
                **stats_result(overall[name]),
                **calibration_result(*calibration[name]),
            },
            "slices": {
                dimension: [
                    {"key": key, **stats_result(value)}
                    for key, value in sorted(groups[name][dimension].items())
                ]
                for dimension in dimensions
            },
        }
        for name in variants
    }
    return metrics, scored_rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--scope", choices=("december", "archive"), required=True)
    parser.add_argument("--attempt-id", required=True)
    parser.add_argument("--dataset", action="append", default=[], required=True)
    parser.add_argument("--integrity-audit", required=True)
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--output")
    args = parser.parse_args()
    del args.profile
    started = time.monotonic()
    config_path = Path(args.config).resolve()
    manifest_path = Path(args.manifest).resolve()
    config = load_json(config_path)
    runtime = validate_m5_runtime(config)
    arrow = configure_arrow_threads(config, parallel_fit=False)
    manifest = load_json(manifest_path)
    resume_scope(manifest, args.scope, args.attempt_id)
    verify_frozen_artifacts(manifest_path)
    months = list(
        map(
            str,
            config["phase4"]["gate_months"]
            if args.scope == "december"
            else config["phase5"]["locked_months"],
        )
    )
    paths = parse_datasets(args.dataset, months)
    audit_path = repository_path(args.integrity_audit)
    audit = load_json(audit_path)
    inputs = verified_inputs(paths, audit)
    result_dir = ROOT / "ml/results/propagation_v4_2" / config["run_id"]
    bundle_path = (
        ROOT
        / "ml/models/archive_v4_2"
        / config["run_id"]
        / "serving/serving_manifest.json"
    )
    phase3_path = result_dir / "phase3_candidate_validation.json"
    phase3 = load_json(phase3_path)
    if not phase3["passed"]:
        raise OutcomeProtocolError("Phase 3 validation no longer passes")
    metrics, rows = score(paths, inputs, config, bundle_path)
    if args.scope == "december":
        decision = decide_december(
            metrics,
            phase3,
            audit,
            config,
            locked_2025_read=bool(manifest["archive_opened"]),
        )
    else:
        decision = decide_archive(
            metrics,
            phase3,
            audit,
            config,
            prospective_read=bool(manifest["prospective_opened"]),
        )
    output_path = (
        repository_path(args.output)
        if args.output
        else result_dir / f"{args.scope}_gate_result.json"
    )
    output = {
        "schema_version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_id": config["run_id"],
        "scope": args.scope,
        "attempt_id": args.attempt_id,
        "months": months,
        "december_2024_read": True,
        "locked_2025_read": args.scope == "archive",
        "prospective_read": False,
        "rows": rows,
        "datasets": inputs,
        "integrity_audit": {
            "path": audit_path.relative_to(ROOT).as_posix(),
            "bytes": audit_path.stat().st_size,
            "sha256": file_sha256(audit_path),
        },
        "bundle_manifest": {
            "path": bundle_path.relative_to(ROOT).as_posix(),
            "bytes": bundle_path.stat().st_size,
            "sha256": file_sha256(bundle_path),
        },
        "phase3_validation": {
            "path": phase3_path.relative_to(ROOT).as_posix(),
            "bytes": phase3_path.stat().st_size,
            "sha256": file_sha256(phase3_path),
        },
        "metrics": metrics,
        "decision": decision,
        "compute": {
            **runtime,
            **arrow,
            "wall_seconds": time.monotonic() - started,
            "peak_rss_gb": peak_rss_gb(),
            "platform": platform.platform(),
        },
    }
    atomic_write(output_path, output)
    record_scope_result(manifest_path, args.scope, args.attempt_id, output_path)
    print(output_path)


if __name__ == "__main__":
    main()
