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
FUTURECAST_CONFIG = ROOT / "ml/config/futurecast_v1.json"
FUTURECAST_SCORER = ROOT / "ml/src/archive_v4/score_futurecast_gate.py"
FUTURECAST_HORIZONS = (3, 6, 12, 24)
PHASE2 = ROOT / "ml/results/propagation_v4_2/propagation_v4_2_phase2_scale"
LIVE = PHASE2 / "live_feature_pipeline"
DEFAULT_OUTPUT = LIVE / "phase6_release_readiness.json"
DEFAULT_RUNTIME_ELIGIBILITY = (
    ROOT / "ml/config/propagation_v4_2_runtime_eligibility.json"
)
PROSPECTIVE_WINDOW_END = datetime(2026, 10, 1, tzinfo=timezone.utc)
EVIDENCE_PATHS = {
    "archive_protocol": PHASE2 / "outcome_protocol_manifest.json",
    "phase3": PHASE2 / "phase3_candidate_validation.json",
    "wspr_shadow": LIVE / "wspr_research_shadow_progress.json",
    "wspr_coverage_drift": LIVE / "wspr_shadow_coverage_drift.json",
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
    "futurecast_gate": (
        ROOT / "ml/results/propagation_v4/futurecast_release_decision.json"
    ),
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


def written_source_authorization_passed(
    document: dict[str, Any] | None,
) -> bool:
    if not document or not passed(document):
        return False
    source = document.get("source")
    evidence = document.get("evidence")
    privacy = document.get("privacy")
    return bool(
        document.get("schema_version") == 1
        and document.get("scope") == "approved_subscriber_recent_path_source"
        and document.get("subscriber_facing_authorized") is True
        and document.get("authorization_basis")
        == "written_permission_from_source_operator"
        and source
        == {
            "id": "wspr_live",
            "service_url": "https://wspr.live/",
            "terms_url": "https://wspr.live/",
        }
        and document.get("authorized_roles")
        == ["internal_research", "subscriber_recent_path_features"]
        and isinstance(evidence, dict)
        and evidence.get("private_correspondence_recorded") is False
        and isinstance(privacy, dict)
        and privacy.get("private_correspondence_written") is False
        and privacy.get("station_identity_written") is False
        and privacy.get("locked_outcomes_read") is False
    )


def literal_m5_outage_passed(document: dict[str, Any] | None) -> bool:
    if not document or not passed(document):
        return False
    evidence = document.get("evidence")
    privacy = document.get("privacy")
    return bool(
        document.get("schema_version") == 1
        and document.get("scope")
        == "controlled_full_m5_power_outage_recovery"
        and (document.get("gates") or {}).get(
            "off_m5_monitor_detected_power_loss"
        )
        is True
        and (document.get("gates") or {}).get(
            "publisher_recovered_after_power_restore"
        )
        is True
        and isinstance(evidence, dict)
        and evidence.get("private_state_path_recorded") is False
        and isinstance(privacy, dict)
        and privacy.get("boot_session_identifier_written") is False
        and privacy.get("private_endpoint_written") is False
        and privacy.get("secret_value_written") is False
        and privacy.get("locked_outcomes_read") is False
    )


def aggregate_coverage_drift_passed(
    document: dict[str, Any] | None,
) -> bool:
    if not document or not passed(document):
        return False
    window = document.get("window")
    privacy = document.get("privacy")
    gates = document.get("gates")
    execution = document.get("execution")
    provenance = window.get("provenance") if isinstance(window, dict) else None
    expected_hours = (
        int(window.get("expected_hours", 0))
        if isinstance(window, dict)
        else 0
    )
    query_chunk_hours = (
        int(execution.get("query_chunk_hours", 0))
        if isinstance(execution, dict)
        else 0
    )
    query_chunk_count = (
        int(execution.get("query_chunk_count", 0))
        if isinstance(execution, dict)
        else 0
    )
    return bool(
        document.get("schema_version") == 1
        and document.get("scope")
        == "wspr_shadow_aggregate_coverage_and_source_drift"
        and document.get("operational_status") == "healthy"
        and document.get("research_only") is True
        and isinstance(window, dict)
        and expected_hours >= 720
        and int(window.get("completed_hours", 0)) >= 713
        and float(window.get("completion_rate", 0.0)) >= 0.99
        and isinstance(provenance, dict)
        and provenance.get("source_scope") == "wspr_research_shadow_progress"
        and isinstance(provenance.get("progress_sha256"), str)
        and len(provenance["progress_sha256"]) == 64
        and all(
            character in "0123456789abcdef"
            for character in provenance["progress_sha256"]
        )
        and provenance.get("audited_start") == window.get("start")
        and provenance.get("audited_end") == window.get("end")
        and int(provenance.get("audited_expected_hours", 0))
        == int(window.get("expected_hours", 0))
        and isinstance(gates, dict)
        and gates.get("window_bound_to_signed_scheduled_receipts") is True
        and gates.get("database_queries_bounded_to_24_hours") is True
        and gates.get("all_ten_hf_bands_observed") is True
        and gates.get("all_24_utc_hours_observed") is True
        and gates.get("early_late_drift_sample_sufficient") is True
        and gates.get("aggregate_source_distribution_stable") is True
        and isinstance(execution, dict)
        and 1 <= query_chunk_hours <= 24
        and query_chunk_count
        == (expected_hours + query_chunk_hours - 1) // query_chunk_hours
        and isinstance(privacy, dict)
        and privacy.get("source_tables")
        == [
            "public.wspr_feature_watermarks",
            "public.wspr_path_hourly_features",
        ]
        and privacy.get("raw_observation_table_read") is False
        and privacy.get("station_identity_written") is False
        and privacy.get("grid4_written") is False
        and privacy.get("equipment_written") is False
        and privacy.get("locked_outcomes_read") is False
    )


def valid_sha256(value: object) -> bool:
    return bool(
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def futurecast_release_evidence(
    document: dict[str, Any] | None,
    *,
    expected_readiness_sha256: str | None,
) -> dict[str, Any]:
    invalid = {
        "valid": False,
        "released_horizons_hours": [],
        "withheld_horizons_hours": list(FUTURECAST_HORIZONS),
    }
    if not isinstance(document, dict):
        return invalid
    horizons = document.get("horizons")
    released = document.get("released_horizons_hours")
    withheld = document.get("withheld_horizons_hours")
    if (
        document.get("schema_version") != 1
        or document.get("scope") != "futurecast_v1_locked_gate"
        or document.get("data_scope") != "production_issued_history"
        or document.get("gate_scored_once") is not True
        or document.get("post_gate_tuning_permitted") is not False
        or document.get("observed_weather_substituted") is not False
        or document.get("locked_core_policy_changed") is not False
        or not isinstance(horizons, dict)
        or set(horizons) != {str(value) for value in FUTURECAST_HORIZONS}
        or not isinstance(released, list)
        or not isinstance(withheld, list)
        or any(type(value) is not int for value in [*released, *withheld])
        or len(set(released)) != len(released)
        or len(set(withheld)) != len(withheld)
    ):
        return invalid
    released_values = sorted(released)
    withheld_values = sorted(withheld)
    if (
        set(released_values) & set(withheld_values)
        or sorted([*released_values, *withheld_values]) != list(FUTURECAST_HORIZONS)
        or document.get("release_approved") is not bool(released_values)
    ):
        return invalid
    expected_decision = (
        "release_candidate"
        if len(released_values) == len(FUTURECAST_HORIZONS)
        else "partial_release_candidate"
        if released_values
        else "withheld"
    )
    if document.get("decision") != expected_decision:
        return invalid
    expected_config_sha256 = hashlib.sha256(FUTURECAST_CONFIG.read_bytes()).hexdigest()
    expected_scorer_sha256 = hashlib.sha256(FUTURECAST_SCORER.read_bytes()).hexdigest()
    if (
        document.get("config_sha256") != expected_config_sha256
        or document.get("scorer_sha256") != expected_scorer_sha256
        or not valid_sha256(expected_readiness_sha256)
        or document.get("readiness_sha256") != expected_readiness_sha256
        or not all(
            valid_sha256(document.get(name))
            for name in (
                "readiness_sha256",
                "example_manifest_sha256",
                "training_manifest_sha256",
                "p533_manifest_sha256",
            )
        )
    ):
        return invalid
    for horizon in FUTURECAST_HORIZONS:
        record = horizons.get(str(horizon))
        if not isinstance(record, dict):
            return invalid
        gates = record.get("gates")
        if (
            record.get("horizon_hours") != horizon
            or type(record.get("issue_days")) is not int
            or record.get("issue_days") != 15
            or not isinstance(gates, dict)
            or not gates
            or any(type(value) is not bool for value in gates.values())
        ):
            return invalid
        approved = horizon in released_values
        if (
            record.get("release_approved") is not approved
            or record.get("status") != ("pass" if approved else "withheld")
            or all(gates.values()) is not approved
        ):
            return invalid
    return {
        "valid": True,
        "released_horizons_hours": released_values,
        "withheld_horizons_hours": withheld_values,
    }


def futurecast_readiness_mature(document: dict[str, Any]) -> bool:
    horizons = document.get("horizons")
    if (
        document.get("issued_forecast_training_ready") is not True
        or not isinstance(horizons, dict)
    ):
        return False
    for horizon in FUTURECAST_HORIZONS:
        record = horizons.get(str(horizon))
        if not isinstance(record, dict):
            return False
        days = record.get("longest_consecutive_common_days")
        if type(days) is not int or days < 90:
            return False
    return True


def reject_nonfinite_json(value: str) -> None:
    raise ValueError(f"non-finite JSON constant is forbidden: {value}")


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
            decoded = json.loads(content, parse_constant=reject_nonfinite_json)
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
    futurecast_readiness_sha256: str | None = None,
) -> dict[str, Any]:
    archive = evidence.get("archive_protocol") or {}
    phase3 = evidence.get("phase3") or {}
    wspr = evidence.get("wspr_shadow") or {}
    coverage = evidence.get("wspr_coverage_drift") or {}
    capture = evidence.get("prospective_capture") or {}
    futurecast = evidence.get("futurecast") or {}
    futurecast_gate = futurecast_release_evidence(
        evidence.get("futurecast_gate"),
        expected_readiness_sha256=futurecast_readiness_sha256,
    )
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
        "wspr_aggregate_coverage_and_drift_passed": (
            aggregate_coverage_drift_passed(coverage)
        ),
        "subscriber_recent_path_source_authorized": (
            written_source_authorization_passed(
                evidence.get("recent_path_source_authorization")
            )
        ),
        "research_health_boundaries_deployed": bool(
            deployed(evidence.get("health_hardening"))
            and passed(evidence.get("health_external_monitor"))
        ),
        "stale_and_recovery_incident_exercised": passed(evidence.get("stale_recovery")),
        "literal_full_m5_outage_exercised": literal_m5_outage_passed(
            evidence.get("literal_m5_outage")
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
            futurecast_readiness_mature(futurecast)
            and futurecast_gate["valid"] is True
            and bool(futurecast_gate["released_horizons_hours"])
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
        "wspr_aggregate_coverage_and_drift_passed",
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
            "horizons_hours": list(FUTURECAST_HORIZONS),
            "released_horizons_hours": (
                futurecast_gate["released_horizons_hours"]
                if futurecast_ready
                else []
            ),
            "withheld_horizons_hours": (
                futurecast_gate["withheld_horizons_hours"]
                if futurecast_ready
                else list(FUTURECAST_HORIZONS)
            ),
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


def runtime_eligibility_document(
    evaluation: dict[str, Any],
    *,
    source_readiness_sha256: str,
) -> dict[str, Any]:
    if not valid_sha256(source_readiness_sha256):
        raise RuntimeError("runtime eligibility requires a readiness checksum")
    decisions = evaluation["mode_decisions"]
    futurecast_horizons = decisions["futurecast"].get(
        "released_horizons_hours", []
    )
    if (
        decisions["futurecast"]["status"] != "release_candidate"
        or not futurecast_horizons
    ):
        futurecast_horizons = []
    return {
        "schema_version": 2,
        "scope": "phase6_runtime_eligibility",
        "locked_prospective_outcomes_read": False,
        "source_readiness_sha256": source_readiness_sha256,
        "futurecast_horizons_hours": futurecast_horizons,
        "modes": {
            "system_health_view": (
                decisions["system_health_view"]["status"]
                == "eligible_hidden_by_product_flag"
            ),
            "beta_collection": (
                evaluation["beta_collection"]["status"] == "eligible"
            ),
            "core_nowcast": (
                decisions["core_nowcast"]["status"] == "release_candidate"
            ),
            "stationcast_deterministic": (
                decisions["stationcast_deterministic"]["status"]
                == "release_candidate"
            ),
            "stationcast_learned": (
                decisions["stationcast_learned"]["status"]
                == "release_candidate"
            ),
            "futurecast": (
                decisions["futurecast"]["status"] == "release_candidate"
            ),
            "six_meter": (
                decisions["six_meter"]["status"] == "release_candidate"
            ),
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
        futurecast_readiness_sha256=(
            provenance.get("futurecast", {}).get("sha256")
        ),
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
    readiness_sha256 = hashlib.sha256(args.output.read_bytes()).hexdigest()
    atomic_write(
        DEFAULT_RUNTIME_ELIGIBILITY,
        runtime_eligibility_document(
            evaluation,
            source_readiness_sha256=readiness_sha256,
        ),
    )
    print(json.dumps(result, indent=2))
    if args.require_release and not result["supported_scope_release_ready"]:
        raise SystemExit("Phase 6 supported release scope is not ready")


if __name__ == "__main__":
    main()
