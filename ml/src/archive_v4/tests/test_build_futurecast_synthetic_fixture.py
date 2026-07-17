from __future__ import annotations

import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from build_futurecast_examples import HF_BANDS  # noqa: E402
from build_futurecast_synthetic_fixture import (  # noqa: E402
    PATHS,
    synthetic_path_effect,
)


class BuildFutureCastSyntheticFixtureTests(unittest.TestCase):
    def test_fixture_meets_each_five_day_calibration_row_minimum(self) -> None:
        self.assertEqual(len(PATHS), 200)
        self.assertEqual(len(set(PATHS)), len(PATHS))
        self.assertGreaterEqual(len(PATHS) * len(HF_BANDS) * 5, 10_000)
        for tx_grid4, rx_grid4 in PATHS:
            for grid in (tx_grid4, rx_grid4):
                self.assertRegex(grid, r"^[A-R]{2}[0-9]{2}$")

    def test_path_effect_is_bounded_and_centered_after_fixture_expansion(self) -> None:
        effects = [synthetic_path_effect(index) for index in range(len(PATHS))]
        self.assertLessEqual(max(effects), 0.65)
        self.assertGreaterEqual(min(effects), -0.65)
        self.assertAlmostEqual(sum(effects) / len(effects), 0.0, places=12)


if __name__ == "__main__":
    unittest.main()
