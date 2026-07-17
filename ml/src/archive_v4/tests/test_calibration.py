from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import joblib
from sklearn.isotonic import IsotonicRegression


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from train_validation import CalibratorBundle  # noqa: E402


class ConstantCalibrator:
    def __init__(self, value: float) -> None:
        self.value = value

    def predict(self, raw: np.ndarray) -> np.ndarray:
        return np.full(len(raw), self.value)


class CalibrationFallbackTests(unittest.TestCase):
    def test_band_distance_falls_back_to_band_then_global(self) -> None:
        bundle = CalibratorBundle(
            ConstantCalibrator(0.1),  # type: ignore[arg-type]
            {"20m": ConstantCalibrator(0.2)},  # type: ignore[dict-item]
            {("20m", "0-1000km"): ConstantCalibrator(0.3)},  # type: ignore[dict-item]
        )

        prediction = bundle.predict(
            np.array([0.5, 0.5, 0.5]),
            np.array(["20m", "20m", "40m"]),
            np.array([500.0, 5000.0, 500.0]),
        )

        np.testing.assert_allclose(prediction, [0.3, 0.2, 0.1])
        self.assertEqual(bundle.method, "band_distance_isotonic_with_fallback")

    def test_bundle_round_trips_from_stable_module(self) -> None:
        isotonic = IsotonicRegression(out_of_bounds="clip").fit([0, 1], [0, 1])
        bundle = CalibratorBundle(isotonic)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "calibrator.joblib"
            joblib.dump(bundle, path)
            loaded = joblib.load(path)

        self.assertEqual(type(loaded).__module__, "calibration")
        np.testing.assert_allclose(loaded.predict(np.array([0.25]), np.array(["20m"])), [0.25])


if __name__ == "__main__":
    unittest.main()
