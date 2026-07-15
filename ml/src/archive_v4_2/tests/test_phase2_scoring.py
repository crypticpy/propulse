from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from score_phase2_scale import (  # noqa: E402
    CALIBRATION_BINS,
    calibration_result,
    contributions,
    distance_labels,
    paired_bootstrap,
    update_calibration,
)


class Phase2ScoringTests(unittest.TestCase):
    def test_contributions_preserve_weighted_brier(self) -> None:
        target = np.asarray([0.0, 1.0])
        prediction = np.asarray([0.25, 0.75])
        weight = np.asarray([1.0, 3.0])
        values = contributions(target, prediction, weight)
        self.assertAlmostEqual(float(values[0].sum()), 4.0)
        self.assertAlmostEqual(float(values[1].sum() / values[0].sum()), 0.0625)

    def test_calibration_accumulator_is_exact_for_two_bins(self) -> None:
        arrays = tuple(
            np.zeros(CALIBRATION_BINS, dtype=np.float64) for _ in range(3)
        )
        target = np.asarray([0.1, 0.9])
        prediction = np.asarray([0.1, 0.9])
        weight = np.asarray([2.0, 2.0])
        update_calibration(arrays, target, prediction, weight)
        result = calibration_result(*arrays)
        self.assertAlmostEqual(result["expected_calibration_error"], 0.0)
        self.assertEqual(len(result["bins"]), 2)

    def test_distance_labels_use_frozen_boundaries(self) -> None:
        values = distance_labels(np.asarray([0, 499.9, 500, 1499, 1500, 3000, 25000]))
        self.assertEqual(
            values.tolist(),
            [
                "0-500 km",
                "0-500 km",
                "500-1500 km",
                "500-1500 km",
                "1500-3000 km",
                "3000-6000 km",
                "out-of-range",
            ],
        )

    def test_paired_bootstrap_detects_uniform_improvement(self) -> None:
        candidate = {
            "2024-10-01": np.asarray([10.0, 0.8, 1, 1, 1, 1, 1]),
            "2024-10-02": np.asarray([20.0, 1.6, 1, 1, 1, 1, 1]),
        }
        reference = {
            "2024-10-01": {"opportunities": 10.0, "weighted_brier": 0.1},
            "2024-10-02": {"opportunities": 20.0, "weighted_brier": 0.1},
        }
        result = paired_bootstrap(candidate, reference, 7, 100)
        self.assertLess(result["upper_95"], 0)


if __name__ == "__main__":
    unittest.main()
