from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from score_phase1_ablations import blend_diagnostic  # noqa: E402


class Phase1ScoringTests(unittest.TestCase):
    def test_identical_residuals_have_no_blend_gain(self) -> None:
        result = blend_diagnostic(np.asarray([100.0, 10.0, 10.0, 10.0]))
        self.assertAlmostEqual(result["optimal_left_weight"], 0.5)
        self.assertAlmostEqual(result["optimal_blend_brier"], 0.1)
        self.assertAlmostEqual(result["improvement_vs_better_component"], 0.0)

    def test_complementary_residuals_have_interior_optimum(self) -> None:
        result = blend_diagnostic(np.asarray([100.0, 10.0, 20.0, 0.0]))
        self.assertAlmostEqual(result["optimal_left_weight"], 2 / 3)
        self.assertAlmostEqual(result["optimal_blend_brier"], 1 / 15)
        self.assertGreater(result["improvement_vs_better_component"], 0)


if __name__ == "__main__":
    unittest.main()
