from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from score_phase1_conditional import day_numbers, weighted_brier  # noqa: E402


class Phase1ConditionalTests(unittest.TestCase):
    def test_weighted_brier_uses_opportunity_mass(self) -> None:
        target = np.asarray([0.0, 1.0])
        prediction = np.asarray([0.0, 0.0])
        weight = np.asarray([9.0, 1.0])
        self.assertAlmostEqual(weighted_brier(target, prediction, weight), 0.1)

    def test_day_numbers_are_one_based(self) -> None:
        timestamps = np.asarray(
            ["2024-08-01T00:00:00", "2024-08-31T23:00:00"],
            dtype="datetime64[us]",
        )
        self.assertEqual(day_numbers(timestamps).tolist(), [1, 31])


if __name__ == "__main__":
    unittest.main()
