#!/usr/bin/env python3
"""Promote the frozen A6 candidate to immutable retrospective internal serving."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import sys
import time
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parent
SERVICE = ROOT / "ml/service"
sys.path.insert(0, str(MODULE))
sys.path.insert(0, str(SERVICE))

from m5_runtime import validate_m5_runtime  # noqa: E402
from serving_manifest import (  # noqa: E402
    feature_order_sha256,
    resolve_bundle_artifact,
    sha256_file,
    validate_serving_manifest,
)


DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_RESULT_DIR = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
)
SOURCE_MANIFEST_NAME = "serving_manifest.json"
INTERNAL_MANIFEST_NAME = "retrospective_validated_internal_manifest.json"
RECEIPT_NAME = "retrospective_internal_promotion_receipt.json"


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"JSON artifact must be an object: {path}")
    return value


def canonical_sha256(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("ascii")
    return hashlib.sha256(encoded).hexdigest()


def verify_recorded_artifact(
    path: Path,
    record: dict[str, Any],
    label: str,
) -> str:
    if not path.is_file():
        raise RuntimeError(f"missing promotion input: {label}")
    actual_size = path.stat().st_size
    actual_sha = sha256_file(path)
    if actual_size != int(record.get("bytes", -1)):
        raise RuntimeError(f"promotion input size changed: {label}")
    if actual_sha != record.get("sha256"):
        raise RuntimeError(f"promotion input checksum changed: {label}")
    return actual_sha


def component_items(profile: dict[str, Any]) -> list[dict[str, Any]]:
    if profile.get("kind") == "weighted_ensemble":
        components = profile.get("components")
        if not isinstance(components, list):
            raise RuntimeError("ensemble components must be a list")
        return components
    if profile.get("kind") == "single":
        return [profile]
    raise RuntimeError("unsupported source profile kind")


def verify_source_bundle(
    source_manifest_path: Path,
    candidate: dict[str, Any],
) -> None:
    if candidate.get("schema_version") != 2:
        raise RuntimeError("source candidate must use serving schema v2")
    if candidate.get("release_stage") != "pre_december_development_candidate":
        raise RuntimeError("source candidate stage changed before promotion")
    profiles = candidate.get("profiles")
    if not isinstance(profiles, dict) or set(profiles) != {"physics", "nowcast"}:
        raise RuntimeError("source candidate profiles changed before promotion")
    for profile_name, profile in profiles.items():
        for component in component_items(profile):
            for path_field, sha_field in (
                ("model_path", "model_sha256"),
                ("calibrator_path", "calibrator_sha256"),
            ):
                path = resolve_bundle_artifact(
                    source_manifest_path,
                    component[path_field],
                )
                if sha256_file(path) != component[sha_field]:
                    raise RuntimeError(
                        f"source bundle checksum changed: {profile_name}/{path.name}"
                    )


def decorate_component(component: dict[str, Any]) -> dict[str, Any]:
    decorated = copy.deepcopy(component)
    decorated["model_format"] = "xgboost_json"
    decorated["calibrator_class"] = "calibration.CalibratorBundle"
    return decorated


def decorate_profile(profile: dict[str, Any]) -> dict[str, Any]:
    decorated = copy.deepcopy(profile)
    features = decorated.get("features")
    if not isinstance(features, list):
        raise RuntimeError("source profile has no feature order")
    decorated["feature_order_sha256"] = feature_order_sha256(features)
    if decorated.get("kind") == "weighted_ensemble":
        decorated["components"] = [
            decorate_component(component)
            for component in component_items(decorated)
        ]
    elif decorated.get("kind") == "single":
        decorated.update(decorate_component(decorated))
    else:
        raise RuntimeError("unsupported source profile kind")
    return decorated


def validate_outcome_state(
    outcome: dict[str, Any],
    december: dict[str, Any],
    archive: dict[str, Any],
) -> None:
    expected = {
        "schema_version": 1,
        "protocol_state": "archive_passed",
        "candidate_frozen": True,
        "december_opened": True,
        "december_decision_passed": True,
        "archive_opened": True,
        "archive_decision_passed": True,
        "prospective_opened": False,
        "release_approved": False,
    }
    if any(outcome.get(key) != value for key, value in expected.items()):
        raise RuntimeError("outcome protocol is not retrospective-internal eligible")
    for label, result in (("December", december), ("archive", archive)):
        decision = result.get("decision")
        if not isinstance(decision, dict) or decision.get("passed") is not True:
            raise RuntimeError(f"{label} gate did not pass")


def build_internal_manifest(
    candidate: dict[str, Any],
    outcome: dict[str, Any],
    december: dict[str, Any],
    archive: dict[str, Any],
    *,
    generated_at: str,
    outcome_sha256: str,
    candidate_sha256: str,
    december_sha256: str,
    archive_sha256: str,
) -> dict[str, Any]:
    manifest = {
        "schema_version": 3,
        "generated_at": generated_at,
        "run_id": candidate["run_id"],
        "model_version": (
            f"{candidate['run_id']}-a6-retrospective-internal-50000000"
        ),
        "release_stage": "retrospective_validated_internal",
        "release_approved": False,
        "december_gate_scored": True,
        "locked_archive_test_scored": True,
        "prospective_test_scored": False,
        "feature_contract": candidate["feature_contract"],
        "core_feature_contract": candidate["core_feature_contract"],
        "train_cap": candidate["train_cap"],
        "primary_candidate": candidate["primary_candidate"],
        "selection_basis": candidate["selection_basis"],
        "runtime_policy": {
            "path_history_stale_after_seconds": int(
                candidate["runtime_policy"]["path_history_stale_after_seconds"]
            ),
            "xgboost_prediction_threads": 1,
        },
        "native_runtime": {
            "model_format": "xgboost_json",
            "calibrator_class": "calibration.CalibratorBundle",
            "serialization_pair": (
                "xgboost-json+joblib-calibrator-bundle-v1"
            ),
        },
        "profiles": {
            name: decorate_profile(profile)
            for name, profile in candidate["profiles"].items()
        },
        "evidence": {
            "protocol_state": outcome["protocol_state"],
            "december_attempt_id": outcome["december_attempt_id"],
            "archive_attempt_id": outcome["archive_attempt_id"],
            "outcome_protocol_sha256": outcome_sha256,
            "source_candidate_manifest_sha256": candidate_sha256,
            "december_gate_result_sha256": december_sha256,
            "archive_gate_result_sha256": archive_sha256,
            "december_decision_sha256": canonical_sha256(december["decision"]),
            "archive_decision_sha256": canonical_sha256(archive["decision"]),
        },
        "limitations": [
            "Retrospective December 2024 and locked 2025 archive gates passed.",
            "Prospective validation is not complete; this is not a public release.",
            "The open core estimates a public WSPR single-decode opportunity.",
            "StationCast is the deterministic station-chain adapter at inference.",
        ],
    }
    validate_serving_manifest(manifest)
    return manifest


def write_new_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("x", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
    except FileExistsError as error:
        raise RuntimeError(f"immutable artifact already exists: {path}") from error


def promote(
    config_path: Path,
    result_dir: Path,
    bundle_dir: Path,
    *,
    generated_at: str,
    machine_receipt: dict[str, Any],
) -> tuple[Path, Path]:
    config = load_json(config_path)
    outcome_path = result_dir / "outcome_protocol_manifest.json"
    december_path = result_dir / "december_gate_result.json"
    archive_path = result_dir / "archive_gate_result.json"
    source_manifest_path = bundle_dir / SOURCE_MANIFEST_NAME
    outcome = load_json(outcome_path)
    december = load_json(december_path)
    archive = load_json(archive_path)
    candidate = load_json(source_manifest_path)
    validate_outcome_state(outcome, december, archive)

    frozen_candidate = outcome["frozen_artifacts"]["serving_candidate"]
    candidate_sha = verify_recorded_artifact(
        source_manifest_path,
        frozen_candidate,
        "source serving candidate",
    )
    december_sha = verify_recorded_artifact(
        december_path,
        outcome["outcome_artifacts"]["december_result"],
        "December gate result",
    )
    archive_sha = verify_recorded_artifact(
        archive_path,
        outcome["outcome_artifacts"]["archive_result"],
        "archive gate result",
    )
    outcome_sha = sha256_file(outcome_path)
    verify_source_bundle(source_manifest_path, candidate)
    manifest = build_internal_manifest(
        candidate,
        outcome,
        december,
        archive,
        generated_at=generated_at,
        outcome_sha256=outcome_sha,
        candidate_sha256=candidate_sha,
        december_sha256=december_sha,
        archive_sha256=archive_sha,
    )
    internal_path = bundle_dir / INTERNAL_MANIFEST_NAME
    write_new_json(internal_path, manifest)
    internal_sha = sha256_file(internal_path)
    receipt = {
        "schema_version": 1,
        "generated_at": generated_at,
        "run_id": manifest["run_id"],
        "release_stage": manifest["release_stage"],
        "internal_manifest": {
            "object_name": INTERNAL_MANIFEST_NAME,
            "bytes": internal_path.stat().st_size,
            "sha256": internal_sha,
        },
        "source_candidate_manifest_sha256": candidate_sha,
        "outcome_protocol_sha256": outcome_sha,
        "december_gate_result_sha256": december_sha,
        "archive_gate_result_sha256": archive_sha,
        "machine": machine_receipt,
    }
    receipt_path = result_dir / RECEIPT_NAME
    try:
        write_new_json(receipt_path, receipt)
    except Exception:
        internal_path.unlink(missing_ok=True)
        raise
    return internal_path, receipt_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--result-dir", type=Path, default=DEFAULT_RESULT_DIR)
    parser.add_argument("--bundle-dir", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_json(args.config)
    if config.get("compute", {}).get("required_profile") != "m5":
        raise RuntimeError("internal promotion requires the M5 compute profile")
    machine = validate_m5_runtime(config)
    bundle_dir = args.bundle_dir or (
        Path(config["compute"]["external_root"])
        / "models/archive_v4_2"
        / config["run_id"]
        / "serving"
    )
    generated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    internal_path, receipt_path = promote(
        args.config,
        args.result_dir,
        bundle_dir,
        generated_at=generated_at,
        machine_receipt={
            "machine": machine["machine"],
            "physical_cores_visible": machine["physical_cores_visible"],
            "core_clusters": machine["core_clusters"],
            "unified_memory_gb": machine["unified_memory_gb"],
            "power_source": machine["power_source"],
            "thermal_limits": machine["thermal_limits"],
            "python_version": machine["python_version"],
        },
    )
    print(internal_path)
    print(receipt_path)


if __name__ == "__main__":
    main()
