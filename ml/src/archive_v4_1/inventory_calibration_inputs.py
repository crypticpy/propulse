#!/usr/bin/env python3
"""Freeze full-scale February/April/May/August calibration input files."""

from __future__ import annotations

import argparse
import platform
import sys
from pathlib import Path

import pyarrow
import pyarrow.parquet as pq
import xgboost

from calibration_inputs import (
    discover_inputs,
    feature_order_sha256,
    inventory_entry,
)
from protocol import ROOT, artifact, atomic_write_json, load_json, sha256, utc_now


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_1.json"
DEFAULT_OUTPUT = (
    ROOT
    / "ml/results/propagation_v4_1/preregistration/calibration_input_inventory.json"
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile

    config = load_json(Path(args.config))
    manifest = load_json(
        ROOT / "ml/results/propagation_v4_1/preregistration/run_manifest.json"
    )
    if manifest["november_gate_opened"] or manifest["locked_archive_test_opened"]:
        raise RuntimeError("calibration inventory must precede locked outcome access")
    development = load_json(ROOT / config["frozen_candidates"]["v4_results"])
    candidate = development["candidates"]["M2_nowcast"]
    features = [str(value) for value in candidate["features"]]
    inputs = discover_inputs(config)
    schema_names = set(pq.read_schema(next(iter(inputs.values())).path).names)
    missing = [name for name in features if name not in schema_names]
    if missing:
        raise RuntimeError(f"frozen M2 features missing from calibration inputs: {missing}")
    model_path = ROOT / candidate["model_path"]
    expected_model = load_json(
        ROOT
        / "ml/results/propagation_v4_1/preregistration/b2_october_engineering.json"
    )["frozen_artifacts"]["m2_model"]
    if sha256(model_path) != expected_model["sha256"]:
        raise RuntimeError("frozen M2 model checksum changed")
    payload = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "scope": "calibration-development-input-inventory",
        "months": list(inputs),
        "outcome_metrics_read": False,
        "november_gate_read": False,
        "locked_archive_test_read": False,
        "probability_bins": int(config["calibration"]["sufficient_statistic_bins"]),
        "stream_batch_rows": int(config["calibration"]["stream_batch_rows"]),
        "feature_count": len(features),
        "feature_order_sha256": feature_order_sha256(features),
        "model": artifact(model_path),
        "best_iteration": int(candidate["best_iteration"]),
        "input_schema_sha256": next(iter(inputs.values())).schema_sha256,
        "inputs": {month: inventory_entry(value) for month, value in inputs.items()},
        "environment": {
            "platform": platform.platform(),
            "python": sys.version.split()[0],
            "pyarrow": pyarrow.__version__,
            "xgboost": xgboost.__version__,
        },
    }
    atomic_write_json(Path(args.output), payload)
    print(Path(args.output))


if __name__ == "__main__":
    main()
