from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


V4 = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(V4))
from detailed_validation import add_score, bootstrap_daily, score_row  # noqa: E402


class DetailedValidationTests(unittest.TestCase):
    def test_weighted_scores_preserve_paired_model_deltas(self):
        totals = {"all": np.zeros(6)}
        target = np.array([0.0, 1.0])
        weight = np.array([1.0, 3.0])
        m1 = np.array([0.2, 0.7])
        m2 = np.array([0.1, 0.9])
        b0 = np.array([0.5, 0.5])
        raw = np.array([0.3, 0.8])
        add_score(
            totals,
            "all",
            target,
            weight,
            m1,
            m2,
            b0,
            raw,
            np.ones(2, dtype=bool),
        )
        row = score_row("all", totals["all"])
        self.assertAlmostEqual(row["m2_brier"], 0.01)
        self.assertAlmostEqual(row["b0_brier"], 0.25)
        self.assertGreater(row["m2_skill_vs_b0"], 0)
        self.assertLess(row["m2_delta_vs_m1"], 0)

    def test_day_bootstrap_is_deterministic_and_ordered(self):
        daily = [
            {
                "opportunities": 100 + day,
                "m1_brier": 0.08,
                "m2_brier": 0.05,
                "b0_brier": 0.10,
            }
            for day in range(12)
        ]
        first = bootstrap_daily(daily, seed=42, repetitions=200)
        second = bootstrap_daily(daily, seed=42, repetitions=200)
        self.assertEqual(first, second)
        for interval in first.values():
            self.assertLessEqual(interval["lower_95"], interval["median"])
            self.assertLessEqual(interval["median"], interval["upper_95"])


if __name__ == "__main__":
    unittest.main()
