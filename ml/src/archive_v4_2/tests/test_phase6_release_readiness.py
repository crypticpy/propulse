from __future__ import annotations

import hashlib
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from validate_phase6_release_readiness import (  # noqa: E402
    EVIDENCE_PATHS,
    FUTURECAST_CONFIG,
    FUTURECAST_HORIZONS,
    FUTURECAST_SCORER,
    evaluate_release_readiness,
    load_evidence,
    runtime_eligibility_document,
)


AFTER_WINDOW = datetime(2026, 10, 2, tzinfo=timezone.utc)


def passing_document(**values: object) -> dict[str, object]:
    return {"decision": "pass", "gates": {"complete": True}, **values}


def release_evidence() -> dict[str, dict[str, object] | None]:
    return {
        "archive_protocol": {
            "candidate_frozen": True,
            "december_decision_passed": True,
            "archive_decision_passed": True,
            "protocol_state": "archive_passed",
        },
        "phase3": {
            "passed": True,
            "gates": {"complete": True},
            "runtime": {
                "machine": "arm64",
                "physical_cores_visible": 18,
                "xgboost_openmp": True,
            },
        },
        "wspr_shadow": {
            "window": {
                "completed_hours": 720,
                "minimum_hours": 720,
                "completion_rate": 0.99,
            },
            "gates": {
                "minimum_30_day_window_complete": True,
                "all_ten_bands_present_each_hour": True,
                "all_receipts_and_manifests_valid": True,
            },
            "subscriber_facing_authorized": True,
            "integrity_errors": [],
            "locked_outcomes_read": False,
        },
        "wspr_coverage_drift": passing_document(
            schema_version=1,
            scope="wspr_shadow_aggregate_coverage_and_source_drift",
            operational_status="healthy",
            research_only=True,
            window={
                "start": "2026-07-01T00:00:00+00:00",
                "end": "2026-07-30T23:00:00+00:00",
                "expected_hours": 720,
                "completed_hours": 720,
                "completion_rate": 1.0,
                "provenance": {
                    "source_scope": "wspr_research_shadow_progress",
                    "progress_sha256": "a" * 64,
                    "audited_start": "2026-07-01T00:00:00+00:00",
                    "audited_end": "2026-07-30T23:00:00+00:00",
                    "audited_expected_hours": 720,
                },
            },
            gates={
                "window_bound_to_signed_scheduled_receipts": True,
                "database_queries_bounded_to_24_hours": True,
                "all_ten_hf_bands_observed": True,
                "all_24_utc_hours_observed": True,
                "early_late_drift_sample_sufficient": True,
                "aggregate_source_distribution_stable": True,
            },
            execution={
                "query_chunk_hours": 24,
                "query_chunk_count": 30,
            },
            privacy={
                "source_tables": [
                    "public.wspr_feature_watermarks",
                    "public.wspr_path_hourly_features",
                ],
                "raw_observation_table_read": False,
                "station_identity_written": False,
                "grid4_written": False,
                "equipment_written": False,
                "locked_outcomes_read": False,
            },
        ),
        "recent_path_source_authorization": passing_document(
            schema_version=1,
            scope="approved_subscriber_recent_path_source",
            subscriber_facing_authorized=True,
            authorization_basis="written_permission_from_source_operator",
            source={
                "id": "wspr_live",
                "service_url": "https://wspr.live/",
                "terms_url": "https://wspr.live/",
            },
            authorized_roles=[
                "internal_research",
                "subscriber_recent_path_features",
            ],
            evidence={"private_correspondence_recorded": False},
            privacy={
                "private_correspondence_written": False,
                "station_identity_written": False,
                "locked_outcomes_read": False,
            },
        ),
        "prospective_capture": {
            "prospective_capture_ready": True,
            "operational_healthy": True,
            "gates": {
                "minimum_continuity_reached": True,
                "prospective_outcomes_unread": True,
            },
            "prospective_window": {"outcomes_read": False},
        },
        "health_hardening": passing_document(
            migration_deployed=True,
            locked_outcomes_read=False,
        ),
        "health_external_monitor": passing_document(),
        "stale_recovery": passing_document(),
        "literal_m5_outage": passing_document(
            schema_version=1,
            scope="controlled_full_m5_power_outage_recovery",
            gates={
                "off_m5_monitor_detected_power_loss": True,
                "publisher_recovered_after_power_restore": True,
            },
            evidence={"private_state_path_recorded": False},
            privacy={
                "boot_session_identifier_written": False,
                "private_endpoint_written": False,
                "secret_value_written": False,
                "locked_outcomes_read": False,
            },
        ),
        "participation_boundary": passing_document(
            migration_deployed=True,
            locked_outcomes_read=False,
        ),
        "beta_protocol_boundary": passing_document(
            migration_deployed=True,
            locked_outcomes_read=False,
        ),
        "beta_telemetry_boundary": passing_document(
            migration_deployed=True,
            locked_outcomes_read=False,
        ),
        "beta_stop_producers": passing_document(),
        "stationcast_beta": passing_document(release_approved=True),
        "nowcast_prospective": passing_document(
            release_approved=True,
            window={"start": "2026-08-01", "end": "2026-09-30"},
        ),
        "learned_stationcast": None,
        "futurecast": {
            "issued_forecast_training_ready": False,
            "release_approved": False,
        },
        "futurecast_gate": None,
        "six_meter": {
            "decision": "withheld",
            "release_approved": False,
            "product_serving_allowed": False,
        },
    }


