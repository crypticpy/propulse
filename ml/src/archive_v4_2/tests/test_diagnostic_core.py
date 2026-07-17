from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from diagnostic_core import (  # noqa: E402
    bootstrap_blend_delta,
    grouped_stats,
    optimal_b2_weight,
    pair_stats,
    paired_result,
    rounded_weight,
    row_contributions,
    select_band_router,
    select_stable_router,
)


class DiagnosticCoreTests(unittest.TestCase):
    def test_optimal_weight_matches_direct_blend(self) -> None:
        target = np.asarray([0.0, 1.0, 0.25])
        weight = np.asarray([1.0, 2.0, 3.0])
        b2 = np.asarray([0.1, 0.7, 0.2])
        m2 = np.asarray([0.4, 0.9, 0.4])
        stats = pair_stats(target, weight, b2, m2)
        selected = optimal_b2_weight(stats)
        prediction = selected * b2 + (1.0 - selected) * m2
        direct = np.dot(weight, np.square(prediction - target)) / weight.sum()
        self.assertAlmostEqual(paired_result(stats, selected)["blend_brier"], direct)

    def test_rounded_weight_is_bounded_and_deterministic(self) -> None:
        self.assertEqual(rounded_weight(0.526, 0.05), 0.55)
        self.assertEqual(rounded_weight(1.2, 0.05), 1.0)
        self.assertEqual(rounded_weight(-0.2, 0.05), 0.0)

    def test_grouped_stats_match_masked_pair_stats(self) -> None:
        target = np.asarray([0.0, 1.0, 0.25, 0.5])
        weight = np.asarray([1.0, 2.0, 3.0, 4.0])
        b2 = np.asarray([0.1, 0.7, 0.2, 0.6])
        m2 = np.asarray([0.4, 0.9, 0.4, 0.3])
        labels = np.asarray(["a", "b", "a", "b"])
        actual = grouped_stats(labels, row_contributions(target, weight, b2, m2))
        for label in ("a", "b"):
            expected = pair_stats(target, weight, b2, m2, labels == label)
            np.testing.assert_allclose(actual[label], expected)

    def test_band_router_selects_lower_development_brier(self) -> None:
        better_b2 = np.asarray([10.0, 1.0, 2.0, 0.0, 4.0, 2.0])
        better_m2 = np.asarray([10.0, 2.0, 1.0, 0.0, 4.0, 2.0])
        self.assertEqual(
            select_band_router({"40m": better_b2, "60m": better_m2}),
            {"40m": "b2", "60m": "m2"},
        )

    def test_stable_router_requires_every_month_and_support(self) -> None:
        m2_wins = np.asarray([2_000_000.0, 200.0, 100.0, 0.0, 4.0, 2_000.0])
        m2_loses = np.asarray([2_000_000.0, 100.0, 200.0, 0.0, 4.0, 2_000.0])
        values = {
            (month, "60m|500-1500 km"): m2_wins.copy()
            for month in ("2024-02", "2024-04", "2024-05", "2024-08")
        }
        values[("2024-08", "40m|500-1500 km")] = m2_loses
        result = select_stable_router(
            values,
            ("2024-02", "2024-04", "2024-05", "2024-08"),
            1_000_000,
            1_000,
        )
        self.assertEqual(result["60m|500-1500 km"], "m2")
        self.assertEqual(result["40m|500-1500 km"], "b2")

    def test_blend_bootstrap_is_deterministic(self) -> None:
        daily = [
            np.asarray([10.0, 2.0, 1.0, 1.2, 5.0, 1.0]),
            np.asarray([20.0, 4.0, 2.0, 2.2, 7.0, 2.0]),
        ]
        first = bootstrap_blend_delta(daily, 0.0, 12, 100)
        self.assertEqual(first, bootstrap_blend_delta(daily, 0.0, 12, 100))
        self.assertLess(first["upper_95"], 0)


if __name__ == "__main__":
    unittest.main()
