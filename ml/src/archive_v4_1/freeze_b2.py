#!/usr/bin/env python3
"""Verify and freeze the complete V3/B2 model bundle on the M5."""

from __future__ import annotations

import argparse
import json
import platform
import sys
from pathlib import Path
from typing import Any

import joblib
import xgboost as xgb

from protocol import ROOT, artifact, atomic_write_json, load_json, sha256, utc_now


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_1.json"
DEFAULT_OUTPUT = (
    ROOT / "ml/results/propagation_v4_1/preregistration/b2_freeze.json"
)


def verify_published_evidence(freeze: dict[str, Any]) -> list[dict[str, Any]]:
    verified = []
    for item in freeze["evidence_artifacts"]:
        path = ROOT / item["path"]
        if not path.exists():
            raise FileNotFoundError(path)
        observed = sha256(path)
        if observed != item["sha256"]:
            raise RuntimeError(f"published V3 evidence checksum mismatch: {path}")
        verified.append(artifact(path))
    return verified


def profile_artifacts(
    name: str,
    info: dict[str, Any],
) -> dict[str, Any]:
    model_path = ROOT / info["model_path"]
    calibrator_path = model_path.with_suffix(".isotonic.joblib")
    model = xgb.Booster()
    model.load_model(model_path)
    features = [str(value) for value in info["features"]]
    if model.feature_names is not None and model.feature_names != features:
        raise RuntimeError(f"V3 {name} model feature order changed")
    calibrator = joblib.load(calibrator_path)
    calibration_method = str(info["calibration_method"])
    if calibration_method == "per_band_isotonic":
        if not isinstance(calibrator, dict) or "__global__" not in calibrator:
            raise RuntimeError(f"V3 {name} per-band calibrator is invalid")
    elif not hasattr(calibrator, "predict"):
        raise RuntimeError(f"V3 {name} calibrator is invalid")
    return {
        "name": name,
        "engine": str(info["engine"]),
        "best_iteration": int(info["best_iteration"]),
        "calibration_method": calibration_method,
        "features": features,
        "model": artifact(model_path),
        "calibrator": artifact(calibrator_path),
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
    old_freeze = load_json(ROOT / frozen["v3_freeze"])
    results = load_json(ROOT / frozen["v3_results"])
    evidence = verify_published_evidence(old_freeze)
    profiles = results["profiles"]
    payload = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "baseline_run_id": results["run_id"],
        "baseline_commit": old_freeze["baseline_commit"],
        "platform": platform.platform(),
        "python": sys.version.split()[0],
        "xgboost": xgb.__version__,
        "joblib": joblib.__version__,
        "published_evidence_count": len(evidence),
        "published_evidence_manifest_sha256": sha256(ROOT / frozen["v3_freeze"]),
        "profiles": {
            "physics": profile_artifacts("physics", profiles["physics"]),
            "nowcast": profile_artifacts("nowcast", profiles["nowcast"]),
        },
        "frozen": True,
        "recalibrated": False,
        "refitted": False,
    }
    output = Path(args.output)
    atomic_write_json(output, payload)
    print(output)


if __name__ == "__main__":
    main()