def futurecast_gate_document(
    released: tuple[int, ...],
    *,
    data_scope: str = "production_issued_history",
) -> dict[str, object]:
    released_values = sorted(released)
    withheld_values = sorted(set(FUTURECAST_HORIZONS) - set(released_values))
    return {
        "schema_version": 1,
        "scope": "futurecast_v1_locked_gate",
        "data_scope": data_scope,
        "decision": (
            "release_candidate"
            if len(released_values) == len(FUTURECAST_HORIZONS)
            else "partial_release_candidate"
            if released_values
            else "withheld"
        ),
        "release_approved": bool(released_values),
        "released_horizons_hours": released_values,
        "withheld_horizons_hours": withheld_values,
        "config_sha256": hashlib.sha256(FUTURECAST_CONFIG.read_bytes()).hexdigest(),
        "scorer_sha256": hashlib.sha256(FUTURECAST_SCORER.read_bytes()).hexdigest(),
        "readiness_sha256": "d" * 64,
        "example_manifest_sha256": "a" * 64,
        "training_manifest_sha256": "b" * 64,
        "p533_manifest_sha256": "c" * 64,
        "gate_scored_once": True,
        "post_gate_tuning_permitted": False,
        "observed_weather_substituted": False,
        "locked_core_policy_changed": False,
        "horizons": {
            str(horizon): {
                "status": "pass" if horizon in released_values else "withheld",
                "release_approved": horizon in released_values,
                "horizon_hours": horizon,
                "issue_days": 15,
                "gates": {
                    "production_issued_evidence": horizon in released_values,
                    "skill_and_integrity": horizon in released_values,
                },
            }
            for horizon in FUTURECAST_HORIZONS
        },
    }


