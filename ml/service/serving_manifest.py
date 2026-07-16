"""Strict contract for immutable retrospective internal model bundles."""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any


SERVING_MANIFEST_SCHEMA_VERSION = 3
INTERNAL_RELEASE_STAGE = "retrospective_validated_internal"
EXPECTED_PRIMARY_CANDIDATE = "A6_recent_recency_blend"
EXPECTED_PROFILE_COMPONENTS = {
    "physics": ("M1_physics",),
    "nowcast": ("A4_recent_cycle", "A5_recency_weighted"),
}
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def feature_order_sha256(features: list[str]) -> str:
    payload = json.dumps(
        features,
        ensure_ascii=True,
        separators=(",", ":"),
    ).encode("ascii")
    return hashlib.sha256(payload).hexdigest()


def require_sha256(value: Any, field: str) -> str:
    if not isinstance(value, str) or not SHA256_PATTERN.fullmatch(value):
        raise RuntimeError(f"invalid serving manifest SHA-256: {field}")
    return value


def require_features(value: Any, field: str) -> list[str]:
    if (
        not isinstance(value, list)
        or not value
        or not all(isinstance(name, str) and name for name in value)
        or len(set(value)) != len(value)
    ):
        raise RuntimeError(f"invalid serving feature order: {field}")
    return value


def validate_component(
    component: dict[str, Any],
    expected_features: list[str],
    field: str,
) -> None:
    if not isinstance(component, dict):
        raise RuntimeError(f"invalid serving component: {field}")
    if not isinstance(component.get("component"), str):
        raise RuntimeError(f"invalid serving component name: {field}")
    for path_field, suffix in (
        ("model_path", ".json"),
        ("calibrator_path", ".joblib"),
    ):
        raw_path = component.get(path_field)
        if (
            not isinstance(raw_path, str)
            or Path(raw_path).name != raw_path
            or not raw_path.endswith(suffix)
        ):
            raise RuntimeError(f"invalid bundle-local path: {field}.{path_field}")
    require_sha256(component.get("model_sha256"), f"{field}.model_sha256")
    require_sha256(
        component.get("calibrator_sha256"),
        f"{field}.calibrator_sha256",
    )
    features = require_features(component.get("features"), f"{field}.features")
    if features != expected_features:
        raise RuntimeError(f"serving feature order differs: {field}")
    best_iteration = component.get("best_iteration")
    if type(best_iteration) is not int or best_iteration < 0:
        raise RuntimeError(f"invalid best iteration: {field}")
    if component.get("model_format") != "xgboost_json":
        raise RuntimeError(f"non-native model format: {field}")
    if component.get("calibrator_class") != "calibration.CalibratorBundle":
        raise RuntimeError(f"non-native calibrator class: {field}")
    if not isinstance(component.get("calibration_method"), str):
        raise RuntimeError(f"missing calibration method: {field}")


