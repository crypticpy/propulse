#!/usr/bin/env python3
"""Build the fail-closed Phase 6 release decision from durable evidence."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from m5_runtime import validate_m5_runtime
from validate_live_feature_migration import ROOT, atomic_write


CONFIG = ROOT / "ml/config/propagation_v4_2_phase2_scale.json"
PHASE2 = ROOT / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
LIVE = PHASE2 / "live_feature_pipeline"
DEFAULT_OUTPUT = LIVE / "phase6_release_readiness.json"
PROSPECTIVE_WINDOW_END = datetime(2026, 10, 1, tzinfo=timezone.utc)
EVIDENCE_PATHS = {
    "archive_protocol": PHASE2 / "outcome_protocol_manifest.json",
    "phase3": PHASE2 / "phase3_candidate_validation.json",
    "wspr_shadow": LIVE / "wspr_research_shadow_progress.json",
    "recent_path_source_authorization": LIVE / "source_authorization.json",
    "prospective_capture": LIVE / "prospective_capture_readiness.json",
    "health_hardening": LIVE / "research_health_hardening_deployment_validation.json",
    "health_external_monitor": LIVE / "research_health_external_monitor_validation.json",
    "stale_recovery": LIVE / "research_health_incident_delivery_validation.json",
    "literal_m5_outage": LIVE / "m5_full_outage_recovery_validation.json",
    "participation_boundary": LIVE / "research_participation_deployment_validation.json",
    "beta_protocol_boundary": LIVE / "propagation_beta_protocol_deployment_validation.json",
    "beta_telemetry_boundary": LIVE / "stationcast_beta_telemetry_utc_deployment_validation.json",
    "beta_stop_producers": LIVE / "stationcast_beta_stop_producer_validation.json",
    "stationcast_beta": LIVE / "stationcast_beta_release_decision.json",
    "nowcast_prospective": LIVE / "nowcast_prospective_release_decision.json",
    "learned_stationcast": LIVE / "learned_stationcast_release_decision.json",
    "futurecast": ROOT / "ml/results/propagation_v4/futurecast_readiness.json",
    "six_meter": (
        ROOT
        / "ml/results/propagation_v4/propagation_v4_multiyear_50m"
        / "6m_release_decision.json"
    ),
}
BETA_PROTOCOL = ROOT / "ml/PERSONALIZED-PROPAGATION-V4.2-BETA-PROTOCOL.md"


def all_boolean_gates_pass(document: dict[str, Any] | None) -> bool:
    if not document:
        return False
    gates = document.get("gates")
    return isinstance(gates, dict) and bool(gates) and all(
        value is True for value in gates.values()
    )


def passed(document: dict[str, Any] | None) -> bool:
    if not document:
        return False
    decision_passed = document.get("decision") == "pass" or document.get("passed") is True
    gates = document.get("gates")
    return decision_passed and (
        gates is None or all_boolean_gates_pass(document)
    )


def deployed(document: dict[str, Any] | None) -> bool:
    if not document or not passed(document):
        return False
    migration = document.get("migration")
    migration_record = migration if isinstance(migration, dict) else {}
    privacy = document.get("privacy")
    privacy_record = privacy if isinstance(privacy, dict) else {}
    return bool(
        (
            document.get("migration_deployed") is True
            or migration_record.get("deployed") is True
        )
        and (
            document.get("locked_outcomes_read") is False
            or privacy_record.get("locked_outcomes_read") is False
        )
    )


def load_evidence(
    paths: dict[str, Path] = EVIDENCE_PATHS,
) -> tuple[dict[str, dict[str, Any] | None], dict[str, dict[str, Any]]]:
    evidence: dict[str, dict[str, Any] | None] = {}
    provenance: dict[str, dict[str, Any]] = {}
    for name, path in paths.items():
        record: dict[str, Any] = {
            "path": path.relative_to(ROOT).as_posix(),
            "exists": path.is_file(),
        }
        if not path.is_file():
            evidence[name] = None
            record["error"] = "missing"
            provenance[name] = record
            continue
        content = path.read_bytes()
        record["sha256"] = hashlib.sha256(content).hexdigest()
        try:
            decoded = json.loads(content)
            if not isinstance(decoded, dict):
                raise ValueError("top-level JSON value is not an object")
            evidence[name] = decoded
            record["schema_version"] = decoded.get("schema_version")
            record["decision"] = decoded.get("decision")
        except (json.JSONDecodeError, ValueError) as error:
            evidence[name] = None
            record["error"] = type(error).__name__
        provenance[name] = record
    return evidence, provenance


def evaluate_release_readiness(
    evidence: dict[str, dict[str, Any] | None],
    *,
    protocol_preregistered: bool,
    as_of: datetime,
) -> dict[str, Any]:
    archive = evidence.get("archive_protocol") or {}
    phase3 = evidence.get("phase3") or {}
    wspr = evidence.get("wspr_shadow") or {}
    capture = evidence.get("prospective_capture") or {}
    futurecast = evidence.get("futurecast") or {}
    six_meter = evidence.get("six_meter") or {}
    wspr_window = wspr.get("window") if isinstance(wspr.get("window"), dict) else {}
    capture_window = (
        capture.get("prospective_window")
        if isinstance(capture.get("prospective_window"), dict)
        else {}
    )
    phase3_runtime = phase3.get("runtime") if isinstance(phase3.get("runtime"), dict) else {}
    gates = {
        "archive_candidate_frozen_and_passed": bool(
            archive.get("candidate_frozen") is True
            and archive.get("december_decision_passed") is True
            and archive.get("archive_decision_passed") is True
            and archive.get("protocol_state") == "archive_passed"
        ),
        "phase3_serving_candidate_validated": bool(
            phase3.get("passed") is True and all_boolean_gates_pass(phase3)
        ),
        "phase3_native_m5_openmp_evidence": bool(
            phase3_runtime.get("machine") == "arm64"
            and int(phase3_runtime.get("physical_cores_visible", 0)) >= 18
            and phase3_runtime.get("xgboost_openmp") is True
        ),
        "prospective_capture_has_24_continuous_hours": bool(
            capture.get("prospective_capture_ready") is True
            and capture.get("operational_healthy") is True
            and (capture.get("gates") or {}).get("minimum_continuity_reached") is True
            and (capture.get("gates") or {}).get("prospective_outcomes_unread") is True
            and capture_window.get("outcomes_read") is False
        ),
        "wspr_shadow_has_720_hours_at_99_percent": bool(
            int(wspr_window.get("completed_hours", 0)) >= 720
            and int(wspr_window.get("minimum_hours", 720)) >= 720
            and float(wspr_window.get("completion_rate", 0.0)) >= 0.99
            and (wspr.get("gates") or {}).get("minimum_30_day_window_complete") is True
            and (wspr.get("gates") or {}).get("all_ten_bands_present_each_hour") is True
            and (wspr.get("gates") or {}).get("all_receipts_and_manifests_valid") is True
            and not wspr.get("integrity_errors")
            and wspr.get("locked_outcomes_read") is False
        ),
        "subscriber_recent_path_source_authorized": bool(
            passed(evidence.get("recent_path_source_authorization"))
            and (evidence.get("recent_path_source_authorization") or {}).get(
                "scope"
            ) == "approved_subscriber_recent_path_source"
            and (evidence.get("recent_path_source_authorization") or {}).get(
                "subscriber_facing_authorized"
            ) is True
        ),
        "research_health_boundaries_deployed": bool(
            deployed(evidence.get("health_hardening"))
            and passed(evidence.get("health_external_monitor"))
        ),
        "stale_and_recovery_incident_exercised": passed(evidence.get("stale_recovery")),
        "literal_full_m5_outage_exercised": bool(
            passed(evidence.get("literal_m5_outage"))
            and (evidence.get("literal_m5_outage") or {}).get("scope")
            == "controlled_full_m5_power_outage_recovery"
            and (evidence.get("literal_m5_outage") or {}).get("gates", {}).get(
                "off_m5_monitor_detected_power_loss"
            ) is True
            and (evidence.get("literal_m5_outage") or {}).get("gates", {}).get(
                "publisher_recovered_after_power_restore"
            ) is True
        ),
        "participation_boundary_deployed": deployed(
            evidence.get("participation_boundary")
        ),
        "beta_protocol_boundary_deployed": deployed(
            evidence.get("beta_protocol_boundary")
        ),
        "beta_telemetry_boundary_deployed": deployed(
            evidence.get("beta_telemetry_boundary")
        ),
        "beta_stop_event_producers_validated": passed(
            evidence.get("beta_stop_producers")
        ),
        "beta_protocol_preregistered": protocol_preregistered,
        "stationcast_beta_passed": bool(
            passed(evidence.get("stationcast_beta"))
            and (evidence.get("stationcast_beta") or {}).get("release_approved") is True
        ),
        "prospective_window_closed": as_of >= PROSPECTIVE_WINDOW_END,
        "nowcast_prospective_evaluation_passed": bool(
            passed(evidence.get("nowcast_prospective"))
            and (evidence.get("nowcast_prospective") or {}).get("release_approved") is True
            and (evidence.get("nowcast_prospective") or {}).get("window")
            == {"start": "2026-08-01", "end": "2026-09-30"}
        ),
        "learned_stationcast_release_evidence_passed": bool(
            passed(evidence.get("learned_stationcast"))
            and (evidence.get("learned_stationcast") or {}).get("release_approved") is True
        ),
        "futurecast_90_day_horizon_evidence_passed": bool(
            futurecast.get("issued_forecast_training_ready") is True
            and futurecast.get("release_approved") is True
            and all(
                int((futurecast.get("horizons") or {}).get(str(horizon), {}).get(
                    "longest_consecutive_common_days", 0
                )) >= 90
                and (futurecast.get("horizons") or {}).get(str(horizon), {}).get(
                    "status"
                ) == "release_approved"
                for horizon in (3, 6, 12, 24)
            )
        ),
        "six_meter_mechanism_release_evidence_passed": bool(
            six_meter.get("release_approved") is True
            and six_meter.get("product_serving_allowed") is True
            and six_meter.get("decision") == "release"
        ),
    }

    core_prerequisites = (
        "archive_candidate_frozen_and_passed",
        "phase3_serving_candidate_validated",
        "phase3_native_m5_openmp_evidence",
        "prospective_capture_has_24_continuous_hours",
        "wspr_shadow_has_720_hours_at_99_percent",
        "subscriber_recent_path_source_authorized",
        "research_health_boundaries_deployed",
        "stale_and_recovery_incident_exercised",
        "literal_full_m5_outage_exercised",
    )
    beta_collection_prerequisites = core_prerequisites + (
        "participation_boundary_deployed",
        "beta_protocol_boundary_deployed",
        "beta_telemetry_boundary_deployed",
        "beta_stop_event_producers_validated",
        "beta_protocol_preregistered",
    )
    core_release_prerequisites = core_prerequisites + (
        "prospective_window_closed",
        "nowcast_prospective_evaluation_passed",
    )
    stationcast_release_prerequisites = beta_collection_prerequisites + (
        "stationcast_beta_passed",
    )

    def blockers(required: tuple[str, ...]) -> list[str]:
        return [name for name in required if not gates[name]]

    beta_blockers = blockers(beta_collection_prerequisites)
    core_blockers = blockers(core_release_prerequisites)
    stationcast_blockers = blockers(stationcast_release_prerequisites)
    core_ready = not core_blockers
    stationcast_ready = not stationcast_blockers
    learned_ready = gates["learned_stationcast_release_evidence_passed"]
    futurecast_ready = gates["futurecast_90_day_horizon_evidence_passed"]
    six_meter_ready = gates["six_meter_mechanism_release_evidence_passed"]
    supported_scope_ready = core_ready

    mode_decisions = {
        "core_nowcast": {
            "status": "release_candidate" if core_ready else "shadow_only",
            "blockers": core_blockers,
        },
        "stationcast_deterministic": {
            "status": "release_candidate" if stationcast_ready else "shadow_only",
            "blockers": stationcast_blockers,
        },
        "stationcast_learned": {
            "status": "release_candidate" if learned_ready else "withheld",
            "blockers": [] if learned_ready else [
                "learned_stationcast_release_evidence_passed"
            ],
        },
        "futurecast": {
            "status": "release_candidate" if futurecast_ready else "withheld",
            "horizons_hours": [3, 6, 12, 24],
            "blockers": [] if futurecast_ready else [
                "futurecast_90_day_horizon_evidence_passed"
            ],
        },
        "six_meter": {
            "status": "release_candidate" if six_meter_ready else "withheld",
            "blockers": [] if six_meter_ready else [
                "six_meter_mechanism_release_evidence_passed"
            ],
        },
        "system_health_view": {
            "status": "eligible_hidden_by_product_flag"
            if all(gates[name] for name in core_prerequisites)
            else "hidden",
            "blockers": blockers(core_prerequisites),
        },
    }
    return {
        "gates": gates,
        "beta_collection": {
            "status": "eligible" if not beta_blockers else "disabled",
            "blockers": beta_blockers,
        },
        "mode_decisions": mode_decisions,
        "supported_scope_release_ready": supported_scope_ready,
        "public_release": {
            "status": "release_candidate" if supported_scope_ready else "withheld",
            "releaseable_modes": [
                name
                for name, ready in (
                    ("core_nowcast", core_ready),
                    ("stationcast_deterministic", stationcast_ready),
                    ("stationcast_learned", learned_ready),
                    ("futurecast", futurecast_ready),
                    ("six_meter", six_meter_ready),
                )
                if ready
            ],
            "unsupported_modes_may_remain_withheld": True,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=("m5",), required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--require-release", action="store_true")
    args = parser.parse_args()

    runtime = validate_m5_runtime(json.loads(CONFIG.read_text(encoding="utf-8")))
    evidence, provenance = load_evidence()
    now = datetime.now(timezone.utc)
    evaluation = evaluate_release_readiness(
        evidence,
        protocol_preregistered=BETA_PROTOCOL.is_file(),
        as_of=now,
    )
    protocol_provenance = {
        "path": BETA_PROTOCOL.relative_to(ROOT).as_posix(),
        "exists": BETA_PROTOCOL.is_file(),
    }
    if BETA_PROTOCOL.is_file():
        protocol_provenance["sha256"] = hashlib.sha256(
            BETA_PROTOCOL.read_bytes()
        ).hexdigest()
    result = {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "scope": "phase6_mode_specific_release_readiness",
        "decision": (
            "release_candidate"
            if evaluation["supported_scope_release_ready"]
            else "withheld"
        ),
        "valid_fail_closed_decision": True,
        "locked_prospective_outcomes_read": False,
        "runtime": {
            "machine": runtime["machine"],
            "physical_cores_visible": runtime["physical_cores_visible"],
            "xgboost_openmp_evidence": True,
        },
        "evidence": {**provenance, "beta_protocol": protocol_provenance},
        **evaluation,
    }
    atomic_write(args.output, result)
    print(json.dumps(result, indent=2))
    if args.require_release and not result["supported_scope_release_ready"]:
        raise SystemExit("Phase 6 supported release scope is not ready")


if __name__ == "__main__":
    main()
