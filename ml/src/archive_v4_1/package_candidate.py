#!/usr/bin/env python3
"""Package the frozen V4 core models with the selected V4.1 calibrator."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any

from protocol import DEFAULT_CONFIG, DEFAULT_MANIFEST, ProtocolError, artifact, atomic_write_json, load_json, utc_now


ROOT = Path(__file__).resolve().parents[3]
RESULT_ROOT = ROOT / "ml/results/propagation_v4_1"


def atomic_copy(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        dir=destination.parent,
        prefix=f".{destination.name}.",
        suffix=".tmp",
    )
    os.close(descriptor)
    try:
        shutil.copyfile(source, temporary)
        with open(temporary, "rb") as handle:
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def profile(
    name: str,
    source: dict[str, Any],
    model_source: Path,
    calibrator_source: Path,
    bundle: Path,
) -> dict[str, Any]:
    model_target = bundle / f"{name}.json"
    calibrator_target = bundle / f"{name}.isotonic.joblib"
    atomic_copy(model_source, model_target)
    atomic_copy(calibrator_source, calibrator_target)
    return {
        "model_path": model_target.name,
        "model_sha256": artifact(model_target)["sha256"],
        "calibrator_path": calibrator_target.name,
        "calibrator_sha256": artifact(calibrator_target)["sha256"],
        "features": [str(value) for value in source["features"]],
        "best_iteration": int(source["best_iteration"]),
        "calibration_method": (
            "guarded_band_distance_isotonic_with_identity_fallback"
            if name == "nowcast"
            else str(source["calibration_method"])
        ),
        "top_factors": [
            str(row["feature"])
            for row in source.get("feature_importance_gain", [])[:8]
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile

    config = load_json(Path(args.config))
    run_manifest = load_json(DEFAULT_MANIFEST)
    required = ("calibration_selection", "selected_calibrator", "b2_freeze")
    missing = [name for name in required if name not in run_manifest["frozen_artifacts"]]
    if missing:
        raise ProtocolError(f"candidate packaging requires frozen artifacts: {missing}")
    if run_manifest["november_gate_opened"]:
        raise ProtocolError("candidate packaging is forbidden after November access")

    v4_results_path = ROOT / config["frozen_candidates"]["v4_results"]
    v4_results = load_json(v4_results_path)
    candidates = v4_results["candidates"]
    physics = candidates["M1_physics"]
    nowcast = candidates["M2_nowcast"]
    if int(physics["train_cap"]) != 50_000_000 or int(nowcast["train_cap"]) != 50_000_000:
        raise ProtocolError("V4.1 requires the frozen 50M M1 and M2 models")

    selected_source = ROOT / run_manifest["frozen_artifacts"]["selected_calibrator"]["path"]
    if artifact(selected_source) != run_manifest["frozen_artifacts"]["selected_calibrator"]:
        raise ProtocolError("selected calibrator no longer matches the frozen ledger")

    bundle = ROOT / "ml/models/archive_v4_1" / config["run_id"] / "serving"
    bundle.mkdir(parents=True, exist_ok=True)
    profiles = {
        "physics": profile(
            "physics",
            physics,
            ROOT / physics["model_path"],
            ROOT / physics["calibrator_path"],
            bundle,
        ),
        "nowcast": profile(
            "nowcast",
            nowcast,
            ROOT / nowcast["model_path"],
            selected_source,
            bundle,
        ),
    }
    selection_path = ROOT / run_manifest["frozen_artifacts"]["calibration_selection"]["path"]
    selection = load_json(selection_path)
    manifest = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "run_id": config["run_id"],
        "model_version": f"{config['run_id']}-candidate-50000000",
        "release_stage": "development_candidate",
        "release_approved": False,
        "november_gate_scored": False,
        "locked_archive_test_scored": False,
        "prospective_test_scored": False,
        "feature_contract": "station-chain-v1",
        "core_feature_contract": "archive-v4-features-v1",
        "train_cap": 50_000_000,
        "primary_candidate": selection["primary_candidate"],
        "selection_sha256": artifact(selection_path)["sha256"],
        "profiles": profiles,
        "limitations": [
            "This bundle is a frozen pre-November development candidate.",
            "It is not release-approved and has not been scored on November 2024.",
            "The locked 2025 archive and prospective tests remain unopened.",
            "Probabilities retain the WSPR single-decode estimand.",
        ],
    }
    output = bundle / "serving_manifest.json"
    atomic_write_json(output, manifest)
    public_manifest = RESULT_ROOT / config["run_id"] / "serving_candidate_manifest.json"
    atomic_write_json(
        public_manifest,
        {
            **manifest,
            "bundle_manifest": artifact(output),
            "profiles": {
                name: {
                    **item,
                    "model_path": f"ml/models/archive_v4_1/{config['run_id']}/serving/{item['model_path']}",
                    "calibrator_path": f"ml/models/archive_v4_1/{config['run_id']}/serving/{item['calibrator_path']}",
                }
                for name, item in profiles.items()
            },
        },
    )
    print(public_manifest)


if __name__ == "__main__":
    main()
