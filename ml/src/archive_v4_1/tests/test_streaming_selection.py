from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


V41 = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(V41))

from select_calibration_streaming import (  # noqa: E402
    OofAccumulator,
    PRIMARY_CANDIDATE,
    bootstrap_upper,
    compose_c4_daily,
    selection_evidence,
)


CONFIG = {
    "seed": 20260712,
    "calibration": {
        "bootstrap_repetitions": 2000,
        "bootstrap_upper_bound": 0.0,
        "minimum_rows": 10000,
        "minimum_positive_equivalent": 1000.0,
        "minimum_negative_equivalent": 1000.0,
        "minimum_months": 3,
    },
}


class StreamingSelectionTests(unittest.TestCase):
    def test_bootstrap_is_deterministic(self) -> None:
        weight = np.array([10.0, 20.0, 30.0, 40.0])
        delta = np.array([-1.0, -2.0, -3.0, -4.0])
        first = bootstrap_upper(weight, delta, seed=7, repetitions=200)
        second = bootstrap_upper(weight, delta, seed=7, repetitions=200)
        self.assertEqual(first, second)
        self.assertLess(first, 0)

    def test_selection_requires_every_month_to_improve_raw(self) -> None:
        accumulator = OofAccumulator()
        for index, month in enumerate(("2024-02", "2024-04", "2024-05", "2024-08")):
            key = ("overall", "all", month, f"{month}-01")
            accumulator.support[key] = np.array([3000, 3000, 600, 2400], dtype=float)
            accumulator.loss[(*key, "C0_identity")] = 300.0
            accumulator.loss[(*key, "C1_global_isotonic")] = (
                290.0 if index < 3 else 301.0
            )

        evidence = selection_evidence(
            accumulator,
            "overall",
            "all",
            "C1_global_isotonic",
            "C0_identity",
            CONFIG,
        )

        self.assertTrue(evidence["supported"])
        self.assertFalse(evidence["selected"])
        self.assertLess(evidence["candidate_brier"], evidence["fallback_brier"])
        self.assertLess(evidence["monthly_calibration_gain"]["2024-08"], 0)

    def test_c4_daily_composes_disjoint_leaf_choices(self) -> None:
        accumulator = OofAccumulator()
        month = "2024-02"
        day = "2024-02-01"
        leaves = {
            "20m|0-1000km": (np.array([5, 10, 2, 8], dtype=float), 1.0, 0.8),
            "20m|1000-3000km": (np.array([7, 20, 4, 16], dtype=float), 2.0, 1.7),
        }
        total = np.zeros(4)
        for leaf, (support, raw_loss, calibrated_loss) in leaves.items():
            key = ("leaf", leaf, month, day)
            accumulator.support[key] = support
            accumulator.loss[(*key, "C0_identity")] = raw_loss
            accumulator.loss[(*key, "C3_hierarchical_isotonic")] = calibrated_loss
            total += support
        band_key = ("band", "20m", month, day)
        overall_key = ("overall", "all", month, day)
        accumulator.support[band_key] = total.copy()
        accumulator.support[overall_key] = total.copy()

        compose_c4_daily(
            accumulator,
            {
                "20m|0-1000km": "C3_hierarchical_isotonic",
                "20m|1000-3000km": "C0_identity",
            },
        )

        self.assertAlmostEqual(
            accumulator.loss[(*overall_key, PRIMARY_CANDIDATE)],
            2.8,
        )
        self.assertAlmostEqual(
            accumulator.loss[(*band_key, PRIMARY_CANDIDATE)],
            2.8,
        )


if __name__ == "__main__":
    unittest.main()
