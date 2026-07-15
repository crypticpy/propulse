#!/usr/bin/env python3
"""Package the frozen V4.2 development candidate for Phase 3 validation."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
sys.path.insert(0, str(MODULE))

from phase2_core import Phase2Error, validate_config  # noqa: E402


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
V4_RESULTS = (
    ROOT
    / "ml/results/propagation_v4/propagation_v4_multiyear_50m"
    / "development_results.json"
)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact(path: Path) -> dict[str, Any]:
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


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


def atomic_copy(source: Path, destination: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=destination.parent, suffix=".tmp")
    os.close(descriptor)
    try:
        shutil.copyfile(source, temporary)
        with open(temporary, "rb") as handle:
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def verify_artifact(item: dict[str, Any]) -> Path:
    path = ROOT / item["path"]
    if path.stat().st_size != int(item["bytes"]) or sha256(path) != item["sha256"]:
        raise Phase2Error(f"artifact changed before packaging: {item['path']}")
    return path


def selected_components(
    evaluation: dict[str, Any], selected: str
) -> list[tuple[str, float]]:
    if selected != "A6_recent_recency_blend":
        return [(selected, 1.0)]
    policy = evaluation.get("a6_policy_selection")
    if policy is None:
        raise Phase2Error("A6 was selected without a frozen policy")
    left_weight = float(policy["selected_left_weight"])
    values = [(str(policy["left"]), left_weight), (str(policy["right"]), 1 - left_weight)]
    if any(weight < 0 for _, weight in values) or not abs(sum(weight for _, weight in values) - 1) <= 1e-12:
        raise Phase2Error("invalid A6 component weights")
    return values


def copied_component(
    name: str,
    weight: float,
    info: dict[str, Any],
    bundle: Path,
    prefix: str,
) -> dict[str, Any]:
    model_source = verify_artifact(info["model"])
    calibrator_source = verify_artifact(info["calibrator"])
    model_target = bundle / f"{prefix}_{name}.json"
    calibrator_target = bundle / f"{prefix}_{name}.joblib"
    atomic_copy(model_source, model_target)
    atomic_copy(calibrator_source, calibrator_target)
    return {
        "component": name,
        "weight": weight,
        "model_path": model_target.name,
        "model_sha256": sha256(model_target),
        "calibrator_path": calibrator_target.name,
        "calibrator_sha256": sha256(calibrator_target),
        "features": list(map(str, info["features"])),
        "best_iteration": int(info["best_iteration"]),
        "calibration_method": str(info["calibration_method"]),
    }


def copied_physics(v4_results: dict[str, Any], bundle: Path) -> dict[str, Any]:
    info = v4_results["candidates"]["M1_physics"]
    model_source = ROOT / info["model_path"]
    calibrator_source = ROOT / info["calibrator_path"]
    model_target = bundle / "physics_M1.json"
    calibrator_target = bundle / "physics_M1.joblib"
    atomic_copy(model_source, model_target)
    atomic_copy(calibrator_source, calibrator_target)
    return {
        "kind": "single",
        "component": "M1_physics",
        "model_path": model_target.name,
        "model_sha256": sha256(model_target),
        "calibrator_path": calibrator_target.name,
        "calibrator_sha256": sha256(calibrator_target),
        "features": list(map(str, info["features"])),
        "best_iteration": int(info["best_iteration"]),
        "calibration_method": str(info["calibration_method"]),
        "top_factors": [
            str(row["feature"])
            for row in info.get("feature_importance_gain", [])[:8]
        ],
    }


def public_profile(profile: dict[str, Any], prefix: str) -> dict[str, Any]:
    if profile["kind"] == "single":
        return {
            **profile,
            "model_path": f"{prefix}/{profile['model_path']}",
            "calibrator_path": f"{prefix}/{profile['calibrator_path']}",
        }
    return {
        **profile,
        "components": [
            {
                **component,
                "model_path": f"{prefix}/{component['model_path']}",
                "calibrator_path": f"{prefix}/{component['calibrator_path']}",
            }
            for component in profile["components"]
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--profile", choices=("m5",), required=True)
    args = parser.parse_args()
    del args.profile
    config_path = Path(args.config).resolve()
    config = load_json(config_path)
    validate_config(config)
    result_dir = ROOT / "ml/results/propagation_v4_2" / config["run_id"]
    training_path = result_dir / "training_50m_results.json"
    evaluation_path = result_dir / "evaluation_50m_results.json"
    validation_path = result_dir / "validation_50m.json"
    training = load_json(training_path)
    evaluation = load_json(evaluation_path)
    validation = load_json(validation_path)
    if not validation["passed"]:
        raise Phase2Error("Phase 3 requires passing 50M validation")
    if any(
        value.get(field)
        for value in (training, evaluation)
        for field in ("december_2024_read", "locked_2025_read")
    ):
        raise Phase2Error("Phase 3 packaging found locked-outcome access")
    selection = evaluation.get("final_candidate_selection")
    if selection is None:
        raise Phase2Error("no V4.2 candidate is eligible for Phase 3")
    selected = str(selection["candidate"])
    components = selected_components(evaluation, selected)
    final_fold = str(config["final_fold"])
    bundle = (
        Path(config["compute"]["external_root"])
        / "models/archive_v4_2"
        / config["run_id"]
        / "serving"
    )
    repository_bundle = (
        ROOT / "ml/models/archive_v4_2" / config["run_id"] / "serving"
    )
    bundle.mkdir(parents=True, exist_ok=True)
    nowcast_components = [
        copied_component(
            name,
            weight,
            training["candidates"][name][final_fold],
            bundle,
            "nowcast",
        )
        for name, weight in components
    ]
    feature_orders = {tuple(item["features"]) for item in nowcast_components}
    if len(feature_orders) != 1:
        raise Phase2Error("selected components have different feature order")
    top_factors = []
    for name, _ in components:
        for row in training["candidates"][name][final_fold].get(
            "feature_importance_gain", []
        ):
            feature = str(row["feature"])
            if feature not in top_factors:
                top_factors.append(feature)
    if len(nowcast_components) == 1:
        nowcast = {
            "kind": "single",
            **{key: value for key, value in nowcast_components[0].items() if key != "weight"},
            "top_factors": top_factors[:8],
        }
    else:
        nowcast = {
            "kind": "weighted_ensemble",
            "components": nowcast_components,
            "features": nowcast_components[0]["features"],
            "top_factors": top_factors[:8],
        }
    manifest = {
        "schema_version": 2,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_id": config["run_id"],
        "model_version": f"{config['run_id']}-phase3-candidate-50000000",
        "release_stage": "pre_december_development_candidate",
        "release_approved": False,
        "december_gate_scored": False,
        "locked_archive_test_scored": False,
        "prospective_test_scored": False,
        "feature_contract": "station-chain-v1",
        "core_feature_contract": "archive-v4-features-v1",
        "train_cap": 50_000_000,
        "primary_candidate": selected,
        "selection_basis": selection["basis"],
        "runtime_policy": {
            "path_history_stale_after_seconds": int(
                config["phase3"]["stale_path_history_seconds"]
            )
        },
        "profiles": {
            "physics": copied_physics(load_json(V4_RESULTS), bundle),
            "nowcast": nowcast,
        },
        "frozen_inputs": {
            "config": artifact(config_path),
            "training": artifact(training_path),
            "evaluation": artifact(evaluation_path),
            "validation": artifact(validation_path),
        },
        "limitations": [
            "This bundle is a frozen pre-December development candidate.",
            "December 2024, the locked 2025 archive, and prospective tests are unscored.",
            "The open core estimates a public WSPR single-decode opportunity.",
            "StationCast remains a deterministic private-at-inference adapter.",
        ],
    }
    bundle_manifest = bundle / "serving_manifest.json"
    atomic_write(bundle_manifest, manifest)
    public_prefix = f"ml/models/archive_v4_2/{config['run_id']}/serving"
    public_manifest = {
        **manifest,
        "bundle_manifest": artifact(repository_bundle / "serving_manifest.json"),
        "profiles": {
            "physics": public_profile(manifest["profiles"]["physics"], public_prefix),
            "nowcast": public_profile(manifest["profiles"]["nowcast"], public_prefix),
        },
    }
    public_path = result_dir / "phase3_serving_candidate_manifest.json"
    atomic_write(public_path, public_manifest)
    print(public_path)


if __name__ == "__main__":
    main()
