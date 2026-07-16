from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from validate_phase6_release_readiness import (  # noqa: E402
    EVIDENCE_PATHS,
    evaluate_release_readiness,
    load_evidence,
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
        "recent_path_source_authorization": passing_document(
            scope="approved_subscriber_recent_path_source",
            subscriber_facing_authorized=True,
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
            scope="controlled_full_m5_power_outage_recovery",
            gates={
                "off_m5_monitor_detected_power_loss": True,
                "publisher_recovered_after_power_restore": True,
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
        "six_meter": {
            "decision": "withheld",
            "release_approved": False,
            "product_serving_allowed": False,
        },
    }


class Phase6ReleaseReadinessTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
