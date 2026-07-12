from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from gate_scoring import PRIMARY, SIMPLER_CALIBRATORS, decide_gates  # noqa: E402
from protocol import DEFAULT_CONFIG, load_json  # noqa: E402


def metric(brier: float, ece: float = 0.001) -> dict:
    distance = {
        "0-500km": {"weighted_brier": brier},
        "500-1500km": {"weighted_brier": brier},
        "1500-3000km": {"weighted_brier": brier},
        "under-3000km": {"weighted_brier": brier},
    }
    return {
        "weighted_brier": brier,
        "expected_calibration_error": ece,
        "calibration_bins": [
            {
                "lower": 0.5,
                "mean_prediction": 0.60,
                "observed_rate": 0.59,
            }
        ],
        "slices": {
            "audit_distance": distance,
            "band": {"20m": {"weighted_brier": brier}},
        },
    }


class GateScoringTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = load_json(DEFAULT_CONFIG)
        self.metrics = {
            "B0_climatology": metric(0.080),
            "M1_physics": metric(0.050),
            "B2_frozen_v3": metric(0.060),
            "M2_raw": metric(0.045, 0.004),
            "C0_identity": metric(0.045, 0.004),
            "C1_global_isotonic": metric(0.044),
            "C2_per_band_isotonic": metric(0.043),
            "C3_hierarchical_isotonic": metric(0.042),
            PRIMARY: metric(0.040),
        }
        errors = {
            "B0_climatology": 8.0,
            "M1_physics": 5.0,
            "B2_frozen_v3": 6.0,
            "M2_raw": 4.5,
            "C0_identity": 4.5,
            "C1_global_isotonic": 4.4,
            "C2_per_band_isotonic": 4.3,
            "C3_hierarchical_isotonic": 4.2,
            PRIMARY: 4.0,
        }
        self.daily = [
            {
                "day": f"2024-11-{day:02d}",
                "candidate": candidate,
                "weighted_opportunities": 100.0,
                "weighted_squared_error": value,
            }
            for day in range(1, 21)
            for candidate, value in errors.items()
        ]

    def test_all_frozen_gate_rules_can_pass(self) -> None:
        decision = decide_gates(
            self.metrics,
            self.daily,
            self.config,
            integrity_passed=True,
            fallback_passed=True,
            serving_parity_passed=True,
        )
        self.assertTrue(decision["passed"])
        self.assertEqual(len(decision["gates"]), 10)
        self.assertGreater(decision["bootstrap"]["m2_vs_b0"]["skill_lower_95"], 0)

    def test_exact_short_path_non_regression_is_enforced(self) -> None:
        values = copy.deepcopy(self.metrics)
        values[PRIMARY]["slices"]["audit_distance"]["500-1500km"]["weighted_brier"] = 0.045000001
        decision = decide_gates(
            values,
            self.daily,
            self.config,
            integrity_passed=True,
            fallback_passed=True,
            serving_parity_passed=True,
        )
        gate = next(row for row in decision["gates"] if row["id"] == "G6_short_path_calibration")
        self.assertFalse(gate["passed"])
        self.assertIn("G6_short_path_calibration", decision["failed_gates"])

    def test_every_simpler_calibrator_is_required(self) -> None:
        values = copy.deepcopy(self.metrics)
        del values[SIMPLER_CALIBRATORS[-1]]
        with self.assertRaisesRegex(ValueError, "missing candidates"):
            decide_gates(
                values,
                self.daily,
                self.config,
                integrity_passed=True,
                fallback_passed=True,
                serving_parity_passed=True,
            )


if __name__ == "__main__":
    unittest.main()
