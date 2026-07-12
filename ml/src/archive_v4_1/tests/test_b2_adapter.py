from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from b2_adapter import apply_v3_calibrator, feature_matrix  # noqa: E402


class LinearCalibrator:
    def __init__(self, offset: float) -> None:
        self.offset = offset

    def predict(self, raw: np.ndarray) -> np.ndarray:
        return raw + self.offset


class B2AdapterTests(unittest.TestCase):
    def test_feature_order_is_exact(self) -> None:
        columns = {
            "second": np.array([2, 4]),
            "first": np.array([1, 3]),
            "unused": np.array([8, 9]),
        }
        matrix = feature_matrix(columns, ["first", "second"])
        np.testing.assert_array_equal(matrix, np.array([[1, 2], [3, 4]]))

    def test_missing_frozen_feature_is_an_error(self) -> None:
        with self.assertRaisesRegex(ValueError, "missing frozen features"):
            feature_matrix({"first": np.array([1])}, ["first", "second"])

    def test_band_calibrator_uses_global_fallback(self) -> None:
        calibrators = {
            "__global__": LinearCalibrator(0.1),
            "20m": LinearCalibrator(0.2),
        }
        result = apply_v3_calibrator(
            calibrators,
            np.array([0.2, 0.2]),
            np.array(["20m", "40m"]),
        )
        np.testing.assert_allclose(result, np.array([0.4, 0.3]))


if __name__ == "__main__":
    unittest.main()
