from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import numpy as np


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from score_futurecast_gate import (  # noqa: E402
    PRODUCTION_RELEASE_OUTPUT,
    bootstrap_upper,
    release_gates,
    validate_release_output_boundary,
)


CONFIG = json.loads(
    (Path(__file__).resolve().parents[3] / "config/futurecast_v1.json").read_text(
        encoding="utf-8"
    )
)


def metrics(brier: float, ece: float = 0.01) -> dict[str, float]:
    return {
        "weighted_brier": brier,
        "weighted_log_loss": 0.2,
        "expected_calibration_error": ece,
        "weighted_opportunities": 2_000_000.0,
    }


class ScoreFutureCastGateTests(unittest.TestCase):
    def test_release_output_boundary_separates_production_and_synthetic(self) -> None:
        validate_release_output_boundary(
            "production_issued_history", PRODUCTION_RELEASE_OUTPUT
        )
        with self.assertRaisesRegex(RuntimeError, "canonical"):
            validate_release_output_boundary(
                "production_issued_history", Path("/tmp/futurecast.json")
            )
        validate_release_output_boundary(
            "synthetic_fixture", Path("/tmp/futurecast-synthetic.json")
        )
        with self.assertRaisesRegex(RuntimeError, "outside the repository"):
            validate_release_output_boundary(
                "synthetic_fixture", PRODUCTION_RELEASE_OUTPUT
            )

    def test_paired_issue_day_bootstrap_is_deterministic(self) -> None:
        deltas = [-0.01] * 14 + [-0.005]
        weights = [1.0] * len(deltas)
        first = bootstrap_upper(
            deltas,
            weights,
            replicates=2000,
            confidence=0.95,
            seed=20260719,
        )
        second = bootstrap_upper(
            deltas,
            weights,
            replicates=2000,
            confidence=0.95,
            seed=20260719,
        )
        self.assertEqual(first, second)
        self.assertLess(first, 0)

    def test_paired_bootstrap_recomputes_opportunity_weighted_delta(self) -> None:
        errors = np.array([-10.0, 0.9, 0.9])
        weights = np.array([1000.0, 1.0, 1.0])
        seed = 42
        replicates = 500
        confidence = 0.95
        generator = np.random.default_rng(seed)
        indexes = generator.integers(0, 3, size=(replicates, 3))
        expected = np.quantile(
            errors[indexes].sum(axis=1) / weights[indexes].sum(axis=1),
            confidence,
        )
        actual = bootstrap_upper(
            errors,
            weights,
            replicates=replicates,
            confidence=confidence,
            seed=seed,
        )
        self.assertAlmostEqual(actual, float(expected))

    def test_all_preregistered_horizon_gates_can_pass(self) -> None:
        baselines = {
            "persistence": metrics(0.051),
            "climatology": metrics(0.052),
            "weather_only": metrics(0.050),
        }
        gates = release_gates(
            direct=metrics(0.049, ece=0.012),
            baselines=baselines,
            best_baseline="weather_only",
            paired_day_upper_95=-0.0001,
            issue_days=15,
            maximum_band_regression=0.02,
            config=CONFIG,
            p533_equivalent_forecast_inputs=True,
            source_integrity_passed=True,
            production_evidence=True,
            peak_rss=20.0,
        )
        self.assertTrue(all(gates.values()))

    def test_any_missing_scientific_or_operational_gate_withholds(self) -> None:
        baselines = {
            name: metrics(0.05)
            for name in ("persistence", "climatology", "weather_only")
        }
        gates = release_gates(
            direct=metrics(0.0501, ece=0.04),
            baselines=baselines,
            best_baseline="weather_only",
            paired_day_upper_95=0.0002,
            issue_days=14,
            maximum_band_regression=0.06,
            config=CONFIG,
            p533_equivalent_forecast_inputs=False,
            source_integrity_passed=False,
            production_evidence=False,
            peak_rss=100.0,
        )
        self.assertFalse(gates["minimum_gate_issue_days"])
        self.assertFalse(gates["relative_brier_improvement"])
        self.assertFalse(gates["paired_issue_day_upper_95_below_zero"])
        self.assertFalse(gates["calibration"])
        self.assertFalse(gates["supported_band_safety"])
        self.assertFalse(gates["p533_forecast_input_diagnostic"])
        self.assertFalse(gates["source_and_training_integrity"])
        self.assertFalse(gates["production_issued_evidence"])
        self.assertFalse(gates["m5_rss_within_limit"])

    def test_no_supported_band_withholds_without_nonfinite_value(self) -> None:
        baselines = {
            name: metrics(0.05)
            for name in ("persistence", "climatology", "weather_only")
        }
        gates = release_gates(
            direct=metrics(0.049),
            baselines=baselines,
            best_baseline="weather_only",
            paired_day_upper_95=-0.001,
            issue_days=15,
            maximum_band_regression=None,
            config=CONFIG,
            p533_equivalent_forecast_inputs=True,
            source_integrity_passed=True,
            production_evidence=True,
            peak_rss=1.0,
        )
        self.assertFalse(gates["supported_band_safety"])


if __name__ == "__main__":
    unittest.main()
