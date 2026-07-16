from __future__ import annotations

import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from build_futurecast_examples import HF_BANDS  # noqa: E402
from build_futurecast_synthetic_fixture import PATHS  # noqa: E402


class BuildFutureCastSyntheticFixtureTests(unittest.TestCase):
    def test_fixture_meets_each_five_day_calibration_row_minimum(self) -> None:
        self.assertEqual(len(PATHS), 200)
        self.assertEqual(len(set(PATHS)), len(PATHS))
        self.assertGreaterEqual(len(PATHS) * len(HF_BANDS) * 5, 10_000)
        for tx_grid4, rx_grid4 in PATHS:
            for grid in (tx_grid4, rx_grid4):
                self.assertRegex(grid, r"^[A-R]{2}[0-9]{2}$")


if __name__ == "__main__":
    unittest.main()
