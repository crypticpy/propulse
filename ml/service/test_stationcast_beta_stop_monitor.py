from __future__ import annotations

import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from stationcast_beta_stop_monitor import (
    CONFIG,
    MonitoringPrivacyViolation,
    evaluate_week,
    initial_state,
    matching_committed_receipt,
    sign_monitor_receipt,
    verify_monitor_receipt,
)


def evidence(config, start, end):
    return {
        "schema_version": 1,
        "policy_version": config["policy_version"],
        "window_start": start.isoformat(),
        "window_end": end.isoformat(),
        "scope": "privacy_bounded_wspr_reception_monitoring_not_promotion_score",
        "reportability": {
            "minimum_participants": 5,
            "minimum_outcomes": 20,
        },
        "summary": {
            "reportable": True,
            "participants": 20,
            "outcomes": 250,
            "tier_a_outcomes": 200,
            "core_brier": 0.1,
            "stationcast_brier": 0.11,
            "paired_brier_delta": 0.01,
            "largest_participant_share": 0.08,
        },
        "strata": [{
            "dimension": "origin_field",
            "value": "EM",
            "participants": 8,
            "outcomes": 120,
            "core_brier": 0.1,
            "personalized_brier": 0.105,
        }],
        "calibration_bins": [{
            "model": "stationcast",
            "bin": 8,
            "outcomes": 200,
            "mean_probability": 0.85,
            "observed_rate": 0.70,
        }],
        "privacy": {
            "user_ids_returned": False,
            "exact_grid4_returned": False,
            "raw_station_inventory_returned": False,
            "participant_cap_applied": False,
        },
    }


class StationCastBetaStopMonitorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.config = json.loads(CONFIG.read_text(encoding="utf-8"))
        cls.start = datetime(2026, 8, 3, tzinfo=timezone.utc)

    def test_high_confidence_and_two_week_geographic_stops_are_one_shot(self) -> None:
        first_end = self.start + timedelta(days=7)
        first = evidence(self.config, self.start, first_end)
        counters, state, receipt = evaluate_week(
            first,
            self.config,
            initial_state(self.config["protocol_version"]),
            window_start=self.start,
            window_end=first_end,
        )
        self.assertEqual(counters, {"high_confidence_overprediction_events": 1})
        self.assertEqual(state["geographic_regression_streak"], 1)
        self.assertEqual(receipt["decision"], "stop")
        self.assertEqual(len(receipt["config_sha256"]), 64)
        self.assertEqual(len(receipt["evidence_sha256"]), 64)
        self.assertNotIn("value", json.dumps(receipt))

        second_end = first_end + timedelta(days=7)
        second = evidence(self.config, first_end, second_end)
        counters, state, _receipt = evaluate_week(
            second,
            self.config,
            state,
            window_start=first_end,
            window_end=second_end,
        )
        self.assertEqual(counters, {"geographic_regression_events": 1})
        self.assertEqual(state["geographic_regression_streak"], 2)

        counters, repeated_state, receipt = evaluate_week(
            second,
            self.config,
            state,
            window_start=first_end,
            window_end=second_end,
        )
        self.assertEqual(counters, {})
        self.assertEqual(repeated_state, state)
        self.assertEqual(receipt["decision"], "already_evaluated")

    def test_noncontiguous_or_clear_read_resets_geographic_streak(self) -> None:
        first_end = self.start + timedelta(days=7)
        first = evidence(self.config, self.start, first_end)
        _counters, state, _receipt = evaluate_week(
            first,
            self.config,
            initial_state(self.config["protocol_version"]),
            window_start=self.start,
            window_end=first_end,
        )
        gap_start = first_end + timedelta(days=7)
        gap_end = gap_start + timedelta(days=7)
        clear = evidence(self.config, gap_start, gap_end)
        clear["strata"][0]["personalized_brier"] = 0.09
        _counters, state, _receipt = evaluate_week(
            clear,
            self.config,
            state,
            window_start=gap_start,
            window_end=gap_end,
        )
        self.assertEqual(state["geographic_regression_streak"], 0)

    def test_different_regressing_cells_do_not_form_a_consecutive_stop(self) -> None:
        first_end = self.start + timedelta(days=7)
        first = evidence(self.config, self.start, first_end)
        _counters, state, _receipt = evaluate_week(
            first,
            self.config,
            initial_state(self.config["protocol_version"]),
            window_start=self.start,
            window_end=first_end,
        )
        second_end = first_end + timedelta(days=7)
        second = evidence(self.config, first_end, second_end)
        second["strata"][0]["value"] = "FN"
        counters, state, _receipt = evaluate_week(
            second,
            self.config,
            state,
            window_start=first_end,
            window_end=second_end,
        )
        self.assertNotIn("geographic_regression_events", counters)
        self.assertEqual(state["geographic_regression_streak"], 1)

    def test_privacy_boundary_rejects_extra_fields(self) -> None:
        end = self.start + timedelta(days=7)
        unsafe = evidence(self.config, self.start, end)
        unsafe["user_ids"] = ["private"]
        with self.assertRaises(MonitoringPrivacyViolation):
            evaluate_week(
                unsafe,
                self.config,
                initial_state(self.config["protocol_version"]),
                window_start=self.start,
                window_end=end,
            )

    def test_monitor_rejects_malformed_aggregate_values(self) -> None:
        end = self.start + timedelta(days=7)
        malformed = evidence(self.config, self.start, end)
        malformed["summary"]["paired_brier_delta"] = float("nan")
        with self.assertRaisesRegex(ValueError, "summary"):
            evaluate_week(
                malformed,
                self.config,
                initial_state(self.config["protocol_version"]),
                window_start=self.start,
                window_end=end,
            )

        malformed = evidence(self.config, self.start, end)
        malformed["strata"][0]["value"] = "EM10"
        with self.assertRaisesRegex(ValueError, "stratum"):
            evaluate_week(
                malformed,
                self.config,
                initial_state(self.config["protocol_version"]),
                window_start=self.start,
                window_end=end,
            )
        unreportable = evidence(self.config, self.start, end)
        unreportable["summary"] = {"reportable": False, "outcomes": 3}
        with self.assertRaises(ValueError):
            evaluate_week(
                unreportable,
                self.config,
                initial_state(self.config["protocol_version"]),
                window_start=self.start,
                window_end=end,
            )

    def test_monitor_receipt_signature_detects_tampering(self) -> None:
        end = self.start + timedelta(days=7)
        _counts, _state, receipt = evaluate_week(
            evidence(self.config, self.start, end),
            self.config,
            initial_state(self.config["protocol_version"]),
            window_start=self.start,
            window_end=end,
        )
        secret = b"m" * 32
        signed = sign_monitor_receipt(receipt, secret)
        self.assertEqual(verify_monitor_receipt(signed, secret), receipt)
        signed["signed_payload"] = signed["signed_payload"].replace(
            '"decision":"stop"',
            '"decision":"continue"',
        )
        with self.assertRaisesRegex(ValueError, "signature"):
            verify_monitor_receipt(signed, secret)

    def test_repeated_window_reuses_the_original_stop_receipt(self) -> None:
        end = self.start + timedelta(days=7)
        current_evidence = evidence(self.config, self.start, end)
        _counts, state, original = evaluate_week(
            current_evidence,
            self.config,
            initial_state(self.config["protocol_version"]),
            window_start=self.start,
            window_end=end,
        )
        self.assertEqual(original["decision"], "stop")
        _counts, _state, repeated = evaluate_week(
            current_evidence,
            self.config,
            state,
            window_start=self.start,
            window_end=end,
        )
        self.assertEqual(repeated["decision"], "already_evaluated")

        secret = b"m" * 32
        signed = sign_monitor_receipt(original, secret)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "monitor.json"
            path.write_text(json.dumps(signed), encoding="utf-8")
            reused = matching_committed_receipt(path, secret, repeated)
            self.assertEqual(
                verify_monitor_receipt(reused, secret)["decision"],
                "stop",
            )
            repeated["evidence_sha256"] = "0" * 64
            with self.assertRaisesRegex(RuntimeError, "does not match"):
                matching_committed_receipt(path, secret, repeated)


if __name__ == "__main__":
    unittest.main()