def validate_serving_manifest(payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        raise RuntimeError("serving manifest must be an object")
    if payload.get("schema_version") != SERVING_MANIFEST_SCHEMA_VERSION:
        raise RuntimeError("unsupported serving manifest schema")
    if payload.get("release_stage") != INTERNAL_RELEASE_STAGE:
        raise RuntimeError("unsupported serving manifest release stage")
    expected_state = {
        "release_approved": False,
        "december_gate_scored": True,
        "locked_archive_test_scored": True,
        "prospective_test_scored": False,
    }
    if any(payload.get(key) is not value for key, value in expected_state.items()):
        raise RuntimeError("inconsistent retrospective validation state")
    if payload.get("feature_contract") != "station-chain-v1":
        raise RuntimeError("unexpected station feature contract")
    if payload.get("core_feature_contract") != "archive-v4-features-v1":
        raise RuntimeError("unexpected core feature contract")
    if payload.get("primary_candidate") != EXPECTED_PRIMARY_CANDIDATE:
        raise RuntimeError("unexpected internal primary candidate")
    for field in ("run_id", "model_version"):
        if not isinstance(payload.get(field), str) or not payload[field]:
            raise RuntimeError(f"missing serving manifest field: {field}")

    runtime_policy = payload.get("runtime_policy")
    if not isinstance(runtime_policy, dict):
        raise RuntimeError("missing serving runtime policy")
    if runtime_policy.get("xgboost_prediction_threads") != 1:
        raise RuntimeError("internal serving requires one prediction thread")
    stale_after = runtime_policy.get("path_history_stale_after_seconds")
    if type(stale_after) is not int or stale_after < 0:
        raise RuntimeError("invalid path-history stale threshold")

    native_runtime = payload.get("native_runtime")
    if not isinstance(native_runtime, dict) or native_runtime != {
        "model_format": "xgboost_json",
        "calibrator_class": "calibration.CalibratorBundle",
        "serialization_pair": "xgboost-json+joblib-calibrator-bundle-v1",
    }:
        raise RuntimeError("unsupported native model/calibrator combination")

    evidence = payload.get("evidence")
    if not isinstance(evidence, dict):
        raise RuntimeError("missing retrospective evidence binding")
    if evidence.get("protocol_state") != "archive_passed":
        raise RuntimeError("archive evidence protocol has not passed")
    for field in (
        "december_attempt_id",
        "archive_attempt_id",
    ):
        if not isinstance(evidence.get(field), str) or not evidence[field]:
            raise RuntimeError(f"missing evidence field: {field}")
    for field in (
        "outcome_protocol_sha256",
        "source_candidate_manifest_sha256",
        "december_gate_result_sha256",
        "archive_gate_result_sha256",
        "december_decision_sha256",
        "archive_decision_sha256",
    ):
        require_sha256(evidence.get(field), f"evidence.{field}")

    profiles = payload.get("profiles")
    if not isinstance(profiles, dict) or set(profiles) != {"physics", "nowcast"}:
        raise RuntimeError("internal manifest requires physics and nowcast profiles")
    for profile_name, expected_components in EXPECTED_PROFILE_COMPONENTS.items():
        profile = profiles[profile_name]
        if not isinstance(profile, dict):
            raise RuntimeError(f"invalid serving profile: {profile_name}")
        features = require_features(
            profile.get("features"),
            f"profiles.{profile_name}.features",
        )
        if require_sha256(
            profile.get("feature_order_sha256"),
            f"profiles.{profile_name}.feature_order_sha256",
        ) != feature_order_sha256(features):
            raise RuntimeError(f"serving feature order hash differs: {profile_name}")
        kind = profile.get("kind")
        components = (
            profile.get("components")
            if kind == "weighted_ensemble"
            else [profile]
            if kind == "single"
            else None
        )
        if not isinstance(components, list) or not components:
            raise RuntimeError(f"invalid serving profile kind: {profile_name}")
        names = tuple(component.get("component") for component in components)
        if names != expected_components:
            raise RuntimeError(f"unexpected A6 components: {profile_name}")
        for index, component in enumerate(components):
            validate_component(
                component,
                features,
                f"profiles.{profile_name}.components[{index}]",
            )
        if kind == "weighted_ensemble":
            weights = [component.get("weight") for component in components]
            if (
                any(type(weight) not in {int, float} or weight < 0 for weight in weights)
                or not math.isclose(sum(weights), 1.0, rel_tol=0, abs_tol=1e-12)
            ):
                raise RuntimeError(f"invalid ensemble weights: {profile_name}")


def resolve_bundle_artifact(manifest_path: Path, relative_path: str) -> Path:
    if Path(relative_path).name != relative_path:
        raise RuntimeError(f"model artifact must be bundle-local: {relative_path}")
    bundle_root = manifest_path.parent.resolve()
    resolved = (bundle_root / relative_path).resolve()
    if resolved.parent != bundle_root:
        raise RuntimeError(f"model artifact escapes bundle: {relative_path}")
    if not resolved.is_file():
        raise RuntimeError(f"model artifact is missing: {relative_path}")
    return resolved
