#!/usr/bin/env python3
"""Record an explicit product activation after Phase 6 evidence is eligible."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write
from validate_phase6_release_readiness import runtime_eligibility_document


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
READINESS = (
    ROOT
    / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
    / "live_feature_pipeline/phase6_release_readiness.json"
)
ELIGIBILITY = ROOT / "ml/config/propagation_v4_2_runtime_eligibility.json"
DEFAULT_OUTPUT = ROOT / "ml/config/propagation_v4_2_runtime_activation.json"
RUNTIME_MODES = (
    "system_health_view",
    "beta_collection",
    "core_nowcast",
    "stationcast_deterministic",
    "stationcast_learned",
    "futurecast",
    "six_meter",
)


def build_activation_document(
    readiness_bytes: bytes,
    eligibility: dict[str, Any],
    requested_modes: list[str],
    *,
    activated_at: datetime,
) -> dict[str, Any]:
    readiness = json.loads(readiness_bytes)
    if not isinstance(readiness, dict):
        raise RuntimeError("Phase 6 readiness must be a JSON object")
    if (
        readiness.get("schema_version") != 1
        or readiness.get("scope") != "phase6_mode_specific_release_readiness"
        or readiness.get("valid_fail_closed_decision") is not True
        or readiness.get("locked_prospective_outcomes_read") is not False
    ):
        raise RuntimeError("Phase 6 readiness boundary is invalid")
    readiness_sha256 = hashlib.sha256(readiness_bytes).hexdigest()
    expected_eligibility = runtime_eligibility_document(
        readiness,
        source_readiness_sha256=readiness_sha256,
    )
    if eligibility != expected_eligibility:
        raise RuntimeError("runtime eligibility is stale or does not match readiness")
    if any(mode not in RUNTIME_MODES for mode in requested_modes):
        raise RuntimeError("unknown runtime activation mode")
    approved_modes = sorted(set(requested_modes))
    ineligible = [
        mode for mode in approved_modes
        if eligibility["modes"].get(mode) is not True
    ]
    if ineligible:
        raise RuntimeError(
            "runtime modes are not evidence-eligible: " + ", ".join(ineligible)
        )
    approved = bool(approved_modes)
    return {
        "schema_version": 1,
        "scope": "phase6_runtime_activation",
        "activation_state": "approved" if approved else "disabled",
        "product_activation_recorded": approved,
        "approved_modes": approved_modes,
        "locked_prospective_outcomes_read": False,
        "source_readiness_sha256": readiness_sha256,
        "activated_at": activated_at.isoformat() if approved else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument(
        "--approve-mode",
        action="append",
        choices=RUNTIME_MODES,
        dest="approved_modes",
    )
    action.add_argument("--disable-all", action="store_true")
    parser.add_argument("--readiness", type=Path, default=READINESS)
    parser.add_argument("--eligibility", type=Path, default=ELIGIBILITY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    readiness_bytes = args.readiness.read_bytes()
    eligibility = json.loads(args.eligibility.read_text(encoding="utf-8"))
    if not isinstance(eligibility, dict):
        raise RuntimeError("runtime eligibility must be a JSON object")
    result = build_activation_document(
        readiness_bytes,
        eligibility,
        [] if args.disable_all else args.approved_modes,
        activated_at=datetime.now(timezone.utc),
    )
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
