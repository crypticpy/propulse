"""Immutable outcome-access protocol for the V4.1 recovery experiment."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONFIG = ROOT / "ml/config/propagation_v4_1.json"
DEFAULT_MANIFEST = (
    ROOT / "ml/results/propagation_v4_1/preregistration/run_manifest.json"
)


class ProtocolError(RuntimeError):
    """Raised before an action would violate the frozen protocol."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact(path: Path) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
        raise ProtocolError(f"required artifact is missing: {path}")
    return {
        "path": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, sort_keys=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def month_sets(config: dict[str, Any]) -> dict[str, set[str]]:
    roles = config["data_roles"]
    return {
        name: set(value)
        for name, value in roles.items()
        if isinstance(value, list)
    }


def assert_exact_months(
    requested: Iterable[str],
    expected: Iterable[str],
    scope: str,
) -> list[str]:
    actual = list(requested)
    allowed = list(expected)
    if actual != allowed:
        raise ProtocolError(
            f"{scope} requires exactly {allowed}; received {actual}"
        )
    return actual


def authorize_scope(
    config: dict[str, Any],
    manifest: dict[str, Any],
    scope: str,
    months: Iterable[str],
) -> list[str]:
    sets = month_sets(config)
    requested = list(months)
    locked = sets["locked_archive_test"]
    gate = sets["untouched_development_gate"]
    reserved = sets["reserved_future_version"]

    if set(requested) & reserved:
        raise ProtocolError("2024-12 is reserved and inaccessible in V4.1")

    if scope == "inventory-new-sources":
        return assert_exact_months(
            requested,
            [
                *config["data_roles"]["new_calibration_sources"],
                *config["data_roles"]["untouched_development_gate"],
            ],
            scope,
        )
    if scope == "calibration-development":
        if set(requested) & (gate | locked):
            raise ProtocolError("development scope includes gate or locked outcomes")
        return assert_exact_months(
            requested,
            config["data_roles"]["new_calibration_sources"],
            scope,
        )
    if scope == "november-gate":
        assert_exact_months(
            requested,
            config["data_roles"]["untouched_development_gate"],
            scope,
        )
        if not manifest["frozen_artifacts"].get("candidate_freeze"):
            raise ProtocolError("candidate freeze is required before November access")
        if not manifest["frozen_artifacts"].get("b2_freeze"):
            raise ProtocolError("B2 freeze is required before November access")
        if not manifest["frozen_artifacts"].get("scorer_freeze"):
            raise ProtocolError("scorer freeze is required before November access")
        if manifest["november_gate_opened"]:
            raise ProtocolError("November gate has already been opened")
        return requested
    if scope == "locked-archive":
        assert_exact_months(
            requested,
            config["data_roles"]["locked_archive_test"],
            scope,
        )
        if not manifest["development_gates_passed"]:
            raise ProtocolError("locked archive requires all development gates to pass")
        if manifest["locked_archive_test_opened"]:
            raise ProtocolError("locked archive has already been opened")
        return requested
    raise ProtocolError(f"unknown V4.1 scope: {scope}")


def record_development_access(
    manifest_path: Path,
    months: Iterable[str],
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    config = load_json(DEFAULT_CONFIG)
    requested = authorize_scope(
        config,
        manifest,
        "calibration-development",
        months,
    )
    if manifest["development_outcomes_opened"]:
        if all(manifest["outcome_access"].get(month) for month in requested):
            return manifest
        raise ProtocolError("development access state is inconsistent")
    for month in requested:
        manifest["outcome_access"][month] = True
    manifest["development_outcomes_opened"] = True
    manifest["protocol_state"] = "development_opened"
    manifest["protocol_events"].append(
        {"at": utc_now(), "event": "development_outcomes_opened", "months": requested}
    )
    atomic_write_json(manifest_path, manifest)
    return manifest


def begin_one_shot(
    manifest_path: Path,
    scope: str,
    months: Iterable[str],
    attempt_id: str,
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    config = load_json(DEFAULT_CONFIG)
    requested = authorize_scope(config, manifest, scope, months)
    now = utc_now()
    if scope == "november-gate":
        manifest["november_gate_opened"] = True
        manifest["november_gate_opened_at"] = now
        manifest["november_gate_attempt_id"] = attempt_id
        manifest["protocol_state"] = "november_gate_opened"
    elif scope == "locked-archive":
        manifest["locked_archive_test_opened"] = True
        manifest["locked_archive_test_opened_at"] = now
        manifest["locked_archive_attempt_id"] = attempt_id
        manifest["protocol_state"] = "locked_archive_opened"
    else:
        raise ProtocolError(f"scope is not one-shot: {scope}")
    for month in requested:
        manifest["outcome_access"][month] = True
    manifest["protocol_events"].append(
        {
            "at": now,
            "event": f"{scope}_opened",
            "months": requested,
            "attempt_id": attempt_id,
        }
    )
    atomic_write_json(manifest_path, manifest)
    return manifest


def resume_one_shot(
    manifest: dict[str, Any],
    scope: str,
    attempt_id: str,
) -> None:
    if scope == "november-gate":
        opened = manifest["november_gate_opened"]
        recorded = manifest["november_gate_attempt_id"]
    elif scope == "locked-archive":
        opened = manifest["locked_archive_test_opened"]
        recorded = manifest["locked_archive_attempt_id"]
    else:
        raise ProtocolError(f"scope is not resumable: {scope}")
    if not opened or recorded != attempt_id:
        raise ProtocolError(
            f"cannot resume {scope}: expected attempt {recorded!r}, got {attempt_id!r}"
        )


def freeze_artifact(
    manifest_path: Path,
    name: str,
    path: Path,
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    if manifest["november_gate_opened"]:
        raise ProtocolError("cannot change frozen artifacts after November access")
    value = artifact(path)
    existing = manifest["frozen_artifacts"].get(name)
    if existing is not None and existing != value:
        raise ProtocolError(f"frozen artifact changed: {name}")
    manifest["frozen_artifacts"][name] = value
    manifest["protocol_events"].append(
        {"at": utc_now(), "event": "artifact_frozen", "name": name, **value}
    )
    atomic_write_json(manifest_path, manifest)
    return value


def mark_development_decision(
    manifest_path: Path,
    passed: bool,
    failed_gates: list[str],
) -> dict[str, Any]:
    manifest = load_json(manifest_path)
    if not manifest["november_gate_opened"]:
        raise ProtocolError("development decision requires an opened November gate")
    manifest["development_gates_passed"] = passed
    manifest["failed_gates"] = failed_gates
    manifest["protocol_state"] = (
        "development_approved" if passed else "development_failed"
    )
    manifest["phase_status"]["phase_2"] = "passed" if passed else "failed"
    manifest["phase_status"]["phase_4"] = "ready" if passed else "locked"
    manifest["protocol_events"].append(
        {
            "at": utc_now(),
            "event": "development_decision",
            "passed": passed,
            "failed_gates": failed_gates,
        }
    )
    atomic_write_json(manifest_path, manifest)
    return manifest
