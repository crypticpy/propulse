from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pyarrow as pa


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from score_phase2_scale import (  # noqa: E402
    CALIBRATION_BINS,
    cached_feature_matrix,
    calibration_result,
    contributions,
    date_labels,
    distance_labels,
    evaluation_reference_days,
    evaluation_reference_months,
    evaluation_reference_overall,
    fit_calibrators,
    paired_bootstrap,
    selected_prediction_threads,
    text_labels,
    update_calibration,
)
from benchmark_prediction_threads import select_fastest_exact  # noqa: E402


class Phase2ScoringTests(unittest.TestCase):
    def test_phase2_scorer_uses_matching_v4_calibrator_bundle(self) -> None:
        raw = np.linspace(0.01, 0.99, 100, dtype=np.float64)
        target = np.linspace(0.0, 1.0, 100, dtype=np.float64)
        weight = np.ones(100, dtype=np.float64)
        bands = np.full(100, "20m")
        distance = np.linspace(0, 12_000, 100, dtype=np.float64)

        bundles = fit_calibrators(raw, target, weight, bands, distance)

        self.assertEqual(
            [bundle.method for bundle in bundles],
            ["global_isotonic", "global_isotonic", "global_isotonic"],
        )

    def test_prediction_thread_decision_must_match_frozen_config(self) -> None:
        config = {
            "compute": {
                "apple_silicon": {"single_process_prediction_threads": 12}
            }
        }
        benchmark = {
            "december_2024_read": False,
            "locked_2025_read": False,
            "all_predictions_bit_identical": True,
            "selected_threads": 12,
            "results": [{"threads": 12}],
        }
        config["compute"]["apple_silicon"][
            "prediction_thread_benchmark_sha256"
        ] = "digest"
        self.assertEqual(
            selected_prediction_threads(config, benchmark, "digest"), 12
        )
        benchmark["selected_threads"] = 18
        with self.assertRaisesRegex(Exception, "frozen config"):
            selected_prediction_threads(config, benchmark, "digest")

    def test_prediction_thread_selection_requires_exact_fastest_result(self) -> None:
        results = [
            {
                "threads": 12,
                "median_seconds": 2.0,
                "prediction_sha256": "same",
                "maximum_absolute_delta": 0.0,
            },
            {
                "threads": 18,
                "median_seconds": 1.5,
                "prediction_sha256": "same",
                "maximum_absolute_delta": 0.0,
            },
        ]
        self.assertEqual(select_fastest_exact(results), 18)

    def test_arrow_labels_match_frozen_text_and_utc_day_values(self) -> None:
        batch = pa.record_batch(
            [
                pa.array(["20m", "10m"]),
                pa.array(
                    [
                        datetime(2024, 10, 1, 0, 0, tzinfo=timezone.utc),
                        datetime(2024, 10, 31, 23, 59, tzinfo=timezone.utc),
                    ],
                    type=pa.timestamp("us", tz="UTC"),
                ),
            ],
            names=["band", "target_hour"],
        )
        self.assertEqual(text_labels(batch, "band").tolist(), ["20m", "10m"])
        self.assertEqual(
            date_labels(batch, "target_hour").tolist(),
            ["2024-10-01", "2024-10-31"],
        )

    def test_feature_matrix_cache_reuses_equal_feature_orders(self) -> None:
        columns = {
            "a": np.asarray([1, 2], dtype=np.float32),
            "b": np.asarray([3, 4], dtype=np.float32),
        }
        cache: dict[tuple[str, ...], np.ndarray] = {}
        first = cached_feature_matrix(cache, columns, ["a", "b"])
        second = cached_feature_matrix(cache, columns, ["a", "b"])
        self.assertIs(first, second)
        np.testing.assert_array_equal(first, np.asarray([[1, 3], [2, 4]]))

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

    def test_scale_reference_helpers_read_standard_metric_shape(self) -> None:
        evaluation = {
            "metrics": {
                "A4_recent_cycle:calibrated": {
                    "overall": {"weighted_brier": 0.04},
                    "slices": {
                        "month": [
                            {"key": "2024-10", "weighted_brier": 0.039}
                        ],
                        "day": [
                            {
                                "key": "2024-10-01",
                                "opportunities": 10.0,
                                "weighted_brier": 0.038,
                            }
                        ],
                    },
                }
            }
        }
        self.assertEqual(
            evaluation_reference_overall(evaluation, "A4_recent_cycle"), 0.04
        )
        self.assertEqual(
            evaluation_reference_months(evaluation, "A4_recent_cycle"),
            {"2024-10": 0.039},
        )
        self.assertEqual(
            evaluation_reference_days(evaluation, "A4_recent_cycle"),
            {
                "2024-10-01": {
                    "opportunities": 10.0,
                    "weighted_brier": 0.038,
                }
            },
        )


if __name__ == "__main__":
    unittest.main()
