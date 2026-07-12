from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from calibration import (  # noqa: E402
    CalibrationData,
    IdentityCalibrator,
    distance_groups,
    select_guarded_hierarchy,
)


def month_data(month: str, offset: float = 0.0) -> CalibrationData:
    raw = np.tile(np.array([0.1, 0.2, 0.7, 0.8]), 20)
    target = np.tile(np.array([0.0, 0.0, 1.0, 1.0]), 20)
    return CalibrationData(
        month=month,
        raw=np.clip(raw + offset, 0.01, 0.99),
        target=target,
        weight=np.ones(len(raw)),
        band=np.tile(np.array(["20m", "40m", "20m", "40m"]), 20),
        distance=np.tile(np.array([200.0, 1200.0, 3500.0, 11000.0]), 20),
        day=np.repeat([f"{month}-01", f"{month}-02"], len(raw) // 2),
    )


class CalibrationTests(unittest.TestCase):
    def test_identity_clips_and_preserves_order(self) -> None:
        result = IdentityCalibrator().predict(np.array([-1.0, 0.2, 2.0]))
        self.assertGreater(result[0], 0)
        self.assertAlmostEqual(result[1], 0.2)
        self.assertLess(result[2], 1)

    def test_distance_groups_match_frozen_serving_contract(self) -> None:
        result = distance_groups(np.array([0, 999, 1000, 2999, 3000, 9999, 10000]))
        self.assertEqual(
            result.tolist(),
            [
                "0-1000km",
                "0-1000km",
                "1000-3000km",
                "1000-3000km",
                "3000-6000km",
                "6000-10000km",
                "10000km+",
            ],
        )

    def test_guarded_selection_is_deterministic_and_joblib_stable(self) -> None:
        monthly = [
            month_data("2024-02", 0.00),
            month_data("2024-04", 0.01),
            month_data("2024-05", -0.01),
            month_data("2024-08", 0.00),
        ]
        bundle, evidence = select_guarded_hierarchy(
            monthly,
            seed=20260712,
            repetitions=50,
            minimum_rows=10,
            minimum_positive_equivalent=2,
            minimum_negative_equivalent=2,
            minimum_months=3,
        )
        self.assertEqual(
            evidence["primary_candidate"],
            "C4_guarded_hierarchical_isotonic",
        )
        prediction = bundle.predict(
            monthly[0].raw,
            monthly[0].band,
            monthly[0].distance,
        )
        self.assertTrue(np.all((prediction > 0) & (prediction < 1)))
        _, second = select_guarded_hierarchy(
            monthly,
            seed=20260712,
            repetitions=50,
            minimum_rows=10,
            minimum_positive_equivalent=2,
            minimum_negative_equivalent=2,
            minimum_months=3,
        )
        self.assertEqual(evidence["selected"], second["selected"])


if __name__ == "__main__":
    unittest.main()
