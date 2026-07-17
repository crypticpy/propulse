from __future__ import annotations

import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
MODULE = ROOT / "ml/src/archive_v4_2"
sys.path.insert(0, str(MODULE))

from pin_prediction_threads import PinError, validate_decision  # noqa: E402


class PinPredictionThreadsTests(unittest.TestCase):
    def benchmark(self) -> dict:
        return {
            "december_2024_read": False,
            "locked_2025_read": False,
            "all_predictions_bit_identical": True,
            "selected_threads": 12,
            "results": [
                {"threads": threads, "median_seconds": seconds}
                for threads, seconds in (
                    (1, 5.0),
                    (6, 2.5),
                    (9, 2.0),
                    (12, 1.5),
                    (18, 1.7),
                )
            ],
        }

    def test_accepts_complete_exact_fastest_decision(self) -> None:
        self.assertEqual(validate_decision(self.benchmark()), 12)

    def test_rejects_non_fastest_or_incomplete_decision(self) -> None:
        benchmark = self.benchmark()
        benchmark["selected_threads"] = 18
        with self.assertRaisesRegex(PinError, "fastest"):
            validate_decision(benchmark)
        benchmark = self.benchmark()
        benchmark["results"].pop()
        with self.assertRaisesRegex(PinError, "inventory"):
            validate_decision(benchmark)


if __name__ == "__main__":
    unittest.main()
