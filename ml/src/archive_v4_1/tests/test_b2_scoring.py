from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from score_b2_engineering import day_bootstrap, paired_result  # noqa: E402


class B2ScoringTests(unittest.TestCase):
    def test_paired_result_uses_common_opportunity_weight(self) -> None:
        result = paired_result(np.array([10.0, 2.0, 1.0, 5.0]))
        self.assertAlmostEqual(result["b2_brier"], 0.2)
        self.assertAlmostEqual(result["m2_brier"], 0.1)
        self.assertAlmostEqual(result["m2_relative_brier_improvement"], 0.5)

    def test_day_bootstrap_is_deterministic(self) -> None:
        daily = [
            {
                "opportunities": 10.0,
                "b2_brier": 0.2,
                "m2_brier": 0.1,
            },
            {
                "opportunities": 20.0,
                "b2_brier": 0.3,
                "m2_brier": 0.2,
            },
        ]
        first = day_bootstrap(daily, 12, 100)
        second = day_bootstrap(daily, 12, 100)
        self.assertEqual(first, second)
        self.assertLess(first["upper_95"], 0)


if __name__ == "__main__":
    unittest.main()
