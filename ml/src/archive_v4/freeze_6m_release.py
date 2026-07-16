#!/usr/bin/env python3
"""Freeze the current 6m release decision without promoting experimental models."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
RUN_ID = "propagation_v4_multiyear_50m"
DEFAULT_RESULTS = ROOT / f"ml/results/propagation_v4/{RUN_ID}/6m_development_results.json"
DEFAULT_AUDIT = ROOT / f"ml/data/manifests/{RUN_ID}_6m_development_audit.json"
DEFAULT_OUTPUT = ROOT / f"ml/results/propagation_v4/{RUN_ID}/6m_release_decision.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rooted(root: Path, relative_path: str) -> Path:
    relative = Path(relative_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise RuntimeError(f"artifact escapes repository: {relative_path}")
    path = (root / relative).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError:
        model_root = (root / "ml/models").resolve()
        try:
            path.relative_to(model_root)
        except ValueError as error:
            raise RuntimeError(f"artifact escapes repository: {relative_path}") from error
    if path.name.startswith((".", "._")):
        raise RuntimeError(f"hidden artifact is not valid evidence: {relative_path}")
    return path


def evidence_path(root: Path, path: Path) -> str:
    resolved_root = root.resolve()
    resolved_path = path.resolve()
    try:
        return resolved_path.relative_to(resolved_root).as_posix()
    except ValueError:
        data_root = (root / "ml/data").resolve()
        try:
            suffix = resolved_path.relative_to(data_root)
        except ValueError as error:
            raise RuntimeError(f"evidence escapes declared roots: {path}") from error
        return (Path("ml/data") / suffix).as_posix()


def build_decision(
    results: dict[str, Any],
    *,
    root: Path,
    results_path: Path,
    audit_path: Path,
) -> dict[str, Any]:
    if results.get("scope") != "development_only":
        raise RuntimeError("6m release decision requires development-only evidence")
    if results.get("locked_archive_test_read") is not False:
        raise RuntimeError("6m locked archive evidence must remain unread")
    if results.get("release_approved") is not False:
        raise RuntimeError("this freeze only supports the withheld decision")
    blockers = results.get("release_blockers")
    if not isinstance(blockers, list) or not blockers:
        raise RuntimeError("withheld 6m evidence must declare release blockers")
    if not audit_path.is_file():
        raise RuntimeError("6m development audit is missing")
    experimental: list[dict[str, Any]] = []
    unsupported: list[dict[str, Any]] = []
    for mechanism, value in sorted(results.get("mechanisms", {}).items()):
        status = value.get("status")
        if status != "trained_experimental":
            unsupported.append({
                "mechanism": mechanism,
                "status": status,
                "train_rows": value.get("train_rows"),
            })
            continue
        artifacts = []
        for path_key, hash_key, artifact_type in (
            ("model_path", "model_sha256", "xgboost_model"),
            ("calibrator_path", "calibrator_sha256", "isotonic_calibrator"),
        ):
            relative_path = value.get(path_key)
            expected_hash = value.get(hash_key)
            if not isinstance(relative_path, str) or not isinstance(expected_hash, str):
                raise RuntimeError(f"{mechanism} is missing {artifact_type} provenance")
            path = rooted(root, relative_path)
            if not path.is_file():
                raise RuntimeError(f"missing {mechanism} artifact: {relative_path}")
            actual_hash = sha256(path)
            if actual_hash != expected_hash:
                raise RuntimeError(f"{mechanism} artifact hash mismatch: {relative_path}")
            artifacts.append({
                "type": artifact_type,
                "path": relative_path,
                "sha256": actual_hash,
                "bytes": path.stat().st_size,
            })
        experimental.append({
            "mechanism": mechanism,
            "status": status,
            "train_rows": value.get("train_rows"),
            "gate_rows": value.get("gate_rows"),
            "brier_skill": value.get("brier_skill"),
            "artifacts": artifacts,
        })
    if not experimental:
        raise RuntimeError("no experimental 6m artifacts were found")
    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "run_id": results.get("run_id"),
        "scope": "development_release_decision",
        "decision": "withheld",
        "release_approved": False,
        "product_serving_allowed": False,
        "released_mechanisms": [],
        "experimental_mechanisms": experimental,
        "unsupported_mechanisms": unsupported,
        "development_event_brier_skill": results.get("event_gate", {}).get("brier_skill"),
        "development_quiet_brier_skill": results.get("quiet_gate", {}).get("brier_skill"),
        "gate_row_coverage": results.get("gate_row_coverage"),
        "release_blockers": blockers,
        "locked_archive_test_read": False,
        "evidence": [
            {
                "path": evidence_path(root, results_path),
                "sha256": sha256(results_path),
            },
            {
                "path": evidence_path(root, audit_path),
                "sha256": sha256(audit_path),
            },
        ],
        "supersession_rule": (
            "A later 6m version requires independent mechanism labels, "
            "locked event and quiet-day evidence, and a new release decision."
        ),
        "complete": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, default=DEFAULT_RESULTS)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    results_path = args.results.resolve()
    audit_path = args.audit.resolve()
    payload = build_decision(
        json.loads(results_path.read_text(encoding="utf-8")),
        root=ROOT,
        results_path=results_path,
        audit_path=audit_path,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