class Phase6ReleaseReadinessTests(unittest.TestCase):
    def test_futurecast_partial_horizon_release_is_mode_eligible(self) -> None:
        evidence = release_evidence()
        evidence["futurecast"] = {
            "issued_forecast_training_ready": True,
            "release_approved": False,
            "horizons": {
                str(horizon): {"longest_consecutive_common_days": 90}
                for horizon in FUTURECAST_HORIZONS
            },
        }
        evidence["futurecast_gate"] = futurecast_gate_document((3, 12))

        result = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
            futurecast_readiness_sha256="d" * 64,
        )

        self.assertTrue(
            result["gates"]["futurecast_90_day_horizon_evidence_passed"]
        )
        decision = result["mode_decisions"]["futurecast"]
        self.assertEqual(decision["status"], "release_candidate")
        self.assertEqual(decision["released_horizons_hours"], [3, 12])
        self.assertEqual(decision["withheld_horizons_hours"], [6, 24])
        runtime = runtime_eligibility_document(
            result,
            source_readiness_sha256="a" * 64,
        )
        self.assertTrue(runtime["modes"]["futurecast"])
        self.assertEqual(runtime["futurecast_horizons_hours"], [3, 12])

    def test_futurecast_rejects_synthetic_or_inconsistent_gate_evidence(self) -> None:
        for gate in (
            futurecast_gate_document((3,), data_scope="synthetic_fixture"),
            futurecast_gate_document((3,)),
        ):
            evidence = release_evidence()
            evidence["futurecast"] = {
                "issued_forecast_training_ready": True,
                "horizons": {
                    str(horizon): {"longest_consecutive_common_days": 90}
                    for horizon in FUTURECAST_HORIZONS
                },
            }
            evidence["futurecast_gate"] = gate
            if gate["data_scope"] == "production_issued_history":
                gate["withheld_horizons_hours"] = [6, 12]
            result = evaluate_release_readiness(
                evidence,
                protocol_preregistered=True,
                as_of=AFTER_WINDOW,
                futurecast_readiness_sha256="d" * 64,
            )
            self.assertFalse(
                result["gates"]["futurecast_90_day_horizon_evidence_passed"]
            )
            self.assertEqual(
                result["mode_decisions"]["futurecast"]["status"], "withheld"
            )

        evidence = release_evidence()
        evidence["futurecast"] = {
            "issued_forecast_training_ready": True,
            "horizons": {
                str(horizon): {"longest_consecutive_common_days": 90}
                for horizon in FUTURECAST_HORIZONS
            },
        }
        evidence["futurecast_gate"] = futurecast_gate_document((3,))
        result = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
            futurecast_readiness_sha256="e" * 64,
        )
        self.assertFalse(
            result["gates"]["futurecast_90_day_horizon_evidence_passed"]
        )

    def test_futurecast_withholds_every_horizon_until_history_is_mature(self) -> None:
        evidence = release_evidence()
        evidence["futurecast"] = {
            "issued_forecast_training_ready": False,
            "horizons": {
                str(horizon): {"longest_consecutive_common_days": 89}
                for horizon in FUTURECAST_HORIZONS
            },
        }
        evidence["futurecast_gate"] = futurecast_gate_document((3, 12))

        result = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
            futurecast_readiness_sha256="d" * 64,
        )

        decision = result["mode_decisions"]["futurecast"]
        self.assertEqual(decision["released_horizons_hours"], [])
        self.assertEqual(
            decision["withheld_horizons_hours"],
            list(FUTURECAST_HORIZONS),
        )

    def test_missing_evidence_fails_closed_without_invalidating_withholding(self) -> None:
        result = evaluate_release_readiness(
            {},
            protocol_preregistered=False,
            as_of=datetime(2026, 7, 16, tzinfo=timezone.utc),
        )

        self.assertFalse(result["supported_scope_release_ready"])
        self.assertEqual(result["public_release"]["status"], "withheld")
        self.assertEqual(result["mode_decisions"]["core_nowcast"]["status"], "shadow_only")
        self.assertEqual(result["mode_decisions"]["futurecast"]["status"], "withheld")
        self.assertEqual(result["mode_decisions"]["six_meter"]["status"], "withheld")

    def test_supported_scope_can_pass_while_future_modes_remain_withheld(self) -> None:
        result = evaluate_release_readiness(
            release_evidence(),
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
        )

        self.assertTrue(result["supported_scope_release_ready"])
        self.assertEqual(result["public_release"]["status"], "release_candidate")
        self.assertEqual(
            result["public_release"]["releaseable_modes"],
            ["core_nowcast", "stationcast_deterministic"],
        )
        self.assertEqual(result["mode_decisions"]["futurecast"]["status"], "withheld")
        self.assertEqual(result["mode_decisions"]["six_meter"]["status"], "withheld")

    def test_beta_collection_and_stationcast_release_are_separate(self) -> None:
        evidence = release_evidence()
        evidence["stationcast_beta"] = None
        result = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
        )

        self.assertEqual(result["beta_collection"]["status"], "eligible")
        self.assertEqual(
            result["mode_decisions"]["stationcast_deterministic"]["status"],
            "shadow_only",
        )
        self.assertIn(
            "stationcast_beta_passed",
            result["mode_decisions"]["stationcast_deterministic"]["blockers"],
        )
        self.assertEqual(result["public_release"]["status"], "release_candidate")
        self.assertEqual(
            result["public_release"]["releaseable_modes"],
            ["core_nowcast"],
        )

    def test_runtime_eligibility_is_mode_specific_and_fail_closed(self) -> None:
        evidence = release_evidence()
        evidence["stationcast_beta"] = None
        evaluation = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
        )

        runtime = runtime_eligibility_document(
            evaluation,
            source_readiness_sha256="a" * 64,
        )
        self.assertEqual(runtime["scope"], "phase6_runtime_eligibility")
        self.assertEqual(runtime["schema_version"], 2)
        self.assertEqual(runtime["source_readiness_sha256"], "a" * 64)
        self.assertEqual(runtime["futurecast_horizons_hours"], [])
        self.assertFalse(runtime["locked_prospective_outcomes_read"])
        self.assertTrue(runtime["modes"]["system_health_view"])
        self.assertTrue(runtime["modes"]["beta_collection"])
        self.assertTrue(runtime["modes"]["core_nowcast"])
        self.assertFalse(runtime["modes"]["stationcast_deterministic"])
        self.assertFalse(runtime["modes"]["futurecast"])
        self.assertFalse(runtime["modes"]["six_meter"])

    def test_existing_nested_migration_receipt_is_recognized(self) -> None:
        evidence = release_evidence()
        evidence["health_hardening"] = {
            "passed": True,
            "gates": {"complete": True},
            "migration": {"deployed": True},
            "privacy": {"locked_outcomes_read": False},
        }

        result = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
        )

        self.assertTrue(result["gates"]["research_health_boundaries_deployed"])

    def test_generic_pass_receipts_cannot_forge_operational_gates(self) -> None:
        evidence = release_evidence()
        evidence["recent_path_source_authorization"] = passing_document(
            scope="approved_subscriber_recent_path_source",
            subscriber_facing_authorized=True,
        )
        evidence["literal_m5_outage"] = passing_document(
            scope="controlled_full_m5_power_outage_recovery",
            gates={
                "off_m5_monitor_detected_power_loss": True,
                "publisher_recovered_after_power_restore": True,
            },
        )
        evidence["wspr_coverage_drift"] = passing_document()

        result = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
        )

        self.assertFalse(
            result["gates"]["subscriber_recent_path_source_authorized"]
        )
        self.assertFalse(result["gates"]["literal_full_m5_outage_exercised"])
        self.assertFalse(
            result["gates"]["wspr_aggregate_coverage_and_drift_passed"]
        )

    def test_coverage_window_requires_exact_schedule_provenance(self) -> None:
        evidence = release_evidence()
        coverage = evidence["wspr_coverage_drift"]
        assert coverage is not None
        coverage["window"]["provenance"]["audited_start"] = (
            "2026-06-30T23:00:00+00:00"
        )

        result = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
        )

        self.assertFalse(
            result["gates"]["wspr_aggregate_coverage_and_drift_passed"]
        )

    def test_coverage_release_requires_bounded_database_queries(self) -> None:
        evidence = release_evidence()
        coverage = evidence["wspr_coverage_drift"]
        assert coverage is not None
        coverage["gates"]["database_queries_bounded_to_24_hours"] = False
        coverage["execution"]["query_chunk_hours"] = 720
        coverage["execution"]["query_chunk_count"] = 1

        result = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=AFTER_WINDOW,
        )

        self.assertFalse(
            result["gates"]["wspr_aggregate_coverage_and_drift_passed"]
        )

    def test_current_repository_evidence_remains_withheld_and_outcomes_unread(self) -> None:
        evidence, _ = load_evidence(EVIDENCE_PATHS)
        result = evaluate_release_readiness(
            evidence,
            protocol_preregistered=True,
            as_of=datetime(2026, 7, 16, tzinfo=timezone.utc),
        )

        self.assertFalse(result["supported_scope_release_ready"])
        self.assertFalse(result["gates"]["prospective_window_closed"])
        self.assertFalse(result["gates"]["literal_full_m5_outage_exercised"])
        self.assertFalse(result["gates"]["stationcast_beta_passed"])
        self.assertFalse(
            result["gates"]["wspr_aggregate_coverage_and_drift_passed"]
        )


if __name__ == "__main__":
    unittest.main()
