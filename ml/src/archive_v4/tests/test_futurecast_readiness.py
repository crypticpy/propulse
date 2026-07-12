from __future__ import annotations

import sys
import unittest
from pathlib import Path


MODULE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MODULE))

from assess_futurecast_readiness import assess  # noqa: E402


class FutureCastReadinessTests(unittest.TestCase):
    def test_withholds_horizons_without_issued_history(self) -> None:
        result = assess(
            [
                {"source": "noaa_45_day", "captured_at": "2026-07-12T00:00:00+00:00"},
                {"source": "noaa_3_day", "captured_at": "2026-07-12T00:00:00+00:00"},
            ],
            minimum_days=90,
        )
        self.assertFalse(result["issued_forecast_training_ready"])
        self.assertTrue(all(
            row["status"] == "withheld_insufficient_issued_history"
            for row in result["horizons"].values()
        ))

    def test_marks_development_ready_only_after_both_sources_cover_window(self) -> None:
        captures = [
            {"source": source, "captured_at": f"2026-07-{day:02d}T00:00:00+00:00"}
            for source in ("noaa_45_day", "noaa_3_day")
            for day in range(1, 4)
        ]
        result = assess(captures, minimum_days=3)
        self.assertTrue(result["issued_forecast_training_ready"])
        self.assertFalse(result["release_approved"])


if __name__ == "__main__":
    unittest.main()
