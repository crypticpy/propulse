#!/usr/bin/env python3
"""Open exactly one frozen V4.2 outcome scope before acquisition."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import uuid
from pathlib import Path


MODULE = Path(__file__).resolve().parent
if str(MODULE) not in sys.path:
    sys.path.insert(0, str(MODULE))

from outcome_protocol import (  # noqa: E402
    DEFAULT_CONFIG,
    authorize_scope,
    begin_scope,
    load_json,
    resolve_manifest,
    verify_frozen_artifacts,
)
import run_paths  # noqa: E402


def dry_run(
    config: dict,
    config_path: Path,
    manifest_path: Path,
    scope: str,
    months: list[str],
    free_gb: float,
) -> dict:
    """Resolve and report every path this scope would touch, writing nothing."""
    report = {
        "dry_run": True,
        "scope": scope,
        "run_id": str(config["run_id"]),
        "months": months,
        "free_gb": free_gb,
        "config": str(config_path),
        "manifest": str(manifest_path),
        "manifest_exists": manifest_path.exists(),
        "resolved_paths": run_paths.resolved_paths(config),
    }
    if not manifest_path.exists():
        report["authorization"] = "unavailable: outcome manifest has not been created"
        report["frozen_artifacts_verified"] = False
        return report
    manifest = load_json(manifest_path)
    report["protocol_state"] = manifest.get("protocol_state")
    report["candidate_frozen"] = bool(manifest.get("candidate_frozen"))
    report["frozen_artifacts"] = {
        name: item["path"] for name, item in manifest["frozen_artifacts"].items()
    }
    try:
        authorize_scope(manifest, config, scope, months)
        report["authorization"] = "would open"
    except Exception as error:  # noqa: BLE001 - reported, not raised, in dry run
        report["authorization"] = f"would refuse: {error}"
    try:
        verify_frozen_artifacts(manifest_path)
        report["frozen_artifacts_verified"] = True
    except Exception as error:  # noqa: BLE001 - reported, not raised, in dry run
        report["frozen_artifacts_verified"] = False
        report["frozen_artifact_error"] = str(error)
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(DEFAULT_CONFIG))
    parser.add_argument("--manifest")
    parser.add_argument("--scope", choices=("december", "archive"), required=True)
    parser.add_argument("--attempt-id")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Print every resolved path and freeze-hash check without opening "
            "the scope or writing anything."
        ),
    )
    args = parser.parse_args()
    config_path = Path(args.config).resolve()
    config = load_json(config_path)
    manifest_path = resolve_manifest(args.manifest, config)
    free_gb = shutil.disk_usage(config["compute"]["external_root"]).free / 1024**3
    months = list(
        map(
            str,
            config["phase4"]["gate_months"]
            if args.scope == "december"
            else config["phase5"]["locked_months"],
        )
    )
    if args.dry_run:
        print(
            json.dumps(
                dry_run(
                    config, config_path, manifest_path, args.scope, months, free_gb
                ),
                indent=2,
            )
        )
        return
    required = float(
        config["outcome_protocol"]["minimum_free_gb_before_acquisition"]
    )
    if free_gb < required:
        raise RuntimeError(
            f"opening {args.scope} requires {required:.0f} GiB free; found {free_gb:.1f}"
        )
    attempt_id = args.attempt_id or f"{args.scope}-{uuid.uuid4().hex}"
    value = begin_scope(
        manifest_path, config_path, args.scope, months, attempt_id
    )
    print(
        json.dumps(
            {
                "scope": args.scope,
                "months": months,
                "attempt_id": attempt_id,
                "free_gb": free_gb,
                "manifest": str(manifest_path),
                "protocol_state": value["protocol_state"],
            }
        )
    )


if __name__ == "__main__":
    main()
