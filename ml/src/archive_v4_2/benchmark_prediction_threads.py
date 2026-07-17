#!/usr/bin/env python3
"""Select the fastest exact XGBoost prediction thread count on the M5."""

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
from pathlib import Path
from typing import Any

import numpy as np
import pyarrow.dataset as ds
import xgboost as xgb


ROOT = Path(__file__).resolve().parents[3]
V4_1 = ROOT / "ml/src/archive_v4_1"
MODULE = Path(__file__).resolve().parent
for path in (V4_1, MODULE):
    sys.path.insert(0, str(path))

from b2_adapter import load_profile  # noqa: E402
from m5_runtime import configure_arrow_threads, validate_m5_runtime  # noqa: E402
from phase2_core import Phase2Error, validate_config  # noqa: E402
from score_phase2_scale import numeric  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V3_RESULTS = ROOT / "ml/results/archive_v3/archive_v3_eight_month/hf_results.json"
MANIFEST = ROOT / "ml/data/manifests/propagation_v4_2_phase2_20m_cohorts.json"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "prediction_thread_benchmark.json"
)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


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


def prediction_digest(prediction: np.ndarray) -> str:
    values = np.asarray(prediction, dtype=np.float32)
    return hashlib.sha256(values.tobytes(order="C")).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def select_fastest_exact(results: list[dict[str, Any]]) -> int:
    if not results:
        raise Phase2Error("prediction benchmark has no results")
    digests = {str(row["prediction_sha256"]) for row in results}
    if len(digests) != 1 or any(float(row["maximum_absolute_delta"]) != 0 for row in results):
        raise Phase2Error("prediction thread counts are not bit-identical")
    return int(min(results, key=lambda row: float(row["median_seconds"]))["threads"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--manifest", default=str(MANIFEST))
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--rows", type=int, default=100_000)
    parser.add_argument("--repeats", type=int, default=5)
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()
    del args.profile
    if args.rows < 10_000 or args.repeats < 5:
        raise Phase2Error("benchmark requires at least 10,000 rows and five repeats")
    config = load_json(Path(args.config))
    validate_config(config)
    runtime = validate_m5_runtime(config, xgboost_module=xgb)
    arrow = configure_arrow_threads(config, parallel_fit=False)
    manifest_path = Path(args.manifest)
    manifest = load_json(manifest_path)
    if manifest["december_2024_read"] or manifest["locked_2025_read"]:
        raise Phase2Error("benchmark manifest reports locked outcome access")
    final_fold = str(config["final_fold"])
    sample_item = manifest["early_stopping"][final_fold]
    sample_path = ROOT / sample_item["path"]
    if sample_path.stat().st_size != int(sample_item["bytes"]):
        raise Phase2Error("prediction benchmark sample size changed")
    if file_sha256(sample_path) != str(sample_item["sha256"]):
        raise Phase2Error("prediction benchmark sample checksum changed")
    v3 = load_json(V3_RESULTS)["profiles"]["nowcast"]
    profile = load_profile("nowcast", v3, ROOT)
    table = ds.dataset(sample_path, format="parquet").head(
        args.rows, columns=profile.features
    )
    if table.num_rows != args.rows:
        raise Phase2Error("prediction benchmark sample is shorter than requested")
    batch = table.combine_chunks().to_batches()[0]
    matrix = np.column_stack(
        [numeric(batch, name, np.float32) for name in profile.features]
    )
    thread_counts = [1, 6, 9, 12, 18]
    durations = {threads: [] for threads in thread_counts}
    predictions: dict[int, np.ndarray] = {}
    for threads in thread_counts:
        profile.model.set_param({"nthread": threads})
        profile.model.inplace_predict(
            matrix[: min(10_000, len(matrix))],
            iteration_range=(0, profile.best_iteration + 1),
        )
    for repeat in range(args.repeats):
        offset = repeat % len(thread_counts)
        order = thread_counts[offset:] + thread_counts[:offset]
        for threads in order:
            profile.model.set_param({"nthread": threads})
            started = time.perf_counter()
            prediction = profile.model.inplace_predict(
                matrix,
                iteration_range=(0, profile.best_iteration + 1),
            )
            durations[threads].append(time.perf_counter() - started)
            predictions[threads] = prediction.copy()
    reference = predictions[thread_counts[0]]
    results = []
    for threads in thread_counts:
        prediction = predictions[threads]
        results.append(
            {
                "threads": threads,
                "seconds": durations[threads],
                "median_seconds": float(np.median(durations[threads])),
                "minimum_seconds": float(np.min(durations[threads])),
                "prediction_sha256": prediction_digest(prediction),
                "maximum_absolute_delta": float(
                    np.max(np.abs(prediction.astype(np.float64) - reference))
                ),
            }
        )
    selected = select_fastest_exact(results)
    output = {
        "schema_version": 1,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "scope": "execution_only_no_evaluation_outcomes",
        "rows": args.rows,
        "repeats": args.repeats,
        "features": len(profile.features),
        "best_iteration": profile.best_iteration,
        "sample": sample_item,
        "sample_sha256_verified_this_run": True,
        "measurement_order_rotated": True,
        "december_2024_read": False,
        "locked_2025_read": False,
        "results": results,
        "selected_threads": selected,
        "all_predictions_bit_identical": True,
        "compute": {
            **runtime,
            **arrow,
            "platform": platform.platform(),
            "numpy": np.__version__,
            "xgboost": xgb.__version__,
            "peak_rss_gb": peak_rss_gb(),
        },
    }
    atomic_write(Path(args.output), output)
    print(Path(args.output))


if __name__ == "__main__":
    main()
