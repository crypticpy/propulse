#!/usr/bin/env python3
"""Pin the exact M5 prediction-thread benchmark decision into configuration."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
if str(MODULE) not in sys.path:
    sys.path.insert(0, str(MODULE))

import run_paths  # noqa: E402

DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"


class PinError(RuntimeError):
    """Raised when prediction execution cannot be pinned safely."""


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write(path: Path, value: dict[str, Any]) -> None:
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


def validate_decision(benchmark: dict[str, Any]) -> int:
    if benchmark.get("december_2024_read") or benchmark.get("locked_2025_read"):
        raise PinError("benchmark reports locked outcome access")
    if not benchmark.get("all_predictions_bit_identical"):
        raise PinError("benchmark predictions are not bit-identical")
    results = list(benchmark.get("results", []))
    if {int(row["threads"]) for row in results} != {1, 6, 9, 12, 18}:
        raise PinError("benchmark thread inventory is incomplete")
    fastest = int(min(results, key=lambda row: float(row["median_seconds"]))["threads"])
    selected = int(benchmark["selected_threads"])
    if selected != fastest:
        raise PinError("benchmark selection is not the fastest measured setting")
    return selected


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--benchmark")
    args = parser.parse_args()
    config_path = Path(args.config).resolve()
    config = load_json(config_path)
    benchmark_path = Path(
        args.benchmark or run_paths.prediction_thread_benchmark_path(config)
    ).resolve()
    protocol = run_paths.outcome_manifest_path(config)
    if protocol.exists() and load_json(protocol).get("candidate_frozen"):
        raise PinError("prediction execution cannot change after candidate freeze")
    benchmark = load_json(benchmark_path)
    selected = validate_decision(benchmark)
    digest = sha256(benchmark_path)
    hardware = config["compute"]["apple_silicon"]
    existing = hardware.get("single_process_prediction_threads")
    existing_digest = hardware.get("prediction_thread_benchmark_sha256")
    if existing is not None and int(existing) != selected:
        raise PinError("configured prediction threads conflict with benchmark")
    if existing_digest is not None and str(existing_digest) != digest:
        raise PinError("configured benchmark digest conflicts with current artifact")
    hardware["single_process_prediction_threads"] = selected
    hardware["prediction_thread_benchmark_sha256"] = digest
    atomic_write(config_path, config)
    print(
        json.dumps(
            {
                "config": str(config_path),
                "selected_threads": selected,
                "prediction_thread_benchmark_sha256": digest,
            }
        )
    )


if __name__ == "__main__":
    main()
