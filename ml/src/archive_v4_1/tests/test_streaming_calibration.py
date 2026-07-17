from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from sklearn.isotonic import IsotonicRegression


V41 = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(V41))

from calibration import IdentityOutsideIsotonic, predict_family_arrays  # noqa: E402
from streaming_calibration import (  # noqa: E402
    BinnedStatistics,
    GroupedBinnedStatistics,
    fit_hierarchy_from_statistics,
    load_statistics,
    probability_bin_indexes,
    write_statistics,
)


class StreamingCalibrationTests(unittest.TestCase):
    def test_probability_bins_clip_both_edges(self) -> None:
        indexes = probability_bin_indexes(np.array([-1.0, 0.0, 0.5, 1.0, 2.0]))
        np.testing.assert_array_equal(indexes, [0, 0, 131072, 262143, 262143])

    def test_binned_statistics_match_direct_weighted_sums(self) -> None:
        raw = np.array([0.1, 0.1, 0.8, 0.9])
        target = np.array([0.0, 0.5, 1.0, 0.25])
        weight = np.array([2.0, 4.0, 3.0, 1.0])
        statistics = BinnedStatistics()
        statistics.update(raw, target, weight)

        support = statistics.support()
        self.assertEqual(support["rows"], 4)
        self.assertAlmostEqual(support["weighted_opportunities"], weight.sum())
        self.assertAlmostEqual(support["positive_equivalent"], np.dot(weight, target))
        self.assertAlmostEqual(
            statistics.sum_weight_probability.sum(),
            np.dot(weight, raw),
        )
        self.assertAlmostEqual(
            statistics.sum_weight_target_squared.sum(),
            np.dot(weight, np.square(target)),
        )

    def test_binned_isotonic_matches_exact_fixture(self) -> None:
        rng = np.random.default_rng(20260712)
        raw = rng.uniform(0.0001, 0.9999, 20_000)
        truth = np.clip(0.02 + 0.92 * raw + 0.03 * np.sin(raw * 8), 0, 1)
        target = rng.binomial(1, truth).astype(np.float64)
        weight = rng.uniform(0.25, 20.0, len(raw))

        exact = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1)
        exact.fit(raw, target, sample_weight=weight)
        exact_with_identity = IdentityOutsideIsotonic(exact, raw.min(), raw.max())
        statistics = BinnedStatistics()
        statistics.update(raw, target, weight)
        binned = statistics.fit_isotonic()

        exact_prediction = exact_with_identity.predict(raw)
        binned_prediction = binned.predict(raw)
        exact_brier = np.average(np.square(exact_prediction - target), weights=weight)
        binned_brier = np.average(np.square(binned_prediction - target), weights=weight)
        absolute_delta = np.abs(binned_prediction - exact_prediction)
        self.assertLessEqual(abs(binned_brier - exact_brier), 1e-6)
        self.assertLessEqual(np.average(absolute_delta, weights=weight), 5e-5)
        self.assertLessEqual(np.quantile(absolute_delta, 0.99), 1e-3)

    def test_identity_is_used_outside_fitted_support(self) -> None:
        model = IsotonicRegression(out_of_bounds="clip").fit(
            np.array([0.2, 0.8]),
            np.array([0.1, 0.9]),
        )
        calibrator = IdentityOutsideIsotonic(model, 0.2, 0.8)
        np.testing.assert_allclose(
            calibrator.predict(np.array([0.1, 0.2, 0.5, 0.8, 0.9])),
            [0.1, 0.1, 0.5, 0.9, 0.9],
        )

    def test_grouped_statistics_round_trip_and_hierarchy(self) -> None:
        raw = np.linspace(0.01, 0.99, 1_000)
        target = (raw > 0.55).astype(np.float64)
        weight = np.ones(len(raw))
        bands = np.where(np.arange(len(raw)) % 2, "20m", "40m")
        distance = np.where(np.arange(len(raw)) % 3, 1_500.0, 8_000.0)
        statistics = GroupedBinnedStatistics()
        statistics.update(raw, target, weight, bands, distance)

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "statistics.parquet"
            write_statistics(path, "2024-02", statistics)
            month, loaded = load_statistics(path)

        self.assertEqual(month, "2024-02")
        self.assertEqual(
            loaded.groups[("global", "all")].support(),
            statistics.groups[("global", "all")].support(),
        )
        models = fit_hierarchy_from_statistics(loaded)
        for family in (
            "C0_identity",
            "C1_global_isotonic",
            "C2_per_band_isotonic",
            "C3_hierarchical_isotonic",
        ):
            prediction = predict_family_arrays(models, raw, bands, distance, family)
            self.assertEqual(len(prediction), len(raw))
            self.assertTrue(np.all((prediction >= 1e-7) & (prediction <= 1 - 1e-7)))


if __name__ == "__main__":
    unittest.main()
