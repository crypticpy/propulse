"""One-shot outcome-access protocol for V4.2 December and 2025 gates."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
DEFAULT_MANIFEST = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "outcome_protocol_manifest.json"
)
REQUIRED_DECEMBER_FREEZES = {
    "config",
    "phase2_training_50m",
    "phase2_evaluation_50m",
    "phase2_validation_50m",
    "phase2_report_artifact",
    "phase2_report_html",
    "serving_candidate",
    "phase3_validation",
    "phase3_packager",
    "phase3_validator",
    "service_runtime",
    "station_cast_adapter",
    "gate_scorer",
    "phase2_scoring_helpers",
    "gate_scoring_core",
    "outcome_protocol",
    "m5_runtime",
    "training_runtime",
    "b2_adapter",
    "v4_1_calibration",
    "v3_b2_results",
    "v3_b2_model",
    "v3_b2_calibrator",
    "prediction_thread_benchmark",
    "gate_report_generator",
    "gate_report_dry_run_validation",
    "candidate_environment",
    "source_pipeline",
}


class OutcomeProtocolError(RuntimeError):
    """Raised before an action would violate the V4.2 access protocol."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


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


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise OutcomeProtocolError(f"required artifact is missing: {path}")
    try:
        repository_path = path.relative_to(ROOT)
    except ValueError as error:
        raise OutcomeProtocolError(
            f"frozen artifacts must use a repository path: {path}"
        ) from error
    return {
        "path": repository_path.as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def new_manifest(config: dict[str, Any]) -> dict[str, Any]:
    december = list(map(str, config["phase4"]["gate_months"]))
    archive = list(map(str, config["phase5"]["locked_months"]))
    return {
        "schema_version": 1,
        "run_id": config["run_id"],
        "created_at": utc_now(),
        "protocol_state": "development",
        "candidate_frozen": False,
        "december_opened": False,
        "december_attempt_id": None,
        "december_decision_passed": False,
        "archive_opened": False,
        "archive_attempt_id": None,
        "archive_decision_passed": False,
        "prospective_opened": False,
        "release_approved": False,
        "outcome_access": {
            month: False for month in [*december, *archive]
        },
        "frozen_artifacts": {},
        "outcome_artifacts": {},
        "events": [
            {
                "at": utc_now(),
                "event": "outcome_protocol_initialized",
                "months": [*december, *archive],
            }
        ],
    }


def exact_months(
    requested: Iterable[str], expected: Iterable[str], scope: str
) -> list[str]:
    actual = list(map(str, requested))
    frozen = list(map(str, expected))
    if actual != frozen:
        raise OutcomeProtocolError(
            f"{scope} requires exactly {frozen}; received {actual}"
        )
    return actual


def authorize_scope(
    manifest: dict[str, Any],
    config: dict[str, Any],
    scope: str,
    months: Iterable[str],
) -> list[str]:
    if scope == "december":
        requested = exact_months(months, config["phase4"]["gate_months"], scope)
        if not manifest["candidate_frozen"]:
            raise OutcomeProtocolError("December requires a frozen candidate")
        missing = sorted(
            REQUIRED_DECEMBER_FREEZES - set(manifest["frozen_artifacts"])
        )
        if missing:
            raise OutcomeProtocolError(f"December freezes are incomplete: {missing}")
        if manifest["december_opened"]:
            raise OutcomeProtocolError("December has already been opened")
        if manifest["archive_opened"]:
            raise OutcomeProtocolError("archive state is invalid before December")
        return requested
    if scope == "archive":
        requested = exact_months(months, config["phase5"]["locked_months"], scope)
        if not manifest["december_decision_passed"]:
            raise OutcomeProtocolError("the locked archive requires every December gate")
        if manifest["archive_opened"]:
            raise OutcomeProtocolError("the locked archive has already been opened")
        if manifest["prospective_opened"]:
            raise OutcomeProtocolError("prospective outcomes opened before the archive")
        return requested
    raise OutcomeProtocolError(f"unknown one-shot scope: {scope}")


def initialize(
    manifest_path: Path = DEFAULT_MANIFEST,
    config_path: Path = DEFAULT_CONFIG,
) -> dict[str, Any]:
    if manifest_path.exists():
        return load_json(manifest_path)
    value = new_manifest(load_json(config_path))
    atomic_write(manifest_path, value)
    return value


def freeze_artifact(
    manifest_path: Path, name: str, path: Path
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    if manifest["december_opened"]:
        raise OutcomeProtocolError("frozen artifacts cannot change after December opens")
    value = artifact(path)
    existing = manifest["frozen_artifacts"].get(name)
    if existing is not None and existing != value:
        raise OutcomeProtocolError(f"frozen artifact changed: {name}")
    if existing is None:
        manifest["frozen_artifacts"][name] = value
        manifest["events"].append(
            {"at": utc_now(), "event": "artifact_frozen", "name": name, **value}
        )
        atomic_write(manifest_path, manifest)
    return value


def mark_candidate_frozen(manifest_path: Path) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    missing = sorted(REQUIRED_DECEMBER_FREEZES - set(manifest["frozen_artifacts"]))
    if missing:
        raise OutcomeProtocolError(f"candidate freeze is incomplete: {missing}")
    if manifest["december_opened"]:
        raise OutcomeProtocolError("candidate cannot freeze after December opens")
    if not manifest["candidate_frozen"]:
        manifest["candidate_frozen"] = True
        manifest["protocol_state"] = "candidate_frozen"
        manifest["events"].append({"at": utc_now(), "event": "candidate_frozen"})
        atomic_write(manifest_path, manifest)
    return manifest


def verify_frozen_artifacts(manifest_path: Path) -> None:
    manifest = load_json(manifest_path)
    for name, expected in manifest["frozen_artifacts"].items():
        current = artifact(ROOT / expected["path"])
        if current != expected:
            raise OutcomeProtocolError(f"frozen artifact checksum mismatch: {name}")


def begin_scope(
    manifest_path: Path,
    config_path: Path,
    scope: str,
    months: Iterable[str],
    attempt_id: str,
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    config = load_json(config_path)
    requested = authorize_scope(manifest, config, scope, months)
    verify_frozen_artifacts(manifest_path)
    now = utc_now()
    if scope == "december":
        manifest["december_opened"] = True
        manifest["december_attempt_id"] = attempt_id
        manifest["protocol_state"] = "december_opened"
    else:
        manifest["archive_opened"] = True
        manifest["archive_attempt_id"] = attempt_id
        manifest["protocol_state"] = "archive_opened"
    for month in requested:
        manifest["outcome_access"][month] = True
    manifest["events"].append(
        {
            "at": now,
            "event": f"{scope}_opened",
            "months": requested,
            "attempt_id": attempt_id,
        }
    )
    atomic_write(manifest_path, manifest)
    return manifest


def resume_scope(
    manifest: dict[str, Any], scope: str, attempt_id: str
) -> None:
    if scope == "december":
        opened = manifest["december_opened"]
        recorded = manifest["december_attempt_id"]
    elif scope == "archive":
        opened = manifest["archive_opened"]
        recorded = manifest["archive_attempt_id"]
    else:
        raise OutcomeProtocolError(f"unknown one-shot scope: {scope}")
    if not opened or recorded != attempt_id:
        raise OutcomeProtocolError(
            f"cannot resume {scope}: expected attempt {recorded!r}, got {attempt_id!r}"
        )


def record_scope_result(
    manifest_path: Path,
    scope: str,
    attempt_id: str,
    result_path: Path,
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    resume_scope(manifest, scope, attempt_id)
    result = load_json(result_path)
    if str(result.get("attempt_id")) != attempt_id:
        raise OutcomeProtocolError("outcome result attempt does not match protocol")
    value = artifact(result_path)
    manifest["outcome_artifacts"][f"{scope}_result"] = value
    passed = bool(result.get("decision", {}).get("passed"))
    if scope == "december":
        manifest["december_decision_passed"] = passed
        manifest["protocol_state"] = "december_passed" if passed else "december_failed"
    else:
        manifest["archive_decision_passed"] = passed
        manifest["protocol_state"] = "archive_passed" if passed else "archive_failed"
    manifest["events"].append(
        {
            "at": utc_now(),
            "event": f"{scope}_decision_recorded",
            "attempt_id": attempt_id,
            "passed": passed,
            **value,
        }
    )
    atomic_write(manifest_path, manifest)
    return manifest
